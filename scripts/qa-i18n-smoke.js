#!/usr/bin/env node
/**
 * 🧪 i18n スモークQA — デプロイ前の品質ゲート
 *
 * 焼き込み済み言語ページ（fr/de/zh/he × 8ページ）と EN 原本を検査:
 *   - lang属性 / hreflangクラスタ6本 / VTJ_FORCE_LANG / canonical / 翻訳マーカー
 *   - 全 inline <script> の構文 / 全 JSON-LD のパース
 *   - i18n辞書の5言語キー完全一致
 * 1件でも失敗すれば exit 1（safe-deploy.sh が中止する）。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

process.chdir(path.join(__dirname, ".."));

const PAGES = ["", "rent/", "faq/", "rent/bongo/", "rent/loft/", "rent/probox/", "road-trip-planner/", "contact/"];
const LANG_ATTR = { fr: "fr", de: "de", zh: "zh-Hant", he: "he" };
const EN_PAGES = [
    "site/index.html", "site/rent/index.html", "site/faq/index.html", "site/book/index.html",
    "site/contact/index.html", "site/rent/bongo/index.html", "site/rent/loft/index.html",
    "site/rent/probox/index.html", "site/road-trip-planner/index.html",
];

let fail = 0;
const bad = (msg) => { console.log("  ❌ " + msg); fail++; };

// 辞書の整合性
const dictSrc = fs.readFileSync("site/js/i18n.js", "utf8").split("// ── Language Switch Logic ──")[0];
const t = vm.runInNewContext(dictSrc + ";translations");
const enCount = Object.keys(t.en).length;
for (const l of Object.keys(t)) {
    if (Object.keys(t[l]).length !== enCount) bad(`辞書キー数不一致: en=${enCount} ${l}=${Object.keys(t[l]).length}`);
}
// キー「集合」の完全一致（数だけでなく中身も検査）
const enKeySet = new Set(Object.keys(t.en));
for (const l of Object.keys(t)) {
    if (l === "en") continue;
    const missing = [...enKeySet].filter((k) => !(k in t[l]));
    const extra = Object.keys(t[l]).filter((k) => !enKeySet.has(k));
    if (missing.length) bad(`辞書キー欠落(${l}): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
    if (extra.length) bad(`辞書キー余剰(${l}): ${extra.slice(0, 5).join(", ")}${extra.length > 5 ? "…" : ""}`);
}
console.log(`辞書: ${Object.keys(t).join("/")} 各${enCount}キー`);

// 焼き込みページ
let ok = 0;
for (const lang of Object.keys(LANG_ATTR)) {
    for (const p of PAGES) {
        const f = path.join("site", lang, p, "index.html");
        if (!fs.existsSync(f)) { bad(`欠落: ${f}`); continue; }
        const html = fs.readFileSync(f, "utf8");
        const issues = [];
        if (!html.includes(`lang="${LANG_ATTR[lang]}"`)) issues.push("lang属性");
        if ((html.match(/hreflang=/g) || []).length !== 6) issues.push("hreflang≠6");
        if (!html.includes(`VTJ_FORCE_LANG='${lang}'`)) issues.push("FORCE_LANG");
        if (!html.includes(t[lang]["nav.rental"])) issues.push("翻訳マーカー");
        if (!html.includes(`rel="canonical" href="https://vantripjapan.jp/${lang}/${p}"`)) issues.push("canonical");
        for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
            try { JSON.parse(m[1]); } catch (e) { issues.push("JSON-LD"); break; }
        }
        if (issues.length) bad(`/${lang}/${p}: ${issues.join(", ")}`); else ok++;
    }
}
console.log(`焼き込みページ: ${ok}/${Object.keys(LANG_ATTR).length * PAGES.length} OK`);

// EN 原本
let enOk = 0;
for (const f of EN_PAGES) {
    const html = fs.readFileSync(f, "utf8");
    const issues = [];
    let i = 0;
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        try { new Function(m[1]); } catch (e) { issues.push(`script#${i}構文: ${e.message.slice(0, 50)}`); }
        i++;
    }
    if (f !== "site/book/index.html" && (html.match(/hreflang=/g) || []).length !== 6) issues.push("hreflang≠6");
    if (/hreflang="[^"]+" href="[^"]*\?lang=/.test(html)) issues.push("hreflangが旧?lang=形式（/fr/等の静的URLに直すこと）");
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        try { JSON.parse(m[1]); } catch (e) { issues.push("JSON-LD"); break; }
    }
    if (issues.length) bad(`${f}: ${issues.join(" | ")}`); else enOk++;
}
console.log(`ENページ: ${enOk}/${EN_PAGES.length} OK`);

if (fail > 0) { console.log(`\n🚫 QA FAIL: ${fail}件`); process.exit(1); }
console.log("\n🧪 QA PASS");
