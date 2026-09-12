/**
 * Authenticated rental demand summary — GET /api/admin/demand-summary?days=90
 * Authentication is enforced by functions/api/_middleware.js.
 */

export async function onRequestGet({ request, env }) {
  if (!env?.CUSTOMERS_DB) {
    return Response.json({ error: 'Demand report unavailable' }, { status: 503 });
  }

  const requestedDays = Number.parseInt(new URL(request.url).searchParams.get('days') || '90', 10);
  const days = Math.min(365, Math.max(7, Number.isFinite(requestedDays) ? requestedDays : 90));
  const since = `-${days} days`;

  const [totals, months, dates, sources] = await Promise.all([
    env.CUSTOMERS_DB.prepare(`
      SELECT COUNT(*) AS searches,
             ROUND(AVG(rental_days), 1) AS average_rental_days,
             ROUND(AVG(lead_days), 1) AS average_lead_days,
             SUM(CASE WHEN availability_complete = 1 AND compatible_count > 0 AND available_count = 0 THEN 1 ELSE 0 END) AS sold_out_searches,
             SUM(CASE WHEN compatible_count = 0 THEN 1 ELSE 0 END) AS unsupported_party_searches,
             SUM(CASE WHEN availability_complete = 0 THEN 1 ELSE 0 END) AS unverified_searches
      FROM rental_searches WHERE searched_at >= datetime('now', ?)
    `).bind(since).first(),
    env.CUSTOMERS_DB.prepare(`
      SELECT substr(pickup_date, 1, 7) AS pickup_month,
             COUNT(*) AS searches,
             ROUND(AVG(rental_days), 1) AS average_rental_days,
             ROUND(AVG(available_count), 2) AS average_available_vehicles,
             SUM(CASE WHEN availability_complete = 1 AND compatible_count > 0 AND available_count = 0 THEN 1 ELSE 0 END) AS sold_out_searches,
             SUM(CASE WHEN compatible_count = 0 THEN 1 ELSE 0 END) AS unsupported_party_searches
      FROM rental_searches WHERE searched_at >= datetime('now', ?)
      GROUP BY pickup_month ORDER BY pickup_month
    `).bind(since).all(),
    env.CUSTOMERS_DB.prepare(`
      SELECT pickup_date, return_date, guests, COUNT(*) AS searches,
             SUM(CASE WHEN availability_complete = 1 AND compatible_count > 0 AND available_count = 0 THEN 1 ELSE 0 END) AS sold_out_searches,
             SUM(CASE WHEN compatible_count = 0 THEN 1 ELSE 0 END) AS unsupported_party_searches
      FROM rental_searches WHERE searched_at >= datetime('now', ?)
      GROUP BY pickup_date, return_date, guests
      ORDER BY searches DESC, pickup_date LIMIT 30
    `).bind(since).all(),
    env.CUSTOMERS_DB.prepare(`
      SELECT CASE WHEN utm_source <> '' THEN utm_source WHEN referrer_host <> '' THEN referrer_host ELSE '(direct)' END AS source,
             COUNT(*) AS searches
      FROM rental_searches WHERE searched_at >= datetime('now', ?)
      GROUP BY source ORDER BY searches DESC LIMIT 20
    `).bind(since).all()
  ]);

  return Response.json({
    period_days: days,
    totals: totals || {},
    pickup_months: months.results || [],
    top_date_ranges: dates.results || [],
    sources: sources.results || []
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
