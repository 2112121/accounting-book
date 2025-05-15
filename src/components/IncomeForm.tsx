import React, { useState, useRef, useEffect } from "react";
import Calculator from './Calculator';

interface IncomeFormProps {
  onSave: (income: {
    amount: number;
    category: string;
    date: string;
    notes: string;
    attachments?: File[];
  }) => void;
  onCancel: () => void;
  income?: {
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

const IncomeForm: React.FC<IncomeFormProps> = ({
  onSave,
  onCancel,
  income,
}) => {
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<string>("薪資");
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
    
  // 計算機相關狀態
  const [showCalculator, setShowCalculator] = useState<boolean>(false);
  const [calculatorInput, setCalculatorInput] = useState<string>('');
  const [calculatorResult, setCalculatorResult] = useState<string>('0');

  // 收入類別列表
  const categories = [
    { id: "salary", name: "薪資", icon: "fa-money-bill-wave" },
    { id: "bonus", name: "獎金", icon: "fa-gift" },
    { id: "investment", name: "投資", icon: "fa-chart-line" },
    { id: "sidejob", name: "副業", icon: "fa-briefcase" },
    { id: "gift", name: "禮金", icon: "fa-envelope" },
    { id: "other", name: "其他", icon: "fa-question" },
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
    if (!income) {
      const currentDate = getTodayDate();
      console.log("設置初始日期為:", currentDate);
      setDate(currentDate);
    }
  }, []); // 僅在組件掛載時執行一次

  // 當 income 變更時，更新表單值
  useEffect(() => {
    if (income) {
      setAmount(income.amount.toString());
      setCategory(income.category);
      setDate(income.date);
      setNotes(income.notes || "");
      // 重置貨幣為TWD，因為已存儲的收入都是以TWD為單位
      setSelectedCurrency("TWD");
      setConvertedAmount(null);
      setExchangeRate(null);
    } else {
      // 如果不是編輯模式，重置表單值
      setAmount("");
      setCategory("薪資");
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
  }, [income]);

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

      console.log("提交收入表單:", {
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
      if (!income) {
        setAmount("");
        setCategory("薪資");
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
    
  // 計算機功能
  const calculateResult = () => {
    try {
      // 替換顯示的乘號和除號為JS可以運算的符號
      const expression = calculatorInput.replace(/×/g, '*').replace(/÷/g, '/');
      const result = eval(expression);
      setCalculatorResult(Number.isInteger(result) ? result.toString() : result.toFixed(2));
    } catch (error) {
      setCalculatorResult('錯誤');
    }
  };

  // 處理計算機按鈕點擊
  const handleCalculatorClick = (value: string) => {
    if (value === 'C') {
      // 清除輸入
      setCalculatorInput('');
      setCalculatorResult('0');
    } else if (value === '=') {
      // 計算結果
      calculateResult();
    } else if (value === '←') {
      // 刪除最後一個字符
      setCalculatorInput(prev => prev.slice(0, -1));
    } else {
      // 添加輸入
      setCalculatorInput(prev => prev + value);
    }
  };
  
  // 關閉計算機
  const closeCalculator = () => {
    setShowCalculator(false);
  };
  
  // 使用計算結果作為金額
  const useCalculatorResult = (result: string) => {
    if (result && result !== '錯誤') {
      setAmount(result);
      closeCalculator();
      
      // 提供視覺反饋
      const amountInput = document.getElementById('amount');
      if (amountInput) {
        amountInput.classList.add('ring-2', 'ring-green-400');
        setTimeout(() => {
          amountInput.classList.remove('ring-2', 'ring-green-400');
        }, 1000);
      }
    }
  };

  return (
    <div className="p-3">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xl font-bold text-[#4EA8DE]">
          {income ? "編輯收入" : "新增收入"}
        </h2>
        <button 
          onClick={onCancel}
          className="text-white hover:text-white bg-[#4EA8DE] hover:bg-[#3D97CD] w-7 h-7 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all"
          aria-label="關閉表單"
        >
          <i className="fas fa-times text-sm"></i>
        </button>
      </div>

      {error && (
        <div className="bg-red-100 text-red-600 p-3 rounded-lg mb-3 text-xs font-medium">
          <i className="fas fa-exclamation-circle mr-1"></i>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 金額輸入區 */}
        <div>
          <label htmlFor="amount" className="block text-sm font-semibold text-gray-800 mb-1">
            金額
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center">
              <button
                type="button"
                onClick={() => setShowCurrencySelector(!showCurrencySelector)}
                className="h-full px-3 bg-gray-100 border-r rounded-l-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors flex items-center gap-1"
                title="點擊選擇貨幣"
              >
                <span>{currencies.find(c => c.code === selectedCurrency)?.symbol || "NT$"}</span>
                <i className="fas fa-chevron-down text-xs opacity-80"></i>
              </button>
            </div>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="輸入金額"
              className="w-full pl-[4.5rem] pr-12 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4EA8DE] focus:border-[#4EA8DE] text-sm text-gray-800"
              required
              step="0.01"
              min="0"
            />
            {/* 計算機按鈕 */}
            <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
              <button
                type="button"
                onClick={() => setShowCalculator(true)}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-[#4EA8DE] hover:text-[#3D97CD] transition-all flex items-center justify-center shadow-sm"
                title="打開計算機"
              >
                <i className="fas fa-calculator"></i>
              </button>
            </div>
          </div>

          {/* 提示說明 - 移到貨幣選擇器下面 */}
          <div className="mt-1 space-y-1">
            <div className="text-xs text-gray-500 flex items-center">
              <i className="fas fa-info-circle mr-1.5 text-[#4EA8DE]"></i>
              <span>點擊左側按鈕可切換貨幣，右側按鈕可開啟計算機</span>
            </div>
            <div className="text-xs text-gray-500 flex items-center">
              <i className="fas fa-money-bill-wave mr-1.5 text-[#4EA8DE]"></i>
              <span>所有收入均以新台幣(NT$)記錄於系統中</span>
            </div>
          </div>

          {/* 貨幣選擇器 */}
          {showCurrencySelector && (
            <div className="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-10 relative max-h-48 overflow-y-auto animate-fadeIn" style={{boxShadow: '0 4px 20px rgba(0,0,0,0.1)'}}>
              <div className="pb-2 mb-2 border-b border-gray-100 px-1">
                <h4 className="text-xs font-medium text-gray-700 flex items-center">
                  <i className="fas fa-money-bill-wave text-[#4EA8DE] mr-1.5"></i>
                  選擇貨幣
                </h4>
              </div>
              <ul className="grid grid-cols-3 gap-1">
                {currencies.map((currency) => (
                  <li key={currency.code}>
                    <button
                      type="button"
                      onClick={() => handleCurrencyChange(currency.code)}
                      className={`w-full text-xs py-2 px-2 rounded-md text-left flex flex-col ${
                        selectedCurrency === currency.code
                          ? "bg-gradient-to-r from-[#4EA8DE] to-[#3D97CD] text-white font-bold border border-[#3D97CD]"
                          : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
                      } transition-all duration-200 hover:shadow-sm`}
                    >
                      <span className="font-semibold flex items-center">
                        {currency.symbol} <span className="ml-1">({currency.code})</span>
                      </span>
                      <span className={`text-[11px] ${selectedCurrency === currency.code ? "text-white" : "text-gray-600"}`}>
                        {currency.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 轉換金額顯示 */}
          {selectedCurrency !== "TWD" && (
            <div className="mt-1 text-xs text-gray-600 flex items-center bg-blue-50 p-1.5 rounded-md">
              {isConverting ? (
                <span className="flex items-center">
                  <div className="w-3 h-3 border-t-2 border-b-2 border-[#4EA8DE] rounded-full animate-spin mr-1.5"></div>
                  <span>轉換中...</span>
                </span>
              ) : (
                <>
                  {convertedAmount ? (
                    <span className="flex items-center">
                      <i className="fas fa-exchange-alt text-blue-500 mr-1.5"></i>
                      <span className="text-gray-700 font-medium">約 NT$ {convertedAmount.toLocaleString()}</span>
                      {exchangeRate && (
                        <span className="ml-1">
                          (1 {selectedCurrency} ≈ {exchangeRate.toFixed(2)} TWD)
                        </span>
                      )}
                    </span>
                  ) : amount ? (
                    <span className="flex items-center">
                      <i className="fas fa-exclamation-circle text-yellow-500 mr-1.5"></i>
                      請輸入有效金額以進行轉換
                    </span>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>

        {/* 類別選擇 */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">
            類別
          </label>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
            {categories.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setCategory(cat.name)}
                className={`flex flex-col items-center justify-center p-1.5 rounded-lg text-xs transition-all ${
                  category === cat.name
                    ? "bg-[#EBF6FF] text-[#4EA8DE] font-medium shadow-sm border border-[#B8E3FF]"
                    : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                }`}
              >
                <i className={`fas ${cat.icon} text-base mb-1.5`}></i>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 日期選擇 */}
        <div>
          <label htmlFor="date" className="block text-sm font-semibold text-gray-800 mb-1">
            日期
          </label>
          <input
            type="date"
            id="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4EA8DE] focus:border-[#4EA8DE] text-sm text-gray-800"
            required
          />
        </div>

        {/* 備註 */}
        <div>
          <label htmlFor="notes" className="block text-sm font-semibold text-gray-800 mb-1">
            備註 <span className="text-xs text-gray-500">(選填)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4EA8DE] focus:border-[#4EA8DE] text-sm text-gray-800"
            placeholder="輸入備註"
            rows={2}
          />
        </div>

        {/* 按鈕 */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors text-sm font-medium"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-2 px-4 bg-[#4EA8DE] hover:bg-[#3D97CD] text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="w-4 h-4 border-t-2 border-b-2 border-white rounded-full animate-spin mr-1"></div>
                處理中...
              </div>
            ) : (
              income ? "保存修改" : "新增收入"
            )}
          </button>
        </div>
      </form>

      {/* 計算機彈窗 */}
      {showCalculator && (
        <Calculator 
          onClose={closeCalculator}
          onUseResult={useCalculatorResult}
          initialValue={amount || ''}
          onlyCopy={false}
        />
      )}
    </div>
  );
};

export default IncomeForm; 