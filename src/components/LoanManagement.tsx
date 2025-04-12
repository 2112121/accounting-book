import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import LoanForm from './LoanForm';
import RepaymentForm from './RepaymentForm';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, Timestamp, runTransaction, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';

// 借貸交易類型定義
export interface LoanTransaction {
  id: string;
  type: 'lend' | 'borrow';      // 借出或借入
  counterpartyId?: string;      // 交易對象ID（如果是已有好友）
  counterpartyName: string;     // 交易對象名稱
  amount: number;               // 初始借貸金額
  remainingAmount: number;      // 剩餘未還金額
  date: Date;                   // 借貸日期
  dueDate?: Date;               // 預計還款日期（可選）
  notes: string;                // 備註
  status: 'pending' | 'partially_paid' | 'paid'; // 還款狀態
  userId: string;               // 用戶ID
  repayments: Repayment[];      // 還款記錄
}

// 還款記錄類型定義
export interface Repayment {
  id: string;
  amount: number;               // 還款金額
  date: Date;                   // 還款日期
  notes: string;                // 備註
}

// 借貸管理組件屬性
interface LoanManagementProps {
  onClose: () => void;
  initialParams?: {
    action: 'add-lend' | 'add-borrow';
    amount: string;
    person: string;
    description: string;
    date?: string;
  } | null;
}

// 借貸管理組件
const LoanManagement: React.FC<LoanManagementProps> = ({ onClose, initialParams }) => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'lend' | 'borrow'>('lend');
  const [loans, setLoans] = useState<LoanTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRepaymentForm, setShowRepaymentForm] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<LoanTransaction | null>(null);
  const [showLoanDetails, setShowLoanDetails] = useState(false);
  const [loanDueNotificationEnabled, setLoanDueNotificationEnabled] = useState(true);
  const [initialFormValues, setInitialFormValues] = useState<any>(null);
  
  // 處理 initialParams
  useEffect(() => {
    if (initialParams) {
      // 設置tab
      setActiveTab(initialParams.action === 'add-lend' ? 'lend' : 'borrow');
      
      // 設置初始值並顯示表單
      if (initialParams.amount || initialParams.person) {
        setInitialFormValues({
          type: initialParams.action === 'add-lend' ? 'lend' : 'borrow',
          counterpartyName: initialParams.person || '',
          amount: initialParams.amount ? parseFloat(initialParams.amount) : '',
          date: initialParams.date ? initialParams.date : format(new Date(), 'yyyy-MM-dd'),
          notes: initialParams.description || ''
        });
        
        // 自動顯示表單
        setShowAddForm(true);
      }
    }
  }, [initialParams]);
  
  // 加載借貸記錄
  useEffect(() => {
    if (currentUser) {
      loadLoans();
      loadNotificationSettings();
    }
  }, [currentUser, activeTab]);
  
  // 檢查並更新逾期借貸數
  useEffect(() => {
    if (currentUser) {
      updateOverdueLoansCount();
    }
  }, [currentUser]);
  
  // 更新逾期借貸數
  const updateOverdueLoansCount = async () => {
    try {
      if (!currentUser) return;
      
      const loansRef = collection(db, 'loans');
      const q = query(
        loansRef,
        where('userId', '==', currentUser.uid),
        where('status', 'in', ['pending', 'partially_paid'])
      );
      
      const querySnapshot = await getDocs(q);
      
      // 計算逾期借貸數
      let count = 0;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.dueDate) {
          const dueDate = data.dueDate instanceof Timestamp ? data.dueDate.toDate() : new Date(data.dueDate);
          if (new Date() > dueDate) {
            count++;
          }
        }
      });
      
      // 將逾期借貸數保存到localStorage
      localStorage.setItem('overdueLoansCount', count.toString());
      
      // 觸發事件，通知App組件更新逾期借貸數
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('updateOverdueLoansCount', { detail: { count } }));
      }
    } catch (error) {
      console.error('更新逾期借貸數時出錯:', error);
    }
  };
  
  // 加載借貸記錄的函數
  const loadLoans = async () => {
    try {
      setLoading(true);
      
      if (!currentUser) return;
      
      // 建立查詢
      const loansRef = collection(db, 'loans');
      const q = query(
        loansRef,
        where('userId', '==', currentUser.uid),
        where('type', '==', activeTab)
      );
      
      // 執行查詢
      const querySnapshot = await getDocs(q);
      
      // 處理查詢結果
      const loansList: LoanTransaction[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        // 轉換日期
        const date = data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date);
        const dueDate = data.dueDate ? 
          (data.dueDate instanceof Timestamp ? data.dueDate.toDate() : new Date(data.dueDate)) 
          : undefined;
        
        // 轉換還款記錄
        const repayments = (data.repayments || []).map((repay: any) => ({
          ...repay,
          date: repay.date instanceof Timestamp ? repay.date.toDate() : new Date(repay.date)
        }));
        
        loansList.push({
          id: doc.id,
          ...data,
          date,
          dueDate,
          repayments,
        } as LoanTransaction);
      });
      
      // 按日期降序排序
      loansList.sort((a, b) => b.date.getTime() - a.date.getTime());
      
      setLoans(loansList);
    } catch (error) {
      console.error('加載借貸記錄時出錯:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // 添加新借貸記錄
  const addLoanRecord = async (loanData: {
    type: 'lend' | 'borrow';
    counterpartyName: string;
    amount: number;
    date: string;
    dueDate?: string;
    notes: string;
  }) => {
    try {
      if (!currentUser) throw new Error('用戶未登入');
      
      // 準備數據
      const newLoan = {
        type: loanData.type,
        counterpartyName: loanData.counterpartyName,
        amount: loanData.amount,
        remainingAmount: loanData.amount, // 初始剩餘金額等於借貸金額
        date: new Date(loanData.date),
        dueDate: loanData.dueDate ? new Date(loanData.dueDate) : null,
        notes: loanData.notes,
        status: 'pending', // 初始狀態為未還款
        userId: currentUser.uid,
        repayments: [],
        createdAt: serverTimestamp(),
      };
      
      // 保存到Firestore
      await addDoc(collection(db, 'loans'), newLoan);
      
      // 關閉表單並重新加載數據
      setShowAddForm(false);
      setInitialFormValues(null); // 清除初始值
      loadLoans();
    } catch (error) {
      console.error('添加借貸記錄時出錯:', error);
      throw error;
    }
  };
  
  // 記錄還款
  const recordRepayment = async (repaymentData: {
    amount: number;
    date: string;
    notes: string;
  }) => {
    try {
      if (!currentUser || !selectedLoan) throw new Error('數據錯誤');
      
      // 使用事務確保數據一致性
      await runTransaction(db, async (transaction) => {
        // 獲取最新的借貸數據
        const loanRef = doc(db, 'loans', selectedLoan.id);
        const loanDoc = await transaction.get(loanRef);
        
        if (!loanDoc.exists()) {
          throw new Error('借貸記錄不存在');
        }
        
        const loanData = loanDoc.data();
        
        // 準備還款記錄
        const newRepayment = {
          id: Date.now().toString(), // 簡單生成ID
          amount: repaymentData.amount,
          date: new Date(repaymentData.date),
          notes: repaymentData.notes,
        };
        
        // 更新剩餘金額
        const newRemainingAmount = loanData.remainingAmount - repaymentData.amount;
        
        // 更新狀態
        let newStatus = loanData.status;
        if (newRemainingAmount <= 0) {
          newStatus = 'paid'; // 完全還清
        } else if (newRemainingAmount < loanData.amount) {
          newStatus = 'partially_paid'; // 部分還款
        }
        
        // 獲取當前還款記錄
        const currentRepayments = loanData.repayments || [];
        
        // 更新借貸記錄
        transaction.update(loanRef, {
          repayments: [...currentRepayments, newRepayment],
          remainingAmount: newRemainingAmount,
          status: newStatus,
          updatedAt: serverTimestamp(),
        });
      });
      
      // 關閉表單並重新加載數據
      setShowRepaymentForm(false);
      setSelectedLoan(null);
      loadLoans();
      
      // 如果還款後狀態變為已還清，更新逾期借貸數
      updateOverdueLoansCount();
    } catch (error) {
      console.error('記錄還款時出錯:', error);
      throw error;
    }
  };
  
  // 刪除借貸記錄
  const deleteLoan = async (loanId: string) => {
    try {
      if (!currentUser) throw new Error('用戶未登入');
      if (!window.confirm('確定要刪除此借貸記錄嗎？此操作不可撤銷。')) {
        return;
      }
      
      // 刪除借貸記錄
      await deleteDoc(doc(db, 'loans', loanId));
      
      // 關閉詳情並重新加載數據
      setShowLoanDetails(false);
      setSelectedLoan(null);
      loadLoans();
      
      // 更新逾期借貸數
      updateOverdueLoansCount();
    } catch (error) {
      console.error('刪除借貸記錄時出錯:', error);
      alert('刪除失敗，請稍後再試');
    }
  };
  
  // 格式化日期
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
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
  
  // 檢查是否逾期
  const isOverdue = (loan: LoanTransaction): boolean => {
    if (!loan.dueDate || loan.status === 'paid') return false;
    return new Date() > loan.dueDate;
  };
  
  // 計算借出/借入的總金額
  const calculateTotalAmount = (): number => {
    return loans.reduce((total, loan) => total + loan.remainingAmount, 0);
  };
  
  // 渲染借貸詳情
  const renderLoanDetails = () => {
    if (!selectedLoan) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
          <button
            onClick={() => {
              setShowLoanDetails(false);
              setSelectedLoan(null);
            }}
            className="absolute top-4 right-4 text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300"
          >
            <i className="fas fa-times"></i>
          </button>
          
          <h3 className="text-2xl font-bold mb-5 text-[#333333]">借貸詳情</h3>
          
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-5">
            <div className="flex justify-between mb-4">
              <span className="text-gray-700 font-medium text-base">交易類型:</span>
              <span className="font-semibold text-base text-[#A487C3]">
                {selectedLoan.type === 'lend' ? '借出' : '借入'}
              </span>
            </div>
            <div className="flex justify-between mb-4">
              <span className="text-gray-700 font-medium text-base">對象:</span>
              <span className="font-semibold text-base text-gray-900">{selectedLoan.counterpartyName}</span>
            </div>
            <div className="flex justify-between mb-4">
              <span className="text-gray-700 font-medium text-base">金額:</span>
              <span className="font-semibold text-base text-gray-900">{formatAmount(selectedLoan.amount)}</span>
            </div>
            <div className="flex justify-between mb-4">
              <span className="text-gray-700 font-medium text-base">借貸日期:</span>
              <span className="font-semibold text-base text-gray-900 flex items-center">
                <i className="far fa-calendar-alt mr-2 text-[#A487C3]"></i>
                {formatDate(selectedLoan.date)}
              </span>
            </div>
            {selectedLoan.dueDate && (
              <div className="flex justify-between mb-4">
                <span className="text-gray-700 font-medium text-base">預計還款日:</span>
                <span className={`font-semibold text-base flex items-center ${isOverdue(selectedLoan) ? 'text-red-600' : 'text-[#A487C3]'}`}>
                  <i className={`${isOverdue(selectedLoan) ? 'fas fa-exclamation-circle animate-pulse' : 'far fa-clock'} mr-2`}></i>
                  {formatDate(selectedLoan.dueDate)}
                  {isOverdue(selectedLoan) && 
                    <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                      已逾期
                    </span>
                  }
                </span>
              </div>
            )}
            <div className="flex justify-between mb-4">
              <span className="text-gray-700 font-medium text-base">狀態:</span>
              <span
                className={`font-semibold text-base px-3 py-1 rounded-full ${
                  selectedLoan.status === 'paid'
                    ? 'bg-green-100 text-green-700'
                    : selectedLoan.status === 'partially_paid'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {selectedLoan.status === 'paid'
                  ? '已還清'
                  : selectedLoan.status === 'partially_paid'
                  ? '部分還款'
                  : '未還款'}
              </span>
            </div>
            <div className="flex justify-between pt-4 border-t border-gray-200">
              <span className="text-gray-700 font-medium text-base">剩餘未還:</span>
              <span className="font-bold text-xl text-[#A487C3]">
                {formatAmount(selectedLoan.remainingAmount)}
              </span>
            </div>
          </div>
          
          {selectedLoan.notes && (
            <div className="mb-5">
              <h4 className="font-semibold text-base mb-2 text-gray-700">備註:</h4>
              <div className="text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-200 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#A487C3]"></div>
                <div className="pl-3 flex items-start">
                  <i className="fas fa-quote-left text-[#A487C3] opacity-20 text-lg absolute top-2 left-4"></i>
                  <p className="relative z-10">{selectedLoan.notes}</p>
                </div>
              </div>
            </div>
          )}
          
          <div>
            <h4 className="font-semibold text-base mb-3 text-gray-700">還款記錄:</h4>
            {selectedLoan.repayments && selectedLoan.repayments.length > 0 ? (
              <div className="space-y-3">
                {selectedLoan.repayments.map((repayment) => (
                  <div
                    key={repayment.id}
                    className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group"
                  >
                    <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-[#A487C3] via-[#B19ED0] to-[#C6B2DD] group-hover:w-2.5 transition-all duration-300"></div>
                    <div className="pl-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <i className="fas fa-check-circle text-[#A487C3] mr-2"></i>
                          <span className="text-gray-700 font-medium">{formatDate(repayment.date)}</span>
                        </div>
                        <span className="font-bold text-lg text-[#A487C3] group-hover:scale-105 transition-transform duration-300">{formatAmount(repayment.amount)}</span>
                      </div>
                      {repayment.notes && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <p className="text-sm text-gray-600 flex items-start">
                            <i className="fas fa-comment-alt text-[#C6B2DD] mr-2 mt-1"></i>
                            <span>{repayment.notes}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <i className="fas fa-money-bill-wave text-gray-300 text-2xl mb-2"></i>
                <p className="text-gray-600">還沒有還款記錄</p>
              </div>
            )}
          </div>
          
          <div className="mt-5 flex justify-between">
            {selectedLoan.status !== 'paid' && (
              <button
                onClick={() => {
                  setShowLoanDetails(false);
                  setShowRepaymentForm(true);
                }}
                className="py-3 px-5 bg-gradient-to-r from-[#A487C3] to-[#C6B2DD] hover:from-[#9678B6] hover:to-[#B7A0D0] text-white rounded-lg font-medium text-base flex-1 mr-2 shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#A487C3] hover:scale-[1.02] active:scale-[0.98]"
              >
                <i className="fas fa-money-bill-wave mr-2 text-white animate-pulse"></i>
                記錄還款
              </button>
            )}
            <button
              onClick={() => deleteLoan(selectedLoan.id)}
              className="py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-medium text-base flex-1 loan-btn focus:outline-none focus:ring-2 focus:ring-white"
            >
              <i className="fas fa-trash-alt mr-2"></i>
              刪除記錄
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // 渲染借貸列表
  const renderLoansList = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#A487C3]"></div>
        </div>
      );
    }
    
    if (loans.length === 0) {
      return (
        <div className="text-center py-10">
          <i className="fas fa-hand-holding-usd text-gray-300 text-4xl mb-2"></i>
          <p className="text-gray-600 text-lg">
            {activeTab === 'lend' ? '您目前沒有借出的錢' : '您目前沒有借入的錢'}
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-4 px-4 py-2 bg-[#A487C3] hover:bg-[#9678B6] text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-300 loan-btn loan-btn-primary focus:outline-none focus:ring-2 focus:ring-white"
          >
            {activeTab === 'lend' ? '添加借出記錄' : '添加借入記錄'}
          </button>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-4">
          <p className="text-gray-700 text-lg">
            {activeTab === 'lend' ? '總借出金額：' : '總借入金額：'}
            <span className="font-bold text-xl text-[#333333]">
              {formatAmount(calculateTotalAmount())}
            </span>
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-[#A487C3] hover:bg-[#9678B6] text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-300 loan-btn focus:outline-none focus:ring-2 focus:ring-white"
          >
            <i className="fas fa-plus mr-2"></i>
            {activeTab === 'lend' ? '添加借出' : '添加借入'}
          </button>
        </div>
        
        {loans.map((loan) => (
          <div
            key={loan.id}
            className={`bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-300 p-5 border-l-4 ${
              loan.status === 'paid'
                ? 'border-green-400'
                : isOverdue(loan)
                ? 'border-red-400'
                : loan.status === 'partially_paid'
                ? 'border-[#A487C3]'
                : 'border-[#A487C3]'
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-lg text-gray-800">
                  {activeTab === 'lend' ? '借給 ' : '借自 '}
                  <span className="font-bold">{loan.counterpartyName}</span>
                </h3>
                <p className="text-base text-gray-600 mt-2">
                  <span className="flex items-center">
                    <i className="far fa-calendar-alt mr-2 text-[#A487C3]"></i> 
                    借貸日期：{formatDate(loan.date)}
                  </span>
                </p>
                {loan.dueDate && (
                  <p className="text-base flex items-center mt-1.5">
                    <span className={`flex items-center px-3 py-1 rounded-lg ${
                      isOverdue(loan) 
                        ? 'bg-red-50 text-red-600 border border-red-200' 
                        : 'bg-[#F0EAFA] text-[#A487C3] border border-[#E5D9F2]'
                    }`}>
                      <i className={`${isOverdue(loan) ? 'fas fa-exclamation-circle animate-pulse' : 'far fa-clock'} mr-2`}></i>
                      約定還款日：{formatDate(loan.dueDate)}
                      {isOverdue(loan) && <span className="ml-2 text-xs font-medium">已逾期</span>}
                    </span>
                  </p>
                )}
                {loan.notes && <p className="text-sm text-gray-600 mt-1.5">{loan.notes}</p>}
              </div>
              <div className="text-right">
                <p className="font-bold text-xl text-[#333333]">
                  {formatAmount(loan.amount)}
                </p>
                <p
                  className={`text-base font-medium mt-1 ${
                    loan.status === 'paid'
                      ? 'text-green-600'
                      : loan.status === 'partially_paid'
                      ? 'text-yellow-600'
                      : isOverdue(loan)
                      ? 'text-red-600'
                      : 'text-gray-600'
                  }`}
                >
                  {loan.status === 'paid'
                    ? '已還清'
                    : loan.status === 'partially_paid'
                    ? `剩餘：${formatAmount(loan.remainingAmount)}`
                    : isOverdue(loan)
                    ? '已逾期'
                    : '未還款'}
                </p>
              </div>
            </div>
            
            {/* 還款記錄摘要（如果有） */}
            {loan.repayments && loan.repayments.length > 0 && (
              <div className="mt-3 border-t border-gray-200 pt-3">
                <div className="flex items-center text-sm text-gray-600">
                  <i className="fas fa-history text-[#A487C3] mr-2"></i>
                  <span className="font-medium">還款記錄:</span>
                  {loan.repayments.length === 1 ? (
                    <div className="ml-2 bg-[#F0EAFA] px-3 py-1 rounded-full text-xs shadow-sm border border-[#E5D9F2]">
                      {formatDate(loan.repayments[0].date)} 已還款 
                      <span className="font-semibold text-[#A487C3] ml-1">{formatAmount(loan.repayments[0].amount)}</span>
                    </div>
                  ) : (
                    <div className="ml-2 bg-[#F0EAFA] text-[#A487C3] px-3 py-1 rounded-full text-xs font-medium shadow-sm border border-[#E5D9F2] hover:bg-[#E5D9F2] transition-colors cursor-pointer">
                      共 {loan.repayments.length} 筆還款記錄
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* 操作按鈕 */}
            <div className="mt-4 flex justify-end space-x-3">
              <button
                className="px-4 py-2 bg-white border border-[#A487C3] text-[#A487C3] rounded-lg text-base font-medium transition-colors hover:bg-[#F8F3FF] loan-detail-btn focus:outline-none focus:ring-2 focus:ring-white shadow-sm hover:shadow-md"
                onClick={() => {
                  setSelectedLoan(loan);
                  setShowLoanDetails(true);
                }}
              >
                <i className="fas fa-info-circle mr-1"></i> 詳情
              </button>
              {loan.status !== 'paid' && (
                <button
                  className="px-4 py-2 bg-gradient-to-r from-[#A487C3] to-[#C6B2DD] hover:from-[#9678B6] hover:to-[#B7A0D0] text-white rounded-lg text-base font-medium transition-all duration-300 shadow-md hover:shadow-lg flex items-center hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#A487C3]"
                  onClick={() => {
                    setSelectedLoan(loan);
                    setShowRepaymentForm(true);
                  }}
                >
                  <i className="fas fa-money-bill-wave mr-1.5 animate-pulse"></i> 記錄還款
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  // 加載通知設置
  const loadNotificationSettings = async () => {
    try {
      if (!currentUser) return;
      
      const budgetRef = doc(db, 'budgets', currentUser.uid);
      const budgetDoc = await getDoc(budgetRef);
      
      if (budgetDoc.exists()) {
        const budgetData = budgetDoc.data();
        // 如果設置存在，使用存在的設置，否則默認為true
        setLoanDueNotificationEnabled(
          budgetData.loanDueNotificationEnabled !== undefined 
            ? budgetData.loanDueNotificationEnabled 
            : true
        );
      }
    } catch (error) {
      console.error('加載通知設置時出錯:', error);
    }
  };
  
  // 切換借貸到期提醒
  const toggleLoanDueNotification = async () => {
    try {
      if (!currentUser) return;
      
      const newValue = !loanDueNotificationEnabled;
      setLoanDueNotificationEnabled(newValue);
      
      const budgetRef = doc(db, 'budgets', currentUser.uid);
      await setDoc(budgetRef, { loanDueNotificationEnabled: newValue }, { merge: true });
    } catch (error) {
      console.error('保存通知設置時出錯:', error);
      // 如果保存失敗，恢復狀態
      setLoanDueNotificationEnabled(!loanDueNotificationEnabled);
    }
  };
  
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[#A487C3]">借貸管理</h2>
        <button
          onClick={onClose}
          className="text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
      
      {/* 標籤頁切換 */}
      <div className="flex space-x-2 mb-6">
        <button
          className={`flex-1 py-3 text-center text-base font-medium rounded-lg shadow-sm ${
            activeTab === 'lend'
              ? 'text-white bg-[#A487C3] hover:bg-[#9678B6]'
              : 'text-white bg-[#C6B2DD] hover:bg-[#D8CAEB]'
          } transition-all duration-300 loan-btn focus:outline-none focus:ring-2 focus:ring-white`}
          onClick={() => setActiveTab('lend')}
        >
          <i className="fas fa-hand-holding-usd mr-2"></i>
          我借出的錢
        </button>
        <button
          className={`flex-1 py-3 text-center text-base font-medium rounded-lg shadow-sm ${
            activeTab === 'borrow'
              ? 'text-white bg-[#A487C3] hover:bg-[#9678B6]'
              : 'text-white bg-[#C6B2DD] hover:bg-[#D8CAEB]'
          } transition-all duration-300 loan-btn focus:outline-none focus:ring-2 focus:ring-white`}
          onClick={() => setActiveTab('borrow')}
        >
          <i className="fas fa-money-bill-wave mr-2"></i>
          我借入的錢
        </button>
      </div>
      
      {/* 借貸到期提醒設置 */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">啟用借貸到期提醒</p>
            <p className="text-xs text-gray-500">當借貸即將到期或已逾期時通知您</p>
          </div>
          <div className="relative inline-block w-12 align-middle select-none">
            <input
              type="checkbox"
              id="toggleLoanDueNotification"
              checked={loanDueNotificationEnabled}
              onChange={toggleLoanDueNotification}
              className="sr-only"
            />
            <label
              htmlFor="toggleLoanDueNotification"
              className={`block overflow-hidden h-6 rounded-full ${
                loanDueNotificationEnabled ? 'bg-[#A487C3]' : 'bg-gray-300'
              } cursor-pointer transition-colors duration-300`}
            >
              <span
                className={`block h-6 w-6 rounded-full bg-white transform transition-transform duration-300 ${
                  loanDueNotificationEnabled ? 'translate-x-6' : 'translate-x-0'
                } shadow-sm`}
              ></span>
            </label>
          </div>
        </div>
      </div>
      
      {/* 借貸列表 */}
      <div className="mt-4">
        {renderLoansList()}
      </div>
      
      {/* 添加借貸表單 */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md relative">
            <LoanForm
              onSave={addLoanRecord}
              onCancel={() => {
                setShowAddForm(false);
                setInitialFormValues(null); // 清除初始值
              }}
              formType={activeTab}
              initialValues={initialFormValues}
            />
          </div>
        </div>
      )}
      
      {/* 還款表單 */}
      {showRepaymentForm && selectedLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md relative">
            <RepaymentForm
              onSave={recordRepayment}
              onCancel={() => {
                setShowRepaymentForm(false);
                setSelectedLoan(null);
              }}
              loan={selectedLoan}
            />
          </div>
        </div>
      )}
      
      {/* 借貸詳情 */}
      {showLoanDetails && renderLoanDetails()}
    </div>
  );
};

export default LoanManagement; 