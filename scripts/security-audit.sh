#!/usr/bin/env bash
# ============================================================
# VTJ セキュリティ監査 — 公開（push / デプロイ）前ガードレール
#
# 使い方:
#   scripts/security-audit.sh --all                 # 追跡ファイル全体を監査（デプロイ前）
#   scripts/security-audit.sh --range [base]        # base..HEAD の差分を監査（push前、既定 origin/main）
#   scripts/security-audit.sh --range-sha <A..B>    # SHA範囲を監査（pre-push フックから使用）
#
# 検査項目:
#   [F1] 秘密情報ファイル（.env / 鍵 / DB）が git 追跡されていないか
#   [F2] APIキー・トークン・秘密鍵のパターン
#   [F3] 許可リスト外のメールアドレス（顧客PII混入防止）
#   [F4] 許可リスト外の電話番号（顧客PII混入防止）
#   [F5] 2MB超の新規バイナリ（rangeモードのみ）
#   [W1] リポジトリがPUBLICであることの注意喚起（gh利用可能時）
#
# 1件でも FAIL があれば exit 1（push / デプロイは中止される）。
# 誤検知した場合はこのファイル冒頭の許可リストに追記すること。
# ============================================================
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
export LC_ALL=C

# ── 許可リスト（誤検知はここに追記） ──────────────────────────
ALLOW_EMAILS='(@camjyo\.com|@anthropic\.com|@example\.com|@vantripjapan\.jp|@crystalinsence\.com|example@gmail\.com|your@email\.com|@sentry\.io|@w3\.org|@schema\.org|noreply@|no-reply@)'
# 検証済みの公開番号のみ: 自社WhatsApp / 自社固定(NAP・JSON-LD用) / 湯山の郷(記事内の施設公開番号) / 在東京イスラエル大使館 / 管理画面プレースホルダ
ALLOW_PHONES='(817093757129|81[- ]?70[- ]?9375[- ]?7129|070[- ]?9375[- ]?7129|81[- ]?50[- ]?5850[- ]?5236|050[- ]?5850[- ]?5236|090-4988-4179|81-3-3264-0911|90-1234-5678)'
# シークレット検知の除外（環境変数参照・プレースホルダ・使用例）
SECRET_EXCLUDE='(process\.env|secrets\.[A-Z_]+|\{\{ *secrets|\benv\.[A-Z_]+|GROQ_API_KEY=xxx|YOUR_[A-Z_]+|<[A-Z_]+>|例:|e\.g\.)'
# 生成物（焼き込み言語ページ）と依存ロックは原本側で担保されるため除外
EXCLUDE_PATHSPEC=(':!site/fr' ':!site/de' ':!site/zh' ':!site/he' ':!package-lock.json' ':!pinterest-tool/package-lock.json')

FAIL=0; WARN=0
red()    { printf '  \033[31m❌ %s\033[0m\n' "$*"; FAIL=$((FAIL+1)); }
yellow() { printf '  \033[33m⚠️  %s\033[0m\n' "$*"; WARN=$((WARN+1)); }
green()  { printf '  \033[32m✅ %s\033[0m\n' "$*"; }

MODE="${1:---range}"
case "$MODE" in
  --all)       RANGE="" ;;
  --range)     RANGE="${2:-origin/main}..HEAD" ;;
  --range-sha) RANGE="${2:?range required}" ;;
  *) echo "usage: $0 --all | --range [base] | --range-sha <A..B>"; exit 2 ;;
esac

# 検査対象テキストを標準出力に流す（rangeモードは追加行のみ）
scan_source() {
  if [ -n "$RANGE" ]; then
    git diff "$RANGE" -- . "${EXCLUDE_PATHSPEC[@]}" | grep -E '^\+' | grep -vE '^\+\+\+' || true
  else
    git grep -hI -e '' -- . "${EXCLUDE_PATHSPEC[@]}" 2>/dev/null || true
  fi
}
SCAN=$(scan_source)

echo "🛡️  VTJ セキュリティ監査 (${MODE} ${RANGE:-全追跡ファイル})"
echo "────────────────────────────────────────────"

# [F1] 追跡された秘密情報ファイル
echo "[F1] 秘密情報ファイルの追跡チェック"
BAD_FILES=$(git ls-files | grep -E '(^|/)\.env($|\.[a-z]+$)|\.pem$|\.p12$|\.key$|(^|/)\.credentials|\.sqlite3?$|\.db$|(^|/)\.dev\.vars' || true)
if [ -n "$BAD_FILES" ]; then red "秘密情報ファイルが追跡されています:"; echo "$BAD_FILES" | sed 's/^/       /'; else green "なし"; fi

# [F2] シークレットパターン
echo "[F2] APIキー・トークン・秘密鍵パターン"
SECRET_PATTERNS=(
  'AKIA[0-9A-Z]{16}'
  '(ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{30,}'
  'sk-[A-Za-z0-9_-]{20,}'
  'gsk_[A-Za-z0-9]{20,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'AIza[0-9A-Za-z_-]{35}'
  '-----BEGIN [A-Z ]*PRIVATE KEY'
  'eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}'
  '(api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|password)["'"'"']?\s*[:=]\s*["'"'"'][A-Za-z0-9+/_-]{16,}["'"'"']'
)
HIT=0
for pat in "${SECRET_PATTERNS[@]}"; do
  MATCHES=$(printf '%s\n' "$SCAN" | grep -inE -e "$pat" | grep -viE -e "$SECRET_EXCLUDE" | head -5 || true)
  if [ -n "$MATCHES" ]; then red "パターン検出: $pat"; echo "$MATCHES" | sed 's/^/       /' | cut -c1-160; HIT=1; fi
done
[ "$HIT" = 0 ] && green "なし"

# [F2b] env参照のハードコード・フォールバック秘密（process.env.X || "リテラル"）
# ※ F2のSECRET_EXCLUDEはprocess.envを含む行を丸ごと除外するため、この形の
#   ハードコード既定値(例: AUTH_PASSWORD = process.env.AUTH_PASSWORD || "vantrip2026")
#   をすり抜ける。ここは除外を適用せず、フォールバック・リテラルだけを検査する。
echo "[F2b] env参照のハードコード・フォールバック秘密"
FALLBACK=$(printf '%s\n' "$SCAN" | grep -inE '(PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|APIKEY|PRIVATE[_-]?KEY|CREDENTIAL)[A-Za-z_]*[^=]*=[^;]*\|\|[[:space:]]*["'"'"'][A-Za-z0-9+/_.-]{6,}["'"'"']' | grep -viE -e 'YOUR_|<[A-Z_]+>|xxx|example|placeholder|\|\|[[:space:]]*["'"'"']["'"'"']' | head -5 || true)
if [ -n "$FALLBACK" ]; then red "ハードコードされたフォールバック秘密を検出（env必須にすること）:"; echo "$FALLBACK" | sed 's/^/       /' | cut -c1-160; HIT=1; else green "なし"; fi

# [F3] 許可リスト外メールアドレス（PII）
echo "[F3] 許可リスト外メールアドレス"
EMAILS=$(printf '%s\n' "$SCAN" | grep -ohE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' | sort -u | grep -viE "$ALLOW_EMAILS" || true)
if [ -n "$EMAILS" ]; then red "許可リスト外のメールを検出（顧客PIIの可能性）:"; echo "$EMAILS" | sed 's/^/       /'; else green "なし"; fi

# [F4] 許可リスト外電話番号（PII）
echo "[F4] 許可リスト外電話番号"
PHONES=$(printf '%s\n' "$SCAN" | grep -ohE -e '(\+81[ -]?[0-9][ 0-9-]{8,12}[0-9]|0[789]0[ -]?[0-9]{4}[ -]?[0-9]{4})' | sort -u | grep -viE -e "$ALLOW_PHONES" || true)
if [ -n "$PHONES" ]; then red "許可リスト外の電話番号を検出（顧客PIIの可能性）:"; echo "$PHONES" | sed 's/^/       /'; else green "なし"; fi

# [F5] 大容量ファイル（rangeのみ / >2MB）
if [ -n "$RANGE" ]; then
  echo "[F5] 2MB超の新規オブジェクト"
  BIG=$(git rev-list --objects "$RANGE" 2>/dev/null | awk '{print $1}' | git cat-file --batch-check='%(objectsize) %(objectname)' 2>/dev/null | awk '$1 > 2097152 {print $2, $1}' || true)
  if [ -n "$BIG" ]; then yellow "2MB超のオブジェクトあり（意図的か確認）:"; echo "$BIG" | sed 's/^/       /'; else green "なし"; fi
fi

# [W1] リポジトリ公開状態
if command -v gh >/dev/null 2>&1; then
  VIS=$(gh repo view --json visibility --jq .visibility 2>/dev/null || echo "unknown")
  if [ "$VIS" = "PUBLIC" ]; then yellow "リポジトリはPUBLICです — pushした内容は誰でも閲覧できます"; fi
fi

echo "────────────────────────────────────────────"
if [ "$FAIL" -gt 0 ]; then
  printf '\033[31m🚫 監査FAIL: %d件。公開を中止してください。誤検知なら scripts/security-audit.sh の許可リストへ追記を。\033[0m\n' "$FAIL"
  exit 1
fi
printf '\033[32m🛡️  監査PASS（警告 %d件）\033[0m\n' "$WARN"
