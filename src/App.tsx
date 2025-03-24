// The exported code uses Tailwind CSS. Install Tailwind CSS in your dev environment to ensure all styles work.
import React, { useState, useEffect, useRef } from "react";
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
} from "firebase/firestore";
import { db } from "./firebase";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import LeaderboardForm from "./components/LeaderboardForm";
import FriendManagement from "./components/FriendManagement";
import { format } from "date-fns";
import LeaderboardInviteList from "./components/LeaderboardInviteList";
import { auth } from "./firebase";
import LeaderboardViewer from "./components/LeaderboardViewer";
import LeaderboardNotification from "./components/LeaderboardNotification";

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
  const [showLeaderboardViewer, setShowLeaderboardViewer] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [leaderboardEndedNotifications, setLeaderboardEndedNotifications] =
    useState<any[]>([]);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null); // 正在編輯的支出
  const [successMessage, setSuccessMessage] = useState("記帳成功！"); // 自定義成功訊息
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null); // 選中的支出類別
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
    "today" | "yesterday" | "earlier" | "all"
  >("today");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTab, setSelectedTab] = useState("home");
  const [showMobileForm, setShowMobileForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [leaderboardInviteCount, setLeaderboardInviteCount] = useState(0);
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
        series: [
          {
            name: "支出金額",
            type: "pie",
            radius: ["40%", "70%"],
            center: ["50%", "45%"], // 向上移動一點，留更多空間給圖例
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

    // 檢查是否有數據
    if (!expenses || expenses.length === 0) {
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
      console.log("開始初始化圓餅圖，數據筆數:", expenses.length);
      const chart = echarts.init(chartRef.current);

      // 計算分類支出
      const categorySum: Record<string, number> = {};
      let totalAmount = 0;

      expenses.forEach((expense) => {
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
        series: [
          {
            name: "支出金額",
            type: "pie",
            radius: ["40%", "70%"],
            // 調整位置，讓圓餅圖更靠右一些
            center: [
              isSelectedMode ? (isMobile ? "48%" : "45%") : "50%",
              "50%",
            ],
            avoidLabelOverlap: false,
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: "rgba(0, 0, 0, 0.2)",
              },
            },
            label: {
              show: true,
              formatter: "{b}\n{d}%",
            },
            labelLine: {
              show: true,
            },
            data: pieData,
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
    const categoryIcons: Record<string, string> = {
      餐飲: "fa-utensils",
      交通: "fa-car",
      娛樂: "fa-film",
      購物: "fa-shopping-bag",
      教育: "fa-book",
      醫療: "fa-heartbeat",
      投資: "fa-chart-line",
      水電: "fa-bolt",
      其他: "fa-ellipsis-h",
    };

    return categoryIcons[category] || "fa-ellipsis-h";
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
        setError("無法恢復數據，請嘗試手動刷新頁面");
        setTimeout(() => setError(null), 3000);
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

      // 異步保存到Firebase
      try {
        const docRef = await addDoc(collection(db, "expenses"), {
          ...expense,
          attachmentUrls,
          userId: currentUser.uid,
          createdAt: new Date(),
        });

        console.log("記錄已保存到Firebase，ID:", docRef.id);

        // 更新真實ID
        setExpenses((prevExpenses) =>
          prevExpenses.map((exp) =>
            exp.id === tempId ? { ...exp, id: docRef.id } : exp,
          ),
        );
      } catch (error) {
        console.error("保存到Firebase失敗，但UI已更新:", error);
        // Firebase保存失敗不提示用戶，因為UI體驗已完成
      }

      return true;
    } catch (error) {
      console.error("添加支出失敗:", error);
      setError("添加支出失敗，請稍後再試");
      setTimeout(() => setError(null), 3000);
      return false;
    }
  };

  // 獲取類別對應的顏色
  const getCategoryColor = (category: string): string => {
    const categoryColors: Record<string, string> = {
      餐飲: "#F4606C", // 修改為紅色系
      交通: "#B8E3C9", // 薄荷綠 (elora-mint)
      娛樂: "#FAC6CD", // 粉紅色 (elora-pink)
      購物: "#C6B2DD", // 淺紫色 (elora-purple-light)
      教育: "#E6CEAC", // 修改為淺棕色
      醫療: "#FFE2E5", // 淺粉紅色 (elora-pink-light)
      投資: "#90F1EF", // 修改為青藍色
      水電: "#FAE278", // 淺黃色
      其他: "#A487C3", // 紫色 (elora-purple)
    };

    return categoryColors[category] || "#A487C3";
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
        date: updatedData.date,
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
                "50%",
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
              "50%",
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
        console.log("刷新函數未定義，嘗試手動刷新頁面");
        window.location.reload();
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

          // 更新通知計數 (好友請求 + 排行榜邀請 + 排行榜結束通知)
          setNotificationCount(
            friendRequests.length +
              leaderboardInvites.length +
              endedNotifications.length,
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

  // 根據選定類別過濾支出
  const getCategoryExpenses = () => {
    if (!selectedCategory) return [];

    return expenses.filter((expense) => {
      const categoryName =
        typeof expense.category === "string"
          ? expense.category
          : expense.category?.name || "未分類";

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
  
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-elora-cream-light to-white text-gray-800"
      key={renderKey}
    >
{/* 頂部導航 */}
      <nav className="fixed top-0 left-0 right-0 bg-white bg-opacity-95 backdrop-blur-md shadow-sm z-20">
        <div className="flex justify-between items-center px-4 py-3 max-w-5xl mx-auto">
          {/* Left-side navigation items with toggle sidebar button */}
          <div className="flex items-center gap-3">
            {currentUser && (
          <button 
                className="p-2 text-[#A487C3] hover:text-[#8A5DC8] bg-white hover:bg-[#F8F3FF] rounded-lg transition-all duration-300 shadow-sm hover:shadow-md border border-[#F5F5F5]"
                onClick={() => setShowSidebar(!showSidebar)}
          >
            <i className="fas fa-bars"></i>
          </button>
            )}
            <div className="flex items-center">
              <span className="text-lg font-bold text-[#A487C3]">
                記帳狼人殺
              </span>
            </div>
        </div>
        
          {/* Right-side navigation items */}
          {currentUser ? (
            <div className="flex items-center gap-3">
              {/* 通知圖標 */}
              <button 
                className="relative p-2 text-[#A487C3] hover:text-[#8A5DC8] bg-white hover:bg-[#F8F3FF] rounded-lg transition-all duration-300 shadow-sm hover:shadow-md border border-[#F5F5F5] focus:outline-none focus:ring-2 focus:ring-white"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <i className="fas fa-bell"></i>
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#FAC6CD] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {notificationCount}
                  </span>
                )}
              </button>

              {/* 用戶頭像 */}
              <div
                className="flex items-center cursor-pointer hover:bg-[#F8F3FF] rounded-lg p-1 transition-all duration-300"
                onClick={() => setShowProfileForm(!showProfileForm)}
              >
                <div className="w-8 h-8 rounded-full bg-[#A487C3] shadow-md overflow-hidden flex items-center justify-center">
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt="用戶頭像"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white font-medium">
                      {userNickname
                        ? userNickname.charAt(0).toUpperCase()
                        : currentUser.email
                          ? currentUser.email.charAt(0).toUpperCase()
                          : "?"}
                    </span>
                  )}
                </div>
              </div>

              {/* 登出按鈕 */}
              <button 
                onClick={() => logout()}
                className="p-2 text-[#FAC6CD] hover:text-[#E57B9E] bg-white hover:bg-[#FFF6F8] rounded-lg transition-all duration-300 shadow-sm hover:shadow-md border border-[#F5F5F5]"
              >
                <i className="fas fa-sign-out-alt"></i>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
            <button 
                onClick={handleLogin}
                className="py-2 px-4 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-lg transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:bg-white focus:text-[#A487C3] focus:border focus:border-[#A487C3]"
            >
                登入
            </button>
              <button
                onClick={handleRegister}
                className="py-2 px-4 bg-white hover:bg-[#F8F3FF] text-[#A487C3] hover:text-[#8A5DC8] border border-[#A487C3] rounded-lg transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:bg-white"
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
          
          {/* 快速記帳按鈕 */}
          <div className="mb-8 relative flex gap-2">
            <button 
              className="px-5 py-3 bg-elora-pink hover:bg-elora-pink-light text-white rounded-xl shadow-sm hover:shadow-md flex items-center gap-2 font-medium transition-all duration-300"
              onClick={() => setShowExpenseForm(true)}
            >
              <i className="fas fa-plus"></i>
              <span>新增消費明細</span>
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
          
          {/* 支出分析卡片 */}
          <div className="relative bg-white bg-opacity-95 backdrop-blur-sm rounded-xl shadow-md border-l-4 border-elora-purple p-5 mb-6 hover:shadow-lg transition-all duration-300">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-elora-purple">支出分析</h2>
              {selectedCategory && (
                <button
                  onClick={resetCategorySelection}
                  className="text-sm text-white bg-elora-purple hover:bg-elora-purple-light px-4 py-1.5 rounded-lg flex items-center transition-all duration-300 shadow-sm hover:shadow-md"
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
                      height: "300px",
                      width: "100%",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                    key={`pie-chart-${selectedCategory ? "selected" : "overview"}-${chartsKey}`}
                  />
            ) : (
              <div className="text-center py-8 text-gray-500 h-[300px] flex flex-col items-center justify-center">
                    <i className="fas fa-chart-pie text-3xl mb-2 text-elora-purple opacity-40"></i>
                    <p className="mb-3">沒有任何消費明細</p>
                <button 
                      className="px-4 py-2 bg-elora-pink hover:bg-elora-pink-light text-white rounded-lg text-sm shadow-sm hover:shadow-md transition-all duration-300"
                  onClick={() => setShowExpenseForm(true)}
                >
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
                        {categoryExpenses.map((expense) => (
                          <div
                            key={expense.id}
                            className="bg-white p-3 rounded-lg shadow-sm border-l-2 border-elora-purple hover:shadow-md transition-all duration-300"
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
                  className="px-4 py-2 bg-elora-pink hover:bg-elora-pink-light text-white rounded-lg text-sm shadow-sm hover:shadow-md transition-all duration-300"
                  onClick={() => setShowExpenseForm(true)}
                >
                  新增消費明細
                </button>
</div>
)}
          </div>
          
          {/* 今日支出 - 放在每日消費趨勢下方 */}
          <div className="bg-white bg-opacity-95 rounded-xl shadow-md border-l-4 border-elora-pink p-5 mb-6">
            <div className="flex flex-col mb-4">
              <div className="mb-3">
                <h2 className="text-xl font-bold text-elora-pink">
                  {selectedDateOption === "today"
                    ? "今日消費明細"
                    : selectedDateOption === "yesterday"
                      ? "昨日消費明細"
                      : selectedDateOption === "earlier"
                        ? format(selectedDate, "yyyy年M月d日") + " 消費明細"
                        : "全部消費明細"}
                </h2>
              </div>

              {/* 日期切換按鈕 */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => {
                    setSelectedDate(getTodayDate());
                    setSelectedDateOption("today");
                  }}
                  className={`px-3 py-1 text-sm rounded-lg ${
                    selectedDateOption === "today"
                      ? "bg-elora-pink text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  今天
                </button>
                <button
                  onClick={() => {
                    const yesterday = new Date(getTodayDate());
                    yesterday.setDate(yesterday.getDate() - 1);
                    setSelectedDate(yesterday);
                    setSelectedDateOption("yesterday");
                  }}
                  className={`px-3 py-1 text-sm rounded-lg ${
                    selectedDateOption === "yesterday"
                      ? "bg-elora-pink text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  昨天
                </button>
                <button
                  onClick={() => {
                    setShowDatePicker(true);
                  }}
                  className={`px-3 py-1 text-sm rounded-lg ${
                    selectedDateOption === "earlier"
                      ? "bg-elora-pink text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  選擇日期
                </button>
                <button
                  onClick={() => {
                    setSelectedDateOption("all");
                  }}
                  className={`px-3 py-1 text-sm rounded-lg ${
                    selectedDateOption === "all"
                      ? "bg-elora-pink text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  全部
                </button>
              </div>
            </div>

            <p className="text-gray-500">
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
                <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end">
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
                      : `${format(selectedDate, "yyyy年M月d日")} 沒有消費記錄`}
                </p>
                <button 
                  className="px-4 py-2 bg-elora-pink hover:bg-elora-pink-light text-white rounded-lg text-sm shadow-sm hover:shadow-md transition-all duration-300"
                  onClick={() => setShowExpenseForm(true)}
                >
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-30">
          <div className="fixed top-0 left-0 w-64 h-full bg-gradient-to-b from-white to-elora-cream-light shadow-lg transform translate-x-0 transition-transform z-40 overflow-y-auto">
            {/* 側邊欄頂部 */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex flex-col">
                <h3 className="font-bold text-[#2E2E2E] mb-3">選單</h3>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-elora-purple to-elora-pink overflow-hidden flex items-center justify-center flex-shrink-0 shadow-md">
                    {currentUser.photoURL ? (
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
                className="flex items-center gap-3 w-full p-3 text-left text-white bg-[#C6B2DD] hover:bg-[#D8CAEB] rounded-lg mb-2 shadow-sm transition-all duration-300"
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
                className="flex items-center gap-3 w-full p-3 text-left text-white bg-[#C6B2DD] hover:bg-[#D8CAEB] rounded-lg mb-2 shadow-sm transition-all duration-300"
              >
                <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center backdrop-blur-sm">
                  <i className="fas fa-list-ol text-white"></i>
                </div>
                <span>排行榜</span>
                    </button>

<button
                      onClick={() => {
                        setShowSidebar(false);
                  setShowFriendManagement(true);
                }}
                className="flex items-center gap-3 w-full p-3 text-left text-white bg-[#C6B2DD] hover:bg-[#D8CAEB] rounded-lg mb-2 relative shadow-sm transition-all duration-300"
              >
                <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center backdrop-blur-sm">
                  <i className="fas fa-user-friends text-white"></i>
                </div>
                <span>好友管理</span>
                {friendRequestCount > 0 && (
                  <span className="absolute top-3 right-3 bg-[#FAC6CD] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {friendRequestCount}
                  </span>
                )}
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
                className="flex items-center gap-3 w-full p-3 text-left text-white bg-[#C6B2DD] hover:bg-[#D8CAEB] rounded-lg mb-2 shadow-sm transition-all duration-300"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-xl shadow-lg max-w-md w-full">
            <button
              onClick={() => setShowLoginForm(false)}
              className="absolute top-4 right-4 text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300"
            >
              <i className="fas fa-times"></i>
            </button>
            <div className="p-6">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-xl shadow-lg max-w-md w-full">
            <button 
              onClick={() => setShowExpenseForm(false)}
              className="absolute top-4 right-4 text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300"
            >
              <i className="fas fa-times"></i>
            </button>
            <div className="p-6">
              <ExpenseForm 
                onSave={async (data) => {
                  try {
                    console.log("準備保存支出:", data);
                    
                    // 立即關閉表單，提高用戶體驗
                    setShowExpenseForm(false);
                    setEditingExpense(null);
                    
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
                }}
                expense={convertExpenseForForm(editingExpense)}
              />
</div>
</div>
</div>
)}

      {/* 個人資料設置表單 */}
      {showProfileForm && currentUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-xl shadow-lg max-w-md w-full">
            <button
              onClick={() => setShowProfileForm(false)}
              className="absolute top-4 right-4 text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300"
            >
              <i className="fas fa-times"></i>
            </button>
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

      {/* 日期選擇彈窗 */}
      {showDatePicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
            <button
              onClick={() => setShowDatePicker(false)}
              className="absolute top-4 right-4 text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300"
            >
              <i className="fas fa-times"></i>
            </button>

            <h2 className="text-xl font-bold text-gray-800 mb-6">選擇日期</h2>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="customDate"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  請選擇日期
                </label>
                <input
                  type="date"
                  id="customDate"
                  value={selectedDate.toISOString().split("T")[0]}
                  onChange={(e) => setSelectedDate(new Date(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pastel-pink-300"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setSelectedDate(
                      new Date(selectedDate.toISOString().split("T")[0]),
                    );
                    setSelectedDateOption("earlier"); // 設置為"更早"選項，使按鈕高亮
                    setShowDatePicker(false);
                  }}
                  className="flex-1 py-2 px-4 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-lg font-medium transition-colors"
                >
                  確認
                </button>
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 通知彈出窗口 */}
      {showNotifications && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-16">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">通知中心</h2>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>

            <div className="p-4">
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
                </div>
              ) : (
                <div className="text-center py-6">
                  <i className="fas fa-bell-slash text-gray-300 text-3xl mb-2"></i>
                  <p className="text-gray-500">目前沒有任何通知</p>
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
</div>
);
};

export default App;
