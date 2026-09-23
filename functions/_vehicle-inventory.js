export const BONGO_SECOND_UNIT_START = '2026-10-15';

export const VEHICLE_KEYS = [
  'MAZDA BONGO',
  'TOYOTA PROBOX',
  'DAIHATSU POCKET LOFT'
];

export function vehicleCapacityOnDate(vehicle, date) {
  if (vehicle === 'MAZDA BONGO' && date >= BONGO_SECOND_UNIT_START) return 2;
  return 1;
}

function addDays(date, amount) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function occupancyOnDate(blocks, date) {
  return blocks.reduce((total, block) => {
    if (block.from <= date && block.to > date) return total + (block.units || 1);
    return total;
  }, 0);
}

export function mergeOccupancyBlocks(databaseBlocks, calendarBlocks) {
  const databaseBookingIds = new Set(
    databaseBlocks.map(block => block.bookingId).filter(Boolean).map(String)
  );
  const seenCalendarEvents = new Set();
  const merged = [...databaseBlocks];

  for (const block of calendarBlocks) {
    // A booking may be copied from D1 into Google Calendar. A request number in
    // the event title lets us count that reservation once while still counting
    // independent WhatsApp/calendar bookings.
    if (block.bookingId && databaseBookingIds.has(String(block.bookingId))) continue;
    if (block.eventId && seenCalendarEvents.has(block.eventId)) continue;
    if (block.eventId) seenCalendarEvents.add(block.eventId);
    merged.push(block);
  }

  return merged;
}

export function rangeAvailability(vehicle, from, to, blocks) {
  let remaining = Infinity;
  const fullyBookedDates = [];

  for (let date = from; date < to; date = addDays(date, 1)) {
    const capacity = vehicleCapacityOnDate(vehicle, date);
    const occupancy = occupancyOnDate(blocks, date);
    remaining = Math.min(remaining, Math.max(0, capacity - occupancy));
    if (occupancy >= capacity) fullyBookedDates.push(date);
  }

  return {
    available: fullyBookedDates.length === 0,
    remaining: Number.isFinite(remaining) ? remaining : 0,
    fullyBookedDates
  };
}

export function buildFullyBookedRanges(vehicle, from, to, blocks) {
  const dates = rangeAvailability(vehicle, from, to, blocks).fullyBookedDates;
  const ranges = [];

  for (const date of dates) {
    const previous = ranges[ranges.length - 1];
    if (previous && previous.to === date) {
      previous.to = addDays(date, 1);
    } else {
      ranges.push({ from: date, to: addDays(date, 1) });
    }
  }

  return ranges;
}

// カレンがWhatsApp台帳（wa_ledger）で使っている車両名 → サイトの車種キー
export const LEDGER_VAN_TO_VEHICLE = {
  bongo1: 'MAZDA BONGO',
  bongo2: 'MAZDA BONGO',
  probox: 'TOYOTA PROBOX',
  pocket: 'DAIHATSU POCKET LOFT'
};

export function ledgerVanToVehicle(van) {
  if (!van) return null;
  return LEDGER_VAN_TO_VEHICLE[String(van).trim().toLowerCase()] || null;
}

// 台帳とカレンダー/D1は同じ予約を二重に持つことがある。日ごとに多い方を採用すれば、
// 二重計上で満車に見せることなく、どちらか一方にしか無い予約も取りこぼさない。
export function combineOccupancySources(from, to, ledgerBlocks, otherBlocks) {
  const blocks = [];
  for (let date = from; date < to; date = addDays(date, 1)) {
    const units = Math.max(
      occupancyOnDate(ledgerBlocks, date),
      occupancyOnDate(otherBlocks, date)
    );
    if (units > 0) blocks.push({ from: date, to: addDays(date, 1), units });
  }
  return blocks;
}
