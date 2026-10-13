// 分帳金額分配：依比例拆分，但保證加總剛好等於總額。
// 每筆支出各自四捨五入會產生對不起來的零頭，餘額永遠結不乾淨，
// 所以改用最大餘數法：先無條件捨去，剩下的餘數發給小數部分最大的人。
export const allocateByShares = (total: number, shares: number[]): number[] => {
  if (shares.length === 0) return [];

  const shareSum = shares.reduce((sum, share) => sum + share, 0);
  if (shareSum <= 0) {
    // 沒有比例可依據時平均分配，一樣要補足餘數
    return allocateByShares(total, shares.map(() => 1));
  }

  const exact = shares.map((share) => (total * share) / shareSum);
  const result = exact.map((value) => Math.floor(value));
  let remainder = Math.round(total - result.reduce((sum, value) => sum + value, 0));

  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (let i = 0; i < byFraction.length && remainder > 0; i++) {
    result[byFraction[i].index] += 1;
    remainder -= 1;
  }

  return result;
};

// 平均分攤：人人相同，餘數發給排在前面的人
export const allocateEqually = (total: number, count: number): number[] =>
  allocateByShares(total, new Array(count).fill(1));
