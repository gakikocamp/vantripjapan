// 同じテーマで検索を取り合っていた記事を1本にまとめた（2026-09-26）。
// 旧URLは統合先へ301で送り、サイトマップと記事一覧からも外す。記事そのものはCMSに残してあるので、
// ここから行を消せば元に戻る。統合先は GSC 直近90日の表示回数で選んだ
// （紅葉: 536 vs 81/79、夏: 2,249 vs 399、よくある失敗: 60 vs 17）。
export const CONSOLIDATED = {
  'autumn-foliage-kyushu-campervan': 'kyushu-autumn-road-trip',
  'kyushu-autumn-leaves-campervan': 'kyushu-autumn-road-trip',
  'summer-kyushu-campervan-2026': 'kyushu-summer-guide',
  'japan-campervan-mistakes': 'campervan-japan-mistakes-avoid',
};

export function isConsolidated(slug) {
  return Object.prototype.hasOwnProperty.call(CONSOLIDATED, slug || '');
}
