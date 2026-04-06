/**
 * Admin Dashboard API — /api/admin-dashboard
 * GET (admin): Dashboard statistics
 */

export async function onRequestGet(context) {
  const { env } = context;
  if (!env?.CUSTOMERS_DB) {
    return Response.json(
      { error: 'Admin dashboard misconfigured', detail: 'Missing binding: CUSTOMERS_DB' },
      { status: 500 }
    );
  }
  const db = env.CUSTOMERS_DB;

  // Booking counts by status
  const statusCounts = await db.prepare(
    'SELECT status, COUNT(*) as count FROM bookings GROUP BY status'
  ).all();

  const byStatus = {};
  for (const row of statusCounts.results) {
    byStatus[row.status] = row.count;
  }

  // Total bookings
  const totalBookings = Object.values(byStatus).reduce((a, b) => a + b, 0);

  // Unverified documents count
  const unverified = await db.prepare(
    'SELECT COUNT(*) as count FROM customer_documents WHERE verified = 0'
  ).first();

  // Total documents
  const totalDocs = await db.prepare(
    'SELECT COUNT(*) as count FROM customer_documents'
  ).first();

  // Recent bookings (last 10)
  const recent = await db.prepare(
    'SELECT id, full_name, vehicle_type, pickup_datetime, return_datetime, status, created_at FROM bookings ORDER BY created_at DESC LIMIT 10'
  ).all();

  return Response.json({
    total_bookings: totalBookings,
    bookings_by_status: byStatus,
    unverified_docs: unverified?.count || 0,
    total_docs: totalDocs?.count || 0,
    recent_bookings: recent.results,
  });
}
