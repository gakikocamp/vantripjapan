#!/usr/bin/env node
/**
 * 🕵️ 「AIが書いた」と見抜かれる兆候を数える
 *
 *   node scripts/check-ai-tells.js                       全記事をスキャン
 *   node scripts/check-ai-tells.js --url <URL>           1本だけ
 *   node scripts/check-ai-tells.js --file body.html      公開前の下書きを検査
 *   node scripts/check-ai-tells.js --sitemap <URL>       他サイトにも使う
 *   node scripts/check-ai-tells.js --json                機械可読で出す
 *
 * 判定基準とルールの根拠: skills/human-copy-en.md
 * 合格ライン: スコア15以下 / emダッシュ0
 *
 * ⚠️ 中国語(zh)の `——` は正規の約物なのでemダッシュ判定から除外する。
 *    日本語記事はこのスクリプトの対象外（~/.claude/hooks/jp-copy-check.sh が担当）。
 */
const SITEMAP_DEFAULT = "https://vantripjapan.jp/sitemap.xml";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

const TELLS = {
    em_dash: { re: /—/g, weight: 2.0, why: "emダッシュ。LLM最大の指紋。英仏独の本文では使わない" },
    not_just: { re: /\b(not just|isn't just|aren't just|more than just)\b/gi, weight: 3.0, why: "「not just X, but Y」構文" },
    whether_youre: { re: /\bWhether you(?:'re| are)\b/gi, weight: 3.0, why: "「Whether you're A or B」の呼びかけ" },
    delve_dive: { re: /\b(delve|dive in|dive into|deep dive)\b/gi, weight: 3.0, why: "delve / dive in" },
    template_title: { re: /\b(Everything You Need to Know|Complete Guide|Ultimate Guide|The Definitive)\b/gi, weight: 3.0, why: "テンプレ型の題" },
    formal_conn: { re: /\b(Moreover|Furthermore|Additionally|In conclusion|Ultimately)\b/gi, weight: 2.0, why: "硬い接続詞" },
    ai_adjectives: { re: /\b(seamless|vibrant|bustling|nestled|breathtaking|stunning|hidden gem|must-visit|unforgettable|game-?changer|elevate|unlock|harness|leverage|robust|curated|meticulous)\b/gi, weight: 2.0, why: "中身のないLLM頻出語" },
    its_about: { re: /\bit(?:'s| is) (?:all )?about\b/gi, weight: 2.0, why: "「It's about〜」の締め" },
    filler_conn: { re: /\b(That said|What's more|Here's the thing)\b/gi, weight: 2.0, why: "つなぎの常套句" },
    empty_adverb: { re: /\b(truly|simply put|essentially|arguably|notably)\b/gi, weight: 1.0, why: "中身の薄い副詞" },
    rule_of_three: { re: /\b\w+, \w+,? and \w+\b/g, weight: 0.6, why: "3語並列。1記事2回までが目安" },
};

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const asJson = args.includes("--json");

const strip = (h) =>
    h.replace(/<(script|style|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, " ").trim();

async function get(url) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
}

/** 中国語ページかどうか。zh は `——` が正規の約物なので em ダッシュを咎めない */
const isZh = (url, html) => /\/zh\//.test(url || "") || /-zh\/?$/.test(url || "") || /<html[^>]+lang="zh/i.test(html);

function analyze(html, url) {
    const m = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const bodyHtml = m ? m[1] : html;
    const text = strip(bodyHtml);
    // 中国語は空白で語を区切らないので文字数を語数の代わりにする
    const zh = isZh(url, html);
    const words = zh ? Math.round(text.replace(/\s/g, "").length / 2) : text.split(/\s+/).filter(Boolean).length;
    if (words < 60) return null;

    const hits = {};
    for (const [k, t] of Object.entries(TELLS)) {
        if (k === "em_dash" && zh) continue; // 中国語の —— は正しい約物
        const n = (text.match(t.re) || []).length;
        if (n) hits[k] = n;
    }

    const paras = [...bodyHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((x) => strip(x[1]).split(/\s+/).filter(Boolean).length)
        .filter((n) => n > 5);
    let cv = 0;
    if (paras.length > 3) {
        const mean = paras.reduce((a, b) => a + b) / paras.length;
        const sd = Math.sqrt(paras.reduce((a, b) => a + (b - mean) ** 2, 0) / paras.length);
        cv = mean ? sd / mean : 0;
    }

    let score = 0;
    for (const [k, n] of Object.entries(hits)) score += (n / words) * 1000 * TELLS[k].weight;
    if (cv && cv < 0.45) score += 12; // 段落長が機械的に揃っている

    const title = strip((html.match(/<title>([\s\S]*?)<\/title>/i) || [, ""])[1]);
    const h2 = [...bodyHtml.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((x) => strip(x[1]));
    return {
        url, title, words, lang: zh ? "zh" : "latin", hits, cv: +cv.toFixed(2),
        endsWithFaq: /frequently asked/i.test(h2[h2.length - 1] || ""),
        score: +score.toFixed(1),
        pass: score <= 15 && !hits.em_dash,
    };
}

(async () => {
    let results = [];

    if (opt("--file")) {
        const fs = require("fs");
        const r = analyze(fs.readFileSync(opt("--file"), "utf8"), opt("--file"));
        results = r ? [r] : [];
    } else if (opt("--url")) {
        const u = opt("--url");
        const r = analyze(await get(u), u);
        results = r ? [r] : [];
    } else {
        const sm = await get(opt("--sitemap") || SITEMAP_DEFAULT);
        const urls = [...new Set([...sm.matchAll(/<loc>([^<]*\/posts\/[^<]*)<\/loc>/g)].map((x) => x[1]))].sort();
        if (!asJson) console.error(`記事 ${urls.length} 本を検査…\n`);
        for (let i = 0; i < urls.length; i += 6) {
            const batch = await Promise.all(urls.slice(i, i + 6).map(async (u) => {
                try { return analyze(await get(u), u); } catch { return null; }
            }));
            results.push(...batch.filter(Boolean));
        }
    }

    results.sort((a, b) => b.score - a.score);
    if (asJson) { console.log(JSON.stringify(results, null, 1)); return; }

    if (results.length > 1) {
        console.log("=".repeat(74));
        console.log("📊 兆候ごとの分布");
        console.log("=".repeat(74));
        for (const [k, t] of Object.entries(TELLS)) {
            const arts = results.filter((r) => r.hits[k]).length;
            const tot = results.reduce((a, r) => a + (r.hits[k] || 0), 0);
            if (!tot) continue;
            console.log(`  ${k.padEnd(16)}${String(arts).padStart(4)}本${String(tot).padStart(6)}回   ${t.why}`);
        }
        const flat = results.filter((r) => r.cv && r.cv < 0.45).length;
        const faq = results.filter((r) => r.endsWithFaq).length;
        console.log(`\n  段落長が均一: ${flat}/${results.length}本   FAQで終わる: ${faq}/${results.length}本`);
    }

    console.log();
    console.log("=".repeat(74));
    console.log(results.length > 1 ? "🚩 スコア上位（直す優先順）" : "🚩 判定");
    console.log("=".repeat(74));
    console.log(`  ${"score".padStart(6)} ${"語数".padStart(6)} ${"—".padStart(4)}  記事`);
    for (const r of results.slice(0, 25)) {
        const flag = r.pass ? "✅" : "❌";
        const slug = (r.url || "").replace(/^https?:\/\/[^/]+\/posts\//, "").slice(0, 44);
        console.log(`  ${flag}${String(r.score).padStart(5)} ${String(r.words).padStart(6)} ${String(r.hits.em_dash || 0).padStart(4)}  ${slug}`);
    }

    const failed = results.filter((r) => !r.pass).length;
    console.log(`\n  合格 ${results.length - failed} / ${results.length}本（基準: スコア15以下 かつ emダッシュ0）`);
    console.log(`  ルール: skills/human-copy-en.md\n`);
    process.exit(failed && results.length === 1 ? 1 : 0);
})();
