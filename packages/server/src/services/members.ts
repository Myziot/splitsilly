import { db } from '../db';
import {
  groupMembers,
  expenseSplits,
  expenseFlags,
  settlements,
  notifications,
  expenses,
  balancePlans,
  users,
} from '../db/schema';
import { eq, and, or, inArray } from 'drizzle-orm';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Placeholder-member data operations (feature-placeholder-member.md).
 * Shared by kickMember (routes/groups.ts) and the invitation routes
 * (routes/invitations.ts) so kick, discard, decline and accept-merge all run
 * the EXACT same cascade/merge math — one source of truth, no spaghetti.
 */

/**
 * D1 guard (feature-invite-vs-add-member): find the name of the first split
 * participant holding a passive `invited` seat in this group, or null.
 * `invited` ghosts must NEVER receive split rows — balances read splits, not
 * seats — so every split-writing path calls this before inserting. Returns a
 * display name so callers can raise a human-readable 400.
 */
export async function findInvitedSplitUser(
  groupId: string,
  splits: Array<{ user_id?: string }>,
): Promise<string | null> {
  const ids = [...new Set(splits.map((s) => s?.user_id).filter(Boolean))] as string[];
  if (ids.length === 0) return null;
  const hit = await db
    .select({ name: users.name })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.status, 'invited'),
      inArray(groupMembers.userId, ids),
    ))
    .limit(1);
  return hit.length > 0 ? hit[0].name : null;
}

/**
 * Purge one member's footprint from ONE group, in the caller's transaction:
 * their split rows + review flags (group-scoped), percent renormalization,
 * their settlements, their notifications, and finally the membership row.
 * Extracted verbatim from kickMember so placeholder discard inherits the
 * battle-tested behavior (including the percent re-scale that keeps the books
 * balanced when a splitter vanishes).
 */
export async function purgeMemberGroupData(tx: Tx, groupId: string, targetUserId: string) {
  const groupExpenseIds = await tx
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.groupId, groupId));

  if (groupExpenseIds.length > 0) {
    const ids = groupExpenseIds.map((e) => e.id);
    await tx
      .delete(expenseSplits)
      .where(and(eq(expenseSplits.userId, targetUserId), inArray(expenseSplits.expenseId, ids)));
    await tx
      .delete(expenseFlags)
      .where(and(eq(expenseFlags.userId, targetUserId), inArray(expenseFlags.expenseId, ids)));

    // Renormalize remaining PERCENT splits so they still sum to 100%.
    // (equal/shares self-correct via denominator/total; percent stores an
    // absolute %, so removing a splitter leaves a gap that must be rescaled.)
    for (const expenseId of ids) {
      const remaining = await tx
        .select({ userId: expenseSplits.userId, value: expenseSplits.value })
        .from(expenseSplits)
        .where(and(eq(expenseSplits.expenseId, expenseId), eq(expenseSplits.splitMode, 'percent')));
      const sum = remaining.reduce((acc, r) => acc + parseFloat(r.value?.toString() || '0'), 0);
      if (remaining.length > 0 && Math.abs(sum) > 0.0001 && Math.abs(sum - 100) > 0.01) {
        for (const r of remaining) {
          const newVal = (parseFloat(r.value?.toString() || '0') / sum) * 100;
          await tx
            .update(expenseSplits)
            .set({ value: (Math.round(newVal * 100) / 100).toString() })
            .where(and(eq(expenseSplits.expenseId, expenseId), eq(expenseSplits.userId, r.userId)));
        }
      }
    }
  }

  await tx
    .delete(settlements)
    .where(and(
      eq(settlements.groupId, groupId),
      or(eq(settlements.fromUserId, targetUserId), eq(settlements.toUserId, targetUserId))
    ));

  await tx
    .delete(notifications)
    .where(and(eq(notifications.groupId, groupId), eq(notifications.userId, targetUserId)));

  await tx
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));
}

/**
 * Delete a ghost users row ONLY if nothing references it anymore (Decision 9:
 * discard removes the ghost, but a ghost that was ever a payer or holds a
 * frozen-plan leg keeps its row — silently rewriting an expense's `paid_by`
 * would be a ledger lie; the admin panel keeps the ghost visible instead).
 * Returns true when the row was deleted.
 */
export async function deleteGhostIfUnreferenced(tx: Tx, ghostUserId: string): Promise<boolean> {
  const [memberships, splits, settlementsAsParty, paidExpenses, addedExpenses, planLegs] =
    await Promise.all([
      tx.select({ id: groupMembers.id }).from(groupMembers).where(eq(groupMembers.userId, ghostUserId)).limit(1),
      tx.select({ id: expenseSplits.id }).from(expenseSplits).where(eq(expenseSplits.userId, ghostUserId)).limit(1),
      tx
        .select({ id: settlements.id })
        .from(settlements)
        .where(or(eq(settlements.fromUserId, ghostUserId), eq(settlements.toUserId, ghostUserId)))
        .limit(1),
      tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.paidBy, ghostUserId)).limit(1),
      tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.addedBy, ghostUserId)).limit(1),
      tx
        .select({ id: balancePlans.id })
        .from(balancePlans)
        .where(or(eq(balancePlans.fromUserId, ghostUserId), eq(balancePlans.toUserId, ghostUserId)))
        .limit(1),
    ]);

  if (
    memberships.length || splits.length || settlementsAsParty.length ||
    paidExpenses.length || addedExpenses.length || planLegs.length
  ) {
    return false;
  }
  // notifications / sessions / password_reset_tokens reference users with
  // ON DELETE CASCADE — they unwind automatically with the row.
  await tx.delete(users).where(eq(users.id, ghostUserId));
  return true;
}

/**
 * Accept-merge (Decision 2/3): move the ghost's ENTIRE footprint onto the
 * claimer's real account inside the caller's transaction, then drop the now
 * empty membership + ghost rows.
 *
 * Duplicate-split guard: if the claimer already has a split row on the same
 * expense (they joined the group while their invite was pending), the ghost's
 * equal-mode row is DROPPED instead of repointed — two rows for one person on
 * one expense would double-count. Weighted rows never collide in practice
 * (weighted expenses skip the join-time auto-add), so they repoint as-is.
 */
export async function mergeGhostIntoUser(tx: Tx, ghostUserId: string, claimerId: string) {
  // 1) Splits: drop the ghost's duplicates, repoint the rest.
  const ghostSplits = await tx
    .select({ id: expenseSplits.id, expenseId: expenseSplits.expenseId })
    .from(expenseSplits)
    .where(eq(expenseSplits.userId, ghostUserId));
  for (const row of ghostSplits) {
    const dupe = await tx
      .select({ id: expenseSplits.id })
      .from(expenseSplits)
      .where(and(eq(expenseSplits.expenseId, row.expenseId), eq(expenseSplits.userId, claimerId)))
      .limit(1);
    if (dupe.length > 0) {
      await tx.delete(expenseSplits).where(eq(expenseSplits.id, row.id));
    } else {
      await tx
        .update(expenseSplits)
        .set({ userId: claimerId })
        .where(eq(expenseSplits.id, row.id));
    }
  }

  // 2) Review flags (unique-ish per expense; repoint — the owner-side row just
  //    needs to exist, and the claimer owns it now).
  await tx
    .update(expenseFlags)
    .set({ userId: claimerId })
    .where(eq(expenseFlags.userId, ghostUserId));

  // 3) Settlements where the ghost was a party (created_by is always a real
  //    session user — a ghost can never create one).
  await tx
    .update(settlements)
    .set({ fromUserId: claimerId })
    .where(eq(settlements.fromUserId, ghostUserId));
  await tx
    .update(settlements)
    .set({ toUserId: claimerId })
    .where(eq(settlements.toUserId, ghostUserId));

  // 4) Expenses the ghost fronted or recorded-by-proxy (credit follows the person).
  await tx
    .update(expenses)
    .set({ paidBy: claimerId })
    .where(eq(expenses.paidBy, ghostUserId));
  await tx
    .update(expenses)
    .set({ addedBy: claimerId })
    .where(eq(expenses.addedBy, ghostUserId));

  // 5) Frozen book legs (locked book keeps sailing after the merge).
  await tx
    .update(balancePlans)
    .set({ fromUserId: claimerId })
    .where(eq(balancePlans.fromUserId, ghostUserId));
  await tx
    .update(balancePlans)
    .set({ toUserId: claimerId })
    .where(eq(balancePlans.toUserId, ghostUserId));

  // 6) The ghost's notification rows (bell entries broadcast while they were
  //    "pending") become the claimer's.
  await tx
    .update(notifications)
    .set({ userId: claimerId })
    .where(eq(notifications.userId, ghostUserId));

  // 7) Drop the ghost's memberships (the claimer joins fresh rows below in
  //    acceptInvitation) and the ghost row itself.
  await tx.delete(groupMembers).where(eq(groupMembers.userId, ghostUserId));
  await tx.delete(users).where(eq(users.id, ghostUserId));
}
