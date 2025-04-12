import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  doc 
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * 分帳群組邀請通知組件
 * 該組件會在後台監聽用戶的分帳群組邀請狀態，當有新的邀請時會在界面上顯示通知
 */
const GroupInviteNotification: React.FC = () => {
  const { currentUser } = useAuth();

  useEffect(() => {
    // 如果用戶未登錄，不需要監聽
    if (!currentUser) return;

    console.log('啟動分帳群組邀請監聽');

    // 監聽分帳群組邀請
    const invitesRef = collection(db, 'groupInvites');
    const q = query(
      invitesRef,
      where('inviteeId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );

    // 創建實時監聽
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // 獲取新增的文檔（新的邀請）
      const newInvites = snapshot.docChanges().filter(change => change.type === 'added');
      
      if (newInvites.length > 0) {
        console.log(`檢測到 ${newInvites.length} 個新的分帳群組邀請`);
        
        // 為每個新邀請顯示通知
        newInvites.forEach(change => {
          const invite = change.doc.data();
          
          // 顯示瀏覽器通知（如果支持）
          if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'granted') {
              // 創建通知
              new Notification('新的分帳群組邀請', {
                body: `${invite.inviterName} 邀請您加入分帳群組"${invite.groupName}"`,
                icon: '/favicon.ico'
              });
            } else if (Notification.permission !== 'denied') {
              // 請求通知權限
              Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                  new Notification('新的分帳群組邀請', {
                    body: `${invite.inviterName} 邀請您加入分帳群組"${invite.groupName}"`,
                    icon: '/favicon.ico'
                  });
                }
              });
            }
          }
          
          // 觸發自定義事件，通知應用更新UI
          if (typeof window !== 'undefined') {
            const event = new CustomEvent('newGroupInvite', { 
              detail: { 
                id: change.doc.id,
                groupName: invite.groupName,
                inviterName: invite.inviterName
              } 
            });
            window.dispatchEvent(event);
          }
        });
      }
    }, (error) => {
      console.error('監聽分帳群組邀請出錯:', error);
    });

    // 在組件卸載時取消監聽
    return () => {
      console.log('停止分帳群組邀請監聽');
      unsubscribe();
    };
  }, [currentUser]);

  // 監聽點擊分帳群組邀請通知的事件
  useEffect(() => {
    // 處理顯示分帳群組邀請列表
    const handleShowGroupInvites = () => {
      console.log('觸發顯示分帳群組邀請列表事件');
      
      // 觸發自定義事件，通知App組件顯示邀請列表
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('showGroupInvites'));
      }
    };

    // 添加事件監聽器
    window.addEventListener('showGroupInvites', handleShowGroupInvites);

    // 清理函數
    return () => {
      window.removeEventListener('showGroupInvites', handleShowGroupInvites);
    };
  }, []);

  // 該組件不渲染任何UI元素
  return null;
};

export default GroupInviteNotification; 