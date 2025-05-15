import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Friend, FriendRequest } from '../contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface FriendManagementProps {
  onClose: () => void;
}

const FriendManagement: React.FC<FriendManagementProps> = ({ onClose }) => {
  const { currentUser, searchUsers, sendFriendRequest, getFriends, getFriendRequests, getSentFriendRequests, cancelFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [friendCodeQuery, setFriendCodeQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [sentFriendRequests, setSentFriendRequests] = useState<FriendRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'friends' | 'search' | 'requests' | 'sent'>('friends');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [recipientInfo, setRecipientInfo] = useState<{[userId: string]: Friend}>({});
  
  // 用戶的好友碼 (這裡假設是根據用戶ID生成的固定6位字符)
  const [myFriendCode, setMyFriendCode] = useState('');
  
  // 生成好友碼
  useEffect(() => {
    if (currentUser) {
      // 從用戶ID生成固定的6位好友碼
      const userId = currentUser.uid;
      const code = generateFriendCode(userId);
      setMyFriendCode(code);
    }
  }, [currentUser]);
  
  // 根據用戶ID生成固定的6位好友碼
  const generateFriendCode = (userId: string): string => {
    // 使用用戶ID的前6個字符作為好友碼的基礎
    const baseCode = userId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6);
    
    // 如果不足6位，用數字填充
    let code = baseCode;
    while (code.length < 6) {
      code += Math.floor(Math.random() * 10);
    }
    
    // 轉為大寫
    return code.toUpperCase();
  };

  // 加載好友和請求列表
  useEffect(() => {
    loadFriends();
    loadFriendRequests();
    loadSentFriendRequests();
  }, [currentUser]);

  // 加載好友列表
  const loadFriends = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      const friendsList = await getFriends();
      setFriends(friendsList);
    } catch (error) {
      setError('載入好友列表失敗');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 加載好友請求
  const loadFriendRequests = async () => {
    if (!currentUser) return;
    try {
      const requests = await getFriendRequests();
      setFriendRequests(requests);
    } catch (error) {
      console.error('載入好友請求失敗', error);
    }
  };

  // 加載已發送的好友請求
  const loadSentFriendRequests = async () => {
    if (!currentUser) return;
    try {
      const requests = await getSentFriendRequests();
      setSentFriendRequests(requests);
      
      // 獲取所有收件人的信息
      for (const request of requests) {
        getRecipientInfo(request.to);
      }
    } catch (error) {
      console.error('載入已發送的好友請求失敗', error);
    }
  };

  // 獲取收件人信息
  const getRecipientInfo = async (userId: string) => {
    // 如果已經有緩存信息，則跳過
    if (recipientInfo[userId]) return;
    
    try {
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setRecipientInfo(prev => ({
          ...prev,
          [userId]: {
            id: userId,
            nickname: userData.nickname || "未命名用戶",
            email: userData.email || "",
            photoURL: userData.photoURL || ""
          }
        }));
      }
    } catch (error) {
      console.error('獲取收件人信息失敗:', error);
    }
  };

  // 透過好友碼搜索
  const handleFriendCodeSearch = async () => {
    if (!friendCodeQuery.trim()) {
      setError('請輸入好友碼');
      return;
    }

    if (friendCodeQuery.length !== 6) {
      setError('好友碼必須是6位字符');
      return;
    }

    try {
      setIsSearching(true);
      setError('');
      setSuccess('');
      console.log("開始搜索好友碼:", friendCodeQuery);
      
      // 檢查是否搜尋自己的好友碼
      if (friendCodeQuery.toUpperCase() === myFriendCode) {
        setError('不能添加自己為好友');
        setIsSearching(false);
        return;
      }
      
      // 透過好友碼查詢
      const results = await searchUsers(friendCodeQuery);
      console.log("好友碼搜索結果:", results);
      setSearchResults(results);
      
      if (results.length === 0) {
        // 通常不會到這裡，因為如果沒有結果，searchUsers 會拋出錯誤
        setError(`未找到好友碼為 "${friendCodeQuery}" 的用戶`);
      } else {
        setSuccess(`成功找到好友碼為 "${friendCodeQuery}" 的用戶`);
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (error: any) {
      console.error('搜索失敗:', error);
      // 更友好地顯示錯誤信息
      if (error.message && error.message.includes("未找到好友碼")) {
        setError(error.message);
      } else {
        setError(error.message || '搜索失敗，請稍後再試');
      }
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // 發送好友請求
  const handleSendFriendRequest = async (userId: string) => {
    try {
      setLoading(true);
      setError('');
      await sendFriendRequest(userId);
      
      // 更新搜索結果，標記已發送請求的用戶
      setSearchResults(prev => 
        prev.map(user => 
          user.id === userId ? { ...user, requestSent: true } : user
        )
      );
      
      // 重新加載已發送的好友請求
      await loadSentFriendRequests();
      
      // 顯示成功提示
      setSuccess('好友請求已成功發送！請等待對方確認');
      
      // 自動切換到已發送請求標籤頁
      setActiveTab('sent');
      
      // 3秒後清除成功提示
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      setError(error.message || '發送好友請求失敗');
    } finally {
      setLoading(false);
    }
  };

  // 接受好友請求
  const handleAcceptFriendRequest = async (requestId: string) => {
    try {
      setLoading(true);
      await acceptFriendRequest(requestId);
      setSuccess('已接受好友請求');
      
      // 更新好友請求列表和好友列表
      loadFriendRequests();
      loadFriends();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('接受好友請求失敗');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 拒絕好友請求
  const handleRejectFriendRequest = async (requestId: string) => {
    try {
      setLoading(true);
      await rejectFriendRequest(requestId);
      
      // 更新好友請求列表
      loadFriendRequests();
      
      setSuccess('已拒絕好友請求');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('拒絕好友請求失敗');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 移除好友
  const handleRemoveFriend = async (friendId: string) => {
    if (window.confirm('確定要移除此好友嗎？')) {
      try {
        setLoading(true);
        await removeFriend(friendId);
        
        // 更新好友列表
        setFriends(prev => prev.filter(friend => friend.id !== friendId));
        
        setSuccess('好友已移除');
        setTimeout(() => setSuccess(''), 3000);
      } catch (error) {
        setError('移除好友失敗');
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
  };
  
  // 複製好友碼功能
  const copyFriendCode = () => {
    navigator.clipboard.writeText(myFriendCode).then(() => {
      setSuccess('好友碼已複製到剪貼簿');
      setTimeout(() => setSuccess(''), 3000);
    }, (err) => {
      setError('複製失敗，請手動複製');
      console.error('複製失敗:', err);
    });
  };

  // 取消已發送的好友請求
  const handleCancelFriendRequest = async (requestId: string) => {
    if (window.confirm('確定要取消此好友請求嗎？')) {
      try {
        setLoading(true);
        setError('');
        await cancelFriendRequest(requestId);
        
        // 從已發送請求列表中移除
        setSentFriendRequests(prev => prev.filter(req => req.id !== requestId));
        
        // 更新搜索結果，移除已發送請求標記
        setSearchResults(prev => 
          prev.map(user => {
            // 查找對應的請求
            const request = sentFriendRequests.find(req => req.to === user.id);
            if (request && request.id === requestId) {
              return { ...user, requestSent: false };
            }
            return user;
          })
        );
        
        setSuccess('已取消好友請求');
        setTimeout(() => setSuccess(''), 3000);
      } catch (error: any) {
        setError(error.message || '取消好友請求失敗');
      } finally {
        setLoading(false);
      }
    }
  };

  // 定義Tab數據結構
  interface Tab {
    id: string;
    name: string;
    icon: string;
  }

  const tabs: Tab[] = [
    { id: 'friends', name: '我的好友', icon: 'fas fa-user-friends' },
    { id: 'search', name: '搜尋新好友', icon: 'fas fa-search' },
    { id: 'requests', name: '好友請求', icon: 'fas fa-envelope' },
    { id: 'sent', name: '已發送請求', icon: 'fas fa-paper-plane' }
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[#A487C3]">好友管理</h2>
        <button 
          onClick={onClose}
          className="text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4 text-sm">
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <i className="fas fa-exclamation-circle text-red-500"></i>
            </div>
            <div className="ml-3">
              <h3 className="font-medium">搜尋遇到問題</h3>
              <div className="mt-2 whitespace-pre-line">
                {error}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm">
          {success}
        </div>
      )}
      
      {/* 我的好友碼顯示區域 */}
      <div className="bg-white border border-[#E8DFFC] rounded-xl p-6 mb-6 relative overflow-hidden shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between relative z-10">
          <div className="mb-4 sm:mb-0">
            <h3 className="font-bold text-[#A487C3] text-lg mb-1 flex items-center">
              <i className="fas fa-id-card text-xl mr-2"></i>
              我的好友碼
            </h3>
            <p className="text-sm text-gray-600">分享此代碼給朋友，他們可以更快地添加你</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="bg-white p-3 rounded-lg border border-[#E8DFFC] shadow-sm">
              <span className="font-mono font-bold text-2xl text-[#A487C3] tracking-wider letter-spacing-2">
                {myFriendCode}
              </span>
            </div>
            <button 
              onClick={copyFriendCode}
              className="p-3 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-lg w-12 h-12 flex items-center justify-center shadow-sm hover:shadow-md transition-all duration-300"
              title="複製好友碼"
            >
              <i className="fas fa-copy text-lg"></i>
            </button>
          </div>
        </div>
      </div>
      
      {/* Tab 按鈕 */}
      <div className="mb-6 mt-2">
        <div className="flex gap-3 overflow-x-auto pb-4 px-1 no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as 'friends' | 'search' | 'requests' | 'sent');
                setSearchQuery('');
                setFriendCodeQuery('');
                setSearchResults([]);
              }}
              className={`min-w-[120px] px-4 py-3 rounded-lg text-sm whitespace-nowrap transition-all duration-200 flex items-center justify-center ${
                activeTab === tab.id
                  ? 'bg-[#A487C3] text-white'
                  : 'text-[#A487C3] bg-white'
              }`}
            >
              <i className={`${tab.icon} ${activeTab === tab.id ? 'text-white' : 'text-[#A487C3]'} mr-2`}></i>
              <span>{tab.name}</span>
              {tab.id === 'requests' && friendRequests.length > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {friendRequests.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      
      {/* 好友列表 */}
      {activeTab === 'friends' && (
        <div className="space-y-4">
          <h3 className="font-medium mb-3">我的好友列表</h3>
          
          {loading ? (
            <div className="text-center py-4">
              <p className="text-gray-500">載入中...</p>
            </div>
          ) : friends.length > 0 ? (
            <div className="space-y-3">
              {friends.map(friend => (
                <div 
                  key={friend.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-white border border-gray-200 hover:border-[#A487C3] rounded-lg transition-all duration-300 hover:shadow-md group"
                >
                  <div className="flex items-center gap-3 w-full sm:w-auto mb-3 sm:mb-0">
                    <div className="w-12 h-12 rounded-full bg-[#F8F5FF] flex items-center justify-center text-[#A487C3] uppercase border-2 border-[#E8DFFC] shadow-sm overflow-hidden group-hover:scale-105 transition-transform duration-300">
                      {friend.photoURL ? (
                        <img src={friend.photoURL} alt={friend.nickname} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold">{friend.nickname.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{friend.nickname}</p>
                      <p className="text-xs text-gray-500">{friend.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFriend(friend.id)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center justify-center w-full sm:w-auto focus:outline-none border border-gray-200 transition-all duration-300 min-w-[120px]"
                  >
                    <i className="fas fa-user-times mr-2"></i>
                    <span>移除好友</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-gray-500 mb-2">你還沒有好友</p>
              <p className="text-sm text-gray-400">使用搜尋功能添加新好友</p>
              <button
                onClick={() => setActiveTab('search')}
                className="mt-3 px-4 py-2 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-lg text-sm transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white friend-btn friend-btn-primary w-full sm:w-auto sm:min-w-[200px]"
              >
                <i className="fas fa-search mr-2"></i>
                搜尋好友
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* 搜尋好友 */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <h3 className="font-medium mb-3">搜尋好友</h3>
          
          {/* 用好友碼搜尋 */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-5 mb-4">
            <h4 className="font-medium text-[#A487C3] mb-3 flex items-center">
              <i className="fas fa-search-plus mr-2"></i>
              用好友碼搜尋
            </h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="fas fa-hashtag text-[#A487C3]"></i>
                </div>
                <input 
                  type="text"
                  value={friendCodeQuery}
                  onChange={(e) => setFriendCodeQuery(e.target.value.toUpperCase())}
                  placeholder="輸入6位好友碼"
                  maxLength={6}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] transition-all duration-300 font-mono text-center uppercase tracking-widest text-lg shadow-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleFriendCodeSearch}
                disabled={isSearching}
                className="px-4 py-2 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-lg flex items-center justify-center transition-all duration-300 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-white"
              >
                {isSearching ? (
                  <><i className="fas fa-spinner fa-spin mr-2"></i>搜尋中...</>
                ) : (
                  <><i className="fas fa-search mr-2"></i>搜尋</>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3 flex items-start">
              <i className="fas fa-info-circle mr-1 mt-0.5 text-[#A487C3]"></i>
              <span>
                提示：好友碼不分大小寫，如找不到用戶，可能是因為該用戶尚未啟用好友碼或好友碼輸入錯誤
              </span>
            </p>
          </div>
          
          {isSearching ? (
            <div className="text-center py-4">
              <p className="text-gray-500">搜尋中...</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-2 mt-4">
              <p className="text-sm text-gray-500 mb-2">搜尋結果：</p>
              {searchResults.map(user => (
                <div 
                  key={user.id}
                  className="flex flex-wrap sm:flex-nowrap items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center gap-3 w-full sm:w-auto mb-2 sm:mb-0">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 uppercase">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt={user.nickname} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        user.nickname.charAt(0)
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{user.nickname}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </div>
                  
                  {/* 檢查是否已是好友 */}
                  {friends.some(friend => friend.id === user.id) ? (
                    <span className="px-4 py-2 bg-gradient-to-r from-emerald-50 to-green-50 text-green-600 rounded-lg inline-block w-full sm:w-auto text-center flex items-center justify-center shadow-sm border border-green-100">
                      <i className="fas fa-user-check mr-2 text-green-500"></i>
                      已是好友
                    </span>
                  ) : user.requestSent ? (
                    <div className="flex flex-col items-center w-full sm:w-auto">
                      <span className="px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 rounded-lg inline-block w-full sm:w-auto text-center flex items-center justify-center shadow-sm border border-blue-100 relative group cursor-help">
                        <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 text-xs animate-pulse">
                          <i className="fas fa-info"></i>
                        </span>
                        <i className="fas fa-paper-plane mr-2"></i>
                        已發送請求
                        <span className="absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-white p-2 rounded-md shadow-lg text-xs text-gray-700 pointer-events-none border border-gray-200 z-10">
                          點擊"已發送請求"標籤查看詳情，你可以取消已發送的請求
                          <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-white border-r border-b border-gray-200 rotate-45"></span>
                        </span>
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSendFriendRequest(user.id)}
                      disabled={loading}
                      className="relative overflow-hidden px-4 py-2 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-lg text-sm disabled:opacity-50 w-full sm:w-auto transition-all duration-300 shadow-sm hover:shadow-md flex items-center justify-center group"
                    >
                      <span className="absolute top-0 left-0 w-full h-full bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></span>
                      {loading ? (
                        <div className="flex items-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          處理中...
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <i className="fas fa-user-plus mr-2"></i>
                          加為好友
                        </div>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (friendCodeQuery) && !isSearching && (
            <div className="text-center py-6 bg-gray-50 rounded-lg mt-4">
              <p className="text-gray-500">沒有符合條件的搜尋結果</p>
              <p className="text-sm text-gray-400 mt-1">請確認好友碼輸入正確</p>
            </div>
          )}
          
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-600">
              <i className="fas fa-info-circle mr-1"></i>
              提示：你可以通過好友碼搜尋用戶，請輸入6位的好友碼
            </p>
          </div>
        </div>
      )}
      
      {/* 好友請求 */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          <h3 className="font-medium mb-3 flex items-center text-lg text-[#8A5DC8]">
            <i className="fas fa-envelope mr-2"></i>
            好友請求
          </h3>
          
          {loading ? (
            <div className="text-center py-4">
              <p className="text-gray-500">載入中...</p>
            </div>
          ) : friendRequests.length > 0 ? (
            <div className="space-y-2">
              {friendRequests.map(request => (
                <div 
                  key={request.id}
                  className="p-4 bg-white border border-gray-200 hover:border-[#E8DFFC] rounded-lg transition-all duration-300 hover:shadow-md"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-[#F8F5FF] flex items-center justify-center text-[#A487C3] uppercase border-2 border-[#E8DFFC] shadow-sm overflow-hidden">
                      {request.from.photoURL ? (
                        <img src={request.from.photoURL} alt={request.from.nickname} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold">{request.from.nickname.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{request.from.nickname}</p>
                      <p className="text-xs text-gray-500">{request.from.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <button
                      onClick={() => handleAcceptFriendRequest(request.id)}
                      disabled={loading}
                      className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm disabled:opacity-50 transition-all duration-300 shadow-sm hover:shadow-md flex items-center justify-center flex-1 min-w-[100px]"
                    >
                      <i className="fas fa-check mr-2"></i>
                      接受
                    </button>
                    <button
                      onClick={() => handleRejectFriendRequest(request.id)}
                      disabled={loading}
                      className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg text-sm disabled:opacity-50 transition-all duration-300 shadow-sm hover:shadow-md flex items-center justify-center flex-1 min-w-[100px]"
                    >
                      <i className="fas fa-times mr-2"></i>
                      拒絕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 px-6 bg-gradient-to-br from-[#F9F6FF] to-white rounded-xl border border-[#E8DFFC] shadow-sm overflow-hidden relative">
              {/* 裝飾背景 */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-l from-[#F0E8FF] to-transparent opacity-60 rounded-full transform -translate-y-1/3 translate-x-1/3"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-r from-[#F0E8FF] to-transparent opacity-60 rounded-full transform translate-y-1/3 -translate-x-1/3"></div>
              
              {/* 內容容器 */}
              <div className="relative z-10 flex flex-col items-center max-w-lg mx-auto">
                {/* 圖標 */}
                <div className="mb-10 relative">
                  <div className="absolute -inset-10 bg-white/50 rounded-full filter blur-xl"></div>
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#A487C3]/20 to-[#A487C3]/10 animate-pulse"></div>
                    <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-[#A487C3]/30 to-[#A487C3]/10 opacity-70"></div>
                    <div className="relative w-24 h-24 rounded-full bg-white shadow-xl flex items-center justify-center border-4 border-white">
                      <div className="text-[#A487C3] transform transition-transform">
                        <i className="fas fa-envelope text-5xl"></i>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 標題與描述 */}
                <h3 className="text-center text-2xl font-bold text-[#7D5BA6] mb-4">尚無待處理的好友請求</h3>
                <p className="text-center text-gray-600 mb-10 max-w-sm">
                  您目前沒有收到任何好友請求。您可以邀請朋友加入，或搜尋好友來建立連結！
                </p>

                {/* 按鈕區域 */}
                <div className="w-full flex flex-col items-center space-y-6 mb-10">
                  {/* 雙按鈕 */}
                  <div className="w-full flex flex-col sm:flex-row sm:justify-center gap-4">
                    <button
                      onClick={() => setActiveTab('search')}
                      className="flex-1 max-w-xs px-5 py-3.5 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center"
                    >
                      <i className="fas fa-search mr-2.5"></i>
                      搜尋新好友
                    </button>
                    
                    <button 
                      onClick={copyFriendCode}
                      className="flex-1 max-w-xs px-5 py-3.5 bg-white hover:bg-[#F0E8FF] text-[#A487C3] border border-[#E8DFFC] rounded-xl shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center"
                    >
                      <i className="fas fa-share-alt mr-2.5"></i>
                      分享好友碼
                    </button>
                  </div>
                  
                  {/* 好友碼顯示 */}
                  <div className="mt-4 w-full max-w-xs py-4 px-6 bg-white rounded-xl border border-[#E8DFFC] shadow-sm flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-12 h-12 rounded-full bg-[#F9F6FF] flex items-center justify-center text-[#A487C3] mr-4">
                        <i className="fas fa-id-card text-xl"></i>
                      </div>
                      <span className="font-mono font-bold text-2xl text-[#A487C3]">{myFriendCode}</span>
                    </div>
                    <button 
                      onClick={copyFriendCode}
                      className="w-10 h-10 rounded-full flex items-center justify-center bg-[#F9F6FF] hover:bg-[#A487C3] text-[#A487C3] hover:text-white transition-all duration-300"
                    >
                      <i className="fas fa-copy"></i>
                    </button>
                  </div>
                </div>
                
                {/* 提示信息 */}
                <div className="flex items-center justify-center text-xs text-gray-500 max-w-xs text-center">
                  <i className="fas fa-lightbulb text-yellow-500 mr-2 flex-shrink-0"></i>
                  <span>通過分享您的好友碼，讓朋友更快地找到您</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 已發送的好友請求 */}
      {activeTab === 'sent' && (
        <div className="space-y-4">
          <h3 className="font-medium mb-3 flex items-center text-lg text-[#8A5DC8]">
            <i className="fas fa-paper-plane mr-2"></i>
            已發送的好友請求
          </h3>
          
          {loading ? (
            <div className="text-center py-10 bg-white border border-gray-100 rounded-xl shadow-sm">
              <div className="inline-block w-16 h-16 relative mb-3">
                <div className="absolute inset-0 border-4 border-[#F0EAFA] border-t-[#A487C3] rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <i className="fas fa-paper-plane text-[#A487C3] text-lg animate-pulse"></i>
                </div>
              </div>
              <p className="text-gray-500 text-lg">正在載入請求...</p>
              <p className="text-gray-400 text-sm mt-1">請稍候片刻</p>
            </div>
          ) : sentFriendRequests.length > 0 ? (
            <div className="space-y-3">
              {sentFriendRequests.map(request => (
                <div 
                  key={request.id}
                  className="bg-white border border-gray-200 hover:border-[#E8DFFC] rounded-xl transition-all duration-300 hover:shadow-lg group overflow-hidden"
                >
                  {/* 頂部狀態條 */}
                  <div className="w-full h-2 bg-gradient-to-r from-blue-400 to-indigo-400 relative overflow-hidden">
                    <div className="absolute inset-0 bg-white opacity-30 transform -translate-x-1/2 animate-pulse"></div>
                  </div>
                  
                  <div className="p-5">
                    {/* 主要內容區 */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-start">
                        {/* 發送圖標 */}
                        <div className="flex-shrink-0 mr-3 relative">
                          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500 shadow-sm group-hover:scale-105 transition-transform duration-300">
                            <i className="fas fa-paper-plane group-hover:animate-bounce"></i>
                          </div>
                          <div className="absolute -right-1 -bottom-1 w-5 h-5 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                            <i className="fas fa-arrow-right text-white text-xs"></i>
                          </div>
                        </div>
                        
                        {/* 標題和時間 */}
                        <div>
                          <h4 className="font-medium text-gray-900 text-base">已發送好友邀請</h4>
                          <div className="flex items-center text-xs text-gray-500 mt-0.5">
                            <i className="far fa-clock mr-1.5"></i>
                            <span>已發送於 {new Date(request.createdAt).toLocaleTimeString('zh-TW', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* 日期顯示 */}
                      <div className="px-2 py-1 bg-gray-50 rounded-md border border-gray-100 text-xs text-gray-500 flex items-center whitespace-nowrap shadow-sm">
                        <i className="far fa-calendar-alt mr-1.5 text-blue-400"></i>
                        {new Date(request.createdAt).toLocaleDateString('zh-TW', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        })}
                      </div>
                    </div>
                    
                    {/* 收件人信息卡片 */}
                    <div className="bg-gradient-to-r from-gray-50 to-white rounded-lg p-4 mb-4 border border-gray-100 flex items-center shadow-sm">
                      {/* 收件人頭像(佔位) */}
                      <div className="w-12 h-12 rounded-full bg-[#F8F5FF] flex items-center justify-center text-[#A487C3] uppercase border border-[#E8DFFC] mr-3 shadow-sm overflow-hidden group-hover:scale-105 transition-transform duration-300">
                        {recipientInfo[request.to]?.photoURL ? (
                          <img src={recipientInfo[request.to].photoURL} alt={recipientInfo[request.to].nickname} className="w-full h-full object-cover" />
                        ) : (
                          <i className="fas fa-user text-lg"></i>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center">
                          <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200 mr-2 shadow-sm">收件人</span>
                          <span className="font-medium text-[#8A5DC8] truncate text-base">
                            {(() => {
                              // 優先使用獲取到的收件人信息
                              if (recipientInfo[request.to]) {
                                return recipientInfo[request.to].nickname;
                              }
                              
                              // 其次使用搜索結果
                              const recipient = searchResults.find(user => user.id === request.to);
                              if (recipient) {
                                return recipient.nickname || recipient.email || '未知用戶';
                              }
                              
                              // 如果都不存在，則顯示加載中
                              return <span className="inline-flex items-center"><i className="fas fa-spinner fa-spin mr-1 text-sm text-blue-400"></i> 加載中...</span>;
                            })()}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center mt-2">
                          <div className="flex items-center text-sm">
                            <div className="relative w-4 h-4 mr-2 flex-shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-300 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-400"></span>
                            </div>
                            <span className="font-medium text-blue-600">等待確認中</span>
                          </div>
                          
                          <div className="text-xs text-blue-600 cursor-help relative group/tooltip">
                            <i className="fas fa-info-circle"></i>
                            <div className="absolute bottom-full right-0 mb-2 w-60 bg-white p-2.5 rounded-lg shadow-lg border border-blue-100 invisible group-hover/tooltip:visible opacity-0 group-hover/tooltip:opacity-100 transition-all duration-300 z-10 pointer-events-none text-gray-600">
                              <p className="font-medium text-blue-600 mb-1 flex items-center">
                                <i className="fas fa-info-circle mr-1.5"></i>
                                好友請求狀態說明
                              </p>
                              <p className="mb-1 text-xs">請求將持續有效，直到被接受或取消。</p>
                              <p className="text-xs">對方接受後，你們將成為好友。</p>
                              <div className="absolute w-2 h-2 bg-white border-r border-b border-blue-100 transform rotate-45 -bottom-1 right-3"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* 操作區域 */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleCancelFriendRequest(request.id)}
                        disabled={loading}
                        className="px-4 py-2 bg-white hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-lg text-sm border border-gray-200 hover:border-red-200 flex items-center gap-2 shadow-sm transition-all duration-200 hover:shadow transform hover:-translate-y-0.5 min-w-[120px]"
                      >
                        <i className="fas fa-times"></i>
                        <span>取消請求</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 px-6 bg-gradient-to-br from-[#F9F6FF] to-white rounded-xl border border-[#E8DFFC] shadow-sm overflow-hidden relative">
              {/* 裝飾背景 */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-l from-[#F0E8FF] to-transparent opacity-60 rounded-full transform -translate-y-1/3 translate-x-1/3"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-r from-[#F0E8FF] to-transparent opacity-60 rounded-full transform translate-y-1/3 -translate-x-1/3"></div>
              
              {/* 內容容器 */}
              <div className="relative z-10 flex flex-col items-center max-w-lg mx-auto">
                {/* 圖標 */}
                <div className="mb-10 relative">
                  <div className="absolute -inset-10 bg-white/50 rounded-full filter blur-xl"></div>
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#A487C3]/20 to-[#A487C3]/10 animate-pulse"></div>
                    <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-[#A487C3]/30 to-[#A487C3]/10 opacity-70"></div>
                    <div className="relative w-24 h-24 rounded-full bg-white shadow-xl flex items-center justify-center border-4 border-white">
                      <div className="text-[#A487C3] transform transition-transform">
                        <i className="fas fa-paper-plane text-5xl"></i>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 標題與描述 */}
                <h3 className="text-center text-2xl font-bold text-[#7D5BA6] mb-4">尚無發送中的好友請求</h3>
                <p className="text-center text-gray-600 mb-10 max-w-sm">
                  您目前沒有等待確認的好友請求。搜尋新好友或分享您的好友碼來擴展您的社交圈！
                </p>

                {/* 按鈕區域 */}
                <div className="w-full flex flex-col items-center space-y-4 mb-10">
                  <button
                    onClick={() => setActiveTab('search')}
                    className="w-full max-w-xs px-6 py-4 bg-gradient-to-r from-[#A487C3] to-[#8A5DC8] text-white text-base rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center font-medium group relative overflow-hidden"
                  >
                    <span className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></span>
                    <i className="fas fa-search mr-3 text-lg"></i>
                    <span>搜尋好友</span>
                  </button>
                  
                  <div className="text-[#A487C3] font-medium py-2">或者</div>
                  
                  {/* 好友碼卡片 */}
                  <div className="w-full max-w-xs bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden">
                    <div className="px-4 py-3 bg-[#F9F6FF] border-b border-[#E8DFFC]">
                      <h4 className="font-medium text-[#7D5BA6] flex items-center">
                        <i className="fas fa-share-alt mr-2"></i>
                        分享您的好友碼
                      </h4>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-[#F0E8FF] flex items-center justify-center text-[#A487C3]">
                          <i className="fas fa-id-card"></i>
                        </div>
                        <span className="font-mono font-bold text-xl text-[#A487C3] tracking-wider">{myFriendCode}</span>
                      </div>
                      <button 
                        onClick={copyFriendCode}
                        className="w-10 h-10 bg-[#F0E8FF] hover:bg-[#A487C3] text-[#A487C3] hover:text-white rounded-full flex items-center justify-center transition-colors duration-300"
                      >
                        <i className="fas fa-copy"></i>
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* 提示信息 */}
                <div className="flex items-center text-xs text-gray-500">
                  <i className="fas fa-lightbulb text-yellow-500 mr-2"></i>
                  <span>好友可以使用您的好友碼更快地找到您</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FriendManagement; 