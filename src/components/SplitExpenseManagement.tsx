import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Friend } from '../contexts/AuthContext';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, Timestamp, runTransaction, deleteDoc, getDoc, orderBy, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import SplitExpenseForm from './SplitExpenseForm';
import ExpenseGroupForm from './ExpenseGroupForm';
import GroupExpenseForm from './GroupExpenseForm';
import ConfirmExpenseForm from './ConfirmExpenseForm';
import InviteFriendsForm from './InviteFriendsForm';
import GroupInviteList from './GroupInviteList';
import { toast } from 'react-toastify';
import './SplitExpenseManagement.css'; // 引入CSS文件
import { format } from 'date-fns';

// 分帳交易類型定義
export interface SplitTransaction {
  id: string;
  creatorId: string;             // 創建者ID
  title: string;                 // 分帳標題
  description: string;           // 描述
  totalAmount: number;           // 總金額
  date: Date;                    // 記錄日期
  originalExpenseId?: string;    // 原始支出ID（如果是從已有支出創建）
  status: 'pending' | 'completed'; // 狀態：進行中/已完成
  participants: SplitParticipant[]; // 參與者
  created: Date;                 // 創建時間
}

// 參與者類型定義
export interface SplitParticipant {
  userId: string;                // 用戶ID
  nickname: string;              // 用戶暱稱
  email?: string;                // 用戶郵箱
  photoURL?: string;             // 用戶頭像
  amount: number;                // 應付金額
  paid: boolean;                 // 是否已支付
  paymentDate?: Date;            // 支付日期
}

// 組件屬性
interface SplitExpenseManagementProps {
  onClose: () => void;
  groupInviteCount?: number; // 添加群組邀請數量參數
}

// 分帳管理組件
const SplitExpenseManagement: React.FC<SplitExpenseManagementProps> = ({ onClose, groupInviteCount = 0 }) => {
  const { currentUser } = useAuth();
  
  // 狀態
  const [splitTransactions, setSplitTransactions] = useState<SplitTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'created'>('created'); // 默認顯示分帳群組
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showEditGroupForm, setShowEditGroupForm] = useState(false); // 添加編輯群組表單狀態
  const [showTransactionDetails, setShowTransactionDetails] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<SplitTransaction | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // 添加確認刪除對話框狀態
  const [deleting, setDeleting] = useState(false); // 添加刪除中狀態
  const [showInviteFriendsForm, setShowInviteFriendsForm] = useState(false); // 添加邀請好友表單狀態
  const [inviteTargetGroup, setInviteTargetGroup] = useState<{id: string, title: string} | null>(null); // 存储邀请目标群组信息
  const [showGroupInvites, setShowGroupInvites] = useState(false); // 控制群組邀請列表的顯示
  const [showGroupExpenseForm, setShowGroupExpenseForm] = useState(false);
  const [showConfirmExpenseForm, setShowConfirmExpenseForm] = useState(false); // 新增：顯示確認帳單表單
  const [selectedExpenses, setSelectedExpenses] = useState<any[]>([]); // 新增：選擇的支出列表
  const [groupExpenses, setGroupExpenses] = useState<any[]>([]); // 新增：群組中的支出列表
  const [editingExpense, setEditingExpense] = useState<any>(null);
  
  // 當顯示分帳詳情時自動加載群組支出
  useEffect(() => {
    if (showTransactionDetails && selectedTransaction) {
      console.log('分帳詳情顯示，自動加載群組支出，群組ID:', selectedTransaction.id);
      // 確保 selectedTransaction.id 是有效的
      if (selectedTransaction.id && selectedTransaction.id.trim() !== '') {
        loadGroupExpenses(selectedTransaction.id);
      } else {
        console.error('無效的群組ID，無法加載支出');
      }
    }
  }, [showTransactionDetails, selectedTransaction, showGroupExpenseForm]);
  
  // 監聽 GroupExpenseForm 關閉事件，主動重新加載群組支出
  useEffect(() => {
    // 當從添加支出表單返回到分帳詳情時，重新加載支出
    if (!showGroupExpenseForm && selectedTransaction) {
      console.log('從添加支出表單返回，重新加載群組支出');
      loadGroupExpenses(selectedTransaction.id);
      
      // 確保分帳詳情頁面是可見的
      if (!showTransactionDetails) {
        console.log('顯示分帳詳情頁面');
        setShowTransactionDetails(true);
      }
    }
  }, [showGroupExpenseForm, selectedTransaction]);
  
  // 初始化加載
  useEffect(() => {
    if (currentUser) {
      loadSplitTransactions();
    }
  }, [currentUser]);
  
  // 輔助函數：解析 Firestore 時間戳記為 Date 對象
  const parseFirestoreTimestamp = (timestamp: any): Date => {
    try {
      if (!timestamp) return new Date(); // 如果為空，返回當前時間
      
      if (timestamp instanceof Timestamp) {
        return timestamp.toDate();
      }
      
      if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
      }
      
      if (timestamp && timestamp.seconds) {
        return new Date(timestamp.seconds * 1000);
      }
      
      // 嘗試將其作為日期字符串或時間戳解析
      const parsedDate = new Date(timestamp);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
      
      // 如果所有方法都失敗，返回當前日期
      return new Date();
    } catch (err) {
      console.error('解析Firestore時間戳出錯:', err);
      return new Date();
    }
  };
  
  // 加載分帳記錄的函數
  const loadSplitTransactions = async () => {
    try {
      setLoading(true);
      setError(''); // 清除之前的錯誤
      
      if (!currentUser) return;
      
      console.log('加載分帳記錄，當前標籤:', activeTab);
      
      // 用於去重的集合
      const uniqueTransactionIds = new Set();
      
      // 處理查詢結果
      const transactionsList: SplitTransaction[] = [];
      
      // 查詢用戶創建的分帳群組和參與的分帳群組
      try {
        // 查詢用戶創建的分帳群組
        const groupsRef = collection(db, 'expenseGroups');
        
        // 查詢用戶創建的群組
        const createdGroupsQuery = query(
          groupsRef,
          where('createdBy', '==', currentUser.uid),
          orderBy('createdAt', 'desc')
        );
        
        console.log('查詢用戶創建的群組...');
        // 獲取用戶創建的群組
        const createdGroupsSnapshot = await getDocs(createdGroupsQuery);
        console.log('已創建的群組數量:', createdGroupsSnapshot.size);
        
        // 處理為分帳記錄格式
        createdGroupsSnapshot.forEach((doc) => {
          try {
            const data = doc.data();
            console.log('群組數據:', doc.id, data);
            
            // 使用輔助函數解析日期
            const date = parseFirestoreTimestamp(data.createdAt);
            
            // 確保members是數組
            const members = Array.isArray(data.members) ? data.members : [];
            
            // 將群組轉換為分帳交易格式顯示
            const transaction: SplitTransaction = {
              id: doc.id,
              creatorId: data.createdBy || currentUser.uid,
              title: data.name || '未命名群組',
              description: data.description || '',
              totalAmount: 0, // 群組沒有總金額
              date,
              status: 'pending',
              participants: members.map((m: any) => ({
                userId: m.userId || '',
                nickname: m.nickname || '未知用戶',
                email: m.email || undefined,
                photoURL: m.photoURL || undefined,
                amount: 0,
                paid: false
              })),
              created: date
            };
            
            transactionsList.push(transaction);
            uniqueTransactionIds.add(doc.id);
          } catch (err) {
            console.error('處理群組數據時出錯:', err);
          }
        });
        
        // 查詢用戶參與的分帳群組 - 使用memberIds數組
        try {
          // 首先嘗試使用memberIds數組查詢
          const participantGroupsQuery = query(
            groupsRef,
            where('memberIds', 'array-contains', currentUser.uid),
            orderBy('createdAt', 'desc')
          );
          
          console.log('查詢用戶參與的分帳群組(通過memberIds)...');
          const participantGroupsSnapshot = await getDocs(participantGroupsQuery);
          console.log('參與的分帳群組數量(通過memberIds):', participantGroupsSnapshot.size);
          
          // 處理為分帳記錄格式
          participantGroupsSnapshot.forEach((doc) => {
            try {
              // 避免重複
              if (uniqueTransactionIds.has(doc.id)) return;
              
              const data = doc.data();
              const date = parseFirestoreTimestamp(data.createdAt);
              
              // 確保members是數組
              const members = Array.isArray(data.members) ? data.members : [];
              
              // 將群組轉換為分帳交易格式顯示
              const transaction: SplitTransaction = {
                id: doc.id,
                creatorId: data.createdBy || '',
                title: data.name || '未命名群組',
                description: data.description || '',
                totalAmount: 0,
                date,
                status: 'pending',
                participants: members.map((m: any) => ({
                  userId: m.userId || '',
                  nickname: m.nickname || '未知用戶',
                  email: m.email || undefined,
                  photoURL: m.photoURL || undefined,
                  amount: 0,
                  paid: false
                })),
                created: date
              };
              
              uniqueTransactionIds.add(doc.id);
              transactionsList.push(transaction);
            } catch (err) {
              console.error('處理參與群組數據時出錯:', err);
            }
          });
        } catch (memberIdsError) {
          console.error('通過memberIds查詢參與的分帳群組失敗:', memberIdsError);
          
          // 如果memberIds查詢失敗，嘗試使用成員數組查詢
          try {
            console.log('嘗試備用方法查詢參與的分帳群組...');
            // 獲取所有群組
            const allGroupsQuery = query(groupsRef, orderBy('createdAt', 'desc'));
            const allGroupsSnapshot = await getDocs(allGroupsQuery);
            
            // 手動過濾，查找包含當前用戶的群組
            let participantGroups = 0;
            allGroupsSnapshot.forEach((doc) => {
              try {
                // 避免重複
                if (uniqueTransactionIds.has(doc.id)) return;
                
                const data = doc.data();
                // 檢查成員列表中是否包含當前用戶
                const members = Array.isArray(data.members) ? data.members : [];
                const isParticipant = members.some((m: any) => m.userId === currentUser.uid);
                
                if (isParticipant) {
                  participantGroups++;
                  const date = parseFirestoreTimestamp(data.createdAt);
                  
                  // 將群組轉換為分帳交易格式顯示
                  const transaction: SplitTransaction = {
                    id: doc.id,
                    creatorId: data.createdBy || '',
                    title: data.name || '未命名群組',
                    description: data.description || '',
                    totalAmount: 0,
                    date,
                    status: 'pending',
                    participants: members.map((m: any) => ({
                      userId: m.userId || '',
                      nickname: m.nickname || '未知用戶',
                      email: m.email || undefined,
                      photoURL: m.photoURL || undefined,
                      amount: 0,
                      paid: false
                    })),
                    created: date
                  };
                  
                  uniqueTransactionIds.add(doc.id);
                  transactionsList.push(transaction);
                }
              } catch (err) {
                console.error('手動處理群組數據時出錯:', err);
              }
            });
            
            console.log('手動查詢到的參與分帳群組數量:', participantGroups);
          } catch (allGroupsError) {
            console.error('手動查詢參與的分帳群組失敗:', allGroupsError);
          }
        }
      } catch (error) {
        console.error('查詢群組數據時出錯:', error);
      }
      
      // 查詢其他分帳記錄
      if (activeTab === 'created') {
        // ... 其他查詢代碼，已省略保持不變 ...
      }
      
      // 更新狀態，設置分帳記錄
      setSplitTransactions(transactionsList);
      
    } catch (error) {
      console.error('加載分帳記錄失敗:', error);
      setError('無法加載分帳記錄，請稍後再試');
    } finally {
      setLoading(false);
    }
  };
  
  // 創建分帳記錄
  const createSplitExpense = async (formData: any): Promise<string> => {
    try {
      setLoading(true);
      
      // 添加到資料庫
      const docRef = await addDoc(collection(db, 'splitTransactions'), {
        ...formData,
        creatorId: currentUser?.uid,
        created: serverTimestamp()
      });
      
      setSuccess('分帳記錄創建成功');
      setShowCreateForm(false);
      
      // 重新加載資料
      loadSplitTransactions();
      
      return docRef.id;
    } catch (error) {
      console.error('創建分帳記錄失敗:', error);
      setError('創建分帳記錄失敗，請稍後再試');
      throw error; // 重新拋出錯誤以便調用者可以處理
    } finally {
      setLoading(false);
    }
  };
  
  // 處理表單提交創建分帳群組
  const createExpenseGroupFromForm = (groupData: { name: string; description: string }) => {
    // 這個函數只在表單提交後處理UI變化，不再創建群組
    // 因為群組已在ExpenseGroupForm中創建
    setShowGroupForm(false);
    // 重新加載群組列表
    loadSplitTransactions();
    // 顯示成功提示
    toast.success('分帳群組已成功創建！', {
      position: "top-center",
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
  };
  
  // 渲染群組表單
  const renderGroupForm = () => {
    if (!showGroupForm) return null;
    
    return (
      <ExpenseGroupForm 
        onSave={createExpenseGroupFromForm}
        onCancel={() => setShowGroupForm(false)}
      />
    );
  };
  
  // 編輯群組功能
  const handleEditGroup = () => {
    setShowEditGroupForm(true);
    setShowTransactionDetails(false);
  };

  // 保存編輯群組
  const saveEditedGroup = async (groupId: string, updatedData: any) => {
    try {
      setLoading(true);
      
      const groupRef = doc(db, 'expenseGroups', groupId);
      await updateDoc(groupRef, {
        name: updatedData.name,
        description: updatedData.description,
        updatedAt: serverTimestamp()
      });
      
      setSuccess('分帳群組更新成功');
      setShowEditGroupForm(false);
      
      // 更新本地數據
      setSplitTransactions(prev => 
        prev.map(t => 
          t.id === groupId 
            ? {
                ...t,
                title: updatedData.name,
                description: updatedData.description
              }
            : t
        )
      );
      
      // 更新當前選中的交易
      if (selectedTransaction && selectedTransaction.id === groupId) {
        setSelectedTransaction({
          ...selectedTransaction,
          title: updatedData.name,
          description: updatedData.description
        });
      }
      
      // 重新加載數據
      loadSplitTransactions();
      
      // 显示分账详情
      setShowTransactionDetails(true);
      
      // 顯示成功提示
      toast.success('分帳群組已成功更新！', {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      
    } catch (error: any) {
      console.error('更新分帳群組失敗:', error);
      const errorMessage = error.message || '更新分帳群組失敗，請稍後再試';
      setError(errorMessage);
      
      toast.error(errorMessage, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } finally {
      setLoading(false);
      // 无论成功还是失败，都确保返回到分账详情页面
      setShowTransactionDetails(true);
    }
  };
  
  // 處理交易點擊事件
  const handleTransactionClick = (transaction: SplitTransaction) => {
    setSelectedTransaction(transaction);
    setShowTransactionDetails(true);
  };
  
  // 刪除分帳群組
  const deleteExpenseGroup = async (groupId: string) => {
    if (!currentUser) return;
    if (!groupId) return;
    
    try {
      setDeleting(true);
      setError('');
      
      // 檢查群組是否存在
      const groupRef = doc(db, 'expenseGroups', groupId);
      const groupDoc = await getDoc(groupRef);
      
      if (!groupDoc.exists()) {
        throw new Error('群組不存在');
      }
      
      // 檢查用戶是否為群組成員或創建者
      const groupData = groupDoc.data();
      
      // 首先檢查用戶是否為創建者，創建者擁有刪除權限
      const isCreator = groupData.createdBy === currentUser.uid;
      
      // 再檢查用戶是否為群組成員，考慮數據可能存在的不同字段
      let isGroupMember = false;
      
      // 檢查 members 字段
      if (Array.isArray(groupData.members)) {
        isGroupMember = groupData.members.some((m: any) => m.userId === currentUser.uid);
      }
      
      // 如果在 members 中未找到，則檢查 participants 字段
      if (!isGroupMember && Array.isArray(groupData.participants)) {
        isGroupMember = groupData.participants.some((p: any) => p.userId === currentUser.uid);
      }
      
      // 檢查 memberIds 字段 (可能是一個簡化的成員ID數組)
      if (!isGroupMember && Array.isArray(groupData.memberIds)) {
        isGroupMember = groupData.memberIds.includes(currentUser.uid);
      }
      
      console.log('刪除群組權限檢查:', {
        isCreator,
        isGroupMember,
        currentUserId: currentUser.uid,
        createdBy: groupData.createdBy,
        hasMembers: !!groupData.members,
        hasParticipants: !!groupData.participants,
        hasMemberIds: !!groupData.memberIds
      });
      
      // 如果既不是創建者也不是成員，則拒絕刪除操作
      if (!isCreator && !isGroupMember) {
        throw new Error('只有群組成員或創建者才能刪除群組');
      }
      
      // 刪除群組邀請
      const invitesQuery = query(
        collection(db, 'groupInvites'),
        where('groupId', '==', groupId)
      );
      const invitesSnapshot = await getDocs(invitesQuery);
      
      const deleteInvitePromises = invitesSnapshot.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      
      await Promise.all(deleteInvitePromises);
      
      // 刪除群組相關的支出記錄
      try {
        // 查詢屬於該群組的支出記錄
        const expensesQuery = query(
          collection(db, 'groupExpenses'),
          where('groupId', '==', groupId)
        );
        const expensesSnapshot = await getDocs(expensesQuery);
        
        // 如果有支出記錄，則刪除它們
        if (!expensesSnapshot.empty) {
          console.log(`刪除群組 ${groupId} 的 ${expensesSnapshot.size} 筆支出記錄`);
          
          const deleteExpensePromises = expensesSnapshot.docs.map(doc => 
            deleteDoc(doc.ref)
          );
          
          await Promise.all(deleteExpensePromises);
        }
      } catch (expensesError) {
        console.error('刪除群組支出記錄時出錯:', expensesError);
        // 即使刪除支出記錄失敗，我們仍然繼續刪除群組本身
      }
      
      // 刪除群組文檔
      await deleteDoc(groupRef);
      
      // 更新UI
      setSuccess('分帳群組已成功刪除');
      setShowDeleteConfirm(false);
      setShowTransactionDetails(false);
      
      // 從列表中移除已刪除的群組
      setSplitTransactions(prev => prev.filter(t => t.id !== groupId));
      
      // 顯示成功提示
      toast.success('分帳群組已成功刪除！', {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      
    } catch (error: any) {
      console.error('刪除分帳群組失敗:', error);
      const errorMessage = error.message || '刪除分帳群組失敗，請稍後再試';
      setError(errorMessage);
      
      // 顯示錯誤提示
      toast.error(errorMessage, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } finally {
      setDeleting(false);
    }
  };
  
  // 渲染分帳群組
  const renderTransactions = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#A487C3]"></div>
          <span className="ml-3 text-gray-600">加載中...</span>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="bg-red-50 text-red-600 p-5 rounded-lg flex flex-col items-center justify-center">
          <div className="flex items-center mb-2">
            <i className="fas fa-exclamation-circle text-xl mr-2"></i>
            <span className="font-medium">加載失敗</span>
          </div>
          <p className="text-center">{error}</p>
          <button 
            onClick={loadSplitTransactions} 
            className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            <i className="fas fa-redo mr-2"></i>重試
          </button>
        </div>
      );
    }
    
    if (splitTransactions.length === 0) {
      return (
        <div className="bg-gray-50 p-6 rounded-xl text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
            <i className="fas fa-users text-gray-400 text-2xl"></i>
          </div>
          <h3 className="text-lg font-medium text-gray-700 mb-2">尚未創建分帳群組</h3>
          <p className="text-gray-500 mb-4">創建一個新的分帳群組，邀請好友一起記錄和分擔支出</p>
          <button
            onClick={() => setShowGroupForm(true)}
            className="text-white bg-[#A487C3] hover:bg-[#8A5DC8] px-5 py-2.5 rounded-lg font-medium shadow-sm transition-colors"
          >
            <i className="fas fa-plus-circle mr-2"></i>
            創建分帳群組
          </button>
        </div>
      );
    }
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {splitTransactions.map((transaction) => (
          <div
            key={transaction.id}
            onClick={() => handleTransactionClick(transaction)}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-md transition-all cursor-pointer animate-fadeIn hover-effect"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <h3 className="text-base font-medium text-gray-800 mb-0.5 truncate">
                  {transaction.title}
                </h3>
                <p className="text-xs text-gray-500">
                  {transaction.date.toLocaleDateString('zh-TW')}
                </p>
              </div>
              <div className="bg-[#F0EAFA] text-[#8A5DC8] text-xs font-medium px-2 py-0.5 rounded-full">
                分帳群組
              </div>
            </div>
            
            {transaction.description && (
              <p className="text-gray-600 text-xs mb-2 line-clamp-1">{transaction.description}</p>
            )}
            
            <div className="flex items-center space-x-1 mb-2 overflow-hidden">
              {transaction.participants.slice(0, 3).map((participant, index) => (
                <div 
                  key={participant.userId + index} 
                  className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border border-white -ml-1 first:ml-0"
                  title={participant.nickname}
                >
                  {participant.photoURL ? (
                    <img 
                      src={participant.photoURL} 
                      alt={participant.nickname} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-700 text-xs font-medium">
                      {participant.nickname.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              ))}
              
              {transaction.participants.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-[#F0EAFA] text-[#8A5DC8] flex items-center justify-center text-xs font-medium border border-white">
                  +{transaction.participants.length - 3}
                </div>
              )}
            </div>
            
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">
                <i className="fas fa-users mr-1"></i>
                {transaction.participants.length} 位成員
              </span>
              <span className="text-[#8A5DC8]">點擊查看 <i className="fas fa-chevron-right ml-1 text-[10px]"></i></span>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  // 新增：加載群組支出
  const loadGroupExpenses = async (groupId: string) => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      setError(''); // 清除之前的錯誤
      setGroupExpenses([]); // 清空之前的支出數據
      
      console.log('開始加載群組支出，群組ID:', groupId, '類型:', typeof groupId);
      
      // 檢查 groupId 是否有效
      if (!groupId || groupId.trim() === '') {
        console.error('無效的群組ID，無法加載支出');
        setError('無效的群組ID，無法加載支出');
        setLoading(false);
        return;
      }
      
      // 輔助函數：確保數據沒有undefined值
      const ensureNoUndefined = (data: any, defaultValues: any = {}) => {
        const result: any = {};
        
        // 合併默認值
        const merged = { ...defaultValues, ...data };
        
        // 確保每個字段有值
        for (const key in merged) {
          const value = merged[key];
          if (value === undefined) {
            result[key] = null; // 將undefined轉換為null
          } else {
            result[key] = value;
          }
        }
        
        return result;
      };
      
      // 先嘗試直接獲取文檔以確認 groupId 有效
      try {
        const groupRef = doc(db, 'expenseGroups', groupId);
        const groupDoc = await getDoc(groupRef);
        if (!groupDoc.exists()) {
          console.error('群組不存在:', groupId);
          setError('群組不存在，無法加載支出');
          setLoading(false);
          return;
        }
        console.log('檢查群組是否存在:', groupId, '群組存在');
      } catch (err) {
        console.warn('檢查群組存在性時出錯:', err);
      }

      const expensesQuery = query(
        collection(db, 'groupExpenses'),
        where('groupId', '==', groupId)
      );
      
      // 打印完整的查詢條件用於調試
      console.log('查詢條件:', JSON.stringify({
        collection: 'groupExpenses',
        where: {
          field: 'groupId',
          operator: '==',
          value: groupId
        }
      }));
      
      const expensesSnapshot = await getDocs(expensesQuery);
      console.log('查詢結果數量:', expensesSnapshot.size, 'empty:', expensesSnapshot.empty);
      
      // 檢查文檔數據
      expensesSnapshot.forEach(doc => {
        const data = doc.data();
        console.log('文檔ID:', doc.id);
        console.log('文檔數據:', JSON.stringify(data, null, 2));
        console.log('文檔中的 groupId:', data.groupId, '類型:', typeof data.groupId);
        
        // 檢查 groupId 是否匹配
        if (data.groupId !== groupId) {
          console.warn('警告: 文檔中的 groupId 與查詢條件不匹配');
          console.warn(`期望: "${groupId}", 實際: "${data.groupId}"`);
        }
      });
      
      if (expensesSnapshot.empty) {
        console.log('未找到支出記錄');
        setGroupExpenses([]);
        setLoading(false);
        return;
      }
      
      const expensesData = expensesSnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('處理支出文檔數據:', doc.id);
        
        // 使用默認值確保沒有undefined
        const defaultValues = {
          amount: 0,
          description: '',
          date: new Date(),
          createdAt: new Date(),
          createdBy: currentUser.uid,
          groupId: groupId,
          category: '其他',
          participants: [],
          status: 'active',
          confirmed: false,
          splitMethod: 'equal',
          payerId: currentUser.uid,
          payerName: currentUser.displayName || currentUser.email?.split('@')[0] || '未知用戶',
          payerPhotoURL: currentUser.photoURL || ''
        };
        
        // 處理文檔數據，確保沒有undefined值
        const processedData = ensureNoUndefined(data, defaultValues);
        
        // 確保 participants 數組格式正確
        let participants = processedData.participants || [];
        if (!Array.isArray(participants)) {
          participants = [];
        }
        
        // 處理每個參與者，確保有所有必須的字段
        participants = participants.map((p: any) => ({
          userId: p.userId || '',
          nickname: p.nickname || '未知用戶',
          photoURL: p.photoURL || '',
          amount: p.amount || 0,
          percentage: p.percentage || 0
        }));
        
        // 處理日期字段：確保正確轉換 Timestamp 為 Date 對象
        let expenseDate;
        try {
          // 嘗試通過 toDate() 方法轉換 Firestore Timestamp
          if (processedData.date && typeof processedData.date.toDate === 'function') {
            expenseDate = processedData.date.toDate();
          } 
          // 嘗試處理已經是日期對象的情況
          else if (processedData.date instanceof Date) {
            expenseDate = processedData.date;
          }
          // 處理時間戳記對象的情況（包含 seconds 和 nanoseconds）
          else if (processedData.date && processedData.date.seconds) {
            expenseDate = new Date(processedData.date.seconds * 1000);
          }
          // 如果是字符串，嘗試解析為日期
          else if (typeof processedData.date === 'string') {
            expenseDate = new Date(processedData.date);
          }
          // 失敗時使用當前日期
          else {
            console.warn('無法解析日期，使用當前日期:', processedData.date);
            expenseDate = new Date();
          }
        } catch (err) {
          console.error('處理日期出錯:', err);
          expenseDate = new Date();
        }
        
        // 處理創建時間
        let createdAtDate;
        try {
          if (processedData.createdAt && typeof processedData.createdAt.toDate === 'function') {
            createdAtDate = processedData.createdAt.toDate();
          } else if (processedData.createdAt instanceof Date) {
            createdAtDate = processedData.createdAt;
          } else if (processedData.createdAt && processedData.createdAt.seconds) {
            createdAtDate = new Date(processedData.createdAt.seconds * 1000);
          } else {
            createdAtDate = new Date();
          }
        } catch (err) {
          console.error('處理創建時間出錯:', err);
          createdAtDate = new Date();
        }
        
        return {
          id: doc.id,
          amount: processedData.amount,
          description: processedData.description,
          title: processedData.title || processedData.description,
          date: expenseDate,
          createdAt: createdAtDate,
          createdBy: processedData.createdBy,
          groupId: processedData.groupId,
          category: processedData.category,
          participants: participants,
          status: processedData.status,
          confirmed: processedData.confirmed || false,
          splitMethod: processedData.splitMethod || 'equal',
          payerId: processedData.payerId,
          payerName: processedData.payerName,
          payerPhotoURL: processedData.payerPhotoURL,
          notes: processedData.notes || '',
          currency: processedData.currency || 'NTD'
        };
      });
      
      console.log('處理後的群組支出數據:', expensesData.length, '條記錄');
      // 打印第一條記錄的完整數據用於調試
      if (expensesData.length > 0) {
        console.log('第一條記錄:', JSON.stringify(expensesData[0], null, 2));
      }
      
      setGroupExpenses(expensesData);
      
    } catch (error) {
      console.error('加載群組支出失敗:', error);
      setError('加載群組支出失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  // 新增：處理確認帳單
  const handleConfirmExpense = () => {
    if (!selectedTransaction) return;
    
    // 加載群組支出
    loadGroupExpenses(selectedTransaction.id);
    
    // 顯示確認帳單表單
    setShowTransactionDetails(false);
    setShowConfirmExpenseForm(true);
  };

  // 新增：處理確認帳單提交
  const handleConfirmExpenseSave = async (formData: any) => {
    try {
      setLoading(true);
      setError('');
      
      // 處理確認帳單邏輯
      if (formData && formData.expenseIds && formData.expenseIds.length > 0) {
        // 記錄是否為批量結算
        const isBatchSettlement = formData.isBatchSettlement || false;
        const batchCount = formData.batchCount || 1;
        
        // 更新群組支出狀態為已分帳
        for (const expenseId of formData.expenseIds) {
          // 獲取當前處理的支出
          const currentExpense = groupExpenses.find(exp => exp.id === expenseId);
          if (!currentExpense) continue;
          
          // 計算每位參與者在此支出中的應付金額
          let participants = [...formData.participants];
          
          // 如果是批量結算，需要按比例分配金額
          if (isBatchSettlement && formData.expenseIds.length > 1) {
            // 計算當前支出在總金額中的比例
            const expenseRatio = currentExpense.amount / formData.totalAmount;
            
            // 按比例分配每位成員的金額
            participants = participants.map(p => ({
              ...p,
              amount: Math.round(p.amount * expenseRatio * 100) / 100, // 四捨五入到分
              batchSettlementInfo: {
                originalAmount: p.amount, // 記錄原始分配金額
                ratio: expenseRatio, // 記錄分配比例
                batchId: Date.now().toString(), // 批次ID
                batchIndex: formData.expenseIds.indexOf(expenseId), // 批次中的索引
                batchTotal: formData.expenseIds.length // 批次總數
              }
            }));
          }
          
          // 更新支出狀態
          const expenseRef = doc(db, 'groupExpenses', expenseId);
          await updateDoc(expenseRef, {
            status: 'confirmed',
            confirmed: true,
            confirmedAt: Timestamp.now(), // 添加確認時間
            confirmedBy: currentUser?.uid || '', // 添加確認者，處理可能為 null 的情況
            splitMethod: formData.splitMethod,
            participants: participants,
            updatedAt: Timestamp.now(),
            isBatchSettlement: isBatchSettlement, // 記錄是否為批量結算
            batchCount: batchCount, // 記錄批量數量
            batchSettlementId: isBatchSettlement ? Date.now().toString() : null // 批量結算ID
          });
          
          console.log(`更新支出 ${expenseId}: ${
            isBatchSettlement 
              ? `批量結算 (${formData.expenseIds.indexOf(expenseId) + 1}/${formData.expenseIds.length})` 
              : '單筆結算'
          }`);
        }
        
        toast.success(`已成功確認 ${formData.expenseIds.length} 筆支出的分帳設置`, {
          position: "top-center",
          autoClose: 3000,
        });
        
        // 重新加載群組支出
        if (selectedTransaction) {
          loadGroupExpenses(selectedTransaction.id);
        }
      }
      
      setSuccess('帳單已分帳');
      setShowConfirmExpenseForm(false);
      setShowTransactionDetails(true); // 返回分帳詳情頁面
      
    } catch (error: any) {
      console.error('確認帳單失敗:', error);
      setError(error.message || '確認帳單失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };
  
  // 渲染分帳詳情
  const renderTransactionDetails = () => {
    if (!selectedTransaction) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl transform">
          <div className="bg-gradient-to-r from-[#7A5DC8] to-[#A487C3] px-6 py-4 rounded-t-xl flex justify-between items-center">
            <h2 className="text-base font-bold text-white flex items-center">
              <i className="fas fa-users-cog mr-3 text-lg"></i>
              <span className="tracking-wide">分帳詳情</span>
            </h2>
            <button
              onClick={() => setShowTransactionDetails(false)}
              className="text-white hover:text-white hover:bg-white/20 h-8 w-8 rounded-full flex items-center justify-center"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
          
          <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
            {/* 錯誤提示 */}
            {error && (
              <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-xl animate-[slideUpIn_0.4s_ease-out] border-l-4 border-red-500 shadow-sm">
                <div className="flex items-center">
                  <i className="fas fa-exclamation-circle mr-2 text-lg animate-pulse"></i>
                  <span>{error}</span>
                </div>
              </div>
            )}
          
            <div className="mb-5 transform transition-all duration-300 hover:translate-y-[-2px] hover:shadow-md rounded-xl p-4 border border-gray-100">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center mb-2">
                    <h3 className="text-lg font-bold text-gray-800 tracking-wide">{selectedTransaction.title}</h3>
                    <div className="bg-[#F0EAFA] text-[#8A5DC8] text-xs font-medium px-3 py-1 rounded-full ml-2 shadow-sm">
                      分帳群組
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs flex items-center">
                    <i className="far fa-calendar-alt mr-1.5 text-[#A487C3]"></i>
                    創建時間: {formatDate(selectedTransaction.created)}
                  </p>
                </div>
                
                {/* 操作按鈕 - 所有成員都可見 */}
                <div className="flex gap-2">
                  {/* 編輯按鈕 */}
                  <button
                    onClick={handleEditGroup}
                    className="text-white bg-[#A487C3] hover:bg-[#8A5DC8] px-3 py-1.5 rounded-lg flex items-center text-xs shadow-md transition-all duration-300 transform hover:translate-y-[-2px]"
                  >
                    <i className="fas fa-edit mr-1.5"></i>
                    編輯群組
                  </button>
                  
                  {/* 刪除按鈕 */}
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-white bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 px-3 py-1.5 rounded-lg flex items-center text-xs shadow-md transition-all duration-300 transform hover:translate-y-[-2px]"
                    disabled={deleting}
                  >
                    <i className="fas fa-trash-alt mr-1.5"></i>
                    刪除群組
                  </button>
                </div>
              </div>
              
              {selectedTransaction.description && (
                <div className="mt-3 p-3 bg-gray-50 rounded-xl shadow-inner">
                  <p className="text-gray-700 text-sm">{selectedTransaction.description}</p>
                </div>
              )}
            </div>
            
            <div className="mb-5 transform transition-all duration-300 animate-[fadeSlideIn_0.4s_ease-out]">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-semibold text-gray-800 flex items-center">
                  <i className="fas fa-users mr-2 text-[#A487C3]"></i>
                  <span className="tracking-wide">分帳群組成員 ({selectedTransaction.participants.length})</span>
                </h4>
                
                {/* 邀請好友按鈕 - 所有成員可見 */}
                <button 
                  onClick={() => {
                    // 保存当前群组信息用于邀请
                    setInviteTargetGroup({
                      id: selectedTransaction.id,
                      title: selectedTransaction.title
                    });
                    setShowTransactionDetails(false); // 先关闭群组详情页面
                    setShowInviteFriendsForm(true); // 再显示邀请表单
                  }}
                  className="text-white bg-[#A487C3] hover:bg-[#8A5DC8] px-3 py-1.5 rounded-lg text-xs font-medium flex items-center transition-all duration-300 shadow-md transform hover:translate-y-[-2px]"
                >
                  <i className="fas fa-user-plus mr-2"></i>
                  邀請好友
                </button>
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                {selectedTransaction.participants.map((participant, index) => (
                  <div 
                    key={participant.userId + index}
                    className="flex items-center p-3 bg-white border border-gray-200 rounded-xl hover:border-[#A487C3] hover:shadow-md transition-all duration-300 transform hover:translate-y-[-2px]"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#F0EAFA] flex items-center justify-center overflow-hidden mr-3 shadow-md border-2 border-white">
                      {participant.photoURL ? (
                        <img 
                          src={participant.photoURL} 
                          alt={participant.nickname} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[#8A5DC8] font-bold">
                          {participant.nickname.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-800">{participant.nickname}</div>
                      {participant.email && (
                        <div className="text-xs text-gray-500 flex items-center">
                          <i className="far fa-envelope mr-1 text-[#A487C3]"></i>
                          {participant.email}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* 新增：已儲存支出記錄區塊 */}
            <div className="mb-5 transform transition-all duration-300 animate-[fadeSlideIn_0.5s_ease-out]">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-semibold text-gray-800 flex items-center">
                  <i className="fas fa-receipt text-[#A487C3] mr-2"></i>
                  <span className="tracking-wide">已儲存支出 {!loading && groupExpenses && `(${groupExpenses.length})`}</span>
                </h4>
                
                <button
                  onClick={() => {
                    // 確保有選中的交易
                    if (selectedTransaction) {
                      console.log('打開添加支出表單，群組ID:', selectedTransaction.id);
                      // 先保存當前的交易信息，再顯示表單
                      const currentTransaction = {...selectedTransaction};
                      setShowTransactionDetails(false);
                      setShowGroupExpenseForm(true);
                      // 確保selectedTransaction不為空
                      if (!selectedTransaction) {
                        setSelectedTransaction(currentTransaction);
                      }
                    } else {
                      console.error('沒有選中的交易，無法添加支出');
                      toast.error('無法添加支出，請重新選擇群組', {
                        position: "top-center",
                        autoClose: 3000,
                      });
                    }
                  }}
                  className="text-white bg-[#A487C3] hover:bg-[#8A5DC8] px-3 py-1.5 rounded-lg text-xs font-medium flex items-center transition-all duration-300 shadow-md transform hover:translate-y-[-2px]"
                >
                  <i className="fas fa-plus-circle mr-2"></i>
                  添加支出
                </button>
              </div>
              
              {loading && (
                <div className="flex justify-center items-center py-10 bg-gray-50 rounded-xl">
                  <div className="animate-spin h-8 w-8 border-3 border-[#A487C3] border-t-transparent rounded-full mr-3"></div>
                  <span className="text-sm text-gray-600 animate-pulse">載入支出記錄中...</span>
                </div>
              )}
              
              {!loading && error && (
                <div className="bg-red-50 p-4 rounded-xl text-center border-l-4 border-red-500 shadow-sm">
                  <div className="text-red-500 mb-2 text-sm">
                    <i className="fas fa-exclamation-circle mr-2"></i>
                    {error}
                  </div>
                  <button 
                    onClick={() => {
                      if (selectedTransaction) {
                        loadGroupExpenses(selectedTransaction.id);
                      }
                    }}
                    className="text-xs text-[#A487C3] hover:text-[#8A5DC8] mt-1 px-3 py-1 bg-white rounded-lg shadow-sm transition-all duration-300 hover:shadow-md"
                  >
                    <i className="fas fa-redo mr-1.5"></i>
                    重新載入
                  </button>
                </div>
              )}
              
              {!loading && !error && groupExpenses && groupExpenses.length === 0 && (
                <div className="bg-gray-50 rounded-xl p-8 text-center shadow-inner">
                  <div className="text-gray-400 mb-4">
                    <i className="fas fa-file-invoice-dollar text-4xl opacity-70 animate-gentle-pulse"></i>
                  </div>
                  <p className="text-gray-600 text-sm font-medium">此群組尚無支出記錄</p>
                  <p className="text-gray-500 text-xs mt-2">
                    點擊「添加支出」按鈕記錄第一筆群組支出
                  </p>
                </div>
              )}
              
              {!loading && !error && groupExpenses && groupExpenses.length > 0 && (
                <div className="grid grid-cols-1 gap-3 mt-2">
                  {groupExpenses.map((expense) => (
                    <div 
                      key={expense.id}
                      className="p-4 bg-white border border-gray-200 rounded-xl hover:border-[#A487C3] transition-all duration-300 shadow-sm hover:shadow-md transform hover:translate-y-[-2px]"
                    >
                      <div className="flex justify-between mb-2">
                        <div className="font-medium text-sm text-gray-800">{expense.title}</div>
                        <div className="font-bold text-sm text-[#8A5DC8]">
                          NT$ {expense.amount.toLocaleString('zh-TW')}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                        <div className="flex items-center bg-[#F0EAFA] px-2 py-1 rounded-full">
                          <i className={`${getCategoryIcon(expense.category)} mr-1.5 text-[#A487C3]`}></i>
                          <span>{expense.category}</span>
                        </div>
                        <div className="flex items-center">
                          <i className="far fa-calendar-alt mr-1.5 text-[#A487C3]"></i>
                          {formatDate(expense.date)}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center">
                          <div className="w-6 h-6 rounded-full bg-[#F0EAFA] flex items-center justify-center overflow-hidden mr-1.5 border border-white shadow-sm">
                            {expense.payerPhotoURL ? (
                              <img 
                                src={expense.payerPhotoURL} 
                                alt={expense.payerName} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[#8A5DC8] font-medium text-xs">
                                {expense.payerName ? expense.payerName.charAt(0).toUpperCase() : '?'}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-600">
                            由 <span className="font-medium">{expense.payerName || '未知用戶'}</span> 支付
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <div className={`text-xs px-2 py-1 rounded-full ${
                            expense.confirmed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          } shadow-sm`}>
                            {expense.confirmed ? (
                              <span className="flex items-center">
                                <i className="fas fa-check-circle mr-1.5"></i>已分帳
                              </span>
                            ) : (
                              <span className="flex items-center">
                                <i className="fas fa-clock mr-1.5"></i>待分帳
                              </span>
                            )}
                          </div>
                          
                          {/* 編輯和刪除按鈕 - 重新設計 */}
                          <div className="flex space-x-2">
                            {/* 只有未確認分帳的支出才顯示編輯按鈕 */}
                            {!expense.confirmed && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation(); // 防止觸發卡片點擊事件
                                  editGroupExpense(expense);
                                }}
                                className="text-white bg-[#A487C3] hover:bg-[#8A5DC8] px-2.5 py-1 rounded-lg text-xs flex items-center transition-all duration-200 shadow-sm"
                                title="編輯支出"
                              >
                                <i className="fas fa-edit mr-1"></i>
                                編輯
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // 防止觸發卡片點擊事件
                                if (window.confirm(`確定要刪除支出"${expense.title}"嗎？此操作不可撤銷。`)) {
                                  deleteGroupExpense(expense.id);
                                }
                              }}
                              className="text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg text-xs flex items-center transition-all duration-200 shadow-sm"
                              title="刪除支出"
                            >
                              <i className="fas fa-trash-alt mr-1"></i>
                              刪除
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {expense.notes && (
                        <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">
                          <i className="fas fa-sticky-note mr-1.5 text-[#A487C3]"></i>
                          {expense.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* 分帳結算按鈕區塊 - 已儲存支出區塊和應收應付款項統計區塊之間 */}
            {!loading && !error && groupExpenses && groupExpenses.length > 0 && (
              <div className="mb-5 animate-[fadeSlideIn_0.6s_ease-out]">
                <button
                  onClick={handleConfirmExpense}
                  className="w-full px-4 py-3.5 text-white bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl transition-all duration-300 shadow-md text-sm font-medium flex items-center justify-center transform hover:translate-y-[-2px]"
                >
                  <i className="fas fa-check-circle mr-2.5 text-lg animate-pulse"></i>
                  分帳結算
                </button>
              </div>
            )}
            
            {/* 新增：應收應付款顯示區塊 */}
            {!loading && !error && groupExpenses && groupExpenses.length > 0 && (
              <div className="mb-5 animate-[fadeInUp_0.8s_ease-out] transform transition-all duration-500 hover:scale-[1.01]">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-semibold text-gray-800 flex items-center relative before:content-[''] before:absolute before:bottom-0 before:left-0 before:w-0 before:h-[2px] before:bg-[#A487C3] before:transition-all hover:before:w-full">
                    <div className="w-7 h-7 rounded-full bg-[#A487C3] flex items-center justify-center mr-2 shadow-md">
                      <i className="fas fa-exchange-alt text-white animate-pulse"></i>
                    </div>
                    <span className="tracking-wide">應收應付款項統計</span>
                  </h4>
                </div>
                
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-lg transform transition-all bg-gradient-to-br from-white to-[#F8F3FF]">
                  {renderBalanceSummary()}
                </div>
              </div>
            )}
            
            <div className="flex justify-between items-center animate-[fadeSlideIn_0.8s_ease-out]">
              <button
                onClick={() => setShowTransactionDetails(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all duration-300 text-sm font-medium flex items-center shadow-sm hover:shadow transform hover:translate-y-[-2px]"
              >
                <i className="fas fa-arrow-left mr-2"></i>
                返回列表
              </button>
            </div>
          </div>
        </div>
        
        {/* 確認刪除對話框 */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 animate-[scaleIn_0.3s_ease-out]">
              <div className="text-center mb-4">
                <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-red-100 text-red-500 animate-pulse">
                  <i className="fas fa-exclamation-triangle text-2xl"></i>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">確認刪除</h3>
                <p className="text-gray-600 text-sm">
                  你確定要刪除分帳群組「{selectedTransaction.title}」嗎？此操作將同時刪除群組內所有支出記錄，且不可撤銷。
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 px-4 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-all duration-300 font-medium text-sm shadow-sm transform hover:translate-y-[-2px]"
                  disabled={deleting}
                >
                  取消
                </button>
                <button
                  onClick={() => deleteExpenseGroup(selectedTransaction.id)}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-300 font-medium text-sm shadow-md transform hover:translate-y-[-2px]"
                  disabled={deleting}
                >
                  {deleting ? (
                    <div className="flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-t-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      刪除中...
                    </div>
                  ) : (
                    <>
                      <i className="fas fa-trash-alt mr-2"></i>
                      確認刪除
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // 處理群組支出保存
  const handleGroupExpenseSave = () => {
    // 保存當前選中的交易，因為我們會關閉表單
    const currentTransaction = selectedTransaction;
    
    console.log('處理群組支出保存，當前選中的交易:', currentTransaction?.id);
    
    // 關閉表單
    setShowGroupExpenseForm(false);
    
    // 立即顯示交易詳情，不等待延遲
    if (currentTransaction) {
      setShowTransactionDetails(true);
      
      // 顯示成功訊息
      toast.success('分帳群組支出已成功添加！', {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      
      // 短暫延遲以確保數據已經保存到資料庫後再重新加載數據
      setTimeout(() => {
        try {
          console.log('延遲結束，開始重新加載群組支出，群組ID:', currentTransaction.id);
          
          // 確保我們仍然選中相同的交易
          if (selectedTransaction?.id !== currentTransaction.id) {
            console.log('更新選中的交易，從:', selectedTransaction?.id, '到:', currentTransaction.id);
            setSelectedTransaction(currentTransaction);
          } else {
            console.log('選中的交易未變化，仍為:', selectedTransaction?.id);
          }
          
          // 重新加載支出數據
          console.log('調用 loadGroupExpenses 加載群組支出');
          loadGroupExpenses(currentTransaction.id);
        } catch (error) {
          console.error('重新加載群組支出失敗:', error);
          toast.error('加載支出記錄失敗，請手動刷新頁面', {
            position: "top-center",
            autoClose: 5000,
          });
        }
      }, 1000); // 减少到1秒以提高响应速度
    } else {
      console.warn('沒有選中的交易，無法重新加載群組支出');
      
      // 如果沒有選中的交易，僅顯示成功訊息
      toast.success('分帳群組支出已成功添加！', {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }
  };
  
  // 格式化日期顯示的輔助函數
  const formatDate = (date: any): string => {
    try {
      if (!date) return '日期未知';
      
      // 使用輔助函數解析日期
      const parsedDate = parseFirestoreTimestamp(date);
      
      // 使用 toLocaleDateString 格式化日期
      return parsedDate.toLocaleDateString('zh-TW');
    } catch (err) {
      console.error('格式化日期時出錯:', err, 'Date:', date);
      return '日期處理錯誤';
    }
  };
  
  // 根據類別返回圖標
  const getCategoryIcon = (category: string): string => {
    switch (category) {
      case '餐飲':
        return 'fas fa-utensils';
      case '交通':
        return 'fas fa-taxi';
      case '住宿':
        return 'fas fa-hotel';
      case '購物':
        return 'fas fa-shopping-bag';
      case '娛樂':
        return 'fas fa-gamepad';
      case '醫療':
        return 'fas fa-hospital';
      case '教育':
        return 'fas fa-graduation-cap';
      case '其他':
      default:
        return 'fas fa-receipt';
    }
  };
  
  // 邀請好友加入群組
  const inviteFriendsToGroup = async (selectedFriends: Friend[]) => {
    if (!currentUser) return;
    
    // 使用保存的群组信息或当前选中的群组
    const targetGroup = inviteTargetGroup || selectedTransaction;
    if (!targetGroup) return;
    
    try {
      setLoading(true);
      setError('');
      
      console.log('開始邀請好友:', {
        targetGroup,
        selectedFriends,
        currentUser: {
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          email: currentUser.email
        }
      });
      
      // 檢查群組是否存在
      const groupRef = doc(db, 'expenseGroups', targetGroup.id);
      const groupDoc = await getDoc(groupRef);
      
      if (!groupDoc.exists()) {
        throw new Error('分帳群組不存在');
      }
      
      const groupData = groupDoc.data();
      console.log('群組數據:', groupData);
      
      // 檢查用戶是否已經是群組成員
      const existingMembers = groupData.memberIds || [];
      const alreadyMembers = selectedFriends.filter(friend => 
        existingMembers.includes(friend.id)
      );
      
      if (alreadyMembers.length > 0) {
        throw new Error(`以下好友已經是群組成員：${alreadyMembers.map(f => f.nickname).join('、')}`);
      }
      
      // 為每個選擇的好友創建邀請
      await Promise.all(
        selectedFriends.map(async (friend) => {
          // 檢查是否已經有待處理的邀請
          const existingInvitesRef = collection(db, 'groupInvites');
          const existingInvitesQuery = query(
            existingInvitesRef,
            where('groupId', '==', targetGroup.id),
            where('inviteeId', '==', friend.id),
            where('status', '==', 'pending')
          );
          
          const existingInvitesSnapshot = await getDocs(existingInvitesQuery);
          
          if (!existingInvitesSnapshot.empty) {
            console.log(`用戶 ${friend.nickname} 已有待處理的邀請`);
            return;
          }
          
          // 創建新邀請
          const inviteData = {
            groupId: targetGroup.id,
            groupName: targetGroup.title,
            inviterId: currentUser.uid,
            inviterName: currentUser.displayName || currentUser.email?.split('@')[0] || '未知用戶',
            inviteeId: friend.id,
            inviteeName: friend.nickname,
            status: 'pending',
            createdAt: serverTimestamp()
          };
          
          console.log('創建邀請:', inviteData);
          await addDoc(collection(db, 'groupInvites'), inviteData);
        })
      );
      
      setSuccess('已成功邀請好友加入分帳群組');
      setShowInviteFriendsForm(false);
      setInviteTargetGroup(null);
      
      // 顯示成功提示
      toast.success('已成功發送邀請！', {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      
    } catch (error: any) {
      console.error('邀請好友失敗:', error);
      setError(error.message || '邀請好友失敗，請稍後再試');
      
      // 顯示錯誤提示
      toast.error(error.message || '邀請好友失敗，請稍後再試', {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } finally {
      setLoading(false);
    }
  };
  
  // 添加刪除群組支出的函數
  const deleteGroupExpense = async (expenseId: string) => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      
      // 保存當前選中的交易ID，用於後續操作
      const currentTransactionId = selectedTransaction?.id;
      
      // 從 Firestore 中刪除支出記錄
      const expenseRef = doc(db, 'groupExpenses', expenseId);
      await deleteDoc(expenseRef);
      
      // 顯示成功訊息
      toast.success('支出記錄已成功刪除', {
        position: "top-center",
        autoClose: 3000,
      });
      
      // 重新加載群組支出
      if (currentTransactionId) {
        loadGroupExpenses(currentTransactionId);
      }
      
      // 確保用戶仍在群組詳情頁面
      if (!showTransactionDetails && currentTransactionId) {
        setShowTransactionDetails(true);
      }
      
    } catch (error) {
      console.error('刪除支出記錄失敗:', error);
      toast.error('刪除支出記錄失敗，請稍後再試', {
        position: "top-center",
        autoClose: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  // 添加編輯群組支出的函數
  const editGroupExpense = (expense: any) => {
    // 保存當前選中的交易，以便後續使用
    const currentTransaction = selectedTransaction;
    
    // 確保用戶仍在分帳詳情頁面
    setEditingExpense(expense);
    setShowTransactionDetails(false);
    setShowGroupExpenseForm(true);
    
    // 確保返回時能夠找到正確的群組
    if (!selectedTransaction && currentTransaction) {
      setSelectedTransaction(currentTransaction);
    }
  };
  
  // 計算並顯示應收應付款信息
  const renderBalanceSummary = () => {
    // 如果沒有已分帳的支出，則不顯示結算信息
    const confirmedExpenses = groupExpenses.filter(exp => exp.confirmed === true);
    if (confirmedExpenses.length === 0) {
      return (
        <div className="p-4 bg-gray-50 text-center">
          <p className="text-sm text-gray-600">尚無已分帳的分帳支出</p>
          <p className="text-xs text-gray-500 mt-1">
            請點擊「分帳結算」按鈕確認支出的分帳方式
          </p>
        </div>
      );
    }

    // 增加詳細日誌輸出，列出所有已分帳的支出
    console.log('所有已分帳的支出:', confirmedExpenses.map(exp => ({
      id: exp.id,
      title: exp.title,
      amount: exp.amount,
      splitMethod: exp.splitMethod || 'equal',
      payerId: exp.payerId,
      participants: exp.participants?.length
    })));

    // 重置整個計算邏輯 - 為每個成員建立一個乾淨的記錄
    const balances: Record<string, { 
      userId: string,
      nickname: string,
      photoURL?: string,
      paid: number,  // 已支付的金額
      owed: number,  // 個人應付的金額
      balance: number, // 淨收支 (正數表示應收，負數表示應付)
      // 詳細的應收應付對象與金額
      transactions: Record<string, number> // userId -> amount (正數表示應付，負數表示應收)
    }> = {};

    // 初始化每位成員的資料
    selectedTransaction?.participants.forEach(participant => {
      balances[participant.userId] = {
        userId: participant.userId,
        nickname: participant.nickname,
        photoURL: participant.photoURL,
        paid: 0,
        owed: 0,
        balance: 0,
        transactions: {}
      };
      
      // 初始化與其他成員之間的交易記錄為0
      selectedTransaction.participants.forEach(otherParticipant => {
        if (participant.userId !== otherParticipant.userId) {
          balances[participant.userId].transactions[otherParticipant.userId] = 0;
        }
      });
    });

    // 第一步：計算每個成員的實際付款總額和個人應付總額
    // 使用Map跟踪已計算過的支出ID，避免重複計算
    const processedExpenseIds = new Map<string, boolean>();
    
    confirmedExpenses.forEach(expense => {
      // 如果此支出已被處理過，則跳過
      if (processedExpenseIds.has(expense.id)) {
        console.log(`跳過重複支出: ${expense.id} - ${expense.title}`);
        return;
      }
      
      // 標記此支出已被處理
      processedExpenseIds.set(expense.id, true);
      
      const payerId = expense.payerId;
      const payerAmount = expense.amount;
      
      // 增加付款人的已付款金額
      if (balances[payerId]) {
        balances[payerId].paid += payerAmount;
        console.log(`付款人 ${balances[payerId].nickname} 支付金額: ${payerAmount}`);
      }

      // 計算每位成員的個人應付金額
      if (expense.participants && expense.participants.length > 0) {
        expense.participants.forEach((participant: any) => {
          const userId = participant.userId;
          // 確保每位成員都只負責自己的那部分金額
          const participantAmount = participant.amount || 0;
          
          // 更新成員的個人應付金額
          if (balances[userId]) {
            balances[userId].owed += participantAmount;
            console.log(`成員 ${balances[userId].nickname} 個人應付金額: ${participantAmount} (支出ID: ${expense.id})`);
          }
        });
      }
    });
    
    // 第二步：計算每位成員的淨餘額 (已付 - 應付)
    Object.values(balances).forEach(member => {
      member.balance = member.paid - member.owed;
      console.log(`成員 ${member.nickname} 餘額計算: 已付=${member.paid.toFixed(0)}, 應付=${member.owed.toFixed(0)}, 淨餘額=${member.balance.toFixed(0)}`);
      // 淨餘額 > 0 表示應收(已付超過應付)
      // 淨餘額 < 0 表示應付(已付少於應付)
      // 淨餘額 = 0 表示已平衡(已付等於應付)
      
      // 額外檢查浮點數誤差
      if (Math.abs(member.balance) < 0.001) {
        member.balance = 0;
        console.log(`成員 ${member.nickname} 餘額接近零，設為0（已平衡）`);
      }
    });
    
    // 第三步：生成交易記錄 - 處理應收應付關係
    // 建立清晰的債務關係 - 不再從每個支出累加交易記錄，而是基於最終餘額計算
    const members = Object.values(balances);
    
    // 清空所有人的交易記錄，以便重新生成
    members.forEach(member => {
      member.transactions = {};
      members.forEach(other => {
        if (member.userId !== other.userId) {
          member.transactions[other.userId] = 0;
        }
      });
    });
    
    // 債權人是那些已付金額 > 應付金額的人
    const creditors = members.filter(m => m.balance > 0).sort((a, b) => b.balance - a.balance);
    // 債務人是那些已付金額 < 應付金額的人
    const debtors = members.filter(m => m.balance < 0).sort((a, b) => a.balance - b.balance);
    
    console.log('債權人:', creditors.map(c => `${c.nickname} (${c.balance.toFixed(0)})`));
    console.log('債務人:', debtors.map(d => `${d.nickname} (${d.balance.toFixed(0)})`));
    
    // 分配債務 - 債務人向債權人支付
    // 採用優先還款策略：債務最多的人優先還給債權最多的人
    for (const debtor of debtors) {
      let remainingDebt = Math.abs(debtor.balance);
      console.log(`處理債務人 ${debtor.nickname}，總債務: ${remainingDebt.toFixed(0)}`);
      
      for (const creditor of creditors) {
        if (remainingDebt <= 0) break; // 已還清債務，退出循環
        
        const remainingCredit = creditor.balance;
        if (remainingCredit <= 0) continue; // 債權人已無債權，跳過
        
        // 計算本次交易金額：債務與債權取較小值
        const transactionAmount = Math.min(remainingDebt, remainingCredit);
        
        // 更新債務人的交易記錄：正數表示應付
        debtor.transactions[creditor.userId] = transactionAmount;
        
        // 更新債權人的交易記錄：負數表示應收
        creditor.transactions[debtor.userId] = -transactionAmount;
        
        // 更新剩餘債務和債權
        remainingDebt -= transactionAmount;
        creditor.balance -= transactionAmount;
        
        console.log(`分配債務: ${debtor.nickname} 支付 ${transactionAmount.toFixed(0)} 給 ${creditor.nickname}`);
        console.log(`債務人 ${debtor.nickname} 剩餘債務: ${remainingDebt.toFixed(0)}`);
        console.log(`債權人 ${creditor.nickname} 剩餘債權: ${creditor.balance.toFixed(0)}`);
      }
    }
    
    // 記錄最終交易明細
    members.forEach(member => {
      console.log(`成員 ${member.nickname} 的交易記錄 (最終):`);
      Object.entries(member.transactions).forEach(([targetId, amount]) => {
        if (Math.abs(amount) > 0) {
          const targetName = balances[targetId]?.nickname || '未知用戶';
          if (amount > 0) {
            console.log(`- 應付給 ${targetName}: ${amount.toFixed(0)} 元`);
          } else {
            console.log(`- 應收自 ${targetName}: ${Math.abs(amount).toFixed(0)} 元`);
          }
        }
      });
    });

    // 獲取當前用戶ID
    const currentUserId = currentUser?.uid || '';
    
    return (
      <div>
        {/* 總結算摘要 */}
        <div className="bg-[#F0EAFA] p-3 relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent before:animate-[shimmer_2s_infinite] before:bg-[length:200%_100%]">
          <h5 className="text-sm font-medium text-gray-800 mb-2 flex items-center relative z-10">
            <i className="fas fa-calculator mr-1.5 text-[#A487C3]"></i>
            總結算摘要
          </h5>
          <div className="grid grid-cols-1 gap-2 relative z-10">
            {Object.values(balances).map((member, index) => (
              <div 
                key={member.userId}
                className={`flex items-center justify-between bg-white p-2 rounded-lg shadow-sm transform transition-all duration-300 hover:shadow-md ${
                  member.userId === currentUserId ? 'border-2 border-[#A487C3]' : ''
                } animate-[fadeInRight_${0.3 + index * 0.1}s_ease-out]`}
              >
                <div className="flex items-center">
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden mr-2">
                    {member.photoURL ? (
                      <img 
                        src={member.photoURL} 
                        alt={member.nickname} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-700 font-medium text-xs">
                        {member.nickname.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-sm flex items-center">
                      {member.nickname}
                      {member.userId === currentUserId && (
                        <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">我</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      付款總額: {member.paid.toFixed(0)} 元
                    </div>
                  </div>
                </div>
                <div>
                  <div className={`text-sm font-bold ${
                    member.paid > member.owed
                      ? 'text-green-600' 
                      : member.paid < member.owed 
                        ? 'text-red-600' 
                        : 'text-gray-600'
                  }`}>
                    {member.paid > member.owed
                      ? `應收 +${(member.paid - member.owed).toFixed(0)}元` 
                      : member.paid < member.owed
                        ? `應付 -${(member.owed - member.paid).toFixed(0)}元` 
                        : '已平衡'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 text-right">
                    個人應付: {member.owed.toFixed(0)} 元
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* 當前用戶的詳細應收應付 */}
        {currentUserId && balances[currentUserId] && (
          <div className="mt-6 bg-[#F8F3FF] p-4 rounded-lg border border-[#E5D9F2] relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-20 h-20 -mt-6 -mr-6 bg-[#A487C3] rounded-full opacity-10"></div>
            <div className="absolute bottom-0 left-0 w-12 h-12 -ml-4 -mb-4 bg-white rounded-full opacity-30"></div>
            
            <h5 className="text-sm font-medium text-gray-800 mb-2 flex items-center relative z-10">
              <i className="fas fa-exchange-alt mr-2 text-[#A487C3]"></i>
              我的應收應付明細
            </h5>
            
            {Object.entries(balances[currentUserId].transactions)
              .filter(([targetId, amount]) => Math.abs(amount) > 0)
              .length === 0 ? (
              <div className="bg-white p-4 rounded-lg text-center">
                <div className="w-12 h-12 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
                  <i className="fas fa-check-circle text-gray-400 text-lg"></i>
                </div>
                <p className="text-sm font-medium text-gray-600">沒有應收應付交易</p>
                <p className="text-xs text-gray-500 mt-1">您與其他成員之間沒有待結算的交易</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 relative z-10">
                {Object.entries(balances[currentUserId].transactions)
                  .filter(([targetId, amount]) => Math.abs(amount) > 0)
                  .map(([targetId, amount], index) => {
                    const targetUser = balances[targetId];
                    if (!targetUser) return null;
                    
                    // 負數表示應收，正數表示應付
                    const isReceivable = amount < 0;
                    const displayAmount = Math.abs(amount).toFixed(0);
                    
                    return (
                      <div 
                        key={targetId}
                        className={`flex items-center justify-between bg-white p-3 rounded-lg shadow-sm ${
                          isReceivable ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'
                        } transform transition-all duration-300 hover:shadow-md animate-[fadeInUp_${0.3 + index * 0.1}s_ease-out]`}
                      >
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden mr-3 shadow-sm">
                            {targetUser.photoURL ? (
                              <img 
                                src={targetUser.photoURL} 
                                alt={targetUser.nickname} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-gray-700 font-medium">
                                {targetUser.nickname.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-gray-800">{targetUser.nickname}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              已支付總額: {targetUser.paid.toFixed(0)} 元
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {isReceivable ? (
                            <>
                              <div className="text-green-600 font-bold text-base">
                                應收 {displayAmount} 元
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {targetUser.nickname} 欠您 {displayAmount} 元
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-red-600 font-bold text-base">
                                應付 {displayAmount} 元
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                您欠 {targetUser.nickname} {displayAmount} 元
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
        
        {/* 過賬到借貸管理入口 */}
        {Object.entries(balances[currentUserId].transactions).filter(([_, amount]) => Math.abs(amount) > 0).length > 0 && (
          <div className="mt-5 p-4 bg-gradient-to-br from-blue-50 to-[#F0EAFA] rounded-xl border border-blue-100 animate-[fadeInUp_0.5s_ease-out] transform transition-all duration-300 hover:shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 -mt-8 -mr-8 bg-blue-100 rounded-full opacity-20"></div>
            <div className="absolute bottom-0 left-0 w-16 h-16 -ml-5 -mb-5 bg-[#A487C3] rounded-full opacity-10"></div>
            
            <h6 className="text-sm font-semibold text-blue-700 mb-3 flex items-center relative z-10">
              <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center mr-2 shadow-sm text-white">
                <i className="fas fa-exchange-alt text-xs"></i>
              </div>
              過帳到借貸管理
            </h6>
            <p className="text-xs text-blue-600 mb-4 ml-9">
              您可以將上方的應收應付記錄過帳至借貸管理，以便追蹤還款進度。
            </p>
            
            <div className="grid grid-cols-1 gap-3 relative z-10">
              {Object.entries(balances[currentUserId].transactions)
                .filter(([userId, amount]) => Math.abs(amount) > 0)
                .map(([userId, amount], index) => {
                  const targetMember = balances[userId];
                  if (!targetMember) return null;
                  
                  return (
                    <div 
                      key={`transfer-${userId}`}
                      className={`flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border ${amount < 0 ? 'border-green-100' : 'border-red-100'} 
                      animate-[fadeInRight_${0.3 + index * 0.15}s_ease-out] transform transition-all duration-300 hover:shadow-md hover:translate-x-1`}
                    >
                      <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden mr-2 border ${amount < 0 ? 'border-green-200' : 'border-red-200'}`}>
                          {targetMember.photoURL ? (
                            <img 
                              src={targetMember.photoURL} 
                              alt={targetMember.nickname} 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className={`text-sm font-medium ${amount < 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {targetMember.nickname.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-sm flex items-center">
                            {targetMember.nickname}
                            {amount < 0 ? (
                              <span className="ml-2 text-xs text-green-600 px-1.5 py-0.5 bg-green-50 rounded-full border border-green-100">應收 {Math.abs(amount).toFixed(0)}元</span>
                            ) : (
                              <span className="ml-2 text-xs text-red-600 px-1.5 py-0.5 bg-red-50 rounded-full border border-red-100">應付 {Math.abs(amount).toFixed(0)}元</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        {amount < 0 ? (
                          <button
                            onClick={() => {
                              // 导航到借贷管理并设置借出记录
                              let dateParam = '';
                              if (selectedTransaction?.date) {
                                try {
                                  // 使用更安全的檢查
                                  const date = selectedTransaction.date;
                                  if (date instanceof Date) {
                                    dateParam = `&date=${format(date, 'yyyy-MM-dd')}`;
                                  } else {
                                    // 對於Firestore Timestamp對象，嘗試安全轉換
                                    const timestamp = date as any;
                                    if (timestamp && typeof timestamp.toDate === 'function') {
                                      try {
                                        const dateObj = timestamp.toDate();
                                        if (dateObj instanceof Date) {
                                          dateParam = `&date=${format(dateObj, 'yyyy-MM-dd')}`;
                                        }
                                      } catch (err) {
                                        console.error('轉換Timestamp失敗:', err);
                                      }
                                    }
                                  }
                                } catch (error) {
                                  console.error('處理日期時出錯:', error);
                                }
                              }
                              window.location.href = `/?action=add-lend&amount=${Math.abs(amount).toFixed(0)}&person=${encodeURIComponent(targetMember.nickname)}&description=${encodeURIComponent(`分帳：${selectedTransaction?.title || '群組支出'}`)}${dateParam}`;
                            }}
                            className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-green-600 text-white text-xs rounded-lg hover:from-green-600 hover:to-green-700 transition-colors flex items-center font-medium shadow-sm hover:shadow"
                          >
                            <i className="fas fa-file-invoice-dollar mr-1.5"></i>
                            新增借出記錄
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              // 导航到借贷管理并设置借入记录
                              let dateParam = '';
                              if (selectedTransaction?.date) {
                                try {
                                  // 使用更安全的檢查
                                  const date = selectedTransaction.date;
                                  if (date instanceof Date) {
                                    dateParam = `&date=${format(date, 'yyyy-MM-dd')}`;
                                  } else {
                                    // 對於Firestore Timestamp對象，嘗試安全轉換
                                    const timestamp = date as any;
                                    if (timestamp && typeof timestamp.toDate === 'function') {
                                      try {
                                        const dateObj = timestamp.toDate();
                                        if (dateObj instanceof Date) {
                                          dateParam = `&date=${format(dateObj, 'yyyy-MM-dd')}`;
                                        }
                                      } catch (err) {
                                        console.error('轉換Timestamp失敗:', err);
                                      }
                                    }
                                  }
                                } catch (error) {
                                  console.error('處理日期時出錯:', error);
                                }
                              }
                              window.location.href = `/?action=add-borrow&amount=${Math.abs(amount).toFixed(0)}&person=${encodeURIComponent(targetMember.nickname)}&description=${encodeURIComponent(`分帳：${selectedTransaction?.title || '群組支出'}`)}${dateParam}`;
                            }}
                            className="px-3 py-1.5 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs rounded-lg hover:from-red-600 hover:to-red-700 transition-colors flex items-center font-medium shadow-sm hover:shadow"
                          >
                            <i className="fas fa-file-invoice-dollar mr-1.5"></i>
                            新增借入記錄
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
        
        {/* 過賬到消費明細入口 */}
        {Object.entries(balances[currentUserId].transactions).filter(([_, amount]) => Math.abs(amount) > 0).length > 0 && (
          <div className="mt-5 p-4 bg-gradient-to-br from-green-50 to-[#F0EAFA] rounded-xl border border-green-100 animate-[fadeInUp_0.6s_ease-out] transform transition-all duration-300 hover:shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 -mt-8 -mr-8 bg-green-100 rounded-full opacity-20"></div>
            <div className="absolute bottom-0 left-0 w-16 h-16 -ml-5 -mb-5 bg-[#A487C3] rounded-full opacity-10"></div>
            
            <h6 className="text-sm font-semibold text-green-700 mb-3 flex items-center relative z-10">
              <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center mr-2 shadow-sm text-white">
                <i className="fas fa-receipt text-xs"></i>
              </div>
              過帳到消費明細
            </h6>
            <p className="text-xs text-green-600 mb-4 ml-9">
              您可以將實付款記錄過帳到消費明細中，方便記錄個人實際支出。
            </p>
            
            <div className="grid grid-cols-1 gap-3 relative z-10">
              {(() => {
                // 計算用戶的應付金額(分帳後要付的錢)
                const totalOwed = balances[currentUserId].owed;
                
                if (totalOwed <= 0) {
                  return (
                    <div className="text-center p-4 bg-white rounded-xl border border-gray-100 shadow-inner">
                      <div className="w-12 h-12 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
                        <i className="fas fa-check-circle text-gray-400 text-lg"></i>
                      </div>
                      <p className="text-sm font-medium text-gray-600">沒有應付金額可過帳</p>
                      <p className="text-xs text-gray-500 mt-1">您沒有需要支付的款項</p>
                    </div>
                  );
                }
                
                return (
                  <div 
                    key="transfer-expense"
                    className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border border-green-100 animate-[fadeInRight_0.4s_ease-out] transform transition-all duration-300 hover:shadow-md hover:translate-x-1"
                  >
                    <div className="flex items-center">
                      <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center overflow-hidden mr-3 border border-green-200 shadow-inner">
                        <i className="fas fa-wallet text-green-600 text-sm"></i>
                      </div>
                      <div>
                        <div className="font-medium text-gray-800">
                          我的應付款
                        </div>
                        <div className="text-xs text-gray-500 flex items-center">
                          <i className="fas fa-coins text-green-500 mr-1.5"></i>
                          總額 {totalOwed.toFixed(0)}元
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          // 導航到消費明細並設置新增支出
                          let dateParam = '';
                          if (selectedTransaction?.date) {
                            try {
                              // 使用更安全的檢查
                              const date = selectedTransaction.date;
                              if (date instanceof Date) {
                                dateParam = `&date=${format(date, 'yyyy-MM-dd')}`;
                              } else {
                                // 對於Firestore Timestamp對象，嘗試安全轉換
                                const timestamp = date as any;
                                if (timestamp && typeof timestamp.toDate === 'function') {
                                  try {
                                    const dateObj = timestamp.toDate();
                                    if (dateObj instanceof Date) {
                                      dateParam = `&date=${format(dateObj, 'yyyy-MM-dd')}`;
                                    }
                                  } catch (err) {
                                    console.error('轉換Timestamp失敗:', err);
                                  }
                                }
                              }
                            } catch (error) {
                              console.error('處理日期時出錯:', error);
                            }
                          }
                          window.location.href = `/?action=add-expense&amount=${totalOwed.toFixed(0)}&category=其他&notes=${encodeURIComponent(`分帳應付款：${selectedTransaction?.title || '群組支出'}`)}${dateParam}`;
                        }}
                        className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-green-600 text-white text-xs rounded-lg hover:from-green-600 hover:to-green-700 transition-colors flex items-center font-medium shadow-sm hover:shadow"
                      >
                        <i className="fas fa-file-invoice-dollar mr-1.5"></i>
                        新增支出紀錄
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl h-[75vh] flex flex-col">
        {/* 頭部 */}
        <div className="px-4 py-3 rounded-t-xl flex justify-between items-center border-b border-gray-200">
          <h2 className="text-2xl font-bold text-[#A487C3] flex items-center">
            <i className="fas fa-users mr-2"></i>
            好友分帳
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGroupInvites(true)}
              className="text-white bg-[#A487C3] hover:bg-[#8A5DC8] px-3 py-1.5 rounded-lg flex items-center text-sm shadow-sm hover:shadow-md transition-all duration-300 relative"
            >
              <i className="fas fa-envelope mr-1.5"></i>
              查看群組邀請
              {groupInviteCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shadow-sm border border-white">
                  {groupInviteCount}
                </span>
              )}
            </button>
            <button
              onClick={onClose}
              className="text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
        
        {/* 正文內容 */}
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          {/* 狀態提示區域 */}
          {success && (
            <div className="mb-3 bg-green-50 text-green-600 p-2 rounded-lg animate-fadeIn text-sm">
              <div className="flex items-center">
                <i className="fas fa-check-circle mr-2"></i>
                <span>{success}</span>
              </div>
            </div>
          )}
          
          {/* 表單顯示 */}
          {showCreateForm && (
            <SplitExpenseForm 
              onSave={createSplitExpense} 
              onCancel={() => setShowCreateForm(false)}
            />
          )}
          
          {showGroupForm && renderGroupForm()}
          
          {/* 群組支出表單 */}
          {showGroupExpenseForm && selectedTransaction && (
            <GroupExpenseForm 
              groupId={selectedTransaction.id}
              onSave={handleGroupExpenseSave}
              onCancel={() => {
                setShowGroupExpenseForm(false);
                setEditingExpense(null); // 關閉表單時清除編輯中的支出
                setShowTransactionDetails(true); // 立即顯示分帳詳情頁面
              }}
              initialValues={editingExpense}
            />
          )}
          
          {/* 群組邀請列表 */}
          {showGroupInvites && (
            <GroupInviteList 
              onClose={() => setShowGroupInvites(false)}
            />
          )}
          
          {/* 邀請好友表單 */}
          {showInviteFriendsForm && (
            <InviteFriendsForm 
              groupId={inviteTargetGroup?.id || selectedTransaction?.id || ''}
              groupName={inviteTargetGroup?.title || selectedTransaction?.title || ''}
              onSave={inviteFriendsToGroup} 
              onCancel={() => {
                setShowInviteFriendsForm(false);
                setInviteTargetGroup(null);
              }}
              navigateToGroupDetail={() => {
                setShowInviteFriendsForm(false);
                // 如果有目标群組，顯示其詳情
                if (inviteTargetGroup) {
                  // 找到該群組並設置為當前選中的群組
                  const group = splitTransactions.find(t => t.id === inviteTargetGroup.id);
                  if (group) {
                    setSelectedTransaction(group);
                    setShowTransactionDetails(true);
                  }
                  setInviteTargetGroup(null);
                } else if (selectedTransaction) {
                  // 如果沒有目標群組但有選中的交易，顯示其詳情
                  setShowTransactionDetails(true);
                }
              }}
            />
          )}
          
          {/* 添加編輯群組表單邏輯 */}
          {showEditGroupForm && selectedTransaction && (
            <ExpenseGroupForm 
              onSave={(updatedData) => {
                saveEditedGroup(selectedTransaction.id, {
                  name: updatedData.name,
                  description: updatedData.description
                });
                // 保存后显示分账详情
                setShowTransactionDetails(true);
              }}
              onCancel={() => {
                setShowEditGroupForm(false);
                // 取消后也要显示分账详情
                setShowTransactionDetails(true);
              }}
              initialValues={{
                name: selectedTransaction.title,
                description: selectedTransaction.description
              }}
              isEditing={true}
            />
          )}
          
          {/* 顯示分帳詳情 */}
          {showTransactionDetails && renderTransactionDetails()}
          
          {/* 新增：確認帳單表單 */}
          {showConfirmExpenseForm && selectedTransaction && (
            <ConfirmExpenseForm
              groupId={selectedTransaction.id}
              expenses={groupExpenses}
              onSave={handleConfirmExpenseSave}
              onCancel={() => {
                setShowConfirmExpenseForm(false);
                setShowTransactionDetails(true); // 返回分帳詳情頁面
              }}
            />
          )}
          
          {/* 分帳列表 */}
          {!showCreateForm && !showGroupForm && !showInviteFriendsForm && !showEditGroupForm && !showTransactionDetails && !showGroupInvites && !showGroupExpenseForm && !showConfirmExpenseForm && (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold text-gray-800">我的分帳群組</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadSplitTransactions()}
                    className="text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium shadow-sm transition-colors flex items-center text-sm"
                    title="刷新列表"
                  >
                    <i className="fas fa-sync-alt mr-1.5"></i>
                    刷新
                  </button>
                  <button
                    onClick={() => setShowGroupForm(true)}
                    className="text-white bg-[#A487C3] hover:bg-[#8A5DC8] px-3 py-1.5 rounded-lg font-medium shadow-sm transition-colors flex items-center text-sm"
                  >
                    <i className="fas fa-plus-circle mr-1.5"></i>
                    創建分帳群組
                  </button>
                </div>
              </div>
              {renderTransactions()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SplitExpenseManagement; 