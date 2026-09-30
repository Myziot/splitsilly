import { Request, Response } from 'express';
import { db } from '../db';
import { groupMembers, users } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { calculateBalances, optimizeBalances } from '../services/balances';

export const balancesHandler = {
  getBalances: async (req: Request, res: Response) => {
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

      // Get all member user IDs — passive `invited` seats are EXCLUDED
      // (feature-invite-vs-add-member D1: they hold no splits, so listing
      // them would render phantom zero-rows in the balances card).
      const members = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          sql`${groupMembers.status} <> 'invited'`,
        ));

      const userIds = members.map(m => m.userId);

      // Calculate balances
      const balances = await calculateBalances(groupId, userIds);

      // Get user details
      const result = [];
      for (const balance of balances) {
        const userResult = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, balance.userId))
          .limit(1);

        result.push({
          user_id: balance.userId,
          user: {
            id: userResult[0].id,
            name: userResult[0].name,
            email: userResult[0].email,
            created_at: userResult[0].createdAt.toISOString(),
          },
          balance: balance.balance,
        });
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Get balances error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  optimizeBalances: async (req: Request, res: Response) => {
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

      // Get all member user IDs — passive `invited` seats are EXCLUDED
      // (feature-invite-vs-add-member D1: they hold no splits, so listing
      // them would render phantom zero-rows in the balances card).
      const members = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          sql`${groupMembers.status} <> 'invited'`,
        ));

      const userIds = members.map(m => m.userId);

      // Calculate and optimize balances
      const balances = await calculateBalances(groupId, userIds);
      const transactions = optimizeBalances(balances);

      // Get user details for transactions
      const result = [];
      for (const transaction of transactions) {
        const fromUser = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, transaction.fromUserId))
          .limit(1);

        const toUser = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, transaction.toUserId))
          .limit(1);

        result.push({
          from_user_id: transaction.fromUserId,
          from_user: {
            id: fromUser[0].id,
            name: fromUser[0].name,
            email: fromUser[0].email,
            created_at: fromUser[0].createdAt.toISOString(),
          },
          to_user_id: transaction.toUserId,
          to_user: {
            id: toUser[0].id,
            name: toUser[0].name,
            email: toUser[0].email,
            created_at: toUser[0].createdAt.toISOString(),
          },
          amount: transaction.amount,
        });
      }

      res.status(200).json({
        transactions: result,
        total_transactions: result.length,
      });
    } catch (error) {
      console.error('Optimize balances error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
