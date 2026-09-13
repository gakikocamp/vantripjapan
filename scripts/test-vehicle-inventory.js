#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../functions/_vehicle-inventory.js'), 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const {
    buildFullyBookedRanges,
    mergeOccupancyBlocks,
    rangeAvailability,
    vehicleCapacityOnDate
  } = await import(moduleUrl);

  const bongo = 'MAZDA BONGO';
  const block = (from, to, extra = {}) => ({ from, to, units: 1, ...extra });

  assert.equal(vehicleCapacityOnDate(bongo, '2026-10-14'), 1);
  assert.equal(vehicleCapacityOnDate(bongo, '2026-10-15'), 2);

  assert.equal(
    rangeAvailability(bongo, '2026-10-14', '2026-10-15', [block('2026-10-14', '2026-10-16')]).available,
    false
  );
  assert.deepEqual(
    rangeAvailability(bongo, '2026-10-15', '2026-10-17', [block('2026-10-14', '2026-10-16')]),
    { available: true, remaining: 1, fullyBookedDates: [] }
  );
  assert.equal(
    rangeAvailability(bongo, '2026-10-15', '2026-10-17', [
      block('2026-10-15', '2026-10-17'),
      block('2026-10-15', '2026-10-17')
    ]).available,
    false
  );
  assert.equal(
    rangeAvailability(bongo, '2026-10-15', '2026-10-17', [block('2026-10-15', '2026-10-17', { units: 99 })]).available,
    false
  );

  const deduped = mergeOccupancyBlocks(
    [block('2026-10-15', '2026-10-17', { bookingId: '123' })],
    [block('2026-10-15', '2026-10-17', { bookingId: '123', eventId: 'cal-123' })]
  );
  assert.equal(deduped.length, 1);
  assert.equal(rangeAvailability(bongo, '2026-10-15', '2026-10-17', deduped).available, true);

  assert.deepEqual(
    buildFullyBookedRanges(bongo, '2026-10-14', '2026-10-18', [
      block('2026-10-14', '2026-10-18'),
      block('2026-10-16', '2026-10-17')
    ]),
    [
      { from: '2026-10-14', to: '2026-10-15' },
      { from: '2026-10-16', to: '2026-10-17' }
    ]
  );

  console.log('✅ BONGO inventory capacity tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
