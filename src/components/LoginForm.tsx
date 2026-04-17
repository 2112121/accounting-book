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
  const [, setLastOperationType] = useState<'login' | 'register'>(initialMode);

  const { login, register, loginWithGoogle } = useAuth();

  // 添加調試日誌
  useEffect(() => {
  }, [isRegistering]);
  
  // 只有在成功操作後才觸發 onSuccess
  useEffect(() => {
    if (successfulOperation) {
      onSuccess();
      // 重置成功標記，防止重複觸發
      setSuccessfulOperation(false);
    }
  }, [successfulOperation, onSuccess]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 防止重複提交
    if (isSubmittingRef.current) {
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
      
      if (isRegistering) {
        // 註冊新用戶
        try {
          // 將所有可能的錯誤細節記錄下來
          try {
            const result = await register(email, password, nickname);
            
            // 註冊成功才清空表單並設置成功標記
            setEmail('');
            setPassword('');
            setNickname('');
            setSuccessfulOperation(true); // 設置成功標記而不是直接調用 onSuccess
          } catch (regErrorInner: any) {
            // 特別檢查是否是郵件已被使用的錯誤
            if (regErrorInner.code === 'auth/email-already-in-use' || 
                (regErrorInner.message && regErrorInner.message.includes('已被註冊'))) {
              throw {
                code: 'auth/email-already-in-use',
                message: '此電子郵件已被註冊，請使用其他電子郵件註冊',
                isEmailInUseError: true
              };
            }
            throw regErrorInner; // 其他錯誤直接重新拋出
          }
        } catch (regError: any) {
          // 明確處理電子郵件已被使用的情況
          const isEmailInUse = regError.code === 'auth/email-already-in-use' || 
                               regError.isEmailInUseError || 
                               (regError.message && regError.message.includes('已被註冊'));
          
          if (isEmailInUse) {
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
          await login(email, password);
          
          // 登入成功清空表單並設置成功標記
          setEmail('');
          setPassword('');
          setSuccessfulOperation(true); // 設置成功標記而不是直接調用 onSuccess
        } catch (loginError: any) {
          setError(getFirebaseErrorMessage(loginError.code) || '登入失敗，請稍後再試');
          // 在任何錯誤情況下都不調用 onSuccess
        }
      }
    } catch (err: any) {
      // 這裡處理未在上面捕獲的其他錯誤
      
      // 檢查是否是郵件已被使用的錯誤
      const isEmailInUse = err.code === 'auth/email-already-in-use' || 
                           (err.message && err.message.includes('已被註冊'));
      
      if (isEmailInUse) {
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
      
      await loginWithGoogle();
      setSuccessfulOperation(true); // 設置成功標記而不是直接調用 onSuccess
    } catch (err: any) {
      
      // 特別處理用戶關閉彈窗的情況
      if (err.code === 'auth/popup-closed-by-user') {
        setError('登入視窗已被關閉，請再次嘗試登入');
      } else {
        setError(err.message || 'Google 登入失敗，請稍後再試');
      }
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
        
        <div className="text-center mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center">
              <button
                type="button"
                onClick={toggleMode}
                className="inline-flex items-center px-6 py-2 bg-white text-sm font-medium text-[#A487C3] hover:text-[#8A5DC8] border border-[#E5E5E5] hover:border-[#C6B2DD] rounded-full transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#FFF3E0] transform hover:-translate-y-0.5"
                style={{animation: 'pulseScale 2s infinite'}}
              >
                <span className="relative z-10">
                  {isRegistering ? (
                    <>
                      <i className="fas fa-arrow-left mr-2 text-xs"></i>
                      已有帳號？點此登入
                    </>
                  ) : (
                    <>
                      沒有帳號？點此註冊
                      <i className="fas fa-arrow-right ml-2 text-xs"></i>
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default LoginForm; 