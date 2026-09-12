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
const DISCOUNT_TIERS = [
  { minDays: 21, rate: 0.20, label: '20% OFF' },
  { minDays: 14, rate: 0.15, label: '15% OFF' },
  { minDays: 7, rate: 0.10, label: '10% OFF' },
];

function entryFactor(e) {
  if (e.early && new Date().toISOString().slice(0, 10) <= e.early.until) return e.early.factor;
  return e.factor;
}

function factorForDate(iso, slug) {
  for (const e of VTJ_RATE_DATA) {
    if (e.vehicles && e.vehicles.indexOf(slug) === -1) continue;
    if (iso >= e.from && iso < e.to) return entryFactor(e);
  }
  return 1;
}

// pickup(Date)からdays日間・vehicleType(正式名)の平均シーズン係数
export function rateFactor(pickup, days, vehicleType) {
  const slug = SLUG_BY_NAME[vehicleType] || '';
  let total = 0;
  const d = new Date(Date.UTC(pickup.getFullYear(), pickup.getMonth(), pickup.getDate()));
  for (let i = 0; i < days; i++) {
    const iso = d.toISOString().slice(0, 10);
    total += factorForDate(iso, slug);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days > 0 ? total / days : 1;
}

// 日付が確定した見積もりの共通式。各日ごとに週末・季節料金を計算後、長期割引を適用する。
export function quoteRental(base, pickup, days, vehicleType) {
  if (!(base > 0) || !(pickup instanceof Date) || Number.isNaN(pickup.getTime()) || !(days > 0)) return null;
  const slug = SLUG_BY_NAME[vehicleType] || '';
  const d = new Date(Date.UTC(pickup.getFullYear(), pickup.getMonth(), pickup.getDate()));
  let subtotal = 0;
  for (let i = 0; i < days; i++) {
    const iso = d.toISOString().slice(0, 10);
    const weekendFactor = (d.getUTCDay() === 0 || d.getUTCDay() === 6) ? 1.5 : 1;
    subtotal += Math.round(base * weekendFactor * factorForDate(iso, slug));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const discount = DISCOUNT_TIERS.find(tier => days >= tier.minDays) || { rate: 0, label: null };
  return {
    subtotal,
    total: Math.round(subtotal * (1 - discount.rate)),
    label: discount.label,
    days
  };
}
