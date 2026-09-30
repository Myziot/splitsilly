import { create } from 'zustand';
import type { Invitation } from '../types/group';

interface InvitationsState {
  invitations: Invitation[];
  loading: boolean;
  fetchInvitations: () => Promise<void>;
  accept: (membershipId: string, inviteCode?: string) => Promise<void>;
  decline: (membershipId: string) => Promise<void>;
}

/**
 * Pending invitations addressed to the logged-in account's email
 * (feature-placeholder-member Decision 2b — account-based inbox; the email
 * parrot is just delivery). Accept merges the placeholder into this account.
 */
export const useInvitationStore = create<InvitationsState>((set, get) => ({
  invitations: [],
  loading: false,
  fetchInvitations: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/v1/invitations', { credentials: 'include' });
      set({ invitations: res.ok ? await res.json() : [], loading: false });
    } catch (e) {
      console.error('fetchInvitations error', e);
      set({ invitations: [], loading: false });
    }
  },
  accept: async (membershipId, inviteCode) => {
    const res = await fetch(`/api/v1/invitations/${membershipId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(inviteCode ? { invite_code: inviteCode } : {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to accept invitation');
    }
    set({ invitations: get().invitations.filter((i) => i.membership_id !== membershipId) });
  },
  decline: async (membershipId) => {
    const res = await fetch(`/api/v1/invitations/${membershipId}/decline`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to decline invitation');
    }
    set({ invitations: get().invitations.filter((i) => i.membership_id !== membershipId) });
  },
}));
