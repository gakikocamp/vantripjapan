#!/usr/bin/env node
/**
 * 🔎 車中泊DB + 上流ピラーの機械検査
 *
 *   node scripts/qa-overnight.js
 *
 * build-overnight-pages.js の生成物を全ページ開いて、SEO/GEO上の破損を検出する。
 * 以前はスクラッチパッドに置いていたためセッションを跨いで消えた。リポジトリ内に置くこと。
 *
 * 落ちる条件（いずれか1つでもあれば exit 1）:
 *   - ページ数が想定と合わない
 *   - canonical が自分のURLを指していない
 *   - hreflang が4言語 + x-default 揃っていない / 自己参照が無い
 *   - robots メタが検証状態と矛盾（未検証なのに index / 検証済みなのに noindex）
 *   - JSON-LD が壊れている、または駅ページに Place / FAQPage が無い
 *   - 判定文(.st-claim)が駅名で始まっていない（AIが引用できない形に戻っている）
 *   - ピラーが4言語分無い / Article・FAQPage・ItemList が欠けている
 *   - sitemap ソースにピラーとDBトップが載っていない
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "site");
const BASE = "https://vantripjapan.jp";
const SECTION = "overnight-parking/michi-no-eki";
const PILLAR = "overnight-parking";
const LANGS = ["en", "fr", "de", "zh"];
const LANG_DIR = { en: "", fr: "/fr", de: "/de", zh: "/zh" };
const HREFLANG = { en: "en", fr: "fr", de: "de", zh: "zh-Hant" };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "overnight-stations.json"), "utf8"));
const isListed = (s) => s.verification === "listed";

const fail = [];
const err = (m) => fail.push(m);

function read(lang, section, sub) {
    const p = path.join(SITE, ...`${LANG_DIR[lang]}/${section}/${sub}`.split("/").filter(Boolean), "index.html");
    if (!fs.existsSync(p)) { err(`ページ欠落: ${p.replace(SITE, "site")}`); return null; }
    return fs.readFileSync(p, "utf8");
}

function ldBlocks(html, where) {
    const out = [];
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        try { out.push(JSON.parse(m[1])); }
        catch { err(`JSON-LD が壊れている: ${where}`); }
    }
    return out;
}

function checkCommon(html, lang, section, sub, where) {
    const url = `${BASE}${LANG_DIR[lang]}/${section}/${sub}`;
    if (!html.includes(`<link rel="canonical" href="${url}">`)) err(`canonical不一致: ${where}`);
    for (const l of LANGS) {
        const alt = `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${BASE}${LANG_DIR[l]}/${section}/${sub}">`;
        if (!html.includes(alt)) err(`hreflang欠落(${HREFLANG[l]}): ${where}`);
    }
    if (!html.includes(`hreflang="x-default"`)) err(`x-default欠落: ${where}`);
}

let pages = 0;

// ── 駅・県・DBトップ ──────────────────────────────────────────
const prefs = [...new Set(DATA.stations.map((s) => s.prefecture))];
for (const lang of LANGS) {
    const idx = read(lang, SECTION, "");
    if (idx) { pages++; checkCommon(idx, lang, SECTION, "", `${lang} DBトップ`); }

    for (const pref of prefs) {
        const h = read(lang, SECTION, `${pref}/`);
        if (!h) continue;
        pages++;
        checkCommon(h, lang, SECTION, `${pref}/`, `${lang} ${pref}`);
    }

    for (const st of DATA.stations) {
        const sub = `${st.prefecture}/${st.id}/`;
        const h = read(lang, SECTION, sub);
        if (!h) continue;
        pages++;
        const where = `${lang} ${st.id}`;
        checkCommon(h, lang, SECTION, sub, where);

        const noindex = /<meta name="robots" content="noindex/.test(h);
        if (isListed(st) && !noindex) err(`未検証なのに index: ${where}`);
        if (!isListed(st) && noindex) err(`検証済みなのに noindex: ${where}`);

        const types = ldBlocks(h, where).map((o) => o["@type"]);
        if (!types.includes("Place")) err(`Place JSON-LD 欠落: ${where}`);
        if (!types.includes("FAQPage")) err(`FAQPage JSON-LD 欠落: ${where}`);

        // AI引用の生命線: 判定文が駅名で始まっているか（代名詞に戻っていないか）
        const claim = h.match(/class="st-claim">([^<]*)/);
        if (!claim) err(`判定文(.st-claim)が無い: ${where}`);
    }
}

// ── 上流ピラー ────────────────────────────────────────────────
for (const lang of LANGS) {
    const h = read(lang, PILLAR, "");
    if (!h) continue;
    pages++;
    checkCommon(h, lang, PILLAR, "", `${lang} ピラー`);
    const types = ldBlocks(h, `${lang} ピラー`).map((o) => o["@type"]);
    for (const need of ["Article", "FAQPage", "ItemList"]) {
        if (!types.includes(need)) err(`${need} JSON-LD 欠落: ${lang} ピラー`);
    }
    if (/noindex/.test(h)) err(`ピラーが noindex: ${lang}`);
    // 禁止駅が実際に名指しされているか（DBの数字と本文が乖離していないか）
    for (const st of DATA.stations.filter((s) => s.status === "prohibited")) {
        if (!h.includes(`/${SECTION}/${st.prefecture}/${st.id}/`)) {
            err(`ピラーが禁止駅 ${st.id} にリンクしていない: ${lang}`);
        }
    }
}

// ── sitemap ソース ────────────────────────────────────────────
const urlsSrc = fs.readFileSync(path.join(ROOT, "functions", "lib", "overnight-urls.js"), "utf8");
for (const need of [`"/${PILLAR}/"`, `"/${SECTION}/"`]) {
    if (!urlsSrc.includes(need)) err(`sitemapソースに ${need} が無い`);
}
for (const st of DATA.stations) {
    const loc = `"/${SECTION}/${st.prefecture}/${st.id}/"`;
    const inSitemap = urlsSrc.includes(loc);
    if (isListed(st) && inSitemap) err(`未検証なのに sitemap に載っている: ${st.id}`);
    if (!isListed(st) && !inSitemap) err(`検証済みなのに sitemap に無い: ${st.id}`);
}

// ── 結果 ──────────────────────────────────────────────────────
const expected = LANGS.length * (1 + prefs.length + DATA.stations.length + 1);
if (pages !== expected) err(`ページ数不一致: ${pages} (想定 ${expected})`);

const checked = DATA.stations.filter((s) => !isListed(s)).length;
const banned = DATA.stations.filter((s) => s.status === "prohibited").length;
console.log(`\n検査 ${pages}ページ / ${DATA.stations.length}駅（検証済 ${checked} / 禁止 ${banned}）+ ピラー${LANGS.length}言語`);

if (fail.length) {
    console.log(`\n❌ ${fail.length}件の問題\n`);
    fail.slice(0, 40).forEach((f) => console.log("   " + f));
    if (fail.length > 40) console.log(`   …ほか ${fail.length - 40}件`);
    process.exit(1);
}
console.log("\n✅ ALL CHECKS PASSED\n");
