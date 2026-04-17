import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import router from './routes'
import './index.css'
import { getAuth } from 'firebase/auth';
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
window.addEventListener('error', (event) => {
  
  // 儲存當前狀態
  try {
    localStorage.setItem('app_crashed', 'true');
    localStorage.setItem('crash_time', new Date().toISOString());
  } catch (e) {
  }
});

// 處理未處理的Promise錯誤
window.addEventListener('unhandledrejection', (event) => {
});

// 增強數據備份與恢復邏輯
document.addEventListener('DOMContentLoaded', () => {
  const isPageLoad = sessionStorage.getItem('app_loaded');
  
  // 檢查是否是首次加載還是刷新頁面
  if (!isPageLoad) {
    // 首次加載
    sessionStorage.setItem('app_loaded', 'true');
    sessionStorage.setItem('was_refresh', 'false');
  } else {
    // 頁面刷新
    sessionStorage.setItem('was_refresh', 'true');
    
    // 在頁面渲染後觸發數據恢復機制
    setTimeout(() => {
      window.dispatchEvent(new Event('force_data_recovery'));
    }, 500);
  }
});

// 數據備份機制：在頁面關閉或刷新前
window.addEventListener('beforeunload', () => {
  sessionStorage.setItem('was_refresh', 'true');
  
  // 獲取當前用戶ID
  const auth = getAuth();
  const currentUser = auth.currentUser;
  
  if (currentUser && currentUser.uid) {
    const userId = currentUser.uid;
    
    try {
      // 獲取當前最新的支出數據
      const currentExpenses = localStorage.getItem(`expenses_${userId}`);
      
      if (currentExpenses) {
        // 創建一個應急備份
        localStorage.setItem(`last_userState_${userId}`, currentExpenses);
      }
    } catch (error) {
    }
  }
});

// 應用崩潰防護機制
window.addEventListener('error', (event) => {
  
  // 獲取當前用戶ID
  const auth = getAuth();
  const currentUser = auth.currentUser;
  
  if (currentUser && currentUser.uid) {
    try {
      // 標記故障發生
      localStorage.setItem('app_crashed', 'true');
      
      // 觸發額外備份
      const userId = currentUser.uid;
      const currentExpenses = localStorage.getItem(`expenses_${userId}`);
      
      if (currentExpenses) {
        // 創建額外的崩潰備份
        localStorage.setItem(`crash_backup_${userId}`, currentExpenses);
      }
    } catch (error) {
      // 即使這裡出錯也不要阻止應用繼續運行
    }
  }
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

// 檢查頁面加載完成後應用程序是否正確渲染
setTimeout(() => {
  // 檢查是否是從刷新頁面而來
  const isPageRefresh = localStorage.getItem('page_refreshing') === 'true';
  if (isPageRefresh) {
    // 刪除刷新標記
    localStorage.removeItem('page_refreshing');
    
    // 檢查root元素是否有子節點
    const rootElement = document.getElementById('root');
    if (rootElement && (!rootElement.childNodes || rootElement.childNodes.length === 0)) {
      
      // 觸發強制數據恢復
      const event = new CustomEvent('force_data_recovery');
      window.dispatchEvent(event);
      
      // 如果依然無法恢復，則重新加載頁面
      setTimeout(() => {
        const rootElement = document.getElementById('root');
        if (rootElement && (!rootElement.childNodes || rootElement.childNodes.length === 0)) {
          window.location.reload();
        }
      }, 2000);
    }
  }
}, 3000); 