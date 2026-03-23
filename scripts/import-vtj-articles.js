#!/usr/bin/env node
/**
 * VanTripJapan 記事インポートスクリプト
 * site/posts/{slug}/index.html から記事データを抽出し
 * camjyo.com CMS API に site='vantrip', type='article' でインポートする
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const POSTS_DIR = path.join(__dirname, '..', 'site', 'posts');
const API_HOST = 'www.camjyo.com';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NDY4M2Q3MS0yZDEzLTQ5YTUtYTEyYy1iNTAzZjM2Y2ZiZjciLCJlbWFpbCI6ImthcmVuQGNhbWp5by5jb20iLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3NzQ4MzAzNDZ9.NjQ2ODNkNzEtMmQxMy00OWE1LWExMmMtYjUwM2YzNmNmYmY3MTc3NDIyNTU0NjM0Mw==';
const RESULTS_FILE = path.join(__dirname, 'vtj-import-results.json');

// ── HTML パーサー ──────────────────────────────────────────────

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
  // Prefer <h1 class="article-page-title">
  const h1 = html.match(/<h1[^>]*class="[^"]*article-page-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return h1[1].replace(/<[^>]+>/g, '').trim();
  // Fallback: <title> tag, strip " — VanTripJapan"
  const titleTag = html.match(/<title>([^<]+)<\/title>/i);
  if (titleTag) return titleTag[1].replace(/\s*[—\-]\s*VanTripJapan.*$/i, '').trim();
  return null;
}

function extractExcerpt(html) {
  // Prefer <p class="article-excerpt-text">
  const p = html.match(/<p[^>]*class="[^"]*article-excerpt-text[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  if (p) return p[1].replace(/<[^>]+>/g, '').trim().slice(0, 300);
  // Fallback: meta description
  const desc = extractMeta(html, 'description') || extractOgMeta(html, 'og:description');
  return desc ? desc.slice(0, 300) : '';
}

function extractBody(html) {
  // <article class="article-body">...</article>
  const m = html.match(/<article[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/article>/i);
  if (m) return m[1].trim();
  // Fallback: <article>
  const m2 = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  return m2 ? m2[1].trim() : '';
}

function extractCoverImage(html) {
  // og:image first
  const og = extractOgMeta(html, 'og:image');
  if (og) return og;
  // article-hero img
  const hero = html.match(/<div[^>]*class="[^"]*article-hero[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
  return hero ? hero[1] : '';
}

function extractCategory(html) {
  const m = html.match(/<span[^>]*class="[^"]*article-category-tag[^"]*"[^>]*>([^<]+)<\/span>/i);
  return m ? m[1].trim() : 'Guide';
}

function extractDate(html) {
  // <span class="article-date">2025.04.20</span>
  const d = html.match(/<span[^>]*class="[^"]*article-date[^"]*"[^>]*>([^<]+)<\/span>/i);
  if (d) {
    const raw = d[1].trim(); // e.g. "2026.03.20"
    return raw.replace(/\./g, '-').slice(0, 10);
  }
  // Fallback: JSON-LD datePublished
  const jld = html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  if (jld) return jld[1];
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

async function main() {
  // 既存結果の読み込み
  let results = { success: [], skipped: [], failed: [] };
  if (fs.existsSync(RESULTS_FILE)) {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
    console.log(`既存: 成功=${results.success.length}, スキップ=${results.skipped.length}, 失敗=${results.failed.length}`);
  }
  const done = new Set([...results.success, ...results.skipped]);

  // posts/ ディレクトリのスラッグ一覧（_template を除外）
  const slugs = fs.readdirSync(POSTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template.html' && !e.name.startsWith('_'))
    .map(e => e.name)
    .filter(s => !done.has(s))
    .sort();

  console.log(`\n=== VanTripJapan 記事インポート開始 ===`);
  console.log(`対象: ${slugs.length}件\n`);

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const fpath = path.join(POSTS_DIR, slug, 'index.html');

    process.stdout.write(`[${i + 1}/${slugs.length}] ${slug} ... `);

    if (!fs.existsSync(fpath)) {
      console.log('index.html なし → スキップ');
      results.skipped.push(slug);
      continue;
    }

    const html = fs.readFileSync(fpath, 'utf-8');

    const article = {
      slug,
      title: extractTitle(html) || slug,
      excerpt: extractExcerpt(html),
      body: extractBody(html),
      cover_image: extractCoverImage(html),
      category: extractCategory(html),
      published_at: extractDate(html),
      author: 'VanTripJapan',
      site: 'vantrip',
      type: 'article',
      status: 'published',
      tags: '',
    };

    if (!article.title || article.title === slug) {
      console.log('タイトル抽出失敗 → スキップ');
      results.failed.push({ slug, reason: 'title extraction failed' });
      continue;
    }

    try {
      const res = await apiPost('/api/articles', article);
      if (res.status === 200 || res.status === 201) {
        console.log(`✓`);
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
    await sleep(300);
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
