import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import router from './routes'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'

// 導入swiper的樣式
import 'swiper/css'
import 'swiper/css/pagination'
import 'swiper/css/autoplay'

// 導入Font Awesome的樣式
import '@fortawesome/fontawesome-free/css/all.min.css'

// 導入可愛字體
import '@fontsource/nunito'
import '@fontsource/quicksand'

// 全局錯誤處理相關代碼已移至 ./components/ErrorBoundary.tsx
// 這裡刪除舊的ErrorBoundary類，使用從組件導入的版本

// 處理未捕獲的錯誤
window.addEventListener('error', (_event) => {
  // 儲存當前狀態
  try {
    localStorage.setItem('app_crashed', 'true');
    localStorage.setItem('crash_time', new Date().toISOString());
  } catch (_e) { /* noop */ }
});

// 處理未處理的Promise錯誤
window.addEventListener('unhandledrejection', (_event) => {
});

// 安全創建根元素
function createRoot() {
  // 檢查root元素是否存在
  let rootElement = document.getElementById('root');
  
  // 如果不存在，則創建一個
  if (!rootElement) {
    rootElement = document.createElement('div');
    rootElement.id = 'root';
    document.body.appendChild(rootElement);
  }
  
  return ReactDOM.createRoot(rootElement);
}

// 渲染應用程序
const root = createRoot();
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
