import { isConsolidated } from './lib/consolidated.js';

/**
 * Public articles endpoint — bypasses /api/ middleware
 * GET /public-articles → Returns published VanTripJapan articles
 * 
 * This exists because /api/_middleware.js requires Cloudflare Access auth
 * for all /api/* routes not explicitly whitelisted. To avoid dependency
 * on middleware deploy cycles, this endpoint lives outside /api/.
 */

export async function onRequest(context) {
  const { request, env } = context;

  // Only allow GET
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const db = env.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 200);
    const category = url.searchParams.get('category') || '';
    const requestedLang = (url.searchParams.get('lang') || '').toLowerCase();
    const lang = ['en', 'fr', 'de', 'zh', 'he'].includes(requestedLang) ? requestedLang : '';

    const where = [
      "site = 'vantrip'",
      "status = 'published'",
      "published_at <= datetime('now')",
    ];
    const params = [];

    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (lang === 'en') {
      where.push("lower(COALESCE(tags, '')) NOT LIKE '%lang-fr%'");
      where.push("lower(COALESCE(tags, '')) NOT LIKE '%lang-de%'");
      where.push("lower(COALESCE(tags, '')) NOT LIKE '%lang-zh%'");
      where.push("lower(COALESCE(tags, '')) NOT LIKE '%lang-he%'");
    } else if (lang) {
      where.push("lower(COALESCE(tags, '')) LIKE ?");
      params.push(`%lang-${lang}%`);
    }
    params.push(limit);

    const query = `SELECT id, slug, title, excerpt, cover_image, category, published_at, tags
                   FROM articles
                   WHERE ${where.join(' AND ')}
                   ORDER BY published_at DESC
                   LIMIT ?`;

    const { results } = await db.prepare(query).bind(...params).all();

    return new Response(JSON.stringify((results || []).filter((a) => !isConsolidated(a.slug))), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
      },
    });
  } catch (e) {
    console.error('Public articles error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
