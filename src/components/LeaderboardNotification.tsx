import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

const LeaderboardNotification: React.FC = () => {
  const { currentUser } = useAuth();

  // 檢查排行榜結束並發送通知
  useEffect(() => {
    if (!currentUser) return;

    const checkLeaderboardsEndDate = async () => {
      try {
        // 獲取用戶所在的排行榜
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (!userDoc.exists()) return;
        
        const userData = userDoc.data();
        const userLeaderboardIds = userData.leaderboards || [];
        
        if (userLeaderboardIds.length === 0) return;
        
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        
        // 獲取排行榜詳情
        for (const leaderboardId of userLeaderboardIds) {
          const leaderboardDoc = await getDoc(doc(db, "leaderboards", leaderboardId));
          
          if (leaderboardDoc.exists()) {
            const data = leaderboardDoc.data();
            
            // 處理日期格式
            const endDate = data.endDate instanceof Timestamp 
              ? data.endDate.toDate() 
              : new Date(data.endDate);
            
            // 檢查排行榜是否在前一天結束
            // 將日期轉換為零點進行比較
            const endDateZero = new Date(endDate);
            endDateZero.setHours(0, 0, 0, 0);
            
            const yesterdayZero = new Date(yesterday);
            yesterdayZero.setHours(0, 0, 0, 0);
            
            // 檢查是否有發送過通知
            const notificationsRef = collection(db, "notifications");
            const q = query(
              notificationsRef,
              where("type", "==", "leaderboard_ended"),
              where("leaderboardId", "==", leaderboardId),
              where("toUserId", "==", currentUser.uid)
            );
            
            const notificationsSnapshot = await getDocs(q);
            const hasNotification = !notificationsSnapshot.empty;
            
            if (endDateZero.getTime() === yesterdayZero.getTime() && !hasNotification) {
              // 排行榜昨天結束，且還沒發過通知
              console.log(`排行榜 ${data.name} 已結束，發送通知`);
              
              // 發送通知
              await addDoc(collection(db, "notifications"), {
                type: "leaderboard_ended",
                leaderboardId: leaderboardId,
                leaderboardName: data.name,
                fromUserId: data.createdBy,
                toUserId: currentUser.uid,
                read: false,
                createdAt: serverTimestamp()
              });
              
              // 觸發更新排行榜成員支出數據
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('updateLeaderboardStats', {
                  detail: { leaderboardId }
                }));
              }
            }
          }
        }
      } catch (error) {
        console.error('檢查排行榜結束時間失敗:', error);
      }
    };
    
    // 立即執行一次
    checkLeaderboardsEndDate();
    
    // 每天執行一次
    const dailyCheck = setInterval(checkLeaderboardsEndDate, 24 * 60 * 60 * 1000);
    
    return () => clearInterval(dailyCheck);
  }, [currentUser]);

  // 這個組件不渲染任何內容
  return null;
};

export default LeaderboardNotification; 