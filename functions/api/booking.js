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
  let gearNotes = data.num_guests
    ? `[Guests: ${data.num_guests}] ${data.camping_gear_notes || ''}`
    : data.camping_gear_notes || null;

  if (data.full_cover_option) {
    gearNotes = `[Insurance: Zero-Risk Full Cover] ${gearNotes || ''}`;
  }

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
    `  • Vehicle:   ${vehicle}`,
    `  • Pick-up:   ${pickup}`,
    `  • Return:    ${ret}`,
    `  • Insurance: ${data.full_cover_option ? 'Zero-Risk Full Cover (+¥5,000/day)' : 'Basic Cover (Excess applies)'}`,
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

  // Clean phone and build WhatsApp link
  let waAdminLink = '';
  if (data.phone) {
    let cleanPhone = data.phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '81' + cleanPhone.slice(1);
    }
    waAdminLink = `https://wa.me/${cleanPhone}`;
  }

  // Detect test requests
  const nameLower = name.toLowerCase();
  const emailLower = email.toLowerCase();
  const isTest = nameLower.includes('test') || nameLower.includes('テスト') || nameLower.includes('dummy') ||
                 emailLower.includes('test') || emailLower.includes('dummy') ||
                 (data.camping_gear_notes || '').toLowerCase().includes('test') ||
                 (data.camping_gear_notes || '').includes('テスト');

  // 2) Internal alert so Karen can reply fast
  const adminBody = [
    `🚐 NEW BOOKING REQUEST #${bookingId}`,
    isTest ? `⚠️ [TEST SUBMISSION / テスト送信]` : ``,
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
    `Insurance: ${data.full_cover_option ? 'Zero-Risk Full Cover (+¥5,000/day)' : 'Basic Cover'}`,
    `JP license translation needed: ${data.translation_needed ? 'YES' : 'no'}`,
    ``,
    `→ Reply via Email: mailto:${email}`,
    waAdminLink ? `→ Reply via WhatsApp: ${waAdminLink}` : ``,
    `→ Manage: https://vantripjapan.jp/admin/`,
  ].join('\n');

  const adminHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; color: #2d3748;">
  <!-- Title/Header Banner -->
  <div style="background-color: ${isTest ? '#d69e2e' : '#1a365d'}; padding: 20px; color: #ffffff; text-align: center;">
    <h2 style="margin: 0; font-size: 20px;">🚐 新規予約リクエスト #${bookingId}</h2>
    ${isTest ? '<div style="margin-top: 5px; font-weight: bold; background-color: rgba(255,255,255,0.2); display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px;">⚠️ テスト送信の可能性があります (Test Submission)</div>' : ''}
  </div>

  <div style="padding: 24px;">
    <!-- Customer Quick Action / Contact Info -->
    <h3 style="margin-top: 0; color: #1a365d; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">👤 お客様情報 (Customer Info)</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
      <tr>
        <td style="padding: 6px 0; font-weight: bold; width: 150px; color: #4a5568;">お名前 (Name):</td>
        <td style="padding: 6px 0; font-weight: bold;">${data.full_name || '—'}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; font-weight: bold; color: #4a5568;">メール (Email):</td>
        <td style="padding: 6px 0;"><a href="mailto:${email}" style="color: #3182ce; text-decoration: underline;">${email || '—'}</a></td>
      </tr>
      <tr>
        <td style="padding: 6px 0; font-weight: bold; color: #4a5568;">電話番号 (Phone):</td>
        <td style="padding: 6px 0;">${data.phone || '—'}</td>
      </tr>
    </table>

    <!-- Admin Actions -->
    <h3 style="color: #1a365d; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">🚀 次のアクション (Next Steps)</h3>
    <div style="margin-bottom: 25px;">
      <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #4a5568;">
        お客様へ直接連絡、または予約処理を行うには以下のボタンを押してください：
      </p>
      
      <!-- Action 1: Reply via Email -->
      <a href="mailto:${email}?subject=Re: VanTripJapan Booking Request %23${bookingId}" style="display: block; background-color: #3182ce; color: #ffffff; text-decoration: none; padding: 12px; border-radius: 6px; text-align: center; font-weight: bold; margin-bottom: 4px; font-size: 14px;">
        ✉️ お客様にメールで返信する (Direct Email)
      </a>
      <div style="font-size: 11px; color: #718096; margin-bottom: 12px; text-align: center;">
        （※この通知メールにそのまま「返信」をしても、お客様宛に届きます）
      </div>

      <!-- Action 2: WhatsApp if phone is present -->
      ${waAdminLink ? `
      <a href="${waAdminLink}" target="_blank" style="display: block; background-color: #38a169; color: #ffffff; text-decoration: none; padding: 12px; border-radius: 6px; text-align: center; font-weight: bold; margin-bottom: 12px; font-size: 14px;">
        💬 WhatsAppでチャットを開始する
      </a>
      ` : ''}

      <!-- Action 3: Go to Admin Dashboard -->
      <a href="https://vantripjapan.jp/admin/" target="_blank" style="display: block; background-color: #4a5568; color: #ffffff; text-decoration: none; padding: 12px; border-radius: 6px; text-align: center; font-weight: bold; font-size: 14px;">
        ⚙️ 管理画面で予約を処理する (Admin Dashboard)
      </a>
    </div>

    <!-- Details Table -->
    <h3 style="color: #1a365d; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">📋 予約リクエスト詳細 (Request Details)</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.5;">
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; width: 180px; color: #4a5568;">車両タイプ (Vehicle)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${vehicle}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">出発日時 (Pick-up)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${pickup}</td>
      </tr>
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">返却日時 (Return)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${ret}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">乗車人数 (Guests)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${data.num_guests || 1} 名</td>
      </tr>
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">運転者数 (Drivers)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${data.num_drivers || 1} 名</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">加入保険 (Insurance)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold;">${data.full_cover_option ? 'Zero-Risk フルカバー (+¥5,000/日)' : '標準カバー'}</td>
      </tr>
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">免許翻訳 (JAF Translation)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; color: ${data.translation_needed ? '#e53e3e' : '#2d3748'};">${data.translation_needed ? '✅ 必要 (YES)' : '不要 (NO)'}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">アンケート (Referral)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${data.referral_source || '—'}</td>
      </tr>
      <tr style="background-color: #f7fafc;">
        <td style="padding: 8px; font-weight: bold; border: 1px solid #e2e8f0; color: #4a5568;">要望・備品備考 (Notes)</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${data.camping_gear_notes || '—'}</td>
      </tr>
    </table>
  </div>
</div>
  `;

  const adminMail = sendResend({
    from: 'VanTripJapan Booking Bot <booking@vantripjapan.jp>',
    reply_to: email && email.includes('@') ? email : 'info@vantripjapan.jp',
    to: ['info@vantripjapan.jp'],
    subject: `${isTest ? '⚠️ [TEST] ' : ''}🚐 New booking: ${vehicle} — ${data.full_name || ''} (#${bookingId})`,
    text: adminBody,
    html: adminHtml,
  });

  // 3) Sync customer to Resend Audience
  const syncAudience = async () => {
    if (!email || !email.includes('@')) return;
    try {
      const res = await fetch('https://api.resend.com/audiences/de618a55-3736-4982-a19d-2996b31ef834/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          first_name: name.split(' ')[0],
          last_name: name.split(' ').slice(1).join(' ') || '',
          unsubscribed: false,
          metadata: {
            lang: data.translation_needed ? 'ja' : 'en',
            source: 'booking_form',
            vehicle: vehicle
          }
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('[Booking Mail] Resend Audience Sync Failed:', errText);
      }
    } catch (e) {
      console.error('[Booking Mail] Resend Audience Sync Error:', e?.message);
    }
  };

  await Promise.allSettled([customerMail, adminMail, syncAudience()]);
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
