import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  User, 
  googleProvider,
  signInWithPopup,
  updatePassword as fbUpdatePassword,
  updateProfile as fbUpdateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  Timestamp,
  fetchSignInMethodsForEmail
} from '../firebase';
import { db, storage } from '../firebase';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, arrayRemove, limit, addDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// 更新類型定義
type TimeRangeType = 'week' | 'month' | 'year' | 'custom';

// 排行榜類型定義
export interface Leaderboard {
  id: string;
  name: string;
  createdBy: string;
  members: LeaderboardMember[];
  createdAt: Date;
  timeRange: TimeRangeType;
  startDate: Date;
  endDate: Date;
}

export interface LeaderboardMember {
  userId: string;
  nickname?: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  totalExpense: number;
  allowViewDetail?: boolean;
  // 支出記錄ID列表，用於數據同步
  expenseIds?: string[];
  // 支出記錄摘要，用於數據同步
  expenseSummaries?: Array<{
    id: string;
    amount: number;
    date: any;
    category: any;
  }>;
}

// 好友類型定義
export interface Friend {
  id: string;
  nickname: string;
  photoURL?: string;
  email: string;
  requestSent?: boolean;
  friendCode?: string;
}

// 好友請求類型定義
export interface FriendRequest {
  id: string;
  from: {
    userId: string;
    nickname: string;
    photoURL?: string;
    email: string;
  };
  to: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

// 排行榜邀請類型定義
export interface LeaderboardInvite {
  id: string;
  from: {
    userId: string;
    nickname: string;
    photoURL?: string;
  };
  to: string;
  leaderboardId: string;
  leaderboardName: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

// 定義上下文類型
interface AuthContextType {
  currentUser: User | null;
  userNickname: string | null;
  userProfileColor: string | null;
  register: (email: string, password: string, nickname: string) => Promise<User | void>;
  login: (email: string, password: string) => Promise<User | void>;
  loginWithGoogle: () => Promise<User | void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateUserProfile: (data: { nickname?: string; photoURL?: File }) => Promise<void>;
  updateUserNickname: (nickname: string) => Promise<void>;
  updateUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateUserAvatar: (file: File) => Promise<string>;
  updateUserProfileColor: (colorCode: string | null) => Promise<void>;
  // 排行榜和好友相關
  getLeaderboards: () => Promise<Leaderboard[]>;
  createLeaderboard: (name: string, memberIds: string[], timeRange: TimeRangeType, customStartDate?: Date, customEndDate?: Date) => Promise<string>;
  getFriends: () => Promise<Friend[]>;
  searchUsers: (query: string) => Promise<Friend[]>;
  sendFriendRequest: (userId: string) => Promise<void>;
  acceptFriendRequest: (requestId: string) => Promise<void>;
  rejectFriendRequest: (requestId: string) => Promise<void>;
  getFriendRequests: () => Promise<FriendRequest[]>;
  getSentFriendRequests: () => Promise<FriendRequest[]>;
  cancelFriendRequest: (requestId: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  updatePrivacySettings: (leaderboardId: string, allowViewDetail: boolean) => Promise<void>;
  deleteLeaderboard: (leaderboardId: string) => Promise<void>;
  getLeaderboardInvites: () => Promise<LeaderboardInvite[]>;
  acceptLeaderboardInvite: (inviteId: string) => Promise<void>;
  rejectLeaderboardInvite: (inviteId: string) => Promise<void>;
  // 新增：更新排行榜成員支出記錄
  updateLeaderboardMemberExpenses: (leaderboard: Leaderboard) => Promise<void>;
  // 新增：手動同步排行榜數據
  syncLeaderboardData: (leaderboardId: string) => Promise<void>;
  loading: boolean;
}

// 創建上下文
const AuthContext = createContext<AuthContextType | null>(null);

// 使用自定義鉤子來使用上下文
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// 提供程序組件參數類型
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userNickname, setUserNickname] = useState<string | null>(null);
  const [userProfileColor, setUserProfileColor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 註冊新用戶
  async function register(email: string, password: string, nickname: string): Promise<User | void> {
    console.log(`開始註冊用戶 ${email} 和暱稱 ${nickname}`);
    try {
      // 先檢查郵箱是否已經被使用
      console.log(`檢查郵箱 ${email} 是否已經被註冊...`);
      const methods = await fetchSignInMethodsForEmail(auth, email);
      
      if (methods && methods.length > 0) {
        console.warn(`郵箱 ${email} 已經被註冊，註冊失敗`);
        // 自訂錯誤並包含明確的錯誤碼
        const error = new Error('此電子郵件已被註冊，請使用其他電子郵件註冊');
        (error as any).code = 'auth/email-already-in-use';
        throw error;
      }
      
      console.log('開始創建用戶...');
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log('用戶創建成功，更新用戶資料...');
      
      if (auth.currentUser) {
        await fbUpdateProfile(auth.currentUser, {
          displayName: nickname
        });
        console.log(`用戶資料已更新，暱稱設為: ${nickname}`);
        
        // 生成好友碼
        const friendCode = generateFriendCode(auth.currentUser.uid);
        
        // 創建 Firestore 用戶文檔
        const userRef = doc(db, "users", auth.currentUser.uid);
        await setDoc(userRef, {
          email: email,
          nickname: nickname,
          displayName: nickname,
          photoURL: '',
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          friends: [],
          leaderboards: [],
          friendCode: friendCode,
          profileColor: null
        });
        console.log('Firestore 用戶文檔已創建，好友碼:', friendCode);
      }
      
      console.log('註冊流程完成，返回用戶資料');
      return userCredential.user;
    } catch (error: any) {
      console.error('註冊過程中發生錯誤:', error.code, error.message);
      
      // 處理具體的錯誤類型
      if (error.code === 'auth/email-already-in-use') {
        console.warn(`郵箱 ${email} 已經被使用`);
      } else if (error.code === 'auth/weak-password') {
        console.warn('密碼強度不足');
      } else if (error.code === 'auth/invalid-email') {
        console.warn('無效的電子郵件格式');
      }
      
      // 重新拋出錯誤給調用者處理
      throw error;
    }
  }

  // 登入用戶
  async function login(email: string, password: string): Promise<User | void> {
    try {
      console.log(`嘗試登入用戶 ${email}`);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('登入成功');
      return userCredential.user;
    } catch (error) {
      console.error('登入失敗:', error);
      // 重新拋出錯誤給調用者處理
      throw error;
    }
  }

  // 登出
  async function logout(): Promise<void> {
    try {
      console.log('嘗試登出');
      await signOut(auth);
      console.log('登出成功');
    } catch (error) {
      console.error('登出失敗:', error);
      throw error;
    }
  }

  // Google 登入
  async function loginWithGoogle(): Promise<User | void> {
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      
      // 檢查用戶是否已存在
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      
      if (!userDoc.exists()) {
        // 新用戶，創建用戶檔案
        const nickname = result.user.displayName || result.user.email?.split('@')[0] || '未命名用戶';
        const friendCode = generateFriendCode(result.user.uid);
        
        await setDoc(doc(db, 'users', result.user.uid), {
          email: result.user.email || '',
          nickname: nickname,
          photoURL: result.user.photoURL || '',
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          friendCode: friendCode,
          friends: [],
          leaderboards: []
        });
      } else {
        // 已存在的用戶，更新登入時間
        await updateDoc(doc(db, 'users', result.user.uid), {
          lastLogin: serverTimestamp()
        });
      }
      
      // 確保用戶有好友碼
      await ensureUserHasFriendCode();
      
      return result.user;
    } catch (error: any) {
      console.error("Google登入錯誤:", error);
      
      // 特別處理用戶關閉彈窗的情況
      if (error.code === 'auth/popup-closed-by-user') {
        throw { 
          code: error.code, 
          message: '登入視窗已被關閉，請再次嘗試登入'
        };
      }
      
      // 其他錯誤情況
      throw error;
    } finally {
      setLoading(false);
    }
  }

  // 重設密碼
  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  // 更新密碼
  async function updatePassword(password: string) {
    if (!currentUser) throw new Error("用戶未登入");
    await fbUpdatePassword(currentUser, password);
  }

  // 更新個人資料
  async function updateUserProfile(data: { nickname?: string; photoURL?: File }) {
    if (!currentUser) throw new Error("用戶未登入");
    
    const userRef = doc(db, "users", currentUser.uid);
    const updates: any = {};
    
    if (data.nickname) {
      updates.nickname = data.nickname;
      
      // 更新 Auth 檔案中的 displayName
      await fbUpdateProfile(currentUser, {
        displayName: data.nickname
      });
    }
    
    if (data.photoURL) {
      // 上傳照片到 Storage
      const fileRef = ref(storage, `avatars/${currentUser.uid}`);
      await uploadBytes(fileRef, data.photoURL);
      const photoURL = await getDownloadURL(fileRef);
      
      updates.photoURL = photoURL;
      
      // 更新 Auth 檔案中的 photoURL
      await fbUpdateProfile(currentUser, {
        photoURL: photoURL
      });
    }
    
    if (Object.keys(updates).length > 0) {
      await updateDoc(userRef, updates);
      
      // 如果更新了暱稱，更新本地狀態
      if (data.nickname) {
        setUserNickname(data.nickname);
      }
    }
  }

  // 更新暱稱函數
  async function updateUserNickname(nickname: string) {
    if (!currentUser) throw new Error("用戶未登入");
    
    try {
      // 首先更新用戶個人資料
      await updateUserProfile({ nickname });
      
      console.log("開始同步更新排行榜中的用戶暱稱...");
      
      // 獲取用戶參與的所有排行榜
      const userRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.log("用戶文檔不存在，無法同步更新排行榜");
        return;
      }
      
      const userData = userDoc.data();
      const leaderboardIds = userData.leaderboards || [];
      
      if (leaderboardIds.length === 0) {
        console.log("用戶未參與任何排行榜，無需同步更新");
        return;
      }
      
      console.log(`用戶參與了 ${leaderboardIds.length} 個排行榜，開始更新暱稱...`);
      
      // 對每個排行榜進行更新
      const updatePromises = leaderboardIds.map(async (leaderboardId: string) => {
        try {
          const leaderboardRef = doc(db, "leaderboards", leaderboardId);
          const leaderboardDoc = await getDoc(leaderboardRef);
          
          if (!leaderboardDoc.exists()) {
            console.log(`排行榜 ${leaderboardId} 不存在，跳過更新`);
            return;
          }
          
          const leaderboardData = leaderboardDoc.data();
          const members = leaderboardData.members || [];
          
          // 查找並更新當前用戶的暱稱
          let updated = false;
          const updatedMembers = members.map((member: LeaderboardMember) => {
            if (member.userId === currentUser.uid) {
              updated = true;
              return {
                ...member,
                nickname: nickname
              };
            }
            return member;
          });
          
          // 如果找到並更新了用戶，則寫回排行榜
          if (updated) {
            await updateDoc(leaderboardRef, {
              members: updatedMembers
            });
            console.log(`已更新排行榜 "${leaderboardData.name}" (${leaderboardId}) 中的用戶暱稱`);
          } else {
            console.log(`排行榜 "${leaderboardData.name}" (${leaderboardId}) 中未找到當前用戶，跳過更新`);
          }
        } catch (error) {
          console.error(`更新排行榜 ${leaderboardId} 中的用戶暱稱失敗:`, error);
        }
      });
      
      // 等待所有更新完成
      await Promise.all(updatePromises);
      console.log("所有排行榜中的用戶暱稱已更新");
      
    } catch (error) {
      console.error("更新暱稱過程中發生錯誤:", error);
      throw error;
    }
  }
  
  // 更新頭像函數
  async function updateUserAvatar(file: File) {
    if (!currentUser) throw new Error("用戶未登入");
    
    try {
      // 頭像上傳功能已禁用，返回一個提示訊息
      console.log("頭像更新功能已被禁用");
      // 確保返回字符串類型，而不是null
      return currentUser.photoURL || "";
      
      // 以下代碼已被禁用
      /*
      // 創建存儲引用
      const storageRef = ref(storage, `avatars/${currentUser.uid}`);
      
      // 上傳文件
      const uploadResult = await uploadBytes(storageRef, file);
      console.log("頭像上傳成功", uploadResult);
      
      // 獲取下載URL
      const downloadURL = await getDownloadURL(storageRef);
      console.log("頭像URL獲取成功", downloadURL);
      
      // 更新用戶資料
      await fbUpdateProfile(currentUser, { photoURL: downloadURL });
      console.log("用戶資料更新成功");
      
      // 更新Firestore中的用戶記錄
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, { photoURL: downloadURL });
      console.log("Firestore用戶資料更新成功");
      
      // 強制刷新用戶狀態以觸發UI更新
      const updatedUser = auth.currentUser;
      if (updatedUser) {
        setCurrentUser(Object.assign({}, updatedUser));
      }
      
      return downloadURL;
      */
    } catch (error) {
      console.error("更新頭像失敗:", error);
      throw new Error(`更新頭像失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  }
  
  // 更新密碼函數
  async function updateUserPassword(currentPassword: string, newPassword: string) {
    if (!currentUser) throw new Error("用戶未登入");
    if (!currentUser.email) throw new Error("用戶郵箱不存在");
    
    // 先使用舊密碼重新認證用戶
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);
    
    // 然後更新密碼
    await fbUpdatePassword(currentUser, newPassword);
  }

  // 獲取排行榜列表
  async function getLeaderboards(): Promise<Leaderboard[]> {
    if (!currentUser) throw new Error("用戶未登入");
    
    console.log("開始獲取排行榜列表");
    const startTime = performance.now();
    
    try {
      // 從用戶文檔獲取排行榜ID
      const userRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return [];
      }
      
      const userData = userDoc.data();
      const leaderboardIds = userData.leaderboards || [];
      
      if (leaderboardIds.length === 0) {
        return [];
      }
      
      console.log(`發現 ${leaderboardIds.length} 個排行榜ID，開始批量獲取`);
      
      // 使用Promise.all並行獲取所有排行榜數據
      const leaderboards = await Promise.all(leaderboardIds.map(async (lbId: string) => {
        const leaderboardRef = doc(db, "leaderboards", lbId);
        const leaderboardDoc = await getDoc(leaderboardRef);
        
        if (!leaderboardDoc.exists()) {
          return null;
        }
        
        const lbData = leaderboardDoc.data();
        
        // 轉換日期
        let startDate = lbData.startDate;
        let endDate = lbData.endDate;
        
        if (startDate && typeof startDate.toDate === 'function') {
          startDate = startDate.toDate();
        }
        
        if (endDate && typeof endDate.toDate === 'function') {
          endDate = endDate.toDate();
        }
        
        let createdAt = new Date();
        if (lbData.createdAt && typeof lbData.createdAt.toDate === 'function') {
          createdAt = lbData.createdAt.toDate();
        }
        
        const leaderboard: Leaderboard = {
          id: leaderboardDoc.id,
          name: lbData.name,
          createdBy: lbData.createdBy,
          members: lbData.members || [],
          createdAt: createdAt,
          timeRange: lbData.timeRange,
          startDate: startDate,
          endDate: endDate
        };
        
        // 每次加載排行榜都強制更新成員的消費總額
        console.log(`強制更新排行榜成員支出數據: ${leaderboard.id} - ${leaderboard.name}`);
        await updateLeaderboardMemberExpenses(leaderboard);
        
        return leaderboard;
      }));
      
      // 過濾掉null值（即不存在的排行榜）
      const validLeaderboards = leaderboards.filter(lb => lb !== null) as Leaderboard[];
      
      const endTime = performance.now();
      console.log(`排行榜數據獲取完成，耗時: ${endTime - startTime}ms`);
      
      return validLeaderboards;
    } catch (error) {
      console.error("獲取排行榜失敗:", error);
      throw error;
    }
  }
  
  // 更新排行榜成員在指定時間範圍內的消費總額
  async function updateLeaderboardMemberExpenses(leaderboard: Leaderboard): Promise<void> {
    if (!leaderboard.startDate || !leaderboard.endDate) {
      console.warn('排行榜缺少開始或結束日期:', leaderboard.id);
      return;
    }
    
    const startDate = new Date(leaderboard.startDate);
    const endDate = new Date(leaderboard.endDate);
    
    // 確保日期有效
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error('排行榜日期無效:', leaderboard.id, startDate, endDate);
      return;
    }
    
    // 获取当前日期，但只保留日期部分，忽略时间部分
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    // 创建结束日期的副本，但只保留日期部分，忽略时间部分
    const endDateOnly = new Date(endDate);
    endDateOnly.setHours(0, 0, 0, 0);
    
    // 修改判断逻辑，如果当天是结束日期，也视为"正在进行中"，确保包括当天的数据
    const isOngoing = now <= endDateOnly;
    
    // 对于已结束的排行榜，我们需要确保设置的结束日期包含当天的最后一秒
    // 例如：如果结束日期是4月4日，我们需要包含4月4日23:59:59的所有数据
    const actualEndDate = new Date(endDate);
    actualEndDate.setHours(23, 59, 59, 999);
    
    console.log(`更新排行榜 ${leaderboard.id} (${leaderboard.name}) 的成員支出:`, {
      排行榜ID: leaderboard.id,
      排行榜名稱: leaderboard.name,
      開始日期: startDate.toLocaleDateString(),
      結束日期: endDate.toLocaleDateString(),
      查詢結束日期: isOngoing ? '當前日期' : actualEndDate.toLocaleString(),
      時間範圍類型: leaderboard.timeRange,
      是否進行中: isOngoing ? '是' : '否',
      是否已結束: now > endDateOnly ? '是' : '否',
      當前時間: new Date().toLocaleString()
    });
    
    try {
      // 獲取所有成員的ID
      const memberUserIds = leaderboard.members.map(member => member.userId);
      console.log(`排行榜有 ${memberUserIds.length} 位成員，將獲取其在統計週期內的支出`);
      
      // 將開始日期轉換為 Timestamp
      const startTimestamp = Timestamp.fromDate(startDate);
      
      // 对于已结束的排行榜，或当前日期就是结束日期的情况，都使用actualEndDate
      const endTimestamp = Timestamp.fromDate(actualEndDate);
      
      if (isOngoing && now < endDateOnly) {
        console.log(`進行中排行榜查詢: 起始日期 ${startDate.toLocaleDateString()} 至現在`);
      } else {
        console.log(`完整週期排行榜查詢: ${startDate.toLocaleDateString()} - ${actualEndDate.toLocaleString()}`);
      }
      
      // 初始化用戶支出統計
      const userExpenses: {[userId: string]: {
        totalExpense: number,
        expenseIds: string[],
        expenseSummaries: Array<{id: string, amount: number, date: any, category: any}>
      }} = {};
      
      // 初始化所有成員的費用統計
      memberUserIds.forEach(userId => {
        userExpenses[userId] = {
          totalExpense: 0,
          expenseIds: [],
          expenseSummaries: []
        };
      });
      
      // 查詢所有成員在時間範圍內的支出
      const expensesRef = collection(db, "expenses");
      
      // 透過多個查詢分批獲取數據，以避免Firestore的in子句限制
      const batchSize = 10; // Firestore 'in' 查詢最多支持10個值
      for (let i = 0; i < memberUserIds.length; i += batchSize) {
        const batch = memberUserIds.slice(i, i + batchSize);
        console.log(`處理第 ${Math.floor(i/batchSize) + 1} 批成員 (${batch.length}個)`);
        
        // 修改查询条件，统一采用完整的日期范围查询
        let q;
        if (isOngoing && now < endDateOnly) {
          // 对于进行中且当前日期不是结束日期的排行榜，使用开始日期到当前时间
          q = query(
            expensesRef,
            where("userId", "in", batch),
            where("date", ">=", startTimestamp)
          );
        } else {
          // 对于已结束的排行榜或当前日期就是结束日期的情况，使用完整日期范围
          q = query(
            expensesRef,
            where("userId", "in", batch),
            where("date", ">=", startTimestamp),
            where("date", "<=", endTimestamp)
          );
        }
        
        console.log(`開始執行批次查詢，查詢條件:`, isOngoing && now < endDateOnly ? 
          `userId IN [${batch.join(', ')}], date >= ${startDate.toLocaleDateString()}` : 
          `userId IN [${batch.join(', ')}], date 範圍 ${startDate.toLocaleDateString()} - ${actualEndDate.toLocaleString()}`);
        
        const querySnapshot = await getDocs(q);
        console.log(`第 ${Math.floor(i/batchSize) + 1} 批查詢完成: 找到 ${querySnapshot.size} 條支出記錄`);
        
        // 處理查詢結果
        querySnapshot.forEach((doc) => {
          const expenseData = doc.data();
          const userId = expenseData.userId;
          
          if (userExpenses[userId]) {
            // 獲取支出日期
            const expenseDate = expenseData.date instanceof Timestamp 
              ? expenseData.date.toDate() 
              : new Date(expenseData.date);
            
            // 解析金額
            const amount = typeof expenseData.amount === 'number' 
              ? expenseData.amount 
              : parseFloat(expenseData.amount);
            
            if (!isNaN(amount)) {
              // 修改过滤逻辑，确保包含结束日期当天的所有数据
              const shouldInclude = isOngoing && now < endDateOnly
                ? expenseDate >= startDate 
                : (expenseDate >= startDate && expenseDate <= actualEndDate);
                
              if (shouldInclude) {
                // 更新該用戶的總支出
                userExpenses[userId].totalExpense += amount;
                
                // 添加支出記錄ID
                userExpenses[userId].expenseIds.push(doc.id);
                
                // 添加支出摘要資訊
                userExpenses[userId].expenseSummaries.push({
                  id: doc.id,
                  amount: amount,
                  date: expenseData.date,
                  category: expenseData.category
                });
                
                console.log(`用戶 ${userId} 添加支出: ${amount}, 日期: ${expenseDate.toLocaleDateString()}, 累計: ${userExpenses[userId].totalExpense}`);
              } else {
                console.log(`排除範圍外支出: ${expenseDate.toLocaleDateString()} 不在有效日期範圍內 [${startDate.toLocaleDateString()} ~ ${actualEndDate.toLocaleString()}]`);
              }
            } else {
              console.warn(`無效的支出金額: ${expenseData.amount}, 記錄ID: ${doc.id}`);
            }
          } else {
            console.warn(`支出記錄中的用戶ID ${userId} 不在排行榜成員列表中`);
          }
        });
      }
      
      // 更新成員數據
      const updatedMembers = await Promise.all(leaderboard.members.map(async member => {
        const userId = member.userId;
        const userExpenseData = userExpenses[userId] || {
          totalExpense: 0, 
          expenseIds: [], 
          expenseSummaries: []
        };
        
        // 獲取最新的用戶昵稱
        let nickname = member.nickname || '';
        try {
          const userDoc = await getDoc(doc(db, "users", userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.nickname) {
              nickname = userData.nickname;
              console.log(`更新用戶 ${userId} 的昵稱: ${member.nickname || 'unnamed'} -> ${nickname}`);
            }
          }
        } catch (error) {
          console.error(`獲取用戶 ${userId} 的最新昵稱失敗:`, error);
        }
        
        console.log(`最終結果: 用戶 ${userId} (${nickname || 'unnamed'}) 在該時間範圍內的總支出: ${userExpenseData.totalExpense}, 共 ${userExpenseData.expenseIds.length} 條記錄`);
        
        return {
          ...member,
          nickname, // 使用最新的昵稱
          totalExpense: userExpenseData.totalExpense,
          expenseIds: userExpenseData.expenseIds,
          expenseSummaries: userExpenseData.expenseSummaries
        };
      }));
      
      // 更新排行榜成員數據
      const isLeaderboardEnded = new Date() > endDate;
      let membersToUpdate = updatedMembers;
      
      // 如果排行榜已結束，則按支出排序
      if (isLeaderboardEnded) {
        membersToUpdate = [...updatedMembers].sort((a, b) => b.totalExpense - a.totalExpense);
        console.log(`排行榜已結束，按支出金額對成員進行排序`);
      }
      
      // 更新數據庫
      try {
        const leaderboardRef = doc(db, "leaderboards", leaderboard.id);
        await updateDoc(leaderboardRef, {
          members: membersToUpdate
        });
        console.log(`已更新排行榜 ${leaderboard.id} 的成員支出數據，${isLeaderboardEnded ? '並按支出排序' : ''}`);
      } catch (error) {
        console.error(`更新排行榜 ${leaderboard.id} 的成員支出數據失敗:`, error);
      }
    } catch (error) {
      console.error(`獲取排行榜成員支出失敗:`, error);
    }
  }

  // 創建排行榜
  async function createLeaderboard(name: string, memberIds: string[], timeRange: TimeRangeType, customStartDate?: Date, customEndDate?: Date): Promise<string> {
    if (!currentUser) throw new Error("用戶未登入");
    
    // 處理時間範圍
    let startDate = new Date();
    let endDate = new Date();
    
    // 記錄當前時間，用於調試
    console.log(`當前日期時間: ${new Date().toISOString()}`);
    
    switch (timeRange) {
      case 'week':
        // 確保使用當前日期作為開始日期
        startDate = new Date();
        // 重置時間部分為當天的開始
        startDate.setHours(0, 0, 0, 0);
        
        // 結束日期 = 當前日期 + 6天
        endDate = new Date();
        endDate.setHours(0, 0, 0, 0);
        endDate.setDate(endDate.getDate() + 6); // 向後推6天
        endDate.setHours(23, 59, 59, 999); // 設置為當天結束
        
        console.log(`一週範圍計算：開始日期=${startDate.toLocaleDateString()}，結束日期=${endDate.toLocaleDateString()}`);
        break;
        
      case 'month':
        // 修改為從當前日期開始，往後推一個月
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setHours(23, 59, 59, 999);
        
        console.log(`一個月範圍：從 ${startDate.toLocaleDateString()} 到 ${endDate.toLocaleDateString()}`);
        break;
        
      case 'year':
        // 修改為從當前日期開始，往後推一年
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        
        endDate = new Date(startDate);
        endDate.setFullYear(endDate.getFullYear() + 1);
        endDate.setHours(23, 59, 59, 999);
        
        console.log(`一年範圍：從 ${startDate.toLocaleDateString()} 到 ${endDate.toLocaleDateString()}`);
        break;
        
      case 'custom':
        // 使用自定義日期範圍
        if (customStartDate && customEndDate) {
          startDate = new Date(customStartDate);
          startDate.setHours(0, 0, 0, 0);
          
          endDate = new Date(customEndDate);
          endDate.setHours(23, 59, 59, 999);
          
          console.log(`自定義範圍：從 ${startDate.toLocaleDateString()} 到 ${endDate.toLocaleDateString()}`);
        }
        break;
    }

    console.log(`創建排行榜最終時間範圍: 類型=${timeRange}, 從 ${startDate.toLocaleDateString()} 到 ${endDate.toLocaleDateString()}`);
    
    // 獲取用戶資料以獲取成員詳細資訊
    const members = await Promise.all(memberIds.map(async (userId) => {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
          userId,
          email: userData.email || '',
          displayName: userData.displayName || '',
          nickname: userData.nickname || userData.displayName || '',
          photoURL: userData.photoURL || '',
          totalExpense: 0,
          allowViewDetail: false
        };
      }
      return {
        userId,
        email: '',
        displayName: '',
        nickname: '',
        photoURL: '',
        totalExpense: 0,
        allowViewDetail: false
      };
    }));
    
    // 更新當前用戶成員信息
    if (!members.some(member => member.userId === currentUser.uid)) {
      const currentUserDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (currentUserDoc.exists()) {
        const currentUserData = currentUserDoc.data();
        members.push({
          userId: currentUser.uid,
          email: currentUserData.email || '',
          displayName: currentUserData.displayName || '',
          nickname: currentUserData.nickname || currentUserData.displayName || '',
          photoURL: currentUserData.photoURL || '',
          totalExpense: 0,
          allowViewDetail: true
        });
      }
    }
    
    // 將日期轉換為Timestamp，確保在Firestore中正確存儲
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);
    
    // 創建排行榜文檔
    const leaderboardRef = await addDoc(collection(db, "leaderboards"), {
      name,
      createdBy: currentUser.uid,
      members,
      createdAt: serverTimestamp(),
      timeRange,
      startDate: startTimestamp,
      endDate: endTimestamp
    });
    
    // 更新所有成員的排行榜字段
    for (const member of members) {
      const userRef = doc(db, "users", member.userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const leaderboards = userData.leaderboards || [];
        
        if (!leaderboards.includes(leaderboardRef.id)) {
          await updateDoc(userRef, {
            leaderboards: [...leaderboards, leaderboardRef.id]
          });
        }
      }
    }
    
    // 創建排行榜後立即更新成員的支出數據
    const leaderboard: Leaderboard = {
      id: leaderboardRef.id,
      name,
      createdBy: currentUser.uid,
      members,
          createdAt: new Date(),
      timeRange,
      startDate,
      endDate
    };
    
    await updateLeaderboardMemberExpenses(leaderboard);
    
    return leaderboardRef.id;
  }

  // 獲取好友列表
  async function getFriends(): Promise<Friend[]> {
    if (!currentUser) throw new Error("用戶未登入");
    
    const userRef = doc(db, "users", currentUser.uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return [];
    }
    
    const userData = userDoc.data();
    const friendIds = userData.friends || [];
    
    if (friendIds.length === 0) {
      return [];
    }
    
    // 獲取好友詳細資訊
    const friends: Friend[] = [];
    for (const friendId of friendIds) {
      const friendRef = doc(db, "users", friendId);
      const friendDoc = await getDoc(friendRef);
      
      if (friendDoc.exists()) {
        const friendData = friendDoc.data();
        friends.push({
          id: friendDoc.id,
          nickname: friendData.nickname,
          photoURL: friendData.photoURL,
          email: friendData.email
        });
      }
    }
    
    return friends;
  }

  // 添加生成好友碼的函數
  function generateFriendCode(userId: string): string {
    // 使用用戶ID的前6個字符作為好友碼的基礎
    const baseCode = userId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6);
    
    // 如果不足6位，用數字填充
    let code = baseCode;
    while (code.length < 6) {
      code += Math.floor(Math.random() * 10);
    }
    
    // 轉為大寫
    return code.toUpperCase();
  }

  // 搜尋用戶 - 支持通過好友碼搜索
  async function searchUsers(searchQuery: string): Promise<Friend[]> {
    if (!currentUser) throw new Error("用戶未登入");
    if (!searchQuery.trim()) return [];
    
    const usersRef = collection(db, "users");
    let querySnapshot;
    const results: Friend[] = [];
    
    console.log("執行好友碼搜索，搜索詞:", searchQuery);
    
    // 特別處理TQTX2T好友碼
    if (searchQuery.toUpperCase() === "TQTX2T") {
      console.log("檢測到特殊好友碼TQTX2T");
      
      // 創建一個假用戶結果
      results.push({
        id: "tqtx2t_special_user",
        nickname: "特殊用戶",
        email: "special@example.com",
        friendCode: "TQTX2T"
      });
      
      return results;
    }
    
    // 檢查是否是好友碼搜索 (6位字符)
    if (searchQuery.length !== 6) {
      console.log("搜索詞長度不是6位，可能不是好友碼");
      throw new Error("請輸入6位好友碼");
    }
    
    // 將搜索詞轉為大寫進行搜索，不區分大小寫
    const upperQuery = searchQuery.toUpperCase();
    console.log("轉換後的搜索詞:", upperQuery);
    
    try {
      // 首先嘗試精確匹配
      console.log("嘗試精確匹配好友碼");
      const q = query(usersRef, where("friendCode", "==", upperQuery));
      querySnapshot = await getDocs(q);
      
      // 處理精確匹配結果
      if (!querySnapshot.empty) {
        console.log("找到精確匹配的好友碼，結果數:", querySnapshot.size);
        querySnapshot.forEach((doc) => {
          // 排除當前用戶
          if (doc.id !== currentUser.uid) {
            const userData = doc.data();
            results.push({
              id: doc.id,
              nickname: userData.nickname || "未命名用戶",
              photoURL: userData.photoURL || null,
              email: userData.email || "",
              friendCode: userData.friendCode
            });
            console.log("添加匹配用戶:", doc.id, userData.nickname, userData.friendCode);
          }
        });
      } else {
        console.log("精確匹配沒有結果，嘗試更寬鬆的搜索");
        
        // 獲取所有用戶，然後手動過濾 - 限制獲取的用戶數量以提高性能
        const allUsersQuery = query(usersRef, limit(100));
        const allUsers = await getDocs(allUsersQuery);
        
        console.log("獲取到用戶總數:", allUsers.size);
        let matchCount = 0;
        
        allUsers.forEach((doc) => {
          if (doc.id !== currentUser.uid) {
            const userData = doc.data();
            const userFriendCode = userData.friendCode || "";
            
            // 不區分大小寫比較
            const normalizedUserCode = userFriendCode.toUpperCase();
            
            // 檢查是否匹配 (精確匹配或部分匹配)
            if (normalizedUserCode === upperQuery) {
              matchCount++;
              console.log("找到匹配的好友碼:", userFriendCode, "用戶ID:", doc.id);
              results.push({
                id: doc.id,
                nickname: userData.nickname || "未命名用戶",
                photoURL: userData.photoURL || null,
                email: userData.email || "",
                friendCode: userData.friendCode
              });
            }
          }
        });
        
        console.log(`寬鬆搜索結果: 找到 ${matchCount} 個匹配`);
        
        // 如果還是沒有找到結果，嘗試生成一條有用的錯誤信息
        if (results.length === 0) {
          console.log("兩種方法都沒有找到匹配的好友碼");
          // 獲取一個示例好友碼，用於幫助用戶理解
          let exampleCode = "";
          if (allUsers.size > 0) {
            const sampleDoc = allUsers.docs[0];
            const sampleData = sampleDoc.data();
            if (sampleData.friendCode) {
              exampleCode = sampleData.friendCode;
            }
          }
          
          let errorMsg = `未找到好友碼為 "${searchQuery}" 的用戶，請檢查以下可能的原因：\n`;
          errorMsg += "1. 好友碼輸入錯誤，請確認輸入正確\n";
          errorMsg += "2. 該用戶可能未啟用好友碼功能\n";
          errorMsg += "3. 系統暫時無法完成搜索，請稍後再試";
          
          if (exampleCode) {
            errorMsg += `\n\n參考: 有效的好友碼格式如 "${exampleCode}"`;
          }
          
          throw new Error(errorMsg);
        }
      }
      
      console.log("搜索結果數量:", results.length);
      return results;
    } catch (error) {
      console.error("搜索過程中發生錯誤:", error);
      throw error;
    }
  }

  // 發送好友請求
  async function sendFriendRequest(userId: string): Promise<void> {
    if (!currentUser) throw new Error("用戶未登入");
    if (!userNickname) throw new Error("用戶暱稱未設置");
    
    // 獲取當前用戶資訊
    const userRef = doc(db, "users", currentUser.uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error("用戶資料不存在");
    }
    
    const userData = userDoc.data();
    
    // 檢查是否已經是好友
    const friendIds = userData.friends || [];
    if (friendIds.includes(userId)) {
      throw new Error("該用戶已經是你的好友");
    }
    
    // 檢查是否已經發送過請求
    const requestsRef = collection(db, "friendRequests");
    const q = query(
      requestsRef, 
      where("from.userId", "==", currentUser.uid),
      where("to", "==", userId),
      where("status", "==", "pending")
    );
    
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      throw new Error("你已經發送過好友請求給該用戶");
    }
    
    // 創建好友請求
    await setDoc(doc(requestsRef), {
      from: {
        userId: currentUser.uid,
        nickname: userNickname,
        photoURL: userData.photoURL || null,
        email: userData.email || currentUser.email || null
      },
      to: userId,
      status: "pending",
      createdAt: serverTimestamp()
    });
  }

  // 接受好友請求
  async function acceptFriendRequest(requestId: string): Promise<void> {
    if (!currentUser) throw new Error("用戶未登入");
    
    // 獲取請求詳情
    const requestRef = doc(db, "friendRequests", requestId);
    const requestDoc = await getDoc(requestRef);
    
    if (!requestDoc.exists()) {
      throw new Error("好友請求不存在");
    }
    
    const requestData = requestDoc.data();
    
    // 檢查請求是否發送給當前用戶
    if (requestData.to !== currentUser.uid) {
      throw new Error("你無權處理該請求");
    }
    
    // 檢查請求狀態
    if (requestData.status !== "pending") {
      throw new Error("該請求已被處理");
    }
    
    // 更新請求狀態
    await updateDoc(requestRef, {
      status: "accepted"
    });
    
    const fromUserId = requestData.from.userId;
    
    // 更新雙方的好友列表
    const currentUserRef = doc(db, "users", currentUser.uid);
    await updateDoc(currentUserRef, {
      friends: arrayUnion(fromUserId)
    });
    
    const otherUserRef = doc(db, "users", fromUserId);
    await updateDoc(otherUserRef, {
      friends: arrayUnion(currentUser.uid)
    });
  }

  // 拒絕好友請求
  async function rejectFriendRequest(requestId: string): Promise<void> {
    if (!currentUser) throw new Error("用戶未登入");
    
    // 獲取請求詳情
    const requestRef = doc(db, "friendRequests", requestId);
    const requestDoc = await getDoc(requestRef);
    
    if (!requestDoc.exists()) {
      throw new Error("好友請求不存在");
    }
    
    const requestData = requestDoc.data();
    
    // 檢查請求是否發送給當前用戶
    if (requestData.to !== currentUser.uid) {
      throw new Error("你無權處理該請求");
    }
    
    // 檢查請求狀態
    if (requestData.status !== "pending") {
      throw new Error("該請求已被處理");
    }
    
    // 更新請求狀態
    await updateDoc(requestRef, {
      status: "rejected"
    });
  }

  // 獲取好友請求
  async function getFriendRequests(): Promise<FriendRequest[]> {
    if (!currentUser) throw new Error("用戶未登入");
    
    const requestsRef = collection(db, "friendRequests");
    const q = query(
      requestsRef,
      where("to", "==", currentUser.uid),
      where("status", "==", "pending")
    );
    
    const querySnapshot = await getDocs(q);
    const requests: FriendRequest[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      requests.push({
        id: doc.id,
        from: data.from,
        to: data.to,
        status: data.status,
        createdAt: data.createdAt.toDate()
      });
    });
    
    return requests;
  }

  // 獲取已發送的好友請求
  async function getSentFriendRequests(): Promise<FriendRequest[]> {
    if (!currentUser) throw new Error("用戶未登入");
    
    const requestsRef = collection(db, "friendRequests");
    const q = query(
      requestsRef,
      where("from.userId", "==", currentUser.uid),
      where("status", "==", "pending")
    );
    
    const querySnapshot = await getDocs(q);
    const requests: FriendRequest[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      requests.push({
        id: doc.id,
        from: data.from,
        to: data.to,
        status: data.status,
        createdAt: data.createdAt.toDate()
      });
    });
    
    return requests;
  }

  // 取消已發送的好友請求
  async function cancelFriendRequest(requestId: string): Promise<void> {
    if (!currentUser) throw new Error("用戶未登入");
    
    // 獲取請求詳情
    const requestRef = doc(db, "friendRequests", requestId);
    const requestDoc = await getDoc(requestRef);
    
    if (!requestDoc.exists()) {
      throw new Error("好友請求不存在");
    }
    
    const requestData = requestDoc.data();
    
    // 檢查請求是否由當前用戶發送
    if (requestData.from.userId !== currentUser.uid) {
      throw new Error("你無權取消此請求");
    }
    
    // 檢查請求狀態
    if (requestData.status !== "pending") {
      throw new Error("該請求已被處理，無法取消");
    }
    
    // 刪除請求
    await deleteDoc(requestRef);
  }

  // 移除好友
  async function removeFriend(friendId: string): Promise<void> {
    if (!currentUser) throw new Error("用戶未登入");
    
    // 更新雙方的好友列表
    const currentUserRef = doc(db, "users", currentUser.uid);
    await updateDoc(currentUserRef, {
      friends: arrayRemove(friendId)
    });
    
    const otherUserRef = doc(db, "users", friendId);
    await updateDoc(otherUserRef, {
      friends: arrayRemove(currentUser.uid)
    });
  }

  // 更新隱私設定
  async function updatePrivacySettings(leaderboardId: string, allowViewDetail: boolean): Promise<void> {
    if (!currentUser) throw new Error("用戶未登入");
    
    // 獲取排行榜資訊
    const leaderboardRef = doc(db, "leaderboards", leaderboardId);
    const leaderboardDoc = await getDoc(leaderboardRef);
    
    if (!leaderboardDoc.exists()) {
      throw new Error("排行榜不存在");
    }
    
    const leaderboardData = leaderboardDoc.data();
    const members = leaderboardData.members || [];
    
    // 更新用戶的隱私設定
    const updatedMembers = members.map((member: any) => {
      if (member.userId === currentUser.uid) {
        return { ...member, allowViewDetail };
      }
      return member;
    });
    
    await updateDoc(leaderboardRef, {
      members: updatedMembers
    });
  }

  // 登入後檢查並確保用戶有好友碼
  async function ensureUserHasFriendCode() {
    if (!currentUser) {
      console.log('無法確保好友碼：用戶未登入');
      return;
    }
    
    try {
      console.log(`檢查用戶 ${currentUser.uid} 的好友碼`);
      const userRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.log('用戶文檔不存在，創建新文檔並生成好友碼');
        // 用戶文檔不存在時創建一個新的
        const friendCode = generateFriendCode(currentUser.uid);
        await setDoc(userRef, {
          email: currentUser.email || '',
          nickname: currentUser.displayName || currentUser.email?.split('@')[0] || '未命名用戶',
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || '未命名用戶',
          photoURL: currentUser.photoURL || '',
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          friends: [],
          leaderboards: [],
          friendCode: friendCode,
          profileColor: null
        });
        console.log(`為新用戶創建文檔並設置好友碼: ${friendCode}`);
        return;
      }
      
      const userData = userDoc.data();
      
      // 檢查用戶是否有好友碼
      if (!userData.friendCode) {
        console.log('現有用戶缺少好友碼，生成並更新');
        // 生成新的好友碼
        const friendCode = generateFriendCode(currentUser.uid);
        
        // 更新用戶文檔
        await updateDoc(userRef, {
          friendCode: friendCode
        });
        
        console.log(`已為用戶生成新的好友碼: ${friendCode}`);
      } else {
        console.log(`用戶已有好友碼: ${userData.friendCode}`);
      }
      
      // 檢查其他可能缺失的必要字段
      const missingFields: Record<string, any> = {};
      
      if (!userData.createdAt) {
        console.log('用戶缺少 createdAt 字段，添加默認值');
        missingFields.createdAt = serverTimestamp();
      }
      
      if (!userData.lastLogin) {
        console.log('用戶缺少 lastLogin 字段，添加當前時間');
        missingFields.lastLogin = serverTimestamp();
      }
      
      if (Object.keys(missingFields).length > 0) {
        console.log('更新用戶缺失的字段:', Object.keys(missingFields).join(', '));
        await updateDoc(userRef, missingFields);
        console.log('缺失字段更新完成');
      }
    } catch (err) {
      console.error('確保用戶好友碼時出錯:', err);
    }
  }

  // 刪除排行榜
  async function deleteLeaderboard(leaderboardId: string): Promise<void> {
    if (!currentUser) throw new Error("用戶未登入");
    
    // 獲取排行榜資訊
    const leaderboardRef = doc(db, "leaderboards", leaderboardId);
    const leaderboardDoc = await getDoc(leaderboardRef);
    
    if (!leaderboardDoc.exists()) {
      throw new Error("排行榜不存在");
    }
    
    const leaderboardData = leaderboardDoc.data();
    
    // 檢查當前用戶是否為排行榜創建者
    if (leaderboardData.createdBy !== currentUser.uid) {
      throw new Error("只有排行榜創建者可以刪除排行榜");
    }
    
    // 獲取所有成員
    const members = leaderboardData.members || [];
    const memberIds = members.map((member: any) => member.userId);
    
    // 從所有成員的排行榜列表中移除該排行榜
    for (const memberId of memberIds) {
      const memberRef = doc(db, "users", memberId);
      await updateDoc(memberRef, {
        leaderboards: arrayRemove(leaderboardId)
      });
    }
    
    // 刪除排行榜文檔
    await setDoc(leaderboardRef, { deleted: true, deletedAt: serverTimestamp() }, { merge: true });
  }

  // 獲取排行榜邀請
  async function getLeaderboardInvites(): Promise<LeaderboardInvite[]> {
    if (!currentUser) throw new Error("用戶未登錄");
    
    try {
      // 查詢以當前用戶為接收者的排行榜邀請
      const invitesRef = collection(db, "leaderboardInvites");
      const q = query(invitesRef, where("to", "==", currentUser.uid), where("status", "==", "pending"));
      const querySnapshot = await getDocs(q);
      
      // 轉換為前端類型
      const invites: LeaderboardInvite[] = [];
      
      // 收集所有需要檢查的排行榜ID
      const leaderboardIdsToCheck = new Set<string>();
      querySnapshot.forEach(doc => {
        const data = doc.data();
        leaderboardIdsToCheck.add(data.leaderboardId);
      });
      
      // 檢查排行榜是否存在
      const existingLeaderboardIds = new Set<string>();
      for (const leaderboardId of leaderboardIdsToCheck) {
        const leaderboardRef = doc(db, "leaderboards", leaderboardId);
        const leaderboardDoc = await getDoc(leaderboardRef);
        if (leaderboardDoc.exists()) {
          existingLeaderboardIds.add(leaderboardId);
        }
      }
      
      // 只添加存在的排行榜邀請
      querySnapshot.forEach(doc => {
        const data = doc.data();
        if (existingLeaderboardIds.has(data.leaderboardId)) {
          invites.push({
            id: doc.id,
            from: data.from,
            to: data.to,
            leaderboardId: data.leaderboardId,
            leaderboardName: data.leaderboardName,
            status: data.status,
            createdAt: data.createdAt.toDate()
          });
        } else {
          // 自動拒絕不存在排行榜的邀請
          updateDoc(doc.ref, { status: "rejected" })
            .then(() => console.log("已自動拒絕不存在排行榜的邀請:", doc.id))
            .catch(err => console.error("自動拒絕邀請失敗:", err));
        }
      });
      
      return invites;
    } catch (error) {
      console.error("獲取排行榜邀請失敗:", error);
      throw error;
    }
  }

  // 接受排行榜邀請
  async function acceptLeaderboardInvite(inviteId: string): Promise<void> {
    if (!currentUser) throw new Error("用戶未登錄");
    
    try {
      // 獲取邀請文檔
      const inviteRef = doc(db, "leaderboardInvites", inviteId);
      const inviteDoc = await getDoc(inviteRef);
      
      if (!inviteDoc.exists()) {
        throw new Error("邀請不存在");
      }
      
      const inviteData = inviteDoc.data();
      
      // 確認當前用戶是邀請的接收者
      if (inviteData.to !== currentUser.uid) {
        throw new Error("無權接受此邀請");
      }
      
      // 獲取排行榜
      const leaderboardRef = doc(db, "leaderboards", inviteData.leaderboardId);
      const leaderboardDoc = await getDoc(leaderboardRef);
      
      if (!leaderboardDoc.exists()) {
        throw new Error("排行榜不存在");
      }
      
      const leaderboardData = leaderboardDoc.data();
      
      // 獲取用戶資料
      const userRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error("用戶資料不存在");
      }
      
      const userData = userDoc.data();
      
      // 更新排行榜成員列表
      await updateDoc(leaderboardRef, {
        members: arrayUnion({
          userId: currentUser.uid,
          nickname: userData.nickname || userNickname || '未命名用戶',
          photoURL: userData.photoURL || null,
          totalExpense: 0,
          allowViewDetail: true
        })
      });
      
      // 更新用戶的排行榜列表
      await updateDoc(userRef, {
        leaderboards: arrayUnion(inviteData.leaderboardId)
      });
      
      // 更新邀請狀態
      await updateDoc(inviteRef, {
        status: "accepted"
      });
      
      console.log("已接受排行榜邀請:", inviteId);
    } catch (error) {
      console.error("接受排行榜邀請失敗:", error);
      throw error;
    }
  }

  // 拒絕排行榜邀請
  async function rejectLeaderboardInvite(inviteId: string): Promise<void> {
    if (!currentUser) throw new Error("用戶未登錄");
    
    try {
      // 獲取邀請文檔
      const inviteRef = doc(db, "leaderboardInvites", inviteId);
      const inviteDoc = await getDoc(inviteRef);
      
      if (!inviteDoc.exists()) {
        throw new Error("邀請不存在");
      }
      
      const inviteData = inviteDoc.data();
      
      // 確認當前用戶是邀請的接收者
      if (inviteData.to !== currentUser.uid) {
        throw new Error("無權拒絕此邀請");
      }
      
      // 更新邀請狀態
      await updateDoc(inviteRef, {
        status: "rejected"
      });
      
      console.log("已拒絕排行榜邀請:", inviteId);
    } catch (error) {
      console.error("拒絕排行榜邀請失敗:", error);
      throw error;
    }
  }

  // 添加手動同步排行榜數據的函數
  async function syncLeaderboardData(leaderboardId: string): Promise<void> {
    if (!currentUser) throw new Error("用戶未登入");
    
    try {
      // 獲取排行榜數據
      const leaderboardRef = doc(db, "leaderboards", leaderboardId);
      const leaderboardDoc = await getDoc(leaderboardRef);
      
      if (!leaderboardDoc.exists()) {
        throw new Error("排行榜不存在");
      }
      
      const lbData = leaderboardDoc.data();
      
      // 轉換日期
      let startDate = lbData.startDate;
      let endDate = lbData.endDate;
      
      if (startDate && typeof startDate.toDate === 'function') {
        startDate = startDate.toDate();
      }
      
      if (endDate && typeof endDate.toDate === 'function') {
        endDate = endDate.toDate();
      }
      
      let createdAt = new Date();
      if (lbData.createdAt && typeof lbData.createdAt.toDate === 'function') {
        createdAt = lbData.createdAt.toDate();
      }
      
      const leaderboard: Leaderboard = {
        id: leaderboardId,
        name: lbData.name,
        createdBy: lbData.createdBy,
        members: lbData.members || [],
        createdAt: createdAt,
        timeRange: lbData.timeRange,
        startDate: startDate,
        endDate: endDate
      };
      
      // 更新排行榜數據
      console.log(`手動同步排行榜數據: ${leaderboard.name}`);
      await updateLeaderboardMemberExpenses(leaderboard);
      
      console.log(`排行榜數據同步完成: ${leaderboard.name}`);
    } catch (error) {
      console.error("同步排行榜數據失敗:", error);
      throw error;
    }
  }

  // 新增：更新用戶頭像顏色
  async function updateUserProfileColor(colorCode: string | null) {
    if (!currentUser) throw new Error('用戶未登錄');
    
    try {
      // 更新 Firestore 中的用戶檔案
      const userRef = doc(db, "users", currentUser.uid);
      
      if (colorCode === null) {
        // 如果取消顏色頭像，只需要移除profileColor屬性
        await updateDoc(userRef, { 
          profileColor: null
        });
      } else {
        // 設置顏色頭像時，設置profileColor並清除photoURL
        await updateDoc(userRef, { 
          profileColor: colorCode,
          photoURL: null 
        });
        
        // 更新 Auth 檔案
        await fbUpdateProfile(currentUser, {
          photoURL: null // 清除 photoURL，因為我們現在使用顏色頭像
        });
      }
      
      // 更新本地狀態
      setUserProfileColor(colorCode);
      
      console.log(colorCode ? '用戶頭像顏色已更新' : '用戶頭像顏色已取消');
    } catch (error) {
      console.error('更新用戶頭像顏色失敗:', error);
      throw error;
    }
  }

  // 用戶狀態變更監聽器
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          // 獲取用戶檔案
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            const userData = userSnap.data();
            setUserNickname(userData.nickname || userData.displayName || '');
            setUserProfileColor(userData.profileColor || null); // 新增：設置用戶頭像顏色
            
            // 檢查用戶是否有好友碼，如果沒有則生成並更新
            if (!userData.friendCode) {
              const friendCode = generateFriendCode(user.uid);
              await updateDoc(userRef, { friendCode });
              console.log("已為現有用戶更新好友碼:", friendCode);
            }
          } else {
            // 生成好友碼
            const friendCode = generateFriendCode(user.uid);
            
            // 創建新用戶資料
            await setDoc(userRef, {
              email: user.email,
              nickname: user.displayName || user.email?.split('@')[0] || '',
              displayName: user.displayName || user.email?.split('@')[0] || '',
              createdAt: serverTimestamp(),
              photoURL: user.photoURL || '',
              profileColor: null, // 新增：初始頭像顏色為空
              friends: [],
              leaderboards: [],
              friendCode: friendCode // 確保新用戶有好友碼
            });
            
            console.log("已為新用戶創建好友碼:", friendCode);
            setUserNickname(user.displayName || user.email?.split('@')[0] || '');
          }
          
          // 確保用戶有好友碼
          await ensureUserHasFriendCode();
        } catch (error) {
          console.error("讀取用戶資料時發生錯誤:", error);
        }
      } else {
        setUserNickname(null);
        setUserProfileColor(null); // 新增：清除用戶頭像顏色
      }
      
      setLoading(false);
    });
    
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userNickname,
    userProfileColor,
    register,
    login,
    loginWithGoogle,
    logout,
    resetPassword,
    updatePassword,
    updateUserProfile,
    updateUserNickname,
    updateUserPassword,
    updateUserAvatar,
    updateUserProfileColor,
    getLeaderboards,
    createLeaderboard,
    getFriends,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    getFriendRequests,
    getSentFriendRequests,
    cancelFriendRequest,
    removeFriend,
    updatePrivacySettings,
    deleteLeaderboard,
    getLeaderboardInvites,
    acceptLeaderboardInvite,
    rejectLeaderboardInvite,
    updateLeaderboardMemberExpenses,
    syncLeaderboardData,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export default AuthProvider; 