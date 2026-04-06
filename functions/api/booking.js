/**
 * Booking API — /api/booking
 * POST (public): Create new booking
 * GET (admin): List bookings (optional ?status= filter)
 * GET /api/booking?id=N (admin): Get single booking with documents
 * PUT (admin): Update booking status
 */

import { encrypt, decrypt } from './_crypto.js';

function ensureBookingBindings(env) {
  if (!env?.CUSTOMERS_DB) return 'Missing binding: CUSTOMERS_DB';
  if (!env?.ENCRYPTION_KEY) return 'Missing secret: ENCRYPTION_KEY';
  return null;
}

// POST: Public — create a new booking
async function handlePost(request, env) {
  const bindingError = ensureBookingBindings(env);
  if (bindingError) {
    return Response.json({ error: 'Booking service misconfigured', detail: bindingError }, { status: 500 });
  }

  const data = await request.json();

  // Validate required fields
  const required = ['email', 'full_name', 'pickup_datetime', 'return_datetime'];
  for (const field of required) {
    if (!data[field]?.trim()) {
      return Response.json({ error: `Missing: ${field}` }, { status: 400 });
    }
  }

  // Validate rental period consistency
  const pickup = new Date(data.pickup_datetime);
  const returns = new Date(data.return_datetime);
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(returns.getTime())) {
    return Response.json({ error: 'Invalid pickup/return datetime' }, { status: 400 });
  }
  if (returns <= pickup) {
    return Response.json({ error: 'return_datetime must be after pickup_datetime' }, { status: 400 });
  }

  // Encrypt PII fields
  const emailEnc = await encrypt(data.email.trim(), env);
  const phoneEnc = await encrypt(data.phone || null, env);
  const addressEnc = await encrypt(data.address || null, env);

  const result = await env.CUSTOMERS_DB.prepare(`
    INSERT INTO bookings (email_encrypted, full_name, phone_encrypted, address_encrypted,
      vehicle_type, pickup_datetime, return_datetime, num_drivers,
      referral_source, camping_gear_notes, translation_needed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    emailEnc,
    data.full_name.trim(),
    phoneEnc,
    addressEnc,
    data.vehicle_type || null,
    data.pickup_datetime,
    data.return_datetime,
    data.num_drivers || 1,
    data.referral_source || null,
    data.camping_gear_notes || null,
    data.translation_needed ? 1 : 0,
  ).run();

  return Response.json({ status: 'ok', booking_id: result.meta.last_row_id });
}

// GET: Admin — list bookings or get single booking
async function handleGet(request, env) {
  const bindingError = ensureBookingBindings(env);
  if (bindingError) {
    return Response.json({ error: 'Booking service misconfigured', detail: bindingError }, { status: 500 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (id) {
    // Single booking with documents
    const booking = await env.CUSTOMERS_DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
    if (!booking) return Response.json({ error: 'Not found' }, { status: 404 });

    // Decrypt PII
    booking.email = await decrypt(booking.email_encrypted, env);
    booking.phone = await decrypt(booking.phone_encrypted, env);
    booking.address = await decrypt(booking.address_encrypted, env);
    delete booking.email_encrypted;
    delete booking.phone_encrypted;
    delete booking.address_encrypted;

    // Get documents
    const docs = await env.CUSTOMERS_DB.prepare(
      'SELECT * FROM customer_documents WHERE booking_id = ? ORDER BY uploaded_at'
    ).bind(id).all();
    booking.documents = docs.results;

    return Response.json(booking);
  }

  // List bookings
  const status = url.searchParams.get('status');
  let query, params;

  if (status) {
    query = 'SELECT id, full_name, email_encrypted, vehicle_type, pickup_datetime, return_datetime, status, translation_needed, created_at FROM bookings WHERE status = ? ORDER BY created_at DESC';
    params = [status];
  } else {
    query = 'SELECT id, full_name, email_encrypted, vehicle_type, pickup_datetime, return_datetime, status, translation_needed, created_at FROM bookings ORDER BY created_at DESC';
    params = [];
  }

  const stmt = params.length > 0
    ? env.CUSTOMERS_DB.prepare(query).bind(...params)
    : env.CUSTOMERS_DB.prepare(query);

  const results = await stmt.all();

  // Decrypt emails for list view
  const bookings = await Promise.all(results.results.map(async (b) => {
    b.email = await decrypt(b.email_encrypted, env);
    delete b.email_encrypted;
    return b;
  }));

  return Response.json(bookings);
}

// PUT: Admin — update booking
async function handlePut(request, env, data) {
  const bindingError = ensureBookingBindings(env);
  if (bindingError) {
    return Response.json({ error: 'Booking service misconfigured', detail: bindingError }, { status: 500 });
  }

  const body = await request.json();
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

  if (body.status) {
    const validStatuses = ['form_submitted', 'docs_requested', 'docs_received', 'payment_sent', 'confirmed', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(body.status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 });
    }

    await env.CUSTOMERS_DB.prepare(
      "UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(body.status, id).run();

    // Log the status change
    const email = data?.userEmail || 'unknown';
    await env.CUSTOMERS_DB.prepare(
      'INSERT INTO access_logs (user_email, action, resource, detail) VALUES (?, ?, ?, ?)'
    ).bind(email, 'status_change', `booking/${id}`, `Status → ${body.status}`).run();

    return Response.json({ status: 'ok' });
  }

  return Response.json({ error: 'No valid update fields' }, { status: 400 });
}

export async function onRequest(context) {
  const { request, env, data } = context;

  switch (request.method) {
    case 'POST': return handlePost(request, env);
    case 'GET': return handleGet(request, env);
    case 'PUT': return handlePut(request, env, data);
    default:
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
}
