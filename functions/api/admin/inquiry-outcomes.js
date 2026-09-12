/** Authenticated, PII-free inquiry outcome ledger. */

const CHANNELS = new Set(['whatsapp', 'gmail', 'form', 'other']);
const OUTCOMES = new Set(['open', 'won', 'lost']);
const VEHICLES = new Set(['bongo', 'probox', 'loft', 'any', 'unsure']);
const LANGUAGES = new Set(['', 'en', 'fr', 'de', 'zh', 'he', 'ja']);
const LOSS_REASONS = new Set([
  '', 'no_availability', 'price', 'vehicle_fit', 'dates_changed',
  'no_response', 'license_requirements', 'chose_other', 'other'
]);

function dateOnly(value, required = false) {
  if (!value && !required) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : false;
}

export async function onRequestGet({ request, env }) {
  if (!env?.CUSTOMERS_DB) return Response.json({ error: 'Inquiry report unavailable' }, { status: 503 });
  const requestedDays = Number.parseInt(new URL(request.url).searchParams.get('days') || '90', 10);
  const days = Math.min(365, Math.max(7, Number.isFinite(requestedDays) ? requestedDays : 90));
  const since = `-${days} days`;
  const [totals, reasons, channels, months, recent] = await Promise.all([
    env.CUSTOMERS_DB.prepare(`
      SELECT COUNT(*) AS inquiries,
             SUM(CASE WHEN outcome = 'won' THEN 1 ELSE 0 END) AS won,
             SUM(CASE WHEN outcome = 'lost' THEN 1 ELSE 0 END) AS lost,
             SUM(CASE WHEN outcome = 'open' THEN 1 ELSE 0 END) AS open
      FROM inquiry_outcomes WHERE inquiry_date >= date('now', ?)
    `).bind(since).first(),
    env.CUSTOMERS_DB.prepare(`
      SELECT loss_reason, COUNT(*) AS inquiries
      FROM inquiry_outcomes WHERE inquiry_date >= date('now', ?) AND outcome = 'lost'
      GROUP BY loss_reason ORDER BY inquiries DESC
    `).bind(since).all(),
    env.CUSTOMERS_DB.prepare(`
      SELECT channel, COUNT(*) AS inquiries,
             SUM(CASE WHEN outcome = 'won' THEN 1 ELSE 0 END) AS won,
             SUM(CASE WHEN outcome = 'lost' THEN 1 ELSE 0 END) AS lost
      FROM inquiry_outcomes WHERE inquiry_date >= date('now', ?)
      GROUP BY channel ORDER BY inquiries DESC
    `).bind(since).all(),
    env.CUSTOMERS_DB.prepare(`
      SELECT substr(desired_from, 1, 7) AS pickup_month,
             COUNT(*) AS inquiries,
             SUM(CASE WHEN outcome = 'won' THEN 1 ELSE 0 END) AS won,
             SUM(CASE WHEN outcome = 'lost' THEN 1 ELSE 0 END) AS lost,
             SUM(CASE WHEN outcome = 'lost' AND loss_reason = 'price' THEN 1 ELSE 0 END) AS price_losses,
             SUM(CASE WHEN outcome = 'lost' AND loss_reason = 'no_availability' THEN 1 ELSE 0 END) AS availability_losses
      FROM inquiry_outcomes
      WHERE inquiry_date >= date('now', ?) AND desired_from IS NOT NULL
      GROUP BY pickup_month ORDER BY pickup_month
    `).bind(since).all(),
    env.CUSTOMERS_DB.prepare(`
      SELECT id, inquiry_date, channel, outcome, loss_reason, desired_from, desired_to, guests, vehicle, language
      FROM inquiry_outcomes WHERE inquiry_date >= date('now', ?)
      ORDER BY inquiry_date DESC, id DESC LIMIT 100
    `).bind(since).all()
  ]);
  return Response.json({
    period_days: days,
    totals: totals || {},
    loss_reasons: reasons.results || [],
    channels: channels.results || [],
    pickup_months: months.results || [],
    recent: recent.results || []
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function onRequestPost({ request, env }) {
  if (!env?.CUSTOMERS_DB) return Response.json({ error: 'Inquiry ledger unavailable' }, { status: 503 });
  let data;
  try { data = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const inquiryDate = dateOnly(data.inquiry_date, true);
  const desiredFrom = dateOnly(data.desired_from);
  const desiredTo = dateOnly(data.desired_to);
  const guests = data.guests === '' || data.guests == null ? null : Number.parseInt(data.guests, 10);
  if (!inquiryDate || desiredFrom === false || desiredTo === false ||
      (desiredFrom && desiredTo && desiredTo <= desiredFrom) ||
      !CHANNELS.has(data.channel) || !OUTCOMES.has(data.outcome) ||
      !VEHICLES.has(data.vehicle) || !LANGUAGES.has(data.language || '') ||
      !LOSS_REASONS.has(data.loss_reason || '') ||
      (data.outcome === 'lost' && !data.loss_reason) ||
      (data.outcome !== 'lost' && data.loss_reason) ||
      (guests !== null && (!Number.isInteger(guests) || guests < 1 || guests > 10))) {
    return Response.json({ error: 'Invalid inquiry outcome' }, { status: 400 });
  }

  const result = await env.CUSTOMERS_DB.prepare(`
    INSERT INTO inquiry_outcomes (
      inquiry_date, channel, outcome, loss_reason, desired_from, desired_to, guests, vehicle, language
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    inquiryDate, data.channel, data.outcome, data.loss_reason || '',
    desiredFrom, desiredTo, guests, data.vehicle, data.language || ''
  ).run();

  return Response.json({ status: 'ok', id: result?.meta?.last_row_id || null }, { status: 201 });
}
