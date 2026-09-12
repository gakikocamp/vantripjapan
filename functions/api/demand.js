/**
 * Rental demand capture — POST /api/demand
 * Records a completed date search without contact details or persistent identity.
 */

const LANGUAGES = new Set(['en', 'fr', 'de', 'zh', 'he']);
const DAY_MS = 86400000;

function shortText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
}

async function digestHex(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  if (!env?.CUSTOMERS_DB) {
    return Response.json({ error: 'Demand capture unavailable' }, { status: 503 });
  }

  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 4096) return Response.json({ error: 'Payload too large' }, { status: 413 });

  let data;
  try {
    data = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const pickup = isoDate(data.pickup_date);
  const returns = isoDate(data.return_date);
  const pickupTime = Date.parse(`${pickup}T00:00:00Z`);
  const returnTime = Date.parse(`${returns}T00:00:00Z`);
  const rentalDays = Math.ceil((returnTime - pickupTime) / DAY_MS);
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const leadDays = Math.floor((pickupTime - todayUtc) / DAY_MS);
  const guests = Number.parseInt(data.guests, 10);

  if (!pickup || !returns || !Number.isFinite(pickupTime) || !Number.isFinite(returnTime) ||
      rentalDays < 1 || rentalDays > 60 || leadDays < 0 || leadDays > 730 ||
      !Number.isInteger(guests) || guests < 1 || guests > 5) {
    return Response.json({ error: 'Invalid search parameters' }, { status: 400 });
  }

  const complete = data.availability_complete === true;
  const compatibleCount = Number.parseInt(data.compatible_count, 10);
  const rawCount = Number.parseInt(data.available_count, 10);
  if (!Number.isInteger(compatibleCount) || compatibleCount < 0 || compatibleCount > 3) {
    return Response.json({ error: 'Invalid compatible vehicle count' }, { status: 400 });
  }
  const availableCount = complete && Number.isInteger(rawCount) && rawCount >= 0 && rawCount <= 3
    ? rawCount
    : null;
  const language = LANGUAGES.has(data.language) ? data.language : 'en';
  const attr = data.attribution && typeof data.attribution === 'object' ? data.attribution : {};
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
  const ua = request.headers.get('User-Agent') || '';
  const dayBucket = new Date().toISOString().slice(0, 10);
  const dedupeKey = await digestHex([dayBucket, ip, ua, pickup, returns, guests].join('|'));

  const result = await env.CUSTOMERS_DB.prepare(`
    INSERT OR IGNORE INTO rental_searches (
      pickup_date, return_date, rental_days, lead_days, guests, compatible_count,
      available_count, availability_complete, language,
      landing_path, referrer_host, utm_source, utm_medium, utm_campaign,
      country, dedupe_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pickup,
    returns,
    rentalDays,
    leadDays,
    guests,
    compatibleCount,
    availableCount,
    complete ? 1 : 0,
    language,
    shortText(attr.lp, 120),
    shortText(attr.ref, 120),
    shortText(attr.utm_source, 80),
    shortText(attr.utm_medium, 80),
    shortText(attr.utm_campaign, 120),
    shortText(request.headers.get('CF-IPCountry'), 2),
    dedupeKey
  ).run();

  return Response.json({ status: 'accepted', stored: Number(result?.meta?.changes || 0) > 0 }, { status: 202 });
}
