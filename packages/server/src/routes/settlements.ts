import { Request, Response } from 'express';
import { db } from '../db';
import { groups, settlements, groupMembers, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { sendReminderEmail, isEmailConfigured } from '../services/email';
import { hasRecentReminder, logEmail } from '../services/emailLog';
import { notifyGroupMembers, logGroupActivity } from './notifications';

export const settlementsHandler = {
  getSettlements: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;

      // Check membership
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        ))
        .limit(1);

      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const settlementResults = await db
        .select({
          id: settlements.id,
          groupId: settlements.groupId,
          fromUserId: settlements.fromUserId,
          toUserId: settlements.toUserId,
          amount: settlements.amount,
          description: settlements.description,
          createdBy: settlements.createdBy,
          createdAt: settlements.createdAt,
          fromUserName: users.name,
          fromUserEmail: users.email,
          fromUserCreatedAt: users.createdAt,
        })
        .from(settlements)
        .innerJoin(users, eq(settlements.fromUserId, users.id))
        .where(eq(settlements.groupId, groupId))
        .orderBy(settlements.createdAt);

      const result = [];
      for (const settlement of settlementResults) {
        const toUser = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, settlement.toUserId))
          .limit(1);

        result.push({
          id: settlement.id,
          group_id: settlement.groupId,
          from_user_id: settlement.fromUserId,
          from_user: {
            id: settlement.fromUserId,
            name: settlement.fromUserName,
            email: settlement.fromUserEmail,
            created_at: settlement.fromUserCreatedAt.toISOString(),
          },
          to_user_id: settlement.toUserId,
          to_user: {
            id: toUser[0].id,
            name: toUser[0].name,
            email: toUser[0].email,
            created_at: toUser[0].createdAt.toISOString(),
          },
          amount: parseFloat(settlement.amount.toString()),
          description: settlement.description,
          created_by: settlement.createdBy,
          created_at: settlement.createdAt.toISOString(),
        });
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Get settlements error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  createSettlement: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;
      const { from_user_id, to_user_id, amount, description } = req.body;

      // Check membership
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        ))
        .limit(1);

      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      // Validate users are in the group
      const fromMember = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, from_user_id)
        ))
        .limit(1);

      const toMember = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, to_user_id)
        ))
        .limit(1);

      if (fromMember.length === 0 || toMember.length === 0) {
        return res.status(400).json({ error: 'Both users must be members of the group' });
      }

      // Create settlement
      const settlementResult = await db
        .insert(settlements)
        .values({
          groupId,
          fromUserId: from_user_id,
          toUserId: to_user_id,
          amount: amount.toString(),
          description,
          createdBy: userId,
        })
        .returning();

      const settlement = settlementResult[0];

      // Notify every OTHER member that a settlement was recorded.
      try {
        const [gName, payer, payee] = await Promise.all([
          db.select({ name: groups.name, currency: groups.currency }).from(groups).where(eq(groups.id, groupId)).limit(1),
          db.select({ name: users.name }).from(users).where(eq(users.id, settlement.fromUserId)).limit(1),
          db.select({ name: users.name }).from(users).where(eq(users.id, settlement.toUserId)).limit(1),
        ]);
        await notifyGroupMembers(groupId, userId, 'settlement_recorded', {
          memberName: payer[0]?.name || 'A member',
          memberId: userId,
          payer: payer[0]?.name,
          payee: payee[0]?.name,
          amount: parseFloat(settlement.amount.toString()),
          currency: gName[0]?.currency || 'USD',
          groupName: gName[0]?.name || 'this group',
        });
        await logGroupActivity(groupId, userId, 'settlement_recorded', {
          actorName: payer[0]?.name || 'A member',
          payer: payer[0]?.name,
          payee: payee[0]?.name,
          amount: parseFloat(settlement.amount.toString()),
          currency: gName[0]?.currency || 'USD',
          groupName: gName[0]?.name || 'this group',
        });
      } catch (notifyErr) {
        console.error('Settlement notification error (non-fatal):', notifyErr);
      }

      // Get user details
      const fromUser = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, settlement.fromUserId))
        .limit(1);

      const toUser = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, settlement.toUserId))
        .limit(1);

      res.status(201).json({
        id: settlement.id,
        group_id: settlement.groupId,
        from_user_id: settlement.fromUserId,
        from_user: {
          id: fromUser[0].id,
          name: fromUser[0].name,
          email: fromUser[0].email,
          created_at: fromUser[0].createdAt.toISOString(),
        },
        to_user_id: settlement.toUserId,
        to_user: {
          id: toUser[0].id,
          name: toUser[0].name,
          email: toUser[0].email,
          created_at: toUser[0].createdAt.toISOString(),
        },
        amount: parseFloat(settlement.amount.toString()),
        description: settlement.description,
        created_by: settlement.createdBy,
        created_at: settlement.createdAt.toISOString(),
      });
    } catch (error) {
      console.error('Create settlement error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
  sendReminder: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;
      const { to_user_id, amount, note } = req.body || {};

      // Requester must be a member of the group.
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
        ))
        .limit(1);
      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      // Validate amount.
      const amt = typeof amount === 'number' ? amount : parseFloat(amount);
      if (!isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: 'A positive amount is required' });
      }

      // Both users must be in the group.
      const creditor = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .innerJoin(groupMembers, eq(groupMembers.userId, users.id))
        .where(and(eq(groupMembers.groupId, groupId), eq(users.id, userId)))
        .limit(1);
      const debtor = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .innerJoin(groupMembers, eq(groupMembers.userId, users.id))
        .where(and(eq(groupMembers.groupId, groupId), eq(users.id, to_user_id)))
        .limit(1);

      if (creditor.length === 0 || debtor.length === 0) {
        return res.status(400).json({ error: 'Both users must be members of the group' });
      }
      if (!debtor[0].email) {
        return res.status(400).json({ error: 'The recipient has no email address on file' });
      }

      // Group name for context.
      const groupResult = await db
        .select({ name: groups.name, currency: groups.currency })
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);
      const groupName = groupResult[0]?.name || 'this group';
      const currency = groupResult[0]?.currency || 'USD';

      // Rate limit: at most one reminder per (group, creditor, debtor) per 24h.
      const recent = await hasRecentReminder(groupId, userId, to_user_id);
      if (recent) {
        return res.status(429).json({
          error: 'You can only send a reminder to this person once per day. Try again tomorrow.',
        });
      }

      // Fail clearly if email is not configured (deferred activation).
      if (!isEmailConfigured()) {
        return res.status(503).json({
          error: 'Email service not configured (RESEND_API_KEY missing). Reminder not sent.',
        });
      }

      const subject = `Friendly reminder: you owe ${amt.toFixed(2)} ${currency} in "${groupName}"`;
      let result: { id: string };
      try {
        result = await sendReminderEmail({
          fromName: creditor[0].name,
          fromEmail: creditor[0].email,
          toName: debtor[0].name,
          toEmail: debtor[0].email,
          groupName,
          amount: amt,
          currency,
          note: note || null,
        });
        await logEmail({
          type: 'reminder',
          toEmail: debtor[0].email,
          subject,
          fromUserId: userId,
          toUserId: to_user_id,
          groupId,
          resendId: result.id,
          status: 'sent',
        });
      } catch (sendErr: any) {
        await logEmail({
          type: 'reminder',
          toEmail: debtor[0].email,
          subject,
          fromUserId: userId,
          toUserId: to_user_id,
          groupId,
          status: 'failed',
          errorMessage: sendErr?.message || 'Unknown send error',
        });
        throw sendErr;
      }

      res.status(200).json({ ok: true, sent_to: debtor[0].email, id: result.id });
    } catch (error: any) {
      console.error('Send reminder error:', error);
      res.status(500).json({ error: error?.message || 'Internal server error' });
    }
  },
  resetSettlements: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;

      // Membership + admin check
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }
      if (membership[0].role !== 'admin') {
        return res.status(403).json({ error: 'Only a group admin can reset all settlements' });
      }

      const deleted = await db
        .delete(settlements)
        .where(eq(settlements.groupId, groupId))
        .returning({ id: settlements.id });

      // Log the reset to the group activity feed so it's auditable.
      try {
        const [actor, gName] = await Promise.all([
          db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
          db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)).limit(1),
        ]);
        await logGroupActivity(groupId, userId, 'reset_settlements', {
          actorName: actor[0]?.name || 'An admin',
          count: deleted.length,
          groupName: gName[0]?.name || 'this group',
        });
      } catch (logErr) {
        console.error('Reset settlements activity log error (non-fatal):', logErr);
      }

      res.status(200).json({ success: true, deletedCount: deleted.length });
    } catch (error) {
      console.error('Reset settlements error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
  deleteSettlement: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId, settlementId } = req.params;

      // Membership check
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      // Only the creator of the settlement (or a group admin) may delete it.
      const existing = await db
        .select({ createdBy: settlements.createdBy, id: settlements.id })
        .from(settlements)
        .where(and(eq(settlements.id, settlementId), eq(settlements.groupId, groupId)))
        .limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Settlement not found' });
      }
      const isAdmin = membership[0].role === 'admin';
      if (existing[0].createdBy !== userId && !isAdmin) {
        return res.status(403).json({ error: 'Only the recorder or a group admin can revert this payment' });
      }

      await db
        .delete(settlements)
        .where(and(eq(settlements.id, settlementId), eq(settlements.groupId, groupId)));

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Delete settlement error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  updateSettlement: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId, settlementId } = req.params;
      const { from_user_id, to_user_id, amount, description } = req.body;

      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const existing = await db
        .select({ createdBy: settlements.createdBy, id: settlements.id })
        .from(settlements)
        .where(and(eq(settlements.id, settlementId), eq(settlements.groupId, groupId)))
        .limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Settlement not found' });
      }
      const isAdmin = membership[0].role === 'admin';
      if (existing[0].createdBy !== userId && !isAdmin) {
        return res.status(403).json({ error: 'Only the recorder or a group admin can edit this payment' });
      }

      // Build the update; only fields provided are changed (direction can be swapped).
      const updates: Record<string, any> = {};
      const newFrom = from_user_id ?? null;
      const newTo = to_user_id ?? null;
      if (newFrom || newTo) {
        // Current direction, to fall back when only one side is changed.
        const current = await db
          .select({ fromUserId: settlements.fromUserId, toUserId: settlements.toUserId })
          .from(settlements)
          .where(eq(settlements.id, settlementId))
          .limit(1);
        const effFrom = newFrom || current[0].fromUserId;
        const effTo = newTo || current[0].toUserId;
        // Validate both effective members are in the group
        const fromMember = await db
          .select()
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, effFrom)))
          .limit(1);
        const toMember = await db
          .select()
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, effTo)))
          .limit(1);
        if (fromMember.length === 0 || toMember.length === 0) {
          return res.status(400).json({ error: 'Both users must be members of the group' });
        }
        if (newFrom) updates.fromUserId = newFrom;
        if (newTo) updates.toUserId = newTo;
      }
      if (amount !== undefined && amount !== null) {
        if (typeof amount !== 'number' || amount <= 0) {
          return res.status(400).json({ error: 'Amount must be a positive number' });
        }
        updates.amount = amount.toString();
      }
      if (description !== undefined) updates.description = description;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      await db
        .update(settlements)
        .set(updates)
        .where(and(eq(settlements.id, settlementId), eq(settlements.groupId, groupId)));

      // Return the updated row with user details
      const updated = await db
        .select({
          id: settlements.id,
          fromUserId: settlements.fromUserId,
          toUserId: settlements.toUserId,
          amount: settlements.amount,
          description: settlements.description,
          fromUserName: users.name,
          toUserName: users.name,
        })
        .from(settlements)
        .innerJoin(users, eq(settlements.fromUserId, users.id))
        .where(eq(settlements.id, settlementId))
        .limit(1);

      res.status(200).json({ success: true, settlement: updated[0] });
    } catch (error) {
      console.error('Update settlement error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
