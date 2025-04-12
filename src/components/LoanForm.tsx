import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LoanTransaction } from './LoanManagement';
import { format } from 'date-fns';

interface LoanFormProps {
  onSave: (data: {
    type: 'lend' | 'borrow';
    counterpartyName: string;
    amount: number;
    date: string;
    dueDate?: string;
    notes: string;
  }) => void;
  onCancel: () => void;
  initialValues?: {
    type: 'lend' | 'borrow';
    counterpartyName: string;
    amount: number;
    date: string;
    dueDate?: string;
    notes: string;
  };
  formType: 'lend' | 'borrow'; // 固定的表單類型
}

const LoanForm: React.FC<LoanFormProps> = ({
  onSave,
  onCancel,
  initialValues,
  formType,
}) => {
  const { currentUser } = useAuth();
  
  // 表單字段
  const [counterpartyName, setCounterpartyName] = useState(initialValues?.counterpartyName || '');
  const [amount, setAmount] = useState(initialValues?.amount?.toString() || '');
  const [date, setDate] = useState(initialValues?.date || format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState(initialValues?.dueDate || '');
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 處理表單提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 基本驗證
    if (!counterpartyName.trim()) {
      setError(formType === 'lend' ? '請輸入借款人姓名' : '請輸入貸款人姓名');
      return;
    }
    
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError('請輸入有效的金額');
      return;
    }
    
    if (!date) {
      setError('請選擇借貸日期');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      // 準備提交的數據
      const loanData = {
        type: formType,
        counterpartyName: counterpartyName.trim(),
        amount: parseFloat(amount),
        date,
        dueDate: dueDate || undefined,
        notes: notes.trim(),
      };
      
      // 提交數據
      await onSave(loanData);
    } catch (err: any) {
      console.error('保存借貸記錄失敗', err);
      setError(err.message || '操作失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="p-3">
      <h2 className="text-xl font-bold text-center mb-4 text-[#333333]">
        {formType === 'lend' ? '新增借出記錄' : '新增借入記錄'}
      </h2>
      
      {error && (
        <div className="bg-red-100 text-red-600 p-3 rounded-lg mb-3 font-medium text-xs">
          <i className="fas fa-exclamation-circle mr-1"></i>
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 交易對象 */}
        <div>
          <label htmlFor="counterpartyName" className="block text-sm font-semibold text-gray-800 mb-1">
            {formType === 'lend' ? '借款人' : '貸款人'}
          </label>
          <input
            type="text"
            id="counterpartyName"
            value={counterpartyName}
            onChange={(e) => setCounterpartyName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] text-sm text-gray-800"
            placeholder={formType === 'lend' ? '輸入借款人姓名' : '輸入貸款人姓名'}
          />
        </div>
        
        {/* 金額 */}
        <div>
          <label htmlFor="amount" className="block text-sm font-semibold text-gray-800 mb-1">
            金額
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-800 font-medium text-sm">NT$</span>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] text-sm text-gray-800"
              placeholder="輸入金額"
              min="1"
              step="1"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 flex items-center">
            <i className="fas fa-info-circle mr-1"></i>
            所有金額均以新台幣(NT$)記錄
          </p>
        </div>
        
        {/* 借貸日期 */}
        <div>
          <label htmlFor="date" className="block text-sm font-semibold text-gray-800 mb-1">
            日期
          </label>
          <input
            type="date"
            id="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] text-sm text-gray-800"
          />
        </div>
        
        {/* 預計還款日期 */}
        <div>
          <label htmlFor="dueDate" className="block text-sm font-semibold text-gray-800 mb-1">
            預計還款日期 <span className="text-xs text-gray-600">(選填)</span>
          </label>
          <input
            type="date"
            id="dueDate"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
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
            placeholder="輸入借貸原因或其他備註"
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
              '保存'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default LoanForm; 