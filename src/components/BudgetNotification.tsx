import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, getDoc, doc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface BudgetItem {
  id: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  amount: number;
  categoryId: string | 'overall';
  categoryName: string;
  startDate?: Date;
  endDate?: Date;
}

const BudgetNotification: React.FC = () => {
  const { currentUser } = useAuth();

  // 檢查預算超支並發送通知
  useEffect(() => {
    if (!currentUser) return;

    const checkBudgetOverspending = async () => {
      try {
        // 獲取用戶預算設置
        const budgetRef = doc(db, 'budgets', currentUser.uid);
        const budgetDoc = await getDoc(budgetRef);
        
        if (!budgetDoc.exists()) return;
        
        const budgetData = budgetDoc.data();
        const notificationEnabled = budgetData.notificationEnabled;
        
        // 如果通知未啟用，則不檢查
        if (!notificationEnabled) return;
        
        const now = new Date();
        
        // 新的預算格式處理
        const budgetItems: BudgetItem[] = budgetData.budgetItems || [];
        
        // 兼容舊格式數據
        if (budgetData.amount && budgetData.period && (!budgetItems || budgetItems.length === 0)) {
          // 舊格式的總體預算
          const overallBudgetItem = {
            id: `legacy-overall-${budgetData.period}`,
            period: budgetData.period,
            amount: budgetData.amount,
            categoryId: 'overall',
            categoryName: '總體',
            startDate: budgetData.startDate,
            endDate: budgetData.endDate
          };
          
          budgetItems.push(overallBudgetItem);
          
          // 舊格式的類別預算
          if (budgetData.categoryBudgets && Array.isArray(budgetData.categoryBudgets)) {
            budgetData.categoryBudgets.forEach((cat: any) => {
              budgetItems.push({
                id: `legacy-${cat.categoryId}-${budgetData.period}`,
                period: budgetData.period,
                amount: cat.amount,
                categoryId: cat.categoryId,
                categoryName: cat.categoryName,
                startDate: budgetData.startDate,
                endDate: budgetData.endDate
              });
            });
          }
        }
        
        // 檢查每個預算項目
        for (const budgetItem of budgetItems) {
          // 計算當前週期的起始日期和結束日期
          let periodStartDate: Date, periodEndDate: Date;
          
          switch(budgetItem.period) {
            case 'daily':
              periodStartDate = new Date(now);
              periodStartDate.setHours(0, 0, 0, 0);
              periodEndDate = new Date(now);
              periodEndDate.setHours(23, 59, 59, 999);
              break;
            case 'weekly':
              const day = now.getDay();
              periodStartDate = new Date(now);
              periodStartDate.setDate(now.getDate() - day);
              periodStartDate.setHours(0, 0, 0, 0);
              periodEndDate = new Date(periodStartDate);
              periodEndDate.setDate(periodStartDate.getDate() + 6);
              periodEndDate.setHours(23, 59, 59, 999);
              break;
            case 'monthly':
              periodStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
              periodEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
              break;
            case 'yearly':
              periodStartDate = new Date(now.getFullYear(), 0, 1);
              periodEndDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
              break;
            case 'custom':
              // 使用自定義日期
              if (budgetItem.startDate && budgetItem.endDate) {
                periodStartDate = budgetItem.startDate instanceof Timestamp 
                  ? budgetItem.startDate.toDate() 
                  : new Date(budgetItem.startDate);
                periodEndDate = budgetItem.endDate instanceof Timestamp 
                  ? budgetItem.endDate.toDate() 
                  : new Date(budgetItem.endDate);
                  
                // 自定义日期在当前日期之外的不处理
                if (periodEndDate < now || periodStartDate > now) {
                  continue;
                }
              } else {
                // 没有有效的日期范围，跳过此项
                continue;
              }
              break;
            default:
              // 默認為月度
              periodStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
              periodEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          }
          
          // 处理查询条件
          const expensesRef = collection(db, 'expenses');
          let expensesQueryParams: any[] = [
            where('userId', '==', currentUser.uid),
            where('date', '>=', periodStartDate),
            where('date', '<=', periodEndDate)
          ];
          
          // 如果是类别预算，添加类别条件
          if (budgetItem.categoryId !== 'overall') {
            expensesQueryParams.push(where('categoryId', '==', budgetItem.categoryId));
          }
          
          // 获取支出
          const expensesQuery = query(expensesRef, ...expensesQueryParams);
          const expensesSnapshot = await getDocs(expensesQuery);
          let totalExpenses = 0;
          
          expensesSnapshot.forEach((doc) => {
            const expenseData = doc.data();
            totalExpenses += expenseData.amount;
          });
          
          // 检查是否已发送通知
          const notificationsRef = collection(db, 'notifications');
          let notificationType = budgetItem.categoryId === 'overall' ? 'budget_warning' : 'category_budget_warning';
          
          const notificationsQuery = query(
            notificationsRef,
            where('type', '==', notificationType),
            where('toUserId', '==', currentUser.uid),
            where('periodStart', '>=', periodStartDate),
            where('periodEnd', '<=', periodEndDate),
            ...(budgetItem.categoryId !== 'overall' ? [where('categoryId', '==', budgetItem.categoryId)] : [])
          );
          
          const notificationsSnapshot = await getDocs(notificationsQuery);
          const hasNotification = !notificationsSnapshot.empty;
          
          // 如果支出超过80%且未发送通知，创建通知
          if (totalExpenses >= budgetItem.amount * 0.8 && !hasNotification) {
            console.log(`預算警告 [${budgetItem.period}] [${budgetItem.categoryId === 'overall' ? '總體' : budgetItem.categoryName}]: 已用${(totalExpenses/budgetItem.amount*100).toFixed(1)}%，發送通知`);
            
            // 创建通知数据
            const notificationData: any = {
              type: notificationType,
              toUserId: currentUser.uid,
              periodStart: periodStartDate,
              periodEnd: periodEndDate,
              budgetPeriod: budgetItem.period,
              budgetAmount: budgetItem.amount,
              expenseAmount: totalExpenses,
              percentage: totalExpenses / budgetItem.amount,
              read: false,
              createdAt: serverTimestamp()
            };
            
            // 添加类别相关信息（如果是类别预算）
            if (budgetItem.categoryId !== 'overall') {
              notificationData.categoryId = budgetItem.categoryId;
              notificationData.categoryName = budgetItem.categoryName;
            }
            
            // 添加自定义日期信息（如果是自定义周期）
            if (budgetItem.period === 'custom') {
              notificationData.isCustomPeriod = true;
              if (budgetItem.startDate) notificationData.customStartDate = budgetItem.startDate;
              if (budgetItem.endDate) notificationData.customEndDate = budgetItem.endDate;
            }
            
            // 写入通知
            await addDoc(collection(db, 'notifications'), notificationData);
            
            // 浏览器通知
            if (typeof window !== 'undefined' && 'Notification' in window) {
              if (Notification.permission === 'granted') {
                let title = budgetItem.categoryId === 'overall' ? '預算警告' : '類別預算警告';
                let periodText = '';
                
                switch(budgetItem.period) {
                  case 'daily': periodText = '日度'; break;
                  case 'weekly': periodText = '週度'; break;
                  case 'monthly': periodText = '月度'; break;
                  case 'yearly': periodText = '年度'; break;
                  case 'custom': periodText = '自定義期間'; break;
                }
                
                new Notification(title, {
                  body: budgetItem.categoryId === 'overall' 
                    ? `您的${periodText}總體預算已用${(totalExpenses/budgetItem.amount*100).toFixed(1)}%`
                    : `您的${periodText}${budgetItem.categoryName}類別預算已用${(totalExpenses/budgetItem.amount*100).toFixed(1)}%`,
                  icon: '/favicon.ico'
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('檢查預算超支失敗:', error);
      }
    };
    
    // 檢查借貸到期
    const checkLoanDueDate = async () => {
      try {
        // 獲取用戶預算設置，檢查是否啟用借貸到期提醒
        const budgetRef = doc(db, 'budgets', currentUser.uid);
        const budgetDoc = await getDoc(budgetRef);
        
        if (!budgetDoc.exists()) return;
        
        const budgetData = budgetDoc.data();
        // 借貸到期提醒設置已移至借貸管理，保持向下兼容
        const loanDueNotificationEnabled = 
          budgetData.loanDueNotificationEnabled !== undefined 
            ? budgetData.loanDueNotificationEnabled 
            : true; // 默認啟用
        
        // 如果借貸到期提醒未啟用，則不檢查
        if (!loanDueNotificationEnabled) return;
        
        const now = new Date();
        const threeDaysLater = new Date();
        threeDaysLater.setDate(now.getDate() + 3); // 未來3天內到期
        
        // 查詢未還清且即將到期或已逾期的借貸
        const loansRef = collection(db, 'loans');
        const loansQuery = query(
          loansRef,
          where('userId', '==', currentUser.uid),
          where('status', 'in', ['pending', 'partially_paid']),
          where('dueDate', '<=', threeDaysLater)
        );
        
        const loansSnapshot = await getDocs(loansQuery);
        
        for (const loanDoc of loansSnapshot.docs) {
          const loanData = loanDoc.data();
          const loanId = loanDoc.id;
          const dueDate = loanData.dueDate instanceof Timestamp ? loanData.dueDate.toDate() : new Date(loanData.dueDate);
          
          // 檢查是否已經發送過通知
          const notificationsRef = collection(db, 'notifications');
          const notificationsQuery = query(
            notificationsRef,
            where('type', '==', 'loan_due_warning'),
            where('loanId', '==', loanId),
            where('toUserId', '==', currentUser.uid)
          );
          
          const notificationsSnapshot = await getDocs(notificationsQuery);
          const hasNotification = !notificationsSnapshot.empty;
          
          if (!hasNotification) {
            // 判斷是逾期還是即將到期
            const isOverdue = dueDate < now;
            const type = isOverdue ? 'loan_overdue' : 'loan_due_warning';
            
            console.log(`借貸${isOverdue ? '已逾期' : '即將到期'}：${loanData.counterpartyName}，發送通知`);
            
            await addDoc(collection(db, 'notifications'), {
              type,
              loanId,
              toUserId: currentUser.uid,
              counterpartyName: loanData.counterpartyName,
              amount: loanData.remainingAmount,
              dueDate,
              loanType: loanData.type, // 'lend' 或 'borrow'
              read: false,
              createdAt: serverTimestamp()
            });
            
            // 如果支援瀏覽器通知，也發送瀏覽器通知
            if (typeof window !== 'undefined' && 'Notification' in window) {
              if (Notification.permission === 'granted') {
                new Notification(`借貸${isOverdue ? '已逾期' : '即將到期'}`, {
                  body: `您${loanData.type === 'lend' ? '借給' : '借自'}${loanData.counterpartyName}的${loanData.remainingAmount}元${isOverdue ? '已' : '將在' + Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) + '天內'}到期`,
                  icon: '/favicon.ico'
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('檢查借貸到期失敗:', error);
      }
    };
    
    // 請求瀏覽器通知權限
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
    
    // 立即執行一次
    checkBudgetOverspending();
    checkLoanDueDate();
    
    // 每天執行一次預算超支檢查
    const dailyBudgetCheck = setInterval(checkBudgetOverspending, 24 * 60 * 60 * 1000);
    
    // 每6小時執行一次借貸到期檢查
    const loanDueCheck = setInterval(checkLoanDueDate, 6 * 60 * 60 * 1000);
    
    return () => {
      clearInterval(dailyBudgetCheck);
      clearInterval(loanDueCheck);
    };
  }, [currentUser]);

  // 這個組件不渲染任何內容
  return null;
};

export default BudgetNotification; 