/**
 * 格式化金額為台幣顯示格式
 * @param amount 金額數值
 * @returns 格式化後的金額字符串，例如 NT$1,234
 */
export const formatAmount = (amount: number): string => {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

/**
 * 格式化日期為本地化顯示格式
 * @param date 日期對象
 * @returns 格式化後的日期字符串，例如 2023/12/31
 */
export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}; 