import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { getAuth, onAuthStateChanged } from 'firebase/auth';
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
  console.error('全局錯誤:', event.error);
  
  // 儲存當前狀態
  try {
    localStorage.setItem('app_crashed', 'true');
    localStorage.setItem('crash_time', new Date().toISOString());
  } catch (e) {
    console.error("無法存儲崩潰標記:", e);
  }
});

// 處理未處理的Promise錯誤
window.addEventListener('unhandledrejection', (event) => {
  console.error('未處理的Promise錯誤:', event.reason);
});

// 增強數據備份與恢復邏輯
document.addEventListener('DOMContentLoaded', () => {
  const isPageLoad = sessionStorage.getItem('app_loaded');
  
  // 檢查是否是首次加載還是刷新頁面
  if (!isPageLoad) {
    // 首次加載
    sessionStorage.setItem('app_loaded', 'true');
    sessionStorage.setItem('was_refresh', 'false');
    console.log('應用程序初次加載');
  } else {
    // 頁面刷新
    console.log('檢測到頁面刷新');
    sessionStorage.setItem('was_refresh', 'true');
    
    // 在頁面渲染後觸發數據恢復機制
    setTimeout(() => {
      console.log('觸發數據恢復機制');
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
        console.log('已創建緊急數據備份');
      }
    } catch (error) {
      console.error('數據備份失敗:', error);
    }
  }
});

// 應用崩潰防護機制
window.addEventListener('error', (event) => {
  console.error('應用崩潰:', event);
  
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
        console.log('已創建崩潰時數據備份');
      }
    } catch (error) {
      // 即使這裡出錯也不要阻止應用繼續運行
      console.error('崩潰備份失敗:', error);
    }
  }
});

// 安全創建根元素
function createRoot() {
  // 檢查root元素是否存在
  let rootElement = document.getElementById('root');
  
  // 如果不存在，則創建一個
  if (!rootElement) {
    console.warn('Root元素不存在，創建新的根元素');
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
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// 檢查頁面加載完成後應用程序是否正確渲染
setTimeout(() => {
  // 檢查是否是從刷新頁面而來
  const isPageRefresh = localStorage.getItem('page_refreshing') === 'true';
  if (isPageRefresh) {
    console.log('檢測到頁面通過瀏覽器刷新重新加載');
    // 刪除刷新標記
    localStorage.removeItem('page_refreshing');
    
    // 檢查root元素是否有子節點
    const rootElement = document.getElementById('root');
    if (rootElement && (!rootElement.childNodes || rootElement.childNodes.length === 0)) {
      console.error('頁面刷新後根元素沒有子節點，可能渲染失敗');
      
      // 觸發強制數據恢復
      const event = new CustomEvent('force_data_recovery');
      window.dispatchEvent(event);
      
      // 如果依然無法恢復，則重新加載頁面
      setTimeout(() => {
        const rootElement = document.getElementById('root');
        if (rootElement && (!rootElement.childNodes || rootElement.childNodes.length === 0)) {
          console.error('強制數據恢復後仍然無法渲染，重新加載頁面');
          window.location.reload();
        }
      }, 2000);
    }
  }
}, 3000); 