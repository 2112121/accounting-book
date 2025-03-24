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

        for (const leaderboardId of userLeaderboardIds) {
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
  }, [currentUser]);

  // 加載成員支出詳情
  const loadMemberExpenses = async (
    userId: string,
    allowViewDetail: boolean,
    startDate: Date,
    endDate: Date,
  ) => {
    if (!allowViewDetail) return [];

    try {
      console.log(`查詢用戶 ${userId} 在時間範圍內的支出:`, {
        開始日期: startDate.toLocaleDateString(),
        結束日期: endDate.toLocaleDateString(),
      });

      // 先檢查是否可以從排行榜成員數據中獲取支出記錄ID
      if (selectedLeaderboard) {
        const member = selectedLeaderboard.members.find(
          (m) => m.userId === userId,
        );
        if (member && member.totalExpense > 0) {
          // 檢查是否存在支出記錄ID或摘要
          if (member.expenseIds && member.expenseIds.length > 0) {
            console.log(
              `從排行榜成員數據中找到 ${member.expenseIds.length} 條支出記錄ID，嘗試直接獲取`,
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
                    `直接獲取支出記錄: ${data.amount}, 日期: ${expenseDate.toLocaleDateString()}, ID: ${expenseDoc.id}`,
                  );
                }
              } catch (err) {
                console.warn(`獲取支出記錄 ${expenseId} 失敗:`, err);
              }
            }

            if (expenses.length > 0) {
              console.log(`成功通過ID直接獲取 ${expenses.length} 條支出記錄`);
              return expenses.sort(
                (a, b) => b.date.getTime() - a.date.getTime(),
              ); // 按日期降序排序
            }
          }

          // 檢查是否有支出摘要數據
          if (member.expenseSummaries && member.expenseSummaries.length > 0) {
            console.log(
              `從排行榜成員數據中找到 ${member.expenseSummaries.length} 條支出摘要，嘗試創建支出記錄`,
            );

            const expenses: Expense[] = [];
            // 從摘要創建支出記錄
            for (const summary of member.expenseSummaries) {
              try {
                const expenseDate =
                  summary.date instanceof Timestamp
                    ? summary.date.toDate()
                    : summary.date.seconds
                      ? new Date(summary.date.seconds * 1000)
                      : new Date(summary.date);

                expenses.push({
                  id: summary.id,
                  amount: summary.amount,
                  category: summary.category,
                  date: expenseDate,
                  notes: "從摘要還原的支出記錄",
                  userId: userId,
                });

                console.log(
                  `從摘要創建支出記錄: ${summary.amount}, ID: ${summary.id}`,
                );
              } catch (err) {
                console.warn(`處理支出摘要失敗:`, err);
              }
            }

            if (expenses.length > 0) {
              console.log(`成功從摘要創建 ${expenses.length} 條支出記錄`);
              return expenses.sort(
                (a, b) => b.date.getTime() - a.date.getTime(),
              ); // 按日期降序排序
            }
          }
        }
      }

      // 如果無法通過ID直接獲取，則使用常規查詢方法
      const expensesRef = collection(db, "expenses");
      const expenses: Expense[] = [];

      // 方法1: 使用Timestamp對象查詢
      try {
        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        console.log(
          `使用Timestamp查詢: 開始=${startTimestamp.toDate().toLocaleDateString()}, 結束=${endTimestamp.toDate().toLocaleDateString()}`,
        );

        const q1 = query(
          expensesRef,
          where("userId", "==", userId),
          where("date", ">=", startTimestamp),
          where("date", "<=", endTimestamp),
          orderBy("date", "desc"),
        );

        const querySnapshot1 = await getDocs(q1);
        console.log(
          `方法1(Timestamp查詢): 找到 ${querySnapshot1.size} 條支出記錄`,
        );

        querySnapshot1.forEach((doc) => {
          const data = doc.data();
          const expenseDate =
            data.date instanceof Timestamp
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

          console.log(
            `方法1添加支出: ${data.amount}, 日期: ${expenseDate.toLocaleDateString()}, 記錄ID: ${doc.id}`,
          );
        });
      } catch (err) {
        console.warn(`Timestamp查詢方法失敗:`, err);
      }

      // 方法2: 使用字符串日期查詢
      if (expenses.length === 0) {
        try {
          const startDateStr = startDate.toISOString().split("T")[0];
          const endDateStr = endDate.toISOString().split("T")[0];

          console.log(
            `使用字符串日期查詢: 開始=${startDateStr}, 結束=${endDateStr}`,
          );

          const q2 = query(
            expensesRef,
            where("userId", "==", userId),
            where("date", ">=", startDateStr),
            where("date", "<=", endDateStr),
            orderBy("date", "desc"),
          );

          const querySnapshot2 = await getDocs(q2);
          console.log(
            `方法2(字符串日期查詢): 找到 ${querySnapshot2.size} 條支出記錄`,
          );

          querySnapshot2.forEach((doc) => {
            const data = doc.data();
            const expenseDate =
              data.date instanceof Timestamp
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

            console.log(
              `方法2添加支出: ${data.amount}, 日期: ${expenseDate.toLocaleDateString()}, 記錄ID: ${doc.id}`,
            );
          });
        } catch (err) {
          console.warn(`字符串日期查詢方法失敗:`, err);
        }
      }

      // 方法3: 獲取全部支出記錄並手動篩選
      if (expenses.length === 0) {
        try {
          console.log(`使用全量查詢並手動篩選日期範圍`);

          const q3 = query(
            expensesRef,
            where("userId", "==", userId),
            orderBy("date", "desc"),
          );

          const querySnapshot3 = await getDocs(q3);
          console.log(
            `方法3(全量查詢): 總共有 ${querySnapshot3.size} 條支出記錄`,
          );

          let matchCount = 0;

          // 手動篩選符合日期範圍的記錄
          querySnapshot3.forEach((doc) => {
            const data = doc.data();
            let expenseDate: Date | null = null;

            // 嘗試解析多種可能的日期格式
            if (data.date) {
              if (typeof data.date === "string") {
                // 字符串格式日期
                expenseDate = new Date(data.date);
              } else if (typeof data.date.toDate === "function") {
                // Firestore Timestamp 對象
                expenseDate = data.date.toDate();
              } else if (data.date.seconds) {
                // Firestore Timestamp 對象的另一種訪問方式
                expenseDate = new Date(data.date.seconds * 1000);
              } else if (data.date instanceof Date) {
                // 原生 Date 對象
                expenseDate = data.date;
              }
            }

            // 檢查日期是否在範圍內
            if (expenseDate) {
              console.log(
                `支出日期: ${expenseDate.toLocaleDateString()} vs 範圍: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
              );

              // 將日期設置為當天的零點以便比較
              const expenseDateZero = new Date(expenseDate);
              expenseDateZero.setHours(0, 0, 0, 0);

              const startDateZero = new Date(startDate);
              startDateZero.setHours(0, 0, 0, 0);

              const endDateZero = new Date(endDate);
              endDateZero.setHours(23, 59, 59, 999);

              const isInRange =
                expenseDateZero >= startDateZero &&
                expenseDateZero <= endDateZero;

              if (isInRange) {
                matchCount++;
                const amount = data.amount;
                expenses.push({
                  id: doc.id,
                  amount: amount,
                  category: data.category,
                  date: expenseDate,
                  notes: data.notes || "",
                  userId: data.userId,
                });

                console.log(
                  `方法3添加支出: ${amount}, 日期: ${expenseDate.toLocaleDateString()}, 記錄ID: ${doc.id}`,
                );
              }
            }
          });

          console.log(`方法3匹配到 ${matchCount} 條在日期範圍內的記錄`);
        } catch (err) {
          console.warn(`全量查詢方法失敗:`, err);
        }
      }

      console.log(
        `最終結果: 用戶 ${userId} 在該時間範圍內總共找到 ${expenses.length} 條支出記錄`,
      );
      return expenses;
    } catch (error) {
      console.error("加載支出詳情失敗:", error);
      return [];
    }
  };

  // 顯示成員詳情
  const handleViewMemberDetails = async (member: LeaderboardMember) => {
    if (!selectedLeaderboard) return;

    try {
      // 檢查是否已經顯示該成員的支出 - 如已顯示則關閉(切換功能)
      if (memberExpenses[member.userId]) {
        console.log(`切換關閉用戶 ${member.userId} 的支出詳情`);
        setMemberExpenses((prev) => {
          const newState = { ...prev };
          delete newState[member.userId];
          return newState;
        });
        return;
      }

      // 進行中的排行榜，禁止查看任何人的支出明細（包括自己）
      if (!isLeaderboardCompleted(selectedLeaderboard)) {
        console.log(`進行中的排行榜，禁止查看任何用戶的支出明細`);

        // 顯示無權限查看的提示，但不提供實際數據
        setMemberExpenses((prev) => ({
          ...prev,
          [member.userId]: [], // 空數組但有特殊標記表示為隱私保護
        }));

        // 在錯誤信息中提示隱私保護
        setError("進行中的排行榜不顯示任何支出明細");
        setTimeout(() => setError(""), 3000); // 3秒後自動清除錯誤提示
        return;
      }

      // 以下代碼只有在排行榜已結束時才會執行

      // 不允許查看自己的支出明細
      if (member.userId === currentUser?.uid) {
        console.log(`不允許查看自己的支出明細`);
        return; // 直接返回，不設置任何狀態
      }

      // 先檢查是否有支出，0元的用戶不需要查詢支出詳情
      if (member.totalExpense <= 0) {
        console.log(`用戶 ${member.userId} 沒有支出記錄，不顯示詳情`);
        return;
      }

      // 標記該成員為加載中狀態
      setLoadingMemberIds((prev) => [...prev, member.userId]);

      console.log(
        `開始獲取用戶 ${member.userId} (${member.nickname || "未知用戶"}) 的支出詳情`,
      );

      // 加載支出詳情
      const expenses = await loadMemberExpenses(
        member.userId,
        member.allowViewDetail || member.userId === currentUser?.uid,
        selectedLeaderboard.startDate,
        selectedLeaderboard.endDate,
      );

      console.log(
        `獲取到 ${expenses.length} 條支出記錄，總額 ${member.totalExpense}`,
      );

      // 檢查是否存在數據不一致問題
      if (expenses.length === 0 && member.totalExpense > 0) {
        console.warn(
          `發現數據不一致：用戶 ${member.userId} 有總額 ${member.totalExpense} 但無法獲取詳細記錄`,
        );
      }

      // 更新狀態，顯示支出詳情
      setMemberExpenses((prev) => ({
        ...prev,
        [member.userId]: expenses,
      }));

      // 移除加載中狀態
      setLoadingMemberIds((prev) => prev.filter((id) => id !== member.userId));
    } catch (error) {
      console.error("加載成員支出詳情失敗:", error);

      // 更新狀態，顯示錯誤
      setMemberExpenses((prev) => ({
        ...prev,
        [member.userId]: [], // 空數組表示無數據或加載失敗
      }));

      // 移除加載中狀態
      setLoadingMemberIds((prev) => prev.filter((id) => id !== member.userId));

      // 如果是當前用戶出現數據問題，顯示錯誤提示
      if (member.userId === currentUser?.uid) {
        setError(
          `加載您的支出詳情失敗：${error instanceof Error ? error.message : "未知錯誤"}`,
        );
      }
    }
  };

  // 查看排行榜詳情
  const handleViewLeaderboard = (leaderboard: Leaderboard) => {
    setSelectedLeaderboard(leaderboard);
    setMemberExpenses({});
  };

  // 檢查排行榜是否已結束
  const isLeaderboardCompleted = (leaderboard: Leaderboard): boolean => {
    const now = new Date();
    return new Date(leaderboard.endDate) < now;
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

      {error && (
        <div className="bg-red-50 text-red-500 p-3 rounded-lg mb-4 text-sm">
          {error}
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
                                  <div className="text-xs text-gray-500">
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
                          currentUser?.uid ? null : isLoading ? (
                          // 載入中狀態
                          <div className="text-center py-6">
                            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-[#A487C3] mb-2"></div>
                            <p className="text-gray-500 text-sm">
                              正在載入支出詳情...
                            </p>
                          </div>
                        ) : memberExpenses[userId].length === 0 ? (
                          <div className="text-center py-4 text-gray-500">
                            {member.totalExpense > 0 ? (
                              <>
                                <i className="fas fa-exclamation-circle text-yellow-500 text-xl mb-2"></i>
                                <p className="text-yellow-600">
                                  該週期內有支出記錄（共計{" "}
                                  {formatAmount(member.totalExpense)}
                                  ），但暫時無法顯示詳細支出
                                </p>
                                <p className="text-xs mt-1 text-gray-600">
                                  點擊下方按鈕可以自動修復此問題
                                </p>

                                {/* 添加同步按鈕 */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation(); // 防止事件冒泡
                                    if (selectedLeaderboard) {
                                      syncExpenseRecords(selectedLeaderboard);
                                    }
                                  }}
                                  className="mt-3 px-3 py-1.5 bg-[#A487C3] hover:bg-[#8A5DC8] text-white text-sm rounded-lg transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white"
                                  disabled={loading}
                                >
                                  {loading ? "同步中..." : "重新同步支出記錄"}
                                </button>

                                <p className="text-xs mt-3 text-gray-500 border-t border-gray-200 pt-2">
                                  技術說明：系統已記錄總支出金額，但需要同步詳細記錄以顯示完整資訊
                                </p>
                              </>
                            ) : (
                              <p>該週期內沒有支出記錄</p>
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
                            className="flex items-center justify-between w-full bg-white border border-gray-200 hover:border-[#A487C3] focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-white rounded-lg p-4 text-left"
                          >
                            <div>
                              <p className="font-medium text-gray-800">
                                {leaderboard.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {leaderboard.members.length} 位成員 •
                                {leaderboard.timeRange === "week" && "一週"}
                                {leaderboard.timeRange === "month" && "一月"}
                                {leaderboard.timeRange === "year" && "一年"}
                                {leaderboard.timeRange === "custom" && "自定義"}
                                • 結束於 {formatDate(leaderboard.endDate)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-green-50 text-green-600 rounded-full text-xs">
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
                            className="flex items-center justify-between w-full bg-white border border-gray-200 hover:border-[#A487C3] focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-white rounded-lg p-4 text-left"
                          >
                            <div>
                              <p className="font-medium text-gray-800">
                                {leaderboard.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {leaderboard.members.length} 位成員 •
                                {leaderboard.timeRange === "week" && "一週"}
                                {leaderboard.timeRange === "month" && "一月"}
                                {leaderboard.timeRange === "year" && "一年"}
                                {leaderboard.timeRange === "custom" && "自定義"}
                                • 結束於 {formatDate(leaderboard.endDate)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
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
