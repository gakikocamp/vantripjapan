/**
 * VanTripJapan — Articles API
 *
 * GET  /api/articles         — 公開記事一覧（認証不要）
 * POST /api/articles         — 記事作成（X-VTJ-API-Key ヘッダー必須）
 * PUT  /api/articles?slug=xx — 記事更新（X-VTJ-API-Key ヘッダー必須）
 */

const ALLOWED_CATEGORIES = [
  'Guide', 'Tips', 'Destination', 'Itinerary', 'Stories',
  'Culture', 'Food', 'Onsen', 'FAQ', 'Day Trip', 'How-To',
  'Guide 🇩🇪', 'Guide 🇫🇷', '指南 🇹🇼',
];

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 80);
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function corsHeaders(allowWrite = false) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': allowWrite ? 'GET, POST, PUT, OPTIONS' : 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-VTJ-API-Key',
  };
}

function authenticate(request, env) {
  const key = request.headers.get('X-VTJ-API-Key') || '';
  return key && key === env.VTJ_API_KEY;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(true), ...extraHeaders },
  });
}

// ─── GET ────────────────────────────────────────────────────────────────────

async function handleGet(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 200);
  const category = url.searchParams.get('category') || '';

  let query, params;
  if (category) {
    query = `
      SELECT id, slug, title, excerpt, cover_image, category, published_at
      FROM articles
      WHERE site = 'vantrip' AND status = 'published' AND category = ?
      ORDER BY published_at DESC, created_at DESC
      LIMIT ?
    `;
    params = [category, limit];
  } else {
    query = `
      SELECT id, slug, title, excerpt, cover_image, category, published_at
      FROM articles
      WHERE site = 'vantrip' AND status = 'published'
      ORDER BY published_at DESC, created_at DESC
      LIMIT ?
    `;
    params = [limit];
  }

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return new Response(JSON.stringify(results), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      ...corsHeaders(false),
    },
  });
}

// ─── POST ───────────────────────────────────────────────────────────────────

async function handlePost(request, env) {
  if (!authenticate(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { title, excerpt, body: articleBody, cover_image, category, published_at, tags } = body;

  // バリデーション
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return json({ error: 'title is required' }, 400);
  }
  if (!articleBody || typeof articleBody !== 'string' || articleBody.trim().length === 0) {
    return json({ error: 'body is required' }, 400);
  }

  const slug = body.slug ? String(body.slug) : slugify(title);
  if (!slug) return json({ error: 'Could not generate slug from title' }, 400);

  // スラッグ重複チェック
  const existing = await env.DB.prepare(
    `SELECT id FROM articles WHERE site = 'vantrip' AND slug = ?`
  ).bind(slug).first();
  if (existing) {
    return json({ error: `Slug already exists: ${slug}` }, 409);
  }

  const now = new Date().toISOString();
  const pubDate = published_at || now.slice(0, 10);
  const cat = ALLOWED_CATEGORIES.includes(category) ? category : 'Guide';

  await env.DB.prepare(`
    INSERT INTO articles
      (id, slug, title, excerpt, body, cover_image, category, published_at, created_at, updated_at, site, status, author, type, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'vantrip', 'published', 'VanTripJapan', 'article', ?)
  `).bind(
    uuid(),
    slug,
    title.trim(),
    (excerpt || '').trim(),
    articleBody.trim(),
    cover_image || '',
    cat,
    pubDate,
    now,
    now,
    tags || '',
  ).run();

  return json({
    ok: true,
    slug,
    url: `https://vantripjapan.jp/posts/${slug}/`,
  }, 201);
}

// ─── PUT ────────────────────────────────────────────────────────────────────

async function handlePut(request, env) {
  if (!authenticate(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return json({ error: 'slug query param required' }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM articles WHERE site = 'vantrip' AND slug = ?`
  ).bind(slug).first();
  if (!existing) return json({ error: `Article not found: ${slug}` }, 404);

  const now = new Date().toISOString();
  const fields = [];
  const values = [];

  if (body.title)        { fields.push('title = ?');        values.push(body.title.trim()); }
  if (body.excerpt)      { fields.push('excerpt = ?');      values.push(body.excerpt.trim()); }
  if (body.body)         { fields.push('body = ?');         values.push(body.body.trim()); }
  if (body.cover_image)  { fields.push('cover_image = ?');  values.push(body.cover_image); }
  if (body.category)     { fields.push('category = ?');     values.push(body.category); }
  if (body.published_at) { fields.push('published_at = ?'); values.push(body.published_at); }
  if (body.tags != null) { fields.push('tags = ?');         values.push(body.tags); }
  if (body.status)       { fields.push('status = ?');       values.push(body.status); }

  if (fields.length === 0) return json({ error: 'No fields to update' }, 400);

  fields.push('updated_at = ?');
  values.push(now);
  values.push(slug);

  await env.DB.prepare(
    `UPDATE articles SET ${fields.join(', ')} WHERE site = 'vantrip' AND slug = ?`
  ).bind(...values).run();

  return json({
    ok: true,
    slug,
    url: `https://vantripjapan.jp/posts/${slug}/`,
  });
}

// ─── Router ─────────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(true) });
  }

  try {
    if (method === 'GET')  return await handleGet(request, env);
    if (method === 'POST') return await handlePost(request, env);
    if (method === 'PUT')  return await handlePut(request, env);

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: 'Server error', detail: err.message }, 500);
  }
}
