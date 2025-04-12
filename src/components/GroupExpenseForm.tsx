import React, { useState, useEffect } from 'react';
import { collection, addDoc, Timestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import './ExpenseGroupForm.css';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

interface GroupExpenseFormProps {
  groupId: string;
  onSave: () => void;
  onCancel: () => void;
  initialValues?: any; // 添加支持初始值（用於編輯模式）
}

// 支出類別定義
type ExpenseCategory = '餐飲' | '交通' | '住宿' | '其他';

interface GroupMember {
  userId: string;
  nickname: string;
  photoURL?: string;
}

const GroupExpenseForm: React.FC<GroupExpenseFormProps> = ({
  groupId,
  onSave,
  onCancel,
  initialValues
}) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState(initialValues?.title || '');
  const [amount, setAmount] = useState(initialValues?.amount ? initialValues.amount.toString() : '');
  const [currency, setCurrency] = useState(initialValues?.currency || 'NTD'); // 保留但不提供選擇
  const [date, setDate] = useState(initialValues?.date ? 
    (initialValues.date instanceof Date ? initialValues.date : initialValues.date.toDate()) : 
    new Date());
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>(
    initialValues?.category || '餐飲'
  );
  const [currentUserInfo, setCurrentUserInfo] = useState<{userId: string; nickname: string; photoURL?: string} | null>(
    initialValues?.payerId && initialValues?.payerName ? 
    { userId: initialValues.payerId, nickname: initialValues.payerName, photoURL: initialValues.payerPhotoURL } : 
    null
  );
  const [isEditing] = useState(!!initialValues); // 判斷是否為編輯模式
  
  // 類別選項
  const categories: Array<{id: ExpenseCategory, name: string, icon: string}> = [
    { id: '餐飲', name: '餐飲', icon: 'fas fa-utensils' },
    { id: '交通', name: '交通', icon: 'fas fa-taxi' },
    { id: '住宿', name: '住宿', icon: 'fas fa-hotel' },
    { id: '其他', name: '其他', icon: 'fas fa-shopping-bag' }
  ];
  
  // 貨幣選項 (保留此變數以供其他地方使用)
  const currencies = [
    { code: 'NTD', symbol: 'NT$', name: '新台幣' }
  ];
  
  // 加載群組資訊和成員
  useEffect(() => {
    const loadGroupDetails = async () => {
      try {
        console.log('開始加載分帳詳情，群組ID:', groupId);
        
        // 嘗試從 expenseGroups 集合中加載
        let groupDoc;
        try {
          const groupRef = doc(db, 'expenseGroups', groupId);
          groupDoc = await getDoc(groupRef);
          console.log('從 expenseGroups 加載結果:', groupDoc.exists() ? '找到文檔' : '未找到文檔');
        } catch (error) {
          console.error('從 expenseGroups 加載失敗，嘗試從 splitTransactions 加載:', error);
        }
        
        // 如果 expenseGroups 中找不到，嘗試從 splitTransactions 集合中加載
        if (!groupDoc || !groupDoc.exists()) {
          console.log('嘗試從 splitTransactions 加載群組');
          const splitRef = doc(db, 'splitTransactions', groupId);
          groupDoc = await getDoc(splitRef);
          console.log('從 splitTransactions 加載結果:', groupDoc.exists() ? '找到文檔' : '未找到文檔');
        }
        
        if (groupDoc && groupDoc.exists()) {
          const groupData = groupDoc.data();
          console.log('成功加載群組數據:', groupData);
          
          // 檢查群組成員數據
          const membersData = groupData.members || groupData.participants || [];
          console.log('群組成員數據:', membersData);
          
          if (membersData.length === 0) {
            console.warn('警告: 群組沒有成員數據');
            setError('此群組沒有成員，無法記錄支出');
            return;
          }
          
          // 設置群組成員
          const groupMembers = membersData.map((participant: any) => ({
            userId: participant.userId,
            nickname: participant.nickname || '未知用戶',
            photoURL: participant.photoURL
          }));
          
          console.log('處理後的成員數據:', groupMembers);
          setMembers(groupMembers);
          
          // 找到當前用戶的資訊
          if (currentUser) {
            const userMember = groupMembers.find((member: GroupMember) => member.userId === currentUser.uid);
            if (userMember) {
              console.log('找到當前用戶成員資訊:', userMember);
              setCurrentUserInfo(userMember);
            } else {
              console.log('未找到當前用戶在群組中的資訊，使用默認資訊');
            }
          }
          
        } else {
          console.error('群組數據不存在');
          setError('無法找到群組資訊');
        }
      } catch (error) {
        console.error('加載分帳詳情失敗:', error);
        setError('無法加載群組資訊');
      }
    };
    
    loadGroupDetails();
  }, [groupId, currentUser]);
  
  // 提交表單
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError('');
      console.log('開始提交群組支出表單', isEditing ? '(編輯模式)' : '(新增模式)');
      
      // 檢查 groupId 是否有效
      if (!groupId) {
        console.error('無效的群組ID:', groupId);
        setError('無效的群組ID，無法添加支出');
        setLoading(false);
        return;
      }
      
      console.log('使用的群組ID:', groupId);
      
      // 驗證表單
      if (!title.trim()) {
        setError('請輸入支出名稱');
        setLoading(false);
        return;
      }
      
      if (!amount || parseFloat(amount) <= 0) {
        setError('請輸入有效的金額');
        setLoading(false);
        return;
      }
      
      if (!currentUser) {
        setError('請先登入');
        setLoading(false);
        return;
      }
      
      // 獲取支付者信息 (始終為當前用戶)
      const payerInfo = currentUserInfo || {
        userId: currentUser.uid,
        nickname: currentUser.displayName || currentUser.email?.split('@')[0] || '用戶',
        photoURL: currentUser.photoURL || ''
      };
      
      console.log('支付者資訊:', payerInfo);
      
      // 建立支出記錄
      const expenseData = {
        groupId: groupId || '', // 確保 groupId 正確傳遞且有預設值
        title: title.trim() || '未命名支出',
        amount: parseFloat(amount) || 0,
        currency: currency || 'NTD',
        category: category || '其他',
        date: Timestamp.fromDate(date || new Date()),
        notes: notes.trim() || '',
        payerId: payerInfo.userId || '',
        payerName: payerInfo.nickname || '未知用戶',
        payerPhotoURL: payerInfo.photoURL || '',
        updatedAt: Timestamp.now(),
        ...(isEditing ? {} : {
          createdAt: Timestamp.now(),
          createdBy: currentUser.uid || '',
        }),
        status: 'pending',
        confirmed: false,
        splitMethod: 'equal', // 添加默認的分帳方式
        // 初始化參與者數組，包含群組所有成員
        participants: members.map(member => ({
          userId: member.userId,
          nickname: member.nickname || '未知用戶',
          photoURL: member.photoURL || '',
          percentage: 0, // 默認百分比
          amount: 0 // 默認金額
        }))
      };
      
      // 輔助函數：清理對象中的undefined值
      const cleanUndefinedValues = (obj: any): any => {
        if (obj === undefined) return null;
        if (obj === null) return null;
        
        if (Array.isArray(obj)) {
          return obj.map(item => cleanUndefinedValues(item));
        }
        
        if (typeof obj === 'object' && obj !== null) {
          const cleaned: any = {};
          for (const key in obj) {
            cleaned[key] = cleanUndefinedValues(obj[key]);
          }
          return cleaned;
        }
        
        return obj;
      };
      
      // 清理數據中的undefined值
      const cleanedData = cleanUndefinedValues(expenseData);
      
      // 記錄準備保存的數據，檢查是否有 undefined 值
      console.log('準備保存的支出數據:', JSON.stringify(cleanedData, (key, value) => {
        if (value === undefined) return '<<undefined>>';
        return value;
      }));
      
      try {
        // 檢查資料庫連接狀態
        console.log('檢查資料庫連接狀態...');
        
        if (isEditing && initialValues.id) {
          // 編輯現有支出
          console.log('更新現有支出記錄:', initialValues.id);
          const expenseRef = doc(db, 'groupExpenses', initialValues.id);
          await updateDoc(expenseRef, cleanedData);
          console.log('支出記錄已成功更新');
          setSuccess('支出已成功更新');
        } else {
          // 添加新支出
          console.log('添加新支出記錄');
          const docRef = await addDoc(collection(db, 'groupExpenses'), cleanedData);
          console.log('支出記錄已成功添加，文檔ID:', docRef.id);
          setSuccess('支出已成功添加！文檔ID: ' + docRef.id);
        }
        
        setLoading(false);
        
        // 立即關閉表單並返回分帳詳情頁面
        console.log('調用 onSave 回調函數');
        onSave(); // 調用onSave通知父組件更新
        
        // 清空表單，方便下次使用
        if (!isEditing) {
          setTitle('');
          setAmount('');
          setNotes('');
          setCategory('餐飲');
          setDate(new Date());
        }
        
      } catch (dbError) {
        console.error('儲存支出記錄到資料庫失敗:', dbError);
        setError('儲存支出記錄失敗，請稍後再試');
        setLoading(false);
      }
      
    } catch (error) {
      console.error('處理支出失敗:', error);
      setError('無法處理支出，請稍後再試');
      setLoading(false);
    } finally {
      if (loading) {
        setLoading(false);
      }
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full">
        {/* 頭部 */}
        <div className="bg-gradient-to-r from-[#7A5DC8] to-[#A487C3] px-6 py-4 rounded-t-xl flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center">
            <i className="fas fa-file-invoice-dollar text-white mr-2 text-xl"></i>
            <span>{initialValues ? '編輯支出' : '新增群組支出'}</span>
          </h2>
          <button
            onClick={onCancel}
            className="text-white hover:bg-white/20 h-8 w-8 rounded-full flex items-center justify-center"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        {/* 表單內容 */}
        <form onSubmit={handleSubmit} className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* 錯誤提示 */}
          {error && (
            <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg border border-red-200">
              <div className="flex items-center">
                <i className="fas fa-exclamation-circle mr-2"></i>
                <span>{error}</span>
              </div>
            </div>
          )}
          
          {/* 成功提示 */}
          {success && (
            <div className="mb-4 bg-green-50 text-green-600 p-3 rounded-lg border border-green-200">
              <div className="flex items-center">
                <i className="fas fa-check-circle mr-2"></i>
                <span>{success}</span>
              </div>
            </div>
          )}
          
          {/* 支出名稱 */}
          <div className="space-y-2">
            <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-1">
              支出名稱 <span className="text-red-500">*</span>
            </label>
            <div className="relative rounded-xl shadow-sm group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fas fa-tag text-[#A487C3] group-focus-within:text-[#7A5DC8] transition-colors duration-300"></i>
              </div>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="pl-12 w-full py-3 border border-gray-200 bg-gray-50 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] transition-all duration-300"
                placeholder="例：燒肉晚餐、日本旅遊2028..."
                required
              />
            </div>
          </div>
          
          {/* 類別選擇 - 重新設計 */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">
              消費類別 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`flex items-center px-3 py-2 rounded-lg transition-all duration-200 ${
                    category === cat.id
                      ? 'bg-[#A487C3] text-white shadow-sm'
                      : 'bg-gray-50 text-gray-700 border border-gray-200 hover:border-[#A487C3] hover:bg-gray-100'
                  }`}
                >
                  <i className={`${cat.icon} ${category === cat.id ? 'text-white' : 'text-[#A487C3]'} mr-2`}></i>
                  <span className="text-sm font-medium">{cat.name}</span>
                </button>
              ))}
            </div>
            
            {/* 类别说明 */}
            <div className="text-xs text-gray-500 mt-1 flex items-center">
              <i className="fas fa-info-circle mr-1.5"></i>
              選擇適合此支出的類別，方便後續查詢和統計
            </div>
          </div>
          
          {/* 金額區塊 */}
          <div className="space-y-2">
            <label htmlFor="amount" className="block text-sm font-semibold text-gray-700">
              金額 <span className="text-red-500">*</span>
            </label>
            <div className="relative rounded-xl shadow-sm group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fas fa-dollar-sign text-[#A487C3] group-focus-within:text-[#7A5DC8] transition-colors duration-300"></i>
              </div>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="1"
                className="pl-12 w-full py-3 text-lg font-medium border border-gray-200 bg-gray-50 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] transition-all duration-300"
                placeholder="0"
                required
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 font-medium">NTD</span>
              </div>
            </div>
          </div>
          
          {/* 日期 */}
          <div className="space-y-2">
            <label htmlFor="date" className="block text-sm font-semibold text-gray-700">
              日期
            </label>
            <div className="relative rounded-xl shadow-sm group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fas fa-calendar-alt text-[#A487C3] group-focus-within:text-[#7A5DC8] transition-colors duration-300"></i>
              </div>
              <input
                type="date"
                id="date"
                value={date.toISOString().split('T')[0]}
                onChange={(e) => setDate(new Date(e.target.value))}
                className="pl-12 w-full py-3 border border-gray-200 bg-gray-50 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] transition-all duration-300"
              />
            </div>
          </div>
          
          {/* 備註 */}
          <div className="space-y-2">
            <label htmlFor="notes" className="block text-sm font-semibold text-gray-700 flex items-center">
              <i className="fas fa-sticky-note text-[#A487C3] mr-2"></i>
              備註<span className="text-gray-500 text-xs ml-1.5">(選填)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full p-4 border border-gray-200 bg-gray-50 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] transition-all duration-300"
              placeholder="添加備註..."
            />
          </div>
          
          {/* 支付者提示 - 顯示當前用戶作為支付者 */}
          <div>
            <div className="bg-[#F0EAFA] p-4 rounded-xl border border-[#E5D9F2] shadow-inner">
              <div className="flex items-center">
                <div className="mr-3 bg-[#A487C3] text-white rounded-full w-10 h-10 flex items-center justify-center shadow-md">
                  <i className="fas fa-user text-lg"></i>
                </div>
                <div>
                  <p className="text-sm text-gray-700 flex items-center font-medium">
                    <i className="fas fa-info-circle text-[#A487C3] mr-2"></i>
                    支付者: <span className="font-bold ml-1.5 text-[#7A5DC8]">
                      {currentUserInfo?.nickname || currentUser?.displayName || currentUser?.email?.split('@')[0] || '您'}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    支出記錄將自動以您的身份提交，您將被視為此支出的支付者
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* 提交按鈕 */}
          <div className="flex gap-4 justify-end pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all duration-300 font-medium shadow-sm hover:shadow transform hover:translate-y-[-2px]"
              disabled={loading}
            >
              <i className="fas fa-times mr-1.5"></i>
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-gradient-to-r from-[#7A5DC8] to-[#A487C3] text-white rounded-xl hover:from-[#6A4DB8] hover:to-[#9477B3] transition-all duration-300 font-medium shadow-md hover:shadow-lg transform hover:translate-y-[-2px]"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin mr-2 h-5 w-5 border-2 border-b-transparent border-white rounded-full"></div>
                  處理中...
                </div>
              ) : (
                <>
                  <i className="fas fa-save mr-1.5"></i>
                  儲存支出
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GroupExpenseForm; 