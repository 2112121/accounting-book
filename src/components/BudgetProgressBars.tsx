import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { formatAmount } from '../utils/formatters';

// 添加自定義動畫
const budgetAnimationStyles = `
  @keyframes fadeSlideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pulseGlow {
    0% {
      box-shadow: 0 0 0 0 rgba(164, 135, 195, 0.4);
    }
    70% {
      box-shadow: 0 0 0 10px rgba(164, 135, 195, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(164, 135, 195, 0);
    }
  }

  @keyframes redPulseGlow {
    0% {
      box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
    }
    70% {
      box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
    }
  }

  @keyframes progressFill {
    from { width: 0%; }
    to { width: var(--target-width); }
  }
  
  @keyframes expandCollapse {
    from { max-height: 0; opacity: 0; }
    to { max-height: var(--expanded-height); opacity: 1; }
  }
  
  @keyframes collapseExpand {
    from { max-height: var(--expanded-height); opacity: 1; }
    to { max-height: 0; opacity: 0; }
  }
  
  @keyframes subtlePulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.02); opacity: 0.9; }
  }
  
  @keyframes gentleGlow {
    0%, 100% { opacity: 0.8; box-shadow: 0 0 5px rgba(164, 135, 195, 0.3); }
    50% { opacity: 1; box-shadow: 0 0 10px rgba(164, 135, 195, 0.5); }
  }

  .budget-card {
    animation: fadeSlideUp 0.5s ease-out forwards;
    animation-delay: calc(var(--index) * 100ms);
    opacity: 0;
  }

  .budget-card:hover {
    transform: translateY(-4px);
  }

  .progress-bar-fill {
    animation: progressFill 1.5s ease-out forwards;
  }

  .pulse-glow {
    animation: pulseGlow 2s infinite;
  }

  .red-pulse-glow {
    animation: redPulseGlow 2s infinite;
  }
  
  .budget-content-expanding {
    animation: expandCollapse 0.5s ease-out forwards;
    overflow: hidden;
  }
  
  .budget-content-collapsing {
    animation: collapseExpand 0.5s ease-out forwards;
    overflow: hidden;
  }
  
  .subtle-pulse {
    animation: subtlePulse 3s ease-in-out infinite;
  }
  
  .gentle-glow {
    animation: gentleGlow 4s ease-in-out infinite;
  }
  
  .chevron-rotate {
    transition: transform 0.3s ease;
  }
  
  .chevron-rotate-down {
    transform: rotate(180deg);
  }
`;

// 插入樣式到文檔頭部
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.type = 'text/css';
  styleEl.appendChild(document.createTextNode(budgetAnimationStyles));
  document.head.appendChild(styleEl);
}

interface BudgetItem {
  id: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  amount: number;
  categoryId: string | 'overall';
  categoryName: string;
  startDate?: Date;
  endDate?: Date;
  budgetType?: 'multi' | 'overall'; // 預算類型: 類別預算或總體
  categories?: string[]; // 多類別預算選擇的類別ID列表
}

interface Expense {
  id: string;
  amount: number;
  categoryId: string;
  categoryName: string;
  date: Date;
  category?: {
    id: string;
    name: string;
    icon?: string;
  };
  notes: string;
}

interface BudgetProgress {
  id: string;
  period: string;
  categoryId: string;
  categoryName: string;
  budgetAmount: number;
  currentAmount: number;
  percentage: number;
  isOverBudget: boolean;
}

const BudgetProgressBars: React.FC = () => {
  const { currentUser } = useAuth();
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgetProgress, setBudgetProgress] = useState<BudgetProgress[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  
  // 當沒有預算項目時自動摺疊
  useEffect(() => {
    if (!loading && budgetProgress.length === 0) {
      setCollapsed(true);
    }
  }, [budgetProgress, loading]);
  
  // 載入預算設置和支出數據
  useEffect(() => {
    if (!currentUser) return;
    
    const loadBudgetAndExpenses = async () => {
      try {
        setLoading(true);
        console.log('開始載入預算進度數據...');
        // 載入預算設置
        await loadBudgetItems();
        // 載入類別信息
        await loadCategories();
        // 載入支出數據
        await loadExpenses();
        console.log('預算進度數據加載完成');
      } catch (err) {
        console.error('加載預算進度數據失敗:', err);
        setError('無法加載預算進度數據，請稍後再試。');
      } finally {
        setLoading(false);
      }
    };
    
    // 立即加載數據
    loadBudgetAndExpenses();

    // 添加刷新預算進度的事件監聽器
    const handleRefreshBudgetProgress = () => {
      console.log('收到刷新預算進度事件，正在重新加載數據...');
      // 使用新的Promise強制刷新數據
      Promise.resolve().then(async () => {
        try {
          setLoading(true);
          // 先清空現有數據，強制UI重新渲染
          setBudgetItems([]);
          setBudgetProgress([]);
          // 等待一個短暫的時間確保UI已更新
          await new Promise(resolve => setTimeout(resolve, 100));
          // 重新載入所有數據
          await loadBudgetItems();
          await loadExpenses();
          console.log('預算進度數據刷新完成');
          // 顯示成功訊息
          setSuccess('預算數據已更新！');
          // 3秒後清除成功提示
          setTimeout(() => {
            setSuccess('');
          }, 3000);
        } catch (err) {
          console.error('刷新預算進度數據失敗:', err);
          setError('刷新預算數據時出錯，請再試一次。');
          // 5秒後清除錯誤提示
          setTimeout(() => {
            setError('');
          }, 5000);
        } finally {
          setLoading(false);
        }
      });
    };

    // 監聽支出新增事件
    const handleExpenseAdded = () => {
      console.log('收到支出新增事件，正在更新預算進度...');
      loadExpenses().then(() => {
        console.log('支出數據已更新，預算進度將自動重新計算');
      }).catch(err => {
        console.error('更新支出數據失敗:', err);
      });
    };

    // 也設置一個定時自動刷新，確保數據始終最新
    const intervalId = setInterval(() => {
      console.log('定時刷新預算進度數據...');
      loadBudgetAndExpenses();
    }, 60000); // 每分鐘刷新一次

    // 添加事件監聽器
    window.addEventListener('refreshBudgetProgress', handleRefreshBudgetProgress);
    window.addEventListener('expenseAdded', handleExpenseAdded);
    window.addEventListener('expenseDeleted', handleExpenseAdded); // 使用相同的處理函數
    window.addEventListener('expenseUpdated', handleExpenseAdded); // 使用相同的處理函數
    
    return () => {
      // 移除事件監聽器
      window.removeEventListener('refreshBudgetProgress', handleRefreshBudgetProgress);
      window.removeEventListener('expenseAdded', handleExpenseAdded);
      window.removeEventListener('expenseDeleted', handleExpenseAdded);
      window.removeEventListener('expenseUpdated', handleExpenseAdded);
      clearInterval(intervalId); // 清除定時器
    };
  }, [currentUser]);
  
  // 當預算項目或支出數據更新時，計算預算進度
  useEffect(() => {
    if (budgetItems.length > 0 && expenses.length > 0) {
      calculateBudgetProgress();
    } else if (budgetItems.length > 0 && expenses.length === 0) {
      // 有預算項目但沒有支出數據，顯示零支出的進度條
      const emptyProgress = budgetItems.map(budget => ({
        id: budget.id,
        period: getPeriodTranslation(budget.period),
        categoryId: budget.categoryId,
        categoryName: budget.categoryId === 'overall' ? '總體' : budget.categoryName,
        budgetAmount: budget.amount,
        currentAmount: 0,
        percentage: 0,
        isOverBudget: false
      }));
      setBudgetProgress(emptyProgress);
    } else if (budgetItems.length === 0) {
      // 沒有預算項目，清空進度條
      setBudgetProgress([]);
    }
  }, [budgetItems, expenses]);
  
  // 載入預算項目
  const loadBudgetItems = async () => {
    try {
      if (!currentUser) {
        console.log('用戶未登入，無法載入預算項目');
        return;
      }
      
      console.log('正在從Firestore載入預算項目...');
      const budgetRef = doc(db, 'budgets', currentUser.uid);
      const budgetDoc = await getDoc(budgetRef);
      
      if (budgetDoc.exists()) {
        const data = budgetDoc.data();
        console.log('獲取到預算數據:', { 
          有budgetItems: !!data.budgetItems, 
          有simplifiedItems: !!data.simplifiedItems,
          項目數量: data.budgetItems?.length || data.simplifiedItems?.length || 0,
          是否有舊版格式: !data.budgetItems && !data.simplifiedItems && !!data.period
        });
        
        // 獲取預算項目
        let items: BudgetItem[] = [];
        
        // 處理新版預算格式
        if (data.budgetItems && Array.isArray(data.budgetItems)) {
          console.log(`處理新版預算格式，共${data.budgetItems.length}個項目`);
          items = data.budgetItems.map((item: any, index: number) => {
            try {
              // 轉換日期格式
              let startDate = undefined;
              let endDate = undefined;
              
              if (item.startDate) {
                startDate = item.startDate instanceof Timestamp 
                  ? item.startDate.toDate() 
                  : new Date(item.startDate);
              }
              
              if (item.endDate) {
                endDate = item.endDate instanceof Timestamp 
                  ? item.endDate.toDate() 
                  : new Date(item.endDate);
              }
              
              // 返回處理後的預算項目，確保可選屬性符合類型定義
              return {
                id: item.id || `item-${index}-${Date.now()}`,
                period: item.period || 'monthly',
                amount: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) || 0,
                categoryId: item.categoryId || 'overall',
                categoryName: item.categoryName || '總體',
                ...(startDate ? { startDate } : {}),
                ...(endDate ? { endDate } : {}),
                budgetType: item.budgetType || 'multi',
                categories: item.categories || []
              } as BudgetItem;
            } catch (error) {
              console.error(`處理預算項目 ${index} 時出錯:`, error, item);
              return null;
            }
          }).filter((item): item is BudgetItem => item !== null);
        } else if (data.simplifiedItems && Array.isArray(data.simplifiedItems)) {
          // 處理簡化格式
          console.log(`處理簡化預算格式，共${data.simplifiedItems.length}個項目`);
          items = data.simplifiedItems.map((item: any, index: number) => {
            try {
              return {
                id: item.id || `simplified-${index}-${Date.now()}`,
                period: item.period || 'monthly',
                amount: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) || 0,
                categoryId: item.categoryId || 'overall',
                categoryName: item.categoryName || '總體',
                budgetType: item.budgetType || 'multi',
                categories: item.categories || []
              } as BudgetItem;
            } catch (error) {
              console.error(`處理簡化預算項目 ${index} 時出錯:`, error, item);
              return null;
            }
          }).filter((item): item is BudgetItem => item !== null);
        } else {
          // 處理舊版預算格式
          console.log('處理舊版預算格式', data);
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
              
              items.push({
                id: `overall-${data.period}-legacy`,
                period: data.period as any,
                amount: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0,
                categoryId: 'overall',
                categoryName: '總體',
                startDate,
                endDate,
                budgetType: 'overall'
              } as BudgetItem);
            } catch (error) {
              console.error('處理總體預算時出錯:', error);
            }
          }
          
          // 處理類別預算
          if (data.categoryBudgets && Array.isArray(data.categoryBudgets)) {
            console.log(`處理舊版類別預算，共${data.categoryBudgets.length}個項目`);
            data.categoryBudgets.forEach((cat: any) => {
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
                
                items.push({
                  id: `${cat.categoryId}-${data.period || 'monthly'}-legacy`,
                  period: data.period || 'monthly',
                  amount: typeof cat.amount === 'number' ? cat.amount : parseFloat(cat.amount) || 0,
                  categoryId: cat.categoryId,
                  categoryName: cat.categoryName,
                  startDate,
                  endDate,
                  budgetType: 'multi'
                } as BudgetItem);
              } catch (error) {
                console.error('處理類別預算時出錯:', error, cat);
              }
            });
          }
        }
        
        console.log(`預算項目載入完成，共處理了${items.length}個項目`);
        setBudgetItems(items);
      } else {
        console.log('未找到預算設置，清空預算項目');
        setBudgetItems([]);
      }
    } catch (err) {
      console.error('載入預算項目失敗:', err);
      throw err;
    }
  };
  
  // 載入類別信息
  const loadCategories = async () => {
    try {
      if (!currentUser) {
        console.log('用戶未登入，無法載入類別數據');
        return;
      }
      
      // 先嘗試從用戶配置中載入類別
      const categoriesRef = collection(db, 'categories');
      const categoriesQuery = query(categoriesRef, where('userId', '==', currentUser.uid));
      const categoriesSnapshot = await getDocs(categoriesQuery);
      
      if (!categoriesSnapshot.empty) {
        const categoriesData = categoriesSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || 'Unknown'
          };
        });
        
        setCategories(categoriesData);
        console.log('已載入類別數據:', categoriesData.length);
      } else {
        // 如果沒有找到用戶定義的類別，使用默認類別
        const defaultCategories = [
          { id: 'food', name: '餐飲' },
          { id: 'transportation', name: '交通' },
          { id: 'shopping', name: '購物' },
          { id: 'entertainment', name: '娛樂' },
          { id: 'utilities', name: '住支' },
          { id: 'education', name: '教育' },
          { id: 'medical', name: '醫療' },
          { id: 'other', name: '其他' },
        ];
        
        setCategories(defaultCategories);
        console.log('未找到用戶類別，使用默認類別');
      }
    } catch (err) {
      console.error('載入類別數據失敗:', err);
      // 使用默認類別
      const defaultCategories = [
        { id: 'food', name: '餐飲' },
        { id: 'transportation', name: '交通' },
        { id: 'shopping', name: '購物' },
        { id: 'entertainment', name: '娛樂' },
        { id: 'utilities', name: '住支' },
        { id: 'education', name: '教育' },
        { id: 'medical', name: '醫療' },
        { id: 'other', name: '其他' },
      ];
      
      setCategories(defaultCategories);
    }
  };
  
  // 載入支出數據
  const loadExpenses = async () => {
    try {
      if (!currentUser) {
        console.log('用戶未登入，無法載入支出數據');
        return;
      }
      
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      
      // 查詢支出數據 - 至少包含當年的數據以確保所有時間範圍的預算計算
      const expensesRef = collection(db, 'expenses');
      const expensesQuery = query(
        expensesRef,
        where('userId', '==', currentUser.uid),
        where('date', '>=', startOfYear),
      );
      
      console.log('正在查詢支出數據...');
      const expensesSnapshot = await getDocs(expensesQuery);
      console.log(`找到 ${expensesSnapshot.docs.length} 筆支出記錄`);
      
      // 用於診斷的類別統計
      const categoryStats = {
        totalProcessed: 0,
        byFormat: {
          objectFormat: 0,
          stringFormat: 0,
          directProperties: 0
        },
        byCategory: {} as Record<string, number>
      };
      
      const expensesData = expensesSnapshot.docs.map(doc => {
        const data = doc.data();
        categoryStats.totalProcessed++;
        
        // 處理日期
        let expenseDate;
        try {
          if (data.date instanceof Timestamp) {
            expenseDate = data.date.toDate();
          } else if (data.date && typeof data.date === 'object' && 'seconds' in data.date) {
            expenseDate = new Date(data.date.seconds * 1000);
          } else {
            expenseDate = new Date(data.date);
          }
          
          if (isNaN(expenseDate.getTime())) {
            console.error(`支出ID=${doc.id}的日期無效:`, data.date);
            expenseDate = new Date(); // 使用當前日期作為後備
          }
        } catch (error) {
          console.error(`處理支出日期時出錯:`, error);
          expenseDate = new Date(); // 使用當前日期作為後備
        }
        
        // 初始化類別信息
        let categoryId = '';
        let categoryName = '';
        let categoryObj: any = null;
        
        // 處理不同的類別格式
        if (data.category && typeof data.category === 'object') {
          // 類別是對象格式: {id: 'food', name: '餐飲'}
          categoryStats.byFormat.objectFormat++;
          categoryObj = data.category;
          categoryId = data.category.id || '';
          categoryName = data.category.name || '';
          console.log(`從category對象提取: ID=${categoryId}, 名稱=${categoryName}`);
        } else if (typeof data.category === 'string') {
          // 類別是字符串格式，直接作為ID使用
          categoryStats.byFormat.stringFormat++;
          categoryId = data.category;
          categoryName = data.category;
          console.log(`從category字符串提取: ID/名稱=${categoryId}`);
        } else if (data.categoryId || data.categoryName) {
          // 類別信息直接作為屬性
          categoryStats.byFormat.directProperties++;
          categoryId = data.categoryId || '';
          categoryName = data.categoryName || categoryId;
          console.log(`從直接屬性提取: ID=${categoryId}, 名稱=${categoryName}`);
        }
        
        // 確保類別ID和名稱不為空，並嘗試從筆記內容推斷類別
        if (!categoryId && !categoryName && data.notes) {
          // 嘗試從筆記中推斷類別
          const notes = data.notes.toLowerCase();
          
          // 遍歷類別映射尋找匹配
          for (const [id, names] of Object.entries(categoryMappings)) {
            if (names.some(name => notes.includes(name.toLowerCase()))) {
              categoryId = id;
              categoryName = names[0]; // 使用第一個名稱作為顯示名稱
              console.log(`從筆記推斷類別: ID=${categoryId}, 名稱=${categoryName}, 筆記=${data.notes}`);
              break;
            }
          }
        }
        
        // 如果仍然沒有類別，設為"其他"
        if (!categoryId) {
          categoryId = 'other';
          categoryName = '其他';
          console.log(`無法確定類別，設為: ID=${categoryId}, 名稱=${categoryName}`);
        }
        
        // 更新類別統計
        categoryStats.byCategory[categoryId] = (categoryStats.byCategory[categoryId] || 0) + 1;
        
        // 建立支出對象
        const expense = {
          id: doc.id,
          amount: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0,
          categoryId,
          categoryName,
          date: expenseDate,
          category: categoryObj || { id: categoryId, name: categoryName },
          notes: data.notes || ''
        };
        
        return expense;
      });
      
      // 輸出類別統計信息
      console.log('支出數據類別統計:', {
        總處理數量: categoryStats.totalProcessed,
        格式統計: categoryStats.byFormat,
        類別分布: categoryStats.byCategory
      });
      
      setExpenses(expensesData);
      console.log('已載入支出數據:', expensesData.length);
    } catch (err) {
      console.error('載入支出數據失敗:', err);
      throw err;
    }
  };
  
  // 類別ID和名稱的對應表，確保正確匹配
  const categoryMappings: Record<string, string[]> = {
    'food': ['餐飲', '飲食', '食物', '吃飯', '餐廳', '外食'],
    'transportation': ['交通', '運輸', '車費', '車資', '公車', '捷運', '計程車', '高鐵'],
    'entertainment': ['娛樂', '休閒', '遊戲', '電影', '觀光', '旅遊'],
    'shopping': ['購物', '服飾', '衣物', '雜貨', '日用品'],
    'education': ['教育', '學習', '書籍', '課程', '學費', '文具'],
    'medical': ['醫療', '健康', '藥品', '醫院', '診所', '保健'],
    'investment': ['投資', '理財', '股票', '基金', '存款'],
    'utilities': ['住支', '瓦斯', '網路', '電話', '通訊', '公共事業', '公用事業'],
    'other': ['其他', '雜項', '未分類']
  };

  // 判斷一個支出是否屬於特定類別
  const isExpenseInCategory = (expense: Expense, categoryId: string): boolean => {
    // 處理總體預算
    if (categoryId === 'overall') {
      return true;
    }
    
    // 獲取標準化的類別ID和可能的類別名稱列表
    const normalizedCategoryId = categoryId.toLowerCase();
    const categoryNames = categoryMappings[normalizedCategoryId] || [];
    
    // 1. 直接比較ID（不區分大小寫）
    if (expense.categoryId && expense.categoryId.toLowerCase() === normalizedCategoryId) {
      // 成功匹配ID
      return true;
    }
    
    // 2. 檢查categoryName是否匹配ID或別名
    if (expense.categoryName) {
      const expenseCategoryNameLower = expense.categoryName.toLowerCase();
      
      // 直接匹配ID
      if (expenseCategoryNameLower === normalizedCategoryId) {
        return true;
      }
      
      // 檢查是否匹配類別的任何別名
      if (categoryNames.some(name => expenseCategoryNameLower.includes(name.toLowerCase()))) {
        return true;
      }
    }
    
    // 3. 檢查category對象
    if (expense.category && typeof expense.category === 'object') {
      // 檢查category.id
      if (expense.category.id && expense.category.id.toLowerCase() === normalizedCategoryId) {
        return true;
      }
      
      // 檢查category.name
      if (expense.category.name) {
        const categoryNameLower = expense.category.name.toLowerCase();
        
        // 直接匹配ID
        if (categoryNameLower === normalizedCategoryId) {
          return true;
        }
        
        // 檢查是否匹配類別的任何別名
        if (categoryNames.some(name => categoryNameLower.includes(name.toLowerCase()))) {
          return true;
        }
      }
    }
    
    // 如果是"other"類別，檢查是否不屬於任何其他類別
    if (normalizedCategoryId === 'other') {
      // 檢查這個支出是否屬於任何其他已知類別
      const belongsToOtherCategory = Object.keys(categoryMappings)
        .filter(id => id !== 'other')
        .some(catId => isExpenseInCategory(expense, catId));
      
      // 如果不屬於任何其他類別，則歸為"other"
      return !belongsToOtherCategory;
    }
    
    return false;
  };
  
  // 新增：判斷支出是否屬於多類別中的任一類別
  const isExpenseInMultiCategories = (expense: Expense, categoryIds: string[]): boolean => {
    // 檢查是否屬於任何一個指定的類別
    return categoryIds.some(categoryId => isExpenseInCategory(expense, categoryId));
  };
  
  // 計算預算進度
  const calculateBudgetProgress = () => {
    const now = new Date();
    
    // 計算各種時間範圍，精確到毫秒
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    // 計算本週的開始(週一)和結束(週日)，符合國際標準的週計算
    const dayOfWeek = now.getDay(); // 0(週日)到6(週六)
    // 獲得週一日期：如果是週日(0)，往前退6天；其他情況往前退(day-1)天
    const startOfWeek = new Date(now);
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(now.getDate() - daysToSubtract);
    startOfWeek.setHours(0, 0, 0, 0);
    
    // 週末為下週日，即週一加6天
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    // 計算月初和月末
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    // 計算年初和年末
    const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    
    console.log('開始計算預算進度，目前時間範圍:', {
      日: `${startOfDay.toLocaleDateString()} 至 ${endOfDay.toLocaleDateString()}`,
      週: `${startOfWeek.toLocaleDateString()} 至 ${endOfWeek.toLocaleDateString()}`,
      月: `${startOfMonth.toLocaleDateString()} 至 ${endOfMonth.toLocaleDateString()}`,
      年: `${startOfYear.toLocaleDateString()} 至 ${endOfYear.toLocaleDateString()}`
    });
    
    console.log('可用預算項目數量:', budgetItems.length);
    console.log('可用支出數據數量:', expenses.length);
    
    const progress: BudgetProgress[] = [];
    
    // 處理每個預算項目
    budgetItems.forEach(budget => {
      let periodStartDate: Date;
      let periodEndDate: Date;
      let periodName: string;
      
      // 確定時間範圍
      switch (budget.period) {
        case 'daily':
          periodStartDate = startOfDay;
          periodEndDate = endOfDay;
          periodName = '每日';
          break;
        case 'weekly':
          periodStartDate = startOfWeek;
          periodEndDate = endOfWeek;
          periodName = '每週';
          break;
        case 'monthly':
          periodStartDate = startOfMonth;
          periodEndDate = endOfMonth;
          periodName = '每月';
          break;
        case 'yearly':
          periodStartDate = startOfYear;
          periodEndDate = endOfYear;
          periodName = '每年';
          break;
        case 'custom':
          // 自定義時間範圍
          if (budget.startDate && budget.endDate) {
            // 確保自訂日期範圍包含時分秒信息
            periodStartDate = new Date(budget.startDate);
            periodStartDate.setHours(0, 0, 0, 0);
            
            periodEndDate = new Date(budget.endDate);
            periodEndDate.setHours(23, 59, 59, 999);
            
            periodName = '自訂';
          } else {
            // 如果沒有有效的自定義日期，默認為當月
            periodStartDate = startOfMonth;
            periodEndDate = endOfMonth;
            periodName = '自訂(當月)';
          }
          break;
        default:
          periodStartDate = startOfMonth;
          periodEndDate = endOfMonth;
          periodName = '每月';
      }
      
      // 預算類型邏輯 - 多類別共享、單類別或總體
      const budgetType = budget.budgetType || 
        (budget.categoryId === 'overall' ? 'overall' : 'multi');
      
      console.log(`處理預算項目: ID=${budget.id}, 類型=${budgetType}, 類別=${budget.categoryId}/${budget.categoryName}, 金額=${budget.amount}, 週期=${budget.period}(${periodName}), 時間範圍=${periodStartDate.toLocaleDateString()} 至 ${periodEndDate.toLocaleDateString()}`);
      
      // 多類別共享預算時，添加所有類別的顯示
      const categoryDisplay = budgetType === 'multi' && budget.categories && budget.categories.length > 0 
        ? budget.categories.map(catId => {
            const category = categories.find(c => c.id === catId);
            return category ? category.name : catId;
          }).join('+') 
        : budget.categoryName;
      
      // 計算指定時間範圍和類別的總支出
      let currentAmount = 0;
      
      // 過濾符合條件的支出
      const relevantExpenses = expenses.filter(expense => {
        const expenseDate = expense.date;
        
        // 檢查時間範圍：將日期轉換為時間戳進行精確比較
        const isInTimeRange = expenseDate && 
                            expenseDate.getTime() >= periodStartDate.getTime() && 
                            expenseDate.getTime() <= periodEndDate.getTime();
        
        // 根據預算類型檢查類別匹配
        let isCategoryMatch = false;
        
        if (budgetType === 'overall') {
          // 總體預算：匹配所有類別
          isCategoryMatch = true;
        } else if (budgetType === 'multi' && budget.categories && budget.categories.length > 0) {
          // 多類別共享預算：檢查是否屬於任何一個指定類別
          isCategoryMatch = isExpenseInMultiCategories(expense, budget.categories);
        } else {
          // 單類別預算：使用原有邏輯
          isCategoryMatch = isExpenseInCategory(expense, budget.categoryId);
        }
        
        // 如果是多類別預算，輸出更詳細的調試資訊
        if (budgetType === 'multi' && isInTimeRange) {
          console.log(`多類別預算: 檢查支出 ID=${expense.id}: 金額=${expense.amount}, 類別=${expense.categoryId}/${expense.categoryName}, 日期=${expenseDate.toLocaleDateString()}, 時間匹配=${isInTimeRange}, 類別匹配=${isCategoryMatch}`);
        }
        
        // 添加詳細記錄，特別是對於關鍵類別
        if (budgetType === 'overall' && 
            (budget.categoryId === 'food' || budget.categoryName === '餐飲' ||
            budget.categoryId === 'utilities' || budget.categoryName === '住支' ||
            budget.categoryId === 'other' || budget.categoryName === '其他')) {
          console.log(`檢查支出 ID=${expense.id}: 金額=${expense.amount}, 類別=${expense.categoryId}/${expense.categoryName}, 日期=${expenseDate.toLocaleDateString()}, 時間匹配=${isInTimeRange}, 類別匹配=${isCategoryMatch}`);
          
          // 如果是餐飲或住支類別且不匹配，顯示更多診斷信息
          if (!isCategoryMatch) {
            console.log('不匹配的支出詳情:', {
              支出ID: expense.id,
              查找的類別ID: budget.categoryId,
              查找的類別名稱: budget.categoryName,
              支出的類別ID: expense.categoryId,
              支出的類別名稱: expense.categoryName,
              支出的原始類別: expense.category,
              支出備註: expense.notes
            });
          }
        }
        
        return isInTimeRange && isCategoryMatch;
      });
      
      // 計算總支出 - 嚴格按照公式：已使用 = Σ(該類別、該時間範圍內的所有支出)
      currentAmount = relevantExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      
      console.log(`預算項目 ${budget.id} (${categoryDisplay}) 的當前支出: ${currentAmount}, 預算金額: ${budget.amount}`);
      
      // 檢查預算金額是否為0，防止除法錯誤
      const budgetAmount = budget.amount > 0 ? budget.amount : 1;
      
      // 計算百分比：進度 = (已使用 / 設定的預算) * 100%
      const percentage = (currentAmount / budgetAmount) * 100;
      
      // 檢查是否超支：進度 ≥ 100% 表示超支
      const isOverBudget = currentAmount >= budget.amount;
      
      // 添加到進度列表
      progress.push({
        id: budget.id,
        period: periodName,
        categoryId: budgetType === 'multi' ? 'multi' : budget.categoryId,
        categoryName: budgetType === 'multi' ? categoryDisplay : (budget.categoryId === 'overall' ? '總體' : budget.categoryName),
        budgetAmount: budget.amount,
        currentAmount,
        percentage,
        isOverBudget
      });
    });
    
    // 按時間週期和類別排序
    progress.sort((a, b) => {
      // 先按時間週期排序
      const periodOrder = { '每日': 1, '每週': 2, '每月': 3, '每年': 4, '自訂': 5 };
      const periodDiff = (periodOrder[a.period as keyof typeof periodOrder] || 99) - 
                        (periodOrder[b.period as keyof typeof periodOrder] || 99);
      
      if (periodDiff !== 0) return periodDiff;
      
      // 然後按類別排序，總體優先
      if (a.categoryId === 'overall' && b.categoryId !== 'overall') return -1;
      if (a.categoryId !== 'overall' && b.categoryId === 'overall') return 1;
      
      // 最後按類別名稱排序
      return a.categoryName.localeCompare(b.categoryName);
    });
    
    setBudgetProgress(progress);
    console.log('預算進度計算完成:', progress);
  };
  
  // 添加獲取不同類別圖標的輔助函數
  const getCategoryIcon = (categoryId: string): string => {
    const iconMap: {[key: string]: string} = {
      'food': 'fa-utensils',
      'transportation': 'fa-car',
      'entertainment': 'fa-film',
      'shopping': 'fa-shopping-bag',
      'utilities': 'fa-home',
      'rent': 'fa-building',
      'medical': 'fa-briefcase-medical',
      'travel': 'fa-plane',
      'education': 'fa-graduation-cap',
      'investment': 'fa-chart-line',
      'income': 'fa-hand-holding-usd',
      'overall': 'fa-coins'
    };
    
    return iconMap[categoryId] || 'fa-receipt';
  };
  
  // 添加獲取不同時間段圖標的輔助函數
  const getPeriodIcon = (period: string): string => {
    const periodMap: {[key: string]: string} = {
      '日': 'fa-calendar-day',
      '每日': 'fa-calendar-day',
      '周': 'fa-calendar-week',
      '每週': 'fa-calendar-week',
      '月': 'fa-calendar-alt',
      '每月': 'fa-calendar-alt',
      '年': 'fa-calendar',
      '每年': 'fa-calendar',
      '自定義': 'fa-sliders-h'
    };
    
    return periodMap[period] || 'fa-calendar';
  };
  
  // 獲取周期的中文翻譯
  const getPeriodTranslation = (period: string): string => {
    switch (period) {
      case 'daily': return '每日';
      case 'weekly': return '每週';
      case 'monthly': return '每月';
      case 'yearly': return '每年';
      case 'custom': return '自訂';
      default: return period;
    }
  };
  
  // 計算內容高度用於動畫
  const contentHeight = budgetProgress.length ? '500px' : '300px';
  
  return (
    <div className={`relative bg-white bg-opacity-95 backdrop-blur-sm rounded-xl shadow-md border-l-4 transition-all duration-500 ${collapsed ? 'border-gray-300' : 'border-[#A487C3]'} p-5 mb-6 hover:shadow-lg`}>
      {/* 背景裝飾元素 - 使用微妙效果 */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#F7F1FF] to-[#F0EAFA] rounded-full opacity-20 transform translate-x-12 -translate-y-12"></div>
      <div className="absolute bottom-0 left-0 w-16 h-16 bg-gradient-to-br from-[#F0EAFA] to-[#F7F1FF] rounded-full opacity-20 transform -translate-x-8 translate-y-8"></div>
      
      {/* 標題欄 - 增強視覺效果 */}
      <div className={`flex justify-between items-center relative z-10 ${collapsed ? 'mb-0' : 'mb-4'}`}>
        <div className="flex items-center group">
          <button 
            onClick={() => setCollapsed(!collapsed)}
            className={`mr-2 w-8 h-8 flex items-center justify-center text-[#9678B6] group-hover:text-[#7C56A6] bg-[#F7F1FF] group-hover:bg-[#EFE7FF] rounded-full transition-all duration-300 shadow-sm group-hover:shadow`}
            aria-label={collapsed ? "展開預算概覽" : "摺疊預算概覽"}
          >
            <i className={`fas fa-chevron-${collapsed ? 'down' : 'up'} text-xs chevron-rotate ${collapsed ? 'chevron-rotate-down' : ''}`}></i>
          </button>
          
          <div className="flex items-center">
            <h2 className={`text-lg font-bold ${collapsed ? 'text-gray-700' : 'text-[#9678B6]'} transition-colors duration-300`}>
              預算概覽
            </h2>
            
            {budgetProgress.length === 0 && !loading && !error && !success && (
              <span className={`ml-2 text-xs ${collapsed ? 'bg-gray-200 text-gray-700' : 'bg-[#F0EAFA] text-[#9678B6]'} px-2 py-0.5 rounded-full transition-colors duration-300`}>
                未設置
              </span>
            )}
            
            {/* 摺疊狀態時顯示的摘要信息 */}
            {collapsed && (
              <div className="flex items-center ml-4">
                {budgetProgress.length > 0 ? (
                  <div className="flex items-center">
                    <span className="px-2 py-0.5 bg-[#F0EAFA] text-[#9678B6] rounded-full text-xs font-medium">
                      {budgetProgress.length} 個預算項目
                    </span>
                    
                    {/* 顯示是否有超支的預算 */}
                    {budgetProgress.some(p => p.isOverBudget) && (
                      <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium flex items-center">
                        <i className="fas fa-exclamation-triangle mr-1 text-[10px]"></i>
                        有超支
                      </span>
                    )}
                  </div>
                ) : loading ? (
                  <div className="ml-2 flex items-center">
                    <div className="w-3 h-3 border-t-2 border-[#9678B6] rounded-full animate-spin mr-1"></div>
                    <span className="text-xs text-gray-500">載入中...</span>
                  </div>
                ) : (
                  <span className="ml-2 text-xs text-gray-500">點擊查看詳情</span>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* 非摺疊狀態下顯示更新按鈕 */}
        {!collapsed && (
          <button
            className="text-sm text-white bg-gradient-to-r from-[#A487C3] to-[#9678B6] hover:from-[#9678B6] hover:to-[#8A5DC8] px-4 py-1.5 rounded-lg flex items-center transition-all duration-300 shadow-sm hover:shadow-md"
            onClick={() => {
              console.log('手動刷新預算進度...');
              setSuccess('正在刷新預算數據...');
              setLoading(true);
              setBudgetProgress([]);
              const refreshEvent = new CustomEvent('refreshBudgetProgress');
              window.dispatchEvent(refreshEvent);
            }}
          >
            <i className="fas fa-sync-alt mr-2 hover:animate-spin"></i>
            更新數據
          </button>
        )}
      </div>
      
      {/* 內容區域 - 添加展開/收起動畫 */}
      <div 
        className={`${collapsed ? 'budget-content-collapsing' : 'budget-content-expanding'}`}
        style={{ 
          '--expanded-height': contentHeight,
          display: collapsed ? 'none' : 'block'
        } as React.CSSProperties}
      >
        {loading ? (
          <div className="flex flex-col justify-center items-center py-10">
            <div className="relative w-16 h-16">
              <div className="absolute top-0 left-0 w-full h-full border-4 border-[#F0EAFA] rounded-full"></div>
              <div className="absolute top-0 left-0 w-full h-full border-4 border-transparent border-t-[#A487C3] rounded-full animate-spin"></div>
              <div className="absolute top-0 left-0 w-full h-full border-4 border-transparent border-r-[#C4AEE0] rounded-full animate-spin" style={{animationDuration: '3s'}}></div>
            </div>
            <p className="mt-4 text-[#9678B6] font-medium">正在加載預算數據...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-3 shadow-inner border border-red-100 flex items-start budget-card" style={{ '--index': 0 } as React.CSSProperties}>
            <i className="fas fa-exclamation-circle text-xl mr-3 mt-0.5 animate-pulse"></i>
            <div>
              <h4 className="font-bold mb-1">載入失敗</h4>
              <p>{error}</p>
            </div>
          </div>
        ) : success ? (
          <div className="bg-green-50 text-green-600 p-4 rounded-xl mb-3 shadow-inner border border-green-100 flex items-start budget-card" style={{ '--index': 0 } as React.CSSProperties}>
            <i className="fas fa-check-circle text-xl mr-3 mt-0.5 animate-bounce"></i>
            <div>
              <h4 className="font-bold mb-1">操作成功</h4>
              <p>{success}</p>
            </div>
          </div>
        ) : budgetProgress.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500 budget-card" style={{ '--index': 0 } as React.CSSProperties}>
            <div className="w-20 h-20 bg-gradient-to-r from-[#F0EAFA] to-[#F7F1FF] flex items-center justify-center rounded-full mb-3 shadow-inner gentle-glow">
              <i className="fas fa-piggy-bank text-3xl text-[#A487C3] subtle-pulse"></i>
            </div>
            <h3 className="text-center mb-2 text-base font-medium text-gray-700">尚未設置任何預算</h3>
            <p className="text-center mb-4 text-gray-500 max-w-xs text-sm">設置預算可以幫助您追蹤支出，更好地管理財務</p>
            <button
              className="px-4 py-2 bg-gradient-to-r from-[#A487C3] to-[#9678B6] hover:from-[#9678B6] hover:to-[#8A5DC8] text-white rounded-lg transition-all duration-300 text-sm font-medium flex items-center shadow-sm hover:shadow-md transform hover:scale-105"
              onClick={() => {
                const showBudgetSettingEvent = new CustomEvent('showBudgetSetting');
                window.dispatchEvent(showBudgetSettingEvent);
              }}
            >
              <i className="fas fa-plus-circle mr-2"></i>
              添加預算
            </button>
          </div>
        ) : (
          <div className="space-y-4 relative z-10" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {budgetProgress.map((progress, index) => (
              <div 
                key={progress.id} 
                className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 budget-card transform hover:scale-[1.02]" 
                style={{ '--index': index } as React.CSSProperties}
              >
                <div className="flex items-center mb-2">
                  <div className={`mr-3 w-8 h-8 rounded-lg flex items-center justify-center ${progress.isOverBudget ? 'bg-gradient-to-br from-red-500 to-red-600 red-pulse-glow' : 'bg-gradient-to-br from-[#A487C3] to-[#9678B6]'} text-white shadow-sm`}>
                    <i className={`fas ${progress.categoryId === 'overall' ? getPeriodIcon(progress.period) : getCategoryIcon(progress.categoryId)}`}></i>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap justify-between items-center">
                      <h3 className="font-bold text-gray-800 text-sm mr-2">
                        {progress.period} {progress.categoryName}預算
                      </h3>
                      <div className="flex items-center">
                        <span className="text-gray-600 font-medium mr-1 text-xs">預算</span>
                        <span className="font-semibold text-gray-900 text-sm">{formatAmount(progress.budgetAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="relative h-4 rounded-full bg-gray-100 overflow-hidden shadow-inner mb-2">
                  <div 
                    className={`absolute top-0 left-0 h-full rounded-full progress-bar-fill ${
                      progress.isOverBudget 
                        ? 'bg-gradient-to-r from-red-500 to-red-400' 
                        : progress.percentage >= 80 
                          ? 'bg-gradient-to-r from-orange-500 to-orange-400'
                          : 'bg-gradient-to-r from-[#A487C3] to-[#B89FD9]'
                    }`}
                    style={{ 
                      '--target-width': `${Math.min(progress.percentage, 100)}%`,
                      width: `${Math.min(progress.percentage, 100)}%`
                    } as React.CSSProperties}
                  ></div>
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-end pr-2">
                    <span className={`text-xs font-bold ${progress.percentage > 70 ? 'text-white' : 'text-gray-700'}`}>
                      {Math.round(progress.percentage)}%
                    </span>
                  </div>
                  {progress.percentage > 100 && (
                    <div className="absolute top-0 right-0 h-full bg-red-300 opacity-30" style={{ width: '100%' }}></div>
                  )}
                </div>
                
                <div className="flex justify-between items-center text-xs">
                  <div className="flex flex-col">
                    <span className="text-gray-500">已使用</span>
                    <span className="font-semibold text-gray-800">{formatAmount(progress.currentAmount)}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-gray-500">{progress.isOverBudget ? '已超支' : '剩餘預算'}</span>
                    <span className={`font-semibold ${progress.isOverBudget ? 'text-red-500' : 'text-green-500'}`}>
                      {progress.isOverBudget 
                        ? `${formatAmount(progress.currentAmount - progress.budgetAmount)}`
                        : `${formatAmount(progress.budgetAmount - progress.currentAmount)}`
                    }
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BudgetProgressBars;