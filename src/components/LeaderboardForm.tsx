import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";

// 更新類型引用
import { Leaderboard, LeaderboardMember } from "../contexts/AuthContext";

// 時間範圍類型
type TimeRangeType = "week" | "month" | "year" | "custom";

interface LeaderboardFormProps {
  onClose: () => void;
}

// 好友類型定義
interface Friend {
  id: string;
  nickname: string;
  photoURL?: string;
  email: string;
  isSelected: boolean;
}

const LeaderboardForm: React.FC<LeaderboardFormProps> = ({ onClose }) => {
  const {
    currentUser,
    userNickname,
    getFriends,
    createLeaderboard,
    getLeaderboards,
    getLeaderboardInvites,
  } = useAuth();
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeTab, setActiveTab] = useState<"leaderboards">("leaderboards");
  const [newLeaderboardName, setNewLeaderboardName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeaderboard, setSelectedLeaderboard] =
    useState<Leaderboard | null>(null);
  const [editingLeaderboard, setEditingLeaderboard] =
    useState<Leaderboard | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeType>("month");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [statisticalPeriod, setStatisticalPeriod] = useState<
    "this_week" | "this_month" | "this_year" | "custom" | null
  >(null);
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [inviteCount, setInviteCount] = useState(0);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: new Date(),
    endDate: new Date(),
  });

  // 加載數據
  useEffect(() => {
    if (currentUser) {
      setInitialLoading(true);
      Promise.all([loadLeaderboards(), loadFriends(), loadInvites()]).finally(
        () => {
          setInitialLoading(false);
        },
      );
    }
  }, [currentUser]);

  // 使用 useEffect 監聽事件
  useEffect(() => {
    // 統一的處理函數，無論通過哪種事件觸發
    const handleReturnToManager = (event?: Event) => {
      console.log(
        "LeaderboardForm 準備顯示排行榜管理頁面",
        event?.type || "手動調用",
      );

      // 確保返回到排行榜列表視圖
      setActiveTab("leaderboards");
      setSelectedLeaderboard(null);

      // 可能需要刷新數據
      loadLeaderboards();
      loadFriends();
      loadInvites();
    };

    // 處理原有事件
    window.addEventListener("openLeaderboardManager", handleReturnToManager);

    // 增加新的返回事件監聽
    window.addEventListener(
      "returnToLeaderboardManager",
      handleReturnToManager,
    );

    // 添加回調函數方式
    if (typeof window !== "undefined") {
      console.log("註冊openLeaderboardManagerCallback回調函數");
      (window as any).openLeaderboardManagerCallback = handleReturnToManager;

      // 檢查是否有全局標誌需要顯示排行榜管理
      if ((window as any).__shouldShowLeaderboardManager) {
        console.log(
          "檢測到全局標誌__shouldShowLeaderboardManager，執行返回操作",
        );
        handleReturnToManager();
        // 清除標誌
        (window as any).__shouldShowLeaderboardManager = false;
      }
    }

    return () => {
      // 清理事件監聽器
      window.removeEventListener(
        "openLeaderboardManager",
        handleReturnToManager,
      );
      window.removeEventListener(
        "returnToLeaderboardManager",
        handleReturnToManager,
      );

      // 清理回調函數
      if (typeof window !== "undefined") {
        console.log("清理openLeaderboardManagerCallback回調函數");
        delete (window as any).openLeaderboardManagerCallback;
      }
    };
  }, []);

  // 加載排行榜資料
  const loadLeaderboards = async () => {
    try {
      setLoading(true);
      console.log("開始加載排行榜數據");
      const leaderboardsData = await getLeaderboards();
      console.log("排行榜數據加載完成:", leaderboardsData);
      setLeaderboards(leaderboardsData);
    } catch (error) {
      console.error("加載排行榜失敗:", error);
      setError("加載排行榜失敗");
    } finally {
      setLoading(false);
    }
  };

  // 加載好友資料
  const loadFriends = async () => {
    setLoading(true);
    try {
      const friendsData = await getFriends();
      console.log("獲取到的好友數據:", friendsData);

      // 轉換為組件所需的格式，確保每個好友都有有效的ID
      const formattedFriends = friendsData.map((friend: any) => ({
        id: friend.id || friend.uid || "", // 優先使用id，然後是uid，確保ID不為空
        nickname: friend.displayName || friend.nickname || "未命名好友",
        email: friend.email || "無郵箱",
        photoURL: friend.photoURL || "",
        isSelected: false,
      }));

      // 嚴格去重 - 根據id去除重複項
      const uniqueMap = new Map();
      formattedFriends.forEach((friend) => {
        // 使用id作為主要key
        if (friend.id && !uniqueMap.has(friend.id)) {
          uniqueMap.set(friend.id, friend);
        }
      });

      // 轉換回陣列並過濾掉沒有ID的好友
      const validFriends = Array.from(uniqueMap.values()).filter(
        (friend) => friend.id && friend.id.trim() !== "",
      );

      console.log(
        `好友列表處理完成: 原始數據=${friendsData.length}, 格式化後=${formattedFriends.length}, 去重後=${validFriends.length}`,
      );
      setFriends(validFriends);
    } catch (error) {
      console.error("加載好友列表失敗:", error);
      setError("無法加載好友列表，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  // 加載排行榜邀請數量
  const loadInvites = async () => {
    try {
      const invites = await getLeaderboardInvites();
      setInviteCount(invites.length);
    } catch (error) {
      console.error("獲取排行榜邀請失敗:", error);
    }
  };

  // 更新隱私設定函數
  const updatePrivacySettings = async (
    leaderboardId: string,
    allowViewDetail: boolean,
  ) => {
    try {
      if (!currentUser) throw new Error("用戶未登錄");

      // 獲取排行榜文檔引用
      const leaderboardRef = doc(db, "leaderboards", leaderboardId);

      // 獲取當前排行榜數據
      const leaderboardDoc = await getDoc(leaderboardRef);
      if (!leaderboardDoc.exists()) throw new Error("排行榜不存在");

      const leaderboardData = leaderboardDoc.data();

      // 更新成員的隱私設置
      const updatedMembers = leaderboardData.members.map((member: any) => {
        if (member.userId === currentUser.uid) {
          return { ...member, allowViewDetail };
        }
        return member;
      });

      // 更新Firebase文檔
      await updateDoc(leaderboardRef, { members: updatedMembers });

      setSuccess("隱私設定已更新");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error: any) {
      console.error("更新隱私設定失敗:", error);
      throw error;
    }
  };

  // 刪除排行榜函數
  const deleteLeaderboard = async (leaderboardId: string) => {
    try {
      if (!currentUser) throw new Error("用戶未登錄");

      // 獲取排行榜文檔引用
      const leaderboardRef = doc(db, "leaderboards", leaderboardId);

      // 刪除Firebase文檔
      await deleteDoc(leaderboardRef);

      // 從本地狀態移除
      setLeaderboards((prev) =>
        prev.filter((board) => board.id !== leaderboardId),
      );

      return true;
    } catch (error: any) {
      console.error("刪除排行榜失敗:", error);
      throw error;
    }
  };

  // 編輯排行榜名稱
  const handleEditLeaderboardName = (
    leaderboardId: string,
    newName: string,
  ) => {
    if (!newName.trim()) {
      setError("排行榜名稱不能為空");
      return;
    }

    setLeaderboards((prev) =>
      prev.map((board) =>
        board.id === leaderboardId ? { ...board, name: newName } : board,
      ),
    );

    setSuccess("排行榜名稱已更新");
    setTimeout(() => setSuccess(""), 3000);

    // 如果正在編輯的排行榜是當前顯示的排行榜，更新當前顯示
    if (selectedLeaderboard && selectedLeaderboard.id === leaderboardId) {
      setSelectedLeaderboard({
        ...selectedLeaderboard,
        name: newName,
      });
    }

    // 重置編輯狀態
    setEditingLeaderboard(null);
  };

  // 格式化日期函數
  const formatDate = (dateValue: any): string => {
    try {
      // 檢查日期是否有效
      if (!dateValue) return "未設置";

      // 嘗試將各種可能的日期格式轉換為Date對象
      let dateObj: Date;

      if (dateValue instanceof Date) {
        dateObj = dateValue;
      } else if (
        typeof dateValue === "object" &&
        dateValue.toDate &&
        typeof dateValue.toDate === "function"
      ) {
        // 處理Firestore時間戳格式 - 使用toDate()函數
        dateObj = dateValue.toDate();
      } else if (typeof dateValue === "object" && dateValue.seconds) {
        // 處理Firestore時間戳格式 - 使用seconds
        dateObj = new Date(dateValue.seconds * 1000);
      } else if (typeof dateValue === "string") {
        dateObj = new Date(dateValue);
      } else if (typeof dateValue === "number") {
        dateObj = new Date(dateValue);
      } else {
        console.error("無法識別的日期格式:", dateValue);
        return "日期格式錯誤";
      }

      // 確認日期是否有效
      if (isNaN(dateObj.getTime())) {
        console.error("無效的日期對象:", dateValue);
        return "無效日期";
      }

      // 格式化為 YYYY/MM/DD
      const formattedDate = `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, "0")}/${String(dateObj.getDate()).padStart(2, "0")}`;

      // 輸出用於調試
      console.log(
        `格式化日期: 輸入=${JSON.stringify(dateValue)}, 輸出=${formattedDate}`,
      );

      return formattedDate;
    } catch (error) {
      console.error("日期格式化錯誤:", error, dateValue);
      return "日期錯誤";
    }
  };

  // 時間範圍變更處理
  const handleTimeRangeChange = (
    value: TimeRangeType | React.ChangeEvent<HTMLSelectElement>,
  ) => {
    // 如果接收到的是事件對象，從事件中獲取值
    const rangeValue =
      typeof value === "object" && "target" in value
        ? (value.target.value as TimeRangeType)
        : (value as TimeRangeType);

    setTimeRange(rangeValue);

    // 根據選擇設置日期範圍
    const today = new Date();
    let startDate = new Date();
    let endDate = new Date();

    console.log(
      `時間範圍變更: ${rangeValue}, 當前日期: ${today.toLocaleDateString()}`,
    );

    switch (rangeValue) {
      case "week":
        // 將開始日期設置為今天
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);

        // 將結束日期設置為今天+6天
        endDate = new Date();
        endDate.setHours(0, 0, 0, 0);
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);

        console.log(
          `週範圍: 開始=${startDate.toLocaleDateString()}, 結束=${endDate.toLocaleDateString()}`,
        );
        break;

      case "month":
        // 設置為本月1日到月底
        startDate = new Date();
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0); // 本月最後一天
        endDate.setHours(23, 59, 59, 999);

        console.log(
          `月範圍: 開始=${startDate.toLocaleDateString()}, 結束=${endDate.toLocaleDateString()}`,
        );
        break;

      case "year":
        // 從當前日期開始，往後推一年
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date(startDate);
        endDate.setFullYear(endDate.getFullYear() + 1);
        endDate.setHours(23, 59, 59, 999);

        console.log(
          `年範圍: 開始=${startDate.toLocaleDateString()}, 結束=${endDate.toLocaleDateString()}`,
        );
        break;

      case "custom":
        // 保持自定義日期不變或設置默認範圍
        if (!customStartDate || !customEndDate) {
          setCustomStartDate(today);
          setCustomEndDate(today);
        }
        return; // 自定義日期不需要更新startDate和endDate
    }

    // 更新自定義日期範圍
    setCustomStartDate(startDate);
    setCustomEndDate(endDate);

    console.log(
      `更新後的日期範圍: 從 ${startDate.toLocaleDateString()} 到 ${endDate.toLocaleDateString()}`,
    );
  };

  // 處理創建排行榜
  const handleCreateLeaderboard = async () => {
    if (!newLeaderboardName.trim() || !statisticalPeriod) {
      setError("請輸入排行榜名稱並選擇統計時間範圍");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 根據選擇的時間範圍設置類型
      let timeRange: TimeRangeType;
      let start: Date = new Date();
      let end: Date = new Date();

      console.log(
        `創建排行榜：類型=${statisticalPeriod}, 名稱=${newLeaderboardName}`,
      );

      switch (statisticalPeriod) {
        case "this_week":
          timeRange = "week";
          // 設置為從今天開始的一週（而不是從本週一開始）
          start = new Date();
          start.setHours(0, 0, 0, 0);

          // 設置為從今天開始往後6天
          end = new Date();
          end.setDate(end.getDate() + 6); // 當前日+6天=一週
          end.setHours(23, 59, 59, 999);

          console.log(
            `週範圍：開始=${start.toLocaleDateString()}, 結束=${end.toLocaleDateString()}`,
          );
          break;

        case "this_month":
          timeRange = "month";
          break;

        case "this_year":
          timeRange = "year";
          break;

        case "custom":
          timeRange = "custom";
          if (
            customStartDate instanceof Date &&
            !isNaN(customStartDate.getTime()) &&
            customEndDate instanceof Date &&
            !isNaN(customEndDate.getTime())
          ) {
            start = customStartDate;
            end = customEndDate;
            console.log(
              `自定義範圍：開始=${start.toLocaleDateString()}, 結束=${end.toLocaleDateString()}`,
            );
          } else {
            setError("請選擇有效的自定義日期範圍");
            setLoading(false);
            return;
          }
          break;

        default:
          setError("無效的時間範圍");
          setLoading(false);
          return;
      }

      // 創建排行榜
      const selectedFriendIds = friends
        .filter((friend) => friend.isSelected)
        .map((friend) => friend.id);

      console.log(
        `最終排行榜設置：名稱=${newLeaderboardName}, 時間範圍=${timeRange}, 開始=${start.toLocaleDateString()}, 結束=${end.toLocaleDateString()}, 好友數=${selectedFriendIds.length}`,
      );

      await createLeaderboard(
        newLeaderboardName,
        selectedFriendIds,
        timeRange,
        start,
        end,
      );

      // 重新加載排行榜列表
      await loadLeaderboards();

      // 找到新創建的排行榜並選中它
      const newlyCreatedLeaderboard = leaderboards.find(
        (lb) => lb.id === selectedFriendIds[0],
      );
      if (newlyCreatedLeaderboard) {
        setSelectedLeaderboard(newlyCreatedLeaderboard);
      }

      // 重設表單狀態
      setNewLeaderboardName("");
      setStatisticalPeriod(null);
      setCustomStartDate(new Date());
      setCustomEndDate(new Date());

      // 重設好友選擇狀態
      setFriends((prev) =>
        prev.map((friend) => ({ ...friend, isSelected: false })),
      );

      setSuccess("排行榜創建成功！");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error: any) {
      console.error("創建排行榜失敗:", error);
      setError(
        `創建排行榜失敗: ${error instanceof Error ? error.message : "未知錯誤"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  // 搜尋好友
  const handleSearchFriend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setError("請輸入搜尋關鍵字");
      return;
    }

    // 模擬搜尋功能
    setSuccess("找到相符的用戶！");
    setTimeout(() => setSuccess(""), 3000);

    // 模擬添加搜尋結果
    const newFriend: Friend = {
      id: `search_${Date.now()}`,
      nickname: searchQuery,
      email: `${searchQuery.toLowerCase()}@example.com`,
      photoURL: "",
      isSelected: false,
    };

    setFriends((prev) => [...prev, newFriend]);
    setSearchQuery("");
  };

  // 渲染好友列表時過濾掉已經是當前排行榜成員的好友
  const renderFriendList = () => {
    if (loading) {
      return <p className="text-gray-600 text-center py-4">加載好友中...</p>;
    }

    if (friends.length === 0) {
      return (
        <p className="text-gray-600 text-center py-4">您還沒有添加任何好友</p>
      );
    }

    // 過濾掉已經在當前排行榜中的好友
    const filteredFriends = friends.filter((friend) => {
      // 確保好友數據有效
      if (!friend || !friend.id) return false;

      // 如果沒有選擇排行榜或排行榜沒有成員，則顯示所有好友
      if (!selectedLeaderboard || !selectedLeaderboard.members) {
        return true;
      }
      // 檢查該好友是否已經是排行榜成員
      return !selectedLeaderboard.members.some(
        (member: { userId: string }) => member.userId === friend.id,
      );
    });

    console.log(
      `可顯示的好友：總數=${friends.length}, 過濾後=${filteredFriends.length}`,
    );

    if (filteredFriends.length === 0) {
      return (
        <p className="text-gray-600 text-center py-4">
          所有好友都已在此排行榜中
        </p>
      );
    }

    return (
      <ul className="space-y-2">
        {filteredFriends.map((friend) => (
          <li
            key={friend.id}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors duration-200"
            onClick={() => toggleFriendSelection(friend.id)}
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {friend.photoURL ? (
                  <img
                    src={friend.photoURL}
                    alt={friend.nickname}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-600 text-sm font-medium">
                    {friend.nickname.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">
                  {friend.nickname}
                </p>
                <p className="text-xs text-gray-500 truncate">{friend.email}</p>
              </div>
            </div>
            <div className="flex items-center ml-2 text-sm select-none">
              {friend.isSelected ? (
                <span className="flex items-center text-[#A487C3] font-medium">
                  <i className="fas fa-check-circle mr-1"></i> 已選擇
                </span>
              ) : (
                <span className="flex items-center text-gray-500 hover:text-[#A487C3]">
                  <i className="far fa-circle mr-1"></i> 點擊選擇
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  // 切換好友選擇狀態
  const toggleFriendSelection = (friendId: string) => {
    console.log(`切換好友選擇狀態: ${friendId}`);
    setFriends((prev) =>
      prev.map((friend) => {
        if (friend.id === friendId) {
          const newState = !friend.isSelected;
          console.log(
            `好友 ${friend.nickname} (${friendId}) 選擇狀態變更為: ${newState}`,
          );
          return { ...friend, isSelected: newState };
        }
        return friend;
      }),
    );
  };

  // 切換全部好友的選擇狀態
  const toggleAllFriends = () => {
    // 獲取可顯示的好友列表
    const displayableFriends = friends.filter((friend) => {
      if (!friend || !friend.id) return false;
      if (!selectedLeaderboard || !selectedLeaderboard.members) return true;
      return !selectedLeaderboard.members.some(
        (member) => member.userId === friend.id,
      );
    });

    // 檢查是否已經全選 - 只針對可顯示的好友
    const allSelected = displayableFriends.every((friend) => friend.isSelected);

    // 如果已經全選，則取消所有選擇；否則全選可顯示的好友
    setFriends((prev) =>
      prev.map((friend) => {
        // 只更改可顯示好友的選擇狀態
        const isDisplayable = !selectedLeaderboard?.members?.some(
          (member) => member.userId === friend.id,
        );
        if (isDisplayable) {
          return { ...friend, isSelected: !allSelected };
        }
        return friend;
      }),
    );

    console.log(`全選/取消全選: 當前狀態=${!allSelected}`);
  };

  // 選擇排行榜
  const handleSelectLeaderboard = (leaderboard: Leaderboard) => {
    // 在切換排行榜時重置所有好友的選擇狀態
    setFriends((prev) =>
      prev.map((friend) => ({
        ...friend,
        isSelected: false,
      })),
    );
    setSelectedLeaderboard(leaderboard);
  };

  // 發送邀請
  const handleSendInvitations = async () => {
    try {
      setIsLoading(true);
      setError("");

      // 獲取所有選擇的好友
      const selectedFriends = friends.filter((f) => f.isSelected);
      if (selectedFriends.length === 0) {
        setError("請至少選擇一位好友");
        setIsLoading(false);
        return;
      }

      // 檢查所選好友是否有有效ID
      const invalidFriends = selectedFriends.filter(
        (friend) => !friend.id || friend.id.trim() === "",
      );
      if (invalidFriends.length > 0) {
        const invalidNicknames = invalidFriends
          .map((f) => f.nickname)
          .join(", ");
        setError(`部分好友缺少有效ID (${invalidNicknames})，無法發送邀請`);
        console.error("無效好友ID:", invalidFriends);
        setIsLoading(false);
        return;
      }

      // 確定是發送到現有排行榜還是創建新排行榜
      let targetLeaderboardId: string | undefined;
      let targetLeaderboardName: string = "";

      if (selectedLeaderboard) {
        // 如果有選中的排行榜，直接使用它
        targetLeaderboardId = selectedLeaderboard.id;
        targetLeaderboardName = selectedLeaderboard.name;
        console.log(
          "使用現有排行榜:",
          targetLeaderboardId,
          targetLeaderboardName,
        );
      } else if (newLeaderboardName.trim() && statisticalPeriod) {
        // 沒有選中排行榜，需要創建新排行榜

        // 設置時間範圍
        let timeRangeOption: "week" | "month" | "year" | "custom" = "month";
        let startDateValue: Date = new Date();
        let endDateValue: Date = new Date();

        // 根據選擇的統計期間設置時間範圍
        switch (statisticalPeriod) {
          case "this_week":
            timeRangeOption = "week";
            break;
          case "this_month":
            timeRangeOption = "month";
            break;
          case "this_year":
            timeRangeOption = "year";
            break;
          case "custom":
            timeRangeOption = "custom";
            if (customStartDate && customEndDate) {
              startDateValue = new Date(customStartDate);
              endDateValue = new Date(customEndDate);
            }
            break;
        }

        // 使用createLeaderboard創建新排行榜
        try {
          console.log("創建新排行榜:", newLeaderboardName);
          const newLeaderboardId = await createLeaderboard(
            newLeaderboardName,
            [], // 暫時不添加好友，等邀請接受後再添加
            timeRangeOption,
            timeRangeOption === "custom" ? startDateValue : undefined,
            timeRangeOption === "custom" ? endDateValue : undefined,
          );
          targetLeaderboardId = newLeaderboardId;
          targetLeaderboardName = newLeaderboardName;
          console.log(
            "新排行榜已創建:",
            targetLeaderboardId,
            targetLeaderboardName,
          );

          // 重新加載排行榜列表
          await loadLeaderboards();

          // 找到新創建的排行榜並選中它
          const newlyCreatedLeaderboard = leaderboards.find(
            (lb) => lb.id === newLeaderboardId,
          );
          if (newlyCreatedLeaderboard) {
            setSelectedLeaderboard(newlyCreatedLeaderboard);
          }

          // 重置創建排行榜的表單字段
          setNewLeaderboardName("");
          setStatisticalPeriod(null);
          setCustomStartDate(new Date());
          setCustomEndDate(new Date());
        } catch (error) {
          console.error("創建排行榜失敗:", error);
          setError(
            `創建排行榜失敗: ${error instanceof Error ? error.message : "未知錯誤"}`,
          );
          setIsLoading(false);
          return;
        }
      } else {
        // 既沒有選中排行榜，也沒有輸入新排行榜信息
        setError("請選擇一個排行榜或創建新排行榜");
        setIsLoading(false);
        return;
      }

      if (!targetLeaderboardId) {
        setError("無法創建排行榜或獲取排行榜ID");
        setIsLoading(false);
        return;
      }

      // 創建排行榜邀請集合的引用
      const invitesRef = collection(db, "leaderboardInvites");

      // 獲取當前用戶信息
      if (!currentUser) {
        setError("用戶未登錄");
        setIsLoading(false);
        return;
      }

      const userRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        setError("用戶資料不存在");
        setIsLoading(false);
        return;
      }

      const userData = userDoc.data();

      console.log(
        "開始發送邀請給好友，排行榜:",
        targetLeaderboardId,
        targetLeaderboardName,
      );

      // 為每個選定的好友發送邀請
      const invitePromises = selectedFriends
        .filter((friend) => friend.id && friend.id.trim() !== "") // 再次確保只處理有效的ID
        .map(async (friend) => {
          console.log(`處理好友邀請: ${friend.nickname} (ID: ${friend.id})`);

          if (!friend.id || friend.id.trim() === "") {
            console.warn(`跳過好友 ${friend.nickname} - ID無效`);
            return null; // 跳過此好友
          }

          // 創建邀請文檔
          const inviteData = {
            from: {
              userId: currentUser.uid,
              nickname: userNickname || userData.nickname || "未命名用戶",
              photoURL: userData.photoURL || null,
            },
            to: friend.id,
            leaderboardId: targetLeaderboardId,
            leaderboardName: targetLeaderboardName,
            status: "pending",
            createdAt: serverTimestamp(),
          };

          console.log("發送邀請數據:", inviteData);

          // 使用setDoc創建新文檔
          try {
            await setDoc(doc(invitesRef), inviteData);
            return friend.nickname; // 返回成功邀請的好友暱稱
          } catch (error) {
            console.error(`發送邀請給 ${friend.nickname} 失敗:`, error);
            throw new Error(
              `發送邀請給 ${friend.nickname} 失敗: ${error instanceof Error ? error.message : "未知錯誤"}`,
            );
          }
        });

      // 等待所有邀請發送完成
      const results = await Promise.all(invitePromises);
      const successfulInvites = results.filter(Boolean);

      setSuccess(`已成功發送邀請給 ${successfulInvites.length} 位好友！`);
      setTimeout(() => setSuccess(""), 3000);

      // 重設選擇狀態
      setFriends((prev) =>
        prev.map((friend) => ({ ...friend, isSelected: false })),
      );
    } catch (error) {
      console.error("發送邀請失敗:", error);
      setError(
        `發送邀請失敗: ${error instanceof Error ? error.message : "未知錯誤"}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[#A487C3]">排行榜管理</h2>
        <div className="flex items-center gap-2">
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

      {success && (
        <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm">
          {success}
        </div>
      )}

      {/* 排行榜管理頁面 */}
      <div>
        {selectedLeaderboard ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setSelectedLeaderboard(null)}
                className="flex items-center gap-1 bg-[#A487C3] hover:bg-[#C6B2DD] text-white px-4 py-2 rounded-lg text-sm transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white"
              >
                <i className="fas fa-arrow-left"></i>
                <span>返回排行榜列表</span>
              </button>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="space-y-4">
                <div>
                  {editingLeaderboard &&
                  editingLeaderboard.id === selectedLeaderboard.id ? (
                    <div className="space-y-4">
                      <div className="w-full">
                        <input
                          type="text"
                          value={editingLeaderboard.name}
                          onChange={(e) =>
                            setEditingLeaderboard({
                              ...editingLeaderboard,
                              name: e.target.value,
                            })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:border-[#A487C3] text-lg font-semibold transition-all duration-300"
                          placeholder="輸入排行榜名稱"
                        />
                      </div>
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => setEditingLeaderboard(null)}
                          className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-white"
                        >
                          取消
                        </button>
                        <button
                          onClick={() =>
                            handleEditLeaderboardName(
                              editingLeaderboard.id,
                              editingLeaderboard.name,
                            )
                          }
                          className="bg-[#A487C3] text-white px-4 py-2 rounded-lg hover:bg-[#C6B2DD] focus:outline-none focus:ring-2 focus:ring-white"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold">
                        {selectedLeaderboard.name}
                      </h3>
                      <button
                        onClick={() =>
                          setEditingLeaderboard({ ...selectedLeaderboard })
                        }
                        className="bg-[#A487C3] hover:bg-[#C6B2DD] text-white p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-white"
                      >
                        <i className="fas fa-pencil-alt text-white"></i>
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-medium mb-2">排行榜數據</h4>
                  <p className="text-sm text-gray-500 mb-2">
                    <span className="font-medium">統計週期:</span>
                    {selectedLeaderboard.timeRange === "week" && "一週"}
                    {selectedLeaderboard.timeRange === "month" && "一月"}
                    {selectedLeaderboard.timeRange === "year" && "一年"}
                    {selectedLeaderboard.timeRange === "custom" && "自定義"}
                    {selectedLeaderboard.startDate &&
                      selectedLeaderboard.endDate &&
                      ` (${formatDate(selectedLeaderboard.startDate)} - ${formatDate(selectedLeaderboard.endDate)})`}
                  </p>

                  <div className="space-y-2">
                    {[...selectedLeaderboard.members]
                      .sort((a, b) => b.totalExpense - a.totalExpense)
                      .map((member, index) => (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 flex items-center justify-center bg-[#A487C3] text-white rounded-full">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium">
                                {member.userId === currentUser?.uid
                                  ? `${member.nickname} (我)`
                                  : `用戶 ${String.fromCharCode(65 + index)}`}
                              </p>
                              <p className="text-xs text-gray-500">
                                {index === 0
                                  ? "領先排行榜"
                                  : (() => {
                                      // 計算與第一名的差額，確保不出現錯誤的0差額顯示
                                      const firstPlaceTotalExpense =
                                        selectedLeaderboard.members.sort(
                                          (a, b) =>
                                            b.totalExpense - a.totalExpense,
                                        )[0].totalExpense;
                                      const diff =
                                        firstPlaceTotalExpense -
                                        member.totalExpense;

                                      console.log(
                                        `計算差額: 第一名總花費=${firstPlaceTotalExpense}, ${member.nickname}總花費=${member.totalExpense}, 差額=${diff}`,
                                      );

                                      return `比第 1 名少花費 ${diff} 元`;
                                    })()}
                              </p>
                            </div>
                          </div>
                          <p className="font-semibold">
                            NT$ {member.totalExpense}
                          </p>
                        </div>
                      ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-4">
                    注意：排行榜顯示的是期間內的總消費金額
                  </p>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h4 className="font-medium mb-2">排行榜成員</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedLeaderboard.members.map((member) => (
                      <div
                        key={member.userId}
                        className="border border-gray-200 rounded-lg p-2 text-sm"
                      >
                        <p className="font-medium">
                          {member.userId === currentUser?.uid
                            ? `${member.nickname} (我)`
                            : member.nickname}
                        </p>
                        <p className="text-xs text-gray-500">
                          {member.userId === currentUser?.uid
                            ? "創建者"
                            : "成員"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 邀請好友到排行榜區塊 */}
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      邀請好友加入排行榜
                      <span className="ml-2 text-xs text-gray-500">
                        (點擊選擇好友)
                      </span>
                    </label>

                    {friends.filter((f) => f.isSelected).length > 0 && (
                      <button
                        onClick={handleSendInvitations}
                        className="bg-[#A487C3] text-white px-3 py-1 rounded-md hover:bg-[#C6B2DD] transition-colors text-sm disabled:opacity-50"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <span className="flex items-center">
                            <i className="fas fa-spinner fa-spin mr-1"></i>{" "}
                            發送中...
                          </span>
                        ) : (
                          <span>
                            發送邀請 (
                            {friends.filter((f) => f.isSelected).length})
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
                    <p className="text-sm text-blue-700 flex items-center">
                      <i className="fas fa-info-circle mr-2"></i>
                      邀請機制說明：選擇好友後，請點擊「發送邀請」按鈕。只有在好友同意後，才能將其加入排行榜。
                    </p>
                  </div>

                  {/* 好友列表 */}
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                      <div className="font-medium">
                        好友列表 (
                        {
                          friends.filter((friend) => {
                            if (!friend || !friend.id) return false;
                            if (
                              !selectedLeaderboard ||
                              !selectedLeaderboard.members
                            )
                              return true;
                            return !selectedLeaderboard.members.some(
                              (member) => member.userId === friend.id,
                            );
                          }).length
                        }
                        )
                      </div>
                      <button
                        onClick={toggleAllFriends}
                        className="text-xs bg-[#A487C3] hover:bg-[#C6B2DD] text-white px-2 py-1 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-white"
                      >
                        {friends.filter((f) => {
                          const isDisplayable =
                            !selectedLeaderboard?.members?.some(
                              (member) => member.userId === f.id,
                            );
                          return isDisplayable && f.isSelected;
                        }).length ===
                        friends.filter((f) => {
                          const isDisplayable =
                            !selectedLeaderboard?.members?.some(
                              (member) => member.userId === f.id,
                            );
                          return isDisplayable;
                        }).length
                          ? "取消全選"
                          : "全選"}
                      </button>
                    </div>

                    <div className="max-h-52 overflow-y-auto">
                      {renderFriendList()}
                    </div>
                  </div>

                  {/* 底部固定發送按鈕 */}
                  {friends.filter((f) => f.isSelected).length > 0 && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={handleSendInvitations}
                        className="bg-[#A487C3] text-white px-4 py-2 rounded-lg hover:bg-[#C6B2DD] transition-colors"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <span className="flex items-center">
                            <i className="fas fa-spinner fa-spin mr-2"></i>{" "}
                            發送邀請中...
                          </span>
                        ) : (
                          <span>
                            發送邀請給已選好友 (
                            {friends.filter((f) => f.isSelected).length})
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h4 className="font-medium mb-2">隱私設定</h4>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="allowViewDetail"
                      checked={
                        selectedLeaderboard.members.find(
                          (m) => m.userId === currentUser?.uid,
                        )?.allowViewDetail || false
                      }
                      onChange={(e) => {
                        if (currentUser && selectedLeaderboard.id) {
                          // 先在本地更新狀態
                          setSelectedLeaderboard((prev) => {
                            if (!prev) return prev;
                            const updatedMembers = prev.members.map(
                              (member) => {
                                if (member.userId === currentUser.uid) {
                                  return {
                                    ...member,
                                    allowViewDetail: e.target.checked,
                                  };
                                }
                                return member;
                              },
                            );
                            return { ...prev, members: updatedMembers };
                          });

                          // 呼叫API更新隱私設定
                          updatePrivacySettings(
                            selectedLeaderboard.id,
                            e.target.checked,
                          ).catch((error) => {
                            console.error("更新隱私設定失敗:", error);
                            setError("更新隱私設定失敗: " + error.message);
                          });
                        }
                      }}
                      className="h-4 w-4 text-pastel-pink-400 border-gray-300 rounded cursor-pointer"
                    />
                    <label
                      htmlFor="allowViewDetail"
                      className="text-sm text-gray-700 cursor-pointer"
                    >
                      允許排行榜成員查看我的詳細支出記錄
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    其他用戶將能夠查看您的支出記錄，但不能進行修改
                  </p>

                  {/* 添加刪除排行榜功能 - 僅限創建者可見 */}
                  {selectedLeaderboard.createdBy === currentUser?.uid && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              "確定要刪除這個排行榜嗎? 此操作無法撤銷。",
                            )
                          ) {
                            deleteLeaderboard(selectedLeaderboard.id)
                              .then(() => {
                                setSuccess("排行榜已成功刪除");
                                setSelectedLeaderboard(null);
                                loadLeaderboards(); // 重新加載排行榜列表
                              })
                              .catch((error) => {
                                console.error("刪除排行榜失敗:", error);
                                setError("刪除排行榜失敗: " + error.message);
                              });
                          }
                        }}
                        className="px-4 py-2 bg-[#FAC6CD] hover:bg-[#F7A8B2] text-white rounded-lg transition-colors"
                      >
                        刪除排行榜
                      </button>
                      <p className="text-xs text-gray-500 mt-1">
                        刪除排行榜將移除所有成員，此操作無法撤銷
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">我的排行榜</h3>

              {/* 返回排行榜按鈕 */}
              <button
                onClick={() => {
                  if (typeof window !== "undefined") {
                    // 觸發顯示排行榜頁面事件
                    const event = new CustomEvent("showLeaderboardViewer");
                    window.dispatchEvent(event);
                    // 關閉當前排行榜管理
                    onClose();
                  }
                }}
                className="flex items-center gap-2 bg-[#A487C3] hover:bg-[#C6B2DD] text-white px-4 py-2 rounded-lg text-sm transition-all duration-300 shadow-sm hover:shadow-md relative"
              >
                <i className="fas fa-list-ol"></i>
                <span>返回排行榜</span>
              </button>
            </div>

            {leaderboards.length > 0 ? (
              <div className="grid gap-3">
                {leaderboards.map((leaderboard) => (
                  <button
                    key={leaderboard.id}
                    onClick={() => handleSelectLeaderboard(leaderboard)}
                    className="flex items-center justify-between w-full bg-white border border-gray-200 hover:border-[#A487C3] focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-white rounded-lg p-4 text-left"
                  >
                    <div>
                      <p className="font-medium text-gray-800">
                        {leaderboard.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {leaderboard.members.length} 位成員 ·
                        {leaderboard.timeRange === "week" && "一週"}
                        {leaderboard.timeRange === "month" && "一月"}
                        {leaderboard.timeRange === "year" && "一年"}
                        {leaderboard.timeRange === "custom" && "自定義"}·{" "}
                        {leaderboard.startDate && leaderboard.endDate
                          ? `${formatDate(leaderboard.startDate)} 到 ${formatDate(leaderboard.endDate)}`
                          : `創建於 ${formatDate(leaderboard.createdAt)}`}
                      </p>
                    </div>
                    <i className="fas fa-chevron-right text-gray-400"></i>
                  </button>
                ))}
              </div>
            ) : initialLoading || loading ? (
              <div className="text-center py-6 bg-gray-50 rounded-lg">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#A487C3] mb-2"></div>
                <p className="text-gray-500">載入中...</p>
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 rounded-lg">
                <p className="text-gray-500 mb-2">還沒有任何排行榜</p>
                <p className="text-sm text-gray-400">
                  創建一個新的排行榜，邀請好友參與
                </p>
              </div>
            )}

            <div className="border-t border-gray-200 pt-4">
              <h3 className="font-medium mb-3">創建新排行榜</h3>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="leaderboardName"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    排行榜名稱
                  </label>
                  <input
                    type="text"
                    id="leaderboardName"
                    value={newLeaderboardName}
                    onChange={(e) => setNewLeaderboardName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-white"
                    placeholder="例如：公司同事排行、朋友聚會排行等"
                  />
                </div>

                <div className="mt-4">
                  <h4 className="text-md font-semibold mb-2">
                    選擇統計時間範圍:
                  </h4>
                  {!statisticalPeriod ? (
                    <div className="flex flex-wrap gap-2 mb-4">
                      <button
                        type="button"
                        onClick={() => {
                          handleTimeRangeChange("week");
                          setStatisticalPeriod("this_week");
                        }}
                        className={`px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white ${
                          timeRange === "week"
                            ? "bg-[#F8F3FF] text-[#A487C3] border border-[#A487C3]"
                            : "bg-white text-gray-600 hover:bg-[#F8F3FF] hover:text-[#A487C3] border border-gray-200"
                        }`}
                      >
                        一週
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleTimeRangeChange("month");
                          setStatisticalPeriod("this_month");
                        }}
                        className={`px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white ${
                          timeRange === "month"
                            ? "bg-[#F8F3FF] text-[#A487C3] border border-[#A487C3]"
                            : "bg-white text-gray-600 hover:bg-[#F8F3FF] hover:text-[#A487C3] border border-gray-200"
                        }`}
                      >
                        一月
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleTimeRangeChange("year");
                          setStatisticalPeriod("this_year");
                        }}
                        className={`px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white ${
                          timeRange === "year"
                            ? "bg-[#F8F3FF] text-[#A487C3] border border-[#A487C3]"
                            : "bg-white text-gray-600 hover:bg-[#F8F3FF] hover:text-[#A487C3] border border-gray-200"
                        }`}
                      >
                        一年
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleTimeRangeChange("custom");
                          setStatisticalPeriod("custom");
                        }}
                        className={`px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white ${
                          timeRange === "custom"
                            ? "bg-[#F8F3FF] text-[#A487C3] border border-[#A487C3]"
                            : "bg-white text-gray-600 hover:bg-[#F8F3FF] hover:text-[#A487C3] border border-gray-200"
                        }`}
                      >
                        自定義
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="px-4 py-2 bg-[#F8F3FF] rounded-lg text-[#A487C3] border border-[#A487C3] flex items-center">
                        <span className="font-medium">
                          {statisticalPeriod === "this_week" && "一週"}
                          {statisticalPeriod === "this_month" && "一月"}
                          {statisticalPeriod === "this_year" && "一年"}
                          {statisticalPeriod === "custom" && "自定義時間範圍"}
                        </span>
                        {statisticalPeriod === "custom" && (
                          <span className="ml-2 text-sm">
                            ({customStartDate.toLocaleDateString()} 至{" "}
                            {customEndDate.toLocaleDateString()})
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setStatisticalPeriod(null)}
                        className="text-[#A487C3] hover:text-[#8A5DC8] relative w-6 h-6 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white"
                        title="更改時間範圍"
                      >
                        <i className="fas fa-edit text-white bg-[#A487C3] p-1 rounded-full text-xs focus:outline-none focus:ring-1 focus:ring-white"></i>
                      </button>
                    </div>
                  )}

                  {statisticalPeriod === "custom" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          開始日期
                        </label>
                        <input
                          type="date"
                          value={
                            customStartDate instanceof Date &&
                            !isNaN(customStartDate.getTime())
                              ? customStartDate.toISOString().split("T")[0]
                              : new Date().toISOString().split("T")[0]
                          }
                          onChange={(e) =>
                            setCustomStartDate(new Date(e.target.value))
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          結束日期
                        </label>
                        <input
                          type="date"
                          value={
                            customEndDate instanceof Date &&
                            !isNaN(customEndDate.getTime())
                              ? customEndDate.toISOString().split("T")[0]
                              : new Date().toISOString().split("T")[0]
                          }
                          onChange={(e) =>
                            setCustomEndDate(new Date(e.target.value))
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4 flex justify-between">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-white"
                  >
                    取消
                  </button>

                  <button
                    onClick={handleCreateLeaderboard}
                    disabled={
                      loading ||
                      !newLeaderboardName.trim() ||
                      !statisticalPeriod
                    }
                    className={`px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-white ${
                      loading ||
                      !newLeaderboardName.trim() ||
                      !statisticalPeriod
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-[#A487C3] hover:bg-[#C6B2DD] text-white"
                    }`}
                  >
                    創建排行榜
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaderboardForm;
