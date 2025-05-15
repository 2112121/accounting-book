import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import * as echarts from 'echarts';
import { format } from 'date-fns';
import IncomeForm from '../components/IncomeForm';

// 定義收入類型
interface Income {
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

// 收入類別列表
const incomeCategories = [
  { id: "salary", name: "薪資", icon: "fa-money-bill-wave" },
  { id: "bonus", name: "獎金", icon: "fa-gift" },
  { id: "investment", name: "投資", icon: "fa-chart-line" },
  { id: "sidejob", name: "副業", icon: "fa-briefcase" },
  { id: "gift", name: "禮金", icon: "fa-envelope" },
  { id: "other", name: "其他", icon: "fa-question" },
];

const IncomePage: React.FC = () => {
  // 收入數據狀態
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [showSuccessMessage, setShowSuccessMessage] = useState<boolean>(false);
  
  // 新增表单相关状态
  const [showIncomeForm, setShowIncomeForm] = useState<boolean>(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  
  // 圖表相關狀態
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartInstance, setChartInstance] = useState<echarts.ECharts | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [legendSelectedMap, setLegendSelectedMap] = useState<Record<string, boolean>>({});
  const [chartsKey, setChartsKey] = useState<number>(Date.now());
  
  // 每日趨勢圖相關
  const dailyChartRef = useRef<HTMLDivElement>(null);
  const [dailyChartInstance, setDailyChartInstance] = useState<echarts.ECharts | null>(null);
  
  // 日期篩選相關
  const [selectedDateOption, setSelectedDateOption] = useState<string>("today");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${today.getMonth() + 1}`;
  });
  
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  // 獲取類別圖標
  const getCategoryIcon = (categoryName: string): string => {
    const category = incomeCategories.find(cat => cat.name === categoryName);
    return category ? category.icon : "fa-question";
  };
  
  // 獲取類別顏色
  const getCategoryColor = (category: string): string => {
    const categoryColors: Record<string, string> = {
      薪資: "#4EA8DE",
      獎金: "#6BBFA0",
      投資: "#90F1EF",
      副業: "#FAC6CD",
      禮金: "#E6CEAC",
      其他: "#A487C3",
    };

    return categoryColors[category] || "#4EA8DE";
  };
  
  // 建立空圓餅圖
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
      };

      chart.setOption(option);
      setChartInstance(chart);
    } catch (e) {
      console.error("創建空圓餅圖出錯:", e);
    }
  };

  // 初始化收入分析圓餅圖
  const initPieChart = () => {
    console.log("初始化收入分析圓餅圖");

    if (!chartRef.current) {
      console.error("圓餅圖DOM元素不存在");
      return;
    }

    const dataToUse = incomes;

    // 如果數據為空，顯示空圖表
    if (!dataToUse || dataToUse.length === 0) {
      console.log("沒有收入數據，顯示空收入分析圓餅圖");
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

      // 計算分類收入
      const categorySum: Record<string, number> = {};
      let totalAmount = 0;

      dataToUse.forEach((income) => {
        // 處理 category 可能是字符串或對象的情況
        const categoryName =
          typeof income.category === "string"
            ? income.category
            : income.category?.name || "未分類";

        // 確保金額是有效數字
        const amount = typeof income.amount === "number" ? income.amount : 0;

        // 改為接受任何數值，不再檢查是否>0，只要是數值就累加
        totalAmount += amount;

        if (categorySum[categoryName]) {
          categorySum[categoryName] += amount;
        } else {
          categorySum[categoryName] = amount;
        }
      });

      console.log("計算的分類收入:", categorySum, "總金額:", totalAmount);

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
            name: "收入金額",
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

      // 設置實例後保存
      setChartInstance(chart);
    } catch (e) {
      console.error("創建收入圓餅圖出錯:", e);
      createEmptyPieChart();
    }
  };

  // 創建空每日趨勢圖
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
            return `${params[0].axisValue}<br/>收入金額: NT$${params[0].data}`;
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
            name: "每日收入",
            type: "bar",
            data: [0, 0, 0, 0, 0, 0, 0], // 顯示空數據而非提示文字
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "#4EA8DE" },
                { offset: 1, color: "#6BB9E7" },
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
    if (!incomes || incomes.length === 0) {
      console.log("沒有收入數據，顯示空每日趨勢圖");
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
      console.log("開始初始化每日趨勢圖，數據筆數:", incomes.length);
      const chart = echarts.init(dailyChartRef.current);

      // 獲取真正的今天日期（不使用緩存的日期）
      const rightNow = new Date();
      // 重置時間為0點0分0秒
      rightNow.setHours(0, 0, 0, 0);
      console.log("趨勢圖使用的今天日期:", rightNow.toISOString());

      // 計算每日收入
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

      // 計算每天收入總和
      let hasData = false;
      incomes.forEach((income) => {
        try {
          // 標準化income日期為YYYY-MM-DD格式
          const incomeYear = income.date.getFullYear();
          const incomeMonth = String(income.date.getMonth() + 1).padStart(
            2,
            "0",
          );
          const incomeDay = String(income.date.getDate()).padStart(2, "0");
          const incomeKey = `${incomeYear}-${incomeMonth}-${incomeDay}`;

          if (dailySum[incomeKey] !== undefined) {
            dailySum[incomeKey] += income.amount;
            console.log(`找到日期 ${incomeKey} 的收入:`, income.amount);
            hasData = true;
          }
        } catch (err) {
          console.error("處理income日期出錯:", err, income);
        }
      });

      // 輸出日期和收入記錄，用於調試
      console.log("每日收入統計:", dailySum);

      // 檢查是否所有日期都沒有收入
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
      const isMobile = window.innerWidth < 768;

      chart.setOption({
        // 刪除標題配置
        tooltip: {
          trigger: "axis",
          formatter: function (params: any) {
            const value = params[0].value;
            return `${params[0].axisValue}<br/>收入金額: NT$${value}`;
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
            name: "每日收入",
            type: "bar",
            data: seriesData,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "#4EA8DE" },
                { offset: 1, color: "#6BB9E7" },
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
  
  // 從Firebase獲取收入數據
  useEffect(() => {
    const fetchIncomes = async () => {
      if (!currentUser || !currentUser.uid) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        const userId = currentUser.uid;
        const incomesRef = collection(db, "incomes");
        
        // 根據您的要求：userId升序，date降序，__name__降序
        const q = query(
          incomesRef,
          where("userId", "==", userId),
          orderBy("date", "desc")
          // 注意：Firestore無法直接按__name__排序，但ID在查詢結果中已經包含
        );
        
        const querySnapshot = await getDocs(q);
        
        const fetchedIncomes: Income[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          
          if (data.userId === userId) {
            try {
              // 安全地處理日期轉換
              let incomeDate;
              if (data.date && typeof data.date.toDate === "function") {
                incomeDate = data.date.toDate();
              } else if (data.date && data.date._seconds) {
                incomeDate = new Date(data.date._seconds * 1000);
              } else if (data.date instanceof Date) {
                incomeDate = data.date;
              } else if (typeof data.date === "string") {
                incomeDate = new Date(data.date);
              } else {
                console.warn(`無效的日期格式: ${JSON.stringify(data.date)}`);
                incomeDate = new Date();
              }
              
              fetchedIncomes.push({
                id: doc.id,
                amount: data.amount,
                category: {
                  id: data.category,
                  name: data.category,
                  icon: getCategoryIcon(data.category),
                },
                date: incomeDate,
                notes: data.notes || "",
                userId: data.userId,
              });
            } catch (e) {
              console.error(`處理收入記錄 ${doc.id} 時出錯:`, e);
            }
          }
        });
        
        // 對結果再次進行排序（確保date降序，然後是id降序）
        fetchedIncomes.sort((a, b) => {
          // 先按日期降序排
          const dateCompare = b.date.getTime() - a.date.getTime();
          if (dateCompare !== 0) return dateCompare;
          
          // 再按ID降序排
          return b.id.localeCompare(a.id);
        });
        
        setIncomes(fetchedIncomes);
      } catch (err) {
        console.error("獲取收入記錄失敗:", err);
        setError("獲取收入記錄失敗，請稍後再試");
      } finally {
        setLoading(false);
      }
    };
    
    fetchIncomes();
  }, [currentUser]);
  
  // 更新圖表
  useEffect(() => {
    if (!loading && incomes.length > 0) {
      console.log("數據加載完成，初始化圖表");
      // 初始化圓餅圖
      initPieChart();
      // 初始化每日趨勢圖
      initDailyChart();
    }
  }, [loading, incomes, selectedCategory]);
  
  // 窗口大小變化時重繪圖表
  useEffect(() => {
    const handleResize = () => {
      if (chartInstance) {
        chartInstance.resize();
      }
      if (dailyChartInstance) {
        dailyChartInstance.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [chartInstance, dailyChartInstance]);
  
  // 添加收入記錄
  const addIncome = async (incomeData: any) => {
    if (!currentUser) return;
    
    try {
      // 創建臨時ID
      const tempId = `temp_${Date.now()}`;
      
      // 創建新記錄
      const newIncome: Income = {
        id: tempId,
        amount: incomeData.amount,
        category: {
          id: incomeData.category,
          name: incomeData.category,
          icon: getCategoryIcon(incomeData.category),
        },
        date: new Date(incomeData.date),
        notes: incomeData.notes || "",
        userId: currentUser.uid,
      };
      
      // 立即更新UI
      setIncomes(prev => [newIncome, ...prev]);
      
      // 顯示成功訊息
      setSuccessMessage("收入記錄已添加！");
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 1500);
      
      // 保存到Firebase
      const docRef = await addDoc(collection(db, "incomes"), {
        ...incomeData,
        userId: currentUser.uid,
        createdAt: new Date(),
        date: Timestamp.fromDate(new Date(incomeData.date)),
      });
      
      // 更新真實ID
      setIncomes(prev => 
        prev.map(income => 
          income.id === tempId ? { ...income, id: docRef.id } : income
        )
      );
      
      return true;
    } catch (error) {
      console.error("添加收入記錄失敗:", error);
      setError("添加收入記錄失敗，請稍後再試");
      setTimeout(() => setError(null), 3000);
      return false;
    }
  };
  
  // 計算總收入
  const calculateMonthlyTotal = () => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    const monthlyIncomes = incomes.filter(income => {
      const incomeDate = new Date(income.date);
      return incomeDate.getMonth() === thisMonth && incomeDate.getFullYear() === thisYear;
    });
    
    return {
      total: monthlyIncomes.reduce((sum, income) => sum + income.amount, 0),
      count: monthlyIncomes.length
    };
  };
  
  const calculateYearlyTotal = () => {
    const now = new Date();
    const thisYear = now.getFullYear();
    
    const yearlyIncomes = incomes.filter(income => {
      const incomeDate = new Date(income.date);
      return incomeDate.getFullYear() === thisYear;
    });
    
    return {
      total: yearlyIncomes.reduce((sum, income) => sum + income.amount, 0),
      count: yearlyIncomes.length
    };
  };
  
  const monthlyStats = calculateMonthlyTotal();
  const yearlyStats = calculateYearlyTotal();
  
  // 重置分類選擇
  const resetCategorySelection = () => {
    setSelectedCategory(null);
    // 重新渲染圖表
    setChartsKey(Date.now());
  };
  
  // 獲取今天的日期
  const getTodayDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };
  
  // 篩選收入記錄
  const getFilteredIncomes = () => {
    console.log("===開始篩選收入記錄===");
    console.log("當前選擇的日期選項:", selectedDateOption);

    // 全部記錄直接返回
    if (selectedDateOption === "all") {
      console.log("顯示全部收入記錄");
      return incomes;
    }

    // 處理按月過濾
    if (selectedDateOption === "month") {
      console.log("按本月過濾收入記錄");
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      return incomes.filter(income => {
        const incomeDate = new Date(income.date);
        return incomeDate.getMonth() === currentMonth && 
               incomeDate.getFullYear() === currentYear;
      });
    }
    
    // 處理選擇月份過濾
    if (selectedDateOption === "month_select") {
      console.log("按選擇的月份過濾收入記錄:", selectedMonth);
      const [year, month] = selectedMonth.split('-').map(Number);
      
      return incomes.filter(income => {
        const incomeDate = new Date(income.date);
        return incomeDate.getMonth() === month - 1 && 
               incomeDate.getFullYear() === year;
      });
    }
    
    // 處理本週過濾
    if (selectedDateOption === "this_week") {
      console.log("按本週過濾收入記錄");
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
      
      return incomes.filter(income => {
        const incomeDate = new Date(income.date);
        return incomeDate >= firstDayOfWeek && incomeDate <= lastDayOfWeek;
      });
    }
    
    // 處理上週過濾
    if (selectedDateOption === "last_week") {
      console.log("按上週過濾收入記錄");
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
      
      return incomes.filter(income => {
        const incomeDate = new Date(income.date);
        return incomeDate >= firstDayOfLastWeek && incomeDate <= lastDayOfLastWeek;
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
    const filtered = incomes.filter((income) => {
      try {
        // 提取收入記錄的年月日
        const incomeYear = income.date.getFullYear();
        const incomeMonth = income.date.getMonth();
        const incomeDay = income.date.getDate();

        // 日期必須精確匹配年月日
        const matches =
          incomeYear === filterYear &&
          incomeMonth === filterMonth &&
          incomeDay === filterDay;

        if (matches) {
          console.log("匹配的收入:", {
            id: income.id,
            日期: income.date.toISOString(),
            年: incomeYear,
            月: incomeMonth + 1,
            日: incomeDay,
            金額: income.amount,
          });
        }

        return matches;
      } catch (err) {
        console.error("篩選時出錯:", err, income);
        return false;
      }
    });

    console.log(`篩選結果: ${filtered.length} 筆記錄`);
    return filtered;
  };
  
  // 獲取分類收入明細
  const getCategoryIncomes = () => {
    if (!selectedCategory) return [];

    // 先根据圓餅圖模式過濾數據
    let filteredByMode = incomes;
    
    // 使用與圓餅圖相同的過濾邏輯
    const today = new Date();
    const currentMonth = today.getMonth(); // 0-11
    const currentYear = today.getFullYear();
    
    console.log(`類別收入明細 - 過濾當前月份: ${currentYear}年${currentMonth + 1}月`);
    
    // 按當前月份過濾
    filteredByMode = incomes.filter(income => {
      try {
        if (!income.date) return false;
        
        const incDate = income.date instanceof Date ? 
          new Date(income.date.getTime()) : 
          new Date(income.date);
          
        if (isNaN(incDate.getTime())) return false;
        
        // 直接比較年月
        const incMonth = incDate.getMonth();
        const incYear = incDate.getFullYear();
        
        return (incYear === currentYear && incMonth === currentMonth);
      } catch (err) {
        console.error(`處理收入 ${income.id} 時出錯:`, err);
        return false;
      }
    });
    
    console.log(`類別收入明細 - 當月過濾結果: ${filteredByMode.length} 筆記錄`);
    
    // 再按類別過濾
    return filteredByMode.filter(income => {
      const categoryName = typeof income.category === "string" ? 
        income.category : 
        income.category?.name || "未分類";
        
      return categoryName === selectedCategory;
    });
  };
  
  // 篩選所有收入記錄
  const filteredIncomes = getFilteredIncomes();
  
  // 獲取分類收入
  const categoryIncomes = getCategoryIncomes();
  
  // 格式化金額
  const formatAmount = (amount: number) => {
    return amount.toLocaleString('zh-TW');
  };
  
  // 编辑收入记录
  const editIncome = (income: Income) => {
    setEditingIncome(income);
    setShowIncomeForm(true);
  };

  // 更新收入记录
  const updateIncome = async (incomeData: any): Promise<boolean> => {
    if (!currentUser || !editingIncome) return false;
    
    try {
      // 创建更新数据
      const updatedData = {
        amount: incomeData.amount,
        category: incomeData.category,
        date: Timestamp.fromDate(new Date(incomeData.date)),
        notes: incomeData.notes || "",
        updatedAt: new Date()
      };
      
      // 更新Firebase
      await updateDoc(doc(db, "incomes", editingIncome.id), updatedData);
      
      // 更新本地状态
      setIncomes(prev => 
        prev.map(income => 
          income.id === editingIncome.id 
            ? {
                ...income,
                amount: incomeData.amount,
                category: {
                  id: incomeData.category,
                  name: incomeData.category,
                  icon: getCategoryIcon(incomeData.category)
                },
                date: new Date(incomeData.date),
                notes: incomeData.notes || ""
              } 
            : income
        )
      );
      
      // 显示成功消息
      setSuccessMessage("收入记录已更新！");
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 1500);
      
      return true;
    } catch (error) {
      console.error("更新收入记录失败:", error);
      setError("更新收入记录失败，请稍后再试");
      setTimeout(() => setError(null), 3000);
      return false;
    }
  };

  // 删除收入记录
  const deleteIncome = async (id: string) => {
    if (!currentUser) return;
    
    if (!window.confirm("确定要删除这条收入记录吗？")) {
      return;
    }
    
    try {
      // 删除Firebase记录
      await deleteDoc(doc(db, "incomes", id));
      
      // 更新本地状态
      setIncomes(prev => prev.filter(income => income.id !== id));
      
      // 显示成功消息
      setSuccessMessage("收入记录已删除！");
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 1500);
    } catch (error) {
      console.error("删除收入记录失败:", error);
      setError("删除收入记录失败，请稍后再试");
      setTimeout(() => setError(null), 3000);
    }
  };
  
  return (
    <div className="bg-[#F5F5FA] min-h-screen font-sans">
      {/* 頂部導航欄 */}
      <nav className="fixed top-0 left-0 right-0 bg-white bg-opacity-95 backdrop-blur-md shadow-sm z-20">
        <div className="flex justify-between items-center px-4 py-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center">
              <span className="text-lg font-bold text-[#A487C3]">
                <i className="fas fa-moon mr-1"></i>記帳狼人殺
              </span>
            </Link>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="py-2 px-4 bg-[#A487C3] hover:bg-[#8A5DC8] text-white rounded-lg transition-all duration-300 shadow-sm hover:shadow-md"
            >
              返回主頁
            </button>
          </div>
        </div>
      </nav>
      
      {/* 成功提示 */}
      {showSuccessMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {successMessage}
        </div>
      )}
      
      {/* 錯誤提示 */}
      {error && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {error}
        </div>
      )}
      
      {/* 收入表单 */}
      {showIncomeForm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md mx-4 animate-fadeIn">
            <IncomeForm
              onSave={async (incomeData) => {
                const success = editingIncome 
                  ? await updateIncome(incomeData)
                  : await addIncome(incomeData);
                
                if (success) {
                  setShowIncomeForm(false);
                  setEditingIncome(null);
                }
              }}
              onCancel={() => {
                setShowIncomeForm(false);
                setEditingIncome(null);
              }}
              income={editingIncome ? {
                id: editingIncome.id,
                amount: editingIncome.amount,
                category: editingIncome.category.name,
                date: format(editingIncome.date, 'yyyy-MM-dd'),
                notes: editingIncome.notes
              } : null}
            />
          </div>
        </div>
      )}
      
      <div className="pt-24 px-4 md:px-8 pb-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#4EA8DE] mb-1 font-heading">
            收入管理
          </h1>
          <p className="text-[#6E6E6E]">
            在此頁面管理您的收入來源和記錄
          </p>
        </div>
        
        {/* 快速添加收入按鈕 */}
        <div className="mb-8 relative flex gap-2">
          <button 
            className="px-5 py-3 bg-[#4EA8DE] hover:bg-[#3D97CD] text-white rounded-xl shadow-sm hover:shadow-md flex items-center gap-2 font-medium transition-all duration-300"
            onClick={() => {
              setShowIncomeForm(true);
              setEditingIncome(null);
            }}
          >
            <i className="fas fa-plus"></i>
            <span>新增收入</span>
          </button>
        </div>
        
        {/* 收入統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div 
            className="bg-gradient-to-br from-[#4EA8DE] to-[#6BB9E7] text-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-500"
          >
            <div className="p-5 flex items-center justify-between">
              <div>
                <p className="text-white text-opacity-80 mb-1">本月總收入</p>
                <h3 className="text-2xl font-bold">
                  NT$ {formatAmount(filteredIncomes.filter(income => {
                    const now = new Date();
                    const incomeDate = new Date(income.date);
                    return incomeDate.getMonth() === now.getMonth() && 
                           incomeDate.getFullYear() === now.getFullYear();
                  }).reduce((sum, income) => sum + income.amount, 0))}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-white bg-opacity-20 flex items-center justify-center">
                <i className="fas fa-coins text-xl"></i>
              </div>
            </div>
            <div className="bg-white bg-opacity-10 px-5 py-2 text-sm">
              <span>{filteredIncomes.filter(income => {
                const now = new Date();
                const incomeDate = new Date(income.date);
                return incomeDate.getMonth() === now.getMonth() && 
                       incomeDate.getFullYear() === now.getFullYear();
              }).length} 筆本月收入記錄</span>
            </div>
          </div>
          
          <div 
            className="bg-gradient-to-br from-[#6BBFA0] to-[#8FD3B9] text-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-500"
          >
            <div className="p-5 flex items-center justify-between">
              <div>
                <p className="text-white text-opacity-90 mb-1 font-medium">年度總收入</p>
                <h3 className="text-2xl font-bold">
                  NT$ {formatAmount(filteredIncomes.filter(income => {
                    const now = new Date();
                    const incomeDate = new Date(income.date);
                    return incomeDate.getFullYear() === now.getFullYear();
                  }).reduce((sum, income) => sum + income.amount, 0))}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-white bg-opacity-20 flex items-center justify-center">
                <i className="fas fa-chart-line text-xl"></i>
              </div>
            </div>
            <div className="bg-white bg-opacity-10 px-5 py-2 text-sm">
              <span>{filteredIncomes.filter(income => {
                const now = new Date();
                const incomeDate = new Date(income.date);
                return incomeDate.getFullYear() === now.getFullYear();
              }).length} 筆年度收入記錄</span>
            </div>
          </div>
        </div>
        
        {/* 收入分析卡片 */}
        <div className="relative bg-white bg-opacity-95 backdrop-blur-sm rounded-xl shadow-md border-l-4 border-[#4EA8DE] p-5 mb-6 hover:shadow-lg transition-all duration-300">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-[#4EA8DE]">收入分析</h2>
            {selectedCategory && (
              <button
                onClick={resetCategorySelection}
                className="text-sm text-white bg-[#4EA8DE] hover:bg-[#3D97CD] px-4 py-1.5 rounded-lg flex items-center transition-all duration-300 shadow-sm hover:shadow-md"
              >
                <i className="fas fa-arrow-left mr-1.5"></i> 返回總覽
              </button>
            )}
          </div>
          <div className="flex flex-col md:flex-row">
            <div
              className={`${selectedCategory ? "md:w-3/5" : "w-full"} transition-all duration-300`}
            >
              {incomes && incomes.length > 0 ? (
                <div
                  ref={chartRef}
                  style={{
                    height: "260px",
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                  key={`pie-chart-${selectedCategory ? "selected" : "overview"}-${chartsKey}`}
                />
              ) : (
                <div className="flex items-center justify-center h-[260px]">
                  <div className="text-center">
                    <div className="mb-4">
                      <i className="fas fa-chart-pie text-gray-300 text-4xl"></i>
                    </div>
                    <p className="text-gray-500">暫無收入數據</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* 類別收入明細 */}
            {selectedCategory && (
              <div className="md:w-2/5 mt-4 md:mt-0 md:pl-6 flex flex-col">
                <div className="mb-2">
                  <h3 className="font-bold text-gray-700">
                    {selectedCategory}收入明細
                    <span className="text-sm font-normal ml-2 text-gray-500">
                      (本月)
                    </span>
                  </h3>
                </div>
                
                <div className="flex-grow overflow-auto pr-2" style={{ maxHeight: "220px" }}>
                  {categoryIncomes.length > 0 ? (
                    <div className="space-y-3">
                      {categoryIncomes.map((income) => (
                        <div
                          key={income.id}
                          className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-sm text-gray-500">
                                {income.date.toLocaleDateString("zh-TW")}
                              </p>
                              {income.notes && (
                                <p className="text-sm text-gray-700 mt-1">
                                  {income.notes}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-[#4EA8DE]">
                                NT$ {income.amount.toLocaleString("zh-TW")}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      <p>本月無{selectedCategory}收入記錄</p>
                    </div>
                  )}
                </div>
                
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">本月總計</span>
                    <span className="font-bold text-[#4EA8DE]">
                      NT$ {categoryIncomes
                        .reduce((sum, income) => sum + income.amount, 0)
                        .toLocaleString("zh-TW")}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* 每日收入趨勢卡片 */}
        <div className="bg-white bg-opacity-95 rounded-xl shadow-md border-l-4 border-[#6BBFA0] p-5 mb-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-[#6BBFA0]">每日收入趨勢</h2>
          </div>
          
          {incomes && incomes.length > 0 ? (
            <div
              ref={dailyChartRef}
              style={{
                height: "260px",
                width: "100%",
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-[260px]">
              <div className="text-center">
                <div className="mb-4">
                  <i className="fas fa-chart-bar text-gray-300 text-4xl"></i>
                </div>
                <p className="text-gray-500">暫無收入數據</p>
              </div>
            </div>
          )}
        </div>
        
        {/* 收入明細區塊 */}
        <div className="bg-white bg-opacity-95 rounded-xl shadow-md border-l-4 border-[#4EA8DE] p-5 mb-6">
          <div className="flex flex-col mb-4">
            <div className="mb-3">
              <h2 className="text-xl font-bold text-[#4EA8DE]">
                {selectedDateOption === "today"
                  ? "今日收入明細"
                  : selectedDateOption === "yesterday"
                    ? "昨日收入明細"
                    : selectedDateOption === "month"
                      ? "本月收入明細"
                      : selectedDateOption === "this_week"
                        ? "本週收入明細"
                        : selectedDateOption === "last_week"
                          ? "上週收入明細"
                          : selectedDateOption === "month_select"
                            ? `${selectedMonth.split('-')[0]}年${String(selectedMonth.split('-')[1]).padStart(2, '0')}月收入明細`
                            : selectedDateOption === "earlier"
                              ? format(selectedDate, "yyyy年M月d日") + " 收入明細"
                              : "全部收入明細"}
              </h2>
            </div>
            
            {/* 日期切換按鈕 */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              <button
                onClick={() => {
                  setSelectedDate(getTodayDate());
                  setSelectedDateOption("today");
                }}
                className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                  selectedDateOption === "today"
                    ? "bg-[#4EA8DE] text-white border border-[#4EA8DE]"
                    : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                }`}
              >
                <i className="fas fa-calendar-day text-[10px]"></i>
                今天
              </button>
              
              <button
                onClick={() => {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  yesterday.setHours(0, 0, 0, 0);
                  setSelectedDate(yesterday);
                  setSelectedDateOption("yesterday");
                }}
                className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                  selectedDateOption === "yesterday"
                    ? "bg-[#4EA8DE] text-white border border-[#4EA8DE]"
                    : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                }`}
              >
                <i className="fas fa-calendar-minus text-[10px]"></i>
                昨天
              </button>
              
              <button
                onClick={() => {
                  setSelectedDateOption("this_week");
                }}
                className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                  selectedDateOption === "this_week"
                    ? "bg-[#4EA8DE] text-white border border-[#4EA8DE]"
                    : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                }`}
              >
                <i className="fas fa-calendar-week text-[10px]"></i>
                本週
              </button>
              
              <button
                onClick={() => {
                  setSelectedDateOption("last_week");
                }}
                className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                  selectedDateOption === "last_week"
                    ? "bg-[#4EA8DE] text-white border border-[#4EA8DE]"
                    : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                }`}
              >
                <i className="fas fa-calendar-week text-[10px]"></i>
                上週
              </button>
              
              <button
                onClick={() => {
                  setSelectedDateOption("month");
                }}
                className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                  selectedDateOption === "month"
                    ? "bg-[#4EA8DE] text-white border border-[#4EA8DE]"
                    : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                }`}
              >
                <i className="fas fa-calendar-alt text-[10px]"></i>
                本月
              </button>
              
              <button
                onClick={() => {
                  setSelectedDateOption("all");
                }}
                className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors duration-200 ${
                  selectedDateOption === "all"
                    ? "bg-[#4EA8DE] text-white border border-[#4EA8DE]"
                    : "bg-[#F9F7FB] text-[#6D6D6D] border border-[#E8E4ED] hover:bg-[#F2EDF7]"
                }`}
              >
                <i className="fas fa-list text-[10px]"></i>
                全部
              </button>
            </div>
          </div>
          
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-500">正在載入收入記錄...</p>
            </div>
          ) : filteredIncomes.length > 0 ? (
            <>
              <div className="space-y-4">
                {filteredIncomes.map((income) => (
                  <div 
                    key={income.id}
                    className="p-4 border border-gray-100 rounded-lg hover:shadow-md transition-all duration-300 bg-white"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                          style={{ backgroundColor: getCategoryColor(income.category.name) }}
                        >
                          <i className={`fas ${income.category.icon}`}></i>
                        </div>
                        <div>
                          <h3 className="font-medium">{income.category.name}</h3>
                          <p className="text-sm text-gray-500">
                            {income.date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </p>
                          {income.notes && <p className="text-sm mt-1">{income.notes}</p>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-lg font-bold text-[#4EA8DE]">
                          NT$ {income.amount.toLocaleString('zh-TW')}
                        </span>
                        <div className="mt-2 flex gap-2">
                          <button 
                            onClick={() => editIncome(income)}
                            className="text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 p-1 rounded"
                            title="編輯"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button 
                            onClick={() => deleteIncome(income.id)}
                            className="text-xs text-red-600 bg-red-50 hover:bg-red-100 p-1 rounded"
                            title="刪除"
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </div>
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
                    filteredIncomes.reduce(
                      (total, income) => total + income.amount,
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
                  ? "今天還沒有記錄任何收入"
                  : selectedDateOption === "yesterday"
                    ? "昨天沒有收入記錄"
                    : selectedDateOption === "month"
                      ? "本月沒有收入記錄"
                      : selectedDateOption === "month_select"
                        ? `${selectedMonth.split('-')[0]}年${String(selectedMonth.split('-')[1]).padStart(2, '0')}月沒有收入記錄`
                        : selectedDateOption === "this_week"
                          ? "本週沒有收入記錄"
                          : selectedDateOption === "last_week"
                            ? "上週沒有收入記錄"
                            : selectedDateOption === "all"
                              ? "沒有任何收入記錄"
                              : `${format(selectedDate, "yyyy年M月d日")} 沒有收入記錄`}
              </p>
              <button
                onClick={() => {
                  setShowIncomeForm(true);
                  setEditingIncome(null);
                }}
                className="px-4 py-2 bg-[#4EA8DE] hover:bg-[#3D97CD] text-white rounded-lg transition-all duration-300 text-sm"
              >
                <i className="fas fa-plus mr-1"></i> 添加收入記錄
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IncomePage; 