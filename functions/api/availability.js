/**
 * Availability API — /api/availability (public, read-only, no PII)
 *
 * GET /api/availability
 *   → { vehicles: { "MAZDA BONGO": [{from,to}], ... } }  booked ranges (next 6 months)
 *
 * GET /api/availability?vehicle=TOYOTA%20PROBOX&from=2026-07-01&to=2026-07-08
 *   → { available: true|false, conflicts: [{from,to}] }
 *
 * Merges Google Calendar public iCal feed blocks and D1 database active bookings.
 */

import {
  VEHICLE_KEYS,
  buildFullyBookedRanges,
  combineOccupancySources,
  ledgerVanToVehicle,
  mergeOccupancyBlocks,
  rangeAvailability,
  vehicleCapacityOnDate
} from '../_vehicle-inventory.js';

const BLOCKING_STATUSES = ['docs_requested', 'docs_received', 'payment_sent', 'confirmed', 'active'];

function parseICS(icsText) {
  const events = [];
  const lines = icsText.split(/\r?\n/);
  let currentEvent = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Handle folded lines (lines starting with space/tab are continued)
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      line += lines[i + 1].slice(1);
      i++;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    
    const keyPart = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const key = keyPart.split(';')[0].trim().toUpperCase();
    
    if (key === 'BEGIN' && value.trim().toUpperCase() === 'VEVENT') {
      currentEvent = {};
    } else if (key === 'END' && value.trim().toUpperCase() === 'VEVENT') {
      if (currentEvent && currentEvent.start && currentEvent.end) {
        events.push(currentEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (key === 'DTSTART') {
        currentEvent.start = parseICSDate(line);
      } else if (key === 'DTEND') {
        currentEvent.end = parseICSDate(line);
      } else if (key === 'SUMMARY') {
        currentEvent.summary = value.trim();
      } else if (key === 'UID') {
        currentEvent.uid = value.trim();
      }
    }
  }
  return events;
}

function parseICSDate(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const val = line.slice(colonIdx + 1).trim();
  if (val.length >= 8) {
    const y = val.slice(0, 4);
    const m = val.slice(4, 6);
    const d = val.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  return null;
}

function mapSummaryToVehicle(summary) {
  if (!summary) return null;
  const upper = summary.toUpperCase();
  if (upper.includes('[BONGO]') || upper.includes('[HIACE]')) return 'MAZDA BONGO';
  if (upper.includes('[PROBOX]')) return 'TOYOTA PROBOX';
  if (upper.includes('[LOFT]') || upper.includes('[DAIHATSU]') || upper.includes('[TENTMUSHI]')) return 'DAIHATSU POCKET LOFT';
  
  if (upper.includes('BONGO') || upper.includes('HIACE')) return 'MAZDA BONGO';
  if (upper.includes('PROBOX')) return 'TOYOTA PROBOX';
  if (upper.includes('LOFT') || upper.includes('DAIHATSU') || upper.includes('TENTMUSHI')) return 'DAIHATSU POCKET LOFT';
  return null;
}

function calendarBlock(event) {
  const summary = event.summary || '';
  const bookingMatch = summary.match(/(?:BOOKING|REQUEST)\s*#\s*(\d+)/i);
  const blocksWholeClass = /\[\s*BONGO(?:\s+|-)ALL\s*\]/i.test(summary);
  return {
    from: event.start,
    to: event.end,
    units: blocksWholeClass ? 99 : 1,
    bookingId: bookingMatch ? bookingMatch[1] : null,
    eventId: event.uid || null,
    summary
  };
}

async function fetchCalendar(url) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500); // 1.5s timeout
    const res = await fetch(url, {
      cf: { cacheTtl: 300 },
      headers: { 'User-Agent': 'Cloudflare-Worker' },
      signal: controller.signal
    });
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return parseICS(text);
  } catch (err) {
    console.error(`Failed to fetch calendar from ${url}:`, err.message || err);
    return null;
  }
}

async function getCalendarBlocks(env) {
  const blocks = Object.fromEntries(VEHICLE_KEYS.map(key => [key, []]));
  const sources = [
    { url: env.GOOGLE_CALENDAR_ICS_URL_BONGO, vehicle: 'MAZDA BONGO' },
    { url: env.GOOGLE_CALENDAR_ICS_URL_PROBOX, vehicle: 'TOYOTA PROBOX' },
    { url: env.GOOGLE_CALENDAR_ICS_URL_LOFT, vehicle: 'DAIHATSU POCKET LOFT' },
    { url: env.GOOGLE_CALENDAR_ICS_URL, vehicle: null }
  ].filter(source => source.url);
  const status = { configured: sources.length, succeeded: 0, failed: 0, complete: true };

  for (const source of sources) {
    const events = await fetchCalendar(source.url);
    if (!events) {
      status.failed++;
      status.complete = false;
      continue;
    }

    status.succeeded++;
    for (const event of events) {
      const vehicleKey = source.vehicle || mapSummaryToVehicle(event.summary);
      if (vehicleKey && blocks[vehicleKey]) {
        blocks[vehicleKey].push(calendarBlock(event));
      }
    }
  }

  return { blocks, status };
}

/**
 * WhatsApp予約台帳（wa_ledger）から稼働中の予約を読む。
 * 実際の予約はここで管理されているため、カレンダーとD1だけでは空き状況が実態とずれる。
 * 氏名・連絡先の列は読まない（車種と日付のみ）。
 */
async function getLedgerBlocks(env, fromDate, toDate) {
  const blocks = Object.fromEntries(VEHICLE_KEYS.map(key => [key, []]));
  let unassigned = 0;

  try {
    const rows = await env.CUSTOMERS_DB.prepare(`
      SELECT van, date(start) AS start_date, date(end) AS end_date
      FROM wa_ledger
      WHERE (cancelled IS NULL OR CAST(cancelled AS TEXT) <> '1')
        AND start IS NOT NULL AND end IS NOT NULL
        AND date(end) > ? AND date(start) < ?
    `).bind(fromDate, toDate).all();

    for (const row of rows.results) {
      if (!row.start_date || !row.end_date) continue;
      const vehicleKey = ledgerVanToVehicle(row.van);
      if (!vehicleKey || !blocks[vehicleKey]) {
        // 車種未記入の予約。どの車が埋まるか決まらないので件数だけ返す
        unassigned++;
        continue;
      }
      blocks[vehicleKey].push({
        from: String(row.start_date),
        to: String(row.end_date),
        units: 1
      });
    }
  } catch (err) {
    console.error('Failed to read wa_ledger:', err.message || err);
    return { blocks, unassigned: 0, ok: false };
  }

  return { blocks, unassigned, ok: true };
}

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

  // Fetch Google Calendar blocks grouped by vehicle
  const calendar = await getCalendarBlocks(env);
  const calBlocks = calendar.blocks;
  const availability = {
    complete: calendar.status.complete,
    calendarConfigured: calendar.status.configured > 0,
    calendarSources: calendar.status.configured,
    failedCalendarSources: calendar.status.failed
  };

  // Normalise query dates
  const fromDate = from ? from.slice(0, 10) : null;
  const toDate = to ? to.slice(0, 10) : null;

  // Specific availability check for one vehicle + date range
  if (vehicle && fromDate && toDate) {
    if (Number.isNaN(Date.parse(fromDate)) || Number.isNaN(Date.parse(toDate))) {
      return Response.json({ error: 'Invalid from/to date' }, { status: 400 });
    }

    // Combine D1 bookings with calendar-only bookings and maintenance blocks.
    const rows = await env.CUSTOMERS_DB.prepare(`
      SELECT id, pickup_datetime AS pickup, return_datetime AS dropoff
      FROM bookings
      WHERE vehicle_type = ?
        AND status IN (${placeholders})
        AND pickup_datetime < ?
        AND return_datetime > ?
      ORDER BY pickup_datetime
    `).bind(vehicle, ...BLOCKING_STATUSES, to, from).all();

    const dbBlocks = rows.results.map(r => ({
      from: String(r.pickup).slice(0, 10),
      to: String(r.dropoff).slice(0, 10),
      units: 1,
      bookingId: String(r.id)
    }));
    const calendarBlocks = (calBlocks[vehicle] || []).filter(
      block => block.from < toDate && block.to > fromDate
    );
    const ledger = await getLedgerBlocks(env, fromDate, toDate);
    if (!ledger.ok) availability.complete = false;
    availability.ledgerConnected = ledger.ok;
    availability.unassignedLedgerBookings = ledger.unassigned;

    const sourceBlocks = mergeOccupancyBlocks(dbBlocks, calendarBlocks);
    const ledgerBlocks = ledger.blocks[vehicle] || [];
    const blocks = combineOccupancySources(fromDate, toDate, ledgerBlocks, sourceBlocks);
    const result = rangeAvailability(vehicle, fromDate, toDate, blocks);
    const available = result.available ? (availability.complete ? true : null) : false;
    return Response.json({
      available,
      remaining: result.remaining,
      capacity: vehicleCapacityOnDate(vehicle, fromDate),
      conflicts: [...ledgerBlocks, ...sourceBlocks].map(({ from, to }) => ({ from, to })),
      fullyBookedDates: result.fullyBookedDates,
      availability
    }, { headers: cacheHeaders });
  }

  // Overview: booked ranges per vehicle for the next 6 months
  const rows = await env.CUSTOMERS_DB.prepare(`
    SELECT id, vehicle_type AS vehicle, pickup_datetime AS pickup, return_datetime AS dropoff
    FROM bookings
    WHERE status IN (${placeholders})
      AND return_datetime >= datetime('now')
      AND pickup_datetime <= datetime('now', '+6 months')
    ORDER BY pickup_datetime
  `).bind(...BLOCKING_STATUSES).all();

  const databaseBlocks = Object.fromEntries(VEHICLE_KEYS.map(key => [key, []]));
  for (const r of rows.results) {
    const key = r.vehicle;
    if (!databaseBlocks[key]) continue;
    databaseBlocks[key].push({
      from: String(r.pickup).slice(0, 10),
      to: String(r.dropoff).slice(0, 10),
      units: 1,
      bookingId: String(r.id)
    });
  }

  const nowStr = new Date().toISOString().slice(0, 10);
  const sixMonthsLater = new Date();
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
  const sixMonthsLaterStr = sixMonthsLater.toISOString().slice(0, 10);
  const vehicles = {};
  const occupancy = {};

  const ledger = await getLedgerBlocks(env, nowStr, sixMonthsLaterStr);
  if (!ledger.ok) availability.complete = false;
  availability.ledgerConnected = ledger.ok;
  availability.unassignedLedgerBookings = ledger.unassigned;

  for (const vehicleKey of VEHICLE_KEYS) {
    const calendarBlocks = (calBlocks[vehicleKey] || []).filter(
      block => block.to >= nowStr && block.from <= sixMonthsLaterStr
    );
    const sourceBlocks = mergeOccupancyBlocks(databaseBlocks[vehicleKey], calendarBlocks);
    const ledgerBlocks = ledger.blocks[vehicleKey] || [];
    const blocks = combineOccupancySources(nowStr, sixMonthsLaterStr, ledgerBlocks, sourceBlocks);
    occupancy[vehicleKey] = [...ledgerBlocks, ...sourceBlocks].map(({ from, to }) => ({ from, to }));
    vehicles[vehicleKey] = buildFullyBookedRanges(
      vehicleKey,
      nowStr,
      sixMonthsLaterStr,
      blocks
    );
  }

  return Response.json({ vehicles, occupancy, availability }, { headers: cacheHeaders });
}
