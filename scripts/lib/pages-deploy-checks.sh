#!/usr/bin/env bash
# ============================================================
# 本番反映チェック（scripts/safe-deploy.sh から source して使う関数集）
#
# 2026-09-14: 作業ブランチから safe-deploy を実行したら wrangler が Preview として
# デプロイした。手順5の「HTTP 200」「/fr/ の lang="fr"」は旧版の本番でも通るので、
# 本番に出ていないのに「本番検証PASS」と表示された。ここの関数でその穴をふさぐ。
#
#   dc_require_branch <branch>                  今のブランチが <branch> か（detached HEAD も不可）
#   dc_list_deployments <project>               deployment list を JSON で標準出力へ（Node 22 が必要）
#   dc_latest_production <json>                 最新の本番デプロイの「ID Source」を標準出力へ
#   dc_require_contains <commit> [head]         いまの本番コミットを head が含むか（巻き戻し防止）
#   dc_verify_production <out> <project> <sha>  今回のデプロイが Production・最新の本番・commit 一致か
#   dc_verify_content <base> <head> <root> <site_url> [max]
#                                               base..head で変わった site/ のファイルが本番と同じバイト列か
#
# どれも読み取りだけなので、デプロイせずに単体で試せる:
#   . scripts/lib/pages-deploy-checks.sh
#   dc_latest_production "$(dc_list_deployments vantripjapan)"
# ============================================================

dc_require_branch() {
  local want="$1" cur
  cur=$(git symbolic-ref --quiet --short HEAD || true)
  if [ "$cur" = "$want" ]; then
    echo "✅ ブランチ: ${cur}"
    return 0
  fi
  echo "🚫 本番デプロイは ${want} ブランチからのみ実行できます（現在: ${cur:-detached HEAD}）"
  echo "   ${want} 以外から出すと Cloudflare Pages では Preview になり、本番は更新されません。"
  echo "   変更を ${want} に取り込んでから再実行してください（例: git switch ${want} && git merge --ff-only <作業ブランチ>）"
  return 1
}

dc_list_deployments() {
  local project="$1" json
  if ! json=$(npx wrangler pages deployment list --project-name "$project" --json 2>/dev/null); then
    echo "  ❌ deployment list を取得できませんでした（そのPCで npx wrangler login 済みか確認してください）" >&2
    return 1
  fi
  if ! printf '%s' "$json" | node -e 'if (!Array.isArray(JSON.parse(require("fs").readFileSync(0, "utf8")))) process.exit(1)' 2>/dev/null; then
    echo "  ❌ deployment list の出力を JSON 配列として読めませんでした" >&2
    return 1
  fi
  printf '%s\n' "$json"
}

dc_latest_production() {
  printf '%s' "$1" | node -e '
    const list = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const p = list.find((d) => d.Environment === "Production");
    if (!p) process.exit(1);
    console.log(p.Id + " " + (p.Source || "-"));
  ' || { echo "  ❌ deployment list に本番（Production）のデプロイが見つかりません" >&2; return 1; }
}

dc_require_contains() {
  local commit="$1" head="${2:-HEAD}"
  if ! git rev-parse --verify --quiet "${commit}^{commit}" >/dev/null; then
    echo "  🚫 いま本番に出ているコミット ${commit} が手元の git にありません。"
    echo "     そのコミットを含むブランチを git fetch で取り込むか、前回デプロイした PC で実行してください"
    return 1
  fi
  if ! git merge-base --is-ancestor "$commit" "$head"; then
    echo "  🚫 いま本番に出ているコミット ${commit} が ${head} に含まれていません。このまま出すと本番の変更が巻き戻ります。"
    echo "     ${commit} を取り込んでから再実行してください（意図して戻すときは Cloudflare Pages のデプロイ履歴からロールバック）"
    return 1
  fi
  echo "  ✅ 巻き戻し防止: いまの本番 ${commit} は ${head} に含まれています"
}

# 今回のデプロイが本番として登録され、いま最新の本番になっているかを確認する。
#   1) wrangler が WRANGLER_OUTPUT_FILE_PATH に書く pages-deploy-detailed から ID と environment を読む
#   2) Cloudflare 側の記録（deployment list）でも同じ ID が Production・最新・commit 一致かを確かめる
dc_verify_production() {
  local out_file="$1" project="$2" commit="$3" info="" id="" env="" prod_branch="" json="" msg="" rc=0 attempt
  if ! info=$(node -e '
    const lines = require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean);
    const e = lines.map((l) => JSON.parse(l)).filter((x) => x.type === "pages-deploy-detailed").pop();
    if (!e || !e.deployment_id) process.exit(1);
    console.log([e.deployment_id, e.environment || "-", e.production_branch || "-"].join(" "));
  ' "$out_file" 2>/dev/null); then
    echo "  ❌ wrangler の出力ファイルから今回のデプロイを特定できませんでした（${out_file}）"
    return 1
  fi
  read -r id env prod_branch <<< "$info"
  if [ "$env" != "production" ]; then
    echo "  ❌ 今回のデプロイ ${id} は environment=${env} です。本番は更新されていません（Pages の本番ブランチ: ${prod_branch}）"
    return 1
  fi
  echo "  ✅ wrangler 出力: ${id} environment=production（Pages の本番ブランチ: ${prod_branch}）"

  for attempt in 1 2 3; do
    json=$(dc_list_deployments "$project") || return 1
    rc=0
    msg=$(printf '%s' "$json" | node -e '
      const [id, commit] = process.argv.slice(1);
      const list = JSON.parse(require("fs").readFileSync(0, "utf8"));
      const me = list.find((d) => d.Id === id);
      if (!me) { console.log("deployment list に " + id + " がありません"); process.exit(2); }
      const latest = list.find((d) => d.Environment === "Production");
      const ng = [];
      if (me.Environment !== "Production") ng.push("Environment=" + me.Environment + "（Production ではない）");
      if (!latest || latest.Id !== id) ng.push("最新の本番デプロイが別のID（" + (latest ? latest.Id : "なし") + "）");
      if (!me.Source || !commit.startsWith(me.Source)) ng.push("Source=" + me.Source + " が HEAD " + commit.slice(0, 7) + " と違う");
      if (ng.length) { console.log(ng.join(" / ")); process.exit(1); }
      console.log(me.Id + " Environment=Production Source=" + me.Source + " " + me.Deployment);
    ' "$id" "$commit") || rc=$?
    [ "$rc" -ne 2 ] && break
    sleep 5
  done
  if [ "$rc" -ne 0 ]; then
    echo "  ❌ deployment list: ${msg}"
    return 1
  fi
  echo "  ✅ deployment list: ${msg}"
}

# 変更ファイル一覧 → 本番URLとの対応表（TSV: 手元パス<TAB>URLパス）。
# Pages に配信されないファイルと Functions が返すパス（site/_routes.json の include）は除く。
# max 件を超えるときは一覧から均等に間引く。
_dc_targets() {  # <root> <max> <list_file>
  node - "$1" "$2" "$3" <<'JS'
const fs = require("fs");
const path = require("path");
const [root, max, listFile] = process.argv.slice(2);
const SKIP = new Set(["site/_headers", "site/_redirects", "site/_routes.json", "site/_worker.js", "site/404.html"]);
let include = [];
let exclude = [];
try {
  const routes = JSON.parse(fs.readFileSync(path.join(root, "site/_routes.json"), "utf8"));
  include = routes.include || [];
  exclude = routes.exclude || [];
} catch (e) {}
const toRe = (p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
const inc = include.map(toRe);
const exc = exclude.map(toRe);
const servedByFunction = (u) => inc.some((re) => re.test(u)) && !exc.some((re) => re.test(u));
const rows = [];
for (const rel of fs.readFileSync(listFile, "utf8").split("\n").filter(Boolean)) {
  if (!rel.startsWith("site/") || SKIP.has(rel)) continue;
  if (!fs.existsSync(path.join(root, rel))) continue;
  let u = rel.slice("site".length);
  if (u.endsWith("/index.html")) u = u.slice(0, -"index.html".length);
  else if (u.endsWith(".html")) u = u.slice(0, -".html".length);
  if (servedByFunction(u)) continue;
  rows.push(rel + "\t" + u.split("/").map(encodeURIComponent).join("/"));
}
const n = Math.max(1, Number(max) || 30);
const picked = rows.length > n ? Array.from({ length: n }, (_, i) => rows[Math.floor((i * rows.length) / n)]) : rows;
if (picked.length) process.stdout.write(picked.join("\n") + "\n");
JS
}

# 対応表の各ファイルを本番から取得し、手元ファイルとバイト単位で比べる。
# 一致しないもの（中身違い・404 など）はエッジ反映待ちとして 8 秒おきに 3 回まで取り直す。
# 3xx はリダイレクト規則（site/_redirects）の対象なので比べない。一致件数は _DC_MATCHED に入る。
_dc_compare() {  # <root> <site_url> <targets.tsv> <work_dir>
  local root="$1" site_url="$2" pending="$3" work="$4" round=1 rel url reason code
  _DC_MATCHED=0
  while :; do
    : > "$work/retry.tsv"
    while IFS=$'\t' read -r rel url reason <&3; do
      rm -f "$work/body"
      code=$(curl -s -o "$work/body" -w '%{http_code}' --max-time 30 "${site_url}${url}?v=$(date +%s)${round}") || code="000"
      case "$code" in
        200)
          if cmp -s "$work/body" "${root}/${rel}"; then
            echo "  ✅ 一致 ${url}"
            _DC_MATCHED=$((_DC_MATCHED + 1))
          else
            printf '%s\t%s\t%s\n' "$rel" "$url" "中身が手元のファイルと違う" >> "$work/retry.tsv"
          fi
          ;;
        301|302|303|307|308)
          echo "  ↪️  ${code} リダイレクトのため比べない ${url}"
          ;;
        *)
          printf '%s\t%s\t%s\n' "$rel" "$url" "HTTP ${code}" >> "$work/retry.tsv"
          ;;
      esac
    done 3< "$pending"
    [ -s "$work/retry.tsv" ] || return 0
    if [ "$round" -ge 4 ]; then
      while IFS=$'\t' read -r rel url reason <&3; do
        echo "  ❌ ${reason}: ${url}（手元: ${rel}）"
      done 3< "$work/retry.tsv"
      return 1
    fi
    echo "  … 不一致 $(grep -c . "$work/retry.tsv") 件をエッジ反映待ちとして 8 秒後に取り直します（${round}/3）"
    cp "$work/retry.tsv" "$work/pending.tsv"
    pending="$work/pending.tsv"
    round=$((round + 1))
    sleep 8
  done
}

dc_verify_content() {  # <base> <head> <root> <site_url> [max]
  local base="$1" head="$2" root="$3" site_url="$4" max="${5:-30}" work total picked rc=0
  _DC_MATCHED=0
  work=$(mktemp -d "${TMPDIR:-/tmp}/vtj-verify.XXXXXX") || return 1
  if ! git -c core.quotePath=false diff --name-only --no-renames --diff-filter=AM "$base" "$head" -- site/ > "$work/changed.txt"; then
    echo "  ❌ git diff ${base} ${head} に失敗しました"
    rc=1
  elif ! _dc_targets "$root" "$max" "$work/changed.txt" > "$work/targets.tsv"; then
    echo "  ❌ 比較対象の一覧を作れませんでした"
    rc=1
  else
    total=$(grep -c . "$work/changed.txt" || true)
    picked=$(grep -c . "$work/targets.tsv" || true)
    echo "  今回の変更 ${base}..${head}: site/ 配下 ${total} 件のうち ${picked} 件を本番と比較（Functions 配下などは除外）"
    if [ "$picked" -gt 0 ]; then
      _dc_compare "$root" "$site_url" "$work/targets.tsv" "$work" || rc=1
    fi
  fi
  if [ "$rc" -eq 0 ] && [ "$_DC_MATCHED" -eq 0 ]; then
    echo "  ⚠️  比較できる変更ファイルがありません（同じコミットの再デプロイ、Functions 配下や削除だけの変更など）。"
    echo "     新旧の区別は手順4の Environment=Production 確認に任せ、固定ファイルが手元と一致するかだけ確認します"
    printf '%s\n' site/llms.txt site/llms-full.txt site/robots.txt site/index.html > "$work/canary.txt"
    if ! _dc_targets "$root" 4 "$work/canary.txt" > "$work/targets.tsv"; then
      rc=1
    elif ! _dc_compare "$root" "$site_url" "$work/targets.tsv" "$work"; then
      rc=1
    elif [ "$_DC_MATCHED" -eq 0 ]; then
      echo "  ❌ 固定ファイルも比較できませんでした"
      rc=1
    fi
  fi
  rm -f "$work"/*
  rmdir "$work" 2>/dev/null || true
  return "$rc"
}
