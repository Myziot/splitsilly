import { create } from 'zustand';

interface Group {
  id: string;
  name: string;
  currency: string;
  expense_type?: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface GroupState {
  groups: Group[];
  currentGroup: Group | null;
  isLoading: boolean;
  fetchGroups: () => Promise<void>;
  createGroup: (name: string, currency: string, expenseType?: string) => Promise<Group>;
  deleteGroup: (groupId: string) => Promise<void>;
  setCurrentGroup: (group: Group | null) => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  currentGroup: null,
  isLoading: false,
  fetchGroups: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch('/api/v1/groups', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        set({ groups: data });
      }
    } finally {
      set({ isLoading: false });
    }
  },
  createGroup: async (name: string, currency: string, expenseType?: string) => {
    const response = await fetch('/api/v1/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, currency, expenseType: expenseType || 'general' }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create group');
    }

    const group = await response.json();
    set((state) => ({ groups: [...state.groups, group] }));
    return group;
  },
  deleteGroup: async (groupId: string) => {
    await fetch(`/api/v1/groups/${groupId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    set((state) => ({
      groups: state.groups.filter((g) => g.id !== groupId),
      currentGroup: state.currentGroup?.id === groupId ? null : state.currentGroup,
    }));
  },
  setCurrentGroup: (group: Group | null) => {
    set({ currentGroup: group });
  },
}));
