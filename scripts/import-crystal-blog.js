#!/usr/bin/env node
/**
 * Crystal Insence ブログ・ニュース記事インポートスクリプト
 * ローカル HTML から D1 にインポート
 * site='crystal', type='blog' or 'news'
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const CRYSTAL_DIR = path.join(
  require('os').homedir(),
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/SecondGaki/CRYSTAL BLOG/website'
);
const API_HOST = 'www.camjyo.com';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NDY4M2Q3MS0yZDEzLTQ5YTUtYTEyYy1iNTAzZjM2Y2ZiZjciLCJlbWFpbCI6ImthcmVuQGNhbWp5by5jb20iLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3NzQ4MzAzNDZ9.NjQ2ODNkNzEtMmQxMy00OWE1LWExMmMtYjUwM2YzNmNmYmY3MTc3NDIyNTU0NjM0Mw==';
const RESULTS_FILE = path.join(__dirname, 'crystal-import-results.json');

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
  const og = extractOgMeta(html, 'og:title');
  if (og && og.length > 5) return og.replace(/\s*[|｜—\-]\s*CRYSTAL INSENCE.*/i, '').trim();
  const t = html.match(/<title>([^<]+)<\/title>/i);
  if (t) return t[1].replace(/\s*[|｜—\-]\s*CRYSTAL INSENCE.*/i, '').trim();
  return null;
}

function extractExcerpt(html) {
  const desc = extractMeta(html, 'description') || extractOgMeta(html, 'og:description');
  if (desc) return desc.slice(0, 300);
  const p = html.match(/<p[^>]*>([^<]{30,})<\/p>/i);
  return p ? p[1].trim().slice(0, 300) : '';
}

function extractBody(html) {
  const art = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (art) return art[1].trim();
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1].trim();
  return '';
}

function extractCoverImage(html) {
  const og = extractOgMeta(html, 'og:image');
  if (og) return og;
  return '';
}

function extractDate(html) {
  const jld = html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  if (jld) return jld[1];
  const time = html.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/i);
  if (time) return time[1];
  return '2026-01-01';
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

async function importDir(dirPath, type, results) {
  const done = new Set([...results.success, ...results.skipped]);

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => ({ file: f, slug: f.replace('.html', '') }))
    .filter(({ slug }) => !done.has(`crystal-${type}-${slug}`));

  for (let i = 0; i < files.length; i++) {
    const { file, slug } = files[i];
    const fullSlug = `crystal-${type}-${slug}`;

    process.stdout.write(`  [${i + 1}/${files.length}] ${slug} ... `);

    const html = fs.readFileSync(path.join(dirPath, file), 'utf-8');
    const title = extractTitle(html);

    if (!title || title.length < 3) {
      console.log('タイトル抽出失敗 → スキップ');
      results.failed.push({ slug: fullSlug, reason: 'title extraction failed' });
      continue;
    }

    const article = {
      slug: fullSlug,
      title,
      excerpt: extractExcerpt(html),
      body: extractBody(html),
      cover_image: extractCoverImage(html),
      category: type === 'blog' ? 'コラム' : 'ニュース',
      published_at: extractDate(html),
      author: 'CRYSTAL INSENCE',
      site: 'crystal',
      type,
      status: 'published',
      tags: '',
      original_url: `https://crystalinsence.com/${type}/${slug}/`,
    };

    try {
      const res = await apiPost('/api/articles', article);
      if (res.status === 200 || res.status === 201) {
        console.log(`✓ "${title.slice(0, 30)}"`);
        results.success.push(fullSlug);
      } else if (res.status === 409) {
        console.log(`既存`);
        results.skipped.push(fullSlug);
      } else {
        const detail = typeof res.body === 'string' ? res.body.slice(0, 100) : JSON.stringify(res.body).slice(0, 100);
        console.log(`✗ ${res.status}: ${detail}`);
        results.failed.push({ slug: fullSlug, status: res.status });
      }
    } catch (err) {
      console.log(`✗ ${err.message}`);
      results.failed.push({ slug: fullSlug, reason: err.message });
    }

    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    await sleep(400);
  }
}

async function main() {
  let results = { success: [], skipped: [], failed: [] };
  if (fs.existsSync(RESULTS_FILE)) {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
    console.log(`既存: 成功=${results.success.length}, スキップ=${results.skipped.length}, 失敗=${results.failed.length}`);
  }

  console.log('\n=== Crystal Insence インポート開始 ===\n');

  console.log('── ブログ記事 ──');
  await importDir(path.join(CRYSTAL_DIR, 'blog'), 'blog', results);

  console.log('\n── ニュース ──');
  await importDir(path.join(CRYSTAL_DIR, 'news'), 'news', results);

  console.log(`\n=== 完了 ===`);
  console.log(`成功: ${results.success.length}件`);
  console.log(`スキップ: ${results.skipped.length}件`);
  console.log(`失敗: ${results.failed.length}件`);
  if (results.failed.length > 0) {
    results.failed.forEach(f => console.log(`  - ${f.slug}: ${f.reason || f.status}`));
  }
}

main().catch(console.error);
