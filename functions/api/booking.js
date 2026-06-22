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

  const status = data.status || 'form_submitted';
  const gearNotes = data.num_guests
    ? `[Guests: ${data.num_guests}] ${data.camping_gear_notes || ''}`
    : data.camping_gear_notes || null;

  const result = await env.CUSTOMERS_DB.prepare(`
    INSERT INTO bookings (email_encrypted, full_name, phone_encrypted, address_encrypted,
      vehicle_type, pickup_datetime, return_datetime, num_drivers,
      referral_source, camping_gear_notes, translation_needed, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    gearNotes,
    data.translation_needed ? 1 : 0,
    status
  ).run();

  const bookingId = result.meta.last_row_id;

  // Fire-and-forget notifications (never block or fail the booking on email errors)
  await sendBookingEmails(data, bookingId, env).catch((e) => console.error('[Booking Mail]', e?.message));

  return Response.json({ status: 'ok', booking_id: bookingId });
}

// Send confirmation to the customer + alert to the VanTripJapan inbox (Resend API)
async function sendBookingEmails(data, bookingId, env) {
  const name = (data.full_name || '').trim() || 'there';
  const email = (data.email || '').trim();
  const vehicle = data.vehicle_type || 'Campervan';
  const pickup = data.pickup_datetime || '—';
  const ret = data.return_datetime || '—';
  const waLink = "https://wa.me/817093757129?text=" +
    encodeURIComponent(`Hi Karen! I just submitted booking request #${bookingId}.`);

  const resendApiKey = env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('Missing env.RESEND_API_KEY. Booking email notifications skipped.');
    return;
  }

  const sendResend = async (payload) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend API failed: ${errText}`);
    }
    return res.json();
  };

  // 1) Customer confirmation — reassurance + WhatsApp, no payment/docs yet
  const customerBody = [
    `Hi ${name},`,
    ``,
    `Thank you for your booking request with VanTripJapan! 🚐`,
    ``,
    `We've received your request (ref #${bookingId}) and Karen will personally`,
    `check availability and reply within 24 hours — usually much faster.`,
    ``,
    `IMPORTANT: No payment and no documents are needed yet. We only ask for`,
    `those after we've confirmed your dates are free.`,
    ``,
    `Your request:`,
    `  • Vehicle: ${vehicle}`,
    `  • Pick-up: ${pickup}`,
    `  • Return:  ${ret}`,
    ``,
    `Want a faster reply? Message Karen directly on WhatsApp:`,
    `  ${waLink}`,
    ``,
    `— Karen & the VanTripJapan family`,
    `Licensed rent-a-car operator (Permit No. 愛運輸第290号)`,
    `Operated by キャンプ女子株式会社 · Hakozaki, Fukuoka, Japan`,
    `https://vantripjapan.jp`,
  ].join('\n');

  const customerMail = email && email.includes('@') ? sendResend({
    from: 'VanTripJapan <booking@vantripjapan.jp>',
    reply_to: 'info@vantripjapan.jp',
    to: [email],
    subject: `✅ We received your VanTripJapan booking request (#${bookingId})`,
    text: customerBody,
  }) : Promise.resolve();

  // 2) Internal alert so Karen can reply fast
  const adminBody = [
    `🚐 NEW BOOKING REQUEST #${bookingId}`,
    ``,
    `Name:     ${data.full_name || '—'}`,
    `Email:    ${email || '—'}`,
    `Phone:    ${data.phone || '—'}`,
    `Vehicle:  ${vehicle}`,
    `Pick-up:  ${pickup}`,
    `Return:   ${ret}`,
    `Guests:   ${data.num_guests || 1}`,
    `Drivers:  ${data.num_drivers || 1}`,
    `Found us: ${data.referral_source || '—'}`,
    `Gear:     ${data.camping_gear_notes || '—'}`,
    `JP license translation needed: ${data.translation_needed ? 'YES' : 'no'}`,
    ``,
    `→ Manage: https://vantripjapan.jp/admin/`,
  ].join('\n');

  const adminMail = sendResend({
    from: 'VanTripJapan Booking Bot <booking@vantripjapan.jp>',
    reply_to: email && email.includes('@') ? email : 'info@vantripjapan.jp',
    to: ['info@vantripjapan.jp'],
    subject: `🚐 New booking: ${vehicle} — ${data.full_name || ''} (#${bookingId})`,
    text: adminBody,
  });

  await Promise.allSettled([customerMail, adminMail]);
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
