import React from 'react';
import { createBrowserRouter } from 'react-router-dom';

// 導入頁面組件
import App from './App';

// 創建路由配置
// 收入功能已整合進主頁 App，/income 獨立頁已移除（IncomePage.tsx 保留為備份）
const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
]);

export default router; 