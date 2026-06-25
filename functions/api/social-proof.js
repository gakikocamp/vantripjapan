/**
 * Social Proof API — /api/social-proof
 * Tracks anonymous active page views and queries recent real bookings.
 */

function normalizeVehicle(name) {
  if (!name) return '';
  const upper = name.toUpperCase();
  if (upper.includes('PROBOX')) return 'TOYOTA PROBOX';
  if (upper.includes('BONGO')) return 'MAZDA BONGO';
  if (upper.includes('LOFT') || upper.includes('DAIHATSU')) return 'DAIHATSU POCKET LOFT';
  return name;
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS page_views (
      session_id TEXT PRIMARY KEY,
      vehicle_type TEXT NOT NULL,
      page TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_page_views_updated ON page_views(updated_at)
  `).run();
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.CUSTOMERS_DB;

  if (!db) {
    return Response.json({ error: 'Database binding missing' }, { status: 500 });
  }

  // Ensure database table is created
  await ensureTable(db).catch(e => console.error('[Social Proof Table Error]', e));

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const rawVehicle = url.searchParams.get('vehicle');
    if (!rawVehicle) {
      return Response.json({ error: 'Missing vehicle' }, { status: 400 });
    }
    const vehicle = normalizeVehicle(rawVehicle);

    try {
      // 1) Clean up old views (older than 30 minutes)
      await db.prepare(`
        DELETE FROM page_views 
        WHERE updated_at < datetime('now', '-30 minutes')
      `).run();

      // 2) Get active viewers count
      const viewersResult = await db.prepare(`
        SELECT COUNT(*) as count 
        FROM page_views 
        WHERE vehicle_type = ? AND updated_at >= datetime('now', '-30 minutes')
      `).bind(vehicle).first();

      // 3) Get recent bookings count (last 7 days)
      const bookingsResult = await db.prepare(`
        SELECT COUNT(*) as count 
        FROM bookings 
        WHERE vehicle_type = ? AND created_at >= datetime('now', '-7 days')
      `).bind(vehicle).first();

      return Response.json({
        active_viewers: viewersResult ? viewersResult.count : 0,
        recent_bookings: bookingsResult ? bookingsResult.count : 0
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
        }
      });
    } catch (err) {
      return Response.json({ error: 'Database error', detail: err.message }, { status: 500 });
    }
  }

  if (request.method === 'POST') {
    try {
      const data = await request.json();
      const { vehicle: rawVehicle, page, session_id } = data;

      if (!rawVehicle || !page || !session_id) {
        return Response.json({ error: 'Missing parameters' }, { status: 400 });
      }
      const vehicle = normalizeVehicle(rawVehicle);

      await db.prepare(`
        INSERT OR REPLACE INTO page_views (session_id, vehicle_type, page, updated_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(session_id, vehicle, page).run();

      return Response.json({ status: 'ok' });
    } catch (err) {
      return Response.json({ error: 'Database error', detail: err.message }, { status: 500 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
}
