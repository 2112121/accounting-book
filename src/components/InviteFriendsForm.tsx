import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Friend } from '../contexts/AuthContext';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface InviteFriendsFormProps {
  groupId: string;
  groupName: string;
  onSave: (selectedFriends: Friend[]) => void;
  onCancel: () => void;
  navigateToGroupDetail?: () => void;
}

interface GroupMember {
  userId: string;
  nickname: string;
  email?: string;
  photoURL?: string;
}

const InviteFriendsForm: React.FC<InviteFriendsFormProps> = ({ 
  groupId, 
  groupName,
  onSave, 
  onCancel,
  navigateToGroupDetail
}) => {
  const { currentUser, getFriends } = useAuth();
  
  // 表單狀態
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 數據加載狀態
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [existingMembers, setExistingMembers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // 加載數據
  useEffect(() => {
    if (currentUser) {
      loadFriends();
      loadExistingMembers();
    }
  }, [currentUser, groupId]);
  
  // 加載群組現有成員
  const loadExistingMembers = async () => {
    try {
      setLoading(true);
      const groupRef = doc(db, 'expenseGroups', groupId);
      const groupDoc = await getDoc(groupRef);
      
      if (groupDoc.exists()) {
        const groupData = groupDoc.data();
        const members = groupData.members || [];
        const memberIds = members.map((member: GroupMember) => member.userId);
        
        setExistingMembers(memberIds);
      }
    } catch (error) {
      console.error('加載群組成員失敗:', error);
    } finally {
      setLoading(false);
    }
  };
  
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
    }
    // 如果未選擇，則添加到選中列表
    else {
      setSelectedFriends(prev => [...prev, friend]);
    }
  };

  // 清除所有已選擇的好友
  const clearAllSelectedFriends = () => {
    setSelectedFriends([]);
  };
  
  // 過濾好友列表（排除已是群組成員的好友）
  const filteredFriends = searchQuery
    ? friends.filter(friend => 
        !existingMembers.includes(friend.id || '') && // 排除已是群組成員的好友
        (friend.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        friend.email?.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : friends.filter(friend => !existingMembers.includes(friend.id || '')); // 排除已是群組成員的好友
  
  // 提交表單
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 基本驗證
    if (selectedFriends.length === 0) {
      setError('請至少選擇一位好友邀請加入');
      return;
    }
    
    setError('');
    setSubmitting(true);
    
    try {
      // 調用保存函數，傳遞選中的好友
      onSave(selectedFriends);
    } catch (error: any) {
      console.error('邀請好友失敗:', error);
      setError(error.message || '邀請好友失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };
  
  // 處理關閉表單
  const handleClose = () => {
    // 如果提供了導航到群組詳情的函數，則使用它
    if (navigateToGroupDetail) {
      navigateToGroupDetail();
    } else {
      // 否則使用默認的取消行為
      onCancel();
    }
  };
  
  // 渲染已選擇的好友列表
  const renderSelectedFriends = () => {
    if (selectedFriends.length === 0) return null;
    
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
                onClick={() => handleSelectFriend(friend)}
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
              邀請好友加入「{groupName}」
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-600 hover:bg-gray-100 hover:text-gray-900 h-8 w-8 rounded-full flex items-center justify-center transition-colors"
            >
              <i className="fas fa-times"></i>
            </button>
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
            <p className="text-sm text-gray-600 mb-2">
              選擇想要邀請加入此分帳群組的好友，系統將發送邀請通知給他們。
            </p>
            
            {/* 已選擇的好友顯示 */}
            {renderSelectedFriends()}
            
            {/* 邀請好友部分 */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-gray-800">
                  選擇好友
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
                      ) : existingMembers.length === friends.length ? (
                        <>
                          <h3 className="text-gray-800 font-medium mb-1">所有好友已在群組中</h3>
                          <p className="text-gray-500 text-sm max-w-sm">你的所有好友都已經是這個群組的成員了。</p>
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
            
            <div className="flex gap-3 pt-4 mt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2.5 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors text-sm font-medium"
                disabled={submitting}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting || selectedFriends.length === 0}
                className="flex-1 py-2.5 px-4 bg-[#A487C3] hover:bg-[#9678B6] text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <div className="flex items-center justify-center">
                    <div className="w-4 h-4 border-t-2 border-b-2 border-white rounded-full animate-spin mr-1"></div>
                    處理中...
                  </div>
                ) : (
                  '發送邀請'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default InviteFriendsForm; 