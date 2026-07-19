/**
 * Booking Public API — /api/booking-public （トークン認証・顧客本人用）
 * GET  ?id=N&token=T : 予約の最小情報 + アップロード済み書類の種類（PIIは名のみ）
 * POST ?id=N&token=T : 手続きフォーム送信（追加情報 + 規約同意）→ notes JSONへ保存、
 *                      書類が揃っていれば status を docs_received に進め、Karenへ通知
 */

import { verifyCompleteToken } from './_complete-token.js';

function ensureBindings(env) {
  if (!env?.CUSTOMERS_DB) return 'Missing binding: CUSTOMERS_DB';
  if (!env?.ENCRYPTION_KEY) return 'Missing secret: ENCRYPTION_KEY';
  return null;
}

async function loadBooking(env, id) {
  return env.CUSTOMERS_DB.prepare(
    'SELECT id, full_name, vehicle_type, pickup_datetime, return_datetime, status, notes FROM bookings WHERE id = ?'
  ).bind(id).first();
}

async function loadDocTypes(env, id) {
  const docs = await env.CUSTOMERS_DB.prepare(
    'SELECT doc_type FROM customer_documents WHERE booking_id = ?'
  ).bind(id).all();
  return (docs?.results || []).map((d) => d.doc_type);
}

async function handleGet(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const token = url.searchParams.get('token');
  if (!(await verifyCompleteToken(id, token, env))) {
    return Response.json({ error: 'Invalid link' }, { status: 403 });
  }

  const booking = await loadBooking(env, id);
  if (!booking) return Response.json({ error: 'Not found' }, { status: 404 });

  let notes = {};
  try { notes = booking.notes ? JSON.parse(booking.notes) : {}; } catch { /* legacy free-text notes */ }

  return Response.json({
    id: booking.id,
    first_name: (booking.full_name || '').trim().split(/\s+/)[0] || '',
    vehicle: booking.vehicle_type,
    pickup: booking.pickup_datetime,
    return: booking.return_datetime,
    status: booking.status,
    lang: notes.lang || 'en',
    docs: await loadDocTypes(env, id),
    details_submitted: !!notes.details,
  });
}

async function handlePost(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const token = url.searchParams.get('token');
  if (!(await verifyCompleteToken(id, token, env))) {
    return Response.json({ error: 'Invalid link' }, { status: 403 });
  }

  const booking = await loadBooking(env, id);
  if (!booking) return Response.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  if (!body.agree_terms) {
    return Response.json({ error: 'Terms agreement is required' }, { status: 400 });
  }

  // 受け取る項目は許可リスト方式・各500文字まで（自由記述の暴走防止）
  const pick = (v) => (typeof v === 'string' ? v.trim().slice(0, 500) : '');
  const details = {
    flight_number: pick(body.flight_number),
    arrival_time: pick(body.arrival_time),
    license_country: pick(body.license_country),
    idp_type: pick(body.idp_type),            // idp_1949 | jdltc_translation | unsure
    additional_driver: pick(body.additional_driver),
    emergency_name: pick(body.emergency_name),
    emergency_phone: pick(body.emergency_phone),
    special_requests: pick(body.special_requests),
    agree_terms: true,
    submitted_at: new Date().toISOString(),
  };

  let notes = {};
  try { notes = booking.notes ? JSON.parse(booking.notes) : {}; } catch { notes = { legacy: booking.notes }; }
  notes.details = details;

  // 免許証の表裏が揃っていれば docs_received へ（初期ステータスの場合のみ前進）
  const docTypes = await loadDocTypes(env, id);
  const docsComplete = docTypes.includes('license_front') && docTypes.includes('license_back');
  const canAdvance = ['form_submitted', 'docs_requested'].includes(booking.status);
  const newStatus = docsComplete && canAdvance ? 'docs_received' : booking.status;

  await env.CUSTOMERS_DB.prepare(
    "UPDATE bookings SET notes = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(JSON.stringify(notes), newStatus, id).run();

  await env.CUSTOMERS_DB.prepare(
    'INSERT INTO access_logs (user_email, action, resource, detail) VALUES (?, ?, ?, ?)'
  ).bind('customer-self-service', 'details_submitted', `booking/${id}`,
    `docs=${docTypes.join(',') || 'none'} → status ${newStatus}`).run();

  // Karenへ通知（失敗しても手続き自体は成功扱い）
  if (env.RESEND_API_KEY) {
    const adminBody = [
      `📋 予約 #${id} のお客様が手続きフォームを完了しました`,
      ``,
      `Vehicle:  ${booking.vehicle_type}`,
      `Pick-up:  ${booking.pickup_datetime}`,
      `Documents: ${docTypes.join(', ') || '(まだアップロードなし)'}`,
      `License country: ${details.license_country || '—'}`,
      `IDP/Translation: ${details.idp_type || '—'}`,
      `Flight: ${details.flight_number || '—'} (arrival: ${details.arrival_time || '—'})`,
      `Additional driver: ${details.additional_driver || '—'}`,
      `Emergency: ${details.emergency_name || '—'} ${details.emergency_phone || ''}`,
      `Requests: ${details.special_requests || '—'}`,
      ``,
      newStatus === 'docs_received'
        ? `✅ 書類完備 → ステータスを docs_received に進めました。次: Stripe決済リンクの送付`
        : `⚠️ 免許証の表裏がまだ揃っていません（現状: ${docTypes.join(', ') || 'なし'}）`,
      ``,
      `→ 管理画面: https://vantripjapan.jp/admin/`,
    ].join('\n');
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'VanTripJapan <booking@vantripjapan.jp>',
        to: ['info@vantripjapan.jp'],
        subject: `📋 手続き完了: 予約 #${id} ${booking.vehicle_type || ''}${newStatus === 'docs_received' ? ' — 書類OK・決済リンク待ち' : ' — 書類不足あり'}`,
        text: adminBody,
      }),
    }).catch((e) => console.error('[BookingPublic Mail]', e?.message));
  }

  return Response.json({ status: 'ok', booking_status: newStatus, docs_complete: docsComplete });
}

export async function onRequest(context) {
  const { request, env } = context;
  const bindingError = ensureBindings(env);
  if (bindingError) {
    return Response.json({ error: 'Service misconfigured', detail: bindingError }, { status: 500 });
  }
  switch (request.method) {
    case 'GET': return handleGet(request, env);
    case 'POST': return handlePost(request, env);
    default: return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
}
