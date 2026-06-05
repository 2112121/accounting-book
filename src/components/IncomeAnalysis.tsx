import React, { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";

// 收入類型（與 App.tsx 的 Income 一致）
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

interface IncomeAnalysisProps {
  incomes: Income[];
}

const incomeCategories = [
  { id: "salary", name: "薪資", icon: "fa-money-bill-wave" },
  { id: "bonus", name: "獎金", icon: "fa-gift" },
  { id: "investment", name: "投資", icon: "fa-chart-line" },
  { id: "sidejob", name: "副業", icon: "fa-briefcase" },
  { id: "gift", name: "禮金", icon: "fa-envelope" },
  { id: "sponsorship", name: "包養", icon: "fa-heart" },
  { id: "subsidy", name: "補貼", icon: "fa-hand-holding-usd" },
  { id: "insurance", name: "保險理賠", icon: "fa-shield-alt" },
  { id: "other", name: "其他", icon: "fa-question" },
];

const getCategoryIcon = (categoryName: string): string => {
  const category = incomeCategories.find((cat) => cat.name === categoryName);
  return category ? category.icon : "fa-question";
};

const getCategoryColor = (category: string): string => {
  const categoryColors: Record<string, string> = {
    薪資: "#4EA8DE",
    獎金: "#6BBFA0",
    投資: "#90F1EF",
    副業: "#FAC6CD",
    禮金: "#E6CEAC",
    包養: "#FF8CAB",
    補貼: "#A3D9A5",
    保險理賠: "#7CD5F3",
    其他: "#A487C3",
  };
  return categoryColors[category] || "#4EA8DE";
};

const CHART_COLORS = [
  "#A487C3", "#FAC6CD", "#B8E3C9", "#FFD166", "#4EA8DE",
  "#FF8B64", "#C0C6E8", "#9CC3D5", "#FFB3B3", "#D8BBFF",
];

const IncomeAnalysis: React.FC<IncomeAnalysisProps> = ({ incomes }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const dailyChartRef = useRef<HTMLDivElement>(null);
  const dailyChartInstanceRef = useRef<echarts.ECharts | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [legendSelectedMap, setLegendSelectedMap] = useState<Record<string, boolean>>({});
  const [chartsKey, setChartsKey] = useState<number>(0);
  const [chartFilterMode, setChartFilterMode] = useState<'all' | 'month' | 'custom'>('month');
  const [pieChartMonth, setPieChartMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  const getFilteredByMode = (): Income[] => {
    if (chartFilterMode === 'month') {
      const today = new Date();
      return incomes.filter((income) => {
        const d = new Date(income.date);
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      });
    }
    if (chartFilterMode === 'custom' && pieChartMonth) {
      const [year, month] = pieChartMonth.split('-').map(Number);
      return incomes.filter((income) => {
        const d = new Date(income.date);
        return d.getMonth() === month - 1 && d.getFullYear() === year;
      });
    }
    return incomes;
  };

  const createEmptyPieChart = () => {
    if (!chartRef.current) return;
    try {
      if (chartInstanceRef.current) {
        try { chartInstanceRef.current.dispose(); } catch (_e) { /* noop */ }
      }
      const chart = echarts.init(chartRef.current);
      chart.setOption({
        title: null,
        tooltip: { trigger: "item" },
        legend: { orient: "horizontal", left: "center", bottom: 10, textStyle: { color: "#6E6E6E" }, itemGap: 20 },
        color: CHART_COLORS,
        animation: true,
        animationDuration: 700,
      });
      chartInstanceRef.current = chart;
    } catch (_e) { /* noop */ }
  };

  const initPieChart = () => {
    if (!chartRef.current) return;

    const dataToUse = getFilteredByMode();
    if (!dataToUse || dataToUse.length === 0) {
      createEmptyPieChart();
      return;
    }

    if (chartInstanceRef.current) {
      try { chartInstanceRef.current.dispose(); } catch (_e) { /* noop */ }
    }

    try {
      const chart = echarts.init(chartRef.current);
      const categorySum: Record<string, number> = {};
      dataToUse.forEach((income) => {
        const categoryName =
          typeof income.category === "string"
            ? income.category
            : income.category?.name || "未分類";
        const amount = typeof income.amount === "number" ? income.amount : 0;
        categorySum[categoryName] = (categorySum[categoryName] || 0) + amount;
      });

      if (Object.keys(categorySum).length === 0) {
        createEmptyPieChart();
        return;
      }

      const pieData = Object.keys(categorySum).map((category) => ({
        name: category,
        value: categorySum[category],
      }));

      const isMobile = window.innerWidth < 768;
      const isSelectedMode = selectedCategory !== null;

      const option = {
        title: null,
        tooltip: {
          trigger: "item",
          formatter: "{a} <br/>{b}: NT${c} ({d}%)",
          confine: true,
        },
        legend: {
          show: !isSelectedMode,
          orient: "horizontal",
          left: "center",
          bottom: 0,
          padding: [20, 0, 0, 0],
          itemWidth: 14,
          itemHeight: 14,
          itemGap: 20,
          formatter: (name: string) => (name.length > 4 ? name.substring(0, 4) + "..." : name),
          data: Object.keys(categorySum),
          textStyle: { color: "#6E6E6E", fontSize: 12 },
          selected: legendSelectedMap,
        },
        color: CHART_COLORS,
        animation: true,
        animationThreshold: 1000,
        animationDuration: 700,
        animationEasing: 'sinusoidalOut' as const,
        series: [
          {
            name: "收入金額",
            type: "pie",
            radius: ["30%", "60%"],
            center: [isSelectedMode ? (isMobile ? "48%" : "45%") : "50%", "45%"],
            avoidLabelOverlap: false,
            emphasis: {
              itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0, 0, 0, 0.2)" },
              scale: true,
              scaleSize: 10,
            },
            label: { show: true, formatter: "{b}\n{d}%" },
            labelLine: { show: true, smooth: true, length: 15, length2: 12 },
            data: pieData,
            animationType: 'expansion' as const,
            animationEasing: 'sinusoidalOut' as const,
            animationDelay: (idx: number) => idx * 60,
          },
        ],
      };

      chart.setOption(option);
      chart.on("legendselectchanged", (params: any) => {
        setLegendSelectedMap(params.selected);
      });
      chart.on('click', (params: any) => {
        if (params.seriesType === 'pie') {
          setSelectedCategory(params.name);
        }
      });
      chartInstanceRef.current = chart;
    } catch (_e) {
      createEmptyPieChart();
    }
  };

  const createEmptyDailyChart = () => {
    if (!dailyChartRef.current) return;
    if (dailyChartInstanceRef.current) {
      try { dailyChartInstanceRef.current.dispose(); } catch (_e) { /* noop */ }
    }
    try {
      const chart = echarts.init(dailyChartRef.current);
      chart.setOption({
        tooltip: {
          trigger: "axis",
          formatter: (params: any) => `${params[0].axisValue}<br/>收入金額: NT$${params[0].data}`,
          confine: true,
        },
        grid: { left: "3%", right: "4%", bottom: "15%", containLabel: true },
        xAxis: {
          type: "category",
          data: ["週一", "週二", "週三", "週四", "週五", "週六", "週日"],
          axisLine: { lineStyle: { color: "#999" } },
          axisLabel: { color: "#666" },
        },
        yAxis: {
          type: "value",
          axisLine: { lineStyle: { color: "#999" } },
          axisLabel: { formatter: "{value} 元", color: "#666" },
        },
        series: [
          {
            name: "每日收入",
            type: "bar",
            data: [0, 0, 0, 0, 0, 0, 0],
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "#4EA8DE" },
                { offset: 1, color: "#6BB9E7" },
              ]),
            },
          },
        ],
      });
      dailyChartInstanceRef.current = chart;
    } catch (_e) { /* noop */ }
  };

  const initDailyChart = () => {
    if (!dailyChartRef.current) return;
    if (!incomes || incomes.length === 0) {
      createEmptyDailyChart();
      return;
    }
    if (dailyChartInstanceRef.current) {
      try { dailyChartInstanceRef.current.dispose(); } catch (_e) { /* noop */ }
    }

    try {
      const chart = echarts.init(dailyChartRef.current);
      const dailySum: Record<string, number> = {};
      const dates: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - i);
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        dates.push(dateKey);
        dailySum[dateKey] = 0;
      }

      let hasData = false;
      incomes.forEach((income) => {
        try {
          const incomeKey = `${income.date.getFullYear()}-${String(income.date.getMonth() + 1).padStart(2, "0")}-${String(income.date.getDate()).padStart(2, "0")}`;
          if (dailySum[incomeKey] !== undefined) {
            dailySum[incomeKey] += income.amount;
            hasData = true;
          }
        } catch (_err) { /* noop */ }
      });

      if (!hasData) {
        createEmptyDailyChart();
        return;
      }

      const xAxisData = dates.map((date) => {
        const parts = date.split("-");
        return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
      });
      const seriesData = dates.map((date) => dailySum[date]);
      const isMobile = window.innerWidth < 768;

      chart.setOption({
        tooltip: {
          trigger: "axis",
          formatter: (params: any) => `${params[0].axisValue}<br/>收入金額: NT$${params[0].value}`,
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
          axisLine: { lineStyle: { color: "#999" } },
          axisLabel: { color: "#666" },
        },
        yAxis: {
          type: "value",
          axisLine: { lineStyle: { color: "#999" } },
          axisLabel: { formatter: "{value} 元", color: "#666" },
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
      dailyChartInstanceRef.current = chart;
    } catch (_e) {
      createEmptyDailyChart();
    }
  };

  // 初始化/更新圖表
  useEffect(() => {
    const timer = window.setTimeout(() => {
      initPieChart();
      initDailyChart();
    }, 100);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomes, selectedCategory, chartFilterMode, pieChartMonth, chartsKey]);

  // 卸載時清理
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        try { chartInstanceRef.current.dispose(); } catch (_e) { /* noop */ }
        chartInstanceRef.current = null;
      }
      if (dailyChartInstanceRef.current) {
        try { dailyChartInstanceRef.current.dispose(); } catch (_e) { /* noop */ }
        dailyChartInstanceRef.current = null;
      }
    };
  }, []);

  // 視窗縮放重繪
  useEffect(() => {
    const handleResize = () => {
      chartInstanceRef.current?.resize();
      dailyChartInstanceRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const resetCategorySelection = () => {
    setSelectedCategory(null);
    setChartsKey((k) => k + 1);
  };

  const getCategoryIncomes = (): Income[] => {
    if (!selectedCategory) return [];
    return getFilteredByMode().filter((income) => {
      const categoryName =
        typeof income.category === "string" ? income.category : income.category?.name || "未分類";
      return categoryName === selectedCategory;
    });
  };

  const categoryIncomes = getCategoryIncomes();

  return (
    <>
      {/* 收入分析卡片 */}
      <div className="relative bg-white bg-opacity-95 backdrop-blur-sm rounded-xl shadow-md border-l-4 border-[#4EA8DE] p-5 mb-6 hover:shadow-lg transition-all duration-300">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-[#4EA8DE] mb-2">收入分析</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => { setChartFilterMode('month'); setChartsKey((k) => k + 1); }}
                className={`text-xs px-2 py-1 rounded-md transition-colors ${chartFilterMode === 'month' ? 'bg-[#4EA8DE] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                當月
              </button>
              <div className="relative">
                <button
                  className={`text-xs px-2 py-1 rounded-md transition-colors flex items-center ${chartFilterMode === 'custom' ? 'bg-[#4EA8DE] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  選擇月份
                </button>
                <input
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  type="month"
                  value={pieChartMonth}
                  onChange={(e) => { setPieChartMonth(e.target.value); setChartFilterMode('custom'); setChartsKey((k) => k + 1); }}
                />
              </div>
              <button
                onClick={() => { setChartFilterMode('all'); setChartsKey((k) => k + 1); }}
                className={`text-xs px-2 py-1 rounded-md transition-colors ${chartFilterMode === 'all' ? 'bg-[#4EA8DE] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                全部
              </button>
            </div>
            {selectedCategory && (
              <button
                onClick={resetCategorySelection}
                className="text-xs px-2 py-1 rounded-md text-white bg-[#4EA8DE] hover:bg-[#3D97CD] flex items-center transition-colors shrink-0"
              >
                <i className="fas fa-arrow-left mr-1"></i> 返回總覽
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col md:flex-row">
          <div className={`${selectedCategory ? "md:w-3/5" : "w-full"} transition-all duration-300`}>
            {incomes && incomes.length > 0 ? (
              <div className="flex flex-col items-center">
                <div
                  ref={chartRef}
                  style={{ height: "300px", width: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}
                  key={`income-pie-${selectedCategory ? "selected" : "overview"}-${chartsKey}`}
                />
                {!selectedCategory && (
                  <p className="text-xs text-gray-500 italic mt-1">
                    <i className="fas fa-info-circle mr-1"></i>
                    點擊圖表上的類別查看詳細收入明細
                  </p>
                )}
              </div>
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
            <div className="md:w-2/5 md:pl-4 mt-4 md:mt-0">
              <div className="bg-white rounded-lg p-4 h-[300px] flex flex-col shadow-lg border border-gray-100">
                <div className="overflow-y-auto flex-1 pr-1">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center mr-2" style={{ backgroundColor: getCategoryColor(selectedCategory) }}>
                        <i className={`fas ${getCategoryIcon(selectedCategory)} text-white`}></i>
                      </div>
                      <h3 className="font-medium text-gray-800">
                        {selectedCategory} <span className="text-sm text-gray-500">收入明細</span>
                      </h3>
                    </div>
                    <div className="bg-gray-100 text-xs py-1 px-2 rounded-full font-medium text-gray-600">
                      {categoryIncomes.length} 筆記錄
                    </div>
                  </div>

                  {categoryIncomes.length > 0 ? (
                    <div className="space-y-2 pb-2">
                      {categoryIncomes.map((income, index) => (
                        <div
                          key={income.id}
                          className="bg-gray-50 p-3 rounded-lg hover:bg-gray-100 transition-all duration-200 border-l-3"
                          style={{
                            borderLeftColor: getCategoryColor(selectedCategory),
                            animation: `fadeSlideIn 0.3s ease-out ${index * 0.05}s both`,
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-800 text-md">
                                NT$ {income.amount.toLocaleString("zh-TW")}
                              </span>
                              {income.notes && (
                                <span className="text-xs text-gray-500 mt-1">
                                  {income.notes.length > 20 ? `${income.notes.substring(0, 20)}...` : income.notes}
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-medium bg-white px-2 py-1 rounded-md text-gray-600 inline-block">
                                {income.date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-gray-500">
                      <i className="fas fa-search mb-2 text-2xl opacity-30"></i>
                      <p>沒有找到 {selectedCategory} 類別的收入</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-2 sticky bottom-0">
                  <div className="bg-[#F8FBFE] rounded-lg p-3 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-xs text-gray-500">類別總計</span>
                        <h4 className="font-medium text-gray-700">{selectedCategory}</h4>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-xl text-[#4EA8DE]">
                          NT$ {categoryIncomes.reduce((sum, income) => sum + income.amount, 0).toLocaleString("zh-TW")}
                        </span>
                      </div>
                    </div>
                  </div>
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
          <div ref={dailyChartRef} style={{ height: "260px", width: "100%" }} />
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
    </>
  );
};

export default IncomeAnalysis;
