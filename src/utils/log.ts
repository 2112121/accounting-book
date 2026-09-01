// 統一的錯誤輸出：原本大量 catch 直接吞掉錯誤，
// 資料少一筆、欄位漏一個都不會有任何訊息，只能靠肉眼發現。
export const logError = (scope: string, error: unknown) => {
  console.error(`[${scope}]`, error);
};
