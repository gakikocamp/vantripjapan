/**
 * VanTripJapan — Public Articles API
 * GET /api/articles — returns published vantrip articles ordered by date (newest first)
 * No authentication required (public read-only)
 */

export async function onRequest(context) {
  const { request, env } = context;

  // CORS headers for same-origin and subdomains
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 200);
  const category = url.searchParams.get('category') || '';

  try {
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
        ...corsHeaders,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Database error', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
