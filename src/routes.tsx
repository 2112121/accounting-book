import React from 'react';
import { createBrowserRouter } from 'react-router-dom';

// 導入頁面組件
import App from './App';
import IncomePage from './pages/IncomePage';

// 創建路由配置
const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/income',
    element: <IncomePage />,
  },
]);

export default router; 