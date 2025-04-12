import React, { useState, useEffect } from "react";
import {
  useAuth,
  Leaderboard,
  LeaderboardMember,
} from "../contexts/AuthContext";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// 支出類型定義，與 App.tsx 中保持一致
interface Expense {
  id: string;
  amount: number;
  category:
    | {
        id: string;
        name: string;
        icon: string;
      }
    | string; // 兼容兩種可能的格式
  date: Date;
  notes: string;
  userId: string;
}

interface MemberExpenses {
  [userId: string]: Expense[];
}

interface LeaderboardViewerProps {
  onClose: () => void;
}

const LeaderboardViewer: React.FC<LeaderboardViewerProps> = ({ onClose }) => {
  const {
    currentUser,
    updateLeaderboardMemberExpenses,
    getLeaderboardInvites,
  } = useAuth();
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);
  const [selectedLeaderboard, setSelectedLeaderboard] =
    useState<Leaderboard | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [memberExpenses, setMemberExpenses] = useState<MemberExpenses>({});
  const [completedLeaderboards, setCompletedLeaderboards] = useState<
    Leaderboard[]
  >([]);
  const [activeLeaderboards, setActiveLeaderboards] = useState<Leaderboard[]>(
    [],
  );
  const [loadingMemberIds, setLoadingMemberIds] = useState<string[]>([]);
  const [inviteCount, setInviteCount] = useState(0);

  // 監聽來自排行榜管理頁面的顯示事件
  useEffect(() => {
    const handleShowLeaderboardViewer = () => {
      console.log("排行榜瀏覽頁面顯示事件被觸發");
      // 重新加載排行榜數據
      if (currentUser) {
        // 重置狀態，觸發重新加載
        setLoading(true);
        setError("");
        // 返回到排行榜列表視圖
        setSelectedLeaderboard(null);
        setMemberExpenses({});
      }
    };

    // 添加事件監聽器
    window.addEventListener(
      "showLeaderboardViewer",
      handleShowLeaderboardViewer,
    );

    // 清理函數
    return () => {
      window.removeEventListener(
        "showLeaderboardViewer",
        handleShowLeaderboardViewer,
      );
    };
  }, [currentUser]);

  // 加載排行榜邀請數量
  useEffect(() => {
    const loadInvites = async () => {
      if (!currentUser) return;

      try {
        const invites = await getLeaderboardInvites();
        setInviteCount(invites.length);
      } catch (error) {
        console.error("獲取排行榜邀請失敗:", error);
      }
    };

    loadInvites();
  }, [currentUser, getLeaderboardInvites]);

  // 格式化日期
  const formatDate = (date: Date | undefined): string => {
    if (!date) return "無日期";

    // 處理 Firebase Timestamp
    const jsDate = date instanceof Timestamp ? date.toDate() : date;

    return jsDate.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // 加載排行榜列表
  useEffect(() => {
    if (!currentUser) return;

    const loadLeaderboards = async () => {
      setLoading(true);
      setError("");

      try {
        // 獲取用戶所在的排行榜
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (!userDoc.exists()) {
          setError("未找到用戶資料");
          setLoading(false);
          return;
        }

        const userData = userDoc.data();
        const userLeaderboardIds = userData.leaderboards || [];

        if (userLeaderboardIds.length === 0) {
          setLoading(false);
          return;
        }

        // 獲取排行榜詳情
        const leaderboardsData: Leaderboard[] = [];
        
        console.log(`開始加載用戶 ${currentUser.uid} (${userData.nickname || '未知用戶'}) 的 ${userLeaderboardIds.length} 個排行榜`);
        console.log(`當前時間: ${new Date().toLocaleString()}`);

        for (const leaderboardId of userLeaderboardIds) {
          console.log(`加載排行榜 ${leaderboardId} 的詳情`);
          const leaderboardDoc = await getDoc(
            doc(db, "leaderboards", leaderboardId),
          );

          if (leaderboardDoc.exists()) {
            const data = leaderboardDoc.data();

            // 處理日期格式
            const startDate =
              data.startDate instanceof Timestamp
                ? data.startDate.toDate()
                : new Date(data.startDate);

            const endDate =
              data.endDate instanceof Timestamp
                ? data.endDate.toDate()
                : new Date(data.endDate);

            const createdAt =
              data.createdAt instanceof Timestamp
                ? data.createdAt.toDate()
                : new Date(data.createdAt);

            const leaderboard: Leaderboard = {
              id: leaderboardDoc.id,
              name: data.name,
              createdBy: data.createdBy,
              members: data.members || [],
              createdAt: createdAt,
              timeRange: data.timeRange,
              startDate: startDate,
              endDate: endDate,
            };

            leaderboardsData.push(leaderboard);
            
            // 檢查是否是進行中的排行榜
            const now = new Date();
            const isOngoing = now >= startDate && now <= endDate;
            
            if (isOngoing) {
              console.log(`排行榜 ${leaderboard.name} (ID: ${leaderboard.id}) 正在進行中，執行數據同步`);
              console.log(`排行榜週期: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`);
              console.log(`當前時間: ${now.toLocaleString()}`);
              
              // 記錄同步前的支出金額
              console.log("同步前排行榜成員支出金額:");
              data.members.forEach((member: any) => {
                console.log(`${member.nickname || member.userId}: ${member.totalExpense}`);
              });
              
              // 同步進行中的排行榜數據
              if (typeof updateLeaderboardMemberExpenses === "function") {
                try {
                  console.log(`開始同步進行中的排行榜: ${leaderboard.name}`);
                  await updateLeaderboardMemberExpenses(leaderboard);
                  
                  // 同步後重新獲取最新排行榜數據
                  const updatedDoc = await getDoc(doc(db, "leaderboards", leaderboardId));
                  if (updatedDoc.exists()) {
                    const updatedData = updatedDoc.data();
                    
                    // 更新當前排行榜的成員數據
                    leaderboard.members = updatedData.members || [];
                    
                    // 記錄同步後的支出金額
                    console.log("同步後排行榜成員支出金額:");
                    updatedData.members.forEach((member: any) => {
                      console.log(`${member.nickname || member.userId}: ${member.totalExpense}`);
                    });
                  }
                  
                  console.log(`進行中排行榜 ${leaderboard.name} 數據同步完成`);
                } catch (error) {
                  console.error(`同步排行榜 ${leaderboard.name} 數據失敗:`, error);
                }
              } else {
                console.warn(`updateLeaderboardMemberExpenses 函數不可用，無法同步數據`);
              }
            } else {
              console.log(`排行榜 ${leaderboard.name} ${now < startDate ? '尚未開始' : '已結束'}, 不需要同步數據`);
            }
          } else {
            console.warn(`未找到排行榜 ${leaderboardId} 的詳情`);
          }
        }

        // 分類排行榜：已結束和進行中
        const now = new Date();
        const completed = leaderboardsData.filter(
          (lb) => new Date(lb.endDate) < now,
        );
        const active = leaderboardsData.filter(
          (lb) => new Date(lb.endDate) >= now,
        );

        // 按結束日期排序
        completed.sort(
          (a, b) =>
            new Date(b.endDate).getTime() - new Date(a.endDate).getTime(),
        );
        active.sort(
          (a, b) =>
            new Date(a.endDate).getTime() - new Date(b.endDate).getTime(),
        );

        console.log(`排行榜加載完成: ${active.length} 個進行中, ${completed.length} 個已結束`);
        
        setCompletedLeaderboards(completed);
        setActiveLeaderboards(active);
        setLeaderboards(leaderboardsData);
      } catch (error) {
        console.error("加載排行榜失敗:", error);
        setError("加載排行榜時出錯，請稍後再試");
      } finally {
        setLoading(false);
      }
    };

    loadLeaderboards();
  }, [currentUser, updateLeaderboardMemberExpenses]);

  // 檢查排行榜是否已結束
  const isLeaderboardCompleted = (leaderboard: Leaderboard): boolean => {
    const now = new Date();
    return new Date(leaderboard.endDate) < now;
  };

  // 強制重新同步當前排行榜數據
  useEffect(() => {
    if (selectedLeaderboard && isLeaderboardCompleted(selectedLeaderboard)) {
      console.log("檢測到已結束排行榜，強制同步數據:", selectedLeaderboard.name);
      // 立即同步數據，但需要防止無限循環
      const shouldSync = !selectedLeaderboard.members.some(
        (member) => member.totalExpense > 0 && member.expenseIds && member.expenseIds.length > 0
      );
      
      if (shouldSync) {
        console.log("需要同步數據:", selectedLeaderboard.name);
        if (typeof updateLeaderboardMemberExpenses === "function") {
          (async () => {
            try {
              setLoading(true);
              await updateLeaderboardMemberExpenses(selectedLeaderboard);
              console.log("已結束排行榜數據同步完成");
            } catch (error) {
              console.error("同步排行榜數據失敗:", error);
            } finally {
              setLoading(false);
            }
          })();
        }
      }
    }
  }, [selectedLeaderboard]);

  // 加載成員支出詳情
  const loadMemberExpenses = async (
    userId: string,
    allowViewDetail: boolean,
    startDate: Date,
    endDate: Date,
  ) => {
    console.log(`開始加載用戶 ${userId} 的支出詳情, 允許查看詳情: ${allowViewDetail}`);
    console.log(`時間範圍: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`);
    
    if (!allowViewDetail) {
      console.log(`用戶 ${userId} 的詳情權限已關閉，返回空數組`);
      return [];
    }

    // 首先查找這個用戶在當前選中的排行榜中的成員信息
    const member = selectedLeaderboard?.members.find(m => m.userId === userId);
    console.log(`找到用戶 ${userId} 的成員信息:`, member);

    if (member && member.totalExpense > 0) {
      // 檢查是否存在支出記錄ID或摘要
      if (member.expenseIds && member.expenseIds.length > 0) {
        console.log(
          `從排行榜成員數據中找到 ${member.expenseIds.length} 條支出記錄ID，直接獲取這些記錄`
        );

        const expenses: Expense[] = [];
        // 直接通過ID獲取支出記錄
        for (const expenseId of member.expenseIds) {
          try {
            const expenseDoc = await getDoc(doc(db, "expenses", expenseId));
            if (expenseDoc.exists()) {
              const data = expenseDoc.data();
              const expenseDate =
                data.date instanceof Timestamp
                  ? data.date.toDate()
                  : new Date(data.date);

              expenses.push({
                id: expenseDoc.id,
                amount: data.amount,
                category: data.category,
                date: expenseDate,
                notes: data.notes || "",
                userId: data.userId,
              });

              console.log(
                `獲取支出記錄: ${data.amount}, 日期: ${expenseDate.toLocaleDateString()}, ID: ${expenseDoc.id}`
              );
            }
          } catch (err) {
            console.warn(`獲取支出記錄 ${expenseId} 失敗:`, err);
          }
        }

        if (expenses.length > 0) {
          console.log(`成功通過ID直接獲取 ${expenses.length} 條支出記錄`);
          // 按日期降序排序，最新的支出排在前面
          return expenses.sort(
            (a, b) => b.date.getTime() - a.date.getTime()
          );
        } else {
          console.log(`通過ID未獲取到任何支出記錄，將嘗試進行完整查詢`);
        }
      } else if (member.expenseSummaries && member.expenseSummaries.length > 0) {
        // 如果有摘要數據但沒有ID，嘗試使用摘要數據構建支出記錄
        console.log(
          `從排行榜成員數據中找到 ${member.expenseSummaries.length} 條支出摘要，使用這些數據`
        );
        
        const expenses: Expense[] = [];
        
        for (const summary of member.expenseSummaries) {
          try {
            // 從摘要數據構建支出對象
            const expenseDate = summary.date instanceof Timestamp
              ? summary.date.toDate()
              : summary.date && typeof summary.date.toDate === 'function'
                ? summary.date.toDate()
                : new Date();
                
            expenses.push({
              id: summary.id,
              amount: summary.amount,
              category: summary.category,
              date: expenseDate,
              notes: "",
              userId: userId,
            });
            
            console.log(
              `從摘要構建支出記錄: ${summary.amount}, 日期: ${expenseDate.toLocaleDateString()}, ID: ${summary.id}`
            );
          } catch (err) {
            console.warn(`處理支出摘要數據失敗:`, err);
          }
        }
        
        if (expenses.length > 0) {
          console.log(`成功從摘要數據構建 ${expenses.length} 條支出記錄`);
          // 按日期降序排序
          return expenses.sort(
            (a, b) => b.date.getTime() - a.date.getTime()
          );
        }
      }
    }

    // 如果沒有預存的支出記錄或摘要，或者無法通過ID直接獲取，嘗試同步數據
    if (selectedLeaderboard && typeof updateLeaderboardMemberExpenses === "function") {
      try {
        console.log(`嘗試同步排行榜數據以獲取用戶 ${userId} 的支出記錄`);
        
        // 同步排行榜數據
        await updateLeaderboardMemberExpenses(selectedLeaderboard);
        
        // 獲取更新後的排行榜
        const leaderboardRef = doc(db, "leaderboards", selectedLeaderboard.id);
        const leaderboardDoc = await getDoc(leaderboardRef);
        
        if (leaderboardDoc.exists()) {
          const data = leaderboardDoc.data();
          const updatedMember = data.members.find((m: any) => m.userId === userId);
          
          if (updatedMember && updatedMember.expenseIds && updatedMember.expenseIds.length > 0) {
            console.log(`同步後找到 ${updatedMember.expenseIds.length} 條支出記錄ID`);
              
            const expenses: Expense[] = [];
            for (const expenseId of updatedMember.expenseIds) {
              try {
                const expenseDoc = await getDoc(doc(db, "expenses", expenseId));
                if (expenseDoc.exists()) {
                  const data = expenseDoc.data();
                  const expenseDate = data.date instanceof Timestamp
                    ? data.date.toDate()
                    : new Date(data.date);

                  expenses.push({
                    id: expenseDoc.id,
                    amount: data.amount,
                    category: data.category,
                    date: expenseDate,
                    notes: data.notes || "",
                    userId: data.userId,
                  });
                }
              } catch (err) {
                console.warn(`獲取支出記錄 ${expenseId} 失敗:`, err);
              }
            }
              
            if (expenses.length > 0) {
              console.log(`同步後成功獲取 ${expenses.length} 條支出記錄`);
              return expenses.sort((a, b) => b.date.getTime() - a.date.getTime());
            }
          } else if (updatedMember && updatedMember.expenseSummaries && updatedMember.expenseSummaries.length > 0) {
            // 使用支出摘要數據
            console.log(`同步後找到 ${updatedMember.expenseSummaries.length} 條支出摘要`);
            
            const expenses: Expense[] = [];
            
            for (const summary of updatedMember.expenseSummaries) {
              try {
                // 從摘要數據構建支出對象
                const expenseDate = summary.date instanceof Timestamp
                  ? summary.date.toDate()
                  : summary.date && typeof summary.date.toDate === 'function'
                    ? summary.date.toDate()
                    : new Date();
                    
                expenses.push({
                  id: summary.id,
                  amount: summary.amount,
                  category: summary.category,
                  date: expenseDate,
                  notes: "",
                  userId: userId,
                });
              } catch (err) {
                console.warn(`處理支出摘要數據失敗:`, err);
              }
            }
            
            if (expenses.length > 0) {
              console.log(`同步後成功從摘要數據構建 ${expenses.length} 條支出記錄`);
              // 按日期降序排序
              return expenses.sort(
                (a, b) => b.date.getTime() - a.date.getTime()
              );
            }
          }
        }
      } catch (error) {
        console.error(`同步排行榜數據失敗:`, error);
      }
    }

    // 作為最後手段，使用常規查詢方法
    try {
      console.log(`使用直接查詢方法獲取用戶 ${userId} 的支出`);
      
      const expensesRef = collection(db, "expenses");
      const expenses: Expense[] = [];
      
      // 將日期轉換為 Timestamp 進行查詢
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(
        new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999)
      );
      
      const q = query(
        expensesRef,
        where("userId", "==", userId),
        where("date", ">=", startTimestamp),
        where("date", "<=", endTimestamp)
      );
      
      const querySnapshot = await getDocs(q);
      console.log(`直接查詢: 用戶 ${userId} 在時間範圍內找到 ${querySnapshot.size} 條支出記錄`);
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const expenseDate = data.date instanceof Timestamp
          ? data.date.toDate()
          : new Date(data.date);
          
        expenses.push({
          id: doc.id,
          amount: data.amount,
          category: data.category,
          date: expenseDate,
          notes: data.notes || "",
          userId: data.userId,
        });
      });
      
      console.log(`直接查詢共獲取到 ${expenses.length} 條支出記錄`);
      return expenses.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      console.error(`直接查詢支出失敗:`, error);
      return [];
    }
  };

  // 查看成員詳情
  const handleViewMemberDetails = async (member: LeaderboardMember) => {
    if (!selectedLeaderboard) return;

    try {
      // 獲取允許查看詳情的狀態
      const allowViewDetail = member.allowViewDetail || member.userId === currentUser?.uid;

      console.log(`查看成員 ${member.nickname || member.userId} 詳情, 允許查看: ${allowViewDetail}`);

      if (!allowViewDetail) {
        // 使用更友好的方式通知用戶
        setError("該用戶未開放詳情查看權限");
        setTimeout(() => setError(""), 3000);
        return;
      }

      // 標記該成員為加載中狀態
      setLoadingMemberIds((prev) => [...prev, member.userId]);
      
      // 檢查是否已結束的排行榜
      const isEnded = isLeaderboardCompleted(selectedLeaderboard);
      if (!isEnded) {
        console.log("排行榜尚未結束，不顯示詳情");
        // 使用更友好的方式通知用戶
        setError("排行榜尚未結束，暫不顯示詳情");
        setTimeout(() => setError(""), 3000);
        // 移除加載中狀態
        setLoadingMemberIds((prev) => prev.filter((id) => id !== member.userId));
        return;
      }

      // 加載支出詳情
      try {
        const expenses = await loadMemberExpenses(
          member.userId,
          allowViewDetail,
          selectedLeaderboard.startDate,
          selectedLeaderboard.endDate,
        );

        // 更新狀態，顯示支出詳情
        setMemberExpenses((prev) => ({
          ...prev,
          [member.userId]: expenses,
        }));
        
        console.log(`成功獲取到 ${expenses.length} 條支出記錄`);
        
        // 檢查是否有支出資料但數量為0
        if (expenses.length === 0 && member.totalExpense > 0) {
          console.log(`用戶 ${member.userId} 有支出總額 ${member.totalExpense}，但沒有具體明細，嘗試同步數據`);
          
          // 提示用戶正在同步數據
          setError("正在同步支出詳情數據，請稍候...");
          
          // 嘗試重新同步數據
          if (typeof updateLeaderboardMemberExpenses === "function") {
            try {
              setLoading(true);
              await updateLeaderboardMemberExpenses(selectedLeaderboard);
              
              // 重新嘗試加載支出詳情
              const updatedExpenses = await loadMemberExpenses(
                member.userId,
                allowViewDetail,
                selectedLeaderboard.startDate,
                selectedLeaderboard.endDate,
              );
              
              // 更新狀態
              setMemberExpenses((prev) => ({
                ...prev,
                [member.userId]: updatedExpenses,
              }));
              
              // 清除錯誤提示
              setError("");
              
              console.log(`同步後成功獲取 ${updatedExpenses.length} 條支出記錄`);
              
              // 如果仍然沒有記錄，顯示友好提示
              if (updatedExpenses.length === 0) {
                setError("未找到該用戶在統計週期內的詳細支出記錄");
                setTimeout(() => setError(""), 5000);
              }
            } catch (error) {
              console.error(`同步數據後重新獲取支出詳情失敗:`, error);
              setError("獲取支出詳情失敗，請稍後再試");
              setTimeout(() => setError(""), 3000);
            } finally {
              setLoading(false);
            }
          } else {
            // 如果沒有同步功能，提示用戶
            setError("無法同步支出詳情數據");
            setTimeout(() => setError(""), 3000);
          }
        }
      } catch (error) {
        console.error(`獲取用戶 ${member.userId} 的支出詳情失敗:`, error);
        setError("獲取支出詳情失敗，請稍後再試");
        setTimeout(() => setError(""), 3000);
        
        // 出錯時設置為空數組
        setMemberExpenses((prev) => ({
          ...prev,
          [member.userId]: [],
        }));
      } finally {
        // 無論成功失敗，都移除加載中狀態
        setLoadingMemberIds((prev) => prev.filter((id) => id !== member.userId));
      }
    } catch (error) {
      console.error("處理查看成員詳情失敗:", error);
      setError("處理請求失敗，請稍後再試");
      setTimeout(() => setError(""), 3000);
      // 確保移除加載中狀態
      setLoadingMemberIds((prev) => prev.filter((id) => id !== member.userId));
    }
  };

  // 查看排行榜詳情
  const handleViewLeaderboard = async (leaderboard: Leaderboard) => {
    try {
      // 先设置加载状态和当前选中的排行榜
      setLoading(true);
      setSelectedLeaderboard(leaderboard);
      setMemberExpenses({});
      
      console.log(`開始查看排行榜: ${leaderboard.name}，ID: ${leaderboard.id}`);
      console.log(`排行榜週期: ${leaderboard.startDate.toLocaleDateString()} - ${leaderboard.endDate.toLocaleDateString()}`);
      console.log(`排行榜成員數量: ${leaderboard.members.length}`);
      
      // 先记录当前成员总支出
      console.log("排行榜成員當前支出金額:");
      leaderboard.members.forEach(member => {
        console.log(`${member.nickname || member.userId}: ${member.totalExpense}`);
      });
      
      // 每次查看排行榜時同步一次數據，確保顯示的是最新的消費記錄
      if (typeof updateLeaderboardMemberExpenses === "function") {
        console.log(`同步排行榜數據: ${leaderboard.name}`);
        await updateLeaderboardMemberExpenses(leaderboard);
        console.log(`排行榜數據同步完成: ${leaderboard.name}`);
        
        // 重新獲取更新後的排行榜數據
        const leaderboardRef = doc(db, "leaderboards", leaderboard.id);
        const leaderboardDoc = await getDoc(leaderboardRef);
        
        if (leaderboardDoc.exists()) {
          const data = leaderboardDoc.data();
          
          // 處理日期格式
          const startDate = data.startDate instanceof Timestamp
            ? data.startDate.toDate()
            : new Date(data.startDate);
            
          const endDate = data.endDate instanceof Timestamp
            ? data.endDate.toDate()
            : new Date(data.endDate);
            
          const createdAt = data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date(data.createdAt);
          
          // 更新排行榜數據
          const updatedLeaderboard: Leaderboard = {
            ...leaderboard,
            members: data.members || [],
            startDate,
            endDate,
            createdAt
          };
          
          console.log("排行榜成員更新後支出金額:");
          updatedLeaderboard.members.forEach(member => {
            console.log(`${member.nickname || member.userId}: ${member.totalExpense}`);
          });
          
          // 更新當前選中的排行榜
          setSelectedLeaderboard(updatedLeaderboard);
          
          console.log(`成功更新排行榜數據，UI已更新`);
        } else {
          console.error(`無法獲取更新後的排行榜數據: ${leaderboard.id}`);
          setError("獲取排行榜數據失敗");
          setTimeout(() => setError(""), 3000);
        }
      } else {
        console.warn("updateLeaderboardMemberExpenses 函數不可用，無法同步數據");
      }
    } catch (error) {
      console.error("查看排行榜詳情失敗:", error);
      setError("載入排行榜數據失敗，請稍後再試");
      setTimeout(() => setError(""), 3000);
    } finally {
      setLoading(false);
    }
  };

  // 返回排行榜列表
  const handleBackToList = () => {
    setSelectedLeaderboard(null);
    setMemberExpenses({});
  };

  // 格式化金額
  const formatAmount = (amount: number): string => {
    return amount.toLocaleString("zh-TW", {
      style: "currency",
      currency: "TWD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  // 格式化日期（簡短版本）
  const formatShortDate = (date: Date): string => {
    return date.toLocaleDateString("zh-TW", {
      month: "numeric",
      day: "numeric",
    });
  };

  // 手動同步支出記錄
  const syncExpenseRecords = async (
    leaderboard: Leaderboard,
  ): Promise<void> => {
    if (!leaderboard) return;

    try {
      setError("");

      // 顯示加載狀態
      setLoading(true);

      console.log(
        `開始同步排行榜 ${leaderboard.id} (${leaderboard.name}) 的支出記錄`,
      );

      // 調用更新函數重新計算所有成員的支出
      if (typeof updateLeaderboardMemberExpenses === "function") {
        await updateLeaderboardMemberExpenses(leaderboard);
        console.log(`排行榜 ${leaderboard.name} 的支出記錄同步完成`);

        // 清空當前的支出詳情，以便重新加載
        setMemberExpenses({});

        // 獲取當前查看的成員詳情
        const currentMemberId = Object.keys(memberExpenses)[0];
        if (currentMemberId) {
          const member = leaderboard.members.find(
            (m) => m.userId === currentMemberId,
          );
          if (member) {
            console.log(
              `自動重新加載成員 ${member.nickname || member.userId} 的支出詳情`,
            );

            // 標記該成員為加載中狀態
            setLoadingMemberIds((prev) => [...prev, member.userId]);

            // 延遲一點時間後重新加載該成員的支出詳情
            setTimeout(async () => {
              try {
                const expenses = await loadMemberExpenses(
                  member.userId,
                  member.allowViewDetail || member.userId === currentUser?.uid,
                  leaderboard.startDate,
                  leaderboard.endDate,
                );

                // 更新狀態，顯示支出詳情
                setMemberExpenses((prev) => ({
                  ...prev,
                  [member.userId]: expenses,
                }));

                // 移除加載中狀態
                setLoadingMemberIds((prev) =>
                  prev.filter((id) => id !== member.userId),
                );

                if (expenses.length > 0) {
                  console.log(`成功獲取到 ${expenses.length} 條支出記錄`);
                } else {
                  console.log(`同步後仍未獲取到支出記錄，請檢查數據庫`);
                }
              } catch (error) {
                console.error("自動重新加載支出詳情失敗:", error);
                // 移除加載中狀態
                setLoadingMemberIds((prev) =>
                  prev.filter((id) => id !== member.userId),
                );
              }
            }, 500);
          }
        }

        // 提示同步成功
        alert("支出記錄同步成功！系統正在重新加載支出詳情。");
      } else {
        throw new Error("無法獲取同步函數");
      }
    } catch (error) {
      console.error("同步支出記錄失敗:", error);
      setError(
        "同步支出記錄失敗: " +
          (error instanceof Error ? error.message : "未知錯誤"),
      );
    } finally {
      setLoading(false);
    }
  };

  // 手動刷新當前排行榜數據
  const refreshCurrentLeaderboard = async () => {
    if (!selectedLeaderboard || !updateLeaderboardMemberExpenses) return;
    
    try {
      setLoading(true);
      setError("");
      setSuccessMessage("");
      
      console.log(`手動刷新排行榜數據: ${selectedLeaderboard.name}`);
      console.log(`當前時間: ${new Date().toLocaleString()}`);
      
      // 記錄刷新前的支出金額和昵称
      console.log("刷新前排行榜成員資料:");
      const membersBefore: Record<string, { nickname: string, totalExpense: number }> = {};
      selectedLeaderboard.members.forEach(member => {
        console.log(`ID: ${member.userId}, 昵称: ${member.nickname || '未知'}, 支出: ${member.totalExpense}`);
        membersBefore[member.userId] = {
          nickname: member.nickname || '未知',
          totalExpense: member.totalExpense
        };
      });
      
      // 強制同步排行榜數據，不考慮任何緩存
      console.log(`開始強制同步排行榜數據...`);
      await updateLeaderboardMemberExpenses(selectedLeaderboard);
      console.log(`排行榜數據同步處理完成，正在獲取最新數據...`);
      
      // 從數據庫獲取最新的排行榜數據
      const leaderboardRef = doc(db, "leaderboards", selectedLeaderboard.id);
      const leaderboardDoc = await getDoc(leaderboardRef);
      
      if (leaderboardDoc.exists()) {
        const data = leaderboardDoc.data();
        
        // 處理日期格式
        const startDate = data.startDate instanceof Timestamp
          ? data.startDate.toDate()
          : new Date(data.startDate);
          
        const endDate = data.endDate instanceof Timestamp
          ? data.endDate.toDate()
          : new Date(data.endDate);
          
        const createdAt = data.createdAt instanceof Timestamp
          ? data.createdAt.toDate()
          : new Date(data.createdAt);
        
        // 記錄刷新後的支出金額和昵称
        console.log("刷新後排行榜成員資料:");
        const nicknameChanges: {userId: string, oldNickname: string, newNickname: string}[] = [];
        const expenseChanges: {userId: string, oldExpense: number, newExpense: number}[] = [];
        
        data.members.forEach((member: any) => {
          console.log(`ID: ${member.userId}, 昵称: ${member.nickname || '未知'}, 支出: ${member.totalExpense}`);
          
          // 检查昵称变更
          if (membersBefore[member.userId] && 
              membersBefore[member.userId].nickname !== (member.nickname || '未知')) {
            nicknameChanges.push({
              userId: member.userId,
              oldNickname: membersBefore[member.userId].nickname,
              newNickname: member.nickname || '未知'
            });
          }
          
          // 检查支出变更
          if (membersBefore[member.userId] && 
              membersBefore[member.userId].totalExpense !== member.totalExpense) {
            expenseChanges.push({
              userId: member.userId,
              oldExpense: membersBefore[member.userId].totalExpense,
              newExpense: member.totalExpense
            });
          }
        });
        
        if (nicknameChanges.length > 0) {
          console.log("检测到昵称变更:");
          nicknameChanges.forEach(change => {
            console.log(`用户 ${change.userId}: ${change.oldNickname} -> ${change.newNickname}`);
          });
        }
        
        if (expenseChanges.length > 0) {
          console.log("检测到支出变更:");
          expenseChanges.forEach(change => {
            console.log(`用户 ${change.userId}: ${change.oldExpense} -> ${change.newExpense}`);
          });
        }
        
        // 為了確保UI能正確反映變更，創建新的對象而不是修改原有對象
        const updatedLeaderboard: Leaderboard = {
          id: selectedLeaderboard.id,
          name: data.name,
          createdBy: data.createdBy,
          members: data.members || [],
          createdAt,
          timeRange: data.timeRange,
          startDate,
          endDate
        };
        
        // 檢查數據是否有變化
        const totalBefore = selectedLeaderboard.members.reduce((sum, member) => sum + member.totalExpense, 0);
        const totalAfter = updatedLeaderboard.members.reduce((sum, member) => sum + member.totalExpense, 0);
        
        console.log(`數據變化檢查: 刷新前總支出 ${totalBefore}, 刷新後總支出 ${totalAfter}`);
        
        let successMsg = "排行榜數據已成功刷新！";
        let changesDetected = false;
        
        // 添加详细的变更信息到成功消息
        if (totalBefore !== totalAfter) {
          const difference = totalAfter - totalBefore;
          successMsg += ` 總支出${difference > 0 ? '增加' : '減少'}了 ${Math.abs(difference)} 元。`;
          changesDetected = true;
        }
        
        if (nicknameChanges.length > 0) {
          successMsg += ` 更新了 ${nicknameChanges.length} 位成員的昵称。`;
          changesDetected = true;
        }
        
        if (!changesDetected) {
          successMsg += " 未檢測到數據變化。";
        }
        
        // 更新當前選中的排行榜
        setSelectedLeaderboard(updatedLeaderboard);
        
        // 清空現有的成員支出詳情，以便在需要時重新加載
        setMemberExpenses({});
        
        console.log(`排行榜數據刷新完成，UI已更新`);
        
        // 顯示成功提示
        setSuccessMessage(successMsg);
        setTimeout(() => setSuccessMessage(""), 5000);
      } else {
        throw new Error("找不到排行榜數據");
      }
    } catch (error) {
      console.error("刷新排行榜數據失敗:", error);
      setError("刷新數據失敗，請稍後再試");
      setTimeout(() => setError(""), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[#A487C3]">排行榜</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              // 觸發通知中心的排行榜邀請點擊事件
              if (typeof window !== "undefined") {
                const event = new CustomEvent("showLeaderboardInvites");
                window.dispatchEvent(event);
                // 關閉當前排行榜頁面
                onClose();
              }
            }}
            className="flex items-center gap-2 bg-[#F8F3FF] hover:bg-[#EFE5FF] text-[#A487C3] px-3 py-1.5 rounded-lg text-sm transition-all duration-300 shadow-sm hover:shadow-md relative"
          >
            <i className="fas fa-bell"></i>
            <span>查看排行榜邀請</span>
            {inviteCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-white text-[#A487C3] text-xs rounded-full w-5 h-5 flex items-center justify-center border border-[#C6B2DD]">
                {inviteCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              onClose();
              // 觸發顯示排行榜管理頁面
              if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("returnToLeaderboardManager"));
              }
            }}
            className="flex items-center gap-1 bg-[#A487C3] hover:bg-[#8A5DC8] text-white px-3 py-1.5 rounded-lg text-sm transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white"
          >
            <i className="fas fa-cog"></i>
            <span>排行榜管理</span>
          </button>
          <button
            onClick={onClose}
            className="text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>
      
      {/* 添加刷新按钮（仅在查看排行榜详情时显示） */}
      {selectedLeaderboard && (
        <div className="mb-4">
          <button
            onClick={refreshCurrentLeaderboard}
            className="px-3 py-1.5 bg-[#F0EAFA] hover:bg-[#E5D9F2] text-[#A487C3] rounded-lg text-sm flex items-center gap-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#A487C3]"
            disabled={loading}
          >
            <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`}></i>
            <span>刷新排行榜數據</span>
          </button>
          <p className="text-xs text-gray-500 mt-1">
            點擊此按鈕可同步最新的消費記錄
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-500 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm">
          <i className="fas fa-check-circle mr-2"></i>
          {successMessage}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col justify-center items-center py-12">
          <div className="w-16 h-16 relative mb-4">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#A487C3]"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <i className="fas fa-trophy text-[#A487C3] text-xl"></i>
            </div>
          </div>
          <p className="text-[#A487C3] font-medium">正在載入排行榜數據...</p>
          <p className="text-gray-500 text-sm mt-1">請稍候片刻</p>
        </div>
      ) : (
        <>
          {selectedLeaderboard ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBackToList}
                    className="flex items-center gap-1 bg-[#A487C3] hover:bg-[#C6B2DD] text-white px-4 py-2 rounded-lg text-sm transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white"
                  >
                    <i className="fas fa-arrow-left"></i>
                    <span>返回列表</span>
                  </button>
                </div>

                <div className="px-4 py-2 bg-[#F8F3FF] rounded-lg text-xs">
                  {isLeaderboardCompleted(selectedLeaderboard) ? (
                    <span className="text-[#A487C3] font-medium">已結束</span>
                  ) : (
                    <span className="text-[#6BBFA0] font-medium">進行中</span>
                  )}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                    <h3 className="text-lg font-semibold">
                      {selectedLeaderboard.name}
                    </h3>

                    <div className="text-sm text-gray-600">
                      {selectedLeaderboard.timeRange === "week" && "一週"}
                      {selectedLeaderboard.timeRange === "month" && "一月"}
                      {selectedLeaderboard.timeRange === "year" && "一年"}
                      {selectedLeaderboard.timeRange === "custom" && "自定義"}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500 mb-2">
                      <span className="font-medium">統計週期:</span>
                      {selectedLeaderboard.startDate &&
                        selectedLeaderboard.endDate &&
                        ` ${formatDate(selectedLeaderboard.startDate)} - ${formatDate(selectedLeaderboard.endDate)}`}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-700">排行榜結果</h4>

                    {[...selectedLeaderboard.members]
                      .sort((a, b) => b.totalExpense - a.totalExpense)
                      .map((member, index) => (
                        <div
                          key={member.userId}
                          className={`flex items-center justify-between bg-white rounded-lg p-3 shadow-sm border border-gray-100 ${isLeaderboardCompleted(selectedLeaderboard) && member.userId !== currentUser?.uid ? "hover:border-[#A487C3] transition-all duration-300 cursor-pointer" : ""}`}
                          onClick={
                            isLeaderboardCompleted(selectedLeaderboard) &&
                            member.userId !== currentUser?.uid
                              ? () => handleViewMemberDetails(member)
                              : undefined
                          }
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 flex items-center justify-center bg-[#A487C3] text-white rounded-full">
                              {index + 1}
                            </div>

                            <div className="w-8 h-8 rounded-full overflow-hidden">
                              {isLeaderboardCompleted(selectedLeaderboard) &&
                              member.photoURL ? (
                                <img
                                  src={member.photoURL}
                                  alt={member.nickname || "用戶"}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                  <i className="fas fa-user text-gray-400"></i>
                                </div>
                              )}
                            </div>

                            <div>
                              <p className="font-medium">
                                {isLeaderboardCompleted(selectedLeaderboard)
                                  ? member.nickname || "未知用戶"
                                  : member.userId === currentUser?.uid
                                    ? `${member.nickname || "未知用戶"} (我)`
                                    : `參與者${index + 1}`}
                              </p>
                              <p className="text-xs text-gray-500">
                                {index === 0 ? (
                                  "排行榜第一名"
                                ) : (
                                  <>
                                    {`比第 1 名少花費 ${
                                      selectedLeaderboard.members.sort(
                                        (a, b) =>
                                          b.totalExpense - a.totalExpense,
                                      )[0].totalExpense - member.totalExpense
                                    } 元`}
                                  </>
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <p className="font-semibold">
                              {formatAmount(member.totalExpense)}
                            </p>

                            {isLeaderboardCompleted(selectedLeaderboard) && (
                              <>
                                {member.userId !== currentUser?.uid && (
                                  <div 
                                    className="text-xs text-gray-500 cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewMemberDetails(member);
                                    }}
                                  >
                                    {member.userId in memberExpenses ? (
                                      <i
                                        className="fas fa-eye text-[#A487C3] animate-pulse"
                                        title="正在查看詳情"
                                      ></i>
                                    ) : member.allowViewDetail ? (
                                      <i
                                        className="fas fa-eye text-gray-400 hover:text-[#A487C3] transition-colors"
                                        title="允許查看詳情，點擊以查看"
                                      ></i>
                                    ) : (
                                      <i
                                        className="fas fa-eye-slash text-gray-400"
                                        title="不允許查看詳情"
                                      ></i>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}

                    {/* 進行中排行榜提示信息 */}
                    {!isLeaderboardCompleted(selectedLeaderboard) && (
                      <div className="mt-4 text-center px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-sm text-gray-600 flex items-center justify-center gap-2">
                          <i className="fas fa-info-circle text-[#A487C3]"></i>
                          <span>
                            進行中排行榜不顯示支出明細，排行榜結束後才能查看詳情
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 顯示選定成員的支出詳情 */}
                  {Object.keys(memberExpenses).map((userId) => {
                    const member = selectedLeaderboard.members.find(
                      (m) => m.userId === userId,
                    );
                    if (!member) return null;

                    // 檢查成員是否正在加載中
                    const isLoading = loadingMemberIds.includes(userId);

                    return (
                      <div
                        key={userId}
                        className="mt-4 border-t border-gray-200 pt-4"
                      >
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <span>
                            {isLeaderboardCompleted(selectedLeaderboard)
                              ? member.nickname || "未知用戶"
                              : member.userId === currentUser?.uid
                                ? `${member.nickname || "未知用戶"}`
                                : `參與者${
                                    selectedLeaderboard.members
                                      .sort(
                                        (a, b) =>
                                          b.totalExpense - a.totalExpense,
                                      )
                                      .findIndex(
                                        (m) => m.userId === member.userId,
                                      ) + 1
                                  }`}{" "}
                            的支出詳情
                          </span>
                          {member.userId === currentUser?.uid && (
                            <span className="text-xs text-gray-500">(我)</span>
                          )}
                        </h4>

                        {!member.allowViewDetail &&
                        member.userId !== currentUser?.uid ? (
                          <div className="text-center py-4 text-gray-500">
                            <i className="fas fa-lock text-xl mb-2"></i>
                            <p>該用戶未允許查看詳細支出記錄</p>
                          </div>
                        ) : !isLeaderboardCompleted(selectedLeaderboard) ? (
                          <div className="text-center py-4 text-gray-500">
                            <i className="fas fa-lock text-xl mb-2"></i>
                            <p>進行中的排行榜不顯示任何支出明細</p>
                            <p className="text-xs mt-1">
                              排行榜結束後才能查看支出記錄
                            </p>
                          </div>
                        ) : member.userId ===
                          currentUser?.uid ? (
                          <div className="space-y-2 mt-3">
                            {/* 檢查是否已結束的排行榜 */}
                            {isLeaderboardCompleted(selectedLeaderboard) ? (
                              memberExpenses[userId]?.length > 0 ? (
                                memberExpenses[userId].map((expense) => (
                                  <div
                                    key={expense.id}
                                    className="flex items-center justify-between border border-gray-100 p-3 rounded-lg hover:shadow-sm transition-all duration-200"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                        <i
                                          className={`fas ${typeof expense.category === "object" ? expense.category.icon : "fa-receipt"} text-[#6E6E6E]`}
                                        ></i>
                                      </div>
                                      <div>
                                        <p className="font-medium">
                                          {typeof expense.category === "object"
                                            ? expense.category.name
                                            : expense.category}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {formatShortDate(expense.date)} •{" "}
                                          {expense.notes}
                                        </p>
                                      </div>
                                    </div>
                                    <p className="font-medium">
                                      {formatAmount(expense.amount)}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <div className="flex items-center justify-center py-4">
                                  <button
                                    onClick={() => {
                                      if(selectedLeaderboard) {
                                        handleViewMemberDetails(member);
                                      }
                                    }}
                                    className="px-4 py-2 bg-[#F0EAFA] text-[#A487C3] rounded-lg hover:bg-[#E5D9F2] transition-colors text-sm"
                                  >
                                    <i className="fas fa-sync-alt mr-2"></i>
                                    載入我的支出明細
                                  </button>
                                </div>
                              )
                            ) : (
                              <div className="text-center py-4 text-gray-500">
                                <i className="fas fa-lock text-xl mb-2"></i>
                                <p>進行中的排行榜不顯示任何支出明細</p>
                                <p className="text-xs mt-1">
                                  排行榜結束後才能查看支出記錄
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {memberExpenses[userId].map((expense) => (
                              <div
                                key={expense.id}
                                className="flex items-center justify-between border border-gray-100 p-3 rounded-lg"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                    <i
                                      className={`fas ${typeof expense.category === "object" ? expense.category.icon : "fa-receipt"} text-[#6E6E6E]`}
                                    ></i>
                                  </div>
                                  <div>
                                    <p className="font-medium">
                                      {typeof expense.category === "object"
                                        ? expense.category.name
                                        : expense.category}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {formatShortDate(expense.date)} •{" "}
                                      {expense.notes}
                                    </p>
                                  </div>
                                </div>
                                <p className="font-medium">
                                  {formatAmount(expense.amount)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 排行榜列表 */}
              {leaderboards.length > 0 ? (
                <div className="space-y-6">
                  {/* 進行中的排行榜 */}
                  {activeLeaderboards.length > 0 && (
                    <div>
                      <h3 className="font-medium mb-3 text-[#2E2E2E]">
                        進行中的排行榜
                      </h3>
                      <div className="grid gap-3">
                        {activeLeaderboards.map((leaderboard) => (
                          <button
                            key={leaderboard.id}
                            onClick={() => handleViewLeaderboard(leaderboard)}
                            className="flex items-start justify-between w-full bg-white border border-gray-200 hover:border-[#A487C3] focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-white rounded-lg p-4 text-left"
                          >
                            <div className="flex-1 min-w-0 pr-2">
                              <p className="font-medium text-gray-800 truncate">
                                {leaderboard.name}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                                <span className="inline-flex items-center px-2.5 py-1 bg-[#F0EAFA] text-[#A487C3] rounded-full border border-[#E5D9F2]">
                                  <i className="fas fa-users mr-1.5"></i>
                                  {leaderboard.members.length} 位成員
                                </span>
                                <span className="inline-flex items-center px-2.5 py-1 bg-[#F5F5F5] text-gray-600 rounded-full">
                                  <i className="far fa-clock mr-1.5"></i>
                                  {leaderboard.timeRange === "week" && "一週"}
                                  {leaderboard.timeRange === "month" && "一月"}
                                  {leaderboard.timeRange === "year" && "一年"}
                                  {leaderboard.timeRange === "custom" && "自定義"}
                                </span>
                                <span className="inline-flex items-center px-2.5 py-1 bg-[#F5F5F5] text-gray-600 rounded-full">
                                  <i className="far fa-calendar-alt mr-1.5"></i>
                                  結束於 {formatDate(leaderboard.endDate)}
                                </span>
                              </div>
                            </div>
                            <div className="flex-shrink-0 flex items-center gap-2 ml-3">
                              <span className="inline-flex items-center px-2.5 py-1 bg-green-50 text-green-600 rounded-full text-xs font-medium border border-green-100">
                                <i className="fas fa-play-circle mr-1.5 text-green-500"></i>
                                進行中
                              </span>
                              <i className="fas fa-chevron-right text-gray-400"></i>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 已完成的排行榜 */}
                  {completedLeaderboards.length > 0 && (
                    <div>
                      <h3 className="font-medium mb-3 text-[#2E2E2E]">
                        已結束的排行榜
                      </h3>
                      <div className="grid gap-3">
                        {completedLeaderboards.map((leaderboard) => (
                          <button
                            key={leaderboard.id}
                            onClick={() => handleViewLeaderboard(leaderboard)}
                            className="flex items-start justify-between w-full bg-white border border-gray-200 hover:border-[#A487C3] focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-white rounded-lg p-4 text-left"
                          >
                            <div className="flex-1 min-w-0 pr-2">
                              <p className="font-medium text-gray-800 truncate">
                                {leaderboard.name}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                                <span className="inline-flex items-center px-2.5 py-1 bg-[#F0EAFA] text-[#A487C3] rounded-full border border-[#E5D9F2]">
                                  <i className="fas fa-users mr-1.5"></i>
                                  {leaderboard.members.length} 位成員
                                </span>
                                <span className="inline-flex items-center px-2.5 py-1 bg-[#F5F5F5] text-gray-600 rounded-full">
                                  <i className="far fa-clock mr-1.5"></i>
                                  {leaderboard.timeRange === "week" && "一週"}
                                  {leaderboard.timeRange === "month" && "一月"}
                                  {leaderboard.timeRange === "year" && "一年"}
                                  {leaderboard.timeRange === "custom" && "自定義"}
                                </span>
                                <span className="inline-flex items-center px-2.5 py-1 bg-[#F5F5F5] text-gray-600 rounded-full">
                                  <i className="far fa-calendar-check mr-1.5"></i>
                                  結束於 {formatDate(leaderboard.endDate)}
                                </span>
                              </div>
                            </div>
                            <div className="flex-shrink-0 flex items-center gap-2 ml-3">
                              <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium border border-gray-200">
                                <i className="fas fa-check-circle mr-1.5 text-gray-500"></i>
                                已結束
                              </span>
                              <i className="fas fa-chevron-right text-gray-400"></i>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-20 h-20 mx-auto bg-[#F8F3FF] rounded-full flex items-center justify-center mb-4">
                    <i className="fas fa-trophy text-[#A487C3] text-3xl"></i>
                  </div>
                  <h3 className="text-lg font-medium text-gray-700 mb-2">
                    您還沒有加入任何排行榜
                  </h3>
                  <p className="text-gray-500 mb-6">
                    透過排行榜和好友一起追蹤消費，互相督促節省開支
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => {
                        onClose();
                        // 觸發顯示排行榜管理頁面
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(
                            new Event("returnToLeaderboardManager"),
                          );
                        }
                      }}
                      className="px-6 py-3 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-lg transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white"
                    >
                      <i className="fas fa-plus mr-2"></i>
                      建立或加入排行榜
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default LeaderboardViewer;
