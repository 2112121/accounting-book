import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Friend } from '../contexts/AuthContext';
import { collection, query, where, getDocs, Timestamp, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { SplitParticipant } from './SplitExpenseManagement';

// 支出類別列表
const categories = [
  { id: "food", name: "餐飲", icon: "fa-utensils" },
  { id: "transportation", name: "交通", icon: "fa-car" },
  { id: "entertainment", name: "娛樂", icon: "fa-film" },
  { id: "shopping", name: "購物", icon: "fa-shopping-bag" },
  { id: "education", name: "教育", icon: "fa-book" },
  { id: "medical", name: "醫療", icon: "fa-heartbeat" },
  { id: "investment", name: "投資", icon: "fa-chart-line" },
  { id: "utilities", name: "住支", icon: "fa-home" },
  { id: "other", name: "其他", icon: "fa-ellipsis-h" },
];

// 支出記錄類型定義
interface Expense {
  id: string;
  amount: number;
  category: {
    id: string;
    name: string;
    icon: string;
  } | string;
  date: Date;
  notes: string;
  userId: string;
  isSplit?: boolean;
}

// 分帳表單屬性
interface SplitExpenseFormProps {
  onSave: (data: any) => Promise<string>;
  onCancel: () => void;
  existingExpenseId?: string;
}

// 分帳表單組件
const SplitExpenseForm: React.FC<SplitExpenseFormProps> = ({ onSave, onCancel, existingExpenseId }) => {
  const { currentUser, getFriends } = useAuth();
  
  // 表單狀態
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [splitMethod, setSplitMethod] = useState<'equal' | 'custom'>('equal');
  const [participants, setParticipants] = useState<SplitParticipant[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  
  // 數據加載狀態
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // 其他狀態
  const [showExpenses, setShowExpenses] = useState(false);
  const [showCalculator, setShowCalculator] = useState<boolean>(false);
  const [calculatorInput, setCalculatorInput] = useState<string>('');
  const [calculatorResult, setCalculatorResult] = useState<string>('0');
  
  // 加載數據
  useEffect(() => {
    if (currentUser) {
      loadFriends();
      if (existingExpenseId) {
        loadExpense(existingExpenseId);
      } else {
        loadRecentExpenses();
      }
    }
  }, [currentUser, existingExpenseId]);
  
  // 加載好友列表
  const loadFriends = async () => {
    try {
      setLoading(true);
      const friendsList = await getFriends();
      setFriends(friendsList);
    } catch (error) {
      console.error('加載好友列表失敗:', error);
      setError('無法加載好友列表');
    } finally {
      setLoading(false);
    }
  };
  
  // 加載單個支出
  const loadExpense = async (expenseId: string) => {
    try {
      setLoading(true);
      
      const expenseDoc = await getDoc(doc(db, 'expenses', expenseId));
      if (!expenseDoc.exists()) {
        setError('找不到指定的支出記錄');
        return;
      }
      
      const data = expenseDoc.data();
      const date = data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date);
      
      const expense: Expense = {
        id: expenseDoc.id,
        amount: data.amount,
        category: data.category,
        date,
        notes: data.notes || '',
        userId: data.userId,
        isSplit: data.isSplit
      };
      
      setSelectedExpense(expense);
      setTotalAmount(expense.amount);
      setTitle(`分帳: ${getCategoryName(expense.category)} ${expense.amount}元`);
      setDescription(expense.notes);
      setDate(date.toISOString().split('T')[0]);
      
      // 如果已經有分帳記錄，顯示錯誤
      if (expense.isSplit) {
        setError('此支出已經創建過分帳記錄');
      }
    } catch (error) {
      console.error('加載支出記錄失敗:', error);
      setError('無法加載支出記錄');
    } finally {
      setLoading(false);
    }
  };
  
  // 加載最近的支出記錄
  const loadRecentExpenses = async () => {
    try {
      setLoading(true);
      
      if (!currentUser) return;
      
      const expensesRef = collection(db, 'expenses');
      const q = query(
        expensesRef,
        where('userId', '==', currentUser.uid),
        where('isSplit', '==', false)
      );
      
      const querySnapshot = await getDocs(q);
      const expensesList: Expense[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const date = data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date);
        
        expensesList.push({
          id: doc.id,
          amount: data.amount,
          category: data.category,
          date,
          notes: data.notes || '',
          userId: data.userId
        });
      });
      
      // 按日期排序，最近的在前
      expensesList.sort((a, b) => b.date.getTime() - a.date.getTime());
      
      // 只保留最近20筆
      setExpenses(expensesList.slice(0, 20));
    } catch (error) {
      console.error('加載支出記錄失敗:', error);
      setError('無法加載支出記錄');
    } finally {
      setLoading(false);
    }
  };
  
  // 取得類別名稱
  const getCategoryName = (category: any): string => {
    if (typeof category === 'string') {
      return category;
    } else if (category && typeof category === 'object') {
      return category.name || '未知類別';
    }
    return '未知類別';
  };
  
  // 取得類別圖標
  const getCategoryIcon = (category: any): string => {
    if (typeof category === 'object' && category !== null) {
      return category.icon || 'fa-question-circle';
    }
    return 'fa-question-circle';
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
  
  // 添加一個處理類別選擇的函數
  const handleCategorySelect = (categoryName: string) => {
    setSelectedCategory(categoryName);
    // 如果是從現有支出創建，保留金額信息
    const amountText = selectedExpense ? ` ${totalAmount}元` : '';
    setTitle(`分帳: ${categoryName}${amountText}`);
  };
  
  // 選擇支出記錄
  const handleSelectExpense = (expense: Expense) => {
    setSelectedExpense(expense);
    setTotalAmount(expense.amount);
    
    const categoryName = getCategoryName(expense.category);
    setSelectedCategory(categoryName);
    setTitle(`分帳: ${categoryName} ${expense.amount}元`);
    
    setDescription(expense.notes);
    setDate(expense.date.toISOString().split('T')[0]);
    setStep(2);
  };
  
  // 切換分帳方式
  const handleSplitMethodChange = (method: 'equal' | 'custom') => {
    setSplitMethod(method);
    
    // 如果切換到均分，自動計算均分金額
    if (method === 'equal' && participants.length > 0) {
      const count = participants.length + 1; // +1 是因為包含當前用戶
      const equalAmount = Math.floor(totalAmount / count);
      
      // 更新參與者金額
      const updatedParticipants = participants.map(p => ({
        ...p,
        amount: equalAmount,
        paid: false
      }));
      
      setParticipants(updatedParticipants);
    }
  };
  
  // 添加或移除好友
  const toggleFriend = (friend: Friend) => {
    const isSelected = selectedFriends.some(f => f.id === friend.id);
    
    if (isSelected) {
      // 移除好友
      setSelectedFriends(prev => prev.filter(f => f.id !== friend.id));
      setParticipants(prev => prev.filter(p => p.userId !== friend.id));
    } else {
      // 添加好友
      setSelectedFriends(prev => [...prev, friend]);
      
      // 計算金額 - 均分情況
      const count = selectedFriends.length + 1 + 1; // 當前選中的 + 新添加的 + 創建者
      const amount = splitMethod === 'equal' ? Math.floor(totalAmount / count) : 0;
      
      // 获取最新的好友信息 - 使用传入的对象，确保使用最新的昵称
      const newParticipant: SplitParticipant = {
        userId: friend.id,
        nickname: friend.nickname || "", // 使用从好友列表获取的最新昵称
        email: friend.email || "",
        photoURL: friend.photoURL || "",
        amount,
        paid: false
      };
      
      setParticipants(prev => [...prev, newParticipant]);
      
      // 如果是均分模式，重新計算所有人的金額
      if (splitMethod === 'equal') {
        setTimeout(() => {
          const newCount = selectedFriends.length + 1; // +1 是因為包含當前用戶
          const equalAmount = Math.floor(totalAmount / newCount);
          
          const updatedParticipants = [...participants, newParticipant].map(p => ({
            ...p,
            amount: equalAmount,
            paid: false
          }));
          
          setParticipants(updatedParticipants);
        }, 0);
      }
    }
  };
  
  // 更新參與者金額
  const updateParticipantAmount = (userId: string, amount: number) => {
    setParticipants(prev => 
      prev.map(p => 
        p.userId === userId ? { ...p, amount } : p
      )
    );
  };
  
  // 計算剩餘金額 (總金額 - 參與者總金額)
  const calculateRemainingAmount = (): number => {
    const participantsTotal = participants.reduce((sum, p) => sum + p.amount, 0);
    return totalAmount - participantsTotal;
  };
  
  // 提交表單
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (!currentUser) {
        setError('用戶未登入');
        return;
      }
      
      if (participants.length === 0) {
        setError('請至少選擇一位好友參與分帳');
        return;
      }
      
      if (!title.trim()) {
        setError('請輸入分帳標題');
        return;
      }
      
      // 檢查總金額
      if (totalAmount <= 0) {
        setError('金額必須大於0');
        return;
      }
      
      // 檢查參與者金額總和
      const participantsTotal = participants.reduce((sum, p) => sum + p.amount, 0);
      if (participantsTotal > totalAmount) {
        setError('參與者金額總和不能超過總金額');
        return;
      }
      
      // 準備數據
      const data = {
        title,
        description,
        totalAmount,
        date,
        originalExpenseId: selectedExpense?.id,
        participants: participants.map(p => ({
          ...p,
          paid: false
        }))
      };
      
      // 提交數據
      await onSave(data);
    } catch (error) {
      console.error('創建分帳記錄失敗:', error);
      setError('創建分帳記錄失敗');
    }
  };
  
  // 渲染步驟1: 選擇類別和支出，或從現有支出創建
  const renderStep1 = () => {
    return (
      <div className="p-5">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold text-[#A487C3]">創建分帳</h2>
          <button
            onClick={onCancel}
            className="text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-9 h-9 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4 text-base flex items-center">
            <i className="fas fa-exclamation-circle mr-2 text-red-500"></i>
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-4 text-base flex items-center">
            <i className="fas fa-check-circle mr-2 text-green-500"></i>
            <span>{success}</span>
          </div>
        )}
        
        <div className="space-y-4">
          <div className="p-4 border border-[#E7E0F3] rounded-lg bg-[#F8F3FF]">
            <p className="text-base text-gray-700 mb-3">
              <i className="fas fa-info-circle mr-2 text-[#A487C3]"></i>
              請選擇創建新分帳或從現有支出記錄中選擇
            </p>
            
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setSelectedExpense(null);
                  setTitle('');
                  setDescription('');
                  setTotalAmount(0);
                  setDate(new Date().toISOString().split('T')[0]);
                  setStep(2);
                }}
                className="flex-1 py-3 bg-white border border-[#A487C3] text-[#A487C3] rounded-lg text-base hover:bg-[#F0EAFA] transition-colors flex justify-center items-center"
              >
                <i className="fas fa-plus-circle mr-2"></i>
                建立新分帳
              </button>
              
              <button
                onClick={() => {
                  if (expenses.length === 0) {
                    setError('沒有可分帳的支出記錄');
                    return;
                  }
                  setShowExpenses(true);
                }}
                className="flex-1 py-3 bg-white border border-[#A487C3] text-[#A487C3] rounded-lg text-base hover:bg-[#F0EAFA] transition-colors flex justify-center items-center"
              >
                <i className="fas fa-list-alt mr-2"></i>
                選擇支出記錄
              </button>
            </div>
          </div>
          
          {showExpenses && (
            <div className="border border-gray-200 rounded-lg shadow-sm">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-medium text-base text-gray-700">最近的支出記錄</h3>
                <button
                  onClick={() => setShowExpenses(false)}
                  className="text-gray-500 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
              
              <div className="max-h-[50vh] overflow-y-auto">
                {loading ? (
                  <div className="p-5 text-center">
                    <p className="text-base text-gray-500">加載中...</p>
                  </div>
                ) : expenses.length === 0 ? (
                  <div className="p-5 text-center">
                    <p className="text-base text-gray-500">沒有可用的支出記錄</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {expenses.map((expense) => (
                      <button
                        key={expense.id}
                        onClick={() => handleSelectExpense(expense)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-start justify-between"
                      >
                        <div className="flex items-start">
                          <div className="w-10 h-10 bg-[#F0EAFA] rounded-full flex items-center justify-center text-[#A487C3] flex-shrink-0">
                            <i className={`fas ${getCategoryIcon(expense.category)}`}></i>
                          </div>
                          <div className="ml-3">
                            <p className="font-medium text-base text-gray-800">
                              {getCategoryName(expense.category)}
                            </p>
                            <p className="text-sm text-gray-500">{formatDate(expense.date)}</p>
                            {expense.notes && (
                              <p className="text-sm text-gray-500 mt-1 max-w-xs truncate">
                                {expense.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-base font-medium">
                          {formatAmount(expense.amount)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // 渲染步驟2: 填寫基本分帳信息
  const renderStep2 = () => {
    const handleFormSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim()) {
        setError('請選擇分帳類別');
        return;
      }
      if (!totalAmount || totalAmount <= 0) {
        setError('請輸入有效的金額');
        return;
      }
      setError('');
      setStep(3);
    };
    
    return (
      <div className="p-5">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold text-[#A487C3]">創建分帳 - 基本信息</h2>
          <button
            onClick={onCancel}
            className="text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-9 h-9 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4 text-base flex items-center">
            <i className="fas fa-exclamation-circle mr-2 text-red-500"></i>
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-4 text-base flex items-center">
            <i className="fas fa-check-circle mr-2 text-green-500"></i>
            <span>{success}</span>
          </div>
        )}
        
        <form onSubmit={handleFormSubmit}>
          <div className="space-y-5">
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                分帳類別
              </label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {categories.map((cat) => (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.name)}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg text-base transition-all ${
                      selectedCategory === cat.name
                        ? "bg-[#F0EAFA] text-[#A487C3] font-medium shadow-sm border border-[#D8CAE9]"
                        : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                    }`}
                  >
                    <i className={`fas ${cat.icon} text-xl mb-2`}></i>
                    <span>{cat.name}</span>
                  </button>
                ))}
              </div>
              {title && (
                <div className="mt-3 p-3 bg-[#F8F3FF] rounded-lg">
                  <p className="text-base text-[#A487C3] font-medium">{title}</p>
                </div>
              )}
            </div>
            
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                描述（選填）
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A487C3] focus:border-transparent"
                placeholder="補充說明分帳用途（選填）"
                rows={3}
              />
            </div>
            
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                總金額
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-gray-500 text-base">NT$</span>
                </div>
                <input
                  type="number"
                  value={totalAmount || ''}
                  onChange={(e) => {
                    const newAmount = parseFloat(e.target.value);
                    setTotalAmount(newAmount);
                    
                    // 更新標題中的金額信息（如果已選擇類別）
                    if (selectedCategory) {
                      setTitle(`分帳: ${selectedCategory} ${newAmount || 0}元`);
                    }
                  }}
                  className="w-full pl-10 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A487C3] focus:border-transparent"
                  placeholder="0.00"
                  min="0"
                  step="1"
                  required
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 flex items-center">
                <i className="fas fa-info-circle mr-1"></i>
                所有金額均以新台幣(NT$)記錄
              </p>
            </div>
            
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                日期
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#A487C3] focus:border-transparent"
                required
              />
            </div>
            
            <div className="flex justify-between space-x-4 pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-base font-medium"
              >
                上一步
              </button>
              
              <button
                type="submit"
                className="px-5 py-3 bg-[#A487C3] text-white rounded-lg hover:bg-[#8A5DC8] transition-colors text-base font-medium"
              >
                下一步
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  };
  
  // 渲染步驟3: 選擇參與者和設置金額
  const renderStep3 = () => {
    const currentUserAmount = calculateRemainingAmount();
    
    return (
      <div className="p-5">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold text-[#A487C3]">創建分帳 - 選擇參與者</h2>
          <button
            onClick={onCancel}
            className="text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-9 h-9 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4 text-base flex items-center">
            <i className="fas fa-exclamation-circle mr-2 text-red-500"></i>
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-4 text-base flex items-center">
            <i className="fas fa-check-circle mr-2 text-green-500"></i>
            <span>{success}</span>
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            <div className="mb-4">
              <div className="flex justify-between items-center mb-3">
                <label className="block text-base font-medium text-gray-700">
                  分帳方式
                </label>
                <div className="flex items-center">
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => handleSplitMethodChange('equal')}
                      className={`px-4 py-2 text-base rounded-lg transition-colors ${
                        splitMethod === 'equal'
                          ? 'bg-[#A487C3] text-white'
                          : 'bg-white text-gray-700 border border-gray-300'
                      }`}
                    >
                      均分
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSplitMethodChange('custom')}
                      className={`px-4 py-2 text-base rounded-lg transition-colors ${
                        splitMethod === 'custom'
                          ? 'bg-[#A487C3] text-white'
                          : 'bg-white text-gray-700 border border-gray-300'
                      }`}
                    >
                      自定義
                    </button>
                  </div>
                  
                  {/* 計算機按鈕 */}
                  <button
                    type="button"
                    onClick={() => setShowCalculator(true)}
                    className="ml-3 bg-[#A487C3] hover:bg-[#8A5DC8] text-white p-2 rounded-lg transition-colors shadow-sm hover:shadow flex items-center justify-center"
                    title="打開計算機"
                  >
                    <i className="fas fa-calculator"></i>
                  </button>
                </div>
              </div>
              
              {/* 計算機彈窗 */}
              {showCalculator && (
                <div 
                  className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 animate-fadeIn"
                  onClick={(e) => {
                    // 點擊背景關閉計算機，但阻止事件向下傳遞
                    e.stopPropagation();
                    closeCalculator();
                  }}
                >
                  <div 
                    className="bg-white rounded-xl shadow-xl w-72 overflow-hidden"
                    onClick={(e) => {
                      // 阻止點擊計算機本體時事件冒泡到背景
                      e.stopPropagation();
                    }}
                  >
                    <div className="bg-gradient-to-r from-[#7A5DC8] to-[#A487C3] px-4 py-3 text-white flex justify-between items-center">
                      <h3 className="font-bold flex items-center">
                        <i className="fas fa-calculator mr-2"></i>
                        計算機
                      </h3>
                      <button 
                        onClick={closeCalculator}
                        className="text-white hover:bg-white/20 h-7 w-7 rounded-full flex items-center justify-center"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                    
                    <div className="p-3">
                      {/* 計算機屏幕 */}
                      <div className="bg-gray-100 p-3 rounded-lg mb-3">
                        <div className="text-gray-600 text-sm mb-1 h-5 overflow-x-auto whitespace-nowrap">
                          {calculatorInput || ' '}
                        </div>
                        <div className="text-right text-xl font-bold text-gray-800">
                          {calculatorResult}
                        </div>
                      </div>
                      
                      {/* 計算機按鈕 */}
                      <div className="grid grid-cols-4 gap-2">
                        {/* 第一行 */}
                        <button onClick={() => handleCalculatorClick('C')} 
                          type="button"
                          className="bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg text-center">C</button>
                        <button onClick={() => handleCalculatorClick('(')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">(</button>
                        <button onClick={() => handleCalculatorClick(')')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">)</button>
                        <button onClick={() => handleCalculatorClick('÷')} 
                          type="button"
                          className="bg-[#E0D5F0] hover:bg-[#D0C5E0] py-3 rounded-lg text-center">÷</button>
                        
                        {/* 第二行 */}
                        <button onClick={() => handleCalculatorClick('7')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">7</button>
                        <button onClick={() => handleCalculatorClick('8')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">8</button>
                        <button onClick={() => handleCalculatorClick('9')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">9</button>
                        <button onClick={() => handleCalculatorClick('×')} 
                          type="button"
                          className="bg-[#E0D5F0] hover:bg-[#D0C5E0] py-3 rounded-lg text-center">×</button>
                        
                        {/* 第三行 */}
                        <button onClick={() => handleCalculatorClick('4')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">4</button>
                        <button onClick={() => handleCalculatorClick('5')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">5</button>
                        <button onClick={() => handleCalculatorClick('6')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">6</button>
                        <button onClick={() => handleCalculatorClick('-')} 
                          type="button"
                          className="bg-[#E0D5F0] hover:bg-[#D0C5E0] py-3 rounded-lg text-center">-</button>
                        
                        {/* 第四行 */}
                        <button onClick={() => handleCalculatorClick('1')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">1</button>
                        <button onClick={() => handleCalculatorClick('2')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">2</button>
                        <button onClick={() => handleCalculatorClick('3')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">3</button>
                        <button onClick={() => handleCalculatorClick('+')} 
                          type="button"
                          className="bg-[#E0D5F0] hover:bg-[#D0C5E0] py-3 rounded-lg text-center">+</button>
                        
                        {/* 第五行 */}
                        <button onClick={() => handleCalculatorClick('0')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center col-span-2">0</button>
                        <button onClick={() => handleCalculatorClick('.')} 
                          type="button"
                          className="bg-gray-200 hover:bg-gray-300 py-3 rounded-lg text-center">.</button>
                        <button onClick={() => handleCalculatorClick('=')} 
                          type="button"
                          className="bg-[#A487C3] hover:bg-[#8A5DC8] text-white py-3 rounded-lg text-center">=</button>
                        
                        {/* 刪除按鈕 */}
                        <button onClick={() => handleCalculatorClick('←')} 
                          type="button"
                          className="bg-gray-300 hover:bg-gray-400 py-3 rounded-lg text-center col-span-4 mt-2 flex items-center justify-center">
                          <i className="fas fa-backspace mr-2"></i> 退格
                        </button>
                        
                        {/* 使用結果按鈕 */}
                        {calculatorResult !== '0' && calculatorResult !== '錯誤' && (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation(); // 阻止事件冒泡
                              // 將結果複製到剪貼板
                              navigator.clipboard.writeText(calculatorResult);
                              closeCalculator();
                              // 顯示提示訊息
                              setSuccess(`結果 ${calculatorResult} 已複製到剪貼板`);
                              setTimeout(() => setSuccess(''), 3000);
                            }} 
                            className="bg-green-500 hover:bg-green-600 text-white py-3 rounded-lg text-center col-span-4 mt-2 flex items-center justify-center"
                          >
                            <i className="fas fa-copy mr-2"></i> 複製結果並關閉
                          </button>
                        )}
                        
                        {/* 單純關閉按鈕 */}
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation(); // 阻止事件冒泡
                            closeCalculator();
                          }} 
                          className="bg-gray-500 hover:bg-gray-600 text-white py-3 rounded-lg text-center col-span-4 mt-2 flex items-center justify-center"
                        >
                          <i className="fas fa-times-circle mr-2"></i> 關閉計算機
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="p-4 bg-[#F8F3FF] rounded-lg mb-4">
                <p className="text-base text-[#A487C3] flex items-center">
                  <i className="fas fa-info-circle mr-2"></i>
                  總金額: {formatAmount(totalAmount)}
                  {splitMethod === 'equal' && participants.length > 0 && (
                    <span className="ml-2">，每人 {formatAmount(Math.floor(totalAmount / (participants.length + 1)))}</span>
                  )}
                </p>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-base font-medium text-gray-700 mb-3">
                參與者
              </label>
              
              {/* 當前用戶（創建者） */}
              <div className="mb-3 p-4 bg-gray-50 rounded-lg shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-12 h-12 rounded-full bg-[#F0EAFA] flex items-center justify-center text-[#A487C3] uppercase border border-[#E8DFFC] overflow-hidden flex-shrink-0">
                      {currentUser?.photoURL ? (
                        <img src={currentUser.photoURL} alt={currentUser.displayName || ''} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-base font-bold">
                          {currentUser?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || '?'}
                        </span>
                      )}
                    </div>
                    <div className="ml-3">
                      <p className="font-medium text-base text-gray-800">
                        {currentUser?.displayName || currentUser?.email?.split('@')[0] || '我'} (我)
                      </p>
                      <p className="text-sm text-gray-500">創建者</p>
                    </div>
                  </div>
                  <div className="w-28 text-right">
                    <p className="font-medium text-base text-gray-800">
                      {formatAmount(currentUserAmount)}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* 已選參與者 */}
              {participants.length > 0 && (
                <div className="space-y-3 mb-5">
                  <h4 className="font-medium text-base text-gray-700">已選參與者:</h4>
                  
                  {participants.map((participant) => (
                    <div key={participant.userId} className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="w-12 h-12 rounded-full bg-[#F0EAFA] flex items-center justify-center text-[#A487C3] uppercase border border-[#E8DFFC] overflow-hidden flex-shrink-0">
                            {participant.photoURL ? (
                              <img src={participant.photoURL} alt={participant.nickname} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-base font-bold">
                                {participant.nickname.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="ml-3">
                            <p className="font-medium text-base text-gray-800">{participant.nickname}</p>
                            <p className="text-sm text-gray-500">{participant.email}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                          {splitMethod === 'custom' ? (
                            <input
                              type="number"
                              value={participant.amount}
                              onChange={(e) => updateParticipantAmount(participant.userId, Math.max(0, Number(e.target.value)))}
                              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-right text-base"
                              min="0"
                              step="1"
                            />
                          ) : (
                            <span className="w-24 text-right font-medium text-base">
                              {formatAmount(participant.amount)}
                            </span>
                          )}
                          
                          <button
                            type="button"
                            onClick={() => toggleFriend(friends.find(f => f.id === participant.userId)!)}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 border border-red-300 shadow-sm hover:shadow-md"
                            aria-label={`移除${participant.nickname}`}
                          >
                            <i className="fas fa-times text-lg"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* 選擇好友 */}
              <div className="border border-gray-200 rounded-lg overflow-hidden mt-4 shadow-sm">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h4 className="font-medium text-base text-gray-700">選擇好友:</h4>
                </div>
                
                <div className="max-h-[40vh] overflow-y-auto p-4">
                  {friends.length === 0 ? (
                    <p className="text-center text-base text-gray-500 py-4">沒有可選擇的好友</p>
                  ) : (
                    <div className="space-y-3">
                      {friends.filter(friend => !participants.some(p => p.userId === friend.id)).map(friend => (
                        <div 
                          key={friend.id}
                          className="flex items-center p-3 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors border border-gray-100"
                          onClick={() => toggleFriend(friend)}
                        >
                          <div className="w-10 h-10 rounded-full bg-[#F0EAFA] flex items-center justify-center text-[#A487C3] uppercase border border-[#E8DFFC] overflow-hidden flex-shrink-0">
                            {friend.photoURL ? (
                              <img src={friend.photoURL} alt={friend.nickname} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-base font-bold">
                                {friend.nickname.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="ml-3 flex-1">
                            <p className="font-medium text-base text-gray-800">{friend.nickname}</p>
                            <p className="text-sm text-gray-500">{friend.email}</p>
                          </div>
                          <button
                            type="button"
                            className="px-4 py-2 flex items-center justify-center rounded-lg bg-[#A487C3] text-white hover:bg-[#8A5DC8] transition-all duration-300 border border-[#8A5DC8] shadow-md hover:shadow-lg transform hover:scale-105"
                            onClick={(e) => {
                              e.stopPropagation(); // 防止觸發父元素的點擊事件
                              toggleFriend(friend);
                            }}
                            aria-label={`添加${friend.nickname}`}
                          >
                            <i className="fas fa-plus text-lg mr-1"></i>
                            <span>添加</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {participants.length === 0 && (
              <p className="mt-4 text-base text-amber-600 flex items-center">
                <i className="fas fa-exclamation-circle mr-2"></i>
                請至少選擇一位好友來分帳
              </p>
            )}
            
            <div className="flex justify-between space-x-4 py-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-base font-medium"
              >
                上一步
              </button>
              
              <button
                type="submit"
                disabled={participants.length === 0}
                className={`px-5 py-3 rounded-lg text-white text-base font-medium ${
                  participants.length === 0
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-[#A487C3] hover:bg-[#8A5DC8] transition-colors'
                }`}
              >
                建立分帳
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  };
  
  // 根據當前步驟渲染對應的內容
  switch(step) {
    case 1:
      return renderStep1();
    case 2:
      return renderStep2();
    case 3:
      return renderStep3();
    default:
      return renderStep1();
  }
};

export default SplitExpenseForm; 