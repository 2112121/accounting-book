import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  getDoc, 
  arrayUnion, 
  deleteDoc, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';

interface GroupInviteListProps {
  onClose: () => void;
}

// 分帳群組邀請類型定義
interface GroupInvite {
  id: string;
  groupId: string;
  groupName: string;
  inviterId: string;
  inviterName: string;
  inviteeId: string;
  inviteeName: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

const GroupInviteList: React.FC<GroupInviteListProps> = ({ onClose }) => {
  const { currentUser } = useAuth();
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // 用於追蹤正在處理中的邀請
  const [processingInvites, setProcessingInvites] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadInvites();
  }, []);

  const loadInvites = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // 查詢當前用戶的所有待處理分帳群組邀請
      const invitesRef = collection(db, 'groupInvites');
      const q = query(
        invitesRef,
        where('inviteeId', '==', currentUser.uid),
        where('status', '==', 'pending')
      );
      
      const querySnapshot = await getDocs(q);
      const invitesList: GroupInvite[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // 轉換時間戳為日期對象
        const createdAt = data.createdAt && typeof data.createdAt.toDate === 'function' 
          ? data.createdAt.toDate() 
          : new Date();
          
        invitesList.push({
          id: doc.id,
          groupId: data.groupId,
          groupName: data.groupName,
          inviterId: data.inviterId,
          inviterName: data.inviterName,
          inviteeId: data.inviteeId,
          inviteeName: data.inviteeName,
          status: data.status,
          createdAt
        });
      });
      
      setInvites(invitesList);
    } catch (err) {
      console.error('獲取分帳群組邀請失敗:', err);
      setError('獲取邀請時出錯，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string, groupId: string, groupName: string) => {
    if (!currentUser) return;
    
    try {
      setProcessingInvites(prev => ({ ...prev, [inviteId]: true }));
      setSuccessMessage(null);
      setError(null);
      
      console.log('開始處理接受邀請:', { inviteId, groupId, groupName });
      
      // 獲取邀請文檔
      const inviteRef = doc(db, 'groupInvites', inviteId);
      const inviteDoc = await getDoc(inviteRef);
      
      if (!inviteDoc.exists()) {
        throw new Error('邀請不存在');
      }
      
      const inviteData = inviteDoc.data();
      console.log('邀請數據:', inviteData);
      
      // 獲取群組文檔
      const groupRef = doc(db, 'expenseGroups', groupId);
      const groupDoc = await getDoc(groupRef);
      
      if (!groupDoc.exists()) {
        throw new Error('分帳群組不存在');
      }
      
      const groupData = groupDoc.data();
      console.log('群組數據:', groupData);
      
      // 獲取當前用戶資料
      const userRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('用戶資料不存在');
      }
      
      const userData = userDoc.data();
      console.log('用戶數據:', userData);
      
      // 創建新成員對象
      const newMember = {
        userId: currentUser.uid,
        nickname: userData.nickname || currentUser.displayName || currentUser.email?.split('@')[0] || '未命名用戶',
        email: currentUser.email || '',
        photoURL: userData.photoURL || currentUser.photoURL || '',
        joinedAt: Timestamp.now()
      };
      
      console.log('新成員對象:', newMember);
      
      // 檢查用戶是否已經是群組成員
      if (groupData.memberIds && groupData.memberIds.includes(currentUser.uid)) {
        throw new Error('您已經是該群組的成員');
      }
      
      // 更新群組成員
      const updateData = {
        members: arrayUnion(newMember),
        memberIds: arrayUnion(currentUser.uid),
        updatedAt: serverTimestamp()
      };
      
      console.log('更新群組數據:', updateData);
      await updateDoc(groupRef, updateData);
      
      // 更新邀請狀態
      await updateDoc(inviteRef, {
        status: 'accepted',
        acceptedAt: serverTimestamp()
      });
      
      setInvites(prev => prev.filter(invite => invite.id !== inviteId));
      setSuccessMessage(`已成功加入「${groupName}」分帳群組`);
      
      console.log('成功接受邀請');
    } catch (err: any) {
      console.error('接受分帳群組邀請失敗:', err);
      setError(err.message || '接受邀請時出錯，請稍後再試');
    } finally {
      setProcessingInvites(prev => {
        const newState = { ...prev };
        delete newState[inviteId];
        return newState;
      });
    }
  };

  const handleRejectInvite = async (inviteId: string, groupName: string) => {
    try {
      // 標記此邀請為處理中
      setProcessingInvites(prev => ({ ...prev, [inviteId]: true }));
      
      // 清除之前的成功消息
      setSuccessMessage(null);
      setError(null);
      
      // 獲取邀請文檔
      const inviteRef = doc(db, 'groupInvites', inviteId);
      const inviteDoc = await getDoc(inviteRef);
      
      if (!inviteDoc.exists()) {
        throw new Error('邀請不存在');
      }
      
      // 更新邀請狀態
      await updateDoc(inviteRef, {
        status: 'rejected'
      });
      
      // 更新邀請列表
      setInvites(prev => prev.filter(invite => invite.id !== inviteId));
      setSuccessMessage(`已拒絕加入「${groupName}」分帳群組`);
    } catch (err) {
      console.error('拒絕分帳群組邀請失敗:', err);
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

  // 格式化相對時間（如：3天前、2小時前）
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
  
  // 返回到上一頁
  const handleGoBack = () => {
    onClose();
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <button 
            onClick={handleGoBack}
            className="mr-3 p-2 text-[#A487C3] hover:text-[#8A5DC8] bg-white hover:bg-[#F8F3FF] rounded-lg transition-all duration-300 shadow-sm hover:shadow-md"
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#8A5DC8] to-[#A487C3]">
            分帳群組邀請
          </h2>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-lg border border-red-100 animate-fadeIn">
          <div className="flex items-center">
            <i className="fas fa-exclamation-circle mr-2"></i>
            <span>{error}</span>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 bg-green-50 text-green-700 p-3 rounded-lg border border-green-100 animate-fadeIn">
          <div className="flex items-center">
            <i className="fas fa-check-circle mr-2"></i>
            <span>{successMessage}</span>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-100">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#A487C3]"></div>
          <p className="mt-4 text-gray-500 font-medium">載入中...</p>
        </div>
      )}

      {!loading && invites.length === 0 && (
        <div className="text-center py-16 bg-white rounded-lg shadow-sm border border-gray-100">
          <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center text-gray-300 mb-4">
            <i className="fas fa-envelope-open-text text-3xl"></i>
          </div>
          <h3 className="text-lg font-medium text-gray-700 mb-2">目前沒有群組邀請</h3>
          <p className="text-gray-500 max-w-md mx-auto">您目前沒有任何待處理的分帳群組邀請，邀請會顯示在這裡</p>
        </div>
      )}
      
      {!loading && invites.length > 0 && (
        <div className="space-y-4">
          {invites.map(invite => (
            <div 
              key={invite.id} 
              className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-all duration-300 hover:border-[#E0D5F0]"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 bg-[#F0EAFA] rounded-full flex items-center justify-center text-[#8A5DC8] flex-shrink-0">
                  <i className="fas fa-users text-lg"></i>
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-800 text-lg mb-1">{invite.groupName}</h3>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <span className="flex items-center">
                      <i className="fas fa-user-circle mr-1 text-[#A487C3]"></i>
                      {invite.inviterName || '未知用戶'}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="text-xs flex items-center">
                      <i className="far fa-clock mr-1"></i>
                      {formatRelativeTime(invite.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-2 flex items-center">
                    <i className="fas fa-envelope mr-2 text-[#A487C3]"></i>
                    邀請您加入此分帳群組
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => handleRejectInvite(invite.id, invite.groupName)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  disabled={!!processingInvites[invite.id]}
                >
                  {processingInvites[invite.id] ? (
                    <span className="flex items-center">
                      <div className="w-4 h-4 border-t-2 border-b-2 border-gray-500 rounded-full animate-spin mr-2"></div>
                      處理中...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <i className="fas fa-times-circle mr-1.5"></i>
                      拒絕
                    </span>
                  )}
                </button>
                <button 
                  onClick={() => handleAcceptInvite(invite.id, invite.groupId, invite.groupName)}
                  className="px-4 py-2 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center shadow-sm hover:shadow"
                  disabled={!!processingInvites[invite.id]}
                >
                  {processingInvites[invite.id] ? (
                    <span className="flex items-center">
                      <div className="w-4 h-4 border-t-2 border-b-2 border-white rounded-full animate-spin mr-2"></div>
                      處理中...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <i className="fas fa-check-circle mr-1.5"></i>
                      接受
                    </span>
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

export default GroupInviteList; 