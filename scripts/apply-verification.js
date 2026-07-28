#!/usr/bin/env node
/**
 * 🔎 検証結果の反映 — content/overnight-stations.json を更新する唯一の経路
 *
 *   node scripts/apply-verification.js <results.json> [--date YYYY-MM-DD]
 *
 * 入力JSON: 調査エージェントの出力配列。1件あたり:
 *   {
 *     "id": "namino",
 *     "status": "prohibited" | "no_explicit_ban",
 *     "confidence": "high" | "medium" | "low",
 *     "evidence": [{ "url": "", "type": "official|blog|wiki|assoc|sign", "date": "", "quote_ja": "" }],
 *     "rv_park": null | { "name_ja","url","spaces","price_jpy","power","booking" },
 *     "official_url": ""
 *   }
 *
 * 安全装置（＝「検証していないものを検証済みにしない」ための門番）:
 *   - confidence が high 以外は verification:"listed"（未検証）のまま据え置く
 *   - status を prohibited にするには evidence に official/sign 由来の出典が必須
 *   - 上記を満たしたものだけ verification を外し（＝検証済み）verified に日付を入れる
 *   - 却下した理由は必ず標準出力に出す（黙って落とさない）
 *
 * 反映後: node scripts/build-overnight-pages.js → scripts/safe-deploy.sh
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "content", "overnight-stations.json");

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dateArg = args.indexOf("--date");
const today = dateArg >= 0 ? args[dateArg + 1] : new Date().toISOString().slice(0, 10);

if (!file) {
    console.error("使い方: node scripts/apply-verification.js <results.json> [--date YYYY-MM-DD]");
    process.exit(1);
}

const results = JSON.parse(fs.readFileSync(file, "utf8"));
const list = Array.isArray(results) ? results : results.stations || [];
const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
const byId = Object.fromEntries(data.stations.map((s) => [s.id, s]));

const applied = [];
const held = [];
const unknown = [];

for (const r of list) {
    const st = byId[r.id];
    if (!st) { unknown.push(r.id); continue; }

    const ev = (r.evidence || []).filter((e) => e && (e.url || e.type === "sign"));
    const hasPrimary = ev.some((e) => e.type === "official" || e.type === "sign");

    // RVパーク情報は confidence によらず反映してよい（存在の事実であり可否判断ではない）
    if (r.rv_park && !st.rv_park) st.rv_park = r.rv_park;
    if (r.official_url && !st.official_url) st.official_url = r.official_url;
    if (ev.length) st.evidence = ev;

    const reasons = [];
    if (r.confidence !== "high") reasons.push(`confidence=${r.confidence}`);
    if (r.status === "prohibited" && !hasPrimary) reasons.push("prohibited判定に一次情報(official/sign)の出典が無い");
    if (!ev.length) reasons.push("出典ゼロ");

    if (reasons.length) {
        held.push(`${r.id}: 未検証のまま据え置き（${reasons.join(" / ")}）`);
        continue;
    }

    st.status = r.status;
    delete st.verification;      // ＝検証済み扱いになる
    st.verified = today;
    applied.push(`${r.id} → ${r.status}${st.rv_park ? " +RVパーク" : ""}（出典${ev.length}件）`);
}

fs.writeFileSync(DATA, JSON.stringify(data, null, 2) + "\n");

const checked = data.stations.filter((s) => s.verification !== "listed").length;
console.log(`\n✅ 検証済みに昇格: ${applied.length}駅`);
applied.forEach((x) => console.log("   " + x));
if (held.length) {
    console.log(`\n⏸  据え置き: ${held.length}駅`);
    held.forEach((x) => console.log("   " + x));
}
if (unknown.length) console.log(`\n⚠️  DBに無いID: ${unknown.join(", ")}`);
console.log(`\n合計 ${data.stations.length}駅 / 検証済み ${checked} / 未検証 ${data.stations.length - checked}`);
console.log(`\n次: node scripts/build-overnight-pages.js && bash scripts/safe-deploy.sh`);
