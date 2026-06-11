/**
 * Availability API — /api/availability (public, read-only, no PII)
 *
 * GET /api/availability
 *   → { vehicles: { "MAZDA BONGO": [{from,to}], ... } }  booked ranges (next 6 months)
 *
 * GET /api/availability?vehicle=TOYOTA%20PROBOX&from=2026-07-01&to=2026-07-08
 *   → { available: true|false, conflicts: [{from,to}] }
 *
 * A vehicle is considered booked while a booking is in an active pipeline
 * status. New unreviewed requests (form_submitted) do NOT block dates, so
 * spam/duplicate requests can't hide availability.
 */

const BLOCKING_STATUSES = ['docs_requested', 'docs_received', 'payment_sent', 'confirmed', 'active'];

export async function onRequestGet({ request, env }) {
  if (!env?.CUSTOMERS_DB) {
    return Response.json({ error: 'Availability service misconfigured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const vehicle = url.searchParams.get('vehicle');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const placeholders = BLOCKING_STATUSES.map(() => '?').join(',');
  const cacheHeaders = { 'Cache-Control': 'public, max-age=300' };

  // Specific availability check for one vehicle + date range
  if (vehicle && from && to) {
    if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
      return Response.json({ error: 'Invalid from/to date' }, { status: 400 });
    }
    const rows = await env.CUSTOMERS_DB.prepare(`
      SELECT pickup_datetime AS pickup, return_datetime AS dropoff
      FROM bookings
      WHERE vehicle_type = ?
        AND status IN (${placeholders})
        AND pickup_datetime < ?
        AND return_datetime > ?
      ORDER BY pickup_datetime
    `).bind(vehicle, ...BLOCKING_STATUSES, to, from).all();

    const conflicts = rows.results.map(r => ({
      from: String(r.pickup).slice(0, 10),
      to: String(r.dropoff).slice(0, 10),
    }));
    return Response.json({ available: conflicts.length === 0, conflicts }, { headers: cacheHeaders });
  }

  // Overview: booked ranges per vehicle for the next 6 months (dates only, no PII)
  const rows = await env.CUSTOMERS_DB.prepare(`
    SELECT vehicle_type AS vehicle, pickup_datetime AS pickup, return_datetime AS dropoff
    FROM bookings
    WHERE status IN (${placeholders})
      AND return_datetime >= datetime('now')
      AND pickup_datetime <= datetime('now', '+6 months')
    ORDER BY pickup_datetime
  `).bind(...BLOCKING_STATUSES).all();

  const vehicles = {};
  for (const r of rows.results) {
    const key = r.vehicle || 'UNKNOWN';
    (vehicles[key] = vehicles[key] || []).push({
      from: String(r.pickup).slice(0, 10),
      to: String(r.dropoff).slice(0, 10),
    });
  }
  return Response.json({ vehicles }, { headers: cacheHeaders });
}
