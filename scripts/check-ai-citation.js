#!/usr/bin/env node
/**
 * 🔭 AI検索・オーガニックでの露出を定点観測する
 *
 *   node scripts/check-ai-citation.js
 *
 * なぜ要るか（2026-07-28の実測）:
 *   道の駅高千穂のクエリで、当サイトがオーガニック1位に出ているのに、AIの回答は
 *   それを引用せず Wikipedia の一般論から「この駅は禁止」と捏造していた。
 *   対策（駅名を主語にした自己完結の断定文・JSON-LDへの判定の埋め込み）を打ったので、
 *   効いたかどうかを同じ条件で測り直す必要がある。
 *
 * 何を測るか:
 *   - 各クエリでの vantripjapan.jp の順位（出ていないなら「圏外」）
 *   - どのドメインが上位を占めているか（＝AIが引用しやすい相手）
 *   - 結果を logs/ai-citation/ にJSONで残し、前回との差分を表示する
 *
 * 測れないもの（正直に）:
 *   AI要約そのものの文面はブラウザでないと取れない。スクリプトは「順位」までを担当し、
 *   「AIが何と答えたか」は最後に出る手順に沿って目視すること。ここが本丸なので省略しない。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOG_DIR = path.join(ROOT, "logs", "ai-citation");
const TARGET = "vantripjapan.jp";

/** 実測で捏造が起きた駅・クエリを含める。ここを減らすと比較にならないので減らさないこと */
const QUERIES = [
    { q: "Can you sleep overnight at Michi-no-Eki Takachiho", note: "AIが「禁止」と捏造した駅" },
    { q: "Michi-no-Eki Akune overnight parking allowed", note: "AIが逆に「可」と断定した駅" },
    { q: "michi no eki overnight parking allowed Kyushu", note: "一般クエリ" },
    { q: "Is car camping legal at Japanese roadside stations", note: "上流クエリ（ピラーの標的）" },
    { q: "is it legal to sleep in your car in Japan", note: "上流クエリ（ピラーの標的）" },
    { q: "which michi no eki ban overnight parking", note: "禁止リスト（独自の数字の標的）" },
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; }
}

/** DuckDuckGo の HTML 版から結果URLを順番に取り出す */
async function search(q) {
    const res = await fetch("https://html.duckduckgo.com/html/", {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ q }).toString(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const hosts = [];
    for (const m of html.matchAll(/class="result__a"[^>]*href="([^"]+)"/g)) {
        let u = m[1];
        // DDG のリダイレクタから実URLを取り出す
        const dec = u.match(/[?&]uddg=([^&]+)/);
        if (dec) u = decodeURIComponent(dec[1]);
        const h = hostOf(u);
        if (h && !hosts.some((x) => x.host === h)) hosts.push({ host: h, url: u });
    }
    return hosts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    console.log("\n🔭 AI検索・オーガニック定点観測\n");
    const stamp = new Date().toISOString().slice(0, 10);
    const results = [];

    for (const { q, note } of QUERIES) {
        process.stdout.write(`  「${q}」\n`);
        let hosts = [];
        let error = null;
        try {
            hosts = await search(q);
        } catch (e) {
            error = String(e.message || e);
        }
        const rank = hosts.findIndex((h) => h.host.endsWith(TARGET));
        const hit = rank >= 0;
        const url = hit ? hosts[rank].url : null;

        if (error) {
            console.log(`     ⚠️  取得失敗: ${error}\n`);
        } else {
            console.log(`     ${hit ? `✅ ${TARGET} は ${rank + 1}位` : `❌ ${TARGET} は圏外`}${hit && url ? `  ${url.replace(/^https?:\/\/[^/]+/, "")}` : ""}`);
            console.log(`     上位: ${hosts.slice(0, 5).map((h) => h.host).join(" / ") || "(なし)"}`);
            console.log(`     ↳ ${note}\n`);
        }
        results.push({ query: q, note, rank: hit ? rank + 1 : null, url, top: hosts.slice(0, 8).map((h) => h.host), error });
        await sleep(2500); // 連続アクセスを避ける
    }

    // ── 前回との差分 ────────────────────────────────────────
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const prevFile = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith(".json")).sort().pop();
    if (prevFile) {
        const prev = JSON.parse(fs.readFileSync(path.join(LOG_DIR, prevFile), "utf8"));
        console.log(`\n📊 前回（${prev.date}）との差分\n`);
        for (const r of results) {
            const p = (prev.results || []).find((x) => x.query === r.query);
            if (!p) continue;
            const a = p.rank, b = r.rank;
            if (a === b) continue;
            const fmt = (v) => (v == null ? "圏外" : `${v}位`);
            const better = b != null && (a == null || b < a);
            console.log(`  ${better ? "⬆️" : "⬇️"} ${fmt(a)} → ${fmt(b)}  「${r.query}」`);
        }
    }

    const out = path.join(LOG_DIR, `${stamp}.json`);
    fs.writeFileSync(out, JSON.stringify({ date: stamp, target: TARGET, results }, null, 2) + "\n");
    console.log(`\n💾 記録: ${out.replace(ROOT + "/", "")}`);

    // ── 人がやる部分 ────────────────────────────────────────
    console.log(`
────────────────────────────────────────────────────────
ここからは目視（スクリプトでは取れません）

  1. ブラウザで下を開く
     https://duckduckgo.com/?q=Can+you+sleep+overnight+at+Michi-no-Eki+Takachiho

  2. 検索結果の一番上に出る AI の要約を読む

  3. 判定
     ✅ 成功 … vantripjapan.jp を引用している／「禁止ではない」と正しく答えている
     ❌ 未達 … Wikipedia等を引用している／「泊まれない」と答えている

  2026-07-28時点では ❌ でした（1位に表示しながら引用せず、Wikipediaから
  「この駅は禁止」と捏造）。ここが ✅ に変われば対策が効いたということです。
────────────────────────────────────────────────────────
`);
})();
