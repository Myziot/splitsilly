import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  // Operator back-office flag (server-side; true only for the seeded admin).
  isAdmin?: boolean;
  is_admin?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, company?: string) => Promise<void>;
  register: (email: string, password: string, name: string, company?: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  // NOTE: intentionally does NOT touch the global `isLoading` gate. That flag
  // is the bootstrap spinner in App.tsx (true only during checkAuth at startup).
  // Flipping it here would unmount <Login> mid-request and wipe the error state.
  // The per-request spinner is the component's own local useState (handled in
  // Login.tsx / Register.tsx). isLoading stays false after checkAuth.
  login: async (email: string, password: string, company?: string) => {
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, company: company || '' }),
      });

      if (!response.ok) {
        const error = await response.json();
        // Carry the server's reset-counter fields on the thrown error so the
        // login page can show a live "attempts remaining" countdown.
        const e = new Error(error.error || 'Login failed') as Error & {
          attemptsRemaining?: number;
          resetAvailable?: boolean;
        };
        if (typeof error.attemptsRemaining === 'number') e.attemptsRemaining = error.attemptsRemaining;
        if (typeof error.resetAvailable === 'boolean') e.resetAvailable = error.resetAvailable;
        throw e;
      }

      const data = await response.json();
      set({ user: data.user, isAuthenticated: true });
    } catch (error) {
      throw error;
    }
  },
  register: async (email: string, password: string, name: string, company?: string) => {
    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, name, company: company || '' }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Registration failed');
      }

      const data = await response.json();
      set({ user: data.user, isAuthenticated: true });
    } catch (error) {
      throw error;
    }
  },
  logout: async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },
  checkAuth: async () => {
    try {
      const response = await fetch('/api/v1/auth/me', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        set({ user: data.user, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
  setUser: (user: User | null) => {
    set({ user, isAuthenticated: !!user, isLoading: false });
  },
  resetPassword: async (token: string, newPassword: string) => {
    const response = await fetch('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, newPassword }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Password reset failed');
    }
  },
}));
