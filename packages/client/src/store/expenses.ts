import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  user: User;
  split_mode: 'equal' | 'percent' | 'shares';
  value: number | null;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  is_active: boolean;
}

interface Expense {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  currency: string;
  exchange_rate: number | null;
  amount_master: number;
  paid_by: string;
  payer: User;
  added_by: string;
  category_id: string | null;
  category: Category | null;
  expense_date: string;
  receipt_path: string | null;
  can_edit?: boolean;
  splits: ExpenseSplit[];
  created_at: string;
  updated_at: string;
}

interface ExpenseState {
  expenses: Expense[];
  isLoading: boolean;
  fetchExpenses: (groupId: string) => Promise<void>;
  createExpense: (
    groupId: string,
    data: {
      description: string;
      amount: number;
      currency: string;
      paid_by: string;
      category_id: string | null;
      expense_date: string;
      splits: Array<{ user_id: string; split_mode: 'equal' | 'percent' | 'shares'; value: number | null }>;
    }
  ) => Promise<Expense>;
  updateExpense: (
    groupId: string,
    expenseId: string,
    data: {
      description: string;
      amount: number;
      currency: string;
      paid_by: string;
      category_id: string | null;
      expense_date: string;
      splits: Array<{ user_id: string; split_mode: 'equal' | 'percent' | 'shares'; value: number | null }>;
    }
  ) => Promise<Expense>;
  deleteExpense: (groupId: string, expenseId: string) => Promise<void>;
  setExpenses: (expenses: Expense[]) => void;
}

export const useExpenseStore = create<ExpenseState>((set) => ({
  expenses: [],
  isLoading: false,
  fetchExpenses: async (groupId: string) => {
    set({ isLoading: true });
    try {
      const response = await fetch(`/api/v1/groups/${groupId}/expenses`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        set({ expenses: data });
      }
    } finally {
      set({ isLoading: false });
    }
  },
  createExpense: async (groupId: string, data) => {
    const response = await fetch(`/api/v1/groups/${groupId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create expense');
    }

    const expense = await response.json();
    set((state) => ({ expenses: [...state.expenses, expense] }));
    return expense;
  },
  updateExpense: async (groupId: string, expenseId: string, data) => {
    const response = await fetch(`/api/v1/groups/${groupId}/expenses/${expenseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update expense');
    }

    const expense = await response.json();
    set((state) => ({
      expenses: state.expenses.map((e) => (e.id === expenseId ? expense : e)),
    }));
    return expense;
  },
  deleteExpense: async (groupId: string, expenseId: string) => {
    await fetch(`/api/v1/groups/${groupId}/expenses/${expenseId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    set((state) => ({
      expenses: state.expenses.filter((e) => e.id !== expenseId),
    }));
  },
  setExpenses: (expenses: Expense[]) => {
    set({ expenses });
  },
}));
