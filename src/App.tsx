// The exported code uses Tailwind CSS. Install Tailwind CSS in your dev environment to ensure all styles work.
import React, { useState, useEffect, useRef, useCallback } from "react";
import * as echarts from "echarts";
import ExpenseForm from "./components/ExpenseForm";
import LoginForm from "./components/LoginForm";
import ProfileForm from "./components/ProfileForm";
import { useAuth } from "./contexts/AuthContext";
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  doc,
  deleteDoc,
  updateDoc,
  orderBy,
  setDoc,
  limit,
  serverTimestamp,
  Timestamp,
  getDoc,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import LeaderboardForm from "./components/LeaderboardForm";
import FriendManagement from "./components/FriendManagement";
import { format, isSameDay, subDays, startOfMonth, endOfMonth } from 'date-fns';
import LeaderboardInviteList from "./components/LeaderboardInviteList";
import { auth } from "./firebase";
import LeaderboardViewer from "./components/LeaderboardViewer";
import LeaderboardNotification from "./components/LeaderboardNotification";
import LoanManagement from "./components/LoanManagement"; // 引入借貸管理組件
import BudgetSetting from './components/BudgetSetting';
import BudgetNotification from './components/BudgetNotification';
import BudgetProgressBars from './components/BudgetProgressBars'; // 引入預算進度條組件
// 引入SplitExpenseManagement組件
import SplitExpenseManagement from "./components/SplitExpenseManagement";
import GroupInviteList from "./components/GroupInviteList"; // 引入群组邀请列表组件
import GroupInviteNotification from "./components/GroupInviteNotification"; // 引入群组邀请通知组件

// 支出類型定義
interface Expense {
  id: string;
  amount: number;
  category: {
    id: string;
    name: string;
  icon: string;
  };
  date: Date;
    notes: string;
  userId: string;
}

const App: React.FC = () => {
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [showLeaderboardForm, setShowLeaderboardForm] = useState(false);
  const [showFriendManagement, setShowFriendManagement] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLeaderboardInvites, setShowLeaderboardInvites] = useState(false);
  const [showGroupInvites, setShowGroupInvites] = useState(false); // 添加群组邀请弹窗显示状态
  const [showLeaderboardViewer, setShowLeaderboardViewer] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [leaderboardEndedNotifications, setLeaderboardEndedNotifications] =
    useState<any[]>([]);
  // 添加借貸到期通知狀態
  const [loanDueNotifications, setLoanDueNotifications] = useState<any[]>([]);
  const [loanOverdueNotifications, setLoanOverdueNotifications] = useState<any[]>([]);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null); // 正在編輯的支出
  const [successMessage, setSuccessMessage] = useState("記帳成功！"); // 自定義成功訊息
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null); // 選中的支出類別
  const [pieChartMode, setPieChartMode] = useState<'current' | 'selected' | 'all'>('all'); // 圓餅圖顯示模式
  const [pieChartMonth, setPieChartMonth] = useState<string>(
    new Date().toISOString().slice(0, 7) // 默認為當前月份，格式為 YYYY-MM
  );
const chartRef = useRef<HTMLDivElement>(null);
  const dailyChartRef = useRef<HTMLDivElement>(null);
  const {
    currentUser,
    login,
    logout,
    register,
    userNickname,
    getFriendRequests,
    getLeaderboardInvites,
    userProfileColor,
  } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalExpense, setTotalExpense] = useState(0);
  const [todayExpense, setTodayExpense] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // 用於存儲用戶數據緩存的對象
  const [userDataCache, setUserDataCache] = useState<Record<string, Expense[]>>(
    {},
  );
  // 用於標記是否處於數據恢復模式
  const [isRecoveryMode, setIsRecoveryMode] = useState<boolean>(false);
  // 用於標記是否是瀏覽器刷新加載的標記
  const [isBrowserRefresh, setIsBrowserRefresh] = useState<boolean>(false);
  // 添加計時器引用，用於管理成功訊息的顯示
  const successMessageTimer = useRef<number | undefined>(undefined);
  // 添加選取的日期狀態，默認為今天
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  // 添加一個狀態用於存儲支出表單的初始數據
  const [expenseParams, setExpenseParams] = useState<{
    amount: string;
    category: string;
    notes: string;
    date: string;
  } | null>(null);
  // 借貸管理的參數，從URL獲取
  const [loanParams, setLoanParams] = useState<{
    action: 'add-lend' | 'add-borrow';
    amount: string;
    person: string;
    description: string;
    date: string;
  } | null>(null);
  // 日期選項
  const dateOptions = [
    { value: new Date().toISOString().slice(0, 10), label: "今日" },
    {
      value: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      label: "昨日",
    },
    { value: "earlier", label: "更早" },
    { value: "all", label: "全部" },
  ];
  // 添加選擇的日期選項，區分"今日"，"昨日"，"更早"，"全部"
  const [selectedDateOption, setSelectedDateOption] = useState<
    "today" | "yesterday" | "this_week" | "last_week" | "earlier" | "all" | "month" | "month_select"
  >("today");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7) // 格式為 "YYYY-MM"
  );
  const [showMobileForm, setShowMobileForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [leaderboardInviteCount, setLeaderboardInviteCount] = useState(0);
  const [groupInviteCount, setGroupInviteCount] = useState(0); // 添加群组邀请计数状态
  const [loginFormMode, setLoginFormMode] = useState<"login" | "register">(
    "login",
  );

  // 宣告圖表實例變數以供全局使用
  const [chartInstance, setChartInstance] = useState<echarts.ECharts | null>(
    null,
  );
  const [dailyChartInstance, setDailyChartInstance] =
    useState<echarts.ECharts | null>(null);

  const [chartsKey, setChartsKey] = useState(0);
  // 添加圖例選擇狀態管理
  const [legendSelectedMap, setLegendSelectedMap] = useState<
    Record<string, boolean>
  >({});

  const [navScrolled, setNavScrolled] = useState(false);
    
    // 監聽滾動事件，實現導航欄滾動變化效果
  useEffect(() => {
      const handleScroll = () => {
        if (window.scrollY > 20) {
          setNavScrolled(true);
    } else {
          setNavScrolled(false);
        }
      };
      
      window.addEventListener('scroll', handleScroll);
      
      return () => {
        window.removeEventListener('scroll', handleScroll);
      };
    }, []);

  // 徹底重寫日期處理函數 - 使用最原始方式確保獲取當前日期
  const getTodayDate = () => {
    // 直接創建一個全新的日期對象，不用緩存，確保每次都獲取最新時間
    const now = new Date();
    // 直接重置時間為當天0點0分0秒，保留原始時區信息
    now.setHours(0, 0, 0, 0);
    // 輸出完整日期信息用於調試
    console.log("===獲取今日日期===", {
      日期對象: now.toString(),
      ISO格式: now.toISOString(),
      本地日期: now.toLocaleDateString("zh-TW"),
      時間戳: now.getTime(),
      年: now.getFullYear(),
      月: now.getMonth() + 1,
      日: now.getDate(),
    });
    return now;
  };

  // 在應用啟動時強制更新當前日期
  useEffect(() => {
    console.log("應用啟動，強制更新當前日期");
    // 強制獲取最新的當前日期
    const freshToday = getTodayDate();
    console.log("應用啟動使用的今日日期:", freshToday.toISOString());
    setSelectedDate(freshToday);
    setSelectedDateOption("today");
  }, []);

  // 監聽排行榜瀏覽器顯示事件
  useEffect(() => {
    const handleShowLeaderboardViewer = () => {
      console.log("接收到顯示排行榜瀏覽頁面事件");
      // 關閉排行榜管理頁面
      setShowLeaderboardForm(false);
      // 顯示排行榜瀏覽頁面
      setShowLeaderboardViewer(true);
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
  }, []);

  // 每當selectedDateOption變化時更新實際日期
  useEffect(() => {
    console.log("日期選項變更:", selectedDateOption);
    if (selectedDateOption === "today") {
      // 強制獲取最新的今天日期
      const currentToday = getTodayDate();
      console.log("更新為今天日期:", currentToday.toISOString());
      setSelectedDate(currentToday);
    } else if (selectedDateOption === "yesterday") {
      // 計算昨天日期
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      console.log("更新為昨天日期:", yesterday.toISOString());
      setSelectedDate(yesterday);
    }
  }, [selectedDateOption]);

  // 圓餅圖初始化函數 - 移到useEffect外部
  const createEmptyPieChart = () => {
    console.log("創建空圓餅圖 - 不顯示暫無數據提示");

    if (!chartRef.current) {
      console.error("圓餅圖DOM元素不存在");
      return;
    }

    try {
      // 清除舊實例
      if (chartInstance) {
        try {
          chartInstance.dispose();
        } catch (e) {
          console.error("清除圓餅圖實例時出錯:", e);
        }
      }

      // 創建一個基本的空圖表，但不帶"暫無數據"提示
      const chart = echarts.init(chartRef.current);

      const option = {
        title: null,
        tooltip: {
          trigger: "item",
        },
        legend: {
          // 確保圖例始終顯示在底部中心，並設置適當的間距
          orient: "horizontal",
          left: "center",
          bottom: 10,
          padding: [0, 0, 0, 0], // 減少內邊距以防止跑版
          textStyle: {
            color: "#6E6E6E",
          },
          itemGap: 20, // 增加項目間距
          formatter: function (name: string) {
            // 縮短圖例文字，確保佈局一致
            if (name.length > 4) {
              return name.substring(0, 4) + "...";
            }
            return name;
          },
        },
        color: [
          "#A487C3", // 紫色
          "#FAC6CD", // 粉色
          "#B8E3C9", // 綠色
          "#FFD166", // 黃色
          "#4EA8DE", // 藍色
          "#FF8B64", // 橙色
          "#C0C6E8", // 淺藍紫色
          "#9CC3D5", // 天藍色
          "#FFB3B3", // 淺紅色
          "#D8BBFF", // 淺紫色
        ],
        // 添加簡化的動畫設置
        animation: true,
        animationDuration: 700,
        animationEasing: 'sinusoidalOut' as const,
        series: [
          {
            name: "支出金額",
            type: "pie",
            radius: ["30%", "60%"], // 原先是 ["40%", "70%"]，縮小比例
            center: ["50%", "45%"], // 從"40%"改為"45%"，向下移動
            data: [],
            label: {
              show: false,
            },
            emphasis: {
              disabled: true,
            },
          },
        ],
      };

      chart.setOption(option);
      setChartInstance(chart);
    } catch (e) {
      console.error("創建空圓餅圖時出錯:", e);
    }
  };

  // 簡化圓餅圖初始化流程，確保圖表能夠顯示
  const initPieChart = () => {
    console.log("初始化圓餅圖 - 開始檢查數據");

    if (!chartRef.current) {
      console.error("圓餅圖DOM元素不存在");
      return;
    }

    // 根據模式選擇數據
    let dataToUse: Expense[] = [];
    console.log("原始數據筆數:", expenses.length);
    
    // 使用最嚴格的年月直接比較，完全避開日期範圍比較
    if (pieChartMode === 'current') {
      // 獲取當前年月
      const today = new Date();
      const currentMonth = today.getMonth(); // 0-11
      const currentYear = today.getFullYear();
      
      console.log(`嚴格過濾當前月份: ${currentYear}年${currentMonth + 1}月`);
      
      // 逐條檢查每筆支出記錄
      expenses.forEach(expense => {
        try {
          if (!expense.date) {
            console.warn(`支出 ${expense.id} 沒有日期資料，已跳過`);
            return;
          }
          
          // 確保使用新的日期對象避免引用問題
          const expDate = expense.date instanceof Date ? 
            new Date(expense.date.getTime()) : 
            new Date(expense.date);
            
          // 檢查日期是否有效
          if (isNaN(expDate.getTime())) {
            console.warn(`支出 ${expense.id} 日期無效: ${expense.date}，已跳過`);
            return;
          }
          
          // 直接比較年月
          const expMonth = expDate.getMonth();
          const expYear = expDate.getFullYear();
          
          const matchesCurrentMonth = (expYear === currentYear && expMonth === currentMonth);
          
          // 打印詳細信息用於調試
          console.log(`檢查支出 ${expense.id}:`, {
            原始日期值: String(expense.date),
            解析後日期: expDate.toISOString(),
            年份: expYear === currentYear ? '✓' : '✗',
            月份: expMonth === currentMonth ? '✓' : '✗',
            匹配當月: matchesCurrentMonth ? '✓' : '✗',
            類別: typeof expense.category === 'string' ? expense.category : expense.category?.name,
            金額: expense.amount,
            說明: expense.notes
          });
          
          // 只添加匹配當月的支出
          if (matchesCurrentMonth) {
            dataToUse.push(expense);
          }
        } catch (err) {
          console.error(`處理支出 ${expense.id} 時出錯:`, err);
        }
      });
      
      console.log(`當月過濾結果: 總計 ${dataToUse.length} 筆支出記錄`);
      
      // 再次確認過濾後的每筆記錄
      dataToUse.forEach((exp, idx) => {
        const expDate = exp.date instanceof Date ? exp.date : new Date(exp.date);
        console.log(`當月數據 #${idx}:`, {
          id: exp.id,
          日期: expDate.toISOString().split('T')[0],
          年月: `${expDate.getFullYear()}/${expDate.getMonth()+1}`,
          類別: typeof exp.category === 'string' ? exp.category : exp.category?.name,
          金額: exp.amount
        });
      });
    } 
    else if (pieChartMode === 'selected') {
      // 使用用戶選擇的月份
      const [year, month] = pieChartMonth.split('-').map(Number);
      // 注意：月份需要-1因為JavaScript的月份是0-11
      const targetMonth = month - 1;
      
      console.log(`嚴格過濾選定月份: ${year}年${month}月 (內部月份索引: ${targetMonth})`);
      
      // 逐條檢查每筆支出記錄
      expenses.forEach(expense => {
        try {
          if (!expense.date) {
            console.warn(`支出 ${expense.id} 沒有日期資料，已跳過`);
            return;
          }
          
          // 確保使用新的日期對象避免引用問題
          const expDate = expense.date instanceof Date ? 
            new Date(expense.date.getTime()) : 
            new Date(expense.date);
            
          // 檢查日期是否有效
          if (isNaN(expDate.getTime())) {
            console.warn(`支出 ${expense.id} 日期無效: ${expense.date}，已跳過`);
            return;
          }
          
          // 直接比較年月
          const expMonth = expDate.getMonth();
          const expYear = expDate.getFullYear();
          
          const matchesSelectedMonth = (expYear === year && expMonth === targetMonth);
          
          // 只添加匹配選擇月份的支出
          if (matchesSelectedMonth) {
            dataToUse.push(expense);
            console.log(`選擇月份匹配: ${expense.id}, ${expDate.toISOString().split('T')[0]}, ${typeof expense.category === 'string' ? expense.category : expense.category?.name}, $${expense.amount}`);
          }
        } catch (err) {
          console.error(`處理支出 ${expense.id} 時出錯:`, err);
        }
      });
      
      console.log(`選擇月份過濾結果: 總計 ${dataToUse.length} 筆支出記錄`);
    } 
    else {
      // 全部數據模式 - 直接使用所有支出
      dataToUse = [...expenses];
      console.log("使用全部數據, 筆數:", dataToUse.length);
    }

    // 檢查是否有數據
    if (!dataToUse || dataToUse.length === 0) {
      console.log("沒有支出數據，顯示空圓餅圖");
      createEmptyPieChart();
      return;
    }

    // 先清除舊的實例
    if (chartInstance) {
      try {
        chartInstance.dispose();
      } catch (e) {
        console.error("清除圓餅圖實例時出錯:", e);
      }
    }

    // 創建新實例
    try {
      console.log("開始初始化圓餅圖，數據筆數:", dataToUse.length);
      const chart = echarts.init(chartRef.current);

      // 計算分類支出
      const categorySum: Record<string, number> = {};
      let totalAmount = 0;

      dataToUse.forEach((expense) => {
        // 處理 category 可能是字符串或對象的情況
        const categoryName =
          typeof expense.category === "string"
            ? expense.category
            : expense.category?.name || "未分類";

        // 確保金額是有效數字
        const amount = typeof expense.amount === "number" ? expense.amount : 0;

        // 改為接受任何數值，不再檢查是否>0，只要是數值就累加
        totalAmount += amount;

        if (categorySum[categoryName]) {
          categorySum[categoryName] += amount;
    } else {
          categorySum[categoryName] = amount;
        }
      });

      console.log("計算的分類支出:", categorySum, "總金額:", totalAmount);

      // 確認是否有數據 - 只要有分類數據就顯示圖表
      const hasData = Object.keys(categorySum).length > 0;

      // 如果沒有數據，顯示空圖表
      if (!hasData) {
        console.log("圓餅圖沒有有效數據，顯示空圖表");
        createEmptyPieChart();
        return;
      }

      // 準備圖表數據
      const pieData = Object.keys(categorySum).map((category) => ({
        name: category,
        value: categorySum[category],
      }));

      console.log("準備的圓餅圖數據:", pieData);

      // 設置圖表選項
      const isMobile = window.innerWidth < 768; // 檢測是否為移動設備

      // 當前是否選中某個類別
      const isSelectedMode = selectedCategory !== null;

      // 標準圓餅圖配置
      const option = {
        // 確保沒有標題
        title: null,
        tooltip: {
          trigger: "item",
          formatter: "{a} <br/>{b}: NT${c} ({d}%)",
          confine: true,
        },
        legend: {
          // 當選中類別時，隱藏圖例
          show: !isSelectedMode,
          orient: "horizontal",
          left: "center",
          bottom: 0,
          padding: [20, 0, 0, 0],
          itemWidth: 14,
          itemHeight: 14,
          itemGap: 20, // 增加項目間距以防止重疊
          formatter: function (name: string) {
            // 對長文字進行縮短處理
            if (name.length > 4) {
              return name.substring(0, 4) + "...";
            }
            return name;
          },
          data: Object.keys(categorySum),
          textStyle: {
            color: "#6E6E6E",
            fontSize: 12, // 確保文字大小適當
          },
          // 使用React狀態中的圖例選擇狀態
          selected: legendSelectedMap,
        },
        color: [
          "#A487C3", // 紫色
          "#FAC6CD", // 粉色
          "#B8E3C9", // 綠色
          "#FFD166", // 黃色
          "#4EA8DE", // 藍色
          "#FF8B64", // 橙色
          "#C0C6E8", // 淺藍紫色
          "#9CC3D5", // 天藍色
          "#FFB3B3", // 淺紅色
          "#D8BBFF", // 淺紫色
        ],
        // 添加全局動畫設置
        animation: true,
        animationThreshold: 1000, 
        animationDuration: 700,
        animationEasing: 'sinusoidalOut' as const,
        animationDelay: 0,
        animationDurationUpdate: 400,
        animationEasingUpdate: 'linear' as const,
        animationDelayUpdate: 0,
        series: [
          {
            name: "支出金額",
            type: "pie",
            radius: ["30%", "60%"], // 原先是 ["40%", "70%"]，縮小比例
            // 將y坐標從50%調整為40%，向上移動
            center: [
              isSelectedMode ? (isMobile ? "48%" : "45%") : "50%",
              "45%", // 從"40%"改為"45%"，向下移動
            ],
            avoidLabelOverlap: false,
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: "rgba(0, 0, 0, 0.2)",
              },
              scale: true,
              scaleSize: 10
            },
            label: {
              show: true,
              formatter: "{b}\n{d}%",
            },
            labelLine: {
              show: true,
              smooth: true,
              length: 15,
              length2: 12
            },
            data: pieData,
            // 簡化餅圖動畫設置
            animationType: 'expansion' as const,
            animationEasing: 'sinusoidalOut' as const,
            animationDelay: function (idx: number) {
              return idx * 60;
            }
          },
        ],
      };

      // 明確移除graphic屬性，確保不會顯示"暫無數據"
      console.log("設置圓餅圖選項，數據項數量:", pieData.length);
      chart.setOption(option);

      // 添加圖例選擇變化事件
      chart.on("legendselectchanged", function (params: any) {
        console.log("圖例選擇變更:", params);
        // 更新React狀態中的圖例選擇
        setLegendSelectedMap(params.selected);
      });

      // 點擊事件處理
      chart.on("click", function (params) {
        if (params.componentType === "series") {
          console.log("點擊圓餅圖分類:", params.name);
          setSelectedCategory(params.name);

          // 點擊後，重新設置圖表，確保標題不顯示並調整圖表位置
          chart.setOption({
            title: null,
            legend: {
              show: false,
              // 保留圖例選擇狀態
              selected: legendSelectedMap,
            },
            series: [
              {
                center: [isMobile ? "48%" : "45%", "50%"],
              },
            ],
          });
        }
      });

      // 設置實例後再保存
      setChartInstance(chart);
      console.log("圓餅圖初始化完成");
    } catch (e) {
      console.error("創建圓餅圖時出錯:", e);
      // 出錯時顯示空圖表
      createEmptyPieChart();
    }
  };

  // 修改重置函數，確保圖表重置時保留圖例選擇狀態
  const resetCategorySelection = () => {
    console.log("重置類別選擇 - 開始", legendSelectedMap);

    // 更新狀態
    setSelectedCategory(null);

    // 如果有圖表實例，調整它的位置和圖例，但不重新初始化
    if (chartInstance) {
      try {
        // 更新圖表選項，保留圖例選擇狀態，不需要重新初始化
        chartInstance.setOption({
          legend: {
            show: true,
            selected: legendSelectedMap, // 使用React狀態中保存的圖例選擇
          },
          series: [
            {
              center: ["50%", "50%"],
            },
          ],
        });

        // 確保圖表重新渲染
      setTimeout(() => {
          chartInstance.resize();
        }, 10);
      } catch (err) {
        console.error("調整圖表位置出錯:", err);
        // 只有在出錯時才強制重新渲染
        setChartsKey((prev) => prev + 1);
      }
    } else {
      // 如果沒有圖表實例，強制重新渲染
      setChartsKey((prev) => prev + 1);
    }
  };

  // 每日趨勢圖初始化函數 - 移到useEffect外部
  const createEmptyDailyChart = () => {
    if (!dailyChartRef.current) {
      console.error("每日趨勢圖DOM元素不存在");
      return;
    }

    // 先清除舊的實例
    if (dailyChartInstance) {
      try {
        dailyChartInstance.dispose();
      } catch (e) {
        console.error("清除每日趨勢圖實例時出錯:", e);
      }
    }

    // 創建新實例
    try {
      console.log("創建空每日趨勢圖 - 不顯示暫無數據提示");
      const chart = echarts.init(dailyChartRef.current);

      // 設置空狀態 - 改為顯示空白圖表而非"暫無數據"文字
      chart.setOption({
        // 刪除標題配置
        tooltip: {
          trigger: "axis",
          formatter: function (params: any) {
            return `${params[0].axisValue}<br/>支出金額: NT$${params[0].data}`;
          },
          confine: true,
        },
        grid: {
          left: "3%",
          right: "4%",
          bottom: "15%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          data: ["週一", "週二", "週三", "週四", "週五", "週六", "週日"],
          axisLine: { lineStyle: { color: "#999" } }, // 顏色調淡，從 #666 到 #999
          axisLabel: {
            color: "#666", // 顏色調淡，從 #2E2E2E 到 #666
          },
        },
        yAxis: {
          type: "value",
          axisLine: { lineStyle: { color: "#999" } }, // 顏色調淡，從 #666 到 #999
          axisLabel: {
            formatter: "{value} 元",
            color: "#666", // 顏色調淡，從 #2E2E2E 到 #666
          },
        },
        series: [
          {
            name: "每日支出",
            type: "bar",
            data: [0, 0, 0, 0, 0, 0, 0], // 顯示空數據而非提示文字
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "#B8E3C9" },
                { offset: 1, color: "#D4F0DF" },
              ]),
            },
          },
        ],
      });

      // 設置實例後再保存
      setDailyChartInstance(chart);
    } catch (e) {
      console.error("創建空每日趨勢圖時出錯:", e);
    }
  };

  // 每日趨勢圖初始化函數
  const initDailyChart = () => {
    console.log("初始化每日趨勢圖 - 開始檢查數據");

    if (!dailyChartRef.current) {
      console.error("每日趨勢圖DOM元素不存在");
      return;
    }

    // 檢查是否有數據
    if (!expenses || expenses.length === 0) {
      console.log("沒有支出數據，顯示空每日趨勢圖");
      createEmptyDailyChart();
      return;
    }

    // 先清除舊的實例
    if (dailyChartInstance) {
      try {
        dailyChartInstance.dispose();
      } catch (e) {
        console.error("清除每日趨勢圖實例時出錯:", e);
      }
    }

    // 創建新實例
    try {
      console.log("開始初始化每日趨勢圖，數據筆數:", expenses.length);
      const chart = echarts.init(dailyChartRef.current);

      // 獲取真正的今天日期（不使用緩存的日期）
      const rightNow = new Date();
      // 重置時間為0點0分0秒
      rightNow.setHours(0, 0, 0, 0);
      console.log("趨勢圖使用的今天日期:", rightNow.toISOString());

      // 計算每日支出
      const dailySum: Record<string, number> = {};

      // 獲取最近7天的日期（包括今天）
      const dates: string[] = [];
      for (let i = 6; i >= 0; i--) {
        // 每次創建全新日期對象避免引用問題
        const date = new Date();
        // 設置為0點
        date.setHours(0, 0, 0, 0);
        // 減去對應天數
        date.setDate(date.getDate() - i);
        // 使用YYYY-MM-DD格式作為鍵
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        dates.push(dateKey);
        dailySum[dateKey] = 0;
      }

      console.log("趨勢圖日期範圍:", dates);

      // 計算每天支出總和
      let hasData = false;
      expenses.forEach((expense) => {
        try {
          // 標準化expense日期為YYYY-MM-DD格式
          const expenseYear = expense.date.getFullYear();
          const expenseMonth = String(expense.date.getMonth() + 1).padStart(
            2,
            "0",
          );
          const expenseDay = String(expense.date.getDate()).padStart(2, "0");
          const expenseKey = `${expenseYear}-${expenseMonth}-${expenseDay}`;

          if (dailySum[expenseKey] !== undefined) {
            dailySum[expenseKey] += expense.amount;
            console.log(`找到日期 ${expenseKey} 的支出:`, expense.amount);
            hasData = true;
          }
        } catch (err) {
          console.error("處理expense日期出錯:", err, expense);
        }
      });

      // 輸出日期和支出記錄，用於調試
      console.log("每日支出統計:", dailySum);

      // 檢查是否所有日期都沒有支出
      if (!hasData) {
        createEmptyDailyChart();
        return;
      }

      // 準備數據
      const xAxisData = dates.map((date) => {
        const parts = date.split("-");
        return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
      });

      const seriesData = dates.map((date) => dailySum[date]);

      console.log("每日趨勢圖數據:", { 日期: xAxisData, 金額: seriesData });

      // 設置圖表選項
      const isMobile = window.innerWidth < 768; // 檢測是否為移動設備

      chart.setOption({
        // 刪除標題配置
        tooltip: {
          trigger: "axis",
          formatter: function (params: any) {
            const value = params[0].value;
            return `${params[0].axisValue}<br/>支出金額: NT$${value}`;
          },
          confine: true,
        },
        grid: {
          left: isMobile ? "10%" : "3%",
          right: isMobile ? "5%" : "4%",
          bottom: "15%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          data: xAxisData,
          axisLine: { lineStyle: { color: "#999" } }, // 顏色調淡，從 #666 到 #999
          axisLabel: {
            color: "#666", // 顏色調淡，從 #2E2E2E 到 #666
          },
        },
        yAxis: {
          type: "value",
          axisLine: { lineStyle: { color: "#999" } }, // 顏色調淡，從 #666 到 #999
          axisLabel: {
            formatter: "{value} 元",
            color: "#666", // 顏色調淡，從 #2E2E2E 到 #666
          },
        },
        series: [
          {
            name: "每日支出",
            type: "bar",
            data: seriesData,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "#B8E3C9" },
                { offset: 1, color: "#D4F0DF" },
              ]),
            },
          },
        ],
      });

      // 設置實例後再保存
      setDailyChartInstance(chart);
      console.log("每日趨勢圖初始化完成");
    } catch (e) {
      console.error("創建每日趨勢圖出錯:", e);
      // 出錯時顯示空圖表
      createEmptyDailyChart();
    }
  };

  // 完全重寫的數據初始化邏輯
  useEffect(() => {
    const initializeAppData = async () => {
      console.log("===========應用數據初始化開始===========");
      console.log("Firebase連接狀態檢查...");

      // 只有登入用戶才加載數據
      if (!currentUser || !currentUser.uid) {
        console.log("用戶未登入，不加載數據");
        setExpenses([]);
        return;
      }
      
      // 獲取用戶ID用於數據過濾
      const userId = currentUser.uid;
      console.log("當前用戶ID:", userId);
      console.log("用戶郵箱:", currentUser.email);

      // 顯示加載中提示
      setSuccessMessage("正在連線中...");
      setShowSuccessMessage(true);

      try {
        console.log("嘗試從Firebase獲取最新數據...");

        // 1. 檢查數據庫連接
        console.log("Firestore實例:", db ? "已初始化" : "未初始化");

        // 2. 構建查詢
        const expensesRef = collection(db, "expenses");
        console.log("集合路徑: expenses");

        // 查詢當前用戶的記錄
      const q = query(
          expensesRef,
          where("userId", "==", userId),
          orderBy("createdAt", "desc"),
        );
        console.log("查詢條件: userId =", userId);

        // 3. 執行查詢
        console.log("開始執行查詢...");
        const querySnapshot = await getDocs(q);
        console.log("查詢完成, 結果數量:", querySnapshot.size);
        
        // 處理查詢結果
        const fetchedExpenses: Expense[] = [];

        // 4. 處理結果
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          console.log("讀取文檔ID:", doc.id, "用戶ID:", data.userId);

          // 確認用戶ID匹配
          if (data.userId === userId) {
            try {
              // 安全地處理日期轉換
              let expenseDate;
              try {
                if (data.date && typeof data.date.toDate === "function") {
                  // Firestore Timestamp 對象
                  expenseDate = data.date.toDate();
                  console.log(`文檔 ${doc.id}: 從Timestamp轉換日期:`, expenseDate.toISOString());
                } else if (data.date && data.date._seconds) {
                  // Firestore Timestamp 從JSON
                  expenseDate = new Date(data.date._seconds * 1000);
                  console.log(`文檔 ${doc.id}: 從_seconds轉換日期:`, expenseDate.toISOString());
                } else if (data.date instanceof Date) {
                  // 已經是日期對象
                  expenseDate = new Date(data.date.getTime());
                  console.log(`文檔 ${doc.id}: 使用日期對象:`, expenseDate.toISOString());
                } else if (typeof data.date === "string") {
                  // 字符串日期 - 確保正確解析
                  // 為了解決時區問題，我們需要保留原始字符串的日期部分
                  // 格式可能是 YYYY-MM-DD 或 YYYY/MM/DD
                  const dateString = data.date.trim();
                  if (dateString.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/)) {
                    // 標準化日期字符串格式為 YYYY-MM-DD
                    const [year, month, day] = dateString.split(/[-/]/).map(Number);
                    
                    // 創建本地時間的日期對象，避免時區轉換問題
                    expenseDate = new Date(year, month - 1, day, 0, 0, 0);
                    console.log(`文檔 ${doc.id}: 從日期字符串 "${dateString}" 轉換:`, expenseDate.toISOString());
                  } else {
                    // 嘗試作為標準ISO字符串解析
                    expenseDate = new Date(dateString);
                    console.log(`文檔 ${doc.id}: 從一般字符串轉換:`, expenseDate.toISOString());
                  }
                } else {
                  // 默認為當前日期
                  console.warn(`文檔 ${doc.id}: 無效的日期格式:`, JSON.stringify(data.date));
                  expenseDate = new Date();
                }
                
                // 確保日期有效
                if (isNaN(expenseDate.getTime())) {
                  throw new Error(`無效日期: ${data.date}`);
                }
                
                // 標準化為當天的0點，避免時區和時間部分差異
                const normalizedDate = new Date(
                  expenseDate.getFullYear(),
                  expenseDate.getMonth(),
                  expenseDate.getDate(),
                  0, 0, 0
                );
                
                fetchedExpenses.push({
                  id: doc.id,
                  amount: data.amount,
                  category: data.category,
                  // 使用標準化後的日期
                  date: normalizedDate,
                  notes: data.notes || "",
                  userId: data.userId,
                });
                
                console.log(`成功處理文檔 ${doc.id} 的日期:`, normalizedDate.toISOString());
              } catch (e) {
                console.error(`處理文檔 ${doc.id} 的日期時出錯:`, e);
                // 如果日期處理出錯，仍然添加記錄但使用當前日期
                fetchedExpenses.push({
                  id: doc.id,
                  amount: data.amount,
                  category: data.category,
                  date: new Date(), // 默認使用當前日期
                  notes: data.notes || "",
                  userId: data.userId,
                });
              }
            } catch (e) {
              console.error(`處理消費明細 ${doc.id} 時出錯:`, e);
            }
          }
        });

        console.log(
          `成功從Firebase獲取了 ${fetchedExpenses.length} 筆消費明細`,
        );
        if (fetchedExpenses.length === 0) {
          console.log(
            "提示: 沒有找到消費明細，請確認是否已添加消費明細或索引是否已創建",
          );
        }

        // 更新UI狀態
        setExpenses(fetchedExpenses);

        // 確保在設置expenses後強制重新渲染圖表
        // 增加雙重延遲時間，確保數據和DOM完全更新後再渲染圖表
        console.log("準備重新渲染圖表...");
        setTimeout(() => {
          try {
            // 先強制重新渲染一次
            forceRerender();

            // 再加一個延遲確保DOM完全渲染
            setTimeout(() => {
              try {
                console.log("嘗試渲染圓餅圖...");
                if (chartRef.current) {
                  initPieChart();
                }

                console.log("嘗試渲染每日趨勢圖...");
                if (dailyChartRef.current) {
                  initDailyChart();
                }

                // 觸發圖表重新渲染事件
                window.dispatchEvent(new Event("expenses-changed"));
                console.log("圖表渲染完成");
              } catch (error) {
                console.error("圖表渲染失敗:", error);
              }
            }, 300);
          } catch (error) {
            console.error("圖表渲染前準備失敗:", error);
          }
        }, 800); // 增加主延遲時間

        // 關閉加載提示
        if (successMessageTimer.current) {
          window.clearTimeout(successMessageTimer.current);
        }
        setShowSuccessMessage(false);

        console.log("===========應用數據初始化完成===========");
      } catch (error) {
        console.error("從Firebase獲取數據失敗:", error);
        // 顯示更詳細的錯誤信息
        if (error instanceof Error) {
          console.error("錯誤類型:", error.name);
          console.error("錯誤消息:", error.message);
          console.error("錯誤堆棧:", error.stack);
          setError(`讀取消費明細失敗: ${error.message}`);
        } else {
          setError("讀取消費明細失敗，請檢查控制檯日誌");
        }
        setTimeout(() => setError(null), 5000);
        setExpenses([]);
        setShowSuccessMessage(false);
        console.log("===========應用數據初始化失敗===========");
      }
    };

    // 使initializeAppData可以在組件內部調用
    (window as any).initializeAppData = initializeAppData;

    // 執行初始化
        if (currentUser) {
      initializeAppData();
    } else {
      // 用戶未登入，清空數據
      setExpenses([]);
      setShowLoginForm(true);
    }

    // 當頁面變為可見時重新加載數據
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && currentUser) {
        console.log("頁面變為可見，重新加載數據");
        initializeAppData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUser]);

  // 當用戶未登入時，自動顯示登入界面
  useEffect(() => {
    if (!currentUser) {
      setShowLoginForm(true);
    } else {
      // 當用戶登入成功後，關閉登入表單
      setShowLoginForm(false);
    }
  }, [currentUser]);

  // 根據類別獲取對應的圖標
  const getCategoryIcon = (category: string): string => {
    const icons: { [key: string]: string } = {
      餐飲: "fa-utensils",
      交通: "fa-car",
      生活: "fa-shopping-cart",
      購物: "fa-shopping-bag",
      娛樂: "fa-gamepad",
      住支: "fa-home",
      健康: "fa-medkit",
      旅遊: "fa-plane",
      服裝: "fa-tshirt",
      教育: "fa-book",
      醫療: "fa-heartbeat",
      社交: "fa-users",
      投資: "fa-chart-line",
      捐贈: "fa-hand-holding-heart",
      其他: "fa-ellipsis-h"
    };
    return icons[category] || "fa-question";
  };

  // 監聽排行榜邀請查看事件
  useEffect(() => {
    const handleShowLeaderboardInvites = () => {
      setShowLeaderboardInvites(true);
    };

    window.addEventListener(
      "showLeaderboardInvites",
      handleShowLeaderboardInvites,
    );

    return () => {
      window.removeEventListener(
        "showLeaderboardInvites",
        handleShowLeaderboardInvites,
      );
    };
  }, []);

  // 刷新後的數據恢復機制 - 完全重寫
  useEffect(() => {
    const recoverDataAfterRefresh = async () => {
      // 如果用戶未登入，不執行恢復
      if (!currentUser || !currentUser.uid) {
        return;
      }

      console.log("===開始刷新後數據恢復過程===");

      try {
        // 先清空當前狀態，避免顯示舊數據
        setExpenses([]);

        // 直接從Firebase獲取最新數據
        const userId = currentUser.uid;
        console.log(`嘗試為用戶 ${userId} 從Firebase獲取最新數據`);

        const expensesRef = collection(db, "expenses");
        const q = query(
          expensesRef,
          where("userId", "==", userId),
          orderBy("createdAt", "desc"),
        );

        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const fetchedExpenses: Expense[] = [];

          querySnapshot.forEach((doc) => {
            const data = doc.data();
            // 嚴格驗證是當前用戶的記錄
            if (data.userId === userId) {
              try {
                // 安全地處理日期轉換
                let expenseDate;
                if (data.date && typeof data.date.toDate === "function") {
                  // Firestore Timestamp 對象
                  expenseDate = data.date.toDate();
                } else if (data.date && data.date._seconds) {
                  // Firestore Timestamp 從JSON
                  expenseDate = new Date(data.date._seconds * 1000);
                } else if (data.date instanceof Date) {
                  // 已經是日期對象
                  expenseDate = data.date;
                } else if (typeof data.date === "string") {
                  // 字符串日期
                  expenseDate = new Date(data.date);
                } else {
                  // 默認為當前日期
                  console.warn(`無效的日期格式: ${JSON.stringify(data.date)}`);
                  expenseDate = new Date();
                }

                fetchedExpenses.push({
                  id: doc.id,
                  amount: data.amount,
                  category: data.category,
                  date: expenseDate,
                  notes: data.notes || "",
                  userId: data.userId,
                });
              } catch (e) {
                console.error(`處理消費明細 ${doc.id} 時出錯:`, e);
              }
            }
          });

          if (fetchedExpenses.length > 0) {
            console.log(
              `成功從Firebase獲取 ${fetchedExpenses.length} 筆消費明細`,
            );

            // 更新React狀態
            setExpenses(fetchedExpenses);

            // 強制更新UI和圖表
            forceRerender();

            // 增加延遲時間，確保數據已完全更新且DOM已渲染完成
            setTimeout(() => {
              try {
                console.log("數據恢復後重新渲染圖表...");
                // 觸發圖表重新渲染事件
                window.dispatchEvent(new Event("expenses-changed"));

                // 直接調用初始化函數
                if (chartRef.current) {
                  initPieChart();
                }

                if (dailyChartRef.current) {
                  initDailyChart();
                }

                console.log("數據恢復後圖表渲染完成");
              } catch (error) {
                console.error("數據恢復後圖表渲染失敗:", error);
              }
            }, 800);

            // 顯示成功信息
            setSuccessMessage("數據已同步");
            setShowSuccessMessage(true);
            if (successMessageTimer.current) {
              window.clearTimeout(successMessageTimer.current);
            }
            successMessageTimer.current = window.setTimeout(
              () => setShowSuccessMessage(false),
              1500,
            );
          } else {
            console.log("Firebase中沒有找到當前用戶的記錄");
            setExpenses([]);
          }
        } else {
          console.log("Firebase查詢結果為空");
          setExpenses([]);
      }
    } catch (error) {
        console.error("刷新後數據恢復失敗:", error);
        // 不再顯示錯誤提示，只在控制台輸出錯誤信息
        // setError("無法恢復數據，請嘗試手動刷新頁面");
        // setTimeout(() => setError(null), 3000);
        
        // 將空數組設置為默認值，避免UI顯示舊數據
        setExpenses([]);
        
        // 靜默處理錯誤，不顯示給用戶
        console.log("數據恢復失敗，繼續使用應用...");
      } finally {
        console.log("===數據恢復過程結束===");
      }
    };

    // 如果用戶已登入，執行數據恢復
    if (currentUser) {
      recoverDataAfterRefresh();
    }

    // 監聽強制數據恢復事件
    const handleForceDataRecovery = () => {
      console.log("收到強制數據恢復事件");
      recoverDataAfterRefresh();
    };

    window.addEventListener("force_data_recovery", handleForceDataRecovery);

    return () => {
      window.removeEventListener(
        "force_data_recovery",
        handleForceDataRecovery,
      );
    };
  }, [currentUser]);

  // 強化添加記錄功能 - 進一步簡化流程並提高速度
  const addExpense = async (expense: {
    amount: number;
    category: string;
    date: string;
    notes: string;
    attachments?: File[];
    isShared?: boolean;
    sharedWith?: Array<{
      userId: string;
      nickname: string;
      email?: string;
      photoURL?: string;
      amount: number;
      paid: boolean;
    }>;
  }): Promise<boolean> => {
    try {
      if (!currentUser || !currentUser.uid) {
        setShowLoginForm(true);
        return false;
      }
      
      console.log("開始添加支出記錄");
      
      // 處理附件
      let attachmentUrls: string[] = [];
      if (expense.attachments && expense.attachments.length > 0) {
        attachmentUrls = expense.attachments.map((file) =>
          URL.createObjectURL(file),
        );
      }

      // 創建臨時ID進行優化流程
      const tempId = `temp_${Date.now()}`;

      // 創建新記錄對象 - 先使用臨時ID
      const newExpense: Expense = {
        id: tempId,
        amount: expense.amount,
        category: {
          id: expense.category,
          name: expense.category,
        icon: getCategoryIcon(expense.category),
        },
        date: new Date(expense.date),
        notes: expense.notes || "",
        userId: currentUser.uid,
      };

      // 立即更新UI以提高反應速度
      setExpenses((prevExpenses) => [newExpense, ...prevExpenses]);

      // 立即顯示成功訊息
      setSuccessMessage("記帳成功！");
      setShowSuccessMessage(true);
      if (successMessageTimer.current) {
        window.clearTimeout(successMessageTimer.current);
      }
      successMessageTimer.current = window.setTimeout(
        () => setShowSuccessMessage(false),
        1500,
      );

      // 非同步更新圖表
      setTimeout(
        () => window.dispatchEvent(new Event("expenses-changed")),
        100,
      );

      // 使用 Firestore 事務同步更新消費記錄和排行榜數據
      try {
        const expenseData = {
          ...expense,
          attachmentUrls,
          userId: currentUser.uid,
          createdAt: new Date(),
          // 將日期轉換為 Timestamp 對象存儲
          date: Timestamp.fromDate(new Date(expense.date)),
        };
        
        try {
          // 嘗試使用事務確保一致性
          const { docId, splitDocId } = await addExpenseWithTransaction(expenseData, expense.isShared, expense.sharedWith);
          console.log("使用事務成功添加記錄，支出ID:", docId, "分帳ID:", splitDocId || "無分帳");
  
          // 更新真實ID
          setExpenses((prevExpenses) =>
            prevExpenses.map((exp) =>
              exp.id === tempId ? { ...exp, id: docId } : exp,
            ),
          );
        } catch (txError) {
          // 事務失敗時，嘗試直接添加支出記錄（不含排行榜更新）
          console.error("事務處理失敗:", txError);
          
          // 記錄具體錯誤信息到日誌
          if (txError instanceof Error) {
            console.error("事務錯誤詳情:", {
              名稱: txError.name,
              訊息: txError.message,
              堆疊: txError.stack
            });
          }
          
          // 後備方案：直接添加支出記錄
          console.log("嘗試使用後備方案直接添加支出...");
          const docRef = await addDoc(collection(db, "expenses"), expenseData);
          console.log("使用後備方案成功添加記錄，支出ID:", docRef.id);
          
          // 更新真實ID
          setExpenses((prevExpenses) =>
            prevExpenses.map((exp) =>
              exp.id === tempId ? { ...exp, id: docRef.id } : exp,
            ),
          );
          
          // 如果是分帳支出，則創建分帳記錄（但不使用事務）
          if (expense.isShared && expense.sharedWith && expense.sharedWith.length > 0) {
            try {
              // 获取当前用户的最新资料
              const userDoc = await getDoc(doc(db, "users", currentUser.uid));
              let creatorNickname = "";
              
              if (userDoc.exists()) {
                const userData = userDoc.data();
                creatorNickname = userData.nickname || currentUser.displayName || "";
                console.log("后备方案: 获取到当前用户昵称:", creatorNickname);
              }
              
              // 準備分帳數據 - 确保使用最新的用户昵称
              const participants = await Promise.all(expense.sharedWith.map(async person => {
                // 尝试获取每个参与者的最新昵称
                if (person.userId) {
                  try {
                    const participantDoc = await getDoc(doc(db, "users", person.userId));
                    if (participantDoc.exists()) {
                      const participantData = participantDoc.data();
                      return {
                        userId: person.userId,
                        nickname: participantData.nickname || person.nickname || "",
                        email: participantData.email || person.email || "",
                        photoURL: participantData.photoURL || person.photoURL || "",
                        amount: person.amount,
                        paid: person.paid || false
                      };
                    }
                  } catch (e) {
                    console.warn(`无法获取参与者 ${person.userId} 的最新资料，使用提供的资料`, e);
                  }
                }
                
                return {
                  userId: person.userId,
                  nickname: person.nickname || "",
                  email: person.email || "",
                  photoURL: person.photoURL || "",
                  amount: person.amount,
                  paid: person.paid || false
                };
              }));
              
              // 提取參與者 ID 列表，方便查詢
              const participantIds = participants.map(p => p.userId);
              
              // 創建分帳數據
              const splitData = {
                creatorId: currentUser.uid,
                creatorNickname, // 添加创建者昵称
                title: expense.notes || expense.category,
                description: `${expense.category} 支出分帳`,
                totalAmount: expense.amount,
                date: new Date(expense.date),
                originalExpenseId: docRef.id,
                status: 'pending',
                participants,
                participantIds,
                created: new Date()
              };
              
              // 保存分帳記錄
              const splitRef = await addDoc(collection(db, "splitExpenses"), splitData);
              console.log("使用後備方案創建分帳記錄，ID:", splitRef.id);
              
              // 更新原始支出記錄，標記為已分帳
              await updateDoc(doc(db, "expenses", docRef.id), {
                isSplit: true,
                splitTransactionId: splitRef.id
              });
            } catch (splitError) {
              console.error("創建分帳記錄失敗:", splitError);
            }
          }
          
          // 顯示警告信息
          setSuccessMessage("支出已保存，但排行榜可能未更新");
          setShowSuccessMessage(true);
          if (successMessageTimer.current) {
            window.clearTimeout(successMessageTimer.current);
          }
          successMessageTimer.current = window.setTimeout(
            () => setShowSuccessMessage(false),
            3000,
          );
        }
      } catch (error) {
        console.error("保存到Firebase失敗，但UI已更新:", error);
        
        // 記錄具體錯誤類型和訊息
        if (error instanceof Error) {
          console.error("Firebase錯誤詳情:", {
            名稱: error.name,
            訊息: error.message,
            堆疊: error.stack
          });
        }
        
        // 更新錯誤提示
        setError("數據保存失敗，請稍後重試。支出記錄仍顯示在界面上。");
        setTimeout(() => setError(null), 5000);
      }

      return true;
    } catch (error) {
      console.error("添加支出失敗:", error);
      setError("添加支出失敗，請稍後再試");
      setTimeout(() => setError(null), 3000);
      return false;
    }
  };

  // 使用 Firestore 事務添加支出並同步更新排行榜
  const addExpenseWithTransaction = async (
    expenseData: any,
    isShared?: boolean,
    sharedWith?: Array<{
      userId: string;
      nickname: string;
      email?: string;
      photoURL?: string;
      amount: number;
      paid: boolean;
    }>
  ): Promise<{ docId: string; splitDocId?: string }> => {
    if (!currentUser) {
      throw new Error("用戶未登入");
    }
    
    // 檢查數據合法性
    if (!expenseData || !expenseData.amount || !expenseData.category) {
      throw new Error("支出數據不完整");
    }
    
    console.log("準備開始 Firestore 事務...");
    
    try {
      // 獲取當前用戶參與的所有進行中排行榜
      const result = await runTransaction(db, async (transaction) => {
        console.log("開始執行 Firestore 事務...");
        
        try {
          // 步驟 1: 添加支出記錄
          const expenseRef = doc(collection(db, "expenses"));
          transaction.set(expenseRef, expenseData);
          console.log("事務中創建支出文檔，ID:", expenseRef.id);
          
          // 步驟 2: 如果是分帳支出，創建分帳記錄
          let splitDocId;
          if (isShared && sharedWith && sharedWith.length > 0) {
            // 獲取當前用戶的最新數據
            console.log("事務中獲取用戶文檔，UID:", currentUser.uid);
            const userDoc = await transaction.get(doc(db, "users", currentUser.uid));
            let creatorNickname = "";
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              creatorNickname = userData.nickname || currentUser.displayName || "";
              console.log("獲取到當前用戶暱稱:", creatorNickname);
            }
            
            // 準備分帳數據 - 確保使用最新的用戶昵称
            const participants = await Promise.all(sharedWith.map(async person => {
              // 對每個參與者嘗試獲取最新的用戶昵稱信息
              if (person.userId) {
                try {
                  const participantDoc = await transaction.get(doc(db, "users", person.userId));
                  if (participantDoc.exists()) {
                    const participantData = participantDoc.data();
                    // 使用Firestore中存儲的最新昵稱
                    return {
                      userId: person.userId,
                      nickname: participantData.nickname || person.nickname || "",
                      email: participantData.email || person.email || "",
                      photoURL: participantData.photoURL || person.photoURL || "",
                      amount: person.amount,
                      paid: person.paid || false
                    };
                  }
                } catch (e) {
                  console.warn(`無法獲取參與者 ${person.userId} 的最新資料，使用提供的資料`, e);
                }
              }
              
              // 如果無法獲取或發生錯誤，則使用傳入的資料
              return {
                userId: person.userId,
                nickname: person.nickname || "",
                email: person.email || "",
                photoURL: person.photoURL || "",
                amount: person.amount,
                paid: person.paid || false
              };
            }));
            
            // 提取參與者 ID 列表，方便查詢
            const participantIds = participants.map(p => p.userId);
            
            // 創建分帳數據 - 使用最新的創建者昵称
            const splitData = {
              creatorId: currentUser.uid,
              creatorNickname,  // 添加創建者昵稱字段
              title: expenseData.notes || expenseData.category,
              description: `${expenseData.category} 支出分帳`,
              totalAmount: expenseData.amount,
              date: expenseData.date,
              originalExpenseId: expenseRef.id,
              status: 'pending',
              participants,
              participantIds,
              created: new Date()
            };
            
            // 添加分帳記錄
            const splitRef = doc(collection(db, "splitExpenses"));
            transaction.set(splitRef, splitData);
            console.log("事務中創建分帳文檔，ID:", splitRef.id);
            
            // 更新原始支出記錄，標記為已分帳
            transaction.update(expenseRef, {
              isSplit: true,
              splitTransactionId: splitRef.id
            });
            
            splitDocId = splitRef.id;
          }
          
          // 步驟 3: 獲取用戶參與的進行中排行榜
          console.log("事務中獲取用戶文檔，UID:", currentUser.uid);
          const userDoc = await transaction.get(doc(db, "users", currentUser.uid));
          if (!userDoc.exists()) {
            console.error("事務中用戶文檔不存在");
            throw new Error("用戶數據不存在");
          }
          
          const userData = userDoc.data();
          console.log("事務中用戶數據:", { 
            暱稱: userData.nickname || '未知', 
            排行榜數量: (userData.leaderboards || []).length 
          });
          
          const userLeaderboardIds = userData.leaderboards || [];
          
          // 如果用戶沒有參與排行榜，就不需要更新
          if (userLeaderboardIds.length === 0) {
            console.log("事務中: 用戶沒有參與任何排行榜，跳過排行榜更新");
            return { 
              docId: expenseRef.id, 
              splitDocId 
            };
          }
          
          // 獲取所有排行榜數據
          console.log("事務中: 獲取 " + userLeaderboardIds.length + " 個排行榜數據");
          const leaderboardPromises = userLeaderboardIds.map((id: string) => {
            console.log("事務中: 準備獲取排行榜 ID:", id);
            return transaction.get(doc(db, "leaderboards", id));
          });
          
          const leaderboardDocs = await Promise.all(leaderboardPromises);
          console.log("事務中: 成功獲取 " + leaderboardDocs.length + " 個排行榜文檔");
          
          // 篩選出進行中的排行榜並立即更新
          const now = new Date();
          const expenseDate = expenseData.date instanceof Timestamp 
            ? expenseData.date.toDate() 
            : new Date(expenseData.date);
          const expenseAmount = expenseData.amount;
          
          console.log(`事務中: 檢查 ${leaderboardDocs.length} 個排行榜是否需要更新，支出日期:`, expenseDate.toLocaleDateString());
          
          let updatedLeaderboardCount = 0;
          
          for (let i = 0; i < leaderboardDocs.length; i++) {
            const leaderboardDoc = leaderboardDocs[i];
            if (!leaderboardDoc.exists()) {
              console.log("事務中: 排行榜文檔不存在，跳過");
              continue;
            }
            
            const leaderboardData = leaderboardDoc.data();
            console.log("事務中: 處理排行榜 - ", { 
              ID: leaderboardDoc.id, 
              名稱: leaderboardData.name,
              成員數: (leaderboardData.members || []).length
            });
            
            // 解析日期
            const startDate = leaderboardData.startDate instanceof Timestamp 
              ? leaderboardData.startDate.toDate() 
              : new Date(leaderboardData.startDate);
              
            const endDate = leaderboardData.endDate instanceof Timestamp 
              ? leaderboardData.endDate.toDate() 
              : new Date(leaderboardData.endDate);
            
            // 修改逻辑：确保结束日期包含当天的所有数据
            // 创建结束日期的副本，设置为当天23:59:59
            const endDateFull = new Date(endDate);
            endDateFull.setHours(23, 59, 59, 999);
            
            // 检查排行榜是否进行中，修改判断逻辑确保包含结束日期当天
            // 修改判断条件，确保结束日期当天的支出也能被统计
            const isOngoing = now <= endDate;
            const isInRange = expenseDate >= startDate && (isOngoing || expenseDate <= endDateFull);
            
            console.log(`事務中: 排行榜 ${leaderboardData.name} (${leaderboardDoc.id}): 進行中=${isOngoing}, 支出在範圍內=${isInRange}`);
            console.log(`排行榜時間範圍: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} (含結束日整天)`);
            
            if (isInRange) {
              // 獲取用戶在排行榜中的成員索引
              const memberIndex = leaderboardData.members.findIndex(
                (m: any) => m.userId === currentUser.uid
              );
              
              if (memberIndex !== -1) {
                // 更新成員支出金額
                const updatedMembers = [...leaderboardData.members];
                const member = {...updatedMembers[memberIndex]};
                
                // 更新總支出
                member.totalExpense = (member.totalExpense || 0) + expenseAmount;
                
                // 更新支出ID列表
                member.expenseIds = [...(member.expenseIds || []), expenseRef.id];
                
                // 更新支出摘要
                const expenseSummary = {
                  id: expenseRef.id,
                  amount: expenseAmount,
                  date: expenseData.date,
                  category: expenseData.category
                };
                member.expenseSummaries = [...(member.expenseSummaries || []), expenseSummary];
                
                // 更新成員資料
                updatedMembers[memberIndex] = member;
                
                // 更新排行榜
                console.log(`事務中: 更新排行榜 ${leaderboardData.name} (${leaderboardDoc.id}): 用戶支出 +${expenseAmount}, 新總額=${member.totalExpense}`);
                transaction.update(doc(db, "leaderboards", leaderboardDoc.id), {
                  members: updatedMembers
                });
                
                updatedLeaderboardCount++;
              } else {
                console.log(`事務中: 用戶不是排行榜 ${leaderboardData.name} 的成員，跳過更新`);
              }
            }
          }
          
          console.log(`事務中: 共更新 ${updatedLeaderboardCount} 個排行榜`);
          
          return { 
            docId: expenseRef.id, 
            splitDocId 
          };
        } catch (error) {
          console.error("事務內部執行失敗:", error);
          if (error instanceof Error) {
            console.error("事務內部錯誤詳情:", error.message);
          }
          throw error; // 重新拋出以便外部捕獲
        }
      });
      
      console.log("Firestore 事務完成", result);
      return result;
    } catch (error) {
      console.error("Firestore 事務整體失敗", error);
      if (error instanceof Error) {
        console.error("事務失敗詳細信息:", {
          名稱: error.name,
          訊息: error.message,
          堆疊: error.stack
        });
      }
      throw error; // 重新拋出以便外部捕獲和處理
    }
  };

  // 獲取類別對應的顏色
  const getCategoryColor = (category: string): string => {
    const colors: { [key: string]: string } = {
      餐飲: "#FF6B6B", // 紅色
      交通: "#4ECDC4", // 青色
      生活: "#A487C3", // 紫色 (elora-purple)
      購物: "#10B981", // 綠色
      娛樂: "#FFD166", // 黃色
      住支: "#FAE278", // 淺黃色
      健康: "#83D6DE", // 水藍色
      醫療: "#EF4444", // 紅色
      旅遊: "#F3A953", // 橙色
      服裝: "#C3A487", // 棕色
      教育: "#A487C3", // 紫色
      社交: "#FF8896", // 粉紅色
      投資: "#87C387", // 綠色
      捐贈: "#D687C3", // 粉紫色
      其他: "#B3B3B3"  // 灰色
    };
    return colors[category] || "#B3B3B3";
  };

  // 將 Expense 類型轉換為表單需要的格式
  const convertExpenseForForm = (expense: Expense | null) => {
    if (!expense) return null;

    return {
      id: expense.id,
      amount: expense.amount,
      category: expense.category.name,
      date:
        expense.date instanceof Date
          ? expense.date.toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      notes: expense.notes,
      attachments: [],
    };
  };

  // 編輯支出記錄
  const editExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setShowExpenseForm(true);
  };

  // 更新支出記錄
  const updateExpense = async (updatedData: {
    amount: number;
    category: string;
    date: string;
    notes: string;
    attachments?: File[];
  }): Promise<boolean> => {
    try {
      if (!currentUser || !editingExpense) return false;
      
      console.log("開始更新支出記錄:", updatedData);
      
      // 處理附件
      let attachmentUrls: string[] = [];
      if (updatedData.attachments && updatedData.attachments.length > 0) {
        // 這裡可以添加新的附件上傳邏輯
        attachmentUrls = updatedData.attachments.map((file) =>
          URL.createObjectURL(file),
        );
      }

      // 安全地處理日期轉換
      let expenseDate;
      try {
        // 嘗試創建日期對象
        expenseDate = new Date(updatedData.date);
        // 檢查是否是有效日期
        if (isNaN(expenseDate.getTime())) {
          throw new Error("Invalid date");
        }
      } catch (e) {
        // 默認為當前日期
        console.warn(`無效的日期格式: ${JSON.stringify(updatedData.date)}`);
        expenseDate = new Date();
      }
      
      // 立即更新UI
      const updatedExpense: Expense = {
        ...editingExpense,
        amount: updatedData.amount,
        category: {
          id: updatedData.category,
          name: updatedData.category,
        icon: getCategoryIcon(updatedData.category),
        },
        date: expenseDate,
        notes: updatedData.notes || "",
        userId: currentUser.uid,
      };

      setExpenses((prev) => {
        const updated = prev.map((item) =>
          item.id === editingExpense.id ? updatedExpense : item,
        );
        // 同時更新緩存
        if (currentUser) {
          setUserDataCache((cache) => ({
            ...cache,
            [currentUser.uid]: updated,
          }));
        }
        return updated;
      });
      
      // 更新Firebase數據
      const expenseDocRef = doc(db, "expenses", editingExpense.id);
      await updateDoc(expenseDocRef, {
        amount: updatedData.amount,
        category: updatedData.category,
        // 將日期轉換為 Timestamp 對象存儲
        date: Timestamp.fromDate(new Date(updatedData.date)),
        notes: updatedData.notes,
        attachmentUrls,
        updatedAt: new Date(),
      });
      
      console.log("支出記錄已更新，ID:", editingExpense.id);
      
      // 重置編輯狀態
      setEditingExpense(null);
      
      return true;
    } catch (error) {
      console.error("更新支出失敗:", error);
      alert("更新支出記錄時出現錯誤，請稍後再試");
      return false;
    }
  };

  // 刪除支出記錄 - 進一步優化版本
  const deleteExpense = async (id: string) => {
    try {
      if (!currentUser) {
        setError("請先登入再刪除記錄");
        setTimeout(() => setError(null), 3000);
        return;
      }

      console.log(`開始刪除支出記錄: ${id}`);

      // 立即更新UI，提高響應速度
      setExpenses((prev) => prev.filter((expense) => expense.id !== id));

      // 立即顯示成功訊息
      setSuccessMessage("記錄已刪除");
      setShowSuccessMessage(true);
      if (successMessageTimer.current) {
        window.clearTimeout(successMessageTimer.current);
      }
      successMessageTimer.current = window.setTimeout(
        () => setShowSuccessMessage(false),
        1500,
      );

      // 後臺執行Firebase記錄刪除
      try {
        await deleteDoc(doc(db, "expenses", id));
        console.log(`Firebase記錄刪除成功: ${id}`);
      } catch (error) {
        console.error(`Firebase刪除失敗:`, error);
        // 即便Firebase刪除失敗，UI已經更新，用戶體驗不受影響
        // 下次刷新時會從Firebase獲取正確數據
      }

      // 非同步更新圖表
      setTimeout(
        () => window.dispatchEvent(new Event("expenses-changed")),
        100,
      );
    } catch (error) {
      console.error("刪除記錄時發生未知錯誤:", error);
      setError("刪除失敗，請稍後再試");
      setTimeout(() => setError(null), 3000);
    }
  };

  // 重構圓餅圖初始化
useEffect(() => {
    // 初始化圖表
    initPieChart();

    // 處理窗口大小變化
    const handleResize = () => {
      if (chartInstance) {
        // 首先調整大小
        chartInstance.resize();

        // 重新應用佈局調整以適應新窗口大小
        const isMobile = window.innerWidth < 768;
        const isSelectedMode = selectedCategory !== null;

        // 重新設置佈局參數，但保持其他選項不變
        chartInstance.setOption({
          title: null, // 確保不顯示標題
          legend: {
            show: !isSelectedMode,
            left: "center",
          },
          series: [
            {
              center: [
                isSelectedMode ? (isMobile ? "48%" : "45%") : "50%",
                "45%", // 從"40%"改為"45%"，向下移動
              ],
            },
          ],
        });
      }
    };
    window.addEventListener("resize", handleResize);

    // 處理數據變化
    const handleExpensesChanged = () => {
      console.log("支出數據變更, 重新渲染圓餅圖");
      initPieChart();
    };
    window.addEventListener("expenses-changed", handleExpensesChanged);

    return () => {
      // 清理
      if (chartInstance) {
        chartInstance.dispose();
      }
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("expenses-changed", handleExpensesChanged);
    };
  }, [expenses, chartRef.current]);

  // 監聽selectedCategory狀態變化，更新餅圖位置
  useEffect(() => {
    if (chartInstance) {
      const isMobile = window.innerWidth < 768; // 檢測是否為移動設備

      // 移除標題設定，調整圖例和位置
      chartInstance.setOption({
        title: null, // 確保不顯示標題
      legend: {
          show: !selectedCategory, // 選中類別時隱藏圖例
          orient: "horizontal",
          left: "center",
        bottom: 10,
        },
        series: [
          {
            center: [
              selectedCategory ? (isMobile ? "48%" : "45%") : "50%",
              "45%", // 從"40%"改為"45%"，向下移動
            ],
          },
        ],
      });
    }
  }, [selectedCategory]);

  // 重構每日趨勢圖初始化
  useEffect(() => {
    // 初始化圖表
    initDailyChart();

    // 處理窗口大小變化
    const handleResize = () => {
      if (dailyChartInstance) {
        dailyChartInstance.resize();

        // 確保趨勢圖在移動端也能正確顯示
        const isMobile = window.innerWidth < 768;
        dailyChartInstance.setOption({
          grid: {
            left: isMobile ? "10%" : "3%",
            right: isMobile ? "5%" : "4%",
            containLabel: true,
          },
        });
      }
    };
    window.addEventListener("resize", handleResize);

    // 處理數據變化
    const handleExpensesChanged = () => {
      console.log("支出數據變更, 重新渲染每日趨勢圖");
      initDailyChart();
    };
    window.addEventListener("expenses-changed", handleExpensesChanged);
  
  return () => {
      // 清理
      if (dailyChartInstance) {
        dailyChartInstance.dispose();
      }
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("expenses-changed", handleExpensesChanged);
    };
  }, [expenses, dailyChartRef.current]);

  // 篩選當前選中日期的消費 - 完全重寫確保日期比較正確
  const getFilteredExpenses = () => {
    console.log("===開始篩選支出記錄===");
    console.log("當前選擇的日期選項:", selectedDateOption);

    // 全部記錄直接返回
    if (selectedDateOption === "all") {
      console.log("顯示全部消費記錄");
      return expenses;
    }

    // 處理按月過濾
    if (selectedDateOption === "month") {
      console.log("按本月過濾消費記錄");
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      return expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate.getMonth() === currentMonth && 
               expenseDate.getFullYear() === currentYear;
      });
    }
    
    // 處理選擇月份過濾
    if (selectedDateOption === "month_select") {
      console.log("按選擇的月份過濾消費記錄:", selectedMonth);
      const [year, month] = selectedMonth.split('-').map(Number);
      
      return expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate.getMonth() === month - 1 && 
               expenseDate.getFullYear() === year;
      });
    }
    
    // 處理本週過濾
    if (selectedDateOption === "this_week") {
      console.log("按本週過濾消費記錄");
      const today = new Date();
      const currentDay = today.getDay() || 7; // 處理週日為0的情況
      const firstDayOfWeek = new Date(today);
      firstDayOfWeek.setDate(today.getDate() - (currentDay - 1));
      firstDayOfWeek.setHours(0, 0, 0, 0);
      
      const lastDayOfWeek = new Date(firstDayOfWeek);
      lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
      lastDayOfWeek.setHours(23, 59, 59, 999);
      
      console.log("本週範圍:", {
        開始: firstDayOfWeek.toISOString(),
        結束: lastDayOfWeek.toISOString()
      });
      
      return expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= firstDayOfWeek && expenseDate <= lastDayOfWeek;
      });
    }
    
    // 處理上週過濾
    if (selectedDateOption === "last_week") {
      console.log("按上週過濾消費記錄");
      const today = new Date();
      const currentDay = today.getDay() || 7; // 處理週日為0的情況
      const firstDayOfLastWeek = new Date(today);
      firstDayOfLastWeek.setDate(today.getDate() - (currentDay - 1) - 7);
      firstDayOfLastWeek.setHours(0, 0, 0, 0);
      
      const lastDayOfLastWeek = new Date(firstDayOfLastWeek);
      lastDayOfLastWeek.setDate(firstDayOfLastWeek.getDate() + 6);
      lastDayOfLastWeek.setHours(23, 59, 59, 999);
      
      console.log("上週範圍:", {
        開始: firstDayOfLastWeek.toISOString(),
        結束: lastDayOfLastWeek.toISOString()
      });
      
      return expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= firstDayOfLastWeek && expenseDate <= lastDayOfLastWeek;
      });
    }

    // 獲取篩選日期
    let filterDate: Date;

    if (selectedDateOption === "today") {
      // 每次都重新獲取今天的日期，不使用緩存
      filterDate = new Date();
      filterDate.setHours(0, 0, 0, 0);
      console.log("使用今天作為篩選日期:", filterDate.toISOString());
    } else if (selectedDateOption === "yesterday") {
      // 昨天 = 當前日期減去1天
      filterDate = new Date();
      filterDate.setHours(0, 0, 0, 0);
      filterDate.setDate(filterDate.getDate() - 1);
      console.log("使用昨天作為篩選日期:", filterDate.toISOString());
    } else {
      // 使用用戶選擇的日期
      filterDate = selectedDate;
      console.log("使用選定日期作為篩選日期:", filterDate.toISOString());
    }

    // 提取年月日用於精確比較
    const filterYear = filterDate.getFullYear();
    const filterMonth = filterDate.getMonth();
    const filterDay = filterDate.getDate();

    console.log("篩選日期組成部分:", {
      年: filterYear,
      月: filterMonth + 1,
      日: filterDay,
    });

    // 使用年月日精確比較篩選
    const filtered = expenses.filter((expense) => {
      try {
        // 提取支出記錄的年月日
        const expenseYear = expense.date.getFullYear();
        const expenseMonth = expense.date.getMonth();
        const expenseDay = expense.date.getDate();

        // 日期必須精確匹配年月日
        const matches =
          expenseYear === filterYear &&
          expenseMonth === filterMonth &&
          expenseDay === filterDay;

        if (matches) {
          console.log("匹配的支出:", {
            id: expense.id,
            日期: expense.date.toISOString(),
            年: expenseYear,
            月: expenseMonth + 1,
            日: expenseDay,
            金額: expense.amount,
          });
        }

        return matches;
      } catch (err) {
        console.error("篩選時出錯:", err, expense);
        return false;
      }
    });

    console.log(`篩選結果: 找到 ${filtered.length} 條記錄`);
    return filtered;
  };

  const filteredTransactions = getFilteredExpenses();

  // 產生一個渲染 key，用於強制組件重新渲染
  const [renderKey, setRenderKey] = useState<number>(Date.now());

  // 強制重新渲染組件的函數
  const forceRerender = () => {
    setRenderKey(Date.now());
  };

  // 在支出數據變更時，強制組件重新渲染
  useEffect(() => {
    forceRerender();
  }, [expenses.length]);

  // Firebase連接測試函數
  const testFirebaseConnection = async () => {
    try {
      if (!currentUser) {
        setError("請先登入再測試");
        setTimeout(() => setError(null), 3000);
        return;
      }

      setSuccessMessage("正在測試連線...");
      setShowSuccessMessage(true);

      console.log("===========開始連線測試===========");
      console.log("當前用戶:", currentUser.uid, currentUser.email);
      console.log("檢查Firestore實例:", db ? "已初始化" : "未初始化");

      // 嘗試添加一條測試記錄
      const testRecord = {
        amount: 1,
        category: "測試",
        date: new Date().toISOString().slice(0, 10),
        notes: "Firebase連接測試 - " + new Date().toISOString(),
        userId: currentUser.uid,
        createdAt: new Date(),
      };

      console.log("準備添加測試消費明細:", testRecord);

      // 添加到Firebase
      const docRef = await addDoc(collection(db, "expenses"), testRecord);

      console.log("測試消費明細已添加，ID:", docRef.id);
      console.log("===========連線測試成功===========");

      // 顯示成功消息
      setSuccessMessage("連線正常！已添加測試消費明細");
      setShowSuccessMessage(true);
      if (successMessageTimer.current) {
        window.clearTimeout(successMessageTimer.current);
      }
      successMessageTimer.current = window.setTimeout(
        () => setShowSuccessMessage(false),
        3000,
      );

      // 自動刷新數據
      if (typeof (window as any).initializeAppData === "function") {
        (window as any).initializeAppData();
      } else {
        console.log("刷新函數未定義，無法自動刷新數據");
        // 不再強制刷新頁面，避免用戶數據丟失
        // console.log("刷新函數未定義，嘗試手動刷新頁面");
        // window.location.reload();
        
        // 顯示一個較為友好的提示
        setSuccessMessage("初始化完成");
        setShowSuccessMessage(true);
        if (successMessageTimer.current) {
          window.clearTimeout(successMessageTimer.current);
        }
        successMessageTimer.current = window.setTimeout(
          () => setShowSuccessMessage(false),
          1500,
        );
      }
    } catch (error) {
      console.error("連線測試失敗:", error);
      // 顯示更詳細的錯誤信息
      if (error instanceof Error) {
        console.error("錯誤類型:", error.name);
        console.error("錯誤消息:", error.message);
        console.error("錯誤堆棧:", error.stack);
        setError(`連線失敗: ${error.message}`);
      } else {
        setError("連線失敗，請檢查控制檯日誌");
      }
      setTimeout(() => setError(null), 5000);
      console.log("===========連線測試失敗===========");
    }
  };

  // 讀取通知數量
  useEffect(() => {
    if (currentUser) {
      // 獲取好友請求通知
      const fetchNotifications = async () => {
        try {
          const friendRequests = await getFriendRequests();
          const leaderboardInvites = await getLeaderboardInvites();

          // 讀取排行榜結束通知
          const notificationsRef = collection(db, "notifications");
          const q = query(
            notificationsRef,
            where("type", "==", "leaderboard_ended"),
            where("toUserId", "==", currentUser.uid),
            where("read", "==", false),
          );

          const notificationsSnapshot = await getDocs(q);
          const endedNotifications: any[] = [];

          notificationsSnapshot.forEach((doc) => {
            endedNotifications.push({
              id: doc.id,
              ...doc.data(),
            });
          });

          setLeaderboardEndedNotifications(endedNotifications);
          
          // 讀取借貸到期通知
          const loanDueQuery = query(
            notificationsRef,
            where("type", "==", "loan_due_warning"),
            where("toUserId", "==", currentUser.uid),
            where("read", "==", false),
          );
          
          const loanDueSnapshot = await getDocs(loanDueQuery);
          const dueNotifications: any[] = [];
          
          loanDueSnapshot.forEach((doc) => {
            dueNotifications.push({
              id: doc.id,
              ...doc.data(),
            });
          });
          
          setLoanDueNotifications(dueNotifications);
          
          // 讀取借貸逾期通知
          const loanOverdueQuery = query(
            notificationsRef,
            where("type", "==", "loan_overdue"),
            where("toUserId", "==", currentUser.uid),
            where("read", "==", false),
          );
          
          const loanOverdueSnapshot = await getDocs(loanOverdueQuery);
          const overdueNotifications: any[] = [];
          
          loanOverdueSnapshot.forEach((doc) => {
            overdueNotifications.push({
              id: doc.id,
              ...doc.data(),
            });
          });
          
          setLoanOverdueNotifications(overdueNotifications);
          
          // 讀取分帳群組邀請
          const groupInvitesRef = collection(db, "groupInvites");
          const groupInvitesQuery = query(
            groupInvitesRef,
            where("inviteeId", "==", currentUser.uid),
            where("status", "==", "pending"),
          );
          
          const groupInvitesSnapshot = await getDocs(groupInvitesQuery);
          const groupInvites: any[] = [];
          
          groupInvitesSnapshot.forEach((doc) => {
            groupInvites.push({
              id: doc.id,
              ...doc.data(),
            });
          });
          
          setGroupInviteCount(groupInvites.length);

          // 更新通知計數 (好友請求 + 排行榜邀請 + 排行榜結束通知 + 借貸到期通知 + 借貸逾期通知 + 分帳群組邀請)
          setNotificationCount(
            friendRequests.length +
              leaderboardInvites.length +
              endedNotifications.length +
              dueNotifications.length +
              overdueNotifications.length +
              groupInvites.length,
          );

          // 保存請求和邀請數據以便顯示
          setFriendRequestCount(friendRequests.length);
          setLeaderboardInviteCount(leaderboardInvites.length);
        } catch (error) {
          console.error("獲取通知失敗:", error);
        }
      };

      fetchNotifications();

      // 定期檢查通知
      const notificationInterval = setInterval(fetchNotifications, 30000); // 每30秒檢查一次

      return () => clearInterval(notificationInterval);
    }
  }, [currentUser, getFriendRequests, getLeaderboardInvites]);

  // 找到 formatAmount 函數的定義
  const formatAmount = (amount: number): string => {
    return amount.toLocaleString("zh-TW", {
      style: "currency",
      currency: "TWD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  // 找到 calculateTotalAmount 函數的定義
  const calculateTotalAmount = (expenses: Expense[]): number => {
    return expenses.reduce((total, expense) => total + expense.amount, 0);
  };

  // 顯示排行榜管理面板
  const handleShowLeaderboardManager = () => {
    console.log("App - 打開排行榜管理面板");

    // 檢查是否有全局變量標記
    if (
      typeof window !== "undefined" &&
      (window as any).__shouldShowLeaderboardManager
    ) {
      console.log("App - 檢測到全局變量__shouldShowLeaderboardManager，清除");
      (window as any).__shouldShowLeaderboardManager = false;
    }

    setShowLeaderboardForm(true);
    setShowSidebar(false);
    setShowExpenseForm(false);
    setShowNotifications(false);

    // 其他可能需要關閉的面板
    if (setShowProfileForm) setShowProfileForm(false);
    if (setShowFriendManagement) setShowFriendManagement(false);
    if (setShowLeaderboardInvites) setShowLeaderboardInvites(false);
  };

  // 監聽返回排行榜管理事件
  useEffect(() => {
    const handleReturnToLeaderboardManager = () => {
      console.log("App - 收到返回排行榜管理事件");
      handleShowLeaderboardManager();
    };

    window.addEventListener(
      "returnToLeaderboardManager",
      handleReturnToLeaderboardManager,
    );
      
      return () => {
      window.removeEventListener(
        "returnToLeaderboardManager",
        handleReturnToLeaderboardManager,
      );
    };
  }, []);

  // 在getCategoryIcon和getCategoryColor函数之间添加getCategoryName函数
  const getCategoryName = (categoryId: string): string => {
    const nameMap: {[key: string]: string} = {
      'food': '餐飲',
      'transportation': '交通',
      'entertainment': '娛樂',
      'shopping': '購物',
      'education': '教育',
      'medical': '醫療',
      'investment': '投資',
      'utilities': '住支',
      'rent': '租金',
      'travel': '旅行',
      'income': '收入',
      'other': '其他',
      'overall': '總體',
      'multi': '多類別'
    };
    
    // 特別處理investment類別
    if (categoryId === 'investment') return '投資';
    
    return nameMap[categoryId] || categoryId;
  };

  // 根據選定類別過濾支出
  const getCategoryExpenses = () => {
    if (!selectedCategory) return [];

    // 先根据圆饼图模式过滤数据
    let filteredByMode = expenses;
    
    // 使用与圆饼图相同的过滤逻辑
    if (pieChartMode === 'current') {
      // 獲取當前年月
      const today = new Date();
      const currentMonth = today.getMonth(); // 0-11
      const currentYear = today.getFullYear();
      
      console.log(`類別支出明細 - 過濾當前月份: ${currentYear}年${currentMonth + 1}月`);
      
      // 按當前月份過濾
      filteredByMode = expenses.filter(expense => {
        try {
          if (!expense.date) return false;
          
          const expDate = expense.date instanceof Date ? 
            new Date(expense.date.getTime()) : 
            new Date(expense.date);
            
          if (isNaN(expDate.getTime())) return false;
          
          // 直接比較年月
          const expMonth = expDate.getMonth();
          const expYear = expDate.getFullYear();
          
          return (expYear === currentYear && expMonth === currentMonth);
        } catch (err) {
          console.error(`處理支出 ${expense.id} 時出錯:`, err);
          return false;
        }
      });
      
      console.log(`類別支出明細 - 當月過濾結果: ${filteredByMode.length} 筆記錄`);
    } 
    else if (pieChartMode === 'selected') {
      // 使用用戶選擇的月份
      const [year, month] = pieChartMonth.split('-').map(Number);
      const targetMonth = month - 1; // JavaScript月份從0開始
      
      console.log(`類別支出明細 - 過濾選定月份: ${year}年${month}月`);
      
      // 按選定月份過濾
      filteredByMode = expenses.filter(expense => {
        try {
          if (!expense.date) return false;
          
          const expDate = expense.date instanceof Date ? 
            new Date(expense.date.getTime()) : 
            new Date(expense.date);
            
          if (isNaN(expDate.getTime())) return false;
          
          // 直接比較年月
          const expMonth = expDate.getMonth();
          const expYear = expDate.getFullYear();
          
          return (expYear === year && expMonth === targetMonth);
        } catch (err) {
          console.error(`處理支出 ${expense.id} 時出錯:`, err);
          return false;
        }
      });
      
      console.log(`類別支出明細 - 選定月份過濾結果: ${filteredByMode.length} 筆記錄`);
    }
    // 'all' 模式使用所有支出數據

    // 然後再按類別過濾
    return filteredByMode.filter((expense) => {
      const categoryName =
        typeof expense.category === "string"
          ? (expense.category === 'investment' ? '投資' : getCategoryName(expense.category))
          : (expense.category?.id === 'investment' ? '投資' : expense.category?.name || "未分類");

      return categoryName === selectedCategory;
    });
  };

  const categoryExpenses = getCategoryExpenses();

  // 登錄按鈕
  const handleLogin = () => {
    console.log("點擊登錄按鈕");
    setLoginFormMode("login");
    setShowLoginForm(true);
  };

  // 註冊按鈕
  const handleRegister = () => {
    console.log("點擊註冊按鈕");
    setLoginFormMode("register");
    setShowLoginForm(true);
  };

  // 登錄成功回調
  const handleLoginSuccess = () => {
    console.log("檢測到登錄/註冊成功");
    // 延遲檢查用戶狀態，確保 Firebase Auth 已完成狀態更新
    setTimeout(() => {
      console.log("延遲檢查用戶狀態:", currentUser ? "已登錄" : "未登錄");
      if (currentUser) {
        // 只有確認用戶已登錄才關閉表單
        setShowLoginForm(false);
      }
    }, 800);
  };

  // 添加專門用於初始化圖表的useEffect
  useEffect(() => {
    console.log("圖表初始化useEffect觸發", "expenses長度:", expenses?.length);

    // 當數據存在且DOM已經渲染時，初始化圖表
    if (expenses && expenses.length > 0) {
      console.log("數據已加載，延遲初始化圖表");

      // 延遲執行以確保DOM已經完全渲染
      setTimeout(() => {
        try {
          console.log("開始初始化圓餅圖");
          if (chartRef.current) {
            initPieChart();
      } else {
            console.warn("圓餅圖容器DOM元素不存在");
          }

          console.log("開始初始化每日趨勢圖");
          if (dailyChartRef.current) {
            initDailyChart();
          } else {
            console.warn("趨勢圖容器DOM元素不存在");
          }
        } catch (error) {
          console.error("圖表初始化過程中發生錯誤:", error);
        }
      }, 300);
    } else {
      console.log("無消費數據，或者DOM未渲染，創建空圖表");
      setTimeout(() => {
        // 即使沒有數據，也創建空的圖表以顯示"暫無數據"
        if (chartRef.current) {
          createEmptyPieChart();
        }

        if (dailyChartRef.current) {
          createEmptyDailyChart();
        }
      }, 300);
    }
  }, [expenses, selectedCategory]);
  
  // 添加波紋效果處理
  useEffect(() => {
    const handleRippleEffect = (event: Event) => {
      const mouseEvent = event as MouseEvent;
      const target = mouseEvent.currentTarget as HTMLElement;
      if (!target || !target.classList.contains('ripple-effect')) return;
      
      const rect = target.getBoundingClientRect();
      const x = mouseEvent.clientX - rect.left;
      const y = mouseEvent.clientY - rect.top;
      
      const ripple = document.createElement('span');
      ripple.style.position = 'absolute';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      ripple.style.transform = 'translate(-50%, -50%)';
      ripple.style.width = '0';
      ripple.style.height = '0';
      ripple.style.borderRadius = '50%';
      ripple.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
      ripple.style.pointerEvents = 'none';
      
      target.appendChild(ripple);
      
      // 設置動畫
      requestAnimationFrame(() => {
        ripple.style.transition = 'all 0.6s ease-out';
        ripple.style.width = rect.width * 2.5 + 'px';
        ripple.style.height = rect.width * 2.5 + 'px';
        ripple.style.opacity = '0';
        
        // 動畫結束後移除
        setTimeout(() => {
          if (ripple.parentNode === target) {
            target.removeChild(ripple);
          }
        }, 600);
      });
    };
    
    // 為所有具有ripple-effect類的元素添加點擊效果
    const rippleElements = document.querySelectorAll('.ripple-effect');
    rippleElements.forEach(el => {
      el.addEventListener('mousedown', handleRippleEffect as EventListener);
    });
      
      return () => {
      rippleElements.forEach(el => {
        el.removeEventListener('mousedown', handleRippleEffect as EventListener);
      });
    };
  }, [showSidebar, showLoginForm, showProfileForm]); // 依賴於可能會改變DOM的狀態
  
  const [showLoanManagement, setShowLoanManagement] = useState(false); // 借貸管理顯示狀態
  const [overdueLoansCount, setOverdueLoansCount] = useState(0); // 逾期借貸數量
  
  // 添加更新逾期借貸數的事件監聽器
  useEffect(() => {
    const updateOverdueLoansCount = (e: CustomEvent) => {
      if (e.detail && e.detail.count !== undefined) {
        setOverdueLoansCount(e.detail.count);
      }
    };
    
    // 從localStorage獲取初始逾期借貸數
    const storedCount = localStorage.getItem('overdueLoansCount');
    if (storedCount) {
      setOverdueLoansCount(Number(storedCount));
    }
    
    // 添加事件監聽器
    window.addEventListener('updateOverdueLoansCount', updateOverdueLoansCount as EventListener);
    
    return () => {
      window.removeEventListener('updateOverdueLoansCount', updateOverdueLoansCount as EventListener);
    };
  }, []);
  
  // 添加預算設置狀態
  const [showBudgetSetting, setShowBudgetSetting] = useState(false);
  const [showSplitExpenseForm, setShowSplitExpenseForm] = useState(false); // 添加好友分帳表單狀態
  
  // 處理顯示預算設置表單的事件
  useEffect(() => {
    const handleShowBudgetSetting = () => {
      console.log('收到顯示預算設置事件');
      setShowBudgetSetting(true);
    };
    
    // 添加事件監聽器
    window.addEventListener('showBudgetSetting', handleShowBudgetSetting);
    
    // 組件卸載時清理事件監聽器
    return () => {
      window.removeEventListener('showBudgetSetting', handleShowBudgetSetting);
    };
  }, []);
  
  // 主要 useEffect - 仅在应用加载时运行一次
  useEffect(() => {
    console.log("App 组件已加载");

    // 检测 Firestore 索引错误并提供解决方案
    const handleFirestoreError = (event: ErrorEvent) => {
      if (event.error && typeof event.error.message === 'string' && 
          event.error.message.includes('The query requires an index')) {
        
        console.error("检测到 Firestore 索引错误:");
        console.error(event.error.message);
        
        // 提取索引创建链接
        const indexMatch = event.error.message.match(/https:\/\/console\.firebase\.google\.com[\w\/\.\-\?\=\&\%]+/);
        if (indexMatch && indexMatch[0]) {
          console.log("%c点击以下链接创建必要的索引:", "color: green; font-weight: bold; font-size: 16px;");
          console.log("%c" + indexMatch[0], "color: blue; text-decoration: underline; cursor: pointer; font-size: 14px;");
          
          // 在页面显示提示
          setError("需要创建 Firestore 索引，请检查控制台获取详细信息");
          setTimeout(() => setError(null), 5000);
        }
      }
    };

    // 添加全局错误处理器
    window.addEventListener('error', handleFirestoreError);

    return () => {
      window.removeEventListener('error', handleFirestoreError);
    };
  }, []);

  // 监听新群组邀请的事件
  useEffect(() => {
    const handleNewGroupInvite = (event: Event) => {
      // 更新群組邀請計數（從數據庫重新獲取）
      if (currentUser) {
        // 查詢待處理的群組邀請
        const fetchGroupInvites = async () => {
          try {
            const groupInvitesRef = collection(db, "groupInvites");
            const groupInvitesQuery = query(
              groupInvitesRef,
              where("inviteeId", "==", currentUser.uid),
              where("status", "==", "pending"),
            );
            
            const groupInvitesSnapshot = await getDocs(groupInvitesQuery);
            setGroupInviteCount(groupInvitesSnapshot.size);
            
            // 更新總通知計數
            setNotificationCount(prev => prev + 1);
          } catch (error) {
            console.error("獲取群組邀請失敗:", error);
          }
        };
        
        fetchGroupInvites();
      }
    };
    
    // 監聽顯示群組邀請列表的事件
    const handleShowGroupInvites = () => {
      console.log("App - 收到顯示群組邀請列表事件");
      setShowGroupInvites(true);
    };
    
    window.addEventListener('newGroupInvite', handleNewGroupInvite);
    window.addEventListener('showGroupInvites', handleShowGroupInvites);
    
    return () => {
      window.removeEventListener('newGroupInvite', handleNewGroupInvite);
      window.removeEventListener('showGroupInvites', handleShowGroupInvites);
    };
  }, [currentUser]);

  // 檢測URL參數並顯示借貸管理模態框
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const action = queryParams.get('action');
    
    if (action === 'add-lend' || action === 'add-borrow') {
      const amount = queryParams.get('amount') || '';
      const person = queryParams.get('person') || '';
      const description = queryParams.get('description') || '';
      const date = queryParams.get('date') || '';
      
      // 設置借貸參數
      setLoanParams({
        action: action as 'add-lend' | 'add-borrow',
        amount,
        person,
        description,
        date
      });
      
      // 顯示借貸管理模態框
      setShowLoanManagement(true);
      
      // 清除URL參數
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const [showSplitExpenseManagement, setShowSplitExpenseManagement] = useState(false);

  // 組件掛載時檢查URL參數
  useEffect(() => {
    // 檢查URL參數
    const queryParams = new URLSearchParams(window.location.search);
    const action = queryParams.get('action');
    
    if (action === 'add-lend' || action === 'add-borrow') {
      // 處理借貸管理參數
      setLoanParams({
        action: action as 'add-lend' | 'add-borrow',
        amount: queryParams.get('amount') || '',
        person: queryParams.get('person') || '',
        description: queryParams.get('description') || '',
        date: queryParams.get('date') || ''
      });
      
      // 打開借貸管理
      setShowLoanManagement(true);
      
      // 清除URL參數
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (action === 'add-expense') {
      // 處理新增支出參數
      setExpenseParams({
        amount: queryParams.get('amount') || '',
        category: queryParams.get('category') || '其他',
        notes: queryParams.get('notes') || '',
        date: queryParams.get('date') || format(new Date(), 'yyyy-MM-dd') // 從URL獲取日期，或使用當前日期
      });
      
      // 自動打開支出表單
      setShowExpenseForm(true);
      
      // 清除URL參數
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // 在圓餅圖模式或選擇月份變化時重新初始化圖表
  useEffect(() => {
    if (expenses.length > 0 && chartRef.current) {
      console.log('圓餅圖顯示模式變更為:', pieChartMode, pieChartMode === 'selected' ? pieChartMonth : '');
      initPieChart();
      
      // 重新計算類別支出明細，確保與圓餅圖顯示的數據一致
      const updatedCategoryExpenses = getCategoryExpenses();
      console.log(`更新類別支出明細: ${updatedCategoryExpenses.length} 筆記錄`);
    }
  }, [pieChartMode, pieChartMonth]);

  return (
    <div className="bg-[#F5F5FA] min-h-screen font-sans">
      {/* 頂部導航欄 */}
      <nav className={`fixed top-0 left-0 right-0 bg-white bg-opacity-95 backdrop-blur-md shadow-sm z-20 nav-scroll-effect ${navScrolled ? 'scrolled' : ''}`}>
        <div className="flex justify-between items-center px-4 py-3 max-w-5xl mx-auto">
          {/* Left-side navigation items with toggle sidebar button */}
          <div className="flex items-center gap-3">
            {currentUser && (
          <button 
                className="p-2 text-[#A487C3] hover:text-[#8A5DC8] bg-white hover:bg-[#F8F3FF] rounded-lg transition-all duration-300 shadow-sm hover:shadow-md border border-[#F5F5F5] menu-icon-rotate ripple-effect"
                onClick={() => setShowSidebar(!showSidebar)}
          >
            <i className="fas fa-bars"></i>
          </button>
            )}
            <div className="flex items-center">
              <span className="text-lg font-bold text-[#A487C3] nav-logo">
                <i className="fas fa-moon mr-1"></i>記帳狼人殺
              </span>
            </div>
        </div>
        
          {/* Right-side navigation items */}
          {currentUser ? (
            <div className="flex items-center gap-3">
              {/* 通知圖標 */}
              <div className="relative">
                <button 
                  className="w-10 h-10 flex items-center justify-center text-white bg-[#A487C3] hover:bg-[#8A5DC8] rounded-full transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white ripple-effect"
                  onClick={() => setShowNotifications(!showNotifications)}
                  style={{ overflow: 'visible' }}
                >
                  <i className="fas fa-bell"></i>
                </button>
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg z-50 notification-badge border-2 border-white">
                    {notificationCount}
                  </span>
                )}
              </div>

              {/* 用戶頭像 */}
              <button
                className="w-10 h-10 rounded-full shadow-md overflow-hidden cursor-pointer transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white ripple-effect relative"
                onClick={() => setShowProfileForm(!showProfileForm)}
                style={{ 
                  background: userProfileColor || (!currentUser.photoURL ? '#A487C3' : undefined)
                }}
              >
                {!userProfileColor && currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt="用戶頭像"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white font-medium flex items-center justify-center w-full h-full">
                    {userNickname
                      ? userNickname.charAt(0).toUpperCase()
                      : currentUser.email
                        ? currentUser.email.charAt(0).toUpperCase()
                        : "?"}
                  </span>
                )}
              </button>

              {/* 登出按鈕 */}
              <button 
                onClick={() => logout()}
                className="w-10 h-10 flex items-center justify-center text-white bg-[#E07A8D] hover:bg-[#D56B7E] rounded-full transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white ripple-effect"
              >
                <i className="fas fa-sign-out-alt"></i>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
            <button 
                onClick={handleLogin}
                className="py-2 px-4 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-lg transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:bg-white focus:text-[#A487C3] focus:border focus:border-[#A487C3] nav-item ripple-effect"
            >
                登入
            </button>
              <button
                onClick={handleRegister}
                className="py-2 px-4 bg-white hover:bg-[#F8F3FF] text-[#A487C3] hover:text-[#8A5DC8] border border-[#A487C3] rounded-lg transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:bg-white nav-item ripple-effect"
              >
                註冊
              </button>
            </div>
          )}
        </div>
      </nav>
      
      {/* 主要內容區 - 只有登入用戶才能看到 */}
      {currentUser ? (
        <div className="pt-24 px-4 md:px-8 pb-8 max-w-5xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#A487C3] mb-1 font-heading">
              歡迎回來，{userNickname || currentUser.email?.split("@")[0]}
            </h1>
            <p className="text-[#6E6E6E]">
              今天是{" "}
              {new Date().toLocaleDateString("zh-TW", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </p>
          </div>
          
          {/* 添加統計卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* 總支出卡片 */}
            <div 
              className="bg-gradient-to-br from-elora-purple to-elora-purple-light text-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1"
              style={{animation: 'fadeSlideIn 0.6s ease-out both'}}
            >
              <div className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-white text-opacity-80 mb-1">本月消費金額</p>
                  <h3 className="text-2xl font-bold">
                    {new Intl.NumberFormat("zh-TW", {
                      style: "currency",
                      currency: "TWD",
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(
                      expenses
                        .filter(expense => {
                          const today = new Date();
                          const currentMonth = today.getMonth();
                          const currentYear = today.getFullYear();
                          const expenseDate = new Date(expense.date);
                          return expenseDate.getMonth() === currentMonth && 
                                 expenseDate.getFullYear() === currentYear;
                        })
                        .reduce((total, expense) => total + expense.amount, 0)
                    )}
                  </h3>
                </div>
                <div className="w-12 h-12 rounded-xl bg-white bg-opacity-20 flex items-center justify-center">
                  <i className="fas fa-wallet text-xl"></i>
                </div>
              </div>
              <div className="bg-white bg-opacity-10 px-5 py-2 text-sm">
                <span>
                  {expenses
                    .filter(expense => {
                      const today = new Date();
                      const currentMonth = today.getMonth();
                      const currentYear = today.getFullYear();
                      const expenseDate = new Date(expense.date);
                      return expenseDate.getMonth() === currentMonth && 
                             expenseDate.getFullYear() === currentYear;
                    })
                    .length} 筆本月記錄
                </span>
              </div>
            </div>
            
            {/* 今日支出卡片 */}
            <div 
              className="bg-gradient-to-br from-[#E07A8D] to-[#F09CA7] text-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1"
              style={{animation: 'fadeSlideIn 0.6s ease-out 0.2s both'}}
            >
              <div className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-white text-opacity-90 mb-1 font-medium">今日消費</p>
                  <h3 className="text-2xl font-bold">
                    {new Intl.NumberFormat("zh-TW", {
                      style: "currency",
                      currency: "TWD",
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(
                      expenses
                        .filter(expense => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const expenseDate = new Date(expense.date);
                          expenseDate.setHours(0, 0, 0, 0);
                          return expenseDate.getTime() === today.getTime();
                        })
                        .reduce((total, expense) => total + expense.amount, 0)
                    )}
                  </h3>
                </div>
                <div className="w-12 h-12 rounded-xl bg-white bg-opacity-20 flex items-center justify-center">
                  <i className="fas fa-calendar-day text-xl"></i>
                </div>
              </div>
              <div className="bg-white bg-opacity-10 px-5 py-2 text-sm">
                <span>
                  {expenses
                    .filter(expense => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const expenseDate = new Date(expense.date);
                      expenseDate.setHours(0, 0, 0, 0);
                      return expenseDate.getTime() === today.getTime();
                    })
                    .length} 筆今日記錄
                </span>
              </div>
            </div>
          </div>
          
          {/* 快速記帳按鈕 */}
          <div className="mb-8 relative flex gap-2">
            <button 
              className="px-5 py-3 bg-[#E07A8D] hover:bg-[#F09CA7] text-white rounded-xl shadow-sm hover:shadow-md flex items-center gap-2 font-medium transition-all duration-300"
              onClick={() => setShowExpenseForm(true)}
            >
              <i className="fas fa-plus"></i>
              <span>新增消費明細</span>
            </button>
            
            <button 
              className="px-5 py-3 bg-[#6BBFA0] hover:bg-[#5CAA90] text-white rounded-xl shadow-sm hover:shadow-md flex items-center gap-2 font-medium transition-all duration-300"
              onClick={() => {
                const element = document.getElementById('expense-details');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' });
                  // 添加一个高亮效果
                  element.classList.add('highlight-section');
                  setTimeout(() => {
                    element.classList.remove('highlight-section');
                  }, 2000);
                }
              }}
            >
              <i className="fas fa-list-ul"></i>
              <span>歷史消費明細</span>
            </button>
            
            <button 
              className="px-5 py-3 bg-[#4EA8DE] hover:bg-[#3D97CD] text-white rounded-xl shadow-sm hover:shadow-md flex items-center gap-2 font-medium transition-all duration-300"
              onClick={() => {
                // 導航到收入管理頁面
                window.location.href = '/income';
              }}
            >
              <i className="fas fa-coins"></i>
              <span>收入管理</span>
            </button>
          </div>
          
          {/* 成功提示消息 - 固定在畫面中央 */}
          {showSuccessMessage && (
            <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-[#6BCB77] to-[#89D8B0] text-white px-6 py-3 rounded-lg shadow-lg flex items-center z-[9999] text-lg font-medium animate-fade-in">
              <i className="fas fa-check-circle mr-3 text-xl"></i>
              <span>{successMessage}</span>
            </div>
          )}
          
          {/* 顯示錯誤消息的通知 */}
          {error && (
            <div className="fixed top-16 left-0 right-0 mx-auto w-11/12 max-w-md bg-red-50 text-elora-pink p-3 rounded shadow-lg transition-all duration-300 ease-in-out z-50 flex items-center justify-between">
              <div className="flex items-center">
                <i className="fas fa-exclamation-circle mr-2"></i>
                <span>{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-elora-pink hover:text-elora-pink-light"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          )}
          
          {/* 預算進度條區域 - 移到支出分析區塊上方 */}
          {currentUser && <BudgetProgressBars />}
          
          {/* 支出分析卡片 */}
          <div className="relative bg-white bg-opacity-95 backdrop-blur-sm rounded-xl shadow-md border-l-4 border-[#3AA6B9] p-5 mb-6 hover:shadow-lg transition-all duration-300">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center flex-wrap">
                <h2 className="text-lg font-bold text-[#3AA6B9]">支出分析</h2>
                <div className="ml-4 flex items-center space-x-2">
                  <button 
                    className={`text-xs px-2 py-1 rounded-md transition-colors ${pieChartMode === 'all' ? 'bg-[#3AA6B9] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    onClick={() => setPieChartMode('all')}
                  >
                    全部
                  </button>
                  <button 
                    className={`text-xs px-2 py-1 rounded-md transition-colors ${pieChartMode === 'current' ? 'bg-[#3AA6B9] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    onClick={() => setPieChartMode('current')}
                  >
                    當月
                  </button>
                  <div className="relative">
                    <button 
                      className={`text-xs px-2 py-1 rounded-md transition-colors flex items-center ${pieChartMode === 'selected' ? 'bg-[#3AA6B9] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                      onClick={(e) => {
                        // 设置为选择月份模式
                        setPieChartMode('selected');
                        
                        // 获取输入元素
                        const inputEl = document.getElementById('pieChartMonthInput') as HTMLInputElement;
                        if (inputEl) {
                          // 禁止事件冒泡，防止重复触发
                          e.stopPropagation();
                          
                          try {
                            // 尝试使用现代API打开日期选择器
                            if (typeof inputEl.showPicker === 'function') {
                              inputEl.showPicker();
                            } else {
                              // 回退方法：模拟点击
                              inputEl.focus();
                              inputEl.click();
                            }
                          } catch (err) {
                            console.log('无法打开月份选择器，使用备用方法', err);
                            // 备用方法
                            inputEl.focus();
                            inputEl.click();
                          }
                        }
                      }}
                    >
                      選擇月份
                    </button>
                    <input 
                      id="pieChartMonthInput"
                      type="month"
                      value={pieChartMonth}
                      onChange={(e) => {
                        setPieChartMonth(e.target.value);
                        setPieChartMode('selected');
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation(); // 防止事件冒泡
                      }}
                    />
                  </div>
                </div>
              </div>
              {selectedCategory && (
                <button
                  onClick={resetCategorySelection}
                  className="text-sm text-white bg-[#3AA6B9] hover:bg-[#4ABBC9] px-4 py-1.5 rounded-lg flex items-center transition-all duration-300 shadow-sm hover:shadow-md"
                >
                  <i className="fas fa-arrow-left mr-1.5"></i> 返回總覽
                </button>
              )}
            </div>
            <div className="flex flex-col md:flex-row">
              <div
                className={`${selectedCategory ? "md:w-3/5" : "w-full"} transition-all duration-300`}
              >
            {expenses && expenses.length > 0 ? (
                  <div
                    ref={chartRef}
                    style={{
                      height: "260px", // 原先是 "300px"，減小高度
                      width: "100%",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                    key={`pie-chart-${selectedCategory ? "selected" : "overview"}-${chartsKey}`}
                  />
            ) : (
              <div className="text-center py-8 text-gray-500 h-[260px] flex flex-col items-center justify-center">
                    <i className="fas fa-chart-pie text-3xl mb-2 text-elora-purple opacity-40"></i>
                    <p className="mb-3">沒有任何消費明細</p>
                <button 
                  className="px-4 py-2 bg-[#E07A8D] hover:bg-[#F09CA7] text-white rounded-lg text-sm shadow-sm hover:shadow-md transition-all duration-300 ripple-effect floating"
                  onClick={() => setShowExpenseForm(true)}
                >
                  <i className="fas fa-plus-circle mr-2"></i>
                  新增消費明細
                </button>
</div>
)}
              </div>

              {/* 選定類別支出明細 */}
              {selectedCategory && (
                <div className="md:w-2/5 md:pl-4 mt-4 md:mt-0">
                  <div className="bg-gradient-to-br from-elora-cream-light to-white rounded-lg p-3 h-[300px] overflow-y-auto shadow-inner">
                    <h3 className="font-medium text-[#2E2E2E] mb-3 flex items-center">
                      <i
                        className={`fas ${getCategoryIcon(selectedCategory)} mr-2`}
                        style={{ color: getCategoryColor(selectedCategory) }}
                      ></i>
                      {selectedCategory} 支出明細
                    </h3>

                    {categoryExpenses.length > 0 ? (
                      <div className="space-y-3">
                        {categoryExpenses.map((expense, index) => (
                          <div
                            key={expense.id}
                            className="bg-white p-3 rounded-lg shadow-sm border-l-2 border-[#3AA6B9] hover:shadow-md transition-all duration-300"
                            style={{
                              animation: `fadeSlideIn 0.5s ease-out ${index * 0.1}s both`,
                              opacity: 0,
                              transform: 'translateY(20px)'
                            }}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex items-center">
                                <span className="font-medium text-[#2E2E2E]">
                                  {formatAmount(expense.amount)}
                                </span>
                                {expense.notes && (
                                  <span className="text-xs text-[#6E6E6E] ml-2">
                                    {expense.notes.length > 10
                                      ? `${expense.notes.substring(0, 10)}...`
                                      : expense.notes}
                                  </span>
                                )}
                              </div>
                              <span className="text-sm text-[#6E6E6E]">
                                {expense.date.toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-[#6E6E6E]">
                        <p>沒有找到 {selectedCategory} 類別的支出</p>
                      </div>
                    )}

                    <div className="mt-4 pt-2 border-t border-gray-200">
                      <p className="text-right font-medium text-[#2E2E2E]">
                        總計:{" "}
                        {formatAmount(
                          categoryExpenses.reduce(
                            (total, exp) => total + exp.amount,
                            0,
                          ),
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
</div>

          {/* 每日消費長條圖 */}
          <div className="bg-white bg-opacity-95 backdrop-blur-sm rounded-xl shadow-md border-l-4 border-elora-mint p-5 mb-6 hover:shadow-lg transition-all duration-300">
            <h2 className="text-lg font-bold text-[#6BBFA0] mb-4">
              每日消費趨勢
            </h2>
            {expenses && expenses.length > 0 ? (
              <div
                ref={dailyChartRef}
                style={{ height: "300px" }}
                key={`daily-chart-${expenses.length}`}
              ></div>
            ) : (
              <div className="text-center py-8 text-gray-500 h-[300px] flex flex-col items-center justify-center">
                <i className="fas fa-chart-bar text-3xl mb-2 text-elora-mint opacity-40"></i>
                <p className="mb-3">沒有任何消費明細</p>
                <button 
                  className="px-4 py-2 bg-[#E07A8D] hover:bg-[#F09CA7] text-white rounded-lg text-sm shadow-sm hover:shadow-md transition-all duration-300 ripple-effect floating"
                  onClick={() => setShowExpenseForm(true)}
                >
                  <i className="fas fa-plus-circle mr-2"></i>
                  新增消費明細
                </button>
</div>
)}
          </div>
          
          {/* 今日支出 - 放在每日消費趨勢下方 */}
          <div id="expense-details" className="bg-white bg-opacity-95 rounded-xl shadow-md border-l-4 border-elora-pink p-5 mb-6">
            <div className="flex flex-col mb-4">
              {/* 刪除選項卡切換 */}
              
              <div className="mb-3">
                <h2 className="text-xl font-bold text-elora-pink">
                  {selectedDateOption === "today"
                    ? "今日消費明細"
                    : selectedDateOption === "yesterday"
                      ? "昨日消費明細"
                      : selectedDateOption === "month"
                        ? "本月消費明細"
                        : selectedDateOption === "this_week"
                          ? "本週消費明細"
                          : selectedDateOption === "last_week"
                            ? "上週消費明細"
                            : selectedDateOption === "month_select"
                              ? `${selectedMonth.split('-')[0]}年${String(selectedMonth.split('-')[1]).padStart(2, '0')}月消費明細`
                              : selectedDateOption === "earlier"
                                ? format(selectedDate, "yyyy年M月d日") + " 消費明細"
                                : "全部消費明細"}
                </h2>
              </div>

              {/* 日期切換按鈕 - 簡約優雅設計 */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                <button
                  onClick={() => {
                    setSelectedDate(getTodayDate());
                    setSelectedDateOption("today");
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                    selectedDateOption === "today"
                      ? "bg-[#8A7C9F] text-white border border-[#8A7C9F]"
                      : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                  }`}
                >
                  <i className="fas fa-calendar-day text-[10px]"></i>
                  今天
                </button>
                <button
                  onClick={() => {
                    const yesterday = new Date(getTodayDate());
                    yesterday.setDate(yesterday.getDate() - 1);
                    setSelectedDate(yesterday);
                    setSelectedDateOption("yesterday");
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                    selectedDateOption === "yesterday"
                      ? "bg-[#8A7C9F] text-white border border-[#8A7C9F]"
                      : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                  }`}
                >
                  <i className="fas fa-calendar-minus text-[10px]"></i>
                  昨天
                </button>
                <button
                  onClick={() => {
                    // 獲取本週的起始日期
                    const today = new Date();
                    const currentDay = today.getDay() || 7; // 處理週日為0的情況
                    const firstDayOfWeek = new Date(today);
                    firstDayOfWeek.setDate(today.getDate() - (currentDay - 1));
                    firstDayOfWeek.setHours(0, 0, 0, 0);
                    setSelectedDate(firstDayOfWeek);
                    setSelectedDateOption("this_week");
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                    selectedDateOption === "this_week"
                      ? "bg-[#8A7C9F] text-white border border-[#8A7C9F]"
                      : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                  }`}
                >
                  <i className="fas fa-calendar-week text-[10px]"></i>
                  本週
                </button>
                <button
                  onClick={() => {
                    // 獲取上週的起始日期
                    const today = new Date();
                    const currentDay = today.getDay() || 7; // 處理週日為0的情況
                    const firstDayOfLastWeek = new Date(today);
                    firstDayOfLastWeek.setDate(today.getDate() - (currentDay - 1) - 7);
                    firstDayOfLastWeek.setHours(0, 0, 0, 0);
                    setSelectedDate(firstDayOfLastWeek);
                    setSelectedDateOption("last_week");
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                    selectedDateOption === "last_week"
                      ? "bg-[#8A7C9F] text-white border border-[#8A7C9F]"
                      : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                  }`}
                >
                  <i className="fas fa-calendar-alt text-[10px]"></i>
                  上週
                </button>
                <button
                  onClick={() => {
                    setSelectedDateOption("month");
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                    selectedDateOption === "month"
                      ? "bg-[#8A7C9F] text-white border border-[#8A7C9F]"
                      : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                  }`}
                >
                  <i className="fas fa-calendar text-[10px]"></i>
                  本月
                </button>
                <button
                  onClick={() => {
                    setShowDatePicker(true);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                    selectedDateOption === "earlier"
                      ? "bg-[#8A7C9F] text-white border border-[#8A7C9F]"
                      : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                  }`}
                >
                  <i className="fas fa-calendar-plus text-[10px]"></i>
                  選擇日期
                </button>
                <button
                  onClick={() => {
                    // 打開選擇月份對話框
                    setShowMonthPicker(true);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                    selectedDateOption === "month_select"
                      ? "bg-[#8A7C9F] text-white border border-[#8A7C9F]"
                      : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                  }`}
                >
                  <i className="fas fa-calendar-alt text-[10px]"></i>
                  選擇月份
                </button>
                <button
                  onClick={() => {
                    setSelectedDateOption("all");
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                    selectedDateOption === "all"
                      ? "bg-[#8A7C9F] text-white border border-[#8A7C9F]"
                      : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                  }`}
                >
                  <i className="fas fa-infinity text-[10px]"></i>
                  全部
                </button>
              </div>
            </div>

            <p className="text-gray-500 self-end">
              總計:{" "}
              {filteredTransactions.length > 0
                ? new Intl.NumberFormat("zh-TW", {
                    style: "currency",
                    currency: "TWD",
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }).format(
                    filteredTransactions.reduce(
                      (total, expense) => total + expense.amount,
                      0,
                    ),
                  )
                : "$0"}
            </p>

            {filteredTransactions.length > 0 ? (
              <>
              <div className="space-y-4">
                  {filteredTransactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between pb-3 border-b border-gray-100 last:border-0"
                    >
                    <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-lg flex items-center justify-center text-white"
                          style={{
                            backgroundColor: getCategoryColor(
                              typeof transaction.category === "string"
                                ? transaction.category
                                : transaction.category?.name || "其他",
                            ),
                          }}
                        >
                          <i
                            className={`fas ${typeof transaction.category === "string" ? getCategoryIcon(transaction.category) : transaction.category?.icon || "fa-question"} text-xl`}
                          ></i>
                      </div>
                      <div>
                          <p className="font-medium text-gray-800">
                            {typeof transaction.category === "string"
                              ? transaction.category
                              : transaction.category?.name || "未分類"}
                            {transaction.notes && (
                              <span className="ml-2 font-normal text-gray-500 text-sm">
                                {transaction.notes.length > 30
                                  ? `${transaction.notes.substring(0, 30)}...`
                                  : transaction.notes}
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-500">
                            {transaction.date.toLocaleDateString()}
                          </p>
</div>
</div>
                      <div className="flex items-center gap-3">
                        <p className="font-medium text-gray-700">
                          NT$ {transaction.amount}
                        </p>
                        <div className="flex gap-2">
                        <button 
                          onClick={() => editExpense(transaction)}
                            className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-white bg-[#E0D4F0] hover:bg-blue-500 rounded-full transition-all duration-200"
                            title="編輯消費明細"
                        >
                            <i className="fas fa-edit text-lg"></i>
                        </button>
                        <button 
                          onClick={(e) => {
                            e.preventDefault(); // 阻止默認行為
                            e.stopPropagation(); // 阻止事件冒泡
                              console.log(
                                "垃圾桶按鈕點擊，ID:",
                                transaction.id,
                              );
                            deleteExpense(transaction.id);
                          }}
                            className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-white bg-[#E0D4F0] hover:bg-red-500 rounded-full transition-all duration-200"
                            title="刪除消費明細"
                        >
                            <i className="fas fa-trash text-lg"></i>
                        </button>
                      </div>
                    </div>
</div>
))}
</div>
                <div className="mt-6 pt-4 border-t border-gray-200 flex justify-start">
                  <p className="text-lg font-bold text-gray-800">
                    總計:{" "}
                    {new Intl.NumberFormat("zh-TW", {
                      style: "currency",
                      currency: "TWD",
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(
                      filteredTransactions.reduce(
                        (total, expense) => total + expense.amount,
                        0,
                      ),
                    )}
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500 flex flex-col items-center justify-center h-[200px]">
                <i className="fas fa-receipt text-3xl mb-2 text-gray-300"></i>
                <p className="mb-3">
                  {selectedDateOption === "today"
                    ? "今天還沒有記錄任何消費"
                    : selectedDateOption === "yesterday"
                      ? "昨天沒有消費記錄"
                      : selectedDateOption === "month"
                        ? "本月沒有消費記錄"
                        : selectedDateOption === "month_select"
                          ? `${selectedMonth.split('-')[0]}年${String(selectedMonth.split('-')[1]).padStart(2, '0')}月沒有消費記錄`
                          : selectedDateOption === "this_week"
                            ? "本週沒有消費記錄"
                            : selectedDateOption === "last_week"
                              ? "上週沒有消費記錄"
                              : selectedDateOption === "all"
                                ? "沒有任何消費記錄"
                                : `${format(selectedDate, "yyyy年M月d日")} 沒有消費記錄`}
                </p>
                <button 
                  className="px-4 py-2 bg-[#E07A8D] hover:bg-[#F09CA7] text-white rounded-lg text-sm shadow-sm hover:shadow-md transition-all duration-300 ripple-effect floating"
                  onClick={() => setShowExpenseForm(true)}
                >
                  <i className="fas fa-plus-circle mr-2"></i>
                  新增消費明細
</button>
</div>
            )}
</div>
</div>
      ) : (
        <div className="pt-24 px-4 md:px-8 pb-8 max-w-5xl mx-auto text-center">
          <div className="bg-white bg-opacity-95 rounded-xl shadow-sm p-8 mb-6 max-w-md mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 font-heading">
              請先登入
            </h2>
            <p className="text-gray-600 mb-6">您需要登入才能使用記帳功能</p>
            <button 
              onClick={() => setShowLoginForm(true)}
              className="px-6 py-3 bg-pastel-pink-400 hover:bg-pastel-pink-300 text-white rounded-lg font-medium transition-colors"
            >
              登入 / 註冊
            </button>
</div>
</div>
      )}
      
      {/* 側邊欄 */}
      {showSidebar && currentUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-30 sidebar-backdrop">
          <div className="fixed top-0 left-0 w-64 h-full bg-gradient-to-b from-white to-elora-cream-light shadow-lg transform translate-x-0 transition-transform z-40 overflow-y-auto sidebar-3d-effect">
            {/* 側邊欄頂部 */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex flex-col">
                <h3 className="font-bold text-[#2E2E2E] mb-3">選單</h3>
                <div className="flex items-center gap-3">
                  <div 
                    className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 shadow-md"
                    style={{ 
                      background: userProfileColor || (!currentUser.photoURL ? '#A487C3' : undefined)
                    }}
                  >
                    {!userProfileColor && currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt="用戶頭像"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white font-medium text-xl">
                        {userNickname
                          ? userNickname.charAt(0).toUpperCase()
                          : currentUser.email
                            ? currentUser.email.charAt(0).toUpperCase()
                            : "?"}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#2E2E2E] truncate">
                      {userNickname ||
                        currentUser.email?.split("@")[0] ||
                        "用戶"}
                    </p>
                    <p className="text-xs text-[#6E6E6E] truncate">
                      {currentUser.email}
                    </p>
                    </div>
                </div>
              </div>
            </div>

            {/* 側邊欄選項 - 使用漸變色背景 */}
            <div className="p-4">
                <button 
                      onClick={() => {
                        setShowSidebar(false);
                  setShowProfileForm(true);
                }}
                className="flex items-center gap-3 w-full p-3 text-left text-white bg-[#C6B2DD] hover:bg-[#D8CAEB] rounded-lg mb-2 shadow-sm transition-all duration-300 sidebar-menu-item sidebar-menu-item-1 tilt-hover ripple-effect"
                style={{opacity: 1, transform: 'none'}}
              >
                <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center backdrop-blur-sm">
                  <i className="fas fa-user text-white"></i>
</div>
                <span>個人資料</span>
                    </button>

                    <button 
                      onClick={() => {
                        setShowSidebar(false);
                  setShowLeaderboardViewer(true);
                }}
                className="flex items-center gap-3 w-full p-3 text-left text-white bg-[#C6B2DD] hover:bg-[#D8CAEB] rounded-lg mb-2 relative shadow-sm transition-all duration-300 sidebar-menu-item sidebar-menu-item-2 tilt-hover ripple-effect"
                style={{opacity: 1, transform: 'none'}}
              >
                <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center backdrop-blur-sm">
                  <i className="fas fa-list-ol text-white"></i>
                </div>
                <span>排行榜</span>
                {leaderboardInviteCount > 0 && (
                  <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center transform -translate-y-1 translate-x-1 shadow-md z-20 notification-badge animate-pulse">
                    {leaderboardInviteCount}
                  </span>
                )}
                    </button>

                    <button 
                      onClick={() => {
                        setShowSidebar(false);
                  setShowFriendManagement(true);
                }}
                className="flex items-center gap-3 w-full p-3 text-left text-white bg-[#C6B2DD] hover:bg-[#D8CAEB] rounded-lg mb-2 relative shadow-sm transition-all duration-300 sidebar-menu-item sidebar-menu-item-3 tilt-hover ripple-effect"
                style={{opacity: 1, transform: 'none'}}
              >
                <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center backdrop-blur-sm">
                  <i className="fas fa-user-friends text-white"></i>
                </div>
                <span>好友管理</span>
                {friendRequestCount > 0 && (
                  <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center transform -translate-y-1 translate-x-1 shadow-md z-20 notification-badge animate-pulse">
                    {friendRequestCount}
                  </span>
                )}
                    </button>

{/* 添加借貸管理選項 */}
<button
                      onClick={() => {
                        setShowSidebar(false);
    setShowLoanManagement(true);
  }}
  className="flex items-center gap-3 w-full p-3 text-left text-white bg-[#C6B2DD] hover:bg-[#D8CAEB] rounded-lg mb-2 relative shadow-sm transition-all duration-300 sidebar-menu-item sidebar-menu-item-4 tilt-hover ripple-effect"
  style={{opacity: 1, transform: 'none'}}
>
  <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center backdrop-blur-sm">
    <i className="fas fa-hand-holding-usd text-white"></i>
  </div>
  <span>借貸管理</span>
  {overdueLoansCount > 0 && (
    <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center transform -translate-y-1 translate-x-1 shadow-md z-20 notification-badge animate-pulse">
      {overdueLoansCount}
    </span>
  )}
</button>

{/* 添加好友分帳選項 */}
<button
                      onClick={() => {
                        setShowSidebar(false);
    setShowSplitExpenseForm(true);
  }}
  className="flex items-center gap-3 w-full p-3 text-left text-white bg-[#C6B2DD] hover:bg-[#D8CAEB] rounded-lg mb-2 relative shadow-sm transition-all duration-300 sidebar-menu-item sidebar-menu-item-5 tilt-hover ripple-effect"
  style={{opacity: 1, transform: 'none'}}
>
  <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center backdrop-blur-sm">
    <i className="fas fa-receipt text-white"></i>
  </div>
  <span>好友分帳</span>
  {groupInviteCount > 0 && (
    <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center transform -translate-y-1 translate-x-1 shadow-md z-20 notification-badge animate-pulse">
      {groupInviteCount}
    </span>
  )}
</button>

{/* 添加預算設置選項 */}
                  <button 
                    onClick={() => {
                      setShowSidebar(false);
    setShowBudgetSetting(true);
  }}
  className="flex items-center gap-3 w-full p-3 text-left text-white bg-[#C6B2DD] hover:bg-[#D8CAEB] rounded-lg mb-2 relative shadow-sm transition-all duration-300 sidebar-menu-item sidebar-menu-item-6 tilt-hover ripple-effect"
  style={{opacity: 1, transform: 'none'}}
>
  <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center backdrop-blur-sm">
    <i className="fas fa-money-bill-wave text-white"></i>
  </div>
  <span>設置預算</span>
                  </button>
              </div>
              
            {/* 分隔線 */}
            <div className="border-t border-gray-200 my-2"></div>

            {/* 底部選項 - 登出按鈕 */}
            <div className="p-4">
                  <button 
                    onClick={() => {
                  logout();
                      setShowSidebar(false);
                }}
                className="flex items-center gap-3 w-full p-3 text-left text-white bg-[#FAC6CD] hover:bg-[#FFE2E5] rounded-lg mb-2 shadow-sm transition-all duration-300 sidebar-menu-item sidebar-menu-item-6 tilt-hover ripple-effect"
                style={{opacity: 1, transform: 'none'}} // 確保按鈕一定可見
              >
                <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center backdrop-blur-sm">
                  <i className="fas fa-sign-out-alt text-white"></i>
                </div>
                <span>登出</span>
                  </button>
              </div>
            </div>

          {/* 點擊空白處關閉側邊欄 */}
          <div 
            className="absolute inset-0"
            onClick={() => setShowSidebar(false)}
          ></div>
</div>
)}
      
      {/* 登入/註冊表單 */}
      {showLoginForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="relative bg-white rounded-xl shadow-lg max-w-md w-full" style={{animation: 'slideUpIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both'}}>
            <button
              onClick={() => setShowLoginForm(false)}
              className="absolute top-4 right-4 text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white"
            >
              <i className="fas fa-times"></i>
            </button>
            <div className="p-6" style={{animation: 'fadeIn 0.5s 0.2s both'}}>
              <LoginForm 
                onSuccess={handleLoginSuccess}
                initialMode={loginFormMode}
              />
</div>
</div>
</div>
      )}
      
      {/* 添加支出表單 */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div 
            className="relative bg-white rounded-xl shadow-lg max-w-md w-full"
            style={{animation: 'slideUpIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both'}}
          >
            <div className="p-6" style={{animation: 'fadeIn 0.5s 0.2s both', position: 'relative', zIndex: 10}}>
              <ExpenseForm 
                onSave={async (data) => {
                  try {
                    console.log("準備保存支出:", data);
                    
                    // 立即關閉表單，提高用戶體驗
                    setShowExpenseForm(false);
                    setEditingExpense(null);
                    setExpenseParams(null); // 清除初始參數
                    
                    // 直接執行保存操作
                    let success = false;
                    
                    if (editingExpense) {
                      success = await updateExpense(data);
                      if (success) {
                        setSuccessMessage("支出已更新！");
                        // 強制重新渲染
                        forceRerender();
                      }
                    } else {
                      success = await addExpense(data);
                      if (success) {
                        setSuccessMessage("記帳成功！");
                        // 強制重新渲染
                        forceRerender();
                      }
                    }
                    
                    if (success) {
                      // 顯示成功消息
                      setShowSuccessMessage(true);
                      console.log("顯示成功消息");
                      // 設置定時器自動隱藏成功消息
                      if (successMessageTimer.current) {
                        window.clearTimeout(successMessageTimer.current);
                      }
                      successMessageTimer.current = window.setTimeout(() => {
                        setShowSuccessMessage(false);
                        console.log("隱藏成功消息");
                      }, 1000);
                    }
                    
                    return success;
                  } catch (error) {
                    console.error("保存支出時出錯:", error);
                    return false;
                  }
                }} 
                onCancel={() => {
                  setShowExpenseForm(false);
                  setEditingExpense(null);
                  setExpenseParams(null); // 清除初始參數
                }}
                expense={
                  // 優先使用編輯中的支出數據，否則檢查是否有初始參數
                  editingExpense ? convertExpenseForForm(editingExpense) :
                  expenseParams ? {
                    id: '', // 新建支出的id為空
                    amount: parseFloat(expenseParams.amount),
                    category: expenseParams.category,
                    date: expenseParams.date || new Date().toISOString().slice(0, 10),
                    notes: expenseParams.notes,
                    attachments: []
                  } as any : null
                }
              />
</div>
</div>
</div>
)}

      {/* 個人資料表單 */}
      {showProfileForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="relative bg-white rounded-xl shadow-lg max-w-md w-full" style={{animation: 'slideUpIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both'}}>
            <ProfileForm onClose={() => setShowProfileForm(false)} />
          </div>
        </div>
      )}

      {/* 排行榜表單 */}
      {showLeaderboardForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <LeaderboardForm onClose={() => setShowLeaderboardForm(false)} />
          </div>
        </div>
      )}

      {/* 好友管理表單 */}
      {showFriendManagement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <FriendManagement onClose={() => setShowFriendManagement(false)} />
          </div>
        </div>
      )}

      {/* 日期選擇對話框 - 完全重寫為自定義界面 */}
      {showDatePicker && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-lg p-4 w-[90%] max-w-sm animate-slideUpIn shadow-xl border border-[#E8E4ED] transform">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
              <h3 className="text-base font-medium text-gray-700 flex items-center">
                <i className="fas fa-calendar-day mr-2 text-[#8A7C9F]"></i>
                選擇日期
              </h3>
              <button
                onClick={() => setShowDatePicker(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center bg-[#F2EDF7] text-[#8A7C9F] hover:bg-[#8A7C9F] hover:text-white transition-all duration-200"
                aria-label="關閉"
              >
                <i className="fas fa-times text-xs"></i>
              </button>
            </div>
            
            {/* 自定義日期選擇界面 */}
            <div className="bg-[#F9F7FB] p-3 rounded-md mb-4">
              <div className="grid grid-cols-3 gap-2">
                {/* 年份選擇 */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">年</label>
                  <select 
                    className="w-full p-2 border border-[#E8E4ED] rounded-md focus:outline-none focus:ring-1 focus:ring-[#8A7C9F] focus:border-[#8A7C9F] bg-white text-sm"
                    value={selectedDate.getFullYear()}
                    onChange={(e) => {
                      const newYear = parseInt(e.target.value);
                      const newDate = new Date(selectedDate);
                      newDate.setFullYear(newYear);
                      setSelectedDate(newDate);
                    }}
                  >
                    {Array.from({ length: 10 }, (_, i) => (
                      <option key={i} value={new Date().getFullYear() - 5 + i}>
                        {new Date().getFullYear() - 5 + i}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* 月份選擇 */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">月</label>
                  <select 
                    className="w-full p-2 border border-[#E8E4ED] rounded-md focus:outline-none focus:ring-1 focus:ring-[#8A7C9F] focus:border-[#8A7C9F] bg-white text-sm"
                    value={selectedDate.getMonth() + 1}
                    onChange={(e) => {
                      const newMonth = parseInt(e.target.value) - 1;
                      const newDate = new Date(selectedDate);
                      newDate.setMonth(newMonth);
                      
                      // 處理月份天數問題
                      const currentDay = selectedDate.getDate();
                      const lastDayOfMonth = new Date(newDate.getFullYear(), newMonth + 1, 0).getDate();
                      if (currentDay > lastDayOfMonth) {
                        newDate.setDate(lastDayOfMonth);
                      }
                      
                      setSelectedDate(newDate);
                    }}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* 日期選擇 */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">日</label>
                  <select 
                    className="w-full p-2 border border-[#E8E4ED] rounded-md focus:outline-none focus:ring-1 focus:ring-[#8A7C9F] focus:border-[#8A7C9F] bg-white text-sm"
                    value={selectedDate.getDate()}
                    onChange={(e) => {
                      const newDay = parseInt(e.target.value);
                      const newDate = new Date(selectedDate);
                      newDate.setDate(newDay);
                      setSelectedDate(newDate);
                    }}
                  >
                    {Array.from(
                      { length: new Date(
                        selectedDate.getFullYear(), 
                        selectedDate.getMonth() + 1, 
                        0
                      ).getDate() }, 
                      (_, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
              
              {/* 顯示選擇的日期 */}
              <div className="mt-3 text-center bg-white p-2 rounded-md shadow-sm border border-[#E8E4ED]">
                <p className="text-gray-700 font-medium">
                  {selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日
                </p>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={() => setShowDatePicker(false)}
                className="flex-1 py-2 px-4 bg-[#F2EDF7] text-[#8A7C9F] border border-[#E8E4ED] rounded-md hover:bg-[#E8E4ED] transition-colors text-sm flex items-center justify-center gap-1"
              >
                <i className="fas fa-times-circle text-xs"></i>
                取消
              </button>
              <button
                onClick={() => {
                  setSelectedDateOption("earlier");
                  setShowDatePicker(false);
                }}
                className="flex-1 py-2 px-4 bg-[#8A7C9F] text-white rounded-md hover:bg-[#79708C] transition-colors text-sm flex items-center justify-center gap-1 shadow-sm"
              >
                <i className="fas fa-check-circle text-xs"></i>
                確認
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 月份選擇對話框 - 同樣重寫為自定義界面 */}
      {showMonthPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-lg p-4 w-[90%] max-w-sm animate-slideUpIn shadow-xl border border-[#E8E4ED]">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
              <h3 className="text-base font-medium text-gray-700 flex items-center">
                <i className="fas fa-calendar-alt mr-2 text-[#8A7C9F]"></i>
                選擇月份
              </h3>
              <button
                onClick={() => setShowMonthPicker(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center bg-[#F2EDF7] text-[#8A7C9F] hover:bg-[#8A7C9F] hover:text-white transition-all duration-200"
                aria-label="關閉"
              >
                <i className="fas fa-times text-xs"></i>
              </button>
            </div>
            
            {/* 自定義月份選擇界面 */}
            <div className="bg-[#F9F7FB] p-3 rounded-md mb-4">
              <div className="grid grid-cols-2 gap-2">
                {/* 年份選擇 */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">年</label>
                  <select 
                    className="w-full p-2 border border-[#E8E4ED] rounded-md focus:outline-none focus:ring-1 focus:ring-[#8A7C9F] focus:border-[#8A7C9F] bg-white text-sm"
                    value={selectedDate.getFullYear()}
                    onChange={(e) => {
                      const newYear = parseInt(e.target.value);
                      const newDate = new Date(selectedDate);
                      newDate.setFullYear(newYear);
                      setSelectedDate(newDate);
                      
                      // 更新selectedMonth
                      const month = newDate.getMonth() + 1;
                      setSelectedMonth(`${newYear}-${month}`);
                    }}
                  >
                    {Array.from({ length: 10 }, (_, i) => (
                      <option key={i} value={new Date().getFullYear() - 5 + i}>
                        {new Date().getFullYear() - 5 + i}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* 月份選擇 */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">月</label>
                  <select 
                    className="w-full p-2 border border-[#E8E4ED] rounded-md focus:outline-none focus:ring-1 focus:ring-[#8A7C9F] focus:border-[#8A7C9F] bg-white text-sm"
                    value={selectedDate.getMonth() + 1}
                    onChange={(e) => {
                      const newMonth = parseInt(e.target.value) - 1;
                      const newDate = new Date(selectedDate);
                      newDate.setMonth(newMonth);
                      newDate.setDate(1); // 設為月初
                      setSelectedDate(newDate);
                      
                      // 更新selectedMonth
                      const year = newDate.getFullYear();
                      const month = newMonth + 1;
                      setSelectedMonth(`${year}-${month}`);
                    }}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}月
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* 月份按鈕快速選擇 */}
              <div className="mt-3 grid grid-cols-4 gap-2">
                {Array.from({ length: 12 }, (_, i) => (
                  <button
                    key={i}
                    className={`p-2 text-sm rounded-md transition-colors ${
                      selectedDate.getMonth() === i 
                        ? "bg-[#8A7C9F] text-white" 
                        : "bg-white text-gray-700 hover:bg-[#F2EDF7]"
                    } border border-[#E8E4ED]`}
                    onClick={() => {
                      const newDate = new Date(selectedDate);
                      newDate.setMonth(i);
                      newDate.setDate(1); // 設為月初
                      setSelectedDate(newDate);
                      
                      // 更新selectedMonth
                      const year = newDate.getFullYear();
                      const month = i + 1;
                      setSelectedMonth(`${year}-${month}`);
                    }}
                  >
                    {i + 1}月
                  </button>
                ))}
              </div>
              
              {/* 顯示選擇的月份 */}
              <div className="mt-3 text-center bg-white p-2 rounded-md shadow-sm border border-[#E8E4ED]">
                <p className="text-gray-700 font-medium">
                  {selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月
                </p>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={() => setShowMonthPicker(false)}
                className="flex-1 py-2 px-4 bg-[#F2EDF7] text-[#8A7C9F] border border-[#E8E4ED] rounded-md hover:bg-[#E8E4ED] transition-colors text-sm flex items-center justify-center gap-1"
              >
                <i className="fas fa-times-circle text-xs"></i>
                取消
              </button>
              <button
                onClick={() => {
                  setSelectedDateOption("month_select");
                  setShowMonthPicker(false);
                }}
                className="flex-1 py-2 px-4 bg-[#8A7C9F] text-white rounded-md hover:bg-[#79708C] transition-colors text-sm flex items-center justify-center gap-1 shadow-sm"
              >
                <i className="fas fa-check-circle text-xs"></i>
                確認
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 通知彈出窗口 */}
      {showNotifications && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-16 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto animate-slideUpIn transform">
            <div className="p-5 border-b border-gray-200 relative">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                  <i className="fas fa-bell text-[#A487C3] mr-3 animate-gentle-pulse"></i>
                  通知中心
                </h2>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-white hover:text-white bg-gradient-to-r from-[#A487C3] to-[#C6B2DD] hover:from-[#8A5DC8] hover:to-[#A487C3] w-8 h-8 flex items-center justify-center rounded-full shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-300 focus:outline-none"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
              
              {notificationCount > 0 && (
                <div className="absolute right-16 top-5">
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md animate-pulse">
                    {notificationCount}
                  </span>
                </div>
              )}
            </div>

            <div className="p-5">
              {notificationCount > 0 ? (
                <div className="space-y-4">
                  {/* 好友請求通知 */}
                  {friendRequestCount > 0 && (
                    <div
                      className="w-full p-3 rounded-lg bg-blue-50 cursor-pointer hover:bg-blue-100 transition"
                      onClick={() => {
                        setShowNotifications(false);
                        setShowFriendManagement(true);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-500">
                          <i className="fas fa-user-friends"></i>
                        </div>
                        <div className="text-left">
                          <span className="font-medium text-gray-800 block">
                            好友請求通知
                          </span>
                          <span className="text-xs text-gray-500">
                            您有 {friendRequestCount} 個待處理的好友請求
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 排行榜邀請通知 */}
                  {leaderboardInviteCount > 0 && (
                    <div
                      className="w-full p-3 rounded-lg bg-pink-50 cursor-pointer hover:bg-pink-100 transition"
                      onClick={() => {
                        setShowNotifications(false);
                        setShowLeaderboardInvites(true);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center text-pink-500">
                          <i className="fas fa-trophy"></i>
                        </div>
                        <div className="text-left">
                          <span className="font-medium text-gray-800 block">
                            排行榜邀請通知
                          </span>
                          <span className="text-xs text-gray-500">
                            您有 {leaderboardInviteCount} 個排行榜邀請待處理
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 排行榜結束通知 */}
                  {leaderboardEndedNotifications.length > 0 && (
                    <div
                      className="w-full p-3 rounded-lg bg-purple-50 cursor-pointer hover:bg-purple-100 transition"
                      onClick={() => {
                        // 關閉通知中心
                        setShowNotifications(false);

                        // 標記通知為已讀
                        leaderboardEndedNotifications.forEach(
                          async (notification) => {
                            try {
                              const notificationRef = doc(
                                db,
                                "notifications",
                                notification.id,
                              );
                              await updateDoc(notificationRef, { read: true });
                            } catch (error) {
                              console.error("標記通知已讀失敗:", error);
                            }
                          },
                        );

                        // 清空通知
                        setLeaderboardEndedNotifications([]);

                        // 打開排行榜查看頁面
                        setShowLeaderboardViewer(true);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-500">
                          <i className="fas fa-chart-line"></i>
                        </div>
                        <div className="text-left">
                          <span className="font-medium text-gray-800 block">
                            排行榜結果通知
                          </span>
                          <span className="text-xs text-gray-500">
                            您有 {leaderboardEndedNotifications.length}{" "}
                            個排行榜已結束，點擊查看結果
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* 借貸即將到期通知 */}
                  {loanDueNotifications.length > 0 && (
                    <div
                      className="w-full p-3 rounded-lg bg-amber-50 cursor-pointer hover:bg-amber-100 transition relative group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-500">
                          <i className="fas fa-calendar-alt"></i>
                        </div>
                        <div className="text-left flex-1">
                          <span className="font-medium text-gray-800 block">
                            借貸即將到期通知
                          </span>
                          <span className="text-xs text-gray-500 block">
                            您有 {loanDueNotifications.length} 筆借貸即將到期
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setShowNotifications(false);
                            setShowLoanManagement(true);
                          }}
                          className="bg-amber-400 hover:bg-amber-500 text-white text-xs font-medium py-1 px-2 rounded transition-all"
                        >
                          查看
                        </button>
                      </div>
                      <div className="mt-2 space-y-2 pl-12">
                        {loanDueNotifications.map((notification) => (
                          <div key={notification.id} className="border-t border-amber-200 pt-2 flex justify-between items-center">
                            <div>
                              <div className="text-sm font-medium text-gray-700">
                                {notification.loanType === 'lend' ? '借出給' : '借入自'} {notification.counterpartyName}
                              </div>
                              <div className="text-xs text-gray-500">
                                金額: {formatAmount(notification.amount)} | 
                                到期日: {new Date(notification.dueDate.seconds * 1000).toLocaleDateString()}
                              </div>
                            </div>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const notificationRef = doc(
                                    db,
                                    "notifications",
                                    notification.id,
                                  );
                                  await updateDoc(notificationRef, { read: true });
                                  
                                  // 更新通知狀態
                                  setLoanDueNotifications(prev => 
                                    prev.filter(item => item.id !== notification.id)
                                  );
                                } catch (error) {
                                  console.error("標記通知已讀失敗:", error);
                                }
                              }}
                              className="text-xs bg-white hover:bg-gray-200 text-gray-500 border border-amber-200 py-1 px-2 rounded-full transition-colors"
                            >
                              <i className="fas fa-check mr-1"></i>
                              已讀
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 借貸已逾期通知 */}
                  {loanOverdueNotifications.length > 0 && (
                    <div
                      className="w-full p-3 rounded-lg bg-red-50 cursor-pointer hover:bg-red-100 transition relative group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-500">
                          <i className="fas fa-exclamation-circle"></i>
                        </div>
                        <div className="text-left flex-1">
                          <span className="font-medium text-gray-800 block">
                            借貸已逾期通知
                          </span>
                          <span className="text-xs text-gray-500 block">
                            您有 {loanOverdueNotifications.length} 筆借貸已逾期
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setShowNotifications(false);
                            setShowLoanManagement(true);
                          }}
                          className="bg-red-500 hover:bg-red-600 text-white text-xs font-medium py-1 px-2 rounded transition-all"
                        >
                          處理
                        </button>
                      </div>
                      <div className="mt-2 space-y-2 pl-12">
                        {loanOverdueNotifications.map((notification) => (
                          <div key={notification.id} className="border-t border-red-200 pt-2 flex justify-between items-center">
                            <div>
                              <div className="text-sm font-medium text-gray-700">
                                {notification.loanType === 'lend' ? '借出給' : '借入自'} {notification.counterpartyName}
                              </div>
                              <div className="text-xs text-gray-500">
                                金額: {formatAmount(notification.amount)} | 
                                到期日: {new Date(notification.dueDate.seconds * 1000).toLocaleDateString()}
                              </div>
                            </div>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const notificationRef = doc(
                                    db,
                                    "notifications",
                                    notification.id,
                                  );
                                  await updateDoc(notificationRef, { read: true });
                                  
                                  // 更新通知狀態
                                  setLoanOverdueNotifications(prev => 
                                    prev.filter(item => item.id !== notification.id)
                                  );
                                } catch (error) {
                                  console.error("標記通知已讀失敗:", error);
                                }
                              }}
                              className="text-xs bg-white hover:bg-gray-200 text-gray-500 border border-red-200 py-1 px-2 rounded-full transition-colors"
                            >
                              <i className="fas fa-check mr-1"></i>
                              已讀
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 分帳群組邀請通知 */}
                  {groupInviteCount > 0 && (
                    <div
                      className="w-full p-3 rounded-lg bg-cyan-50 cursor-pointer hover:bg-cyan-100 transition"
                      onClick={() => {
                        setShowNotifications(false);
                        setShowGroupInvites(true);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center text-cyan-500">
                          <i className="fas fa-users"></i>
                        </div>
                        <div className="text-left">
                          <span className="font-medium text-gray-800 block">
                            分帳群組邀請通知
                          </span>
                          <span className="text-xs text-gray-500">
                            您有 {groupInviteCount} 個分帳群組邀請待處理
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <i className="fas fa-bell-slash text-gray-300 text-4xl mb-4 transform rotate-12"></i>
                  <p className="text-gray-500 font-medium">目前沒有任何通知</p>
                  <p className="text-gray-400 text-sm mt-2">當有新的消息時，將會在這裡顯示</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 排行榜邀請列表 */}
      {showLeaderboardInvites && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <LeaderboardInviteList
              onClose={() => setShowLeaderboardInvites(false)}
            />
          </div>
        </div>
      )}

      {/* 好友管理頁面 */}
      {showFriendManagement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <FriendManagement onClose={() => setShowFriendManagement(false)} />
          </div>
        </div>
      )}

      {/* 排行榜查看組件 */}
      {showLeaderboardViewer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <LeaderboardViewer
              onClose={() => setShowLeaderboardViewer(false)}
            />
          </div>
        </div>
      )}

      {/* 排行榜通知處理組件 */}
      <LeaderboardNotification />

      {/* 預算和借貸通知處理組件 */}
      <BudgetNotification />
      
      {/* 分帳群組邀請通知组件 */}
      <GroupInviteNotification />

      {/* 借貸管理表單 */}
      {showLoanManagement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <LoanManagement 
              onClose={() => {
                setShowLoanManagement(false);
                setLoanParams(null); // 關閉時清除參數
              }} 
              initialParams={loanParams}
            />
          </div>
        </div>
      )}

      {/* 預算設置表單 */}
      {showBudgetSetting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <BudgetSetting onClose={() => setShowBudgetSetting(false)} />
          </div>
        </div>
      )}

      {/* 好友分帳表單 */}
      {showSplitExpenseForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <SplitExpenseManagement 
              onClose={() => setShowSplitExpenseForm(false)} 
              groupInviteCount={groupInviteCount}
            />
          </div>
        </div>
      )}

      {/* 固定在右下角的懸浮新增支出按鈕 */}
      {currentUser && 
        !showSidebar && 
        !showExpenseForm && 
        !showLoginForm && 
        !showProfileForm && 
        !showLeaderboardForm && 
        !showFriendManagement && 
        !showLeaderboardViewer && 
        !showLoanManagement && 
        !showBudgetSetting && 
        !showSplitExpenseForm && 
        !showDatePicker && 
        !showMonthPicker && 
        !showNotifications && (
        <div className="fixed bottom-8 right-8 z-[1000] flex flex-col gap-4 items-center">
          {/* 添加历史明细按钮和提示 */}
          <div className="group relative">
            <button
              onClick={() => {
                const element = document.getElementById('expense-details');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' });
                  // 添加一个高亮效果
                  element.classList.add('highlight-section');
                  setTimeout(() => {
                    element.classList.remove('highlight-section');
                  }, 2000);
                }
              }}
              className="w-14 h-14 sm:w-12 sm:h-12 bg-gradient-to-r from-[#6BBFA0] to-[#8FD3B9] rounded-full shadow-xl hover:shadow-2xl flex items-center justify-center text-white transform hover:scale-110 active:scale-95 transition-all duration-300 relative overflow-hidden focus:outline-none focus:ring-4 focus:ring-green-300 focus:ring-opacity-50"
              aria-label="歷史消費明細"
            >
              <i className="fas fa-list-ul text-2xl sm:text-xl relative z-10"></i>
              {/* 波紋效果元素 */}
              <div className="absolute inset-0 bg-white opacity-0 hover:opacity-20 transition-opacity duration-300 rounded-full"></div>
            </button>
            {/* 歷史明細按鈕的懸停提示 */}
            <div className="absolute -top-12 right-0 bg-[#333333] text-white text-xs px-3 py-1.5 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 whitespace-nowrap shadow-md transform group-hover:-translate-y-1">
              <div className="flex items-center gap-1">
                <i className="fas fa-list-ul text-xs"></i>
                <span>歷史消費明細</span>
              </div>
              {/* 小三角形 */}
              <div className="absolute w-3 h-3 bg-[#333333] transform rotate-45 right-4 bottom-[-6px]"></div>
            </div>
          </div>
          
          {/* 收入管理按鈕和提示 - 移除此區塊 */}
          
          {/* 新增支出按鈕和提示 */}
          <div className="group relative">
            <button
              onClick={() => setShowExpenseForm(true)}
              className="w-16 h-16 sm:w-14 sm:h-14 bg-gradient-to-r from-[#E07A8D] to-[#F09CA7] rounded-full shadow-xl hover:shadow-2xl flex items-center justify-center text-white transform hover:scale-110 active:scale-95 transition-all duration-300 relative overflow-hidden focus:outline-none focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50"
              aria-label="新增支出"
            >
              <i className="fas fa-plus text-2xl sm:text-xl relative z-10"></i>
              {/* 波紋效果元素 */}
              <div className="absolute inset-0 bg-white opacity-0 hover:opacity-20 transition-opacity duration-300 rounded-full"></div>
              {/* 脈衝效果 - 使用兩層不同速度的脈衝 */}
              <div className="absolute inset-0 rounded-full animate-ping opacity-30 bg-gradient-to-r from-[#E07A8D] to-[#F09CA7] duration-1000"></div>
              <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-gradient-to-r from-[#E07A8D] to-[#F09CA7] duration-1500 delay-500"></div>
            </button>
            {/* 新增支出按鈕的懸停提示 */}
            <div className="absolute -top-12 right-0 bg-[#333333] text-white text-xs px-3 py-1.5 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 whitespace-nowrap shadow-md transform group-hover:-translate-y-1">
              <div className="flex items-center gap-1">
                <i className="fas fa-receipt text-xs"></i>
                <span>新增支出</span>
              </div>
              {/* 小三角形 */}
              <div className="absolute w-3 h-3 bg-[#333333] transform rotate-45 right-4 bottom-[-6px]"></div>
            </div>
          </div>
        </div>
      )}

      {/* 分帳群組邀請列表 */}
      {showGroupInvites && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <GroupInviteList
              onClose={() => setShowGroupInvites(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
