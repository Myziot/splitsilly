import { create } from 'zustand';

export type ActivityAction =
  | 'group_created'
  | 'member_joined'
  | 'member_removed'
  | 'invite_sent'
  | 'invite_link_shared'
  | 'settings_changed'
  | 'expense_created'
  | 'expense_updated'
  | 'expense_deleted'
  | 'settlement_recorded'
  | 'settlement_reverted'
  | 'settlement_edited'
  | 'book_locked'
  | 'book_unlocked'
  | 'book_recalculated'
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
  group_created: {
    icon: '🏕️',
    label: 'Group created',
    badge: 'bg-indigo-100 text-indigo-700',
    text: 'text-indigo-700',
  },
  member_joined: {
    icon: '🤝',
    label: 'Joined',
    badge: 'bg-emerald-100 text-emerald-700',
    text: 'text-emerald-700',
  },
  member_removed: {
    icon: '🚪',
    label: 'Removed',
    badge: 'bg-orange-100 text-orange-700',
    text: 'text-orange-700',
  },
  invite_sent: {
    icon: '✉️',
    label: 'Invite emailed',
    badge: 'bg-sky-100 text-sky-700',
    text: 'text-sky-700',
  },
  invite_link_shared: {
    icon: '🔗',
    label: 'Link shared',
    badge: 'bg-teal-100 text-teal-700',
    text: 'text-teal-700',
  },
  settings_changed: {
    icon: '⚙️',
    label: 'Settings',
    badge: 'bg-gray-200 text-gray-700',
    text: 'text-gray-700',
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
  settlement_reverted: {
    icon: '↩️',
    label: 'Payment reverted',
    badge: 'bg-fuchsia-100 text-fuchsia-700',
    text: 'text-fuchsia-700',
  },
  settlement_edited: {
    icon: '✏️',
    label: 'Payment edited',
    badge: 'bg-fuchsia-100 text-fuchsia-700',
    text: 'text-fuchsia-700',
  },
  book_locked: {
    icon: '🔒',
    label: 'Book locked',
    badge: 'bg-slate-100 text-slate-700',
    text: 'text-slate-700',
  },
  book_unlocked: {
    icon: '🔓',
    label: 'Book unlocked',
    badge: 'bg-slate-100 text-slate-700',
    text: 'text-slate-700',
  },
  book_recalculated: {
    icon: '🔄',
    label: 'Book recalculated',
    badge: 'bg-slate-100 text-slate-700',
    text: 'text-slate-700',
  },
  reset_settlements: {
    icon: '♻️',
    label: 'Balances reset',
    badge: 'bg-red-100 text-red-700',
    text: 'text-red-700',
  },
};

/**
 * Log-tab filter categories (Variant D, /log-filter-playground): one coarse
 * pill row, then type chips scoped to the chosen category.
 */
export type ActivityCategory = 'People' | 'Expenses' | 'Payments' | 'Book';

export const ACTIVITY_CATEGORY: Record<ActivityAction, ActivityCategory> = {
  group_created: 'People',
  member_joined: 'People',
  member_removed: 'People',
  invite_sent: 'People',
  invite_link_shared: 'People',
  settings_changed: 'People',
  expense_created: 'Expenses',
  expense_updated: 'Expenses',
  expense_deleted: 'Expenses',
  settlement_recorded: 'Payments',
  settlement_reverted: 'Payments',
  settlement_edited: 'Payments',
  reset_settlements: 'Payments',
  book_locked: 'Book',
  book_unlocked: 'Book',
  book_recalculated: 'Book',
};
