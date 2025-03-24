import React, { useState, useRef, useEffect } from "react";

interface ExpenseFormProps {
  onSave: (expense: {
    amount: number;
    category: string;
    date: string;
    notes: string;
    attachments?: File[];
  }) => void;
  onCancel: () => void;
  expense?: {
    id: string;
    amount: number;
    category: string;
    date: string;
    notes: string;
    attachments?: string[];
  } | null;
}

// 支援的貨幣類型
type CurrencyType =
  | "TWD"
  | "USD"
  | "JPY"
  | "EUR"
  | "CNY"
  | "GBP"
  | "AUD"
  | "KRW"
  | "HKD";

// 貨幣資訊
interface CurrencyInfo {
  code: CurrencyType;
  name: string;
  symbol: string;
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({
  onSave,
  onCancel,
  expense,
}) => {
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<string>("餐飲");
  const [date, setDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 貨幣轉換相關狀態
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyType>("TWD");
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [showCurrencySelector, setShowCurrencySelector] =
    useState<boolean>(false);

  const categories = [
    { id: "dining", name: "餐飲", icon: "fa-utensils" },
    { id: "transportation", name: "交通", icon: "fa-car" },
    { id: "entertainment", name: "娛樂", icon: "fa-film" },
    { id: "shopping", name: "購物", icon: "fa-shopping-bag" },
    { id: "education", name: "教育", icon: "fa-book" },
    { id: "health", name: "醫療", icon: "fa-heartbeat" },
    { id: "investment", name: "投資", icon: "fa-chart-line" },
    { id: "utilities", name: "水電", icon: "fa-tint" },
    { id: "other", name: "其他", icon: "fa-ellipsis-h" },
  ];

  // 支援的貨幣列表
  const currencies: CurrencyInfo[] = [
    { code: "TWD", name: "新臺幣", symbol: "NT$" },
    { code: "USD", name: "美元", symbol: "$" },
    { code: "JPY", name: "日圓", symbol: "¥" },
    { code: "EUR", name: "歐元", symbol: "€" },
    { code: "CNY", name: "人民幣", symbol: "¥" },
    { code: "GBP", name: "英鎊", symbol: "£" },
    { code: "AUD", name: "澳元", symbol: "A$" },
    { code: "KRW", name: "韓元", symbol: "₩" },
    { code: "HKD", name: "港幣", symbol: "HK$" },
  ];

  // 獲取今天日期的函數
  const getTodayDate = () => {
    const today = new Date();
    // 強制設置為當地時間以避免時區問題
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // 組件初始化時設置當前日期
  useEffect(() => {
    // 初始化加載時設置日期
    if (!expense) {
      const currentDate = getTodayDate();
      console.log("設置初始日期為:", currentDate);
      setDate(currentDate);
    }
  }, []); // 僅在組件掛載時執行一次

  // 當 expense 變更時，更新表單值
  useEffect(() => {
    if (expense) {
      setAmount(expense.amount.toString());
      setCategory(expense.category);
      setDate(expense.date);
      setNotes(expense.notes || "");
      // 重置貨幣為TWD，因為已存儲的支出都是以TWD為單位
      setSelectedCurrency("TWD");
      setConvertedAmount(null);
      setExchangeRate(null);
    } else {
      // 如果不是編輯模式，重置表單值
      setAmount("");
      setCategory("餐飲");
      // 重置日期為今天
      const todayDate = getTodayDate();
      console.log("重置日期為今天:", todayDate);
      setDate(todayDate);
      setNotes("");
      // 重置貨幣相關值
      setSelectedCurrency("TWD");
      setConvertedAmount(null);
      setExchangeRate(null);
    }
  }, [expense]);

  // 獲取匯率的函數
  const fetchExchangeRate = async (
    from: CurrencyType,
    to: CurrencyType = "TWD",
  ) => {
    if (from === to) {
      // 如果貨幣相同，匯率為1
      setExchangeRate(1);
      return 1;
    }

    setIsConverting(true);
    try {
      // 使用免費的匯率API：Exchange Rate API (https://www.exchangerate-api.com/)
      // 注意：在實際應用中，您需要註冊一個API密鑰
      const response = await fetch(`https://open.er-api.com/v6/latest/${from}`);
      const data = await response.json();

      if (data && data.rates && data.rates[to]) {
        const rate = data.rates[to];
        console.log(`匯率: 1 ${from} = ${rate} ${to}`);
        setExchangeRate(rate);
        return rate;
      } else {
        throw new Error("無法獲取匯率數據");
      }
    } catch (error) {
      console.error("獲取匯率失敗:", error);
      setError("獲取匯率失敗，請稍後再試");
      return null;
    } finally {
      setIsConverting(false);
    }
  };

  // 當貨幣或金額變更時，更新轉換後的金額
  useEffect(() => {
    const updateConvertedAmount = async () => {
      const numAmount = parseFloat(amount);
      if (!isNaN(numAmount) && numAmount > 0 && selectedCurrency !== "TWD") {
        // 先檢查是否已有匯率
        let rate = exchangeRate;
        if (!rate) {
          rate = await fetchExchangeRate(selectedCurrency);
        }

        if (rate) {
          const converted = Math.round(numAmount * rate);
          setConvertedAmount(converted);
        }
      } else if (selectedCurrency === "TWD") {
        // 如果選擇的是TWD，直接使用輸入金額
        const numAmount = parseFloat(amount);
        if (!isNaN(numAmount) && numAmount > 0) {
          setConvertedAmount(numAmount);
        } else {
          setConvertedAmount(null);
        }
      } else {
        setConvertedAmount(null);
      }
    };

    updateConvertedAmount();
  }, [amount, selectedCurrency, exchangeRate]);

  // 處理貨幣變更
  const handleCurrencyChange = (currency: CurrencyType) => {
    setSelectedCurrency(currency);
    setShowCurrencySelector(false);
    // 觸發匯率更新
    fetchExchangeRate(currency);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 驗證輸入 - 轉換為數字並驗證
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("請輸入有效金額");
      return;
    }

    if (!category) {
      setError("請選擇類別");
      return;
    }

    try {
      // 防止重複提交
      if (isSubmitting) {
        console.log("表單正在提交中，阻止重複提交");
        return;
      }

      setIsSubmitting(true);
      setError("");

      // 計算最終提交金額（TWD）
      let finalAmount: number;
      let additionalNote: string = "";

      if (selectedCurrency === "TWD") {
        finalAmount = numAmount;
      } else {
        // 確保有有效的轉換金額
        if (!convertedAmount) {
          const rate = await fetchExchangeRate(selectedCurrency);
          if (!rate) {
            setError("無法轉換貨幣，請稍後再試");
            setIsSubmitting(false);
            return;
          }
          finalAmount = Math.round(numAmount * rate);
        } else {
          finalAmount = convertedAmount;
        }

        // 添加原始貨幣資訊到備註
        const currencySymbol =
          currencies.find((c) => c.code === selectedCurrency)?.symbol ||
          selectedCurrency;
        additionalNote = `(來自 ${currencySymbol}${numAmount} ${selectedCurrency})`;
      }

      // 合併備註
      const finalNotes = notes
        ? `${notes} ${additionalNote}`
        : additionalNote
          ? additionalNote
          : "";

      console.log("提交支出表單:", {
        amount: finalAmount,
        category,
        date,
        notes: finalNotes,
        originalAmount: selectedCurrency !== "TWD" ? numAmount : undefined,
        originalCurrency:
          selectedCurrency !== "TWD" ? selectedCurrency : undefined,
      });

      // 提交數據 - 使用轉換後的數字和更新的備註
      const result = await onSave({
        amount: finalAmount,
        category,
        date,
        notes: finalNotes,
      });

      console.log("提交結果:", result);

      // 重置表單
      if (!expense) {
        setAmount("");
        setCategory("餐飲");
        setDate(getTodayDate());
        setNotes("");
        setSelectedCurrency("TWD");
        setConvertedAmount(null);
        setExchangeRate(null);
      }

      // 重置提交狀態
      setIsSubmitting(false);
    } catch (err) {
      console.error("表單提交錯誤:", err);
      setError("提交表單時出現錯誤，請稍後再試");
      setIsSubmitting(false);
    }
  };

  // 獲取當前貨幣信息
  const currentCurrency =
    currencies.find((c) => c.code === selectedCurrency) || currencies[0];

  return (
    <div className="max-h-full overflow-y-auto px-2 py-3">
      <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">
        {expense ? "編輯支出記錄" : "新增支出記錄"}
      </h2>

      {error && (
        <div className="bg-red-50 text-red-500 p-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="form-group">
          <label htmlFor="amount" className="form-label">
            金額
          </label>
          <div className="relative">
            <div className="flex">
              <div className="relative flex-1">
                <div className="absolute left-0 top-0 bottom-0 flex items-center pl-3 pointer-events-none">
                  <span className="text-gray-500 min-w-[60px] block text-left">
                    {currentCurrency.symbol}
                  </span>
                </div>
                <input
                  type="text"
                  id="amount"
                  value={amount}
                  onChange={(e) => {
                    // 只允許數字和一個小數點
                    const value = e.target.value;
                    const regex = /^[0-9]*\.?[0-9]*$/;
                    if (regex.test(value) || value === "") {
                      setAmount(value);
                    }
                  }}
                  placeholder="輸入金額"
                  className="form-input pl-[62px]"
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => setShowCurrencySelector(!showCurrencySelector)}
                className="ml-2 px-3 py-2 bg-[#8A5DC8] hover:bg-[#A487C3] text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white transition-all duration-300"
              >
                <span>{selectedCurrency}</span>
                <i
                  className={`fas fa-chevron-${showCurrencySelector ? "up" : "down"} ml-2`}
                ></i>
              </button>
            </div>

            {/* 貨幣選擇器下拉菜單 */}
            {showCurrencySelector && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="max-h-60 overflow-y-auto">
                  {currencies.map((currency) => (
                    <button
                      key={currency.code}
                      type="button"
                      onClick={() => handleCurrencyChange(currency.code)}
                      className={`w-full px-4 py-2 text-left focus:outline-none ${
                        selectedCurrency === currency.code
                          ? "bg-[#8A5DC8] text-white"
                          : "bg-[#F8F3FF] text-gray-500 hover:bg-[#F0E6FF] hover:text-[#A487C3]"
                      }`}
                    >
                      <div className="flex items-center">
                        <span className="w-10">{currency.symbol}</span>
                        <span>{currency.code}</span>
                        <span className="ml-2 text-gray-500 text-sm">
                          {currency.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 貨幣轉換結果 */}
          {selectedCurrency !== "TWD" && (
            <div className="mt-2">
              {isConverting ? (
                <div className="flex items-center text-sm text-gray-500">
                  <div className="w-4 h-4 border-t-2 border-b-2 border-[#A487C3] rounded-full animate-spin mr-2"></div>
                  <span>正在獲取匯率...</span>
                </div>
              ) : convertedAmount ? (
                <div className="text-sm">
                  <span className="text-gray-500">
                    {`${currentCurrency.symbol}${amount} ${selectedCurrency} ≈ `}
                  </span>
                  <span className="text-[#A487C3] font-medium">
                    {`NT$${convertedAmount.toLocaleString()} TWD`}
                  </span>
                  {exchangeRate && (
                    <span className="text-xs text-gray-400 ml-2">
                      {`(匯率: 1 ${selectedCurrency} = ${exchangeRate.toFixed(4)} TWD)`}
                    </span>
                  )}
                </div>
              ) : amount ? (
                <div className="text-sm text-gray-500">
                  請輸入有效金額以查看轉換結果
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">支出類別</label>
          <div className="grid grid-cols-3 gap-2">
            {categories.map((cat) => (
              <div
                key={cat.id}
                onClick={() => setCategory(cat.name)}
                className={`cursor-pointer flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-300 ${
                  category === cat.name
                    ? "border-[#A487C3] bg-gradient-to-br from-[#FFF9F0] to-white shadow-md"
                    : "border-gray-200 hover:border-[#C6B2DD] hover:shadow-sm"
                }`}
              >
                <div
                  className={`text-lg mb-1 ${
                    cat.id === "utilities"
                      ? category === cat.name
                        ? "text-[#A487C3]"
                        : "text-gray-500"
                      : category === cat.name
                        ? "text-[#A487C3]"
                        : "text-gray-500"
                  }`}
                >
                  <i className={`fas ${cat.icon}`}></i>
                </div>
                <span
                  className={`text-xs ${category === cat.name ? "text-[#A487C3] font-medium" : "text-gray-600"}`}
                >
                  {cat.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="date" className="form-label">
            日期
          </label>
          <input
            type="date"
            id="date"
            value={date}
            onChange={(e) => {
              console.log("日期已變更為:", e.target.value);
              setDate(e.target.value);
            }}
            className="form-input focus:border-[#A487C3] focus:ring-[#FFF9F0] transition-all duration-300"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="notes" className="form-label">
            備註 (選填)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="添加備註..."
            className="form-input focus:border-[#A487C3] focus:ring-[#FFF9F0] transition-all duration-300"
            rows={2}
          ></textarea>
          {selectedCurrency !== "TWD" && (
            <p className="text-xs text-gray-500 mt-1">
              <i className="fas fa-info-circle mr-1"></i>
              將自動添加原始貨幣資訊到備註
            </p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting || isConverting}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-[#A487C3] to-[#C6B2DD] hover:from-[#9678B6] hover:to-[#B9A0D5] text-white rounded-lg font-medium transition-all duration-300 shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "處理中..." : expense ? "更新" : "保存"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 px-4 bg-gradient-to-r from-[#F1F3F5] to-[#E9ECEF] hover:from-[#E9ECEF] hover:to-[#DEE2E6] text-[#495057] rounded-lg font-medium transition-all duration-300 shadow-sm hover:shadow-md"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
};

export default ExpenseForm;
