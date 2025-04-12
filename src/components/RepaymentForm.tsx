import React, { useState } from 'react';
import { format } from 'date-fns';
import { LoanTransaction } from './LoanManagement';

interface RepaymentFormProps {
  onSave: (data: {
    amount: number;
    date: string;
    notes: string;
  }) => void;
  onCancel: () => void;
  loan: LoanTransaction;
}

const RepaymentForm: React.FC<RepaymentFormProps> = ({
  onSave,
  onCancel,
  loan,
}) => {
  // 表單字段
  const [amount, setAmount] = useState(loan.remainingAmount.toString());
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 處理表單提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 基本驗證
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError('請輸入有效的還款金額');
      return;
    }
    
    if (parseFloat(amount) > loan.remainingAmount) {
      setError(`還款金額不能超過剩餘未還金額 ${loan.remainingAmount}`);
      return;
    }
    
    if (!date) {
      setError('請選擇還款日期');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      // 準備提交的數據
      const repaymentData = {
        amount: parseFloat(amount),
        date,
        notes: notes.trim(),
      };
      
      // 提交數據
      await onSave(repaymentData);
    } catch (err: any) {
      console.error('保存還款記錄失敗', err);
      setError(err.message || '操作失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };
  
  // 格式化金額
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };
  
  return (
    <div className="p-3">
      <h2 className="text-xl font-bold text-center mb-4 text-[#333333]">記錄還款</h2>
      
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-300 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-800 font-medium text-sm">借貸對象:</span>
          <span className="font-semibold text-sm text-gray-900">{loan.counterpartyName}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-800 font-medium text-sm">借貸金額:</span>
          <span className="font-semibold text-sm text-gray-900">{formatAmount(loan.amount)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-800 font-medium text-sm">剩餘未還:</span>
          <span className="font-bold text-base text-[#A487C3]">{formatAmount(loan.remainingAmount)}</span>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500 flex items-center justify-center">
          <i className="fas fa-info-circle mr-1"></i>
          <span>所有金額均以新台幣(NT$)記錄</span>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 text-red-600 p-3 rounded-lg mb-3 font-medium text-xs">
          <i className="fas fa-exclamation-circle mr-1"></i>
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 還款金額 */}
        <div>
          <label htmlFor="amount" className="block text-sm font-semibold text-gray-800 mb-1">
            還款金額
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-800 font-medium text-sm">NT$</span>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full pl-20 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] text-sm text-gray-800"
              placeholder="輸入還款金額"
              min="1"
              max={loan.remainingAmount}
              step="1"
            />
          </div>
          <div className="flex justify-center mt-3 gap-3">
            <button
              type="button"
              className="px-3 py-1.5 bg-[#F0EAFA] hover:bg-gray-200 hover:text-gray-700 text-[#A487C3] rounded-lg font-medium border border-[#D8CAE9] hover:border-gray-300 transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md hover:scale-105 repayment-amount-btn w-28 text-xs"
              onClick={() => setAmount(Math.floor(loan.remainingAmount / 2).toString())}
            >
              <i className="fas fa-coins mr-1"></i>
              一半金額
            </button>
            <button
              type="button"
              className="px-3 py-1.5 bg-[#F0EAFA] hover:bg-gray-200 hover:text-gray-700 text-[#A487C3] rounded-lg font-medium border border-[#D8CAE9] hover:border-gray-300 transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md hover:scale-105 repayment-amount-btn w-28 text-xs"
              onClick={() => setAmount(loan.remainingAmount.toString())}
            >
              <i className="fas fa-hand-holding-usd mr-1"></i>
              全部金額
            </button>
          </div>
        </div>
        
        {/* 還款日期 */}
        <div>
          <label htmlFor="date" className="block text-sm font-semibold text-gray-800 mb-1">
            還款日期
          </label>
          <input
            type="date"
            id="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] text-sm text-gray-800"
          />
        </div>
        
        {/* 備註 */}
        <div>
          <label htmlFor="notes" className="block text-sm font-semibold text-gray-800 mb-1">
            備註 <span className="text-xs text-gray-600">(選填)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] text-sm text-gray-800"
            placeholder="輸入還款相關備註"
            rows={2}
          />
        </div>
        
        {/* 按鈕組 */}
        <div className="flex gap-3 pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors text-sm font-medium"
            disabled={loading}
          >
            取消
          </button>
          <button
            type="submit"
            className="flex-1 py-2 px-4 bg-[#A487C3] hover:bg-[#9678B6] text-white rounded-lg transition-colors text-sm font-medium"
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="w-4 h-4 border-t-2 border-b-2 border-white rounded-full animate-spin mr-1"></div>
                處理中...
              </div>
            ) : (
              '記錄還款'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RepaymentForm; 