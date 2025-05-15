/**
 * LeaderboardViewer 组件的性能优化说明
 * 
 * 1. 并行数据加载：使用 Promise.all 并行加载排行榜数据，减少总加载时间
 * 2. 内存缓存：缓存已加载的成员支出详情，避免重复请求
 * 3. 延迟加载：使用 setTimeout 和后台任务处理非关键同步操作
 * 4. 记忆化计算：使用 useMemo 和 useCallback 避免重复计算和渲染
 * 5. 批量请求：使用批量处理而非单条请求获取支出详情
 * 6. 分页加载：对大量支出记录实现分页显示，减轻渲染负担
 * 7. 图片懒加载：为头像等图片添加懒加载标记
 * 8. 减少不必要的状态更新：优化了各种处理函数，减少不必要的状态更新
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  const [expensePageSize] = useState(10); // 每页显示10条支出记录
  const [expensePages, setExpensePages] = useState<Record<string, number>>({});

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

  // 格式化日期 - 使用useMemo优化，避免重复计算
  const formatDate = useCallback((date: Date | undefined): string => {
    if (!date) return "無日期";

    // 處理 Firebase Timestamp
    const jsDate = date instanceof Timestamp ? date.toDate() : date;

    return jsDate.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, []);

  // 檢查排行榜是否已結束 - 使用useCallback优化
  const isLeaderboardCompleted = useCallback((leaderboard: Leaderboard): boolean => {
    const now = new Date();
    return new Date(leaderboard.endDate) < now;
  }, []);

  // 格式化金額 - 使用useCallback优化
  const formatAmount = useCallback((amount: number): string => {
    return amount.toLocaleString("zh-TW", {
      style: "currency",
      currency: "TWD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }, []);

  // 格式化日期（簡短版本） - 使用useCallback优化
  const formatShortDate = useCallback((date: Date): string => {
    return date.toLocaleDateString("zh-TW", {
      month: "numeric",
      day: "numeric",
    });
  }, []);

  // 记忆化已排序的成员列表，避免重复排序
  const sortedMembers = useMemo(() => {
    if (!selectedLeaderboard) return [];
    return [...selectedLeaderboard.members].sort((a, b) => b.totalExpense - a.totalExpense);
  }, [selectedLeaderboard]);

  // 记忆化第一名成员的总支出
  const topMemberExpense = useMemo(() => {
    if (sortedMembers.length === 0) return 0;
    return sortedMembers[0].totalExpense;
  }, [sortedMembers]);

  // 加載排行榜列表
  useEffect(() => {
    if (!currentUser) return;

    const loadLeaderboards = async () => {
      setLoading(true);
      setError("");

      try {
        // 優化1: 檢查緩存 - 使用sessionStorage暫存排行榜數據
        const cachedData = sessionStorage.getItem(`leaderboards_${currentUser.uid}`);
        const cacheTimestamp = sessionStorage.getItem(`leaderboards_${currentUser.uid}_timestamp`);
        
        // 如果有緩存且緩存時間在5分鐘內，直接使用緩存數據
        const CACHE_TTL = 5 * 60 * 1000; // 5分鐘緩存有效期
        if (cachedData && cacheTimestamp) {
          const cacheAge = Date.now() - parseInt(cacheTimestamp);
          if (cacheAge < CACHE_TTL) {
            console.log(`使用緩存的排行榜數據，緩存時間: ${new Date(parseInt(cacheTimestamp)).toLocaleString()}`);
            const parsedData = JSON.parse(cachedData);
            
            // 恢復日期對象
            const processLeaderboard = (lb: any): Leaderboard => ({
              ...lb,
              startDate: new Date(lb.startDate),
              endDate: new Date(lb.endDate),
              createdAt: new Date(lb.createdAt)
            });
            
            const leaderboardsData = parsedData.map(processLeaderboard);
            
            // 分類排行榜：已結束和進行中
            const now = new Date();
            const completed = leaderboardsData.filter((lb: Leaderboard) => new Date(lb.endDate) < now);
            const active = leaderboardsData.filter((lb: Leaderboard) => new Date(lb.endDate) >= now);

            // 按結束日期排序
            completed.sort((a: Leaderboard, b: Leaderboard) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
            active.sort((a: Leaderboard, b: Leaderboard) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
            
            setCompletedLeaderboards(completed);
            setActiveLeaderboards(active);
            setLeaderboards(leaderboardsData);
            setLoading(false);
            
            // 優化2: 背景刷新 - 在使用緩存的同時，在背景中更新數據
            setTimeout(() => {
              fetchLeaderboardsData(false);
            }, 100);
            
            return;
          }
        }
        
        // 無緩存或緩存過期，從數據庫加載
        await fetchLeaderboardsData(true);
        
      } catch (error) {
        console.error("加載排行榜失敗:", error);
        setError("加載排行榜時出錯，請稍後再試");
        setLoading(false);
      }
    };

    // 優化3: 抽取資料獲取邏輯到獨立函數，實現可重用
    const fetchLeaderboardsData = async (updateLoadingState: boolean) => {
      try {
        // 獲取用戶所在的排行榜
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (!userDoc.exists()) {
          if (updateLoadingState) {
            setError("未找到用戶資料");
            setLoading(false);
          }
          return;
        }

        const userData = userDoc.data();
        const userLeaderboardIds = userData.leaderboards || [];

        if (userLeaderboardIds.length === 0) {
          if (updateLoadingState) {
            setLoading(false);
          }
          return;
        }

        console.log(`開始加載用戶 ${currentUser.uid} (${userData.nickname || '未知用戶'}) 的 ${userLeaderboardIds.length} 個排行榜`);

        // 優化4: 批量加載 - 將排行榜分批加載以提高性能
        const batchSize = 5; // 每批加載5個排行榜
        const batches = [];
        
        for (let i = 0; i < userLeaderboardIds.length; i += batchSize) {
          batches.push(userLeaderboardIds.slice(i, i + batchSize));
        }
        
        console.log(`排行榜將分${batches.length}批加載`);
        
        let allLeaderboards: Leaderboard[] = [];
        
        // 批次順序加載排行榜
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          console.log(`加載第${i+1}批排行榜（${batch.length}個）`);
          
          // 批次中的排行榜並行加載
          const batchPromises = batch.map((leaderboardId: string) => 
            fetchSingleLeaderboard(leaderboardId, i === 0) // 僅對第一批執行即時同步
          );
          
          const batchResults = await Promise.all(batchPromises);
          allLeaderboards = [...allLeaderboards, ...batchResults.filter(item => item !== null) as Leaderboard[]];
          
          // 優化5: 逐批更新UI - 每批加載完成後立即更新UI，提高用戶體驗
          if (updateLoadingState && i === 0) {
            // 立即顯示第一批結果
            updateLeaderboardsState(allLeaderboards);
          }
        }
        
        // 最終更新所有數據
        updateLeaderboardsState(allLeaderboards);
        
        // 優化6: 緩存最新數據到sessionStorage
        try {
          const serializedData = JSON.stringify(allLeaderboards);
          sessionStorage.setItem(`leaderboards_${currentUser.uid}`, serializedData);
          sessionStorage.setItem(`leaderboards_${currentUser.uid}_timestamp`, Date.now().toString());
          console.log(`排行榜數據已緩存，時間: ${new Date().toLocaleString()}`);
        } catch (e) {
          console.warn("無法緩存排行榜數據:", e);
        }
        
        if (updateLoadingState) {
          setLoading(false);
        }
      } catch (error) {
        console.error("加載排行榜失敗:", error);
        if (updateLoadingState) {
          setError("加載排行榜時出錯，請稍後再試");
          setLoading(false);
        }
      }
    };
    
    // 優化7: 提取單個排行榜加載邏輯以便重用
    const fetchSingleLeaderboard = async (leaderboardId: string, prioritySyncEnabled: boolean): Promise<Leaderboard | null> => {
      console.log(`加載排行榜 ${leaderboardId} 的詳情`);
      try {
        const leaderboardDoc = await getDoc(doc(db, "leaderboards", leaderboardId));
        
        if (!leaderboardDoc.exists()) {
          console.warn(`未找到排行榜 ${leaderboardId} 的詳情`);
          return null;
        }
        
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
        
        // 檢查是否是進行中的排行榜但不阻塞加載流程
        const now = new Date();
        const isOngoing = now >= startDate && now <= endDate;
        
        if (isOngoing && typeof updateLeaderboardMemberExpenses === "function") {
          // 優化8: 智能同步策略 - 根據優先級決定同步策略
          const syncDelay = prioritySyncEnabled ? 10 : 2000 + Math.random() * 3000;
          
          setTimeout(async () => {
            try {
              console.log(`開始同步排行榜: ${leaderboard.name} (優先級: ${prioritySyncEnabled ? '高' : '低'})`);
              await updateLeaderboardMemberExpenses(leaderboard);
              console.log(`排行榜 ${leaderboard.name} 數據同步完成`);
            } catch (error) {
              console.error(`同步排行榜 ${leaderboard.name} 數據失敗:`, error);
            }
          }, syncDelay);
        }
        
        return leaderboard;
      } catch (error) {
        console.error(`加載排行榜 ${leaderboardId} 失敗:`, error);
        return null;
      }
    };
    
    // 優化9: 提取排行榜狀態更新邏輯
    const updateLeaderboardsState = (leaderboardsData: Leaderboard[]) => {
      // 分類排行榜：已結束和進行中
      const now = new Date();
      const completed = leaderboardsData.filter((lb: Leaderboard) => new Date(lb.endDate) < now);
      const active = leaderboardsData.filter((lb: Leaderboard) => new Date(lb.endDate) >= now);

      // 按結束日期排序
      completed.sort((a: Leaderboard, b: Leaderboard) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
      active.sort((a: Leaderboard, b: Leaderboard) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

      console.log(`排行榜更新: ${active.length} 個進行中, ${completed.length} 個已結束`);
      
      setCompletedLeaderboards(completed);
      setActiveLeaderboards(active);
      setLeaderboards(leaderboardsData);
    };

    loadLeaderboards();
  }, [currentUser, updateLeaderboardMemberExpenses]);

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
    
    if (!allowViewDetail) {
      return [];
    }

    // 使用缓存，避免重复加载
    if (memberExpenses[userId]?.length > 0) {
      console.log(`使用缓存的支出数据，共 ${memberExpenses[userId].length} 条记录`);
      return memberExpenses[userId];
    }

    // 首先查找這個用戶在當前選中的排行榜中的成員信息
    const member = selectedLeaderboard?.members.find(m => m.userId === userId);

    if (member && member.totalExpense > 0) {
      // 策略1: 使用已缓存的expenseIds
      if (member.expenseIds && member.expenseIds.length > 0) {
        console.log(`從排行榜成員數據中找到 ${member.expenseIds.length} 條支出記錄ID`);

        // 使用批量获取提高性能
        try {
          const expensesPromises = member.expenseIds.map(expenseId => 
            getDoc(doc(db, "expenses", expenseId))
          );
          
          const expenseDocs = await Promise.all(expensesPromises);
          const expenses: Expense[] = [];
          
          expenseDocs.forEach(doc => {
            if (doc.exists()) {
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
            }
          });

          if (expenses.length > 0) {
            console.log(`成功獲取 ${expenses.length} 條支出記錄`);
            // 按日期降序排序，最新的支出排在前面
            return expenses.sort(
              (a, b) => b.date.getTime() - a.date.getTime()
            );
          }
        } catch (err) {
          console.warn(`批量獲取支出記錄失敗:`, err);
        }
      } 
      
      // 策略2: 使用摘要数据
      else if (member.expenseSummaries && member.expenseSummaries.length > 0) {
        console.log(`使用支出摘要數據, 共 ${member.expenseSummaries.length} 條`);
        
        const expenses: Expense[] = member.expenseSummaries.map(summary => {
          const expenseDate = summary.date instanceof Timestamp
            ? summary.date.toDate()
            : summary.date && typeof summary.date.toDate === 'function'
              ? summary.date.toDate()
              : new Date();
              
          return {
            id: summary.id,
            amount: summary.amount,
            category: summary.category,
            date: expenseDate,
            notes: "",
            userId: userId,
          };
        });
        
        if (expenses.length > 0) {
          return expenses.sort((a, b) => b.date.getTime() - a.date.getTime());
        }
      }
    }

    // 策略3: 直接从数据库查询（作为最后手段）
    try {
      console.log(`從數據庫直接查詢用戶 ${userId} 的支出`);
      
      const expensesRef = collection(db, "expenses");
      
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
      const expenses: Expense[] = [];
      
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
      
      console.log(`直接查詢獲取到 ${expenses.length} 條支出記錄`);
      return expenses.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      console.error(`查詢支出失敗:`, error);
      return [];
    }
  };

  // 查看成員詳情
  const handleViewMemberDetails = async (member: LeaderboardMember) => {
    if (!selectedLeaderboard) return;

    try {
      // 获取允许查看详情的状态
      const allowViewDetail = member.allowViewDetail || member.userId === currentUser?.uid;

      if (!allowViewDetail) {
        setError("該用戶未開放詳情查看權限");
        setTimeout(() => setError(""), 3000);
        return;
      }

      // 检查是否已在加载中，避免重复点击
      if (loadingMemberIds.includes(member.userId)) {
        return;
      }

      // 标记该成员为加载中状态
      setLoadingMemberIds(prev => [...prev, member.userId]);
      
      // 检查是否已结束的排行榜
      const isEnded = isLeaderboardCompleted(selectedLeaderboard);
      if (!isEnded) {
        setError("排行榜尚未結束，暫不顯示詳情");
        setTimeout(() => setError(""), 3000);
        setLoadingMemberIds(prev => prev.filter(id => id !== member.userId));
        return;
      }

      // 检查是否已加载过该成员的支出详情
      if (memberExpenses[member.userId]?.length > 0) {
        // 已加载过，无需重新加载
        setLoadingMemberIds(prev => prev.filter(id => id !== member.userId));
        return;
      }

      try {
        // 加载支出详情
        const expenses = await loadMemberExpenses(
          member.userId,
          allowViewDetail,
          selectedLeaderboard.startDate,
          selectedLeaderboard.endDate,
        );

        // 更新状态，显示支出详情
        setMemberExpenses(prev => ({
          ...prev,
          [member.userId]: expenses,
        }));
        
        // 如果没有获取到支出详情但有总支出金额，提示用户
        if (expenses.length === 0 && member.totalExpense > 0) {
          setError("未找到支出詳情，請手動刷新排行榜數據");
          setTimeout(() => setError(""), 3000);
        }
      } catch (error) {
        console.error(`获取用户 ${member.userId} 的支出详情失败:`, error);
        setError("獲取支出詳情失敗，請稍後再試");
        setTimeout(() => setError(""), 3000);
        setMemberExpenses(prev => ({
          ...prev,
          [member.userId]: [],
        }));
      } finally {
        // 移除加载中状态
        setLoadingMemberIds(prev => prev.filter(id => id !== member.userId));
      }
    } catch (error) {
      console.error("處理查看成員詳情失敗:", error);
      setError("處理請求失敗，請稍後再試");
      setTimeout(() => setError(""), 3000);
      setLoadingMemberIds(prev => prev.filter(id => id !== member.userId));
    }
  };

  // 查看排行榜詳情
  const handleViewLeaderboard = async (leaderboard: Leaderboard) => {
    try {
      // 设置加载状态和当前选中的排行榜
      setLoading(true);
      setSelectedLeaderboard(leaderboard);
      setMemberExpenses({});
      
      // 检查是否需要同步数据
      const now = new Date();
      const isOngoing = now >= leaderboard.startDate && now <= leaderboard.endDate;
      
      if (isOngoing) {
        // 进行中的排行榜，使用低优先级后台同步，不阻塞UI渲染
        if (typeof updateLeaderboardMemberExpenses === "function") {
          // 设置一个标志，表示同步已经启动
          setTimeout(async () => {
            try {
              await updateLeaderboardMemberExpenses(leaderboard);
              
              // 同步完成后，获取最新数据并更新UI
              const leaderboardRef = doc(db, "leaderboards", leaderboard.id);
              const leaderboardDoc = await getDoc(leaderboardRef);
              
              if (leaderboardDoc.exists() && selectedLeaderboard?.id === leaderboard.id) {
                const data = leaderboardDoc.data();
                
                // 更新排行榜数据但不触发全屏加载状态
                setSelectedLeaderboard(prev => {
                  if (!prev || prev.id !== leaderboard.id) return prev;
                  
                  return {
                    ...prev,
                    members: data.members || [],
                  };
                });
              }
            } catch (error) {
              console.error(`后台同步排行榜数据失败:`, error);
            }
          }, 100);
        }
      } else if (isLeaderboardCompleted(leaderboard)) {
        // 已结束的排行榜，检查是否需要同步
        const needsSync = !leaderboard.members.some(
          member => member.totalExpense > 0 && 
          ((member.expenseIds && member.expenseIds.length > 0) || 
           (member.expenseSummaries && member.expenseSummaries.length > 0))
        );
        
        if (needsSync && typeof updateLeaderboardMemberExpenses === "function") {
          try {
            await updateLeaderboardMemberExpenses(leaderboard);
            
            // 获取更新后的排行榜数据
            const leaderboardRef = doc(db, "leaderboards", leaderboard.id);
            const leaderboardDoc = await getDoc(leaderboardRef);
            
            if (leaderboardDoc.exists()) {
              const data = leaderboardDoc.data();
              
              // 处理日期格式
              const startDate = data.startDate instanceof Timestamp
                ? data.startDate.toDate()
                : new Date(data.startDate);
                
              const endDate = data.endDate instanceof Timestamp
                ? data.endDate.toDate()
                : new Date(data.endDate);
                
              const createdAt = data.createdAt instanceof Timestamp
                ? data.createdAt.toDate()
                : new Date(data.createdAt);
              
              // 更新排行榜数据
              setSelectedLeaderboard({
                ...leaderboard,
                members: data.members || [],
                startDate,
                endDate,
                createdAt
              });
            }
          } catch (error) {
            console.error("同步排行榜数据失败:", error);
          }
        }
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
      
      // 创建一个简单的成员数据摘要用于比较
      const membersBefore = selectedLeaderboard.members.reduce((acc, member) => {
        acc[member.userId] = {
          nickname: member.nickname || '未知',
          totalExpense: member.totalExpense
        };
        return acc;
      }, {} as Record<string, { nickname: string, totalExpense: number }>);
      
      // 使用正确的参数调用更新函数
      await updateLeaderboardMemberExpenses(selectedLeaderboard);
      
      // 获取更新后的排行榜数据
      const leaderboardDoc = await getDoc(doc(db, "leaderboards", selectedLeaderboard.id));
      
      if (!leaderboardDoc.exists()) {
        throw new Error("找不到排行榜數據");
      }
      
      const data = leaderboardDoc.data();
      
      // 处理日期格式 (仅在必要时)
      const startDate = data.startDate instanceof Timestamp
        ? data.startDate.toDate()
        : new Date(data.startDate);
        
      const endDate = data.endDate instanceof Timestamp
        ? data.endDate.toDate()
        : new Date(data.endDate);
        
      const createdAt = data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(data.createdAt);
      
      // 分析数据变化
      const nicknameChanges: {userId: string, oldNickname: string, newNickname: string}[] = [];
      const expenseChanges: {userId: string, oldExpense: number, newExpense: number}[] = [];
      
      data.members.forEach((member: any) => {
        const prevMember = membersBefore[member.userId];
        if (!prevMember) return;
        
        // 检查昵称变更
        if (prevMember.nickname !== (member.nickname || '未知')) {
          nicknameChanges.push({
            userId: member.userId,
            oldNickname: prevMember.nickname,
            newNickname: member.nickname || '未知'
          });
        }
        
        // 检查支出变更
        if (prevMember.totalExpense !== member.totalExpense) {
          expenseChanges.push({
            userId: member.userId,
            oldExpense: prevMember.totalExpense,
            newExpense: member.totalExpense
          });
        }
      });
      
      // 创建更新后的排行榜对象
      const updatedLeaderboard: Leaderboard = {
        ...selectedLeaderboard,
        members: data.members || [],
        startDate,
        endDate,
        createdAt
      };
      
      // 检查是否有实际变化
      let successMsg = "排行榜數據已成功刷新！";
      let changesDetected = false;
      
      // 计算总支出变化
      const totalBefore = Object.values(membersBefore).reduce((sum, m) => sum + m.totalExpense, 0);
      const totalAfter = updatedLeaderboard.members.reduce((sum, m) => sum + m.totalExpense, 0);
      
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
      
      // 更新状态
      setSelectedLeaderboard(updatedLeaderboard);
      setMemberExpenses({});
      setSuccessMessage(successMsg);
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (error) {
      console.error("刷新排行榜數據失敗:", error);
      setError("刷新數據失敗，請稍後再試");
      setTimeout(() => setError(""), 3000);
    } finally {
      setLoading(false);
    }
  };

  // 分页处理函数
  const handleChangePage = useCallback((userId: string, newPage: number) => {
    setExpensePages(prev => ({
      ...prev,
      [userId]: newPage
    }));
  }, []);
  
  // 获取分页后的支出记录
  const getPaginatedExpenses = useCallback((userId: string, allExpenses: Expense[]) => {
    const currentPage = expensePages[userId] || 1;
    const startIndex = (currentPage - 1) * expensePageSize;
    const endIndex = startIndex + expensePageSize;
    return allExpenses.slice(startIndex, endIndex);
  }, [expensePages, expensePageSize]);
  
  // 计算总页数
  const getTotalPages = useCallback((totalItems: number) => {
    return Math.ceil(totalItems / expensePageSize);
  }, [expensePageSize]);

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

                    {sortedMembers.map((member, index) => (
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
                                loading="lazy" // 添加懒加载
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
                                  {`比第 1 名少花費 ${topMemberExpense - member.totalExpense} 元`}
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
                    
                    const expenses = memberExpenses[userId] || [];
                    const currentPage = expensePages[userId] || 1;
                    const totalPages = getTotalPages(expenses.length);
                    const paginatedExpenses = getPaginatedExpenses(userId, expenses);
                    const isLoading = loadingMemberIds.includes(userId);

                    return (
                      <div
                        key={userId}
                        className="mt-4 border-t border-gray-200 pt-4"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-medium flex items-center gap-2">
                            <span>
                              {isLeaderboardCompleted(selectedLeaderboard)
                                ? member.nickname || "未知用戶"
                                : member.userId === currentUser?.uid
                                  ? `${member.nickname || "未知用戶"}`
                                  : `參與者${
                                      sortedMembers.findIndex(
                                        (m) => m.userId === member.userId,
                                      ) + 1
                                    }`}{" "}
                              的支出詳情
                            </span>
                            {member.userId === currentUser?.uid && (
                              <span className="text-xs text-gray-500">(我)</span>
                            )}
                          </h4>
                          
                          {/* 支出总量摘要 */}
                          <div className="text-sm text-gray-500">
                            共 {expenses.length} 條記錄，總支出 {formatAmount(member.totalExpense)}
                          </div>
                        </div>

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
                        ) : isLoading ? (
                          <div className="flex justify-center items-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#A487C3]"></div>
                            <span className="ml-2 text-[#A487C3]">加載中...</span>
                          </div>
                        ) : expenses.length > 0 ? (
                          <>
                            <div className="space-y-2 mt-3">
                              {paginatedExpenses.map((expense) => (
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
                              ))}
                            </div>
                            
                            {/* 添加分页控制 */}
                            {totalPages > 1 && (
                              <div className="flex justify-center items-center mt-4 gap-2">
                                <button
                                  onClick={() => handleChangePage(userId, Math.max(1, currentPage - 1))}
                                  disabled={currentPage === 1}
                                  className={`px-3 py-1 rounded-lg ${
                                    currentPage === 1 
                                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                      : 'bg-[#F0EAFA] text-[#A487C3] hover:bg-[#E5D9F2]'
                                  }`}
                                >
                                  <i className="fas fa-chevron-left"></i>
                                </button>
                                
                                <span className="text-sm text-gray-600">
                                  {currentPage} / {totalPages}
                                </span>
                                
                                <button
                                  onClick={() => handleChangePage(userId, Math.min(totalPages, currentPage + 1))}
                                  disabled={currentPage === totalPages}
                                  className={`px-3 py-1 rounded-lg ${
                                    currentPage === totalPages 
                                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                      : 'bg-[#F0EAFA] text-[#A487C3] hover:bg-[#E5D9F2]'
                                  }`}
                                >
                                  <i className="fas fa-chevron-right"></i>
                                </button>
                              </div>
                            )}
                          </>
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
                              載入支出明細
                            </button>
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
