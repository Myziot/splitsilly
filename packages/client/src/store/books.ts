import { create } from 'zustand';

interface PlanLeg {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  paidAmount: number;
  remaining: number;
  settled: boolean;
  reverseOf: string | null;
}

interface LockPlanState {
  isBookLocked: boolean;
  plan: PlanLeg[];
  planDiverged: boolean;
  isLoading: boolean;
  fetchLock: (groupId: string) => Promise<void>;
  lockPlan: (groupId: string) => Promise<void>;
  unlockPlan: (groupId: string) => Promise<void>;
  recalculate: (groupId: string) => Promise<void>;
  // Record a settlement against the group. When locked, the server strikes the
  // frozen plan leg; when unlocked the suggested list simply recomputes live.
  settleAgainstPlan: (
    groupId: string,
    fromUserId: string,
    toUserId: string,
    amount: number,
  ) => Promise<void>;
}

async function postJson(url: string, method = 'POST', body?: any) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const useLockPlanStore = create<LockPlanState>((set, get) => ({
  isBookLocked: false,
  plan: [],
  planDiverged: false,
  isLoading: false,
  fetchLock: async (groupId: string) => {
    set({ isLoading: true });
    try {
      const res = await fetch(`/api/v1/groups/${groupId}/lock`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        set({ isBookLocked: !!data.isBookLocked, plan: data.plan || [], planDiverged: !!data.planDiverged });
      }
    } finally {
      set({ isLoading: false });
    }
  },
  lockPlan: async (groupId: string) => {
    const data = await postJson(`/api/v1/groups/${groupId}/lock`);
    set({ isBookLocked: true, plan: data.plan || [], planDiverged: !!data.planDiverged });
  },
  unlockPlan: async (groupId: string) => {
    await postJson(`/api/v1/groups/${groupId}/lock`, 'DELETE');
    set({ isBookLocked: false, plan: [], planDiverged: false });
  },
  recalculate: async (groupId: string) => {
    const data = await postJson(`/api/v1/groups/${groupId}/recalculate`);
    set({ isBookLocked: !!data.isBookLocked, plan: data.plan || [], planDiverged: !!data.planDiverged });
  },
  settleAgainstPlan: async (groupId, fromUserId, toUserId, amount) => {
    await postJson(`/api/v1/groups/${groupId}/settlements`, 'POST', {
      from_user_id: fromUserId,
      to_user_id: toUserId,
      amount,
    });
    // Refetch lock state so the frozen legs reflect the strike.
    await get().fetchLock(groupId);
  },
}));
