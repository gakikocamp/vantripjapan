#!/usr/bin/env node
/**
 * camjyo.com マガジン記事インポートスクリプト
 * camjyo.com/magazine/post/* からHTMLを取得してD1にインポートする
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_HOST = 'www.camjyo.com';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NDY4M2Q3MS0yZDEzLTQ5YTUtYTEyYy1iNTAzZjM2Y2ZiZjciLCJlbWFpbCI6ImthcmVuQGNhbWp5by5jb20iLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3NzQ4MzAzNDZ9.NjQ2ODNkNzEtMmQxMy00OWE1LWExMmMtYjUwM2YzNmNmYmY3MTc3NDIyNTU0NjM0Mw==';
const RESULTS_FILE = path.join(__dirname, 'camjyo-magazine-import-results.json');

// camjyo.com の magazine posts（/magazine/ページから取得した27件）
const MAGAZINE_SLUGS = [
  '20250318_kobe_harusai01',
  '302',
  '304',
  '308',
  '311',
  '316',
  '322',
  '323',
  '325',
  '326',
  '332',
  'asakuracamp',
  'bosai_camp_2025',
  'bousai2024',
  'degital_nomad2025',
  'fukuoka_camp_bus_2024',
  'fukuoka_growth_next_camp',
  'goto_camp_2025',
  'goto_camp_event_report',
  'itooshima_camp_report',
  'osoroi_camp',
  'outdoor-park-uminaka-2025',
  'outdoor_living',
  'outdoor_style',
  'photo_contest_2025',
  'snowpeak-grounds-yoshinogari',
  'uminaka2025',
];

// ── HTML フェッチ ─────────────────────────────────────────────────

function fetchUrl(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VTJ-Importer/1.0)' },
    };
    const req = https.request(options, (res) => {
      // リダイレクト対応
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(new URL(res.headers.location, urlStr).toString()).then(resolve).catch(reject);
      }
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.end();
  });
}

// ── HTML パーサー ──────────────────────────────────────────────────

function extractMeta(html, name) {
  const m = html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]+)"`, 'i'));
  if (m) return m[1];
  const m2 = html.match(new RegExp(`<meta\\s+content="([^"]+)"\\s+name="${name}"`, 'i'));
  return m2 ? m2[1] : null;
}

function extractOgMeta(html, prop) {
  const m = html.match(new RegExp(`<meta\\s+property="${prop}"\\s+content="([^"]+)"`, 'i'));
  if (m) return m[1];
  const m2 = html.match(new RegExp(`<meta\\s+content="([^"]+)"\\s+property="${prop}"`, 'i'));
  return m2 ? m2[1] : null;
}

function extractTitle(html) {
  // og:title
  const og = extractOgMeta(html, 'og:title');
  if (og && og.length > 5) return og.replace(/\s*[|｜—\-]\s*キャンプ女子.*$/i, '').trim();
  // <title>タグ
  const t = html.match(/<title>([^<]+)<\/title>/i);
  if (t) return t[1].replace(/\s*[|｜—\-]\s*キャンプ女子.*$/i, '').trim();
  return null;
}

function extractExcerpt(html) {
  const desc = extractMeta(html, 'description') || extractOgMeta(html, 'og:description');
  if (desc) return desc.slice(0, 300);
  // <p>の最初の文章
  const p = html.match(/<p[^>]*>([^<]{30,})<\/p>/i);
  return p ? p[1].trim().slice(0, 300) : '';
}

function extractBody(html) {
  // article タグ
  const art = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (art) return art[1].trim();
  // main タグ
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1].trim();
  // .content, .post-content, .entry-content など
  const content = html.match(/<div[^>]*class="[^"]*(?:content|entry|post-body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  return content ? content[1].trim() : '';
}

function extractCoverImage(html, baseUrl) {
  const og = extractOgMeta(html, 'og:image');
  if (og) {
    // 相対URLを絶対URLに変換
    if (og.startsWith('http')) return og;
    return new URL(og, baseUrl).toString();
  }
  // 最初の img タグ
  const img = html.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
  if (img) {
    const src = img[1];
    if (src.startsWith('http')) return src;
    return new URL(src, baseUrl).toString();
  }
  return '';
}

function extractDate(html) {
  // JSON-LD datePublished
  const jld = html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  if (jld) return jld[1];
  // <time datetime="">
  const time = html.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/i);
  if (time) return time[1];
  // 日付パターン（例：2025年3月18日）
  const jp = html.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (jp) return `${jp[1]}-${jp[2].padStart(2,'0')}-${jp[3].padStart(2,'0')}`;
  return '2025-01-01';
}

function extractCategory(html) {
  // カテゴリーリンク
  const cat = html.match(/<[^>]*class="[^"]*(?:category|tag|genre)[^"]*"[^>]*>([^<]{1,30})<\/[a-z]+>/i);
  if (cat) return cat[1].trim();
  return 'マガジン';
}

// ── API ──────────────────────────────────────────────────────────

function apiPost(endpoint, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: API_HOST,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Cookie': `cms_token=${JWT_TOKEN}`,
      },
    };
    const req = https.request(options, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── メイン ────────────────────────────────────────────────────────

async function main() {
  let results = { success: [], skipped: [], failed: [] };
  if (fs.existsSync(RESULTS_FILE)) {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
    console.log(`既存: 成功=${results.success.length}, スキップ=${results.skipped.length}, 失敗=${results.failed.length}`);
  }
  const done = new Set([...results.success, ...results.skipped]);

  const slugs = MAGAZINE_SLUGS.filter(s => !done.has(s));

  console.log(`\n=== camjyo.com マガジンインポート開始 ===`);
  console.log(`対象: ${slugs.length}件\n`);

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const articleUrl = `https://www.camjyo.com/magazine/post/${slug}`;

    process.stdout.write(`[${i + 1}/${slugs.length}] ${slug} ... `);

    let html;
    try {
      const res = await fetchUrl(articleUrl);
      if (res.status !== 200) {
        console.log(`HTTP ${res.status} → スキップ`);
        results.failed.push({ slug, reason: `HTTP ${res.status}` });
        continue;
      }
      html = res.body;
    } catch (err) {
      console.log(`フェッチエラー: ${err.message}`);
      results.failed.push({ slug, reason: err.message });
      continue;
    }

    const title = extractTitle(html);
    if (!title || title.length < 3) {
      console.log('タイトル抽出失敗 → スキップ');
      results.failed.push({ slug, reason: 'title extraction failed' });
      continue;
    }

    const article = {
      slug: `magazine-${slug}`,  // camjyo magazine スラッグ prefix
      title,
      excerpt: extractExcerpt(html),
      body: extractBody(html),
      cover_image: extractCoverImage(html, articleUrl),
      category: extractCategory(html),
      published_at: extractDate(html),
      author: 'キャンプ女子編集部',
      site: 'camjyo',
      type: 'magazine',
      status: 'published',
      tags: '',
      original_url: articleUrl,
    };

    try {
      const res = await apiPost('/api/articles', article);
      if (res.status === 200 || res.status === 201) {
        console.log(`✓ "${title.slice(0, 30)}"`);
        results.success.push(slug);
      } else if (res.status === 409) {
        console.log(`既存`);
        results.skipped.push(slug);
      } else {
        const detail = typeof res.body === 'string' ? res.body.slice(0, 120) : JSON.stringify(res.body).slice(0, 120);
        console.log(`✗ ${res.status}: ${detail}`);
        results.failed.push({ slug, status: res.status, body: res.body });
      }
    } catch (err) {
      console.log(`✗ ${err.message}`);
      results.failed.push({ slug, reason: err.message });
    }

    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    await sleep(500);
  }

  console.log(`\n=== 完了 ===`);
  console.log(`成功: ${results.success.length}件`);
  console.log(`スキップ: ${results.skipped.length}件`);
  console.log(`失敗: ${results.failed.length}件`);
  if (results.failed.length > 0) {
    results.failed.forEach(f => console.log(`  - ${f.slug}: ${f.reason || JSON.stringify(f.body || '').slice(0, 80)}`));
  }
}

main().catch(console.error);
