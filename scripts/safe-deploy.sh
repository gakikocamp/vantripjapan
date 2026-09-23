#!/usr/bin/env bash
# ============================================================
# VTJ 安全デプロイ — Cloudflare Pages への唯一の公式デプロイ経路
#
#   scripts/safe-deploy.sh
#
# ゲート（すべて通らないとデプロイされない）:
#   1. main ブランチ上で、作業ツリーがクリーン（コミット済み = 旧バージョンへ必ず戻せる）
#      main 以外から出すと Pages では Preview になり、本番は更新されない
#   2. セキュリティ監査 PASS（scripts/security-audit.sh --all）
#   3. i18n/品質スモークQA PASS（scripts/qa-i18n-smoke.js）
#   4. いまの本番コミットを HEAD が含む（巻き戻し防止）
#      → wrangler pages deploy --branch main
#      → 今回のデプロイが Environment=Production かを wrangler 出力と deployment list で確認
#   5. 本番URLの実機検証（HTTP 200 + 言語コンテンツマーカー + 今回変わったファイルの中身が手元と一致）
#
# チェック関数は scripts/lib/pages-deploy-checks.sh（読み取りだけなので単体で試せる）
# ⚠️ `npx wrangler pages deploy` を直接叩かないこと（CLAUDE.md 参照）
# ============================================================
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
# shellcheck source=lib/pages-deploy-checks.sh
. scripts/lib/pages-deploy-checks.sh

PROJECT="vantripjapan"
PROD_BRANCH="main"
SITE_URL="https://vantripjapan.jp"

echo "═══ 1/5 ブランチ・作業ツリー確認（旧バージョン保存の強制） ═══"
dc_require_branch "$PROD_BRANCH" || exit 1
DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then
  echo "🚫 未コミットの変更があります。先にコミットしてロールバック地点を作ってください:"
  echo "$DIRTY" | sed 's/^/   /'
  exit 1
fi
UNTRACKED_SITE=$(git status --porcelain | grep '^?? site/' || true)
if [ -n "$UNTRACKED_SITE" ]; then
  echo "🚫 site/ 配下に未追跡ファイルがあります（そのままデプロイに含まれてしまいます）。"
  echo "   コミットするか退避してください:"
  echo "$UNTRACKED_SITE" | sed 's/^/   /'
  exit 1
fi
echo "✅ クリーン（HEAD: $(git log --oneline -1)）"

echo ""
echo "═══ 2/5 セキュリティ監査 ═══"
bash scripts/security-audit.sh --all

echo ""
echo "═══ 3/5 i18n/品質スモークQA ═══"
node scripts/qa-i18n-smoke.js

echo ""
echo "═══ 4/5 Cloudflare Pages デプロイ ═══"
# wrangler 4.112 以降は Node 22+ を要求する。ビルド・QAは Node 20 でも通るので、
# ここだけ必要なら nvm で切り替える（切り替えられなければ理由を出して止める）
WRANGLER_MIN=$(node -p "try{require('./node_modules/wrangler/package.json').engines.node.replace(/[^0-9.]/g,'').split('.')[0]}catch(e){'22'}")
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt "$WRANGLER_MIN" ]; then
  echo "  ℹ️  wrangler は Node ${WRANGLER_MIN}+ が必要（現在 v$(node -v | tr -d v)）— nvm で切り替えます"
  # shellcheck disable=SC1090
  if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; nvm use "$WRANGLER_MIN" >/dev/null 2>&1 || true; fi
  NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
  if [ "$NODE_MAJOR" -lt "$WRANGLER_MIN" ]; then
    echo "  ❌ Node ${WRANGLER_MIN}+ に切り替えられませんでした。'nvm install ${WRANGLER_MIN}' の上で再実行してください"
    exit 1
  fi
  echo "  ✅ Node $(node -v) で実行します"
fi

# このリポジトリは iCloud Drive 上にあり、node_modules の実行ファイルが
# 同期で消えることがある（esbuild が「別プラットフォーム用」と誤検知して落ちる）。
# iCloud 外に置いた esbuild を使わせて回避する。
LOCAL_ESBUILD="node_modules/@esbuild/darwin-arm64/bin/esbuild"
if [ ! -x "$LOCAL_ESBUILD" ] && [ -z "${ESBUILD_BINARY_PATH:-}" ]; then
  ESBUILD_VERSION=$(node -p "require('./node_modules/esbuild/package.json').version" 2>/dev/null || echo "")
  FALLBACK_ESBUILD="$HOME/.vtj-tools/node_modules/@esbuild/darwin-arm64/bin/esbuild"
  if [ ! -x "$FALLBACK_ESBUILD" ] && [ -n "$ESBUILD_VERSION" ]; then
    echo "  i  esbuild のバイナリが消えているため iCloud 外に用意します"
    mkdir -p "$HOME/.vtj-tools"
    ( cd "$HOME/.vtj-tools" && { [ -f package.json ] || npm init -y >/dev/null 2>&1; } \
      && npm install "@esbuild/darwin-arm64@${ESBUILD_VERSION}" --no-audit --no-fund >/dev/null 2>&1 ) || true
  fi
  if [ -x "$FALLBACK_ESBUILD" ]; then
    export ESBUILD_BINARY_PATH="$FALLBACK_ESBUILD"
    echo "  OK esbuild: $FALLBACK_ESBUILD"
  else
    echo "esbuild のバイナリを用意できませんでした。npm install をやり直してください"
    exit 1
  fi
fi

# 巻き戻し防止: いま本番に出ているコミットを HEAD が含んでいなければ出さない
DEPLOYMENTS=$(dc_list_deployments "$PROJECT") || exit 1
PREV_PROD=$(dc_latest_production "$DEPLOYMENTS") || exit 1
read -r PREV_PROD_ID PREV_PROD_SRC <<< "$PREV_PROD"
echo "  ℹ️  いまの本番: ${PREV_PROD_SRC}（${PREV_PROD_ID}）"
dc_require_contains "$PREV_PROD_SRC" HEAD || exit 1

# --branch を省くと wrangler は今の git ブランチ名を使い、main 以外なら Preview になる（2026-09-14）。
# 今回のデプロイID と environment は WRANGLER_OUTPUT_FILE_PATH に書かれる JSON から読む
WRANGLER_OUT=$(mktemp "${TMPDIR:-/tmp}/vtj-wrangler-output.XXXXXX")
WRANGLER_OUTPUT_FILE_PATH="$WRANGLER_OUT" npx wrangler pages deploy --branch "$PROD_BRANCH" --commit-hash "$(git rev-parse HEAD)"

echo ""
echo "  今回のデプロイが本番として登録されたか確認"
if ! dc_verify_production "$WRANGLER_OUT" "$PROJECT" "$(git rev-parse HEAD)"; then
  echo ""
  echo "🚫 今回のデプロイを本番として確認できませんでした。本番URLの検証には進みません。"
  echo "   確認: npx wrangler pages deployment list --project-name ${PROJECT}（wrangler 出力: ${WRANGLER_OUT}）"
  exit 1
fi
rm -f "$WRANGLER_OUT"

echo ""
echo "═══ 5/5 本番実機検証 ═══"
URLS=(
  "https://vantripjapan.jp/"
  "https://vantripjapan.jp/rent/"
  "https://vantripjapan.jp/fr/"
  "https://vantripjapan.jp/de/"
  "https://vantripjapan.jp/zh/"
  "https://vantripjapan.jp/he/"
  "https://vantripjapan.jp/sitemap.xml"
)
FAIL=0
for u in "${URLS[@]}"; do
  code=""
  for attempt in 1 2 3; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$u" || echo "000")
    [ "$code" = "200" ] && break
    sleep 5
  done
  if [ "$code" = "200" ]; then echo "  ✅ 200 $u"; else echo "  ❌ $code $u"; FAIL=1; fi
done
# 言語コンテンツマーカー（キャッシュで旧版が出ていないか / エッジ伝播待ちでリトライ）
# 注意: `curl | grep -q` は pipefail + SIGPIPE で誤FAILするため、一度変数に受ける
MARKER_OK=0
for attempt in 1 2 3 4; do
  BODY=$(curl -s --max-time 20 "https://vantripjapan.jp/fr/" || true)
  if printf '%s' "$BODY" | grep -q 'lang="fr"'; then MARKER_OK=1; break; fi
  sleep 8
done
if [ "$MARKER_OK" = 1 ]; then
  echo "  ✅ /fr/ 言語マーカー OK"
else
  echo "  ❌ /fr/ が lang=\"fr\" を返していません"; FAIL=1
fi
# 200 と言語マーカーは旧版の本番でも通る。反映の確認は今回変わったファイルの中身で行う
dc_verify_content "$PREV_PROD_SRC" HEAD "$PWD" "$SITE_URL" || FAIL=1

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "🚫 本番検証に失敗しました。Cloudflare Pages のデプロイ履歴から直前のデプロイにロールバックできます。"
  exit 1
fi
echo ""
echo "🎉 デプロイ完了・本番検証PASS（${PREV_PROD_SRC} → $(git rev-parse --short HEAD)）"
