import { Request, Response } from 'express';
import { db } from '../db';
import { groups, groupMembers, users, expenses, expenseSplits, notifications, expenseFlags } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { notifyGroupMembers, logGroupActivity } from './notifications';
import { broadcastGroupChanged } from '../sockets';

// Weighted split modes that need owner attention when a member joins after.
const WEIGHTED = ['percent', 'shares'];

/**
 * Resolve WHO the participation endpoints act for (feature-placeholder-member
 * Decision 7): normally the requester themselves; with `for=<userId>` (admin
 * proxy), the target must be a PLACEHOLDER member of this group and the
 * requester must be an admin. Returns { targetUserId, error } — on error the
 * response is already sent and the caller must return.
 */
async function resolveParticipationTarget(
  req: Request,
  res: Response,
  requesterId: string,
  groupId: string,
  forParam: unknown,
): Promise<{ targetUserId: string; error: boolean }> {
  if (forParam === undefined || forParam === null || forParam === '') {
    return { targetUserId: requesterId, error: false };
  }
  if (typeof forParam !== 'string') {
    res.status(400).json({ error: 'Invalid "for" parameter' });
    return { targetUserId: '', error: true };
  }
  // Admin gate: only admins act as proxy for a placeholder (Decision 6).
  const admin = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, requesterId),
      eq(groupMembers.role, 'admin'),
    ))
    .limit(1);
  if (admin.length === 0) {
    res.status(403).json({ error: 'Only an admin can set participation for another member' });
    return { targetUserId: '', error: true };
  }
  // Target must be a placeholder member of THIS group — and NOT a passive
  // `invited` ghost (feature-invite-vs-add-member D2: invited seats join the
  // math only via admin Promote, never via the participation proxy).
  const target = await db
    .select({ id: groupMembers.id, status: groupMembers.status })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, forParam),
      eq(users.isPlaceholder, true),
    ))
    .limit(1);
  if (target.length === 0) {
    res.status(404).json({ error: 'Placeholder member not found in this group' });
    return { targetUserId: '', error: true };
  }
  if (target[0].status === 'invited') {
    res.status(400).json({ error: 'That member is invited but pending — promote them to the group first.' });
    return { targetUserId: '', error: true };
  }
  return { targetUserId: forParam, error: false };
}

export const joinHandler = {
  // Public: return minimal group info for an invite code (no auth).
  // Used by the join/register UI to show the group name before the user logs in.
  getInviteInfo: async (req: Request, res: Response) => {
    try {
      const { inviteCode } = req.params;
      const groupResult = await db
        .select({ name: groups.name, currency: groups.currency })
        .from(groups)
        .where(eq(groups.inviteCode, inviteCode.toUpperCase()))
        .limit(1);

      if (groupResult.length === 0) {
        return res.status(404).json({ error: 'Invite code not found' });
      }

      return res.status(200).json({
        groupName: groupResult[0].name,
        currency: groupResult[0].currency,
      });
    } catch (error) {
      console.error('Get invite info error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
  joinGroup: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { inviteCode } = req.params;

      // Find group by invite code
      const groupResult = await db
        .select()
        .from(groups)
        .where(eq(groups.inviteCode, inviteCode.toUpperCase()))
        .limit(1);

      if (groupResult.length === 0) {
        return res.status(404).json({ error: 'Invite code not found' });
      }

      const group = groupResult[0];

      // Check if already a member
      const existing = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, group.id),
          eq(groupMembers.userId, userId)
        ))
        .limit(1);

      if (existing.length > 0) {
        return res.status(400).json({ error: 'Already a member of this group' });
      }

      // Pending invitation ahead of a plain join (feature-placeholder-member
      // Decision 2/10b): if a ghost with MY email already counts in this
      // group's math, joining normally would create a SECOND seat. Surface the
      // claim card instead — the client offers Accept (merge) or a plain join
      // is refused until that's resolved.
      const [requester] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const ghostHit = await db
        .select({ membershipId: groupMembers.id, ghostName: users.name, ghostEmail: users.email, seatStatus: groupMembers.status })
        .from(groupMembers)
        .innerJoin(users, eq(users.id, groupMembers.userId))
        .where(and(
          eq(groupMembers.groupId, group.id),
          eq(users.isPlaceholder, true),
          eq(users.email, (requester?.email || '').toLowerCase()),
        ))
        .limit(1);
      if (requester && ghostHit.length > 0) {
        return res.status(200).json({
          id: group.id,
          name: group.name,
          currency: group.currency,
          invite_code: group.inviteCode,
          pending_invitation: {
            membership_id: ghostHit[0].membershipId,
            invited_name: ghostHit[0].ghostName,
            invited_email: ghostHit[0].ghostEmail,
            seat_status: ghostHit[0].seatStatus,
          },
        });
      }

      // Add as member
      await db.insert(groupMembers).values({
        groupId: group.id,
        userId,
        role: 'member',
      });

      // Transparent group log: member joined. Fires for EVERY join path —
      // previously this lived only in applyEqualParticipation, so joining a
      // group with no equal-split expenses logged nothing (bug, 2026-09-27).
      try {
        const joinerRow = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        await logGroupActivity(group.id, userId, 'member_joined', {
          actorName: joinerRow[0]?.name || 'A new member',
          groupName: group.name,
        });
      } catch (logErr) {
        console.error('Join activity log error (non-fatal):', logErr);
      }

      // --- Activity: notify owners of weighted (percent/shares) expenses that
      //     predate this join, and flag those expenses for owner attention. ---
      try {
        const joiner = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        const joinerName = joiner[0]?.name || 'A new member';

        const groupExpenses = await db
          .select({ id: expenses.id, addedBy: expenses.addedBy, createdAt: expenses.createdAt })
          .from(expenses)
          .where(eq(expenses.groupId, group.id));

        // Gather split modes for these expenses in one query.
        const expenseIds = groupExpenses.map((e) => e.id);
        const weightedOwnerCount = new Map<string, number>(); // ownerId -> # weighted expenses
        const weightedExpenseIds: string[] = [];
        if (expenseIds.length > 0) {
          const splits = await db
            .select({ expenseId: expenseSplits.expenseId, splitMode: expenseSplits.splitMode })
            .from(expenseSplits)
            .where(inArray(expenseSplits.expenseId, expenseIds));
          const weightedByExpense = new Map<string, boolean>();
          for (const s of splits) {
            if (WEIGHTED.includes(s.splitMode)) weightedByExpense.set(s.expenseId, true);
          }
          for (const e of groupExpenses) {
            if (weightedByExpense.get(e.id)) {
              weightedExpenseIds.push(e.id);
              // Flag the EXPENSE OWNER (addedBy) for review — they're the one
              // who must decide whether to include the newcomer. Skip if the
              // joiner is themselves the owner.
              if (e.addedBy && e.addedBy !== userId) {
                weightedOwnerCount.set(e.addedBy, (weightedOwnerCount.get(e.addedBy) || 0) + 1);
              }
            }
          }
        }

        // One notification per affected owner + a flag row (for the owner) per
        // affected expense.
        for (const [ownerId, count] of weightedOwnerCount.entries()) {
          await db.insert(notifications).values({
            userId: ownerId,
            groupId: group.id,
            type: 'member_joined_review',
            payload: {
              memberName: joinerName,
              memberId: userId,
              expenseCount: count,
              groupName: group.name,
            },
          });
        }
        if (weightedExpenseIds.length > 0) {
          const flagRows = weightedExpenseIds
            .map((expenseId) => {
              const owner = groupExpenses.find((e) => e.id === expenseId)?.addedBy;
              return owner ? { userId: owner, groupId: group.id, expenseId, reason: 'member_joined_after' as const } : null;
            })
            .filter(Boolean) as { userId: string; expenseId: string; reason: 'member_joined_after' }[];
          if (flagRows.length > 0) {
            await db.insert(expenseFlags).values(flagRows);
          }
        }
      } catch (notifyErr) {
        // Notifications are best-effort; never block the join itself.
        console.error('Join notification error (non-fatal):', notifyErr);
      }

      // NOTE: invite_code is intentionally NOT rotated on join. It is a
      // permanent, shareable group link (a convenience for inviting/joining),
      // not a single-use token. The emailed invite link stays valid for
      // future joins. Duplicate joins are blocked above by the membership check.

      res.status(200).json({
        id: group.id,
        name: group.name,
        currency: group.currency,
        invite_code: group.inviteCode,
        created_by: group.createdBy,
        created_at: group.createdAt.toISOString(),
        updated_at: group.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error('Join group error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // List the group's EQUAL expenses so a freshly-joined member can choose which
  // ones they participated in. Only equal-mode expenses are offered (percent/
  // shares use the owner-side review flow). Caller must be a member.
  getJoinableEqualExpenses: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { groupId } = req.params;

      // Admin-proxy support (Decision 7): ?for=<placeholderUserId> lists the
      // expenses for THAT member; without it, for the requester.
      const target = await resolveParticipationTarget(req, res, userId, groupId, req.query.for);
      if (target.error) return;
      const targetUserId = target.targetUserId;

      // Membership gate (for the requester; the proxy path already validated
      // admin + placeholder membership above).
      const membership = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)))
        .limit(1);
      if (membership.length === 0) return res.status(404).json({ error: 'Group not found' });

      // All expenses in the group + their split modes + payer name.
      const groupExpenses = await db
        .select({
          id: expenses.id,
          description: expenses.description,
          amount: expenses.amount,
          currency: expenses.currency,
          expenseDate: expenses.expenseDate,
          addedBy: expenses.addedBy,
          paidBy: expenses.paidBy,
        })
        .from(expenses)
        .where(eq(expenses.groupId, groupId));

      if (groupExpenses.length === 0) return res.status(200).json([]);

      const expenseIds = groupExpenses.map((e) => e.id);
      const splits = await db
        .select({ expenseId: expenseSplits.expenseId, splitMode: expenseSplits.splitMode, userId: expenseSplits.userId })
        .from(expenseSplits)
        .where(inArray(expenseSplits.expenseId, expenseIds));

      // An expense is "equal" if any of its split rows is equal mode.
      const equalExpenseIds = new Set<string>();
      const alreadyIn = new Set<string>(); // expenseIds the target already has a row in
      for (const s of splits) {
        if (s.splitMode === 'equal') equalExpenseIds.add(s.expenseId);
        if (s.userId === targetUserId) alreadyIn.add(s.expenseId);
      }

      // Payer name lookup.
      const payerIds = Array.from(new Set(groupExpenses.map((e) => e.paidBy)));
      const payers = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, payerIds));
      const payerName = new Map(payers.map((p) => [p.id, p.name]));

      const result = groupExpenses
        .filter((e) => equalExpenseIds.has(e.id) && !alreadyIn.has(e.id))
        .map((e) => ({
          id: e.id,
          description: e.description,
          amount: e.amount,
          currency: e.currency,
          expense_date: e.expenseDate,
          paid_by_name: payerName.get(e.paidBy) || 'Someone',
          is_owner: e.addedBy === targetUserId,
        }));

      res.status(200).json(result);
    } catch (error) {
      console.error('Get joinable equal expenses error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Apply a joiner's equal-participation selections.
  // Body: { participate: string[], optOut: string[] } — arrays of expenseIds.
  //  - participate → insert an equal split row for the joiner (idempotent).
  //  - optOut      → flag the expense creator + notify them to review.
  applyEqualParticipation: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { groupId } = req.params;
      const participate: string[] = Array.isArray(req.body?.participate) ? req.body.participate : [];
      const optOut: string[] = Array.isArray(req.body?.optOut) ? req.body.optOut : [];

      // Admin-proxy support (Decision 7): body.for=<placeholderUserId> applies
      // the selections FOR that ghost, with the requester as admin.
      const target = await resolveParticipationTarget(req, res, userId, groupId, req.body?.for);
      if (target.error) return;
      const targetUserId = target.targetUserId;

      // Membership gate.
      const membership = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)))
        .limit(1);
      if (membership.length === 0) return res.status(404).json({ error: 'Group not found' });

      const touchedIds = [...participate, ...optOut];
      if (touchedIds.length === 0) return res.status(200).json({ ok: true, added: 0, flagged: 0 });

      // Validate the expenses belong to this group and are equal-mode.
      const groupExpenses = await db
        .select({ id: expenses.id, addedBy: expenses.addedBy })
        .from(expenses)
        .where(and(eq(expenses.groupId, groupId), inArray(expenses.id, touchedIds)));
      const ownerById = new Map(groupExpenses.map((e) => [e.id, e.addedBy]));
      const validIds = new Set(groupExpenses.map((e) => e.id));

      let added = 0;
      let flagged = 0;

      // --- Opt IN: insert an equal split row for the target (skip if present). ---
      for (const expenseId of participate) {
        if (!validIds.has(expenseId)) continue;
        const existing = await db
          .select({ id: expenseSplits.id })
          .from(expenseSplits)
          .where(and(eq(expenseSplits.expenseId, expenseId), eq(expenseSplits.userId, targetUserId)))
          .limit(1);
        if (existing.length > 0) continue;
        await db.insert(expenseSplits).values({ expenseId, userId: targetUserId, splitMode: 'equal', value: null });
        added += 1;
      }

      // --- Opt OUT: flag the creator + notify them to review (reuse machinery). ---
      const joiner = await db.select({ name: users.name }).from(users).where(eq(users.id, targetUserId)).limit(1);
      const joinerName = joiner[0]?.name || 'A new member';
      const grp = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)).limit(1);
      const groupName = grp[0]?.name || 'your group';
      const optOutOwnerCount = new Map<string, number>();

      for (const expenseId of optOut) {
        if (!validIds.has(expenseId)) continue;
        const owner = ownerById.get(expenseId);
        if (!owner || owner === targetUserId) continue; // skip if target owns it
        await db.insert(expenseFlags).values({ userId: owner, groupId, expenseId, reason: 'member_joined_after' });
        optOutOwnerCount.set(owner, (optOutOwnerCount.get(owner) || 0) + 1);
        flagged += 1;
      }
      for (const [ownerId, count] of optOutOwnerCount.entries()) {
        await db.insert(notifications).values({
          userId: ownerId,
          groupId,
          type: 'member_joined_review',
          payload: { memberName: joinerName, memberId: targetUserId, expenseCount: count, groupName, optedOut: true },
        });
      }

      // NOTE: the transparent 'member_joined' group-log row now lives in
      // joinGroup (fires for every join path). Do NOT re-add it here — the
      // participation step is optional and would double-log.

      res.status(200).json({ ok: true, added, flagged });
      broadcastGroupChanged(groupId);
    } catch (error) {
      console.error('Apply equal participation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
