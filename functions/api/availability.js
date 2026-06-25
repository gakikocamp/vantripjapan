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
  const blocks = {
    'MAZDA BONGO': [],
    'TOYOTA PROBOX': [],
    'DAIHATSU POCKET LOFT': []
  };

  let fetchedAny = false;

  // 1. Fetch Bongo Calendar
  if (env.GOOGLE_CALENDAR_ICS_URL_BONGO) {
    const events = await fetchCalendar(env.GOOGLE_CALENDAR_ICS_URL_BONGO);
    if (events) {
      fetchedAny = true;
      for (const e of events) {
        blocks['MAZDA BONGO'].push({ start: e.start, end: e.end, summary: e.summary || '' });
      }
    }
  }

  // 2. Fetch Probox Calendar
  if (env.GOOGLE_CALENDAR_ICS_URL_PROBOX) {
    const events = await fetchCalendar(env.GOOGLE_CALENDAR_ICS_URL_PROBOX);
    if (events) {
      fetchedAny = true;
      for (const e of events) {
        blocks['TOYOTA PROBOX'].push({ start: e.start, end: e.end, summary: e.summary || '' });
      }
    }
  }

  // 3. Fetch Loft Calendar
  if (env.GOOGLE_CALENDAR_ICS_URL_LOFT) {
    const events = await fetchCalendar(env.GOOGLE_CALENDAR_ICS_URL_LOFT);
    if (events) {
      fetchedAny = true;
      for (const e of events) {
        blocks['DAIHATSU POCKET LOFT'].push({ start: e.start, end: e.end, summary: e.summary || '' });
      }
    }
  }

  // 4. Fetch Legacy / Unified Calendar
  if (env.GOOGLE_CALENDAR_ICS_URL) {
    const events = await fetchCalendar(env.GOOGLE_CALENDAR_ICS_URL);
    if (events) {
      fetchedAny = true;
      for (const e of events) {
        const vehicleKey = mapSummaryToVehicle(e.summary);
        if (vehicleKey && blocks[vehicleKey]) {
          blocks[vehicleKey].push({ start: e.start, end: e.end, summary: e.summary || '' });
        }
      }
    }
  }

  // If no URLs are defined or all fetches failed, return mock fallback
  if (!fetchedAny) {
    console.log('No calendar URLs configured or all failed. Using mock fallback.');
    const mockEvents = parseICS(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260710
DTEND;VALUE=DATE:20260715
SUMMARY:[HiAce] Booked - Karen WhatsApp
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260720
DTEND;VALUE=DATE:20260725
SUMMARY:[Probox] Blocked - Karen WhatsApp
END:VEVENT
END:VCALENDAR`);
    for (const e of mockEvents) {
      const vehicleKey = mapSummaryToVehicle(e.summary);
      if (vehicleKey && blocks[vehicleKey]) {
        blocks[vehicleKey].push({ start: e.start, end: e.end, summary: e.summary || '' });
      }
    }
  }

  return blocks;
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
  const calBlocks = await getCalendarBlocks(env);

  // Normalise query dates
  const fromDate = from ? from.slice(0, 10) : null;
  const toDate = to ? to.slice(0, 10) : null;

  // Specific availability check for one vehicle + date range
  if (vehicle && fromDate && toDate) {
    if (Number.isNaN(Date.parse(fromDate)) || Number.isNaN(Date.parse(toDate))) {
      return Response.json({ error: 'Invalid from/to date' }, { status: 400 });
    }

    // 1. Google Calendar Conflicts
    const calConflicts = [];
    const vehicleCalEvents = calBlocks[vehicle] || [];
    for (const event of vehicleCalEvents) {
      if (event.start < toDate && event.end > fromDate) {
        calConflicts.push({ from: event.start, to: event.end });
      }
    }

    // 2. D1 Database Conflicts
    const rows = await env.CUSTOMERS_DB.prepare(`
      SELECT pickup_datetime AS pickup, return_datetime AS dropoff
      FROM bookings
      WHERE vehicle_type = ?
        AND status IN (${placeholders})
        AND pickup_datetime < ?
        AND return_datetime > ?
      ORDER BY pickup_datetime
    `).bind(vehicle, ...BLOCKING_STATUSES, to, from).all();

    const dbConflicts = rows.results.map(r => ({
      from: String(r.pickup).slice(0, 10),
      to: String(r.dropoff).slice(0, 10),
    }));

    const conflicts = [...calConflicts, ...dbConflicts];
    return Response.json({ available: conflicts.length === 0, conflicts }, { headers: cacheHeaders });
  }

  // Overview: booked ranges per vehicle for the next 6 months
  const rows = await env.CUSTOMERS_DB.prepare(`
    SELECT vehicle_type AS vehicle, pickup_datetime AS pickup, return_datetime AS dropoff
    FROM bookings
    WHERE status IN (${placeholders})
      AND return_datetime >= datetime('now')
      AND pickup_datetime <= datetime('now', '+6 months')
    ORDER BY pickup_datetime
  `).bind(...BLOCKING_STATUSES).all();

  const vehicles = {};
  
  const addBlock = (veh, fromVal, toVal) => {
    if (!veh) return;
    vehicles[veh] = vehicles[veh] || [];
    const exists = vehicles[veh].some(c => c.from === fromVal && c.to === toVal);
    if (!exists) {
      vehicles[veh].push({ from: fromVal, to: toVal });
    }
  };

  // Add DB blocks
  for (const r of rows.results) {
    const key = r.vehicle || 'UNKNOWN';
    addBlock(key, String(r.pickup).slice(0, 10), String(r.dropoff).slice(0, 10));
  }

  // Add Google Calendar blocks
  const nowStr = new Date().toISOString().slice(0, 10);
  const sixMonthsLater = new Date();
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
  const sixMonthsLaterStr = sixMonthsLater.toISOString().slice(0, 10);

  for (const vehicleKey of Object.keys(calBlocks)) {
    for (const event of calBlocks[vehicleKey]) {
      if (event.end >= nowStr && event.start <= sixMonthsLaterStr) {
        addBlock(vehicleKey, event.start, event.end);
      }
    }
  }

  // Sort ranges chronologically
  for (const key of Object.keys(vehicles)) {
    vehicles[key].sort((a, b) => a.from.localeCompare(b.from));
  }

  return Response.json({ vehicles }, { headers: cacheHeaders });
}
