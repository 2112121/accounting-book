import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, Timestamp, arrayUnion, writeBatch, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import './ExpenseGroupForm.css';
import { toast } from 'react-toastify';

// 為分帳方式創建一些圖標組件
const EqualCircleIcon = ({ className }: { className?: string }) => (
  <i className={`fas fa-equals ${className || ''}`}></i>
);

const PercentageIcon = ({ className }: { className?: string }) => (
  <i className={`fas fa-percentage ${className || ''}`}></i>
);

const CustomSplitIcon = ({ className }: { className?: string }) => (
  <i className={`fas fa-sliders-h ${className || ''}`}></i>
);

interface ConfirmExpenseFormProps {
  groupId: string;
  expenses: any[]; // 群組中的支出列表
  onSave: (data: any) => void;
  onCancel: () => void;
}

type SplitMethodType = 'equal' | 'percentage' | 'custom';

interface GroupMember {
  userId: string;
  nickname: string;
  photoURL?: string;
  amount: number;
  percentage?: number;
  amountInput?: string;
}

const ConfirmExpenseForm: React.FC<ConfirmExpenseFormProps> = ({
  groupId,
  expenses,
  onSave,
  onCancel
}) => {
  const { currentUser } = useAuth();
  const unconfirmedExpenses = expenses.filter(exp => exp.confirmed !== true);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string>('');
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [splitMethod, setSplitMethod] = useState<SplitMethodType>('equal');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [multipleSelection, setMultipleSelection] = useState<boolean>(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('NTD');
  const [validSplitAmount, setValidSplitAmount] = useState<boolean>(true);
  const [remainingAmount, setRemainingAmount] = useState<number>(0);
  // 添加計算機相關狀態
  const [showCalculator, setShowCalculator] = useState<boolean>(false);
  const [calculatorInput, setCalculatorInput] = useState<string>('');
  const [calculatorResult, setCalculatorResult] = useState<string>('0');
  
  // 分帳方式選項
  const splitMethods = [
    { id: 'equal' as SplitMethodType, name: '平均分配', icon: 'fas fa-equals', description: '每位成員平均分攤費用' },
    { id: 'percentage' as SplitMethodType, name: '按比例分配', icon: 'fas fa-percentage', description: '根據自訂比例分配費用' },
    { id: 'custom' as SplitMethodType, name: '指定金額', icon: 'fas fa-sliders-h', description: '手動指定每位成員的分攤金額' }
  ];
  
  // 貨幣選項
  const currencies = [
    { code: 'NTD', symbol: 'NT$', name: '新台幣' }
  ];
  
  // 計算多選模式下的總金額
  const calculateTotalAmount = () => {
    const selectedExpenses = expenses.filter(expense => selectedExpenseIds.includes(expense.id));
    const total = selectedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    setTotalAmount(total);
    return total;
  };
  
  // 當選擇支出變更時
  useEffect(() => {
    // 如果選擇了全部，進入多選模式
    if (multipleSelection) {
      calculateTotalAmount();
      
      // 如果總金額已計算且有成員，則自動計算分帳金額
      if (totalAmount > 0 && members.length > 0) {
        updateSplitAmounts(splitMethod);
        console.log('多選模式 - 已更新分帳金額:', { splitMethod, totalAmount, memberCount: members.length });
      }
    } 
    // 單選一個支出
    else if (selectedExpenseId) {
      const expense = expenses.find(exp => exp.id === selectedExpenseId);
      if (expense) {
        setSelectedExpense(expense);
        setTotalAmount(expense.amount);
        
        // 設置幣種
        if (expense.currency) {
          setCurrency(expense.currency);
        }
        
        // 從支出中獲取成員資訊
        if (expense.participants) {
          // 已有分配好的成員
          setMembers(expense.participants.map((p: any) => ({
            userId: p.userId,
            nickname: p.nickname,
            photoURL: p.photoURL,
            amount: p.amount || 0,
            percentage: p.percentage || 0
          })));
        } else {
          // 從群組成員中初始化
          const groupMembers = expense.groupMembers || [];
          setMembers(groupMembers.map((member: any) => ({
            userId: member.userId,
            nickname: member.nickname || '未知用戶',
            photoURL: member.photoURL,
            amount: 0,
            percentage: 0
          })));
        }
        
        // 如果有成員，立即計算分帳金額
        if (members.length > 0) {
          updateSplitAmounts(splitMethod);
          console.log('單選模式 - 已更新分帳金額:', { splitMethod, amount: expense.amount, memberCount: members.length });
        }
      }
    }
  }, [selectedExpenseId, multipleSelection, selectedExpenseIds, expenses]);
  
  // 處理支出選擇變更
  const handleExpenseSelectionChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    
    // 首先清空錯誤訊息
    setError('');
    
    // 無論選擇哪種模式，都先嘗試從群組加載最新成員
    await loadGroupMembers(groupId);
    
    if (value === 'all') {
      // 選擇全部支出
      setMultipleSelection(true);
      const ids = unconfirmedExpenses.map(exp => exp.id);
      setSelectedExpenseIds(ids);
      setSelectedExpenseId('');
      
      // 計算總金額
      const total = unconfirmedExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      setTotalAmount(total);
      
      // 在確保成員載入後，確保計算分帳金額
      setTimeout(() => {
        updateSplitAmounts(splitMethod);
        console.log('全部支出模式 - 已更新分帳金額，標記為批量處理');
      }, 100);
    } else {
      // 選擇單個支出
      setMultipleSelection(false);
      setSelectedExpenseIds([]);
      setSelectedExpenseId(value);
      
      // 立即加載所選支出的數據
      const expense = expenses.find(exp => exp.id === value);
      if (expense) {
        setSelectedExpense(expense);
        setTotalAmount(expense.amount);
        
        // 設置幣種
        if (expense.currency) {
          setCurrency(expense.currency);
        }
        
        // 確保計算分帳金額
        setTimeout(() => {
          updateSplitAmounts(splitMethod);
        }, 100);
      }
    }
  };
  
  // 新增：從群組ID直接加載成員的函數
  const loadGroupMembers = async (groupId: string) => {
    try {
      console.log('嘗試從群組直接加載成員，群組ID:', groupId);
      
      if (!groupId) {
        console.error('無效的群組ID');
        setError('無法載入分帳群組成員：無效的群組ID');
        return;
      }
      
      // 從群組文檔中獲取成員信息
      const groupRef = doc(db, 'expenseGroups', groupId);
      const groupSnapshot = await getDoc(groupRef);
      
      if (groupSnapshot.exists()) {
        const groupData = groupSnapshot.data();
        console.log('從expenseGroups文檔加載成員數據:', groupData);
        
        if (groupData.members && groupData.members.length > 0) {
          console.log('從群組文檔加載成員:', groupData.members.length);
          
          // 保存現有成員的金額信息
          const currentMemberAmounts = new Map();
          members.forEach(m => {
            currentMemberAmounts.set(m.userId, {
              amount: m.amount || 0,
              percentage: m.percentage || 0
            });
          });
          
          // 設置新的成員列表，保留現有成員的金額信息
          setMembers(groupData.members.map((member: any) => {
            const existingMember = currentMemberAmounts.get(member.userId);
            return {
              userId: member.userId,
              nickname: member.nickname || '未知用戶',
              photoURL: member.photoURL,
              amount: existingMember ? existingMember.amount : 0,
              percentage: existingMember ? existingMember.percentage : 0
            };
          }));
          
          return;
        }
      } else {
        console.log('expenseGroups中沒有找到群組文檔，嘗試其他方式');
      }
      
      // 如果在expenseGroups找不到，嘗試從splitTransactions集合中查找
      const splitRef = doc(db, 'splitTransactions', groupId);
      const splitSnapshot = await getDoc(splitRef);
      
      if (splitSnapshot.exists()) {
        const splitData = splitSnapshot.data();
        console.log('從splitTransactions文檔加載數據:', splitData);
        
        if (splitData.participants && splitData.participants.length > 0) {
          console.log('從splitTransactions加載成員:', splitData.participants.length);
          
          // 保存現有成員的金額信息
          const currentMemberAmounts = new Map();
          members.forEach(m => {
            currentMemberAmounts.set(m.userId, {
              amount: m.amount || 0,
              percentage: m.percentage || 0
            });
          });
          
          // 設置新的成員列表，保留現有成員的金額信息
          setMembers(splitData.participants.map((p: any) => {
            const existingMember = currentMemberAmounts.get(p.userId);
            return {
              userId: p.userId,
              nickname: p.nickname || '未知用戶',
              photoURL: p.photoURL,
              amount: existingMember ? existingMember.amount : 0,
              percentage: existingMember ? existingMember.percentage : 0
            };
          }));
          
          return;
        }
      } else {
        console.log('splitTransactions中沒有找到群組文檔，嘗試其他方式');
      }
      
      // 如果從群組文檔無法獲取，嘗試從群組支出集合中推斷
      console.log('嘗試從已有支出中推斷群組成員');
      const expensesRef = collection(db, 'groupExpenses');
      const q = query(expensesRef, where('groupId', '==', groupId), limit(5));
      const expensesSnapshot = await getDocs(q);
      
      if (!expensesSnapshot.empty) {
        console.log('找到相關支出數量:', expensesSnapshot.docs.length);
        // 從第一筆支出中獲取成員信息
        for (const expDoc of expensesSnapshot.docs) {
          const expData = expDoc.data();
          console.log('檢查支出數據:', expData.id, expData.title);
          
          if (expData.participants && expData.participants.length > 0) {
            console.log('從相關支出中加載成員:', expData.participants.length);
            
            // 保存現有成員的金額信息
            const currentMemberAmounts = new Map();
            members.forEach(m => {
              currentMemberAmounts.set(m.userId, {
                amount: m.amount || 0,
                percentage: m.percentage || 0
              });
            });
            
            // 設置新的成員列表，保留現有成員的金額信息
            setMembers(expData.participants.map((p: any) => {
              const existingMember = currentMemberAmounts.get(p.userId);
              return {
                userId: p.userId,
                nickname: p.nickname || '未知用戶',
                photoURL: p.photoURL,
                amount: existingMember ? existingMember.amount : 0,
                percentage: existingMember ? existingMember.percentage : 0
              };
            }));
            
            return;
          } else if (expData.groupMembers && expData.groupMembers.length > 0) {
            console.log('從相關支出中加載成員:', expData.groupMembers.length);
            
            // 保存現有成員的金額信息
            const currentMemberAmounts = new Map();
            members.forEach(m => {
              currentMemberAmounts.set(m.userId, {
                amount: m.amount || 0,
                percentage: m.percentage || 0
              });
            });
            
            // 設置新的成員列表，保留現有成員的金額信息
            setMembers(expData.groupMembers.map((m: any) => {
              const existingMember = currentMemberAmounts.get(m.userId);
              return {
                userId: m.userId,
                nickname: m.nickname || '未知用戶',
                photoURL: m.photoURL,
                amount: existingMember ? existingMember.amount : 0,
                percentage: existingMember ? existingMember.percentage : 0
              };
            }));
            
            return;
          }
        }
      } else {
        console.log('在groupExpenses中沒有找到相關支出數據');
      }
      
      // 如果還是無法獲取成員，嘗試用當前用戶作為第一個成員
      if (currentUser) {
        console.log('使用當前用戶作為默認成員');
        setMembers([{
          userId: currentUser.uid,
          nickname: currentUser.displayName || '我',
          photoURL: currentUser.photoURL || undefined,
          amount: totalAmount,
          percentage: 100
        }]);
        
        // 顯示警告信息
        setError('找不到分帳群組成員數據，僅顯示您本人。請確保群組設置正確，或添加更多成員到群組。');
      } else {
        // 最後的後備方案
        console.log('無法獲取任何成員信息');
        setError('無法載入分帳群組成員。請檢查群組設置或重新登入。');
      }
    } catch (err) {
      console.error('加載分帳群組成員出錯:', err);
      setError('加載分帳群組成員時發生錯誤，請稍後再試。');
    }
  };
  
  // 在組件掛載時檢查成員狀態
  useEffect(() => {
    // 如果沒有找到成員，但有選定的支出，嘗試重新加載成員
    if (members.length === 0 && groupId && ((selectedExpenseId && !multipleSelection) || (multipleSelection && selectedExpenseIds.length > 0))) {
      console.log('未檢測到成員，嘗試重新加載...');
      loadGroupMembers(groupId);
    }
  }, [selectedExpenseId, selectedExpenseIds, multipleSelection]);
  
  // 添加：組件掛載時先加載群組成員
  useEffect(() => {
    if (groupId) {
      console.log('組件掛載時初始加載群組成員');
      loadGroupMembers(groupId);
    }
  }, [groupId]);
  
  // 修改 updateMemberPercentage 函數，檢查並限制總百分比不超過100%
  const updateMemberPercentage = (userId: string, newPercentage: string) => {
    let percentValue = parseFloat(newPercentage);
    if (isNaN(percentValue)) return;
    
    // 確保百分比值不為負數
    percentValue = Math.max(0, percentValue);
    
    // 計算其他成員的總百分比
    const otherMembersPercentage = members.reduce((sum, member) => {
      if (member.userId !== userId) {
        return sum + (member.percentage || 0);
      }
      return sum;
    }, 0);
    
    // 確保加上新的百分比後總和不超過100%
    if (otherMembersPercentage + percentValue > 100) {
      // 限制此成員可用的最大百分比
      percentValue = 100 - otherMembersPercentage;
      // 如果計算出負值，則設為0
      if (percentValue < 0) percentValue = 0;
      
      // 顯示警告訊息
      toast.warning(`已自動調整百分比，總和不能超過100%`, {
        position: "top-center", 
        autoClose: 2000
      });
    }
    
    // 更新百分比
    setMembers(prev => 
      prev.map(member => 
        member.userId === userId 
          ? { ...member, percentage: percentValue } 
          : member
      )
    );
    
    // 重新計算金額（整數化）
    const amount = multipleSelection ? totalAmount : selectedExpense?.amount;
    if (amount) {
      setMembers(prev => 
        prev.map(member => {
          if (member.userId === userId) {
            return {
              ...member,
              percentage: percentValue,
              // 將金額四捨五入為整數
              amount: Math.round((amount * (percentValue / 100)))
            };
          }
          return member;
        })
      );
    }
  };
  
  // 修改 setMemberAmount 函數
  const setMemberAmount = (userId: string, newAmount: string) => {
    // 允許空字符串，方便用戶清空後重新輸入
    const amount = multipleSelection ? totalAmount : selectedExpense?.amount;
    
    setMembers(prev => 
      prev.map(member => {
        if (member.userId === userId) {
          // 如果是空字符串，暫時設置為0
          if (newAmount === '') {
            return { 
              ...member, 
              amount: 0,
              amountInput: '', // 保存輸入框的原始值
              percentage: 0
            };
          } else {
            // 嘗試轉換為數字
            const numAmount = parseInt(newAmount, 10);
            if (isNaN(numAmount)) return member; // 如果不是有效數字，保持不變
            
            const intAmount = Math.max(0, numAmount);
            return { 
              ...member, 
              amount: intAmount,
              amountInput: intAmount.toString(), // 保存處理後的值
              percentage: totalAmount > 0 ? Math.round((intAmount / totalAmount) * 10000) / 100 : 0
            };
          }
        }
        return member;
      })
    );
  };

  // 當輸入框失去焦點時，確保金額不為空
  const handleAmountBlur = (userId: string, value: string) => {
    if (value === '') {
      // 如果輸入框失去焦點時為空，設為0
      setMembers(prev => 
        prev.map(member => {
          if (member.userId === userId) {
            return { 
              ...member, 
              amount: 0,
              amountInput: '0',
              percentage: 0
            };
          }
          return member;
        })
      );
    }
  };
  
  // 修改 updateSplitAmounts 函數，計算整數金額
  const updateSplitAmounts = (method: SplitMethodType = splitMethod) => {
    if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) return;
    
    if (members.length === 0) {
      console.warn('沒有成員可以分配金額');
      return;
    }
    
    console.log('當前分帳方式:', method);
    console.log('當前總金額:', totalAmount);
    console.log('成員數量:', members.length);
    
    // 根據選擇的分帳方式計算每人金額
    switch (method) {
      case 'equal':
        // 平均分配
        const equalShare = Math.floor(totalAmount / members.length);
        
        // 先給每個人分配整數金額
        const updatedMembers = members.map(member => ({
          ...member,
          amount: equalShare,
          amountInput: equalShare.toString(),
          percentage: parseFloat((100 / members.length).toFixed(2))
        }));
        
        // 處理餘數，將餘數分配給前幾名成員
        const remainder = totalAmount - (equalShare * members.length);
        let remainderDistributed = 0;
        for (let i = 0; i < updatedMembers.length && remainderDistributed < remainder; i++) {
          updatedMembers[i].amount += 1;
          updatedMembers[i].amountInput = updatedMembers[i].amount.toString();
          remainderDistributed++;
        }
        
        console.log('更新後的成員數據 (平分):', updatedMembers);
        setMembers(updatedMembers);
        break;
        
      case 'percentage':
        // 按比例分配 - 平均百分比初始化
        const equalPercentage = 100 / members.length;
        const initialPercentageMembers = members.map(member => {
          const memberPercentage = parseFloat(equalPercentage.toFixed(2));
          const calculatedAmount = Math.round((totalAmount * (memberPercentage / 100)));
          return {
            ...member,
            percentage: memberPercentage,
            amount: calculatedAmount,
            amountInput: calculatedAmount.toString()
          };
        });
        
        // 檢查總金額是否匹配，調整差額
        let totalCalculated = initialPercentageMembers.reduce((sum, m) => sum + m.amount, 0);
        const diff = totalAmount - totalCalculated;
        
        // 分配差額
        if (diff !== 0 && initialPercentageMembers.length > 0) {
          const increment = diff > 0 ? 1 : -1;
          let remainingDiff = Math.abs(diff);
          let index = 0;
          
          while (remainingDiff > 0) {
            initialPercentageMembers[index % initialPercentageMembers.length].amount += increment;
            initialPercentageMembers[index % initialPercentageMembers.length].amountInput = 
              initialPercentageMembers[index % initialPercentageMembers.length].amount.toString();
            remainingDiff--;
            index++;
          }
        }
        
        console.log('更新後的成員數據 (百分比):', initialPercentageMembers);
        setMembers(initialPercentageMembers);
        break;
        
      case 'custom':
        // 自訂金額模式 - 初始化所有成員的金額為0
        const customMembers = members.map(member => {
          return {
            ...member,
            amount: 0,
            amountInput: '0',
            percentage: 0
          };
        });
        
        console.log('更新後的成員數據 (自訂-初始化為0):', customMembers);
        setMembers(customMembers);
        break;
    }
  };
  
  // 當分帳方式變更時重新計算
  useEffect(() => {
    if (multipleSelection) {
      // 多選模式下使用總金額
      if (totalAmount > 0 && members.length > 0) {
        updateSplitAmounts(splitMethod);
      }
    } else if (selectedExpense && members.length > 0) {
      // 單選模式使用選中支出的金額
      updateSplitAmounts(splitMethod);
    }
  }, [splitMethod]);
  
  // 使用安全獲取幣種的輔助函數
  const getSafeCurrency = (): string => {
    if (multipleSelection) {
      // 在多選模式下，從所選的第一個支出獲取幣種，如果無法獲取則返回默認值
      if (selectedExpenseIds.length > 0) {
        const firstExp = expenses.find(e => e.id === selectedExpenseIds[0]);
        return firstExp?.currency || 'TWD'; // 使用可選鏈操作符，如果 firstExp 為 null，則返回默認值
      }
      return 'TWD'; // 默認幣種
    } else {
      // 在單選模式下，從選定的支出獲取幣種，如果為 null 則使用默認值
      return selectedExpense?.currency || currency || 'TWD';
    }
  };
  
  // 計算機功能
  const calculateResult = () => {
    try {
      // 替換顯示的乘號和除號為JS可以運算的符號
      const expression = calculatorInput.replace(/×/g, '*').replace(/÷/g, '/');
      const result = eval(expression);
      setCalculatorResult(Number.isInteger(result) ? result.toString() : result.toFixed(2));
    } catch (error) {
      setCalculatorResult('錯誤');
    }
  };

  // 處理計算機按鈕點擊
  const handleCalculatorClick = (value: string) => {
    if (value === 'C') {
      // 清除輸入
      setCalculatorInput('');
      setCalculatorResult('0');
    } else if (value === '=') {
      // 計算結果
      calculateResult();
    } else if (value === '←') {
      // 刪除最後一個字符
      setCalculatorInput(prev => prev.slice(0, -1));
    } else {
      // 添加輸入
      setCalculatorInput(prev => prev + value);
    }
  };
  
  // 關閉計算機
  const closeCalculator = () => {
    setShowCalculator(false);
  };
  
  // 格式化金額顯示，整數不顯示小數點後的零
  const formatAmountDisplay = (amount: number): string => {
    // 如果是整數，則不顯示小數部分
    if (Math.floor(amount) === amount) {
      return amount.toString();
    }
    // 否則保留兩位小數
    return amount.toFixed(2);
  };
  
  // 實時驗證分帳金額
  useEffect(() => {
    if (members.length === 0) return;
    
    const totalSplitAmount = members.reduce((sum, m) => sum + m.amount, 0);
    const targetAmount = multipleSelection ? totalAmount : (selectedExpense?.amount || 0);
    
    // 計算剩餘未分配金額
    const remaining = targetAmount - totalSplitAmount;
    setRemainingAmount(remaining);
    
    // 驗證總金額是否匹配 - 使用更精確的計算方式
    const isAmountValid = Math.abs(remaining) < 1;  // 允許1元以内的誤差
    
    // 在 percentage 模式下，同時檢查百分比是否為 100%
    if (splitMethod === 'percentage') {
      const totalPercentage = members.reduce((sum, m) => sum + (m.percentage || 0), 0);
      
      // 檢查是否超過100%
      if (totalPercentage > 100) {
        setError(`分帳比例總和 (${totalPercentage.toFixed(1)}%) 不能超過 100%，請調整各成員比例`);
        setValidSplitAmount(false);
      } else {
        // 清除錯誤提示（如果之前有）
        if (error.includes('分帳比例總和')) {
          setError('');
        }
        const isPercentageValid = Math.abs(totalPercentage - 100) < 1;  // 允許1%以内的誤差
        setValidSplitAmount(isPercentageValid && isAmountValid);
      
        // 診斷日誌
        console.log('分帳驗證 (百分比模式):', { 
          totalPercentage, 
          totalSplitAmount, 
          targetAmount, 
          remaining, 
          isPercentageValid, 
          isAmountValid,
          finalValid: isPercentageValid && isAmountValid
        });
      }
    } else {
      setValidSplitAmount(isAmountValid);
      
      // 診斷日誌
      console.log('分帳驗證:', { totalSplitAmount, targetAmount, remaining, isAmountValid });
    }
  }, [members, multipleSelection, totalAmount, selectedExpense, splitMethod, error]);
  
  // 將未分配的金額均分給金額為0的成員
  const distributeRemainingAmount = () => {
    if (remainingAmount === 0 || members.length === 0) return;
    
    // 複製當前成員數組準備修改
    const updatedMembers = [...members];
    
    // 篩選出金額為0的成員
    const zeroAmountMembers = updatedMembers.filter(member => member.amount === 0);
    
    // 如果沒有金額為0的成員，則無法分配
    if (zeroAmountMembers.length === 0) {
      setError('沒有金額為0的成員可以分配剩餘金額');
      return;
    }
    
    // 計算每個金額為0的成員應增加/減少的基本金額
    const baseAdjustment = Math.floor(Math.abs(remainingAmount) / zeroAmountMembers.length);
    
    // 計算剩餘需要分配的零頭
    let remainder = Math.abs(remainingAmount) - (baseAdjustment * zeroAmountMembers.length);
    
    // 根據未分配金額的正負決定增加還是減少
    const adjustmentDirection = remainingAmount > 0 ? 1 : -1;
    
    // 為金額為0的成員分配調整金額
    updatedMembers.forEach((member, index) => {
      // 只處理金額為0的成員
      if (member.amount !== 0) return;
      
      // 計算這個成員的調整金額（基本金額+可能的零頭）
      let memberAdjustment = baseAdjustment;
      
      // 分配零頭給前幾名成員（僅金額為0的成員）
      if (remainder > 0) {
        memberAdjustment += 1;
        remainder -= 1;
      }
      
      // 根據方向調整金額
      updatedMembers[index].amount += memberAdjustment * adjustmentDirection;
      
      // 更新輸入框顯示的值
      updatedMembers[index].amountInput = updatedMembers[index].amount.toString();
      
      // 更新百分比
      updatedMembers[index].percentage = totalAmount > 0 
        ? Math.round((updatedMembers[index].amount / totalAmount) * 10000) / 100 
        : 0;
    });
    
    // 更新成員數據
    setMembers(updatedMembers);
  };
  
  // 處理表單提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!multipleSelection && !selectedExpenseId) {
      setError('請選擇要確認的支出');
      return;
    }
    
    if (multipleSelection && selectedExpenseIds.length === 0) {
      setError('沒有可確認的支出');
      return;
    }
    
    // 確保所有成員的分帳總額與支出總額一致
    const memberTotalAmount = members.reduce((sum, member) => sum + member.amount, 0);
    if (Math.abs(memberTotalAmount - totalAmount) > 0.01) {
      setError(`分帳金額總和 (${memberTotalAmount.toFixed(0)}) 必須等於支出總額 (${totalAmount.toFixed(0)})`);
      return;
    }
    
    // 如果是百分比模式，檢查總百分比是否為100%，且不能超過100%
    if (splitMethod === 'percentage') {
      const totalPercentage = members.reduce((sum, m) => sum + (m.percentage || 0), 0);
      if (totalPercentage > 100) {
        setError(`分帳比例總和 (${totalPercentage.toFixed(1)}%) 不能超過 100%，請調整各成員比例`);
        return;
      }
      if (Math.abs(totalPercentage - 100) > 1) {
        setError(`分帳比例總和 (${totalPercentage.toFixed(1)}%) 必須為 100%`);
        return;
      }
    }
    
    setLoading(true);
    
    try {
      const expenseIds = multipleSelection ? selectedExpenseIds : [selectedExpenseId];
      
      // 整理要提交的數據
      const formData = {
        expenseIds,
        splitMethod,
        participants: members,
        // 添加標記以指示這是多筆支出的結算，用於防止重複計算
        isBatchSettlement: multipleSelection,
        batchCount: multipleSelection ? expenseIds.length : 1,
        totalAmount,
        currency
      };
      
      // 呼叫父組件提供的保存方法
      await onSave(formData);
    } catch (error: any) {
      console.error('確認分帳失敗:', error);
      setError(error.message || '確認分帳時出錯');
    } finally {
      setLoading(false);
    }
  };
  
  // 修改會員列表渲染部分，根據不同分帳方式只顯示對應的輸入框
  const renderMembersList = () => (
    <div className="space-y-3 mt-3">
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-6 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="text-yellow-500 mb-2">
            <i className="fas fa-exclamation-circle text-3xl"></i>
          </div>
          <p className="text-center text-gray-700 font-medium mb-1">未找到分帳群組成員</p>
          <p className="text-center text-sm text-gray-500">
            可能的原因：
          </p>
          <ul className="text-sm text-gray-500 list-disc pl-5 mt-2">
            <li>群組未正確設置成員</li>
            <li>成員數據未同步</li>
            <li>群組資料存在問題</li>
          </ul>
          <button 
            type="button"
            onClick={() => loadGroupMembers(groupId)}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <i className="fas fa-sync-alt mr-2"></i>
            重新載入成員
          </button>
        </div>
      ) : (
        <>
          {members.map((member, index) => (
            <div key={member.userId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div className="flex items-center gap-2">
                {member.photoURL ? (
                  <img src={member.photoURL} alt="頭像" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                    <span className="text-white">{member.nickname?.charAt(0) || '?'}</span>
                  </div>
                )}
                <div>
                  <p className="font-medium">{member.nickname}</p>
                  
                  {/* 只在custom模式下顯示金額輸入框 */}
                  {splitMethod === 'custom' && (
                    <div className="flex items-center">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={member.amountInput || member.amount}
                        onChange={(e) => setMemberAmount(member.userId, e.target.value)}
                        onBlur={(e) => handleAmountBlur(member.userId, e.target.value)}
                        className="w-24 text-sm p-1 border rounded mr-1"
                      />
                      <span className="text-sm text-gray-600">{getSafeCurrency()}</span>
                    </div>
                  )}
                  
                  {/* 在平均分配模式下只顯示金額（不可編輯） */}
                  {splitMethod === 'equal' && (
                    <div className="flex items-center">
                      <span className="text-sm font-medium">
                        {formatAmountDisplay(member.amount)} {getSafeCurrency()}
                      </span>
                    </div>
                  )}
                  
                  {/* 在按比例分配模式下顯示計算出的金額（不可編輯） */}
                  {splitMethod === 'percentage' && (
                    <div className="w-24 flex flex-col items-end">
                      <div className="relative w-full">
                        <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                          <span className="text-gray-500 text-xs">%</span>
                        </div>
                        <input
                          type="number"
                          value={member.percentage || 0}
                          onChange={(e) => updateMemberPercentage(member.userId, e.target.value)}
                          min="0"
                          max="100"
                          step="10"
                          className="w-full pr-8 pl-2 py-1.5 text-right border rounded border-gray-300 focus:ring-[#A487C3] focus:border-[#A487C3]"
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        = {formatAmountDisplay(member.amount)} {getSafeCurrency()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* 只在percentage模式下顯示百分比輸入框 */}
              {splitMethod === 'percentage' && (
                <div className="flex items-center">
                  <input
                    type="number"
                    step="10"
                    min="0"
                    max="100"
                    value={member.percentage}
                    onChange={(e) => updateMemberPercentage(member.userId, e.target.value)}
                    className="w-16 text-sm p-1 border rounded mr-1"
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
              )}
              
              {/* 在自訂金額模式下顯示金額 */}
              {splitMethod === 'custom' && (
                <div className="text-sm font-medium">
                  {formatAmountDisplay(member.amount)} {getSafeCurrency()}
                </div>
              )}
              
              {/* 在平均分配模式下顯示百分比 */}
              {splitMethod === 'equal' && (
                <div className="text-sm font-medium">
                  {member.percentage}%
                </div>
              )}
            </div>
          ))}
          
          <div className="flex justify-between p-2 bg-blue-50 rounded font-medium">
            <span>總計:</span>
            <span>
              {formatAmountDisplay(members.reduce((sum, m) => sum + m.amount, 0))} {getSafeCurrency()} 
              {splitMethod === 'percentage' && (
                ` (${members.reduce((sum, m) => sum + (m.percentage || 0), 0).toFixed(0)}%)`
              )}
            </span>
          </div>
          
          {/* 在指定金額模式下顯示未分配金額 */}
          {splitMethod === 'custom' && (
            <div className="flex justify-between items-center p-2 rounded">
              <span className={`text-sm px-3 py-1 rounded-full ${
                remainingAmount > 0 
                  ? 'bg-green-100 text-green-700' 
                  : remainingAmount < 0 
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600'
              }`}>
                未分配: {formatAmountDisplay(Math.abs(remainingAmount))} {getSafeCurrency()}
                {remainingAmount !== 0 && (remainingAmount > 0 ? ' (待分配)' : ' (超出)')}
              </span>
              
              {/* 均分按鈕 */}
              {remainingAmount !== 0 && (
                <button
                  type="button"
                  onClick={distributeRemainingAmount}
                  className="bg-[#A487C3] hover:bg-[#8A5DC8] text-white text-xs px-3 py-1.5 rounded-lg flex items-center transition-colors shadow-sm"
                  title={remainingAmount > 0 ? "均分剩餘金額" : "均分超出金額"}
                >
                  <i className="fas fa-balance-scale-right mr-1.5"></i>
                  均分{remainingAmount > 0 ? '剩餘' : '超出'}金額
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full">
        {/* 頭部 */}
        <div className="bg-gradient-to-r from-[#7A5DC8] to-[#A487C3] px-6 py-5 flex justify-between items-center rounded-t-xl">
          <h2 className="text-xl font-bold text-white flex items-center">
            <i className="fas fa-file-invoice text-white mr-3 text-2xl"></i>
            <span className="tracking-wide">分帳結算</span>
          </h2>
          <button
            onClick={onCancel}
            className="text-white hover:bg-white/20 h-9 w-9 rounded-full flex items-center justify-center"
            aria-label="關閉"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        {/* 表單 */}
        <form onSubmit={handleSubmit} className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-5">
          {/* 錯誤提示 */}
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-4 border-l-4 border-red-500 shadow-sm">
              <div className="flex items-center">
                <i className="fas fa-exclamation-circle mr-3 text-lg"></i>
                <span className="font-medium">{error}</span>
              </div>
            </div>
          )}
          
          {/* 成功提示 */}
          {success && (
            <div className="bg-green-50 text-green-600 p-4 rounded-xl mb-4 border-l-4 border-green-500 shadow-sm">
              <div className="flex items-center">
                <i className="fas fa-check-circle mr-3 text-green-500 text-xl"></i>
                <span className="font-medium">{success}</span>
              </div>
            </div>
          )}
          
          {/* 選擇支出 */}
          <div className="space-y-2 animate-[fadeSlideIn_0.3s_ease-out]">
            <label htmlFor="expenseSelect" className="block text-sm font-semibold text-gray-700">
              選擇支出 <span className="text-red-500">*</span>
              {unconfirmedExpenses.length > 0 && (
                <span className="text-xs text-gray-500 ml-2 bg-gray-100 px-2 py-0.5 rounded-full">
                  共 {unconfirmedExpenses.length} 筆未確認支出
                </span>
              )}
            </label>
            <div className="relative rounded-xl shadow-sm group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fas fa-receipt text-[#A487C3] group-focus-within:text-[#7A5DC8] transition-colors duration-300"></i>
              </div>
              <select
                id="expenseSelect"
                value={multipleSelection ? 'all' : selectedExpenseId}
                onChange={handleExpenseSelectionChange}
                className="pl-12 w-full py-3 border border-gray-200 bg-gray-50 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#A487C3] focus:border-[#A487C3] appearance-none transition-all duration-300"
                required
              >
                <option value="">請選擇支出...</option>
                {unconfirmedExpenses.length > 1 && (
                  <option value="all" className="font-bold">全部支出 ({unconfirmedExpenses.length}筆)</option>
                )}
                {unconfirmedExpenses.map((expense) => (
                  <option key={expense.id} value={expense.id}>
                    {expense.title} ({expense.amount} {expense.currency}) - {expense.date && typeof expense.date === 'object' && 'seconds' in expense.date 
                      ? new Date(expense.date.seconds * 1000).toLocaleDateString() 
                      : expense.date instanceof Date 
                        ? expense.date.toLocaleDateString() 
                        : typeof expense.date === 'string' 
                          ? new Date(expense.date).toLocaleDateString() 
                          : '日期未知'}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                <i className="fas fa-chevron-down text-[#A487C3] text-xs"></i>
              </div>
            </div>
          </div>

          {/* 分帳方式選擇 - 只在選擇了支出後才顯示 */}
          {(selectedExpenseId || multipleSelection) && (
            <div className="space-y-3 animate-[fadeSlideIn_0.4s_ease-out]">
              <label className="block text-sm font-semibold text-gray-700">
                分帳方式 <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center">
                <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50 shadow-sm flex-1">
                  {splitMethods.map(method => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSplitMethod(method.id)}
                      className={`flex items-center px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                        splitMethod === method.id
                          ? 'bg-[#A487C3] text-white shadow-sm font-medium'
                          : 'hover:bg-gray-100 text-gray-700'
                      } flex-1 justify-center mx-0.5`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center mr-2 ${
                        splitMethod === method.id 
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-100 text-[#A487C3]'
                      }`}>
                        <i className={`${method.icon} text-xs`}></i>
                      </div>
                      {method.name}
                    </button>
                  ))}
                </div>
                
                {/* 計算機按鈕 - 只在指定金額模式下顯示 */}
                {splitMethod === 'custom' && (
                  <button
                    type="button"
                    onClick={() => setShowCalculator(true)}
                    className="ml-2 bg-gradient-to-r from-[#7A5DC8] to-[#A487C3] hover:from-[#6A4DB8] hover:to-[#9477B3] text-white p-2 rounded-lg transition-colors shadow-sm hover:shadow flex items-center justify-center"
                    title="打開計算機"
                  >
                    <i className="fas fa-calculator"></i>
                  </button>
                )}
              </div>
              <div className="text-xs text-gray-500 pl-2 flex items-center">
                <i className="fas fa-info-circle mr-1.5 text-[#A487C3]"></i>
                {splitMethods.find(m => m.id === splitMethod)?.description || '選擇分帳方式'}
              </div>
              
              {/* 計算機彈窗 */}
              {showCalculator && (
                <div 
                  className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 animate-fadeIn"
                  onClick={(e) => {
                    // 點擊背景關閉計算機，但阻止事件向下傳遞
                    e.stopPropagation();
                    closeCalculator();
                  }}
                >
                  <div 
                    className="bg-white rounded-xl shadow-xl w-72 overflow-hidden"
                    onClick={(e) => {
                      // 阻止點擊計算機本體時事件冒泡到背景
                      e.stopPropagation();
                    }}
                  >
                    <div className="bg-gradient-to-r from-[#7A5DC8] to-[#A487C3] px-4 py-3 text-white flex justify-between items-center">
                      <h3 className="font-bold flex items-center">
                        <i className="fas fa-calculator mr-2"></i>
                        計算機
                      </h3>
                      <button 
                        onClick={closeCalculator}
                        className="text-white hover:bg-white/20 h-7 w-7 rounded-full flex items-center justify-center"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                    
                    <div className="p-3">
                      {/* 添加計算機按鈕動畫樣式 */}
                      <style>{`
                        .calculator-btn {
                          transition: all 0.15s ease;
                          transform: translateY(0);
                        }
                        .calculator-btn:active {
                          transform: translateY(2px);
                        }
                      `}</style>
                      
                      {/* 計算機屏幕 */}
                      <div className="bg-gray-50 p-3 rounded-lg mb-3 border border-gray-200 shadow-inner">
                        <div className="text-gray-600 text-sm mb-1 h-5 overflow-x-auto whitespace-nowrap font-mono">
                          {calculatorInput || ' '}
                        </div>
                        <div className="text-right text-xl font-bold text-gray-800 font-mono">
                          {calculatorResult}
                        </div>
                      </div>
                      
                      {/* 計算機按鈕 */}
                      <div className="grid grid-cols-4 gap-2">
                        {/* 第一行 */}
                        <button onClick={() => handleCalculatorClick('C')} 
                          type="button"
                          className="calculator-btn bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl text-center font-medium shadow-sm hover:shadow"
                        >C</button>
                        <button onClick={() => handleCalculatorClick('(')} 
                          type="button"
                          className="calculator-btn bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 rounded-xl text-center font-medium shadow-sm hover:shadow"
                        >(</button>
                        <button onClick={() => handleCalculatorClick(')')} 
                          type="button"
                          className="calculator-btn bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 rounded-xl text-center font-medium shadow-sm hover:shadow"
                        >)</button>
                        <button onClick={() => handleCalculatorClick('÷')} 
                          type="button"
                          className="calculator-btn bg-[#E0D5F0] hover:bg-[#D0C5E0] py-3 rounded-xl text-center font-medium text-[#5D3B9C] shadow-sm hover:shadow"
                        >÷</button>
                        
                        {/* 第二行 */}
                        <button onClick={() => handleCalculatorClick('7')} 
                          type="button"
                          className="calculator-btn bg-white hover:bg-gray-100 py-3 rounded-xl text-center font-medium border border-gray-200 shadow-sm hover:shadow text-gray-800"
                        >7</button>
                        <button onClick={() => handleCalculatorClick('8')} 
                          type="button"
                          className="calculator-btn bg-white hover:bg-gray-100 py-3 rounded-xl text-center font-medium border border-gray-200 shadow-sm hover:shadow text-gray-800"
                        >8</button>
                        <button onClick={() => handleCalculatorClick('9')} 
                          type="button"
                          className="calculator-btn bg-white hover:bg-gray-100 py-3 rounded-xl text-center font-medium border border-gray-200 shadow-sm hover:shadow text-gray-800"
                        >9</button>
                        <button onClick={() => handleCalculatorClick('×')} 
                          type="button"
                          className="calculator-btn bg-[#E0D5F0] hover:bg-[#D0C5E0] py-3 rounded-xl text-center font-medium text-[#5D3B9C] shadow-sm hover:shadow"
                        >×</button>
                        
                        {/* 第三行 */}
                        <button onClick={() => handleCalculatorClick('4')} 
                          type="button"
                          className="calculator-btn bg-white hover:bg-gray-100 py-3 rounded-xl text-center font-medium border border-gray-200 shadow-sm hover:shadow text-gray-800"
                        >4</button>
                        <button onClick={() => handleCalculatorClick('5')} 
                          type="button"
                          className="calculator-btn bg-white hover:bg-gray-100 py-3 rounded-xl text-center font-medium border border-gray-200 shadow-sm hover:shadow text-gray-800"
                        >5</button>
                        <button onClick={() => handleCalculatorClick('6')} 
                          type="button"
                          className="calculator-btn bg-white hover:bg-gray-100 py-3 rounded-xl text-center font-medium border border-gray-200 shadow-sm hover:shadow text-gray-800"
                        >6</button>
                        <button onClick={() => handleCalculatorClick('-')} 
                          type="button"
                          className="calculator-btn bg-[#E0D5F0] hover:bg-[#D0C5E0] py-3 rounded-xl text-center font-medium text-[#5D3B9C] shadow-sm hover:shadow"
                        >-</button>
                        
                        {/* 第四行 */}
                        <button onClick={() => handleCalculatorClick('1')} 
                          type="button"
                          className="calculator-btn bg-white hover:bg-gray-100 py-3 rounded-xl text-center font-medium border border-gray-200 shadow-sm hover:shadow text-gray-800"
                        >1</button>
                        <button onClick={() => handleCalculatorClick('2')} 
                          type="button"
                          className="calculator-btn bg-white hover:bg-gray-100 py-3 rounded-xl text-center font-medium border border-gray-200 shadow-sm hover:shadow text-gray-800"
                        >2</button>
                        <button onClick={() => handleCalculatorClick('3')} 
                          type="button"
                          className="calculator-btn bg-white hover:bg-gray-100 py-3 rounded-xl text-center font-medium border border-gray-200 shadow-sm hover:shadow text-gray-800"
                        >3</button>
                        <button onClick={() => handleCalculatorClick('+')} 
                          type="button"
                          className="calculator-btn bg-[#E0D5F0] hover:bg-[#D0C5E0] py-3 rounded-xl text-center font-medium text-[#5D3B9C] shadow-sm hover:shadow"
                        >+</button>
                        
                        {/* 第五行 */}
                        <button onClick={() => handleCalculatorClick('0')} 
                          type="button"
                          className="calculator-btn bg-white hover:bg-gray-100 py-3 rounded-xl text-center font-medium border border-gray-200 shadow-sm hover:shadow col-span-2 text-gray-800"
                        >0</button>
                        <button onClick={() => handleCalculatorClick('.')} 
                          type="button"
                          className="calculator-btn bg-white hover:bg-gray-100 py-3 rounded-xl text-center font-medium border border-gray-200 shadow-sm hover:shadow text-gray-800"
                        >.</button>
                        <button onClick={() => handleCalculatorClick('=')} 
                          type="button"
                          className="calculator-btn bg-gradient-to-r from-[#7A5DC8] to-[#A487C3] hover:from-[#6A4DB8] hover:to-[#9477B3] text-white py-3 rounded-xl text-center font-medium shadow-sm hover:shadow-md"
                        >=</button>
                        
                        {/* 刪除按鈕 */}
                        <button onClick={() => handleCalculatorClick('←')} 
                          type="button"
                          className="calculator-btn bg-gray-300 hover:bg-gray-400 py-3 rounded-xl text-center font-medium col-span-4 mt-2 flex items-center justify-center shadow-sm hover:shadow"
                        >
                          <i className="fas fa-backspace mr-2"></i> 退格
                        </button>
                        
                        {/* 使用結果按鈕 */}
                        {calculatorResult !== '0' && calculatorResult !== '錯誤' && (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation(); // 阻止事件冒泡
                              // 將結果複製到剪貼板
                              navigator.clipboard.writeText(calculatorResult);
                              closeCalculator();
                              // 顯示提示訊息
                              setSuccess(`結果 ${calculatorResult} 已複製到剪貼板`);
                              setTimeout(() => setSuccess(''), 3000);
                            }} 
                            className="calculator-btn bg-gradient-to-r from-green-500 to-green-400 hover:from-green-600 hover:to-green-500 text-white py-3 rounded-xl text-center font-medium col-span-4 mt-2 flex items-center justify-center shadow-md hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200"
                          >
                            <i className="fas fa-copy mr-2"></i> 複製結果並關閉
                          </button>
                        )}
                        
                        {/* 單純關閉按鈕 */}
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation(); // 阻止事件冒泡
                            closeCalculator();
                          }} 
                          className="calculator-btn bg-gray-500 hover:bg-gray-600 text-white py-3 rounded-xl text-center font-medium col-span-4 mt-2 flex items-center justify-center shadow-sm hover:shadow"
                        >
                          <i className="fas fa-times-circle mr-2"></i> 關閉計算機
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 當還沒選擇支出時顯示提示 */}
          {selectedExpenseId === '' && !multipleSelection && selectedExpenseIds.length === 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl mb-4 animate-fadeIn">
              <div className="flex items-center text-yellow-700">
                <i className="fas fa-info-circle mr-2 text-yellow-500"></i>
                <span>請先選擇需要結算的支出記錄</span>
              </div>
            </div>
          )}

          {/* 分帳成員列表 - 只在選擇了支出後才顯示 */}
          {(selectedExpenseId || multipleSelection) && (
            <div className="animate-[fadeSlideIn_0.5s_ease-out] space-y-3">
              <h3 className="text-md font-semibold text-gray-800 flex items-center">
                <i className="fas fa-users text-[#A487C3] mr-2"></i>
                <span>分帳成員</span>
                {totalAmount > 0 && (
                  <div className="ml-2 flex flex-wrap items-center">
                    <span className="text-sm bg-[#F0EAFA] text-[#8A5DC8] px-3 py-0.5 rounded-full mr-2">
                      總金額: {formatAmountDisplay(totalAmount)} {getSafeCurrency()}
                    </span>
                    
                    {/* 指定金額模式下顯示未分配金額 */}
                    {splitMethod === 'custom' && (
                      <div className="flex justify-between items-center p-2 rounded">
                        <span className={`text-sm px-3 py-1 rounded-full ${
                          remainingAmount > 0 
                            ? 'bg-green-100 text-green-700' 
                            : remainingAmount < 0 
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}>
                          未分配: {formatAmountDisplay(Math.abs(remainingAmount))} {getSafeCurrency()}
                          {remainingAmount !== 0 && (remainingAmount > 0 ? ' (待分配)' : ' (超出)')}
                        </span>
                        
                        {/* 均分按鈕 */}
                        {remainingAmount !== 0 && (
                          <button
                            type="button"
                            onClick={distributeRemainingAmount}
                            className="bg-[#A487C3] hover:bg-[#8A5DC8] text-white text-xs px-3 py-1.5 rounded-lg flex items-center transition-colors shadow-sm"
                            title={remainingAmount > 0 ? "均分剩餘金額" : "均分超出金額"}
                          >
                            <i className="fas fa-balance-scale-right mr-1.5"></i>
                            均分{remainingAmount > 0 ? '剩餘' : '超出'}金額
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </h3>

              {renderMembersList()}
            </div>
          )}

          {/* 提交按鈕 */}
          <div className="flex gap-4 justify-end pt-2 animate-[fadeSlideIn_0.6s_ease-out]">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all duration-300 font-medium shadow-sm hover:shadow transform hover:translate-y-[-2px]"
              disabled={loading}
            >
              <i className="fas fa-times mr-1.5"></i>
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-gradient-to-r from-[#7A5DC8] to-[#A487C3] text-white rounded-xl hover:from-[#6A4DB8] hover:to-[#9477B3] transition-all duration-300 font-medium shadow-md hover:shadow-lg transform hover:translate-y-[-2px]"
              disabled={loading || !selectedExpenseId && !multipleSelection}
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin mr-2 h-5 w-5 border-2 border-b-transparent border-white rounded-full"></div>
                  處理中...
                </div>
              ) : (
                <>
                  <i className="fas fa-check-circle mr-1.5"></i>
                  確認分帳
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConfirmExpenseForm; 