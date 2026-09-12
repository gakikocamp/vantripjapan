/**
 * VTJ 料金カレンダー（シーズン係数）— フレキシブル価格の単一設定表
 *
 * ⚠️ functions/_rate-calendar.js と RATE_DATA を完全に同一に保つこと
 *    （qa-i18n-smoke.js が両ファイルの一致を検査する）
 *
 * エントリ仕様:
 *   from/to    : 適用期間 (from <= 日 < to, YYYY-MM-DD)
 *   factor     : 平日・週末レートに掛かる係数 (1.30 = +30%)
 *   early      : 早割 { until: 'YYYY-MM-DD', factor } — 予約日(今日)が until 以前なら
 *                こちらの係数を使う（＝日付が来ると自動で満額に上がる）
 *   vehicles   : 対象車種 slug 配列 (省略 = 全車)
 *   key        : 表示ラベル用 i18n キー (season.<key>)
 *
 * 数式: 総額 = 従来の週単位式(平日/週末/長期割引) × 期間中の平均係数
 */
/* RATE_DATA_START */
var VTJ_RATE_DATA = [
  { "from": "2026-10-01", "to": "2026-11-01", "factor": 1.10, "vehicles": ["bongo"], "key": "autumn" },
  { "from": "2027-03-20", "to": "2027-04-11", "factor": 1.30, "early": { "until": "2027-01-31", "factor": 1.15 }, "key": "sakura" },
  { "from": "2027-04-11", "to": "2027-06-01", "factor": 1.10, "key": "spring" }
];
/* RATE_DATA_END */

(function () {
  var DISCOUNT_TIERS = [
    { minDays: 21, rate: 0.20, label: '20% OFF' },
    { minDays: 14, rate: 0.15, label: '15% OFF' },
    { minDays: 7, rate: 0.10, label: '10% OFF' }
  ];

  function entryFactor(e) {
    if (e.early && new Date().toISOString().slice(0, 10) <= e.early.until) return e.early.factor;
    return e.factor;
  }

  function factorForDate(iso, slug, seasons) {
    var today = new Date().toISOString().slice(0, 10);
    for (var i = 0; i < VTJ_RATE_DATA.length; i++) {
      var e = VTJ_RATE_DATA[i];
      if (e.vehicles && e.vehicles.indexOf(slug) === -1) continue;
      if (iso >= e.from && iso < e.to) {
        var factor = entryFactor(e);
        if (seasons && factor !== 1) seasons[e.key] = { early: !!(e.early && today <= e.early.until) };
        return factor;
      }
    }
    return 1;
  }

  // from(YYYY-MM-DD)からdays日間・車種slugの平均係数と適用シーズン({key:{early}})を返す
  window.VTJ_rateFactor = function (fromStr, days, slug) {
    var total = 0, seasons = {};
    var d = new Date(fromStr + 'T00:00:00Z');
    for (var i = 0; i < days; i++) {
      var iso = d.toISOString().slice(0, 10);
      var f = factorForDate(iso, slug, seasons);
      total += f;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return { factor: days > 0 ? total / days : 1, seasons: seasons };
  };

  // 日付が確定した見積もりの共通式。各日ごとに週末・季節料金を計算後、長期割引を適用する。
  window.VTJ_quoteRental = function (base, fromStr, days, slug) {
    if (!(base > 0) || !(days > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(fromStr || '')) return null;
    var subtotal = 0, seasons = {};
    var d = new Date(fromStr + 'T00:00:00Z');
    for (var i = 0; i < days; i++) {
      var iso = d.toISOString().slice(0, 10);
      var weekendFactor = (d.getUTCDay() === 0 || d.getUTCDay() === 6) ? 1.5 : 1;
      subtotal += Math.round(base * weekendFactor * factorForDate(iso, slug, seasons));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    var discount = { rate: 0, label: '' };
    for (var j = 0; j < DISCOUNT_TIERS.length; j++) {
      if (days >= DISCOUNT_TIERS[j].minDays) {
        discount = DISCOUNT_TIERS[j];
        break;
      }
    }
    return {
      subtotal: subtotal,
      total: Math.round(subtotal * (1 - discount.rate)),
      discount: discount,
      seasons: seasons
    };
  };
})();
