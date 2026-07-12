import { Request, Response } from 'express';
import { db } from '../db';
import { groups, groupMembers, users, expenses, expenseSplits, notifications, expenseFlags } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { notifyGroupMembers, logGroupActivity } from './notifications';

// Weighted split modes that need owner attention when a member joins after.
const WEIGHTED = ['percent', 'shares'];

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

      // Add as member
      await db.insert(groupMembers).values({
        groupId: group.id,
        userId,
        role: 'member',
      });

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

      // Membership gate.
      const membership = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
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
      const alreadyIn = new Set<string>(); // expenseIds the joiner already has a row in
      for (const s of splits) {
        if (s.splitMode === 'equal') equalExpenseIds.add(s.expenseId);
        if (s.userId === userId) alreadyIn.add(s.expenseId);
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
          is_owner: e.addedBy === userId,
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

      // Membership gate.
      const membership = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
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

      // --- Opt IN: insert an equal split row for the joiner (skip if present). ---
      for (const expenseId of participate) {
        if (!validIds.has(expenseId)) continue;
        const existing = await db
          .select({ id: expenseSplits.id })
          .from(expenseSplits)
          .where(and(eq(expenseSplits.expenseId, expenseId), eq(expenseSplits.userId, userId)))
          .limit(1);
        if (existing.length > 0) continue;
        await db.insert(expenseSplits).values({ expenseId, userId, splitMode: 'equal', value: null });
        added += 1;
      }

      // --- Opt OUT: flag the creator + notify them to review (reuse machinery). ---
      const joiner = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      const joinerName = joiner[0]?.name || 'A new member';
      const grp = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)).limit(1);
      const groupName = grp[0]?.name || 'your group';
      const optOutOwnerCount = new Map<string, number>();

      for (const expenseId of optOut) {
        if (!validIds.has(expenseId)) continue;
        const owner = ownerById.get(expenseId);
        if (!owner || owner === userId) continue; // skip if joiner owns it
        await db.insert(expenseFlags).values({ userId: owner, groupId, expenseId, reason: 'member_joined_after' });
        optOutOwnerCount.set(owner, (optOutOwnerCount.get(owner) || 0) + 1);
        flagged += 1;
      }
      for (const [ownerId, count] of optOutOwnerCount.entries()) {
        await db.insert(notifications).values({
          userId: ownerId,
          groupId,
          type: 'member_joined_review',
          payload: { memberName: joinerName, memberId: userId, expenseCount: count, groupName, optedOut: true },
        });
      }

      // Transparent group log: member joined (visible to all, including late joiners).
      await logGroupActivity(groupId, userId, 'member_joined', {
        actorName: joinerName,
        groupName,
      });

      res.status(200).json({ ok: true, added, flagged });
    } catch (error) {
      console.error('Apply equal participation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
