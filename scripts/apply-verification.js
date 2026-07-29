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
 *     "evidence": [{ "url": "", "type": "sign|official|phone|assoc|wiki|blog", "date": "", "quote_ja": "" }],
 *       ※ 証拠の強さ: sign(現地の看板・貼り紙・その写真)=決定的 > official(公式サイトの記載)
 *          >> phone(電話回答) — 電話は「確認すると断られる」ため掲示の実態とは別物。単独では禁止の根拠にしない
 *     "rv_park": null | { "name_ja","url","spaces","price_jpy","power","booking" },
 *     "facilities": { "toilet_24h":true, "parking_car":224, "onsen":false, "ev":true, "wifi":true, "shop":true },
 *     "nearby":     { "onsen_km": 2, "convenience_km": 3 },   // 0=駅内。風呂と補給は車中泊の実務で最重要
 *     "official_url": ""
 *   }
 *   ※ facilities は構造化フラグで渡すこと（日本語の自由記述は多言語ページに出せない）
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

const recalibrateOnly = args.includes("--recalibrate");
if (!file && !recalibrateOnly) {
    console.error("使い方: node scripts/apply-verification.js <results.json> [--date YYYY-MM-DD]");
    console.error("        node scripts/apply-verification.js --recalibrate   （既存全件を客観ルールで再判定）");
    process.exit(1);
}

const results = file ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
const list = Array.isArray(results) ? results : results.stations || [];
const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
const byId = Object.fromEntries(data.stations.map((s) => [s.id, s]));

/**
 * 検証済みと呼べるかを「証拠そのもの」から判定する客観ルール。
 *
 * なぜ confidence を単独で信用しないか:
 *   調査エージェントごとに自己申告の基準がぶれる。実際に、同じ「公式ページ＋現地取材メディア」
 *   という構成なのに、ある県は high、別の県は medium と付けられ、阿蘇・湯布院という
 *   九州最大級の目的地が桜島より多い出典を持ちながら noindex に沈んでいた。
 *   判定は人（やAI）の気分ではなく、集まった出典の構成で決める。
 *
 * ルール:
 *   prohibited      … 一次情報(sign/official)が1件あれば確定。運営者自身が禁止と書いている以上、
 *                     それ以上の裏取りは要らない（禁止の「存在」は1件で証明できる）
 *   no_explicit_ban … 一次情報1件以上 かつ 出典2件以上。
 *                     「禁止が無い」という否定の証明は、複数の場所を見た事実がないと主張できない
 *   RVパーク併設    … 日本RV協会の登録(assoc)があれば「RVパークがある」事実は確定
 */
const PRIMARY = new Set(["official", "sign", "assoc"]);
function meetsEvidenceBar(st) {
    const ev = st.evidence || [];
    if (st.rv_park && ev.some((e) => e.type === "assoc")) return true;
    const primary = ev.filter((e) => PRIMARY.has(e.type)).length;
    if (st.status === "prohibited") return primary >= 1;
    return primary >= 1 && ev.length >= 2;
}

// --recalibrate: 既存データ全件をこの客観ルールで再判定する（新しい調査結果は投入しない）
if (args.includes("--recalibrate")) {
    const data2 = JSON.parse(fs.readFileSync(DATA, "utf8"));
    const up = [], down = [];
    for (const st of data2.stations) {
        const wasChecked = st.verification !== "listed";
        const ok = meetsEvidenceBar(st);
        if (!wasChecked && ok) {
            delete st.verification;
            if (!st.verified) st.verified = today;
            up.push(st);
        } else if (wasChecked && !ok) {
            st.verification = "listed";
            st.verified = "";
            down.push(st);
        }
    }
    fs.writeFileSync(DATA, JSON.stringify(data2, null, 2) + "\n");
    console.log(`\n🔁 客観ルールで再判定`);
    console.log(`\n⬆️  検証済みへ昇格: ${up.length}駅（出典は揃っているのに confidence の付け方だけで沈んでいた駅）`);
    for (const s of up) console.log(`   ${s.name.ja}（${s.prefecture}・出典${(s.evidence || []).length}件）`);
    console.log(`\n⬇️  未検証へ差し戻し: ${down.length}駅（出典が基準に届かない）`);
    for (const s of down) console.log(`   ${s.name.ja}（${s.prefecture}・出典${(s.evidence || []).length}件）`);
    const checked2 = data2.stations.filter((s) => s.verification !== "listed").length;
    console.log(`\n合計 ${data2.stations.length}駅 / 検証済み ${checked2} / 未検証 ${data2.stations.length - checked2}`);
    console.log(`\n次: node scripts/build-overnight-pages.js`);
    process.exit(0);
}

const applied = [];
const held = [];
const unknown = [];

for (const r of list) {
    const st = byId[r.id];
    if (!st) { unknown.push(r.id); continue; }

    const ev = (r.evidence || []).filter((e) => e && (e.url || e.type === "sign"));
    // 証拠の強さ: sign(現地の看板・貼り紙・その写真) > official(公式サイトの記載) >> phone(電話回答)
    // 電話は「確認すると断られる」性質があり、実際の掲示の有無とは別物なので単独で禁止の根拠にしない
    const hasSign = ev.some((e) => e.type === "sign");
    const hasPrimary = ev.some((e) => e.type === "official" || e.type === "sign");
    const phoneOnly = ev.length > 0 && ev.every((e) => e.type === "phone");

    // RVパーク・設備・公式URLは「存在の事実」であり可否判断ではないので confidence によらず反映
    if (r.rv_park && !st.rv_park) st.rv_park = r.rv_park;
    if (r.official_url && !st.official_url) st.official_url = r.official_url;
    if (r.facilities && typeof r.facilities === "object") st.facilities = r.facilities;
    if (r.nearby && typeof r.nearby === "object") st.nearby = r.nearby;
    // 出典は「置換」ではなく「URLをキーにしたマージ」。追加投入で既存の出典を失わないため
    if (ev.length) {
        const seen = new Map((st.evidence || []).map((e) => [e.url || `${e.type}:${e.date}`, e]));
        for (const e of ev) seen.set(e.url || `${e.type}:${e.date}`, e);
        st.evidence = [...seen.values()];
    }

    // 判定は confidence の自己申告ではなく、マージ後の出典構成（＝客観ルール）で行う。
    // confidence は「調べきれなかった」の自己申告としてのみ使い、low だけを足切りにする。
    const reasons = [];
    const probe = { ...st, status: r.status };
    if (r.confidence === "low") reasons.push("confidence=low（調査側が情報を得られなかったと申告）");
    if (!meetsEvidenceBar(probe)) {
        reasons.push(r.status === "prohibited"
            ? "prohibited判定に一次情報(sign/official)の出典が無い"
            : "出典が基準未満（一次情報1件以上かつ出典2件以上が必要）");
    }
    if (r.status === "prohibited" && phoneOnly) reasons.push("電話回答のみが根拠(電話は聞けば断られるため掲示の有無とは別物)");
    if (r.status === "prohibited" && hasSign) console.log(`   ※ ${r.id}: 現地の掲示を確認 — 最も強い証拠`);
    void hasPrimary;

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
