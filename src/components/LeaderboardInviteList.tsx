import React, { useState, useEffect } from 'react';
import { useAuth, LeaderboardInvite } from '../contexts/AuthContext';
import { Timestamp } from 'firebase/firestore';

interface LeaderboardInviteListProps {
  onClose: () => void;
}

const LeaderboardInviteList: React.FC<LeaderboardInviteListProps> = ({ onClose }) => {
  const { getLeaderboardInvites, acceptLeaderboardInvite, rejectLeaderboardInvite } = useAuth();
  const [invites, setInvites] = useState<LeaderboardInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // 用於追蹤正在處理中的邀請
  const [processingInvites, setProcessingInvites] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadInvites();
  }, []);

  const loadInvites = async () => {
    try {
      setLoading(true);
      setError(null);
      const invitesList = await getLeaderboardInvites();
      setInvites(invitesList);
    } catch (err) {
      console.error('獲取排行榜邀請失敗:', err);
      setError('獲取排行榜邀請時出錯，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string, leaderboardName: string) => {
    try {
      // 標記此邀請為處理中
      setProcessingInvites(prev => ({ ...prev, [inviteId]: true }));
      
      // 清除之前的成功訊息
      setSuccessMessage(null);
      setError(null);
      
      // 接受邀請
      await acceptLeaderboardInvite(inviteId);
      
      // 更新邀請列表
      setInvites(prev => prev.filter(invite => invite.id !== inviteId));
      setSuccessMessage(`已成功接受加入"${leaderboardName}"排行榜`);
    } catch (err) {
      console.error('接受排行榜邀請失敗:', err);
      setError('接受邀請時出錯，請稍後再試');
    } finally {
      // 移除處理中標記
      setProcessingInvites(prev => {
        const newState = { ...prev };
        delete newState[inviteId];
        return newState;
      });
    }
  };

  const handleRejectInvite = async (inviteId: string, leaderboardName: string) => {
    try {
      // 標記此邀請為處理中
      setProcessingInvites(prev => ({ ...prev, [inviteId]: true }));
      
      // 清除之前的成功訊息
      setSuccessMessage(null);
      setError(null);
      
      // 拒絕邀請
      await rejectLeaderboardInvite(inviteId);
      
      // 更新邀請列表
      setInvites(prev => prev.filter(invite => invite.id !== inviteId));
      setSuccessMessage(`已拒絕加入"${leaderboardName}"排行榜`);
    } catch (err) {
      console.error('拒絕排行榜邀請失敗:', err);
      setError('拒絕邀請時出錯，請稍後再試');
    } finally {
      // 移除處理中標記
      setProcessingInvites(prev => {
        const newState = { ...prev };
        delete newState[inviteId];
        return newState;
      });
    }
  };

  const formatDate = (timestamp: Date) => {
    return `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}`;
  };

  // 格式化時間為相對時間（如：3天前、2小時前）
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 0) {
      return `${diffDay}天前`;
    } else if (diffHour > 0) {
      return `${diffHour}小時前`;
    } else if (diffMin > 0) {
      return `${diffMin}分鐘前`;
    } else {
      return '剛剛';
    }
  };

  // 處理返回排行榜管理的事件
  const handleReturnToLeaderboardManager = () => {
    try {
      console.log("排行榜邀請頁面 - 返回排行榜管理");
      
      // 通知應用需要顯示排行榜管理
      if (typeof window !== 'undefined') {
        // 嘗試使用全局變量保存狀態
        console.log("設置全局變量 window.__shouldShowLeaderboardManager = true");
        (window as any).__shouldShowLeaderboardManager = true;
        
        // 觸發自定義事件 - 確保使用明確的名稱
        console.log("觸發 returnToLeaderboardManager 事件");
        const returnEvent = new CustomEvent('returnToLeaderboardManager', {
          detail: { timestamp: new Date().getTime() }
        });
        window.dispatchEvent(returnEvent);
        
        // 觸發原來的事件保持兼容
        console.log("觸發 openLeaderboardManager 事件");
        const openEvent = new CustomEvent('openLeaderboardManager', {
          detail: { timestamp: new Date().getTime() }
        });
        window.dispatchEvent(openEvent);
      }
      
      // 嘗試調用全局回調函數
      if (typeof window !== 'undefined' && 
          (window as any).openLeaderboardManagerCallback && 
          typeof (window as any).openLeaderboardManagerCallback === 'function') {
        console.log("直接調用全局回調函數 openLeaderboardManagerCallback");
        (window as any).openLeaderboardManagerCallback();
      }
      
      // 延遲一點關閉當前組件，確保事件有時間被處理
      setTimeout(() => {
        onClose();
      }, 100);
    } catch (error) {
      console.error("返回排行榜管理時出錯:", error);
      onClose();
    }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <button 
            onClick={handleReturnToLeaderboardManager}
            className="mr-3 p-2 text-[#A487C3] hover:text-white bg-white hover:bg-[#A487C3] rounded-lg transition-all duration-300 shadow-sm hover:shadow-md"
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <h2 className="text-xl font-bold">排行榜邀請</h2>
        </div>
        <button 
          onClick={onClose}
          className="text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-lg">
          <div className="flex items-center">
            <i className="fas fa-exclamation-circle mr-2"></i>
            <span>{error}</span>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 bg-green-50 text-green-700 p-3 rounded-lg">
          <div className="flex items-center">
            <i className="fas fa-check-circle mr-2"></i>
            <span>{successMessage}</span>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-elora-purple"></div>
          <p className="mt-2 text-gray-500">載入中...</p>
        </div>
      )}

      {!loading && invites.length === 0 && (
        <div className="text-center py-8">
          <i className="fas fa-inbox text-gray-300 text-4xl mb-2"></i>
          <p className="text-gray-500">您目前沒有任何排行榜邀請</p>
        </div>
      )}
      
      {!loading && invites.length > 0 && (
        <div className="space-y-4">
          {invites.map(invite => (
            <div 
              key={invite.id} 
              className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-[#A487C3] rounded-full flex items-center justify-center text-white flex-shrink-0">
                  {invite.from.photoURL ? (
                    <img src={invite.from.photoURL} alt={invite.from.nickname} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <i className="fas fa-trophy"></i>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-800 text-lg mb-0.5">{invite.leaderboardName}</h3>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <span>{invite.from.nickname || '未知用戶'}</span>
                    <span className="text-gray-300">•</span>
                    <span className="text-xs">{formatRelativeTime(invite.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1.5">邀請您加入他們的排行榜</p>
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => handleRejectInvite(invite.id, invite.leaderboardName)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                  disabled={!!processingInvites[invite.id]}
                >
                  {processingInvites[invite.id] ? (
                    <span>處理中...</span>
                  ) : (
                    <span>拒絕</span>
                  )}
                </button>
                <button 
                  onClick={() => handleAcceptInvite(invite.id, invite.leaderboardName)}
                  className="px-4 py-2 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!!processingInvites[invite.id]}
                >
                  {processingInvites[invite.id] ? (
                    <span>處理中...</span>
                  ) : (
                    <span>接受</span>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LeaderboardInviteList; 