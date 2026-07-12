import { create } from 'zustand';

export type ActivityAction =
  | 'member_joined'
  | 'expense_created'
  | 'expense_updated'
  | 'expense_deleted'
  | 'settlement_recorded'
  | 'reset_settlements';

export interface ActivityEntry {
  id: string;
  actor_id: string | null;
  action: ActivityAction;
  details: Record<string, any>;
  created_at: string; // ISO instant
}

interface ActivityState {
  activities: ActivityEntry[];
  loading: boolean;
  fetchActivity: (groupId: string) => Promise<void>;
}

export const useActivityStore = create<ActivityState>((set) => ({
  activities: [],
  loading: false,
  fetchActivity: async (groupId: string) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/v1/groups/${groupId}/activity`, {
        credentials: 'include',
      });
      if (!res.ok) {
        set({ activities: [], loading: false });
        return;
      }
      const data = await res.json();
      set({ activities: data || [], loading: false });
    } catch (e) {
      console.error('fetchActivity error', e);
      set({ activities: [], loading: false });
    }
  },
}));

/**
 * Per-action presentation: icon + a tailwind color class for the badge, and a
 * human label. Used by the Log tab to give each category a distinct identity.
 */
export const ACTIVITY_META: Record<
  ActivityAction,
  { icon: string; label: string; badge: string; text: string }
> = {
  member_joined: {
    icon: '🤝',
    label: 'Joined',
    badge: 'bg-emerald-100 text-emerald-700',
    text: 'text-emerald-700',
  },
  expense_created: {
    icon: '➕',
    label: 'Expense added',
    badge: 'bg-blue-100 text-blue-700',
    text: 'text-blue-700',
  },
  expense_updated: {
    icon: '✏️',
    label: 'Expense edited',
    badge: 'bg-amber-100 text-amber-700',
    text: 'text-amber-700',
  },
  expense_deleted: {
    icon: '🗑️',
    label: 'Expense deleted',
    badge: 'bg-red-100 text-red-700',
    text: 'text-red-700',
  },
  settlement_recorded: {
    icon: '💸',
    label: 'Settled',
    badge: 'bg-purple-100 text-purple-700',
    text: 'text-purple-700',
  },
  reset_settlements: {
    icon: '♻️',
    label: 'Balances reset',
    badge: 'bg-red-100 text-red-700',
    text: 'text-red-700',
  },
};
