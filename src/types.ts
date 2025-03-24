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