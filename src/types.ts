export interface Expense {
  id: string;
  amount: number;
  category: string;
  date: string;
  notes: string;
  icon: string;
  attachments?: string[];
  userId?: string;
  createdAt?: Date;
  updatedAt?: Date | null;
} 
// 記一筆彈窗在支出/收入之間切換時，帶著走的內容
export interface EntryDraft {
  amount: string;
  date: string;
  notes: string;
}
