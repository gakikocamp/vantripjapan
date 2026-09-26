// 同じテーマで検索を取り合っていた記事を1本にまとめた（2026-09-26）。
// 旧URLは統合先へ301で送り、サイトマップと記事一覧からも外す。記事そのものはCMSに残してあるので、
// ここから行を消せば元に戻る。統合先は GSC 直近90日の表示回数で選んだ
// （紅葉: 536 vs 81/79、夏: 2,249 vs 399、よくある失敗: 60 vs 17。追加分は下の行のコメント）。
export const CONSOLIDATED = {
  'autumn-foliage-kyushu-campervan': 'kyushu-autumn-road-trip',
  'kyushu-autumn-leaves-campervan': 'kyushu-autumn-road-trip',
  'summer-kyushu-campervan-2026': 'kyushu-summer-guide',
  'japan-campervan-mistakes': 'campervan-japan-mistakes-avoid',
  // 2026-09-26 追加（高千穂峡: 258 vs 4,900、シャワー: 483 vs 1,436、阿蘇: 96 vs 330）
  'takachiho-gorge-guide': 'takachiho-gorge-campervan-complete-guide',
  'where-to-shower-campervan-japan': 'shower-campervan-japan-guide',
  'aso-campervan-guide': 'mount-aso-campervan-guide',
};

export function isConsolidated(slug) {
  return Object.prototype.hasOwnProperty.call(CONSOLIDATED, slug || '');
}
