#!/usr/bin/env bash
# ============================================================
# VTJ 安全デプロイ — Cloudflare Pages への唯一の公式デプロイ経路
#
#   scripts/safe-deploy.sh
#
# ゲート（すべて通らないとデプロイされない）:
#   1. 作業ツリーがクリーン（コミット済み = 旧バージョンへ必ず戻せる）
#   2. セキュリティ監査 PASS（scripts/security-audit.sh --all）
#   3. i18n/品質スモークQA PASS（scripts/qa-i18n-smoke.js）
#   4. wrangler pages deploy
#   5. 本番URLの実機検証（HTTP 200 + 言語コンテンツマーカー）
#
# ⚠️ `npx wrangler pages deploy` を直接叩かないこと（CLAUDE.md 参照）
# ============================================================
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "═══ 1/5 作業ツリー確認（旧バージョン保存の強制） ═══"
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
npx wrangler pages deploy

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

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "🚫 本番検証に失敗しました。Cloudflare Pages のデプロイ履歴から直前のデプロイにロールバックできます。"
  exit 1
fi
echo ""
echo "🎉 デプロイ完了・本番検証PASS"
