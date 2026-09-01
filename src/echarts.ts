// echarts 按需載入：只註冊本專案用到的圖表與元件，
// 避免 `import * as echarts from "echarts"` 把整包（約 1MB）打進 bundle。
// 用法與原本相同：import * as echarts from "./echarts"
// 以 registerEcharts 為別名匯入，避免被 eslint 誤判為 React 的 use() hook
import { use as registerEcharts } from "echarts/core";
import { BarChart, PieChart } from "echarts/charts";
import {
  AxisPointerComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

registerEcharts([
  BarChart,
  PieChart,
  AxisPointerComponent, // tooltip trigger: "axis" 需要
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export * from "echarts/core";
