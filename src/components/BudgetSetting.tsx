import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { formatAmount } from '../utils/formatters';
import './BudgetSetting.css'; // 添加專用樣式檔案
import { Timestamp } from 'firebase/firestore';

interface BudgetSettingProps {
  onClose: () => void;
}

type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
type BudgetType = 'multi' | 'overall';

interface BudgetItem {
  id: string; // 唯一ID
  period: BudgetPeriod;
  amount: number;
  categoryId: string | 'overall'; // 'overall' 表示总体预算
  categoryName: string | '总体'; // 类别名称
  startDate?: Date;
  endDate?: Date;
  budgetType?: BudgetType; // 預算類型: single(單類別), multi(多類別共享), overall(總體)
  categories?: string[]; // 多類別共享預算選擇的類別
}

interface Budget {
  budgetItems: BudgetItem[];
  notificationEnabled: boolean;
}

const BudgetSetting: React.FC<BudgetSettingProps> = ({ onClose }) => {
  const { currentUser } = useAuth();
  
  // 预算表单状态
  const [selectedPeriod, setSelectedPeriod] = useState<BudgetPeriod>('monthly');
  const [amount, setAmount] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('overall');
  const [budgetType, setBudgetType] = useState<BudgetType>('overall');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );

  // 应用状态
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [budget, setBudget] = useState<Budget>({
    budgetItems: [],
    notificationEnabled: true,
  });
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [showAddForm, setShowAddForm] = useState<boolean>(true);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  
  // 动画状态
  const [fadeInItems, setFadeInItems] = useState<boolean>(false);
  
  // 加載用戶預算設置
  useEffect(() => {
    if (currentUser) {
      loadBudget();
      loadCategories();
      
      // 设置延时动画效果
      setTimeout(() => {
        setFadeInItems(true);
      }, 300);
    }
  }, [currentUser]);
  
  useEffect(() => {
    // 當選擇多類別共享預算時，清空單一類別選擇
    if (budgetType === 'multi') {
      setSelectedCategory('overall');
    }
    // 當選擇單類別或總體預算時，清空多類別選擇
    else if (budgetType === 'overall') {
      setSelectedCategories([]);
    }
  }, [budgetType]);
  
  // 加載預算設置
  const loadBudget = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      console.log('開始加載預算設置...');
      
      const budgetRef = doc(db, 'budgets', currentUser.uid);
      const budgetDoc = await getDoc(budgetRef);
      
      if (budgetDoc.exists()) {
        const data = budgetDoc.data();
        console.log('已獲取預算數據:', data);
        
        // 处理现有数据格式，兼容旧版预算格式
        const budgetItems: BudgetItem[] = [];
        
        // 首先處理新版預算格式
        if (data.budgetItems && Array.isArray(data.budgetItems)) {
          console.log('處理新版預算格式，項目數量:', data.budgetItems.length);
          
          data.budgetItems.forEach((item: any, index: number) => {
            try {
              // 轉換日期格式
              let startDate = undefined;
              let endDate = undefined;
              
              if (item.startDate) {
                if (item.startDate instanceof Timestamp) {
                  startDate = item.startDate.toDate();
                } else {
                  startDate = new Date(item.startDate);
                }
              }
              
              if (item.endDate) {
                if (item.endDate instanceof Timestamp) {
                  endDate = item.endDate.toDate();
                } else {
                  endDate = new Date(item.endDate);
                }
              }
              
              // 构建预算项目并添加到列表
              budgetItems.push({
                id: item.id || `item-${index}-${Date.now()}`,
                period: item.period || 'monthly',
                amount: item.amount || 0,
                categoryId: item.budgetType === 'multi' ? 'multi' : (item.categoryId || 'overall'),
                categoryName: item.categoryName || '总体',
                budgetType: item.budgetType || (item.categoryId === 'overall' ? 'overall' : 'multi'),
                ...(item.categories ? { categories: item.categories } : {}),
                startDate,
                endDate
              });
            } catch (error) {
              console.error(`處理預算項目 ${index} 時出錯:`, error, item);
            }
          });
        } else if (data.simplifiedItems && Array.isArray(data.simplifiedItems)) {
          // 處理簡化格式（備份方法4保存的格式）
          console.log('處理簡化備份格式，項目數量:', data.simplifiedItems.length);
          
          data.simplifiedItems.forEach((item: any, index: number) => {
            try {
              budgetItems.push({
                id: item.id || `simplified-${index}-${Date.now()}`,
                period: item.period || 'monthly',
                amount: item.amount || 0,
                categoryId: item.budgetType === 'multi' ? 'multi' : (item.categoryId || 'overall'),
                categoryName: item.categoryName || '总体',
                budgetType: item.budgetType || (item.categoryId === 'overall' ? 'overall' : 'multi'),
                ...(item.categories ? { categories: item.categories } : {})
              });
            } catch (error) {
              console.error(`處理簡化預算項目 ${index} 時出錯:`, error, item);
            }
          });
        } else {
          // 處理舊版預算格式
          console.log('處理舊版預算格式');
          const periodTypes = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];
          
          if (data.period && periodTypes.includes(data.period) && data.amount) {
            try {
              let startDate = undefined;
              let endDate = undefined;
              
              // 處理自定義日期範圍
              if (data.startDate) {
                startDate = data.startDate instanceof Timestamp 
                  ? data.startDate.toDate() 
                  : new Date(data.startDate);
              }
              
              if (data.endDate) {
                endDate = data.endDate instanceof Timestamp 
                  ? data.endDate.toDate() 
                  : new Date(data.endDate);
              }
              
              budgetItems.push({
                id: `overall-${data.period}-legacy-${Date.now()}`,
                period: data.period as BudgetPeriod,
                amount: data.amount,
                categoryId: 'overall',
                categoryName: '总体',
                budgetType: 'overall',
                startDate,
                endDate
              });
            } catch (error) {
              console.error('處理總體預算時出錯:', error);
            }
          }
          
          // 处理类别预算
          if (data.categoryBudgets && Array.isArray(data.categoryBudgets)) {
            console.log('處理舊版類別預算，項目數量:', data.categoryBudgets.length);
            
            data.categoryBudgets.forEach((cat: any, index: number) => {
              try {
                if (!cat.categoryId || !cat.amount) {
                  console.warn('無效的類別預算項目:', cat);
                  return;
                }
                
                let startDate = undefined;
                let endDate = undefined;
                
                // 使用總體預算的日期範圍
                if (data.startDate) {
                  startDate = data.startDate instanceof Timestamp 
                    ? data.startDate.toDate() 
                    : new Date(data.startDate);
                }
                
                if (data.endDate) {
                  endDate = data.endDate instanceof Timestamp 
                    ? data.endDate.toDate() 
                    : new Date(data.endDate);
                }
                
                budgetItems.push({
                  id: `${cat.categoryId}-${data.period || 'monthly'}-legacy-${Date.now()}-${index}`,
                  period: data.period || 'monthly' as BudgetPeriod,
                  amount: cat.amount,
                  categoryId: cat.categoryId,
                  categoryName: cat.categoryName || cat.categoryId,
                  budgetType: 'multi',
                  startDate,
                  endDate
                });
              } catch (error) {
                console.error(`處理類別預算 ${index} 時出錯:`, error, cat);
              }
            });
          }
        }
        
        console.log('預算設置加載完成，共有項目:', budgetItems.length);
        setBudget({
          budgetItems,
          notificationEnabled: data.notificationEnabled !== undefined ? data.notificationEnabled : true
        });
      } else {
        console.log('未找到預算設置');
        setBudget({
          budgetItems: [],
          notificationEnabled: true
        });
      }
    } catch (error) {
      console.error('加載預算設置失敗:', error);
      
      // 記錄詳細錯誤信息
      if (error instanceof Error) {
        console.error('錯誤詳情:', {
          名稱: error.name,
          訊息: error.message,
          堆疊: error.stack
        });
      }
      
      setError('無法加載預算設置，請稍後再試。');
    } finally {
      setLoading(false);
    }
  };
  
  // 加載支出類別
  const loadCategories = async () => {
    if (!currentUser) return;
    
    try {
      const categoriesRef = collection(db, 'categories');
      const categoriesQuery = query(categoriesRef, where('userId', 'in', [currentUser.uid, 'default']));
      const categoriesSnapshot = await getDocs(categoriesQuery);
      
      let categoriesList = categoriesSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      
      // 如果沒有類別，添加默認類別
      if (categoriesList.length === 0) {
        categoriesList = [
          { id: 'food', name: '餐飲' },
          { id: 'transportation', name: '交通' },
          { id: 'entertainment', name: '娛樂' },
          { id: 'shopping', name: '購物' },
          { id: 'education', name: '教育' },
          { id: 'medical', name: '醫療' },
          { id: 'investment', name: '投資' },
          { id: 'utilities', name: '住支' },
          { id: 'other', name: '其他' }
        ];
      }
      
      setCategories(categoriesList);
    } catch (error) {
      console.error('加載類別失敗:', error);
      // 發生錯誤時也添加默認類別
      const defaultCategories = [
        { id: 'food', name: '餐飲' },
        { id: 'transportation', name: '交通' },
        { id: 'entertainment', name: '娛樂' },
        { id: 'shopping', name: '購物' },
        { id: 'education', name: '教育' },
        { id: 'medical', name: '醫療' },
        { id: 'investment', name: '投資' },
        { id: 'utilities', name: '住支' },
        { id: 'other', name: '其他' }
      ];
      setCategories(defaultCategories);
    }
  };
  
  // 保存预算到Firestore
  const saveBudget = async (updatedBudget: Budget) => {
    try {
    if (!currentUser) {
        console.error('未登入，無法保存預算');
        throw new Error('未登入，無法保存預算');
      }
      
      setLoading(true);
      
      console.log('準備保存預算:', updatedBudget);
      
      // 準備保存的數據 - 只保存必要字段
      const budgetItemsData = updatedBudget.budgetItems.map(item => {
        try {
          // 處理日期字段
          let startDateField = undefined;
          let endDateField = undefined;
          
          if (item.startDate) {
            try {
              const date = new Date(item.startDate);
              if (!isNaN(date.getTime())) {
                startDateField = Timestamp.fromDate(date);
              }
            } catch (e) {
              console.warn('處理開始日期失敗:', e);
            }
          }
          
          if (item.endDate) {
            try {
              const date = new Date(item.endDate);
              if (!isNaN(date.getTime())) {
                endDateField = Timestamp.fromDate(date);
              }
            } catch (e) {
              console.warn('處理結束日期失敗:', e);
            }
          }
          
          // 確保categories字段為陣列
          let categoriesField = undefined;
          if (item.budgetType === 'multi' && item.categories) {
            if (Array.isArray(item.categories)) {
              categoriesField = [...item.categories]; // 複製陣列以避免引用問題
            } else {
              console.warn('categories不是陣列，忽略此字段');
            }
          }
          
          // 返回處理後的預算項目
          return {
            id: item.id,
            period: item.period || 'monthly',
            amount: Number(item.amount) || 0,
            categoryId: item.categoryId || 'overall',
            categoryName: item.categoryName || '總體',
            startDate: startDateField,
            endDate: endDateField,
            budgetType: item.budgetType || (item.categoryId === 'overall' ? 'overall' : 'multi'),
            ...(categoriesField ? { categories: categoriesField } : {})
          };
        } catch (itemError) {
          console.error('處理預算項目時出錯:', itemError, item);
          // 返回一個最基本的有效項目，以確保保存不會因單個項目問題而失敗
          return {
            id: item.id || `fallback-${Date.now()}`,
            period: 'monthly',
            amount: 0,
            categoryId: 'overall',
            categoryName: '總體',
            budgetType: 'overall'
          };
        }
      });
      
      const budgetData = {
        userId: currentUser.uid,
        budgetItems: budgetItemsData,
        notificationEnabled: updatedBudget.notificationEnabled,
        lastUpdated: serverTimestamp()
      };
      
      console.log('準備保存以下數據到Firestore:', budgetData);
      
      // 嘗試保存，使用更穩健的錯誤處理
      try {
        const budgetRef = doc(db, 'budgets', currentUser.uid);
        await setDoc(budgetRef, budgetData);
        console.log('預算保存成功');
      } catch (saveError) {
        console.error('使用setDoc保存失敗，嘗試使用原始方法', saveError);
        
        // 如果setDoc失敗，嘗試使用原始方法（備用方案）
        // 這是為了處理可能的Firebase限制或問題
        const budgetRef = doc(db, 'budgets', currentUser.uid);
        
        // 首先保存基本設置
        await setDoc(budgetRef, {
          userId: currentUser.uid,
          notificationEnabled: updatedBudget.notificationEnabled,
          lastUpdated: serverTimestamp()
        }, { merge: true });
        
        // 然後分批保存預算項目
        await setDoc(budgetRef, { 
          budgetItems: budgetItemsData
        }, { merge: true });
      }
      
      setSuccess('預算設置已成功保存！');
      
      // 发送事件通知预算更新
      dispatchBudgetEvent();
      
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (error) {
      console.error('保存預算失敗:', error);
      // 拋出錯誤而不是設置錯誤狀態，這樣調用方可以處理錯誤
      throw error;
    } finally {
      setLoading(false);
    }
  };
  
  // 更新现有预算项
  const updateBudgetItem = (itemId: string) => {
    // 基本验证
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        setError('請輸入有效的預算金額');
        return;
      }
      
    // 验证自定义日期区间
      if (selectedPeriod === 'custom') {
        if (!startDate || !endDate) {
          setError('請選擇自訂日期區間');
          return;
        }
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (start > end) {
          setError('結束日期必須晚於開始日期');
          return;
        }
      }
      
    // 驗證選擇的類別（如果是類別預算需要選擇至少一個類別）
    if (budgetType === 'multi' && (!selectedCategories || selectedCategories.length === 0)) {
      setError('請至少選擇一個類別');
      return;
    }
    
      setError('');
      
    // 获取类别名称
    let categoryName = '总体';
    
    if (budgetType === 'multi' && selectedCategories.length > 0) {
      const categoryNames = selectedCategories.map(catId => {
        const category = categories.find(c => c.id === catId);
        return category ? category.name : catId;
      });
      categoryName = categoryNames.join('+');
    }
    
    // 更新预算项
    const updatedBudgetItems = budget.budgetItems.map(item => {
      if (item.id === itemId) {
        const updatedItem: BudgetItem = {
          ...item,
        period: selectedPeriod,
        amount: parseFloat(amount),
          categoryId: budgetType === 'overall' ? 'overall' : (budgetType === 'multi' ? 'multi' : selectedCategory),
          categoryName,
          budgetType,
          ...(budgetType === 'multi' ? { categories: selectedCategories } : {})
      };
      
        // 處理自定義日期範圍
      if (selectedPeriod === 'custom') {
          updatedItem.startDate = new Date(startDate);
          updatedItem.endDate = new Date(endDate);
        } else {
          // 如果不是自定義日期範圍，刪除日期
          delete updatedItem.startDate;
          delete updatedItem.endDate;
        }
        
        return updatedItem;
      }
      return item;
    });
    
    const updatedBudget = {
      ...budget,
      budgetItems: updatedBudgetItems
    };
    
    console.log('更新預算項目:', updatedBudget);
    
    // 保存更新
      setBudget(updatedBudget);
    saveBudget(updatedBudget);
    
    // 重置表单
    resetForm();
    
    // 返回列表视图
    setShowAddForm(false);
  };
  
  // 添加预算项目
  const addBudgetItem = () => {
    // 基本验证
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError('請輸入有效的預算金額');
      return;
    }
    
    // 验证自定义日期区间
    if (selectedPeriod === 'custom') {
      if (!startDate || !endDate) {
        setError('請選擇自訂日期區間');
        return;
      }
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (start > end) {
        setError('結束日期必須晚於開始日期');
        return;
      }
      
      // 檢查日期是否有效
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        setError('日期格式無效，請重新選擇');
        return;
      }
    }
    
    // 驗證選擇的類別（如果是類別預算需要選擇至少一個類別）
    if (budgetType === 'multi' && (!selectedCategories || selectedCategories.length === 0)) {
      setError('請至少選擇一個類別');
      return;
    }
    
    setError('');
    console.log('正在添加預算項目...');
    
    // 获取类别名称
    let categoryName = '总体';
    
    if (budgetType === 'multi' && selectedCategories.length > 0) {
      const categoryNames = selectedCategories.map(catId => {
        const category = categories.find(c => c.id === catId);
        return category ? category.name : catId;
      });
      categoryName = categoryNames.join('+');
    }
    
    // 创建新预算项
    const newBudgetItem: BudgetItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // 生成唯一ID
      period: selectedPeriod,
      amount: parseFloat(amount),
      categoryId: budgetType === 'overall' ? 'overall' : (budgetType === 'multi' ? 'multi' : selectedCategory),
      categoryName,
      budgetType,
      ...(budgetType === 'multi' ? { categories: selectedCategories } : {})
    };
    
    // 添加自定义日期范围
    if (selectedPeriod === 'custom') {
      newBudgetItem.startDate = new Date(startDate);
      newBudgetItem.endDate = new Date(endDate);
    }
    
    console.log('新增預算項目:', newBudgetItem);
    
    // 检查是否已存在相同条件的预算
    const existingItemIndex = budget.budgetItems.findIndex(item => 
      item.period === selectedPeriod && 
      item.categoryId === selectedCategory &&
      ((selectedPeriod === 'custom' && 
        item.startDate?.toISOString().slice(0, 10) === newBudgetItem.startDate?.toISOString().slice(0, 10) && 
        item.endDate?.toISOString().slice(0, 10) === newBudgetItem.endDate?.toISOString().slice(0, 10)) || 
       selectedPeriod !== 'custom')
    );
    
    let updatedItems = [...budget.budgetItems];
    
    if (existingItemIndex !== -1) {
      // 更新现有项目
      console.log('更新現有預算項目:', existingItemIndex);
      updatedItems[existingItemIndex] = {
        ...updatedItems[existingItemIndex],
        amount: newBudgetItem.amount
      };
      
      setBudget({
        ...budget,
        budgetItems: updatedItems
      });
      
      setSuccess('預算設置已更新');
    } else {
      // 添加新项目
      console.log('添加新預算項目:', newBudgetItem);
      setBudget({
      ...budget,
        budgetItems: [...budget.budgetItems, newBudgetItem]
      });
    
      setSuccess('預算設置已添加');
    }
    
    // 重置表单
    setAmount('');
    
    // 隐藏成功消息
    setTimeout(() => {
      setSuccess('');
    }, 3000);
  };
  
  // 刪除預算項目
  const removeBudgetItem = async (id: string) => {
    try {
      // 首先更新本地狀態，以便UI立即反應
      const updatedItems = budget.budgetItems.filter(item => item.id !== id);
    
    const updatedBudget = {
      ...budget,
        budgetItems: updatedItems
    };
    
      // 更新本地狀態
    setBudget(updatedBudget);
      
      // 顯示操作進行中的提示
      setLoading(true);
      
      try {
        // 保存到Firestore數據庫
        await saveBudget(updatedBudget);
        setSuccess('預算項目已刪除');
      } catch (saveError) {
        console.error('通過saveBudget刪除失敗，嘗試直接更新:', saveError);
        
        // 嘗試備用保存方法
        if (currentUser) {
          try {
            // 直接使用最簡單的方式更新數據
            const budgetRef = doc(db, 'budgets', currentUser.uid);
            
            // 只更新預算項目列表
            await setDoc(budgetRef, { 
              budgetItems: updatedItems.map(item => ({
                id: item.id,
                period: item.period,
                amount: Number(item.amount),
                categoryId: item.categoryId,
                categoryName: item.categoryName,
                budgetType: item.budgetType || 'multi'
              })),
              lastUpdated: serverTimestamp()
            }, { merge: true });
            
            setSuccess('預算項目已刪除');
          } catch (finalError) {
            console.error('備用保存方法也失敗:', finalError);
            setError('刪除預算項目時發生錯誤，但您仍然可以看到已更新的列表。請稍後點擊"保存所有設置"嘗試再次保存。');
          }
        } else {
          setError('您似乎已登出，請重新登入後再試。');
        }
      }
    } catch (error) {
      console.error('刪除預算項目失敗:', error);
      // 即使保存失敗，我們仍然保持本地刪除狀態，但提示用戶保存失敗
      setError('刪除預算項目時發生錯誤，但您仍然可以看到已更新的列表。請稍後點擊"保存所有設置"嘗試再次保存。');
    } finally {
      setLoading(false);
      
      // 延遲清除訊息
    setTimeout(() => {
      setSuccess('');
        setError('');
    }, 3000);
    }
  };
  
  // 保存所有预算設置
  const saveAllSettings = async () => {
    if (!currentUser) {
      setError('請先登入');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      console.log('開始保存預算設置...', '用戶ID:', currentUser.uid);
      
      // 首先嘗試使用簡單的saveBudget方式保存
      try {
        console.log('嘗試使用saveBudget函數保存...');
        await saveBudget(budget);
        console.log('使用saveBudget函數保存成功');
        return; // 如果成功，直接返回
      } catch (e) {
        console.error('使用saveBudget函數保存失敗，嘗試備用保存方法:', e);
        // 繼續執行後續備用保存方法
      }
      
      // 如果saveBudget失敗，則繼續執行以下備用保存方法
      // 深度複製預算數據，避免引用問題
      const budgetItemsCopy = JSON.parse(JSON.stringify(budget.budgetItems));
      
      // 檢查數據有效性
      let validItems = 0;
      const processedItems = budgetItemsCopy.map((item: Partial<BudgetItem>) => {
        try {
          // 確保必要欄位存在
          if (!item.id || !item.period || !item.amount || !item.categoryId) {
            console.warn('發現不完整的預算項目，自動補充數據', item);
            item.id = item.id || `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            item.period = item.period || 'monthly';
            item.amount = item.amount || 0;
            item.categoryId = item.categoryId || 'overall';
            item.categoryName = item.categoryName || '总体';
          }
          
          // 處理日期欄位
          if (item.startDate) {
            try {
              const date = new Date(item.startDate);
              if (!isNaN(date.getTime())) {
                item.startDate = Timestamp.fromDate(date) as any;
              } else {
                delete item.startDate;
              }
            } catch (e) {
              console.warn('處理開始日期失敗', e);
              delete item.startDate;
            }
          }
          
          if (item.endDate) {
            try {
              const date = new Date(item.endDate);
              if (!isNaN(date.getTime())) {
                item.endDate = Timestamp.fromDate(date) as any;
              } else {
                delete item.endDate;
              }
            } catch (e) {
              console.warn('處理結束日期失敗', e);
              delete item.endDate;
            }
          }
          
          validItems++;
          return item;
        } catch (itemError) {
          console.error('處理預算項目時出錯', itemError, item);
          return null;
        }
      }).filter((item: any): item is Partial<BudgetItem> => item !== null);
      
      console.log(`已處理 ${validItems} 個有效預算項目`);
      
      // 将预算格式转换为存储格式
      const saveData: any = {
        notificationEnabled: budget.notificationEnabled,
        budgetItems: processedItems,
        lastUpdated: Timestamp.now()
      };
      
      // 為向後兼容性，保留原有格式數據
      const monthlyOverall = budget.budgetItems.find(item => 
        item.period === 'monthly' && item.categoryId === 'overall'
      );
      
      if (monthlyOverall) {
        saveData.period = 'monthly';
        saveData.amount = monthlyOverall.amount;
      } else if (budget.budgetItems.length > 0) {
        const firstItem = budget.budgetItems[0];
        if (firstItem.categoryId === 'overall') {
          saveData.period = firstItem.period;
          saveData.amount = firstItem.amount;
          if (firstItem.startDate) {
            try {
              saveData.startDate = Timestamp.fromDate(new Date(firstItem.startDate));
            } catch (e) {
              console.warn('處理相容性開始日期失敗', e);
            }
          }
          if (firstItem.endDate) {
            try {
              saveData.endDate = Timestamp.fromDate(new Date(firstItem.endDate));
            } catch (e) {
              console.warn('處理相容性結束日期失敗', e);
            }
          }
        }
      }
      
      // 保存類別預算（為向後兼容）
      const categoryBudgets = budget.budgetItems
        .filter(item => item.categoryId !== 'overall' && item.period === (saveData.period || 'monthly'))
        .map(item => ({
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          amount: item.amount
        }));
      
      if (categoryBudgets.length > 0) {
        saveData.categoryBudgets = categoryBudgets;
      }
      
      console.log('正在保存到 Firestore...', '數據大小約:', JSON.stringify(saveData).length, '字節');
      
      let savedSuccessfully = false;
      let errorMessage = '';
      
      // 嘗試方法1: 使用 setDoc 合并方式保存
      try {
      const budgetRef = doc(db, 'budgets', currentUser.uid);
        await setDoc(budgetRef, saveData, { merge: true });
        console.log('方法1保存成功: setDoc with merge');
        savedSuccessfully = true;
      } catch (error1) {
        console.error('方法1失敗: setDoc with merge', error1);
        errorMessage = error1 instanceof Error ? error1.message : '未知錯誤';
        
        // 嘗試方法2: 不使用 merge 參數，完全替換文檔
        try {
          console.log('嘗試方法2: setDoc without merge');
          const budgetRef = doc(db, 'budgets', currentUser.uid);
          await setDoc(budgetRef, saveData);
          console.log('方法2保存成功: setDoc without merge');
          savedSuccessfully = true;
        } catch (error2) {
          console.error('方法2失敗: setDoc without merge', error2);
          
          // 嘗試方法3: 分步驟保存，先保存基本設置，再保存項目數據
          try {
            console.log('嘗試方法3: 分步驟保存');
            const budgetRef = doc(db, 'budgets', currentUser.uid);
            
            // 先保存基本設置
            const basicSettings = {
              notificationEnabled: budget.notificationEnabled,
              lastUpdated: Timestamp.now()
            };
            await setDoc(budgetRef, basicSettings, { merge: true });
            console.log('基本設置保存成功');
            
            // 若有項目，嘗試保存項目數據
            if (processedItems.length > 0) {
              // 如果項目過多，分批保存
              const batchSize = 20;
              for (let i = 0; i < processedItems.length; i += batchSize) {
                const batch = processedItems.slice(i, i + batchSize);
                await setDoc(budgetRef, { 
                  budgetItems: batch,
                  partial: true,
                  batchIndex: Math.floor(i / batchSize)
                }, { merge: true });
                console.log(`批次 ${Math.floor(i / batchSize) + 1} 保存成功，項目: ${i} 到 ${Math.min(i + batchSize, processedItems.length)}`);
              }
            }
            
            console.log('方法3保存成功: 分步驟保存');
            savedSuccessfully = true;
          } catch (error3) {
            console.error('方法3失敗: 分步驟保存', error3);
            
            // 嘗試方法4: 最小化數據
            try {
              console.log('嘗試方法4: 最小化數據');
              const budgetRef = doc(db, 'budgets', currentUser.uid);
              
              // 僅保存最重要的數據，不包含自定義日期等複雜欄位
              const minimalData = {
                notificationEnabled: budget.notificationEnabled,
                lastUpdated: Timestamp.now(),
                simplifiedItems: budget.budgetItems.map((item: BudgetItem) => ({
                  id: item.id,
                  period: item.period,
                  amount: item.amount,
                  categoryId: item.categoryId,
                  categoryName: item.categoryName,
                  budgetType: item.budgetType || (item.categoryId === 'overall' ? 'overall' : 'multi'),
                  ...(item.budgetType === 'multi' && item.categories ? { categories: item.categories } : {})
                }))
              };
              
              await setDoc(budgetRef, minimalData);
              console.log('方法4保存成功: 最小化數據');
              savedSuccessfully = true;
            } catch (error4) {
              console.error('方法4失敗: 最小化數據', error4);
            }
          }
        }
      }
      
      if (savedSuccessfully) {
        console.log('預算設置保存成功');
      setSuccess('所有預算設置已保存');
      
      setTimeout(() => {
        setSuccess('');
      }, 3000);
        
        // 自動更新預算進度視圖
        try {
          // 觸發更新預算進度條的事件
          console.log('觸發預算進度條更新...');
          const event = new CustomEvent('refreshBudgetProgress');
          window.dispatchEvent(event);
        } catch (e) {
          console.warn('觸發預算進度條更新事件失敗', e);
        }
      } else {
        setError('保存預算設置失敗，請稍後再試');
        
        setTimeout(() => {
          setError('');
        }, 5000);
        
        return; // 避免拋出錯誤，因為已經處理了失敗情況
      }
      
    } catch (error) {
      console.error('保存預算設置失敗:', error);
      
      // 詳細記錄錯誤信息
      if (error instanceof Error) {
        console.error('錯誤詳情:', {
          名稱: error.name,
          訊息: error.message,
          堆疊: error.stack
        });
      }
      
      // 根據錯誤類型提供更具體的錯誤訊息
      let errorMessage = '無法保存預算設置，請稍後再試。';
      
      if (error instanceof Error) {
        const errorText = error.message.toLowerCase();
        
        if (errorText.includes('permission-denied')) {
          errorMessage = '權限不足，無法保存預算設置。請確保您已登入並重新整理頁面後再試。';
        } else if (errorText.includes('network') || errorText.includes('timeout') || errorText.includes('unavailable')) {
          errorMessage = '網絡連接問題，請檢查您的網絡連接後再試。';
        } else if (errorText.includes('quota-exceeded')) {
          errorMessage = '數據配額已超出限制，請稍後再試。';
        } else if (errorText.includes('unauthenticated') || errorText.includes('auth')) {
          errorMessage = '您的登入狀態已過期，請重新登入後再試。';
        } else if (errorText.includes('not-found')) {
          errorMessage = '找不到您的預算數據，可能是帳戶問題，請重新登入。';
        } else if (errorText.includes('deadline-exceeded')) {
          errorMessage = '操作超時，請稍後再試。';
        } else if (errorText.includes('resource-exhausted')) {
          errorMessage = '系統資源耗盡，請稍後再試。';
        } else if (errorText.includes('cancelled')) {
          errorMessage = '操作被取消，請再試一次。';
        } else if (errorText.includes('data-loss')) {
          errorMessage = '數據可能丟失，請重新設置預算。';
        } else if (errorText.includes('aborted')) {
          errorMessage = '操作被中止，請再試一次。';
        } else {
          errorMessage = `保存失敗: ${error.message}`;
        }
      }
      
      setError(errorMessage);
      
      // 如果是網絡問題，嘗試重試
      if (errorMessage.includes('網絡連接問題') || errorMessage.includes('操作超時')) {
        setTimeout(() => {
          console.log('正在嘗試重新保存預算設置...');
          saveAllSettings();
        }, 3000);
      }
    } finally {
      setLoading(false);
    }
  };
  
  // 切換通知設置
  const toggleNotification = () => {
    setBudget({
      ...budget,
      notificationEnabled: !budget.notificationEnabled
    });
  };
  
  // 获取周期的中文名称
  const getPeriodName = (period: BudgetPeriod): string => {
    switch (period) {
      case 'daily': return '每日';
      case 'weekly': return '每週';
      case 'monthly': return '每月';
      case 'yearly': return '每年';
      case 'custom': return '自訂';
      default: return period;
    }
  };
  
  // 格式化自定义日期范围
  const formatDateRange = (startDate?: Date, endDate?: Date): string => {
    if (!startDate || !endDate) return '';
    
    const formatDate = (date: Date) => {
      return `${date.getMonth() + 1}/${date.getDate()}`;
    };
    
    return `${formatDate(startDate)}-${formatDate(endDate)}`;
  };
  
  // 获取类别的图标
  const getCategoryIcon = (categoryId: string): string => {
    if (categoryId === 'overall') return 'fa-chart-pie';
    if (categoryId === 'food') return 'fa-utensils';
    if (categoryId === 'transportation') return 'fa-car';
    if (categoryId === 'entertainment') return 'fa-gamepad';
    if (categoryId === 'shopping') return 'fa-shopping-bag';
    if (categoryId === 'education') return 'fa-graduation-cap';
    if (categoryId === 'medical') return 'fa-briefcase-medical';
    if (categoryId === 'investment') return 'fa-chart-line';
    if (categoryId === 'utilities') return 'fa-home';
    return 'fa-tag';
  };
  
  // 获取类别的颜色
  const getCategoryColor = (categoryId: string): string => {
    if (categoryId === 'overall') return 'bg-[#A487C3]';
    if (categoryId === 'food') return 'bg-[#F59E0B]';
    if (categoryId === 'transportation') return 'bg-[#3B82F6]';
    if (categoryId === 'entertainment') return 'bg-[#EC4899]';
    if (categoryId === 'shopping') return 'bg-[#10B981]';
    if (categoryId === 'education') return 'bg-[#F59E0B]';
    if (categoryId === 'medical') return 'bg-[#EF4444]';
    if (categoryId === 'investment') return 'bg-[#059669]';
    if (categoryId === 'utilities') return 'bg-[#6366F1]';
    return 'bg-[#6B7280]';
  };
  
  // 获取周期图标
  const getPeriodIcon = (period: BudgetPeriod): string => {
    switch (period) {
      case 'daily': return 'fa-calendar-day';
      case 'weekly': return 'fa-calendar-week';
      case 'monthly': return 'fa-calendar-alt';
      case 'yearly': return 'fa-calendar';
      case 'custom': return 'fa-sliders-h';
      default: return 'fa-calendar';
    }
  };
  
  // 發送預算更新事件
  const dispatchBudgetEvent = () => {
    // 刷新預算進度條
    const refreshEvent = new CustomEvent('refreshBudgetProgress');
    window.dispatchEvent(refreshEvent);
    
    // 也通知其他可能需要更新的組件
    const budgetUpdatedEvent = new CustomEvent('budgetUpdated');
    window.dispatchEvent(budgetUpdatedEvent);
  };
  
  // 重置表单
  const resetForm = () => {
    setSelectedPeriod('monthly');
    setAmount('');
    setSelectedCategory('overall');
    setBudgetType('overall');
    setSelectedCategories([]);
    
    const today = new Date();
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(today.getDate() + 30);
    
    setStartDate(today.toISOString().slice(0, 10));
    setEndDate(thirtyDaysLater.toISOString().slice(0, 10));
    
    setEditingItemId(null);
  };
  
  return (
    <div className="budget-container p-6 text-gray-800">
      <div className="flex justify-between items-center mb-6 sticky top-0 z-10 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold text-[#333333] flex items-center">
          <div className="w-8 h-8 bg-[#A487C3] rounded-lg flex items-center justify-center shadow-sm mr-3">
            <i className="fas fa-money-bill-wave text-white text-sm"></i>
          </div>
          預算設置
        </h2>
        <button 
          onClick={onClose}
          className="close-button"
          aria-label="關閉表單"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
      
      {error && (
        <div className="budget-notification error-message">
          <i className="fas fa-exclamation-circle mr-2 animate-pulse"></i>
          {error}
        </div>
      )}
      
      {success && (
        <div className="budget-notification success-message">
          <i className="fas fa-check-circle mr-2"></i>
          {success}
        </div>
      )}
      
      {/* 切换表单与列表视图的按钮 */}
      <div className="flex items-center justify-center mb-6">
        <div className="budget-toggle-buttons flex">
        <button
            onClick={() => setShowAddForm(true)}
            className={`budget-toggle-button ${showAddForm ? 'active' : ''}`}
          >
            <span className="budget-toggle-button-icon">
              <i className="fas fa-plus"></i>
          </span>
            添加預算
        </button>
        <button
            onClick={() => setShowAddForm(false)}
            className={`budget-toggle-button ${!showAddForm ? 'active' : ''}`}
          >
            <span className="budget-toggle-button-icon">
              <i className="fas fa-list-alt"></i>
          </span>
            預算列表
            {budget.budgetItems.length > 0 && (
              <span className="budget-toggle-count">
                {budget.budgetItems.length}
              </span>
          )}
        </button>
        </div>
      </div>
      
      {/* 添加预算表单 */}
      {showAddForm && (
        <div className="budget-form-container">
        <div className="space-y-6">
            {/* 预算类型选择 */}
            <div className="form-control zoom-in animation-delay-100">
              <label className="form-label">
                <i className="fas fa-tags mr-2 text-[#A487C3]"></i>
                預算類型
            </label>
              <div className="mb-3">
                <div className="budget-type-buttons flex gap-2 mb-2">
              <button
                type="button"
                    className={`flex-1 py-2 px-4 rounded-lg transition-all budget-type-btn ${
                      budgetType === 'overall' 
                        ? 'bg-[#A487C3] text-white shadow-md active' 
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                    onClick={() => setBudgetType('overall')}
                  >
                    <span className="budget-type-icon">
                      <i className="fas fa-chart-pie mr-2"></i>
                    </span>
                    總體預算
              </button>
              <button
                type="button"
                    className={`flex-1 py-2 px-4 rounded-lg transition-all budget-type-btn ${
                      budgetType === 'multi' 
                        ? 'bg-[#A487C3] text-white shadow-md active' 
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                    onClick={() => setBudgetType('multi')}
                  >
                    <span className="budget-type-icon">
                      <i className="fas fa-object-group mr-2 cat-budget-icon"></i>
                    </span>
                    類別預算
                  </button>
                </div>
                <div className="form-hint budget-type-hint">
                  {budgetType === 'overall' && (
                    <>
                      <i className="fas fa-info-circle mr-2 text-[#A487C3]"></i>
                      總體預算適用於所有支出類別的總和
                    </>
                  )}
                  {budgetType === 'multi' && (
                    <>
                      <i className="fas fa-lightbulb mr-2 text-[#A487C3]"></i>
                      類別預算可以將指定類別視為一個整體進行預算控制
                    </>
                  )}
                </div>
              </div>
              
              {/* 根據預算類型顯示不同的選擇界面 */}
              {budgetType === 'multi' && (
                <div className="multi-category-select">
                  <div className="category-checkboxes grid grid-cols-2 gap-2 mt-2">
                    {categories.map((category) => (
                      <label 
                        key={category.id} 
                        className={`category-checkbox flex items-center p-2 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedCategories.includes(category.id) 
                            ? 'bg-[#F0EAFA] border-[#A487C3] text-[#A487C3] selected' 
                            : 'bg-white border-[#A487C3] text-gray-700 hover:bg-[#F8F9FA] hover:border-[#8A5DC8]'
                        }`}
                        onClick={(e) => {
                          // 阻止默認行為，手動處理選擇狀態
                          e.preventDefault();
                          
                          // 切換選擇狀態並添加動畫類名
                          const isSelected = selectedCategories.includes(category.id);
                          
                          if (isSelected) {
                            setSelectedCategories(selectedCategories.filter(id => id !== category.id));
                            // 添加移除動畫
                            e.currentTarget.classList.add('category-tag-exit');
                            // 動畫結束後移除類名
                            setTimeout(() => {
                              e.currentTarget.classList.remove('category-tag-exit');
                            }, 200);
                          } else {
                            setSelectedCategories([...selectedCategories, category.id]);
                            // 添加選擇動畫
                            e.currentTarget.classList.add('category-tag-enter');
                            // 動畫結束後移除類名
                            setTimeout(() => {
                              e.currentTarget.classList.remove('category-tag-enter');
                            }, 300);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={selectedCategories.includes(category.id)}
                          readOnly
                        />
                        <div className="relative flex items-center">
                          <i className={`fas fa-square category-checkbox-icon-uncheck ${selectedCategories.includes(category.id) ? 'opacity-0 scale-0' : ''} mr-2`}></i>
                          <i className={`fas fa-check-square category-checkbox-icon-check ${selectedCategories.includes(category.id) ? 'opacity-100 scale-100' : ''} mr-2 text-[#A487C3]`}></i>
                        </div>
                        <span>{category.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="selected-categories">
                    <div className="selected-count-wrapper">
                      <span>已選擇</span>
                      <span className="selected-count">{selectedCategories.length}</span>
                      <span>個類別</span>
                    </div>
                    {selectedCategories.length > 0 ? (
                      <div className="selected-categories-wrap flex flex-wrap gap-1">
                        {selectedCategories.map((catId, index) => {
                          const category = categories.find(c => c.id === catId);
                          return (
                            <span 
                              key={catId} 
                              className="category-tag"
                              style={{"--index": index} as React.CSSProperties}
                            >
                              <i className="fas fa-tag category-tag-icon"></i>
                              {category?.name || catId}
                              <button
                                type="button"
                                className="category-tag-remove"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // 添加刪除動畫
                                  const parentTag = e.currentTarget.parentElement;
                                  if (parentTag) {
                                    parentTag.classList.add('category-tag-exit');
                                    // 等待動畫完成後再刪除
                                    setTimeout(() => {
                                      setSelectedCategories(selectedCategories.filter(id => id !== catId));
                                    }, 200);
                                  } else {
                                    setSelectedCategories(selectedCategories.filter(id => id !== catId));
                                  }
                                }}
                              >
                                <i className="fas fa-times"></i>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="empty-categories-message">
                        請從上方選擇至少一個類別
                      </div>
                    )}
                    
                    {/* 說明文字 */}
                    <div className="add-category-hint mt-4">
                      <div className="add-category-hint-icon">
                        <i className="fas fa-lightbulb"></i>
                      </div>
                      <div className="add-category-hint-text">
                        <p>選擇多個類別建立共享預算，這些類別的支出將共同計入此預算額度中。</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* 预算周期选择 - 采用图标按钮组 */}
            <div className="form-control zoom-in animation-delay-200">
              <label className="form-label">
                <i className="fas fa-clock mr-2 text-[#A487C3]"></i>
                預算週期
              </label>
              <div className="period-buttons">
                {/* 每日预算 */}
                <button
                  type="button"
                  className={`period-button ${selectedPeriod === 'daily' ? 'active' : ''}`}
                  onClick={() => setSelectedPeriod('daily')}
                >
                  <i className="fas fa-calendar-day"></i>
                  <span>每日</span>
                </button>
                
                {/* 每周预算 */}
                <button
                  type="button"
                  className={`period-button ${selectedPeriod === 'weekly' ? 'active' : ''}`}
                onClick={() => setSelectedPeriod('weekly')}
              >
                  <i className="fas fa-calendar-week"></i>
                  <span>每週</span>
              </button>
                
                {/* 每月预算 */}
              <button
                type="button"
                  className={`period-button ${selectedPeriod === 'monthly' ? 'active' : ''}`}
                onClick={() => setSelectedPeriod('monthly')}
              >
                  <i className="fas fa-calendar-alt"></i>
                  <span>每月</span>
              </button>
                
                {/* 每年预算 */}
              <button
                type="button"
                  className={`period-button ${selectedPeriod === 'yearly' ? 'active' : ''}`}
                onClick={() => setSelectedPeriod('yearly')}
              >
                  <i className="fas fa-calendar"></i>
                  <span>每年</span>
              </button>
                
                {/* 自定义预算 */}
              <button
                type="button"
                  className={`period-button ${selectedPeriod === 'custom' ? 'active' : ''}`}
                onClick={() => setSelectedPeriod('custom')}
              >
                  <i className="fas fa-sliders-h"></i>
                  <span>自訂</span>
              </button>
            </div>
          </div>
          
            {/* 自定义日期范围选择 */}
          {selectedPeriod === 'custom' && (
              <div className="custom-date-range zoom-in animation-delay-300">
                <div className="grid grid-cols-2 gap-4">
                  <div className="date-field">
                    <label htmlFor="startDate" className="form-label">
                      <i className="fas fa-calendar-plus mr-2 text-[#A487C3]"></i>
                  開始日期
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                      className="form-input"
                />
              </div>
                  <div className="date-field">
                    <label htmlFor="endDate" className="form-label">
                      <i className="fas fa-calendar-minus mr-2 text-[#A487C3]"></i>
                  結束日期
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                      className="form-input"
                />
                  </div>
              </div>
            </div>
          )}
          
            {/* 预算金额输入 */}
            <div className="form-control zoom-in animation-delay-400">
              <label htmlFor="amount" className="form-label">
                <i className="fas fa-dollar-sign mr-2 text-[#A487C3]"></i>
              預算金額
            </label>
              <div className="amount-input-container">
                <div className="currency-symbol">NT$</div>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                  className="form-input"
                placeholder="輸入預算金額"
                min="0"
                step="100"
              />
                <div className="amount-buttons-title">快速金額</div>
                <div className="amount-buttons">
                  <button type="button" className="quick-amount-btn" onClick={() => setAmount('1000')}>
                    <span>1,000</span>
                  </button>
                  <button type="button" className="quick-amount-btn" onClick={() => setAmount('5000')}>
                    <span>5,000</span>
                  </button>
                  <button type="button" className="quick-amount-btn" onClick={() => setAmount('10000')}>
                    <span>10,000</span>
                  </button>
                  <button type="button" className="quick-amount-btn" onClick={() => setAmount('50000')}>
                    <span>50,000</span>
                  </button>
            </div>
              </div>
              <div className="form-hint">
                設定{" "}
              {selectedPeriod === 'daily' 
                ? '每日' 
                : selectedPeriod === 'weekly' 
                  ? '每週' 
                  : selectedPeriod === 'monthly' 
                    ? '每月' 
                    : selectedPeriod === 'custom'
                      ? '所選時間區間'
                        : '每年'}{" "}
                {selectedCategory === 'overall' ? '總體' : categories.find(c => c.id === selectedCategory)?.name || '類別'}{" "}
                預算上限
              </div>
          </div>
          
            {/* 添加预算按钮 */}
            <div className="form-action zoom-in animation-delay-500">
            <button
              type="button"
                onClick={addBudgetItem}
                className="add-budget-button"
            >
                <i className="fas fa-plus-circle mr-2"></i>
                添加預算
            </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 预算项目列表 */}
      {!showAddForm && (
        <div className="budget-list-container">
          <h3 className="section-title slide-in-left">
            <i className="fas fa-list-ul mr-2"></i>
            預算列表
          </h3>
          
          {budget.budgetItems.length === 0 ? (
            <div className="empty-list">
              <div className="empty-icon">
                <i className="fas fa-coins"></i>
              </div>
              <p>尚未設置任何預算</p>
            <button
                onClick={() => setShowAddForm(true)}
                className="add-first-budget"
            >
              <i className="fas fa-plus mr-2"></i>
                添加第一個預算
            </button>
          </div>
          ) : (
            <div className="budget-items">
              {budget.budgetItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`budget-item ${fadeInItems ? 'fade-in' : ''}`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="budget-item-content">
                    <div className={`budget-item-icon ${getCategoryColor(item.categoryId)}`}>
                      <i className={`fas ${getCategoryIcon(item.categoryId)}`}></i>
                    </div>
                    
                    <div className="budget-item-info">
                      <h4 className="budget-item-title">
                        <span className="budget-period">
                          <i className={`fas ${getPeriodIcon(item.period)} mr-1 text-[#A487C3]`}></i>
                          {getPeriodName(item.period)}
                      </span>
                        <span className="budget-name">
                          {item.categoryId === 'overall' ? '總體預算' : item.categoryName}
                        </span>
                        {item.period === 'custom' && (
                          <span className="budget-date-range">
                            <i className="fas fa-calendar-alt mr-1"></i>
                            {formatDateRange(item.startDate, item.endDate)}
                          </span>
                        )}
                      </h4>
                      <p className="budget-amount">
                        {formatAmount(item.amount)}
                      </p>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => removeBudgetItem(item.id)}
                      className="budget-delete-button"
                      aria-label="刪除預算"
                    >
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
      
      {/* 分隔線 */}
      <div className="divider">
        <span>設置選項</span>
      </div>
      
      {/* 預算通知設置 */}
      <div className="notification-setting slide-in-bottom">
        <div className="notification-content">
          <div className="notification-info">
            <div className="notification-icon">
              <i className="fas fa-bell"></i>
            </div>
          <div>
              <h4>啟用超支提醒</h4>
              <p>當支出接近或超過預算時通知您</p>
          </div>
          </div>
          
          <div className="toggle-switch">
            <input
              type="checkbox"
              id="toggleNotification"
              checked={budget.notificationEnabled}
              onChange={toggleNotification}
              className="toggle-input"
            />
            <label htmlFor="toggleNotification" className="toggle-label"></label>
          </div>
        </div>
      </div>
      
      {/* 保存按鈕 */}
      <div className="action-buttons slide-in-bottom animation-delay-200">
        <button
          type="button"
          onClick={onClose}
          className="cancel-button"
        >
          <i className="fas fa-times mr-1"></i>
          取消
        </button>
        <button
          type="button"
          onClick={saveAllSettings}
          disabled={loading}
          className="save-button"
        >
          {loading ? (
            <>
              <span className="loader"></span>
              保存中...
            </>
          ) : (
            <>
              <i className="fas fa-save mr-1"></i>
              保存所有設置
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default BudgetSetting; 