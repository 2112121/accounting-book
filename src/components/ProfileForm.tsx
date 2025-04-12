import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GoogleAuthProvider } from '../firebase';

interface ProfileFormProps {
  onClose: () => void;
}

const ProfileForm: React.FC<ProfileFormProps> = ({ onClose }) => {
  const { currentUser, userNickname, userProfileColor, updateUserNickname, updateUserPassword, updateUserProfileColor } = useAuth();
  const [nickname, setNickname] = useState(userNickname || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [useColorAvatar, setUseColorAvatar] = useState(!!userProfileColor);
  const [profileColor, setProfileColor] = useState(userProfileColor || '#A487C3');
  
  // 判斷是否為Google登錄
  const isGoogleUser = (): boolean => {
    if (!currentUser) return false;
    return currentUser.providerData.some(
      provider => provider.providerId === GoogleAuthProvider.PROVIDER_ID
    );
  };
  
  useEffect(() => {
    // 初始化暱稱
    if (userNickname) {
      setNickname(userNickname);
    } else if (currentUser && currentUser.email) {
      setNickname(currentUser.email.split('@')[0]);
    }
    
    // 初始化頭像顏色設置
    if (userProfileColor) {
      setProfileColor(userProfileColor);
      setUseColorAvatar(true);
    }
  }, [currentUser, userNickname, userProfileColor]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 驗證輸入
    if (!nickname.trim()) {
      setError('暱稱不能為空');
      return;
    }
    
    if (showPasswordChange) {
      if (!currentPassword) {
        setError('請輸入當前密碼');
        return;
      }
      
      if (password.length < 6) {
        setError('新密碼長度必須至少為6個字符');
        return;
      }
      
      if (password !== confirmPassword) {
        setError('兩次輸入的密碼不一致');
        return;
      }
    }
    
    setError('');
    setLoading(true);
    
    try {
      // 更新暱稱
      if (nickname !== userNickname) {
        await updateUserNickname(nickname);
      }
      
      // 更新頭像顏色
      if (useColorAvatar && profileColor !== userProfileColor) {
        await updateUserProfileColor(profileColor);
      } else if (!useColorAvatar && userProfileColor) {
        // 如果取消使用顏色頭像，則發送請求取消顏色頭像
        await updateUserProfileColor(null);
      }
      
      // 更新密碼
      if (showPasswordChange && currentPassword && password && !isGoogleUser()) {
        await updateUserPassword(currentPassword, password);
        // 清空密碼字段
        setCurrentPassword('');
        setPassword('');
        setConfirmPassword('');
        setShowPasswordChange(false);
      }
      
      setSuccess('個人資料已更新');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('更新失敗:', err);
      if (err.code === 'auth/wrong-password') {
        setError('當前密碼不正確');
      } else {
        setError('更新個人資料失敗: ' + (err.message || '未知錯誤'));
      }
    } finally {
      setLoading(false);
    }
  };
  
  // 處理顏色變更
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileColor(e.target.value);
  };
  
  // 處理使用顏色頭像的切換
  const handleUseColorAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    setUseColorAvatar(isChecked);
    
    // 如果關閉了顏色頭像，則發送請求取消顏色頭像設置
    if (!isChecked && userProfileColor) {
      try {
        setLoading(true);
        await updateUserProfileColor(null);
        setSuccess('已取消顏色頭像');
        setTimeout(() => setSuccess(''), 3000);
      } catch (err: any) {
        setError('取消顏色頭像失敗: ' + (err.message || '未知錯誤'));
      } finally {
        setLoading(false);
      }
    }
  };
  
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[#A487C3]">個人資料設置</h2>
        <button 
          onClick={onClose}
          className="text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="關閉表單"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm">
          {success}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 用戶頭像顯示區域 */}
        <div className="flex flex-col items-center mb-6">
          <div 
            className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden mb-2 border-4 border-white shadow-md"
            style={{ 
              backgroundColor: useColorAvatar ? profileColor : '#A487C3',
              background: useColorAvatar ? profileColor : '#A487C3'
            }}
          >
            {!useColorAvatar && currentUser && currentUser.photoURL ? (
              <img 
                src={currentUser.photoURL} 
                alt="用戶頭像" 
                className="w-full h-full object-cover"
              />
            ) : (
              <i className="fas fa-user text-4xl text-white"></i>
            )}
          </div>
          
          {/* 頭像顏色選擇器 */}
          <div className="mt-3 flex flex-col items-center">
            <div className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                id="useColorAvatar"
                checked={useColorAvatar}
                onChange={handleUseColorAvatarChange}
                className="rounded text-[#A487C3] focus:ring-[#A487C3]"
              />
              <label htmlFor="useColorAvatar" className="text-sm font-medium text-[#2E2E2E]">
                使用顏色作為頭像
              </label>
            </div>
            
            {useColorAvatar && (
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  id="profileColor"
                  value={profileColor}
                  onChange={handleColorChange}
                  className="w-8 h-8 p-0 border-0 rounded overflow-hidden cursor-pointer"
                />
                <span className="text-xs text-gray-500">{profileColor}</span>
              </div>
            )}
            
            <p className="text-xs text-[#6E6E6E] mt-1">
              {useColorAvatar ? '使用顏色作為頭像' : '系統頭像'}
            </p>
          </div>
        </div>
        
        {/* 暱稱輸入 */}
        <div>
          <label htmlFor="nickname" className="block text-sm font-medium text-[#2E2E2E] mb-1">
            暱稱
          </label>
          <input
            type="text"
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C6B2DD] focus:border-[#A487C3] transition-all duration-300"
            placeholder="請輸入您的暱稱"
          />
          <p className="text-xs text-[#6E6E6E] mt-1">
            您的暱稱將顯示在應用程序中
          </p>
        </div>
        
        {/* 摺疊的密碼修改部分 - 只對非Google登錄用戶顯示 */}
        {!isGoogleUser() && (
          <div className="border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setShowPasswordChange(!showPasswordChange)}
              className="bg-[#A487C3] hover:bg-[#9678B6] text-white px-3 py-1 rounded-lg flex items-center shadow-sm hover:shadow-md transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white"
            >
              <i className={`fas fa-chevron-${showPasswordChange ? 'down' : 'right'} mr-2`}></i>
              修改密碼
            </button>
            
            {showPasswordChange && (
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-[#2E2E2E] mb-1">
                    當前密碼
                  </label>
                  <input
                    type="password"
                    id="currentPassword"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C6B2DD] focus:border-[#A487C3] transition-all duration-300"
                    placeholder="請輸入當前密碼"
                  />
                </div>
                
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-[#2E2E2E] mb-1">
                    新密碼
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C6B2DD] focus:border-[#A487C3] transition-all duration-300"
                    placeholder="請輸入新密碼"
                  />
                </div>
                
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#2E2E2E] mb-1">
                    確認新密碼
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C6B2DD] focus:border-[#A487C3] transition-all duration-300"
                    placeholder="請再次輸入新密碼"
                  />
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* 按鈕區域 */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white"
            disabled={loading}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2 px-4 bg-[#A487C3] hover:bg-[#9678B6] text-white rounded-lg font-medium transition-all duration-300 shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-white"
          >
            {loading ? '保存中...' : '保存修改'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfileForm; 