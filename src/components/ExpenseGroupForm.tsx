import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Friend } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import './ExpenseGroupForm.css'; // 引入樣式文件

// 分帳群組表單屬性
interface ExpenseGroupFormProps {
  onSave: (data: { name: string; description: string }) => void;
  onCancel: () => void;
  initialValues?: {
    name: string;
    description: string;
  };
  isEditing?: boolean;
}

// 分帳群組成員類型
interface GroupMember {
  userId: string;
  nickname: string;
  email?: string;
  photoURL?: string;
}

// 幣種類型
type CurrencyType = 'TWD' | 'USD' | 'EUR' | 'JPY' | 'CNY' | 'HKD' | 'GBP';

// 分帳群組表單組件
const ExpenseGroupForm: React.FC<ExpenseGroupFormProps> = ({ 
  onSave, 
  onCancel, 
  initialValues, 
  isEditing = false 
}) => {
  const { currentUser, getFriends } = useAuth();
  
  // 表單狀態
  const [groupName, setGroupName] = useState(initialValues?.name || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [splitMethod, setSplitMethod] = useState<'equal' | 'percentage' | 'custom'>('equal');
  const [currency, setCurrency] = useState<CurrencyType>('TWD');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 數據加載狀態
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // 加載數據
  useEffect(() => {
    if (currentUser) {
      loadFriends();
      // 添加當前用戶作為第一個成員
      const currentUserMember: GroupMember = {
        userId: currentUser.uid,
        nickname: currentUser.displayName || currentUser.email?.split('@')[0] || '我',
        email: currentUser.email || undefined,
        photoURL: currentUser.photoURL || undefined
      };
      setMembers([currentUserMember]);
    }
  }, [currentUser]);
  
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
  
  // 選擇好友
  const handleSelectFriend = (friend: Friend) => {
    // 檢查是否已選擇該好友
    const friendIndex = selectedFriends.findIndex(f => f.id === friend.id);
    
    // 如果已選擇，則取消選擇
    if (friendIndex !== -1) {
      setSelectedFriends(prev => prev.filter(f => f.id !== friend.id));
      setMembers(prev => prev.filter(m => m.userId !== friend.id));
    }
    // 如果未選擇，則添加到選中列表
    else {
      setSelectedFriends(prev => [...prev, friend]);
      
      // 將好友添加到成員列表，確保沒有undefined值
      const newMember: GroupMember = {
        userId: friend.id || '',
        nickname: friend.nickname || '',
        email: friend.email || '',
        photoURL: friend.photoURL || ''
      };
      
      setMembers(prev => [...prev, newMember]);
    }
  };
  
  // 移除成員
  const removeMember = (userId: string) => {
    // 移除成員
    setMembers(prev => prev.filter(m => m.userId !== userId));
    
    // 如果是好友，也從已選好友中移除
    setSelectedFriends(prev => prev.filter(f => f.id !== userId));
  };
  
  // 清除所有已選擇的好友
  const clearAllSelectedFriends = () => {
    // 只保留當前用戶
    const currentUserMember = members.find(m => m.userId === currentUser?.uid);
    if (currentUserMember) {
      setMembers([currentUserMember]);
    }
    
    setSelectedFriends([]);
  };
  
  // 過濾好友列表
  const filteredFriends = searchQuery
    ? friends.filter(friend => 
        friend.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        friend.email?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : friends;
  
  // 提交表單
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 基本驗證
    if (!groupName.trim()) {
      setError('請輸入分帳群組名稱');
      return;
    }
    
    if (selectedFriends.length === 0 && !isEditing) {
      setError('請至少選擇一位好友邀請加入');
      return;
    }
    
    setError('');
    setSubmitting(true);
    
    try {
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
      
      // 如果是編輯模式，則返回更新後的名稱和描述
      if (isEditing) {
        onSave({
          name: groupName,
          description: description
        });
        return;
      }
      
      // 只將當前用戶添加為成員，邀請的好友需要確認後才會加入
      const initialMembers = [];
      
      if (currentUser) {
        initialMembers.push({
          userId: currentUser.uid || '',
          nickname: currentUser.displayName || currentUser.email?.split('@')[0] || '我',
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || ''
        });
      }
      
      // 準備要儲存的分帳群組數據
      const groupData = {
        title: groupName || '未命名群組',
        name: groupName || '未命名群組',
        description: description || '',
        createdBy: currentUser?.uid || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        members: initialMembers,
        memberIds: [currentUser?.uid || ''],
        status: 'active',
        totalAmount: 0,
        currency: 'NTD',
        expenseCount: 0
      };
      
      // 清理數據中的所有undefined值
      const cleanedData = cleanUndefinedValues(groupData);
      
      console.log('準備創建的群組數據:', JSON.stringify(cleanedData, (key, value) => {
        if (value === undefined) return '<<undefined>>';
        return value;
      }));
      
      // 創建群組文檔 - 只包含當前用戶作為成員
      const groupRef = await addDoc(collection(db, 'expenseGroups'), cleanedData);
      console.log('群組創建成功，ID:', groupRef.id);
      
      // 為選定的好友創建邀請
      await Promise.all(
        selectedFriends.map(async (friend) => {
          // 準備邀請數據
          const inviteData = {
            groupId: groupRef.id || '',
            groupName: groupName || '未命名群組',
            inviterId: currentUser?.uid || '',
            inviterName: currentUser?.displayName || currentUser?.email?.split('@')[0] || '未知用戶',
            inviteeId: friend.id || '',
            inviteeName: friend.nickname || '未知用戶',
            status: 'pending', // 邀請狀態為等待確認
            createdAt: serverTimestamp()
          };
          
          // 清理邀請數據中的undefined值
          const cleanedInviteData = cleanUndefinedValues(inviteData);
          
          await addDoc(collection(db, 'groupInvites'), cleanedInviteData);
        })
      );
      
      // 顯示成功訊息
      setSuccess('分帳群組創建成功！已向選定的好友發送邀請');
      
      // 直接調用onSave，無需使用setTimeout
      onSave({ name: groupName, description: description });
      
    } catch (error: any) {
      console.error('創建分帳群組失敗:', error);
      setError(error.message || '創建分帳群組失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };
  
  // 渲染成員列表
  const renderMembers = () => {
    // 僅在非編輯模式且有選擇的好友時顯示
    if (isEditing || selectedFriends.length === 0) return null;
    
    return (
      <div className="mt-6 bg-white p-4 rounded-lg border border-[#E8E4ED] shadow-sm animate-fadeIn">
        <div className="flex justify-between items-center mb-4">
          <div className="font-semibold text-gray-700 flex items-center">
            <div className="w-6 h-6 rounded-full bg-[#A487C3] flex items-center justify-center mr-2 shadow-sm">
              <i className="fas fa-user-check text-white text-xs"></i>
            </div>
            <span>已選擇的好友</span>
            <div className="ml-2 px-2 py-0.5 bg-[#F0EAFA] text-[#8A5DC8] rounded-full text-xs font-bold">
              {selectedFriends.length}
            </div>
          </div>
          {selectedFriends.length > 0 && (
            <button
              type="button"
              onClick={clearAllSelectedFriends}
              className="flex items-center py-1.5 px-3 bg-white hover:bg-[#8A5DC8] text-[#8A5DC8] hover:text-white rounded-lg transition-all duration-200 shadow-sm border border-[#D8CAE9] hover:border-[#8A5DC8]"
            >
              <i className="fas fa-times-circle text-sm mr-1.5"></i>
              <span className="text-xs font-medium">清除全部</span>
            </button>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2">
          {selectedFriends.map((friend) => (
            <div 
              key={friend.id}
              className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-[#F0EAFA] to-[#F8F3FF] border border-[#D8CAE9] rounded-full text-[#8A5DC8] text-sm shadow-sm hover:shadow-md transition-all duration-200 animate-fadeIn"
            >
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#A487C3] mr-2 overflow-hidden flex items-center justify-center border border-white/70 shadow-inner">
                {friend.photoURL ? (
                  <img src={friend.photoURL} alt={friend.nickname} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-xs font-medium">
                    {friend.nickname.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="max-w-[110px] truncate font-medium">{friend.nickname}</span>
              <button
                type="button"
                onClick={() => removeMember(friend.id || '')}
                className="ml-2 w-6 h-6 flex items-center justify-center bg-white hover:bg-[#8A5DC8] text-[#8A5DC8] hover:text-white rounded-full transition-all duration-200 shadow-sm border border-[#D8CAE9] hover:border-[#8A5DC8]"
                aria-label={`移除 ${friend.nickname}`}
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-b from-[#F9F5FF] to-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fadeIn">
        {/* 頂部標題區域 */}
        <div className="relative bg-gradient-to-r from-[#F0EAFA] to-[#F8F3FF] px-6 py-4 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <h2 className="text-lg sm:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#8A5DC8] to-[#A487C3]">
              {isEditing ? '編輯分帳群組' : '創建分帳群組'}
            </h2>
            <button
              onClick={onCancel}
              className="text-gray-600 hover:bg-gray-100 hover:text-gray-900 h-8 w-8 rounded-full flex items-center justify-center transition-colors"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
          
          {/* 進度指示器 */}
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-100">
            <div 
              className="h-full bg-gradient-to-r from-[#A487C3] to-[#8A5DC8] rounded-r-full transition-all duration-500"
              style={{ 
                width: `${
                  Math.min(
                    (groupName.length ? 50 : 0) + 
                    (members.length > 1 ? 50 : Math.min(members.length * 50, 30)), 
                    100
                  )
                }%` 
              }}
            ></div>
          </div>
        </div>
        
        <div className="p-6">
          {/* 錯誤提示 */}
          {error && (
            <div className="mb-4 p-3 bg-gradient-to-r from-red-50 to-red-100 rounded-lg text-red-600 text-sm animate-fadeIn relative">
              <i className="fas fa-exclamation-circle mr-2"></i>
              <span>{error}</span>
              <button 
                onClick={() => setError('')} 
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-red-400 hover:text-red-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          )}
          
          {/* 成功提示 */}
          {success && (
            <div className="mb-4 p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-lg text-green-600 text-sm animate-fadeIn relative">
              <i className="fas fa-check-circle mr-2"></i>
              <span>{success}</span>
              <button 
                onClick={() => setSuccess('')} 
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-green-400 hover:text-green-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="animate-fadeIn space-y-4">
            {/* 群組基本信息 */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1" htmlFor="groupName">
                群組名稱 <span className="text-red-500 ml-1">*</span>
              </label>
              <div className="relative">
                <input
                  id="groupName"
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-transparent transition-all bg-gray-50 hover:bg-white shadow-sm text-sm"
                  placeholder="例如：日本旅行、聚餐分帳"
                  required
                />
                <i className="fas fa-pen-fancy absolute left-3 top-1/2 transform -translate-y-1/2 text-[#A487C3]"></i>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1" htmlFor="description">
                描述（選填）
              </label>
              <div className="relative">
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-transparent transition-all resize-none bg-gray-50 hover:bg-white shadow-sm text-sm"
                  rows={2}
                  placeholder="簡短描述這個分帳群組的用途..."
                />
                <i className="fas fa-align-left absolute left-3 top-3 text-[#A487C3]"></i>
              </div>
            </div>
            
            {/* 邀請好友部分 - 僅在非編輯模式顯示 */}
            {!isEditing && (
              <>
                {/* 已選擇的好友顯示 */}
                {renderMembers()}
                
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-semibold text-gray-800">
                      邀請好友加入群組
                    </label>
                    <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                      {selectedFriends.length > 0 ? (
                        <span>已選擇 {selectedFriends.length} 位好友</span>
                      ) : (
                        <span>尚未選擇好友</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="friend-selection">
                    <div className="relative mb-3">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜尋好友..."
                        className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-transparent bg-gray-50 hover:bg-white shadow-sm text-sm"
                      />
                      <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <i className="fas fa-times-circle"></i>
                        </button>
                      )}
                    </div>
                    
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                      {loading ? (
                        <div className="py-6 flex flex-col justify-center items-center text-gray-500">
                          <div className="w-8 h-8 border-4 border-t-4 border-gray-200 border-t-[#A487C3] rounded-full animate-spin mb-2"></div>
                          <span className="text-sm">加載好友列表...</span>
                        </div>
                      ) : filteredFriends.length > 0 ? (
                        <div className="max-h-60 overflow-y-auto custom-scrollbar divide-y divide-gray-100">
                          {filteredFriends.map((friend) => (
                            <div 
                              key={friend.id}
                              onClick={() => handleSelectFriend(friend)}
                              className={`
                                flex items-center px-3 py-2.5 cursor-pointer transition-all hover:bg-gray-50
                                ${selectedFriends.find(f => f.id === friend.id) 
                                  ? 'bg-[#F8F5FF] border-l-4 border-[#A487C3]' 
                                  : 'border-l-4 border-transparent'}
                              `}
                            >
                              <div className="mr-3 w-5 h-5 flex-shrink-0">
                                <div className={`w-5 h-5 rounded-md border ${selectedFriends.find(f => f.id === friend.id) ? 'bg-[#A487C3] border-[#A487C3]' : 'border-gray-300'} flex items-center justify-center transition-colors`}>
                                  {selectedFriends.find(f => f.id === friend.id) && (
                                    <i className="fas fa-check text-xs text-white"></i>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 mr-2 overflow-hidden">
                                {friend.photoURL ? (
                                  <img src={friend.photoURL} alt={friend.nickname} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gray-300 text-white">
                                    {friend.nickname?.charAt(0).toUpperCase() || 'U'}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-800 truncate">{friend.nickname}</div>
                                {friend.email && (
                                  <div className="text-xs text-gray-500 truncate">{friend.email}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-10 flex flex-col items-center justify-center text-center px-4">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3 text-gray-400">
                            <i className="fas fa-user-friends text-xl"></i>
                          </div>
                          
                          {searchQuery ? (
                            <>
                              <h3 className="text-gray-800 font-medium mb-1">沒有找到符合的好友</h3>
                              <p className="text-gray-500 text-sm max-w-sm">找不到與「{searchQuery}」相符的好友，請嘗試其他搜尋條件。</p>
                            </>
                          ) : (
                            <>
                              <h3 className="text-gray-800 font-medium mb-1">沒有可邀請的好友</h3>
                              <p className="text-gray-500 text-sm max-w-sm">你目前沒有任何好友可以邀請。請先添加好友。</p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
            
            <div className="flex gap-3 pt-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors text-sm font-medium"
                disabled={submitting}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2 px-4 bg-[#A487C3] hover:bg-[#9678B6] text-white rounded-lg transition-colors text-sm font-medium"
              >
                {submitting ? (
                  <div className="flex items-center justify-center">
                    <div className="w-4 h-4 border-t-2 border-b-2 border-white rounded-full animate-spin mr-1"></div>
                    處理中...
                  </div>
                ) : (
                  isEditing ? '保存更改' : '創建群組'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ExpenseGroupForm; 