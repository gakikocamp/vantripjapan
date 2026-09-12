/**
 * Authenticated booking-value summary — GET /api/admin/revenue-summary?year=2026
 *
 * Confirmed/active/completed bookings represent payment-verified bookings in the
 * current workflow. Values are operational booking value, not accounting revenue:
 * refunds, payment fees and operating costs are not stored in this table.
 */

const COUNTED_STATUSES = "'confirmed','active','completed'";

export async function onRequestGet({ request, env }) {
  if (!env?.CUSTOMERS_DB) {
    return Response.json({ error: 'Revenue report unavailable' }, { status: 503 });
  }

  const currentYear = new Date().getUTCFullYear();
  const requestedYear = Number.parseInt(new URL(request.url).searchParams.get('year') || String(currentYear), 10);
  const year = Number.isInteger(requestedYear) && requestedYear >= 2020 && requestedYear <= 2100
    ? requestedYear
    : currentYear;
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;

  const [totals, months] = await Promise.all([
    env.CUSTOMERS_DB.prepare(`
      SELECT COUNT(*) AS bookings,
             COALESCE(SUM(estimated_total), 0) AS booked_value,
             COALESCE(SUM(CASE WHEN status = 'completed' THEN estimated_total ELSE 0 END), 0) AS completed_value,
             COALESCE(SUM(CASE WHEN status IN ('confirmed','active') THEN estimated_total ELSE 0 END), 0) AS upcoming_value,
             COALESCE(SUM(MAX(1, CAST(julianday(return_datetime) - julianday(pickup_datetime) + 0.999999 AS INTEGER))), 0) AS rental_days,
             ROUND(AVG(estimated_total), 0) AS average_booking_value
      FROM bookings
      WHERE status IN (${COUNTED_STATUSES})
        AND pickup_datetime >= ? AND pickup_datetime < ?
    `).bind(from, to).first(),
    env.CUSTOMERS_DB.prepare(`
      SELECT substr(pickup_datetime, 1, 7) AS pickup_month,
             COUNT(*) AS bookings,
             COALESCE(SUM(estimated_total), 0) AS booked_value,
             COALESCE(SUM(MAX(1, CAST(julianday(return_datetime) - julianday(pickup_datetime) + 0.999999 AS INTEGER))), 0) AS rental_days
      FROM bookings
      WHERE status IN (${COUNTED_STATUSES})
        AND pickup_datetime >= ? AND pickup_datetime < ?
      GROUP BY pickup_month ORDER BY pickup_month
    `).bind(from, to).all()
  ]);

  const target = 20_000_000;
  const bookedValue = Number(totals?.booked_value || 0);
  return Response.json({
    year,
    target,
    target_progress_percent: Math.round((bookedValue / target) * 1000) / 10,
    target_gap: Math.max(0, target - bookedValue),
    totals: totals || {},
    pickup_months: months.results || [],
    basis: 'confirmed_active_completed_booking_value'
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
