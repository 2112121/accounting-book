// 分帳金額分配：依比例拆分，但保證加總剛好等於總額。
// 每筆支出各自四捨五入會產生對不起來的零頭，餘額永遠結不乾淨，
// 所以改用最大餘數法：先無條件捨去，剩下的餘數再發出去。
//
// preferredIndex 決定餘數從誰開始發（通常是這筆的付款人）。
// 若固定從第 0 個人開始，每一筆的零頭都會落在同一個人頭上，
// 累積下來那個人就得多付好幾塊錢。
export const allocateByShares = (
  total: number,
  shares: number[],
  preferredIndex = 0,
): number[] => {
  if (shares.length === 0) return [];

  const shareSum = shares.reduce((sum, share) => sum + share, 0);
  if (shareSum <= 0) {
    // 沒有比例可依據時平均分配，一樣要補足餘數
    return allocateByShares(total, shares.map(() => 1), preferredIndex);
  }

  const exact = shares.map((share) => (total * share) / shareSum);
  const result = exact.map((value) => Math.floor(value));
  let remainder = Math.round(total - result.reduce((sum, value) => sum + value, 0));

  // 先把順序轉成從 preferredIndex 開始，再依小數部分由大到小排。
  // sort 是穩定的，所以小數部分相同時會維持這個起點順序。
  const start = shares.length
    ? ((preferredIndex % shares.length) + shares.length) % shares.length
    : 0;
  const byFraction = shares
    .map((_, offset) => (start + offset) % shares.length)
    .map((index) => ({ index, fraction: exact[index] - Math.floor(exact[index]) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (let i = 0; i < byFraction.length && remainder > 0; i++) {
    result[byFraction[i].index] += 1;
    remainder -= 1;
  }

  return result;
};

// 平均分攤：人人相同，零頭從 preferredIndex 開始發
export const allocateEqually = (total: number, count: number, preferredIndex = 0): number[] =>
  allocateByShares(total, new Array(count).fill(1), preferredIndex);
