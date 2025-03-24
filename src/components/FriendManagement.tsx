import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Friend, FriendRequest } from '../contexts/AuthContext';

interface FriendManagementProps {
  onClose: () => void;
}

const FriendManagement: React.FC<FriendManagementProps> = ({ onClose }) => {
  const { currentUser, searchUsers, sendFriendRequest, getFriends, getFriendRequests, acceptFriendRequest, rejectFriendRequest, removeFriend } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [friendCodeQuery, setFriendCodeQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'search' | 'friends' | 'requests'>('friends');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
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
      setSuccess('好友請求已發送');
      
      // 更新搜索結果，標記已發送請求的用戶
      setSearchResults(prev => 
        prev.map(user => 
          user.id === userId ? { ...user, requestSent: true } : user
        )
      );
      
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
      <div className="bg-white shadow-md border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
          <div className="mb-3 sm:mb-0">
            <h3 className="font-medium text-gray-800 text-lg mb-1">我的好友碼</h3>
            <p className="text-sm text-gray-500">分享此代碼給朋友，他們可以更快地添加你</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="font-mono font-bold text-xl bg-gray-50 p-3 rounded-lg border border-gray-200 text-[#A487C3] tracking-widest letter-spacing-2">{myFriendCode}</span>
            <button 
              onClick={copyFriendCode}
              className="p-3 bg-[#A487C3] hover:bg-[#C6B2DD] text-white rounded-lg w-12 h-12 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white"
              title="複製好友碼"
            >
              <i className="fas fa-copy text-lg"></i>
            </button>
          </div>
        </div>
      </div>
      
      {/* 標籤切換 */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        <button
          className={`py-3 px-5 font-medium text-base whitespace-nowrap ${
            activeTab === 'friends'
              ? 'text-white bg-[#A487C3] rounded-t-lg'
              : 'text-gray-800 bg-gray-100 hover:bg-gray-200'
          } focus:outline-none focus:ring-2 focus:ring-white`}
          onClick={() => setActiveTab('friends')}
        >
          我的好友
        </button>
        <button
          className={`py-3 px-5 font-medium text-base whitespace-nowrap ${
            activeTab === 'search'
              ? 'text-white bg-[#A487C3] rounded-t-lg'
              : 'text-gray-800 bg-gray-100 hover:bg-gray-200'
          } focus:outline-none focus:ring-2 focus:ring-white`}
          onClick={() => setActiveTab('search')}
        >
          搜尋新好友
        </button>
        <button
          className={`py-3 px-5 font-medium text-base whitespace-nowrap flex items-center ${
            activeTab === 'requests'
              ? 'text-white bg-[#A487C3] rounded-t-lg'
              : 'text-gray-800 bg-gray-100 hover:bg-gray-200'
          } focus:outline-none focus:ring-2 focus:ring-white`}
          onClick={() => setActiveTab('requests')}
        >
          好友請求
          {friendRequests.length > 0 && (
            <span className="ml-2 bg-white text-[#A487C3] rounded-full text-xs w-5 h-5 flex items-center justify-center font-bold border border-[#A487C3]">
              {friendRequests.length}
            </span>
          )}
        </button>
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
            <div className="space-y-2">
              {friends.map(friend => (
                <div 
                  key={friend.id}
                  className="flex flex-wrap sm:flex-nowrap items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center gap-3 w-full sm:w-auto mb-2 sm:mb-0">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 uppercase">
                      {friend.photoURL ? (
                        <img src={friend.photoURL} alt={friend.nickname} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        friend.nickname.charAt(0)
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{friend.nickname}</p>
                      <p className="text-xs text-gray-500">{friend.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFriend(friend.id)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center justify-center w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-white"
                  >
                    <i className="fas fa-user-times mr-1"></i> 移除好友
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
                className="mt-3 px-4 py-2 bg-[#A487C3] hover:bg-[#C6B2DD] text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white"
              >
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
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-4 mb-4">
            <h4 className="font-medium text-sm mb-2">用好友碼搜尋</h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="text"
                value={friendCodeQuery}
                onChange={(e) => setFriendCodeQuery(e.target.value.toUpperCase())}
                placeholder="輸入6位好友碼"
                maxLength={6}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-white font-mono text-center uppercase tracking-widest text-lg"
              />
              <button 
                onClick={handleFriendCodeSearch}
                disabled={isSearching}
                className="px-4 py-2 bg-[#A487C3] hover:bg-[#C6B2DD] text-white rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white"
              >
                {isSearching ? '搜尋中...' : '搜尋'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              <i className="fas fa-info-circle mr-1"></i>
              提示：好友碼不分大小寫，如找不到用戶，可能是因為該用戶尚未啟用好友碼或好友碼輸入錯誤
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
                    <span className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg inline-block w-full sm:w-auto text-center">
                      已是好友
                    </span>
                  ) : user.requestSent ? (
                    <span className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg inline-block w-full sm:w-auto text-center">
                      已發送請求
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSendFriendRequest(user.id)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-[#A487C3] hover:bg-[#C6B2DD] text-white rounded-lg text-sm disabled:opacity-50 w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-white"
                    >
                      {loading ? '處理中...' : '加為好友'}
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
          <h3 className="font-medium mb-3">好友請求</h3>
          
          {loading ? (
            <div className="text-center py-4">
              <p className="text-gray-500">載入中...</p>
            </div>
          ) : friendRequests.length > 0 ? (
            <div className="space-y-2">
              {friendRequests.map(request => (
                <div 
                  key={request.id}
                  className="p-3 bg-white border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 uppercase">
                      {request.from.photoURL ? (
                        <img src={request.from.photoURL} alt={request.from.nickname} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        request.from.nickname.charAt(0)
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{request.from.nickname}</p>
                      <p className="text-xs text-gray-500">{request.from.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => handleAcceptFriendRequest(request.id)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-[#A487C3] hover:bg-[#C6B2DD] text-white rounded-lg text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white"
                    >
                      接受
                    </button>
                    <button
                      onClick={() => handleRejectFriendRequest(request.id)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white"
                    >
                      拒絕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 bg-gray-50 rounded-lg">
              <p className="text-gray-500">沒有待處理的好友請求</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FriendManagement; 