import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

interface Balance {
  user_id: string;
  user: User;
  balance: number;
}

interface Transaction {
  from_user_id: string;
  from_user: User;
  to_user_id: string;
  to_user: User;
  amount: number;
}

interface SettlementUser {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

interface Settlement {
  id: string;
  from_user_id: string;
  from_user: SettlementUser;
  to_user_id: string;
  to_user: SettlementUser;
  amount: number;
  description: string | null;
  created_at: string; // ISO datetime
}

interface BalanceState {
  balances: Balance[];
  optimizedTransactions: Transaction[];
  settlements: Settlement[];
  isOptimized: boolean;
  isLoading: boolean;
  fetchBalances: (groupId: string) => Promise<void>;
  fetchSettlements: (groupId: string) => Promise<void>;
  deleteSettlement: (groupId: string, settlementId: string) => Promise<void>;
  resetSettlements: (groupId: string) => Promise<void>;
  sendReminder: (
    groupId: string,
    toUserId: string,
    amount: number,
    note?: string
  ) => Promise<{ ok: boolean; sent_to?: string }>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  updateSettlement: (
    groupId: string,
    settlementId: string,
    data: { from_user_id?: string; to_user_id?: string; amount?: number; description?: string }
  ) => Promise<void>;
  toggleOptimize: () => void;
}

export const useBalanceStore = create<BalanceState>((set, get) => ({
  balances: [],
  optimizedTransactions: [],
  settlements: [],
  isOptimized: false,
  isLoading: false,
  fetchBalances: async (groupId: string) => {
    set({ isLoading: true });
    try {
      const [balancesRes, optimizeRes] = await Promise.all([
        fetch(`/api/v1/groups/${groupId}/balances`, { credentials: 'include' }),
        fetch(`/api/v1/groups/${groupId}/balances/optimize`, { credentials: 'include' }),
      ]);

      if (balancesRes.ok) {
        const balances = await balancesRes.json();
        set({ balances });
      }

      if (optimizeRes.ok) {
        const data = await optimizeRes.json();
        set({ optimizedTransactions: data.transactions });
      }
    } finally {
      set({ isLoading: false });
    }
  },
  fetchSettlements: async (groupId: string) => {
    try {
      const response = await fetch(`/api/v1/groups/${groupId}/settlements`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        set({ settlements: data });
      }
    } catch (error) {
      console.error('Failed to fetch settlements:', error);
    }
  },
  toggleOptimize: () => {
    set((state) => ({ isOptimized: !state.isOptimized }));
  },
  deleteSettlement: async (groupId: string, settlementId: string) => {
    try {
      const response = await fetch(
        `/api/v1/groups/${groupId}/settlements/${settlementId}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to revert payment');
      }
      set((state) => ({
        settlements: state.settlements.filter((s) => s.id !== settlementId),
      }));
    } catch (error) {
      console.error('Failed to delete settlement:', error);
      throw error;
    }
  },
  resetSettlements: async (groupId: string) => {
    try {
      const response = await fetch(
        `/api/v1/groups/${groupId}/settlements`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to reset settlements');
      }
      set({ settlements: [] });
    } catch (error) {
      console.error('Failed to reset settlements:', error);
      throw error;
    }
  },
  sendReminder: async (groupId: string, toUserId: string, amount: number, note?: string) => {
    const response = await fetch(
      `/api/v1/groups/${groupId}/settlements/remind`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to_user_id: toUserId, amount, note: note || null }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to send reminder');
    }
    const data = await response.json();
    return { ok: true, sent_to: data.sent_to };
  },
  removeMember: async (groupId: string, userId: string) => {
    const response = await fetch(
      `/api/v1/groups/${groupId}/members/${userId}`,
      { method: 'DELETE', credentials: 'include' }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to remove member');
    }
  },
  updateSettlement: async (groupId: string, settlementId: string, data) => {
    try {
      const response = await fetch(
        `/api/v1/groups/${groupId}/settlements/${settlementId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to update payment');
      }
      // Refetch to keep the list consistent with the server.
      const refreshed = await fetch(`/api/v1/groups/${groupId}/settlements`, {
        credentials: 'include',
      });
      if (refreshed.ok) {
        set({ settlements: await refreshed.json() });
      }
    } catch (error) {
      console.error('Failed to update settlement:', error);
      throw error;
    }
  },
}));
