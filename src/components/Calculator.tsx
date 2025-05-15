import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CalculatorProps {
  onClose: () => void;
  onUseResult?: (result: string) => void;
  onlyCopy?: boolean; // 新增參數: 是否只允許複製結果而非直接使用
  initialValue?: string;
}

const Calculator: React.FC<CalculatorProps> = ({ 
  onClose, 
  onUseResult, 
  onlyCopy = false, // 默認為false，表示可以使用結果
  initialValue = '' 
}) => {
  const [input, setInput] = useState<string>(initialValue);
  const [result, setResult] = useState<string>('0');
  const [calculating, setCalculating] = useState<boolean>(false);
  const [showResult, setShowResult] = useState<boolean>(false);
  const [shake, setShake] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // 設置初始值
  useEffect(() => {
    if (initialValue) {
      setInput(initialValue);
      // 不立即計算，只顯示初始值
      setResult(initialValue);
    }
  }, [initialValue]);

  // 驗證表達式合法性，但不計算結果
  const validateExpression = (expression: string): boolean => {
    if (!expression) return true;

    try {
      // 基本檢查括號是否平衡
      let openBrackets = 0;
      for (let char of expression) {
        if (char === '(') openBrackets++;
        if (char === ')') openBrackets--;
        if (openBrackets < 0) return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  };

  // 計算表達式結果（只在按下等號或需要最終結果時執行）
  const calculateExpression = (expression: string): string => {
    if (!expression) {
      return '0';
    }

    try {
      // 預處理表達式
      let sanitizedExpression = expression
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/\s/g, '')
        .replace(/(\d)(\()/g, '$1*$2')  // 處理 5(3) -> 5*(3)
        .replace(/\)(\d)/g, ')*$1')     // 處理 (3)5 -> (3)*5
        .replace(/--/g, '+');           // 處理 5--3 -> 5+3
      
      // 檢查是否有連續運算符
      if (/[+\-*/]{2,}/.test(sanitizedExpression) && 
          !sanitizedExpression.includes('*-') && 
          !sanitizedExpression.includes('/-')) {
        throw new Error('連續運算符無效');
      }
      
      // 檢查括號是否平衡
      let openBrackets = 0;
      for (let char of sanitizedExpression) {
        if (char === '(') openBrackets++;
        if (char === ')') openBrackets--;
        if (openBrackets < 0) throw new Error('括號不匹配');
      }
      if (openBrackets !== 0) throw new Error('括號不匹配');
      
      // 檢查是否以運算符結尾（除了括號）
      if (/[+\-*/]$/.test(sanitizedExpression)) {
        sanitizedExpression += '0';
      }
      
      // 使用 Function 構造器而不是 eval
      // eslint-disable-next-line no-new-func
      const calculateFn = new Function(`return ${sanitizedExpression}`);
      let calculatedResult = calculateFn();
      
      // 檢查結果是否為有效數字
      if (typeof calculatedResult !== 'number' || !isFinite(calculatedResult)) {
        throw new Error('計算結果無效');
      }
      
      // 格式化結果（最多顯示6位小數）
      return parseFloat(calculatedResult.toFixed(6)).toString();
    } catch (error) {
      console.error('計算錯誤:', error);
      return '錯誤';
    }
  };

  // 處理按鈕點擊
  const handleButtonClick = (value: string) => {
    switch (value) {
      case 'C':
        // 清除計算
        setInput('');
        setResult('0');
        setShowResult(false);
        setCopySuccess(false);
        break;
      case '=':
        // 計算結果
        if (input) {
          setCalculating(true);
          setTimeout(() => {
            const calculatedResult = calculateExpression(input);
            setResult(calculatedResult);
            setShowResult(true);
            setCalculating(false);
            setCopySuccess(false);
            
            // 計算結果為錯誤時添加震動效果
            if (calculatedResult === '錯誤') {
              setShake(true);
              setTimeout(() => setShake(false), 500);
            }
          }, 150);
        }
        break;
      case '←':
        // 刪除最後一個字符
        setInput(prev => {
          const newInput = prev.slice(0, -1);
          // 如果刪除後為空，則設置結果為0
          if (!newInput) {
            setResult('0');
            setShowResult(false);
            setCopySuccess(false);
          }
          return newInput;
        });
        break;
      default:
        // 添加按鈕值到輸入前先檢查有效性
        setInput(prev => {
          setCopySuccess(false);
          // 檢查是否為運算符
          const isOperator = ['+', '-', '×', '÷'].includes(value);
          
          // 如果是運算符且前一個字符也是運算符，則替換而不是疊加
          if (isOperator && prev.length > 0) {
            const lastChar = prev.charAt(prev.length - 1);
            if (['+', '-', '×', '÷'].includes(lastChar)) {
              // 特殊處理: 允許在運算符後輸入減號（作為負號）
              if (value === '-' && (lastChar === '×' || lastChar === '÷')) {
                return prev + value;
              }
              
              // 替換最後一個運算符
              return prev.slice(0, -1) + value;
            }
          }
          
          let newInput = prev + value;
          
          // 防止多個小數點
          if (value === '.' && prev.includes('.') && !prev.includes('+') && !prev.includes('-') && 
              !prev.includes('×') && !prev.includes('÷') && !prev.includes('(') && !prev.includes(')')) {
            newInput = prev;
          }
          
          // 防止以多個0開頭
          if (value === '0' && prev === '0') {
            newInput = '0';
          }
          
          // 防止非0數字後面跟0
          if (prev === '0' && '123456789'.includes(value)) {
            newInput = value;
          }
          
          // 簡單驗證表達式的基本有效性（僅用於UI反饋，不計算結果）
          validateExpression(newInput);
          setShowResult(false);
          return newInput;
        });
        break;
    }
  };

  // 使用計算結果
  const handleUseResult = () => {
    if (onUseResult && result !== '錯誤') {
      onUseResult(result);
    }
  };

  // 複製計算結果到剪貼板
  const handleCopyResult = () => {
    if (result !== '錯誤' && result !== '0') {
      navigator.clipboard.writeText(result)
        .then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        })
        .catch(err => {
          console.error('複製失敗:', err);
        });
    }
  };

  // 按鈕數據
  const buttons = [
    { value: 'C', type: 'clear', label: 'C' },
    { value: '(', type: 'operator', label: '(' },
    { value: ')', type: 'operator', label: ')' },
    { value: '÷', type: 'operator', label: '÷' },
    { value: '7', type: 'number', label: '7' },
    { value: '8', type: 'number', label: '8' },
    { value: '9', type: 'number', label: '9' },
    { value: '×', type: 'operator', label: '×' },
    { value: '4', type: 'number', label: '4' },
    { value: '5', type: 'number', label: '5' },
    { value: '6', type: 'number', label: '6' },
    { value: '-', type: 'operator', label: '-' },
    { value: '1', type: 'number', label: '1' },
    { value: '2', type: 'number', label: '2' },
    { value: '3', type: 'number', label: '3' },
    { value: '+', type: 'operator', label: '+' },
    { value: '0', type: 'number', label: '0', span: 2 },
    { value: '.', type: 'number', label: '.' },
    { value: '=', type: 'equals', label: '=' },
  ];

  // 按鈕樣式
  const getButtonStyle = (type: string) => {
    switch (type) {
      case 'clear':
        return 'bg-red-400 hover:bg-red-500 text-white';
      case 'operator':
        return 'bg-[#F0EAFA] hover:bg-[#E8DFFC] text-[#7D5BA6]';
      case 'equals':
        return 'bg-[#A487C3] hover:bg-[#8A5DC8] text-white';
      case 'number':
        return 'bg-white hover:bg-gray-50 text-gray-800 border border-gray-200';
      default:
        return 'bg-gray-200 hover:bg-gray-300 text-gray-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-40">
      <div className="w-full max-w-sm bg-white rounded-lg overflow-hidden shadow-lg">
        {/* 標題欄 */}
        <div className="bg-[#A487C3] p-4 text-white">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center">
              <i className="fas fa-calculator mr-3"></i>
              計算機
            </h3>
            <button 
              onClick={onClose}
              className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
        
        {/* 計算屏幕 */}
        <div className={`p-4 bg-white ${shake ? 'animate-shake' : ''}`}>
          <div className="bg-[#F8F5FF] p-4 rounded-md shadow-inner border border-[#E8DFFC] relative">
            {/* 輸入區域 */}
            <div className="text-gray-600 text-sm h-6 overflow-x-auto font-mono whitespace-nowrap">
              {input || ' '}
            </div>
            
            {/* 結果區域 */}
            <div className="relative">
              <div className={`text-right text-2xl font-bold ${result === '錯誤' && showResult ? 'text-red-500' : 'text-gray-800'} font-mono`}>
                {showResult ? result : ''}
              </div>
              
              {/* 計算中指示器 */}
              {calculating && (
                <div className="absolute right-0 top-0 bottom-0 flex items-center">
                  <i className="fas fa-circle-notch fa-spin text-[#A487C3]"></i>
                </div>
              )}
            </div>
          </div>
          
          {/* 複製成功提示 */}
          {copySuccess && (
            <div className="mt-2 text-center text-sm text-green-600 bg-green-50 py-1 px-2 rounded-md">
              <i className="fas fa-check-circle mr-1"></i> 已複製結果到剪貼板
            </div>
          )}
        </div>
        
        {/* 按鈕區域 */}
        <div className="p-4 bg-[#F8F5FF]">
          <div className="grid grid-cols-4 gap-2">
            {buttons.map((button) => (
              <button
                key={button.value}
                onClick={() => handleButtonClick(button.value)}
                className={`py-3 rounded-md flex items-center justify-center font-medium shadow-sm ${getButtonStyle(button.type)} ${button.span ? `col-span-${button.span}` : ''}`}
              >
                {button.label}
              </button>
            ))}
            
            {/* 退格按鈕 */}
            <button
              onClick={() => handleButtonClick('←')}
              className="col-span-4 mt-2 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md flex items-center justify-center shadow-sm"
            >
              <i className="fas fa-backspace mr-2"></i> 退格
            </button>
            
            {/* 複製結果按鈕 - 當onlyCopy為true或沒有onUseResult時顯示 */}
            {(onlyCopy || !onUseResult) && result !== '0' && result !== '錯誤' && showResult && (
              <button
                onClick={handleCopyResult}
                className="col-span-4 mt-2 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-md flex items-center justify-center shadow-md font-medium"
              >
                <i className="fas fa-copy mr-2"></i> 複製結果
              </button>
            )}
            
            {/* 使用結果按鈕 - 只在onlyCopy為false且有onUseResult時顯示 */}
            {!onlyCopy && onUseResult && result !== '0' && result !== '錯誤' && showResult && (
              <button
                onClick={handleUseResult}
                className="col-span-4 mt-2 py-3 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-md flex items-center justify-center shadow-md font-medium"
              >
                <i className="fas fa-check-circle mr-2"></i> 使用結果並關閉
              </button>
            )}
            
            {/* 關閉按鈕 */}
            <button
              onClick={onClose}
              className="col-span-4 mt-2 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-md flex items-center justify-center shadow-sm"
            >
              <i className="fas fa-times-circle mr-2"></i> 關閉計算機
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calculator; 