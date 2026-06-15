#!/usr/bin/env bash
# ──────────────────────────────────────────────
# check-i18n.sh — i18n consistency checker
# Finds missing translation keys in VanTripJapan
# ──────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SITE_DIR="$PROJECT_ROOT/site"
I18N_FILE="$SITE_DIR/js/i18n.js"

if [[ ! -f "$I18N_FILE" ]]; then
  echo "❌ i18n.js not found at $I18N_FILE"
  exit 1
fi

ERRORS=0

# ── 1. Extract all data-i18n keys from HTML files ──
echo "═══════════════════════════════════════════"
echo "  Step 1: Check HTML data-i18n keys → EN"
echo "═══════════════════════════════════════════"

HTML_KEYS=$(grep -roh 'data-i18n="[^"]*"' "$SITE_DIR" --include="*.html" \
  | sed 's/data-i18n="//;s/"//' \
  | sort -u)

MISSING_IN_EN=0
while IFS= read -r key; do
  [[ -z "$key" ]] && continue
  if ! grep -q "\"$key\"" "$I18N_FILE"; then
    echo "  ⚠️  HTML key missing in i18n.js: $key"
    MISSING_IN_EN=$((MISSING_IN_EN + 1))
    ERRORS=$((ERRORS + 1))
  fi
done <<< "$HTML_KEYS"

if [[ $MISSING_IN_EN -eq 0 ]]; then
  echo "  ✅ All HTML data-i18n keys found in i18n.js"
else
  echo "  ❌ $MISSING_IN_EN key(s) missing from i18n.js"
fi

# ── 2. Extract EN keys and check other language blocks ──
echo ""
echo "═══════════════════════════════════════════"
echo "  Step 2: Check EN keys → FR / DE / ZH / HE"
echo "═══════════════════════════════════════════"

# Extract the EN block keys (lines between "en: {" and the next top-level block)
# We look for quoted key patterns like "key.name":
EN_KEYS=$(awk '
  /^    en: \{/     { capture=1; next }
  /^    (fr|de|zh|he): \{/ { capture=0 }
  capture && /^        "[^"]+":/ {
    gsub(/^        "/, ""); gsub(/".*/, ""); print
  }
' "$I18N_FILE" | sort -u)

LANGUAGES=("fr" "de" "zh" "he")

for LANG in "${LANGUAGES[@]}"; do
  echo ""
  echo "  ── $LANG ──"

  # Extract keys for this language block
  LANG_KEYS=$(awk -v lang="$LANG" '
    $0 ~ "^    " lang ": \\{"   { capture=1; next }
    capture && /^    \},?$/      { capture=0 }
    capture && /^        "[^"]+":/ {
      gsub(/^        "/, ""); gsub(/".*/, ""); print
    }
  ' "$I18N_FILE" | sort -u)

  MISSING=0
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    if ! echo "$LANG_KEYS" | grep -qx "$key"; then
      echo "    ⚠️  EN key missing in $LANG: $key"
      MISSING=$((MISSING + 1))
      ERRORS=$((ERRORS + 1))
    fi
  done <<< "$EN_KEYS"

  if [[ $MISSING -eq 0 ]]; then
    echo "    ✅ All EN keys present in $LANG"
  else
    echo "    ❌ $MISSING key(s) missing in $LANG"
  fi
done

# ── Summary ──
echo ""
echo "═══════════════════════════════════════════"
if [[ $ERRORS -eq 0 ]]; then
  echo "  ✅ All checks passed — no missing keys!"
else
  echo "  ❌ Total issues found: $ERRORS"
fi
echo "═══════════════════════════════════════════"

exit $ERRORS
