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
  function entryFactor(e) {
    if (e.early && new Date().toISOString().slice(0, 10) <= e.early.until) return e.early.factor;
    return e.factor;
  }
  // from(YYYY-MM-DD)からdays日間・車種slugの平均係数と適用シーズン({key:{early}})を返す
  window.VTJ_rateFactor = function (fromStr, days, slug) {
    var total = 0, seasons = {};
    var today = new Date().toISOString().slice(0, 10);
    var d = new Date(fromStr + 'T00:00:00Z');
    for (var i = 0; i < days; i++) {
      var iso = d.toISOString().slice(0, 10);
      var f = 1;
      for (var j = 0; j < VTJ_RATE_DATA.length; j++) {
        var e = VTJ_RATE_DATA[j];
        if (e.vehicles && slug && e.vehicles.indexOf(slug) === -1) continue;
        if (iso >= e.from && iso < e.to) {
          f = entryFactor(e);
          if (f !== 1) seasons[e.key] = { early: !!(e.early && today <= e.early.until) };
          break;
        }
      }
      total += f;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return { factor: days > 0 ? total / days : 1, seasons: seasons };
  };
})();
