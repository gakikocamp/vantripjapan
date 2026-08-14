/**
 * VTJ 料金カレンダー（サーバ側ミラー）
 * ⚠️ site/js/rate-calendar.js と RATE_DATA を完全に同一に保つこと
 *    （qa-i18n-smoke.js が両ファイルの一致を検査する）
 */
/* RATE_DATA_START */
var VTJ_RATE_DATA = [
  { "from": "2026-10-01", "to": "2026-11-01", "factor": 1.10, "vehicles": ["bongo"], "key": "autumn" },
  { "from": "2027-03-20", "to": "2027-04-11", "factor": 1.30, "early": { "until": "2027-01-31", "factor": 1.15 }, "key": "sakura" },
  { "from": "2027-04-11", "to": "2027-06-01", "factor": 1.10, "key": "spring" }
];
/* RATE_DATA_END */

const SLUG_BY_NAME = {
  'TOYOTA PROBOX': 'probox',
  'MAZDA BONGO': 'bongo',
  'DAIHATSU POCKET LOFT': 'loft',
};

function entryFactor(e) {
  if (e.early && new Date().toISOString().slice(0, 10) <= e.early.until) return e.early.factor;
  return e.factor;
}

// pickup(Date)からdays日間・vehicleType(正式名)の平均シーズン係数
export function rateFactor(pickup, days, vehicleType) {
  const slug = SLUG_BY_NAME[vehicleType] || '';
  let total = 0;
  const d = new Date(Date.UTC(pickup.getFullYear(), pickup.getMonth(), pickup.getDate()));
  for (let i = 0; i < days; i++) {
    const iso = d.toISOString().slice(0, 10);
    let f = 1;
    for (const e of VTJ_RATE_DATA) {
      if (e.vehicles && slug && e.vehicles.indexOf(slug) === -1) continue;
      if (iso >= e.from && iso < e.to) { f = entryFactor(e); break; }
    }
    total += f;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days > 0 ? total / days : 1;
}
