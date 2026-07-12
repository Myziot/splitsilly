import { create } from 'zustand';

export interface Notification {
  id: string;
  type: string;
  payload: Record<string, any>;
  is_read: boolean;
  group_id: string;
  created_at: string;
}

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  fetchNotifications: async () => {
    try {
      const res = await fetch('/api/v1/notifications');
      if (!res.ok) return;
      const data = await res.json();
      set({ notifications: data });
    } catch (e) {
      console.error('fetchNotifications error', e);
    }
  },
  fetchUnreadCount: async () => {
    try {
      const res = await fetch('/api/v1/notifications/unread-count');
      if (!res.ok) return;
      const data = await res.json();
      set({ unreadCount: data.count || 0 });
    } catch (e) {
      console.error('fetchUnreadCount error', e);
    }
  },
  markRead: async (id: string) => {
    try {
      await fetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
      set((s) => ({
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
    } catch (e) {
      console.error('markRead error', e);
    }
  },
}));
