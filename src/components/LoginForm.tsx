import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FirebaseError } from 'firebase/app';

// Firebase錯誤消息映射
const getFirebaseErrorMessage = (errorCode: string): string => {
  const errorMessages: Record<string, string> = {
    'auth/invalid-email': '無效的電子郵件格式',
    'auth/user-disabled': '此用戶已被停用',
    'auth/user-not-found': '找不到此用戶',
    'auth/wrong-password': '密碼錯誤',
    'auth/email-already-in-use': '此電子郵件已被註冊，請使用其他電子郵件註冊',
    'auth/weak-password': '密碼強度不足',
    'auth/operation-not-allowed': '此操作不被允許',
    'auth/network-request-failed': '網絡請求失敗，請檢查網絡連接',
    'auth/too-many-requests': '操作次數過多，請稍後再試',
    'auth/internal-error': '伺服器內部錯誤',
    'auth/popup-closed-by-user': '彈窗被用戶關閉'
  };
  
  return errorMessages[errorCode] || '登入失敗，請稍後再試';
};

interface LoginFormProps {
  onSuccess: () => void;
  initialMode?: 'login' | 'register';
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, initialMode = 'login' }) => {
  // 使用外部提供的初始狀態或默認為登錄模式
  const [isRegistering, setIsRegistering] = useState(initialMode === 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successfulOperation, setSuccessfulOperation] = useState(false);
  const isSubmittingRef = useRef(false);
  
  // 保存用戶嘗試的操作類型，用於錯誤處理後保持正確狀態
  const [lastOperationType, setLastOperationType] = useState<'login' | 'register'>(initialMode);
  
  const { login, register, loginWithGoogle } = useAuth();

  // 添加調試日誌
  useEffect(() => {
    console.log("%c表單狀態變更為", "color:blue;font-weight:bold", isRegistering ? "註冊模式" : "登入模式");
  }, [isRegistering]);
  
  // 只有在成功操作後才觸發 onSuccess
  useEffect(() => {
    if (successfulOperation) {
      console.log("%c操作成功，觸發 onSuccess 回調", "color:green;font-weight:bold");
      onSuccess();
      // 重置成功標記，防止重複觸發
      setSuccessfulOperation(false);
    }
  }, [successfulOperation, onSuccess]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 防止重複提交
    if (isSubmittingRef.current) {
      console.log("表單正在提交中，阻止重複提交");
      return;
    }
    
    // 保存當前操作類型
    setLastOperationType(isRegistering ? 'register' : 'login');
    
    if (!email || !password) {
      setError('請填寫郵箱和密碼');
      return;
    }
    
    if (isRegistering && !nickname) {
      setError('請填寫暱稱');
      return;
    }
    
    setError('');
    setLoading(true);
    isSubmittingRef.current = true;
    
    try {
      console.log(`%c開始${isRegistering ? '註冊' : '登入'}處理`, "color:blue", `電子郵件: ${email}`);
      
      if (isRegistering) {
        // 註冊新用戶
        try {
          console.log("%c嘗試註冊新用戶...", "color:blue");
          // 將所有可能的錯誤細節記錄下來
          try {
            const result = await register(email, password, nickname);
            console.log("%c註冊成功！", "color:green;font-weight:bold", "結果:", result);
            
            // 註冊成功才清空表單並設置成功標記
            setEmail('');
            setPassword('');
            setNickname('');
            setSuccessfulOperation(true); // 設置成功標記而不是直接調用 onSuccess
          } catch (regErrorInner: any) {
            console.error("%c註冊失敗（內部捕獲）", "color:red;font-weight:bold", regErrorInner);
            // 特別檢查是否是郵件已被使用的錯誤
            if (regErrorInner.code === 'auth/email-already-in-use' || 
                (regErrorInner.message && regErrorInner.message.includes('已被註冊'))) {
              console.warn("%c電子郵件已被註冊", "color:orange;font-weight:bold");
              throw {
                code: 'auth/email-already-in-use',
                message: '此電子郵件已被註冊，請使用其他電子郵件註冊',
                isEmailInUseError: true
              };
            }
            throw regErrorInner; // 其他錯誤直接重新拋出
          }
        } catch (regError: any) {
          console.error("%c註冊失敗（外部捕獲）", "color:red;font-weight:bold", {
            code: regError.code,
            message: regError.message,
            isEmailInUseError: regError.isEmailInUseError,
            stack: regError.stack
          });
          
          // 明確處理電子郵件已被使用的情況
          const isEmailInUse = regError.code === 'auth/email-already-in-use' || 
                               regError.isEmailInUseError || 
                               (regError.message && regError.message.includes('已被註冊'));
          
          if (isEmailInUse) {
            console.log("%c檢測到電子郵件已存在，保持在註冊頁面", "color:orange;font-weight:bold");
            setError('此電子郵件已被註冊，請使用其他電子郵件註冊');
            // 強制保持在註冊狀態，非常重要！
            setIsRegistering(true);
          } else {
            // 其他註冊錯誤
            setError(getFirebaseErrorMessage(regError.code) || '註冊失敗，請稍後再試');
          }
          // 在任何錯誤情況下都不調用 onSuccess
        }
      } else {
        // 登入現有用戶
        try {
          console.log("%c嘗試登入...", "color:blue");
          await login(email, password);
          console.log("%c登入成功！", "color:green;font-weight:bold");
          
          // 登入成功清空表單並設置成功標記
          setEmail('');
          setPassword('');
          setSuccessfulOperation(true); // 設置成功標記而不是直接調用 onSuccess
        } catch (loginError: any) {
          console.error("%c登入失敗", "color:red;font-weight:bold", {
            code: loginError.code,
            message: loginError.message,
            stack: loginError.stack,
            error: loginError
          });
          setError(getFirebaseErrorMessage(loginError.code) || '登入失敗，請稍後再試');
          // 在任何錯誤情況下都不調用 onSuccess
        }
      }
    } catch (err: any) {
      // 這裡處理未在上面捕獲的其他錯誤
      console.error("%c處理過程中發生未預期錯誤", "color:red;font-weight:bold", err);
      
      // 檢查是否是郵件已被使用的錯誤
      const isEmailInUse = err.code === 'auth/email-already-in-use' || 
                           (err.message && err.message.includes('已被註冊'));
      
      if (isEmailInUse) {
        console.log("%c檢測到電子郵件已存在，保持在註冊頁面", "color:orange;font-weight:bold");
        setError('此電子郵件已被註冊，請使用其他電子郵件註冊');
        // 強制保持在註冊狀態
        setIsRegistering(true);
      } else if (!error) {
        setError('操作過程中發生錯誤，請稍後再試');
      }
      // 在任何錯誤情況下都不調用 onSuccess
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };
  
  const handleGoogleLogin = async () => {
    if (isSubmittingRef.current) {
      return;
    }
    
    try {
      setError('');
      setLoading(true);
      isSubmittingRef.current = true;
      
      console.log("%c嘗試使用Google登入...", "color:blue");
      await loginWithGoogle();
      console.log("%c Google登入成功！", "color:green;font-weight:bold");
      setSuccessfulOperation(true); // 設置成功標記而不是直接調用 onSuccess
    } catch (err: any) {
      console.error("%cGoogle登入失敗", "color:red;font-weight:bold", err);
      setError(err.message || 'Google 登入失敗，請稍後再試');
      // 在任何錯誤情況下都不調用 onSuccess
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };
  
  // 切換註冊/登錄模式
  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError(''); // 清除之前的錯誤
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-center mb-6 text-[#A487C3]">
        {isRegistering ? '註冊帳號' : '登入帳號'}
      </h2>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[#2E2E2E] mb-1">
            電子郵件
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C6B2DD] focus:border-[#A487C3] transition-all duration-300"
            placeholder="請輸入電子郵件"
          />
        </div>
        
        {isRegistering && (
          <div>
            <label htmlFor="nickname" className="block text-sm font-medium text-[#2E2E2E] mb-1">
              暱稱
            </label>
            <input
              type="text"
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C6B2DD] focus:border-[#A487C3] transition-all duration-300"
              placeholder="請輸入您的暱稱"
            />
          </div>
        )}
        
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[#2E2E2E] mb-1">
            密碼
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C6B2DD] focus:border-[#A487C3] transition-all duration-300"
            placeholder="請輸入密碼"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-gradient-to-r from-[#A487C3] to-[#C6B2DD] hover:from-[#9678B6] hover:to-[#B9A0D5] text-white rounded-lg font-medium transition-all duration-300 shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (isRegistering ? '註冊中...' : '登入中...') : (isRegistering ? '註冊' : '登入')}
        </button>
        
        <div className="relative my-4 flex items-center gap-4">
          <div className="flex-grow h-px bg-gradient-to-r from-gray-200 via-[#FFF3E0] to-gray-200"></div>
          <span className="text-sm text-gray-400">或</span>
          <div className="flex-grow h-px bg-gradient-to-r from-gray-200 via-[#FFF3E0] to-gray-200"></div>
        </div>
        
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-2 px-4 rounded-lg bg-white border border-gray-300 text-[#2E2E2E] font-medium flex items-center justify-center gap-2 hover:bg-gray-50 hover:shadow-sm transition-all duration-300"
        >
          <i className="fab fa-google text-[#A487C3]"></i>
          <span>使用 Google 帳號{isRegistering ? '註冊' : '登入'}</span>
        </button>
        
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={toggleMode}
            className="w-full py-2 px-4 text-[#2E2E2E] hover:text-[#A487C3] bg-white hover:bg-white border border-[#E5E5E5] rounded-lg font-medium transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:bg-white"
          >
            {isRegistering ? '已有帳號？點此登入' : '沒有帳號？點此註冊'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default LoginForm; 