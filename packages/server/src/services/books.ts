import { db } from '../db';
import { groups, balancePlans, groupMembers, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { calculateBalances, optimizeBalances } from './balances';

export interface PlanLeg {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  paidAmount: number;
  remaining: number;
}

export interface LockState {
  isBookLocked: boolean;
  plan: PlanLeg[];
  planDiverged: boolean;
}

/** Lock state for a group (whether the suggested list is frozen + its legs). */
export async function getLockState(groupId: string): Promise<LockState> {
  const g = await db.select({ isBookLocked: groups.isBookLocked, planDiverged: groups.planDiverged }).from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!g[0] || !g[0].isBookLocked) {
    return { isBookLocked: false, plan: [], planDiverged: false };
  }
  return { isBookLocked: true, plan: await readPlan(groupId), planDiverged: !!g[0].planDiverged };
}

async function readPlan(groupId: string): Promise<PlanLeg[]> {
  const rows = await db
    .select()
    .from(balancePlans)
    .where(eq(balancePlans.groupId, groupId));
  return rows.map((p) => {
    const amount = parseFloat(p.amount.toString());
    const paid = parseFloat(p.paidAmount.toString());
    return {
      id: p.id,
      fromUserId: p.fromUserId,
      toUserId: p.toUserId,
      amount,
      paidAmount: paid,
      remaining: Math.round((amount - paid) * 100) / 100,
      settled: !!p.settled,
      reverseOf: p.reverseOf || null,
    };
  });
}

/**
 * Freeze the suggested who-pays-whom list for a group. Computes the live greedy
 * optimization across ALL members (global balances) and stores it as the frozen
 * plan. Recording a settlement while locked will strike a leg instead of
 * recomputing. Idempotent: re-freezing refreshes the snapshot.
 */
export async function freezePlan(groupId: string) {
  const mem = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
  const userIds = mem.map((m) => m.userId);
  const balances = await calculateBalances(groupId, userIds);
  const transactions = optimizeBalances(balances);

  return db.transaction(async (tx) => {
    await tx.delete(balancePlans).where(eq(balancePlans.groupId, groupId));
    if (transactions.length > 0) {
      await tx.insert(balancePlans).values(
        transactions.map((t) => ({
          groupId,
          fromUserId: t.fromUserId,
          toUserId: t.toUserId,
          amount: t.amount.toString(),
          paidAmount: '0',
        })),
      );
    }
    await tx.update(groups).set({ isBookLocked: true, planDiverged: false, updatedAt: new Date() }).where(eq(groups.id, groupId));
  });
}

/** Recalculate the frozen plan from LIVE balances WITHOUT unlocking the book.
 *  Wipes the existing legs and re-optimizes, then clears the divergence flag.
 *  Used when payments diverged from the snapshot — a tidy "resync" that keeps
 *  expenses locked. */
export async function recalculatePlan(groupId: string) {
  const mem = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
  const userIds = mem.map((m) => m.userId);
  const balances = await calculateBalances(groupId, userIds);
  const transactions = optimizeBalances(balances);

  return db.transaction(async (tx) => {
    await tx.delete(balancePlans).where(eq(balancePlans.groupId, groupId));
    if (transactions.length > 0) {
      await tx.insert(balancePlans).values(
        transactions.map((t) => ({
          groupId,
          fromUserId: t.fromUserId,
          toUserId: t.toUserId,
          amount: t.amount.toString(),
          paidAmount: '0',
        })),
      );
    }
    // Book stays locked; divergence flag clears because this new snapshot IS the truth.
    await tx.update(groups).set({ planDiverged: false, updatedAt: new Date() }).where(eq(groups.id, groupId));
  });
}

/** True when the frozen plan's per-user NET still matches the live balances.
 *  This is THE divergence test: the frozen "who owes who" is accurate iff every
 *  member's net (sum of what they're owed minus what they owe across legs)
 *  equals their live net balance (from expenses + settlements). A stale snapshot
 *  (e.g. a leg captured 21.07 while live is now 16.07) fails this and must
 *  be flagged so the client shows the recalc affordance.
 *
 *  Divergence is also flagged when the plan carries any REVERSE leg (over-pay
 *  excess / opposite / bogus payment): those represent payments that don't fit
 *  the original snapshot, so the book can't be considered "clean" even if the
 *  per-user nets happen to still agree. */
async function frozenMatchesLive(groupId: string): Promise<boolean> {
  const mem = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
  const userIds = mem.map((m) => m.userId);
  if (userIds.length === 0) return true;
  const live = await calculateBalances(groupId, userIds);
  const legs = await db.select().from(balancePlans).where(eq(balancePlans.groupId, groupId));

  // The canonical frozen plan is "clean" IFF no reverse (diverged) legs remain.
  // Reverse legs ARE the divergence: once the last one is settled/deleted, the
  // book has returned to its original tally (an off-plan payment that's been
  // corrected cancels out) — even if a now-absorbed settlement row lingers in
  // the live balance history. So the presence of reverse legs is the sole
  // signal; we don't compare against live nets here.
  if (legs.some((l) => l.reverseOf !== null)) return false;

  // ALSO flag divergence when the frozen per-user net (sum of what's STILL
  // owed across legs) no longer matches the live balance net. This catches the
  // stale-snapshot case where a settlement was reverted but its corresponding
  // reverse leg had already been consumed/removed, so unstrikePlan found
  // nothing to unwind and the frozen plan silently drifted from live balances
  // (e.g. everything showed "Settled 0.00" while who-owes/is-owed had flipped).
  // We compare REMAINING (not full amount): a fully-settled plan has all
  // remaining 0, matching the live net of 0, so "all settled" stays clean.
  const frozenNet = new Map<string, number>();
  for (const l of legs) {
    const amount = parseFloat(l.amount.toString());
    const paid = parseFloat(l.paidAmount.toString());
    const remaining = Math.round((amount - paid) * 100) / 100;
    // A leg is genuinely settled ONLY if its remaining is ~0. If the row still
    // carries a stale `settled=true` while remaining > 0 (e.g. a revert dropped
    // paid_amount back below the full amount but left the flag on), that alone
    // is a desync — skip it from the net AND fail the divergence test below.
    const trulySettled = remaining <= 0.001;
    if (!trulySettled) {
      frozenNet.set(l.toUserId, (frozenNet.get(l.toUserId) || 0) + remaining);
      frozenNet.set(l.fromUserId, (frozenNet.get(l.fromUserId) || 0) - remaining);
    }
    if (l.settled && !trulySettled) return false; // stale settled flag
  }
  const EPS = 0.01;
  for (const u of userIds) {
    const f = Math.round((frozenNet.get(u) || 0) * 100) / 100;
    const lvn = live.find((b) => b.userId === u);
    const lv = lvn ? Math.round(lvn.balance * 100) / 100 : 0;
    if (Math.abs(f - lv) > EPS) return false;
  }
  return true;
}

/** Unlock: drop the frozen plan and resume live computation. */
export async function unfreezePlan(groupId: string) {
  return db.transaction(async (tx) => {
    await tx.delete(balancePlans).where(eq(balancePlans.groupId, groupId));
    await tx.update(groups).set({ isBookLocked: false, updatedAt: new Date() }).where(eq(groups.id, groupId));
  });
}

/**
 * Strike a settlement against the group's FROZEN plan.
 *  - Matching leg (from->to) with remaining > 0: bump its paid_amount.
 *  - Over-payment beyond the leg's remaining: the excess is represented as a
 *    NEW reverse leg (to->from) so the card stays truthful to live balances.
 *    This is NOT a divergence (it's explained by a visible leg).
 *  - No matching leg in EITHER direction (fully off-plan): flag divergence.
 * Returns the plan leg struck (or null when fully off-plan).
 */
/** Recompute + persist the divergence flag from the canonical test. Centralised
 *  so both strike and un-strike keep it consistent. */
async function recomputeDivergence(groupId: string) {
  // Clear any STALE settled flags first: a leg whose remaining is > 0 must not
  // read as settled. This happens when a settlement is reverted and unstrikePlan
  // drops paidAmount back below the full amount but the flag was left on — the
  // client would otherwise render a "✓ Settled / 0.00" on a leg still owing.
  const legs = await db.select().from(balancePlans).where(eq(balancePlans.groupId, groupId));
  for (const l of legs) {
    const remaining = Math.round((parseFloat(l.amount.toString()) - parseFloat(l.paidAmount.toString())) * 100) / 100;
    if (l.settled && remaining > 0.001) {
      await db.update(balancePlans).set({ settled: false }).where(eq(balancePlans.id, l.id));
    }
  }
  const matches = await frozenMatchesLive(groupId);
  await db
    .update(groups)
    .set({ planDiverged: !matches, updatedAt: new Date() })
    .where(eq(groups.id, groupId));
}

export async function strikePlan(groupId: string, fromUserId: string, toUserId: string, amount: number): Promise<{ planId: string; applied: number } | null> {
  const result = await db.transaction(async (tx) => {
    const legs = await tx.select().from(balancePlans).where(eq(balancePlans.groupId, groupId));
    // Prefer a REVERSE (diverged) leg whose direction matches the payment.
    // Settling a correction leg must RESOLVE the divergence (delete it) rather
    // than strike the original frozen leg in the same direction.
    let leg = legs.find(
      (l) =>
        l.reverseOf !== null &&
        l.fromUserId === fromUserId &&
        l.toUserId === toUserId &&
        parseFloat(l.amount.toString()) - parseFloat(l.paidAmount.toString()) > 0.001,
    );
    const isReverse = !!leg;
    if (!leg) {
      leg = legs.find(
        (l) =>
          l.reverseOf === null &&
          l.fromUserId === fromUserId &&
          l.toUserId === toUserId &&
          parseFloat(l.amount.toString()) - parseFloat(l.paidAmount.toString()) > 0.001,
      );
    }
    if (!leg) {
      // Only treat this as striking an existing plan leg when from AND to are a
      // KNOWN plan pair (a leg exists between them in either direction). This
      // prevents an off-plan payment to a non-counterparty (e.g. Bosun->Wren
      // when the plan only has Bosun->Carmen / Bosun->Captain) from being
      // hijacked onto an unrelated leg — which would silently fail to surface the
      // corrective reverse leg the divergent payment actually requires.
      const isKnownPair = legs.some(
        (x) =>
          (x.fromUserId === fromUserId && x.toUserId === toUserId) ||
          (x.fromUserId === toUserId && x.toUserId === fromUserId),
      );
      if (isKnownPair) {
        leg = legs.find(
          (l) =>
            l.reverseOf === null &&
            l.fromUserId === fromUserId &&
            parseFloat(l.amount.toString()) - parseFloat(l.paidAmount.toString()) > 0.001,
        );
      }
    }
    if (!leg) {
      // Fully off-plan: no matching leg in either direction. Represent the
      // payment as a reverse leg (below the line) AND flag divergence. The leg
      // is INVERTED (to->from): a divergent payment "from pays to" outside the
      // plan means "to still owes from" — e.g. recording Captain->asd when the
      // plan says asd->Captain surfaces as asd->Captain (asd owes it back).
      const offId = crypto.randomUUID();
      await tx.insert(balancePlans).values({
        id: offId,
        groupId,
        fromUserId: toUserId,
        toUserId: fromUserId,
        amount: amount.toString(),
        paidAmount: '0',
        reverseOf: offId, // self-ref so it renders below the line
        settled: false,
      });
      await recomputeDivergence(groupId);
      return null;
    }
    const remaining = parseFloat(leg.amount.toString()) - parseFloat(leg.paidAmount.toString());
    const apply = Math.min(amount, remaining);
    const newPaid = parseFloat(leg.paidAmount.toString()) + apply;
    const nowSettled = remaining - apply <= 0.001;
    await tx
      .update(balancePlans)
      .set({
        paidAmount: newPaid.toString(),
        // Mark the leg settled once fully struck.
        settled: nowSettled,
      })
      .where(eq(balancePlans.id, leg.id));
    // If this leg is a reverse (diverged) leg and is now fully settled,
    // the divergence is RESOLVED — delete it so the book shows clean
    // (no lingering reverse leg, no Recalculate button).
    if (leg.reverseOf !== null && nowSettled) {
      await tx.delete(balancePlans).where(eq(balancePlans.id, leg.id));
    }
    // Over-payment: represent the excess as a reverse leg (to->from). Only for
    // NORMAL frozen legs — never fan an already-divergent reverse leg into yet
    // another reverse leg.
    if (!isReverse) {
      const excess = Math.round((amount - apply) * 100) / 100;
      if (excess > 0.001) {
        const revId = crypto.randomUUID();
        await tx.insert(balancePlans).values({
          id: revId,
          groupId,
          fromUserId: leg.toUserId,
          toUserId: leg.fromUserId,
          amount: excess.toString(),
          paidAmount: '0',
          reverseOf: leg.id,
          settled: false,
        });
      }
    }
    return { planId: leg.id, applied: Math.round(apply * 100) / 100 };
  });
  // Recompute divergence now that the strike (and any reverse leg) is committed.
  await recomputeDivergence(groupId);
  return result;
}

/**
 * Un-strike a settlement from the group's FROZEN plan (used on revert while
 * locked). If the struck leg is a reverse leg, decrement its PARENT instead
 * (the reverse leg is removed). Otherwise decrement the leg, and if that fully
 * clears it, remove any reverse leg that was spawned from it. When the plan
 * returns to its original frozen state (every leg at full remaining, no reverse
 * legs, no off-plan payments), the divergence flag is cleared.
 */
export async function unstrikePlan(groupId: string, fromUserId: string, toUserId: string, amount: number): Promise<{ planId: string; applied: number } | null> {
  const result = await db.transaction(async (tx) => {
    const legs = await tx.select().from(balancePlans).where(eq(balancePlans.groupId, groupId));
    // Prefer a reverse leg first (it's the one we actually unwind). Reverse legs
    // are INVERTED vs the recorded payment, so match either direction.
    let leg = legs.find(
      (l) =>
        l.reverseOf !== null &&
        ((l.fromUserId === fromUserId && l.toUserId === toUserId) ||
          (l.fromUserId === toUserId && l.toUserId === fromUserId)),
    );
    if (!leg) {
      leg = legs.find(
        (l) => l.fromUserId === fromUserId && l.toUserId === toUserId &&
          parseFloat(l.paidAmount.toString()) > 0.001,
      );
    }
    if (!leg) {
      // No frozen leg (normal or reverse) matched this reverted payment. That
      // happens when the settlement we're reverting had its reverse leg
      // consumed/removed earlier (e.g. a correcting settlement already struck
      // and deleted it). Rather than silently do nothing — which would leave
      // the frozen plan desynced from live balances — recreate the off-plan
      // reverse leg (to->from) so the divergence is visible below the line and
      // frozenMatchesLive (now net-aware) flags the card as diverged. This is
      // the symmetric inverse of strikePlan's off-plan branch.
      const offId = crypto.randomUUID();
      await tx.insert(balancePlans).values({
        id: offId,
        groupId,
        fromUserId: toUserId,
        toUserId: fromUserId,
        amount: amount.toString(),
        paidAmount: '0',
        reverseOf: offId, // self-ref so it renders below the line
        settled: false,
      });
      return null;
    }

    let targetId = leg.id;
    let unapply = Math.min(amount, parseFloat(leg.paidAmount.toString()));

    if (leg.reverseOf) {
      // Reverse leg: remove it, and decrement the parent it sprang from.
      targetId = leg.reverseOf;
      await tx.delete(balancePlans).where(eq(balancePlans.id, leg.id));
      const parent = legs.find((l) => l.id === leg!.reverseOf);
      if (parent) {
        unapply = Math.min(amount, parseFloat(parent.paidAmount.toString()));
        await tx
          .update(balancePlans)
          .set({
            paidAmount: Math.max(0, parseFloat(parent.paidAmount.toString()) - unapply).toString(),
            // A partial un-strike means the parent is no longer fully settled.
            settled: false,
          })
          .where(eq(balancePlans.id, parent.id));
      }
    } else {
      const newPaid = Math.max(0, parseFloat(leg.paidAmount.toString()) - unapply);
      await tx
        .update(balancePlans)
        .set({
          paidAmount: newPaid.toString(),
          settled: newPaid > 0.001,
        })
        .where(eq(balancePlans.id, leg.id));
      // If this leg is now fully unstruck, drop any reverse leg it spawned.
      if (newPaid <= 0.001) {
        await tx.delete(balancePlans).where(eq(balancePlans.reverseOf, leg.id));
      }
    }
    return { planId: targetId, applied: Math.round(unapply * 100) / 100 };
  });
  // OUTSIDE the transaction: the unstrike has committed, so frozenMatchesLive
  // (which reads via db) sees the real post-revert legs. Recompute divergence
  // centrally — this also clears the flag when a settled reverse leg was removed.
  await recomputeDivergence(groupId);
  return result;
}

