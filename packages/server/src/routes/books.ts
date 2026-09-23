import { Request, Response } from 'express';
import { db } from '../db';
import { groups, groupMembers, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { getLockState, freezePlan, unfreezePlan, recalculatePlan } from '../services/books';
import { logGroupActivity } from './notifications';

function isAdmin(membership: { role: string } | undefined): boolean {
  return membership?.role === 'admin';
}

// Reject malformed group ids early (e.g. a stale tab at /groups/$TG) so we
// return a clean 400 instead of letting Postgres throw a uuid parse error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validId(groupId: unknown): groupId is string {
  return typeof groupId === 'string' && UUID_RE.test(groupId);
}

export const booksHandler = {
  // Any member: whether the group is book-locked + the frozen plan legs.
  getLockState: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;
      if (!validId(groupId)) return res.status(400).json({ error: 'Invalid group id' });
      const membership = await db
        .select({ role: groupMembers.role })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (membership.length === 0) return res.status(404).json({ error: 'Group not found' });
      const state = await getLockState(groupId);
      res.status(200).json(state);
    } catch (e) {
      console.error('Get lock state error:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Admin: freeze the suggested who-pays-whom list (lock book).
  lockPlan: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;
      if (!validId(groupId)) return res.status(400).json({ error: 'Invalid group id' });
      const membership = await db
        .select({ role: groupMembers.role })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (membership.length === 0) return res.status(404).json({ error: 'Group not found' });
      if (!isAdmin(membership[0])) return res.status(403).json({ error: 'Only an admin can lock the book' });
      const [gName, actor] = await Promise.all([
        db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)).limit(1),
        db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
      ]);
      await freezePlan(groupId);
      await logGroupActivity(groupId, userId, 'book_locked', {
        actorName: actor[0]?.name || 'An admin',
        groupName: gName[0]?.name || 'this group',
      });
      res.status(200).json(await getLockState(groupId));
    } catch (e) {
      console.error('Lock plan error:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Admin: unfreeze and resume live computation (unlock book).
  unlockPlan: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;
      if (!validId(groupId)) return res.status(400).json({ error: 'Invalid group id' });
      const membership = await db
        .select({ role: groupMembers.role })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (membership.length === 0) return res.status(404).json({ error: 'Group not found' });
      if (!isAdmin(membership[0])) return res.status(403).json({ error: 'Only an admin can unlock the book' });
      const [gName, actor] = await Promise.all([
        db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)).limit(1),
        db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
      ]);
      await unfreezePlan(groupId);
      await logGroupActivity(groupId, userId, 'book_unlocked', {
        actorName: actor[0]?.name || 'An admin',
        groupName: gName[0]?.name || 'this group',
      });
      res.status(200).json({ isBookLocked: false, plan: [] });
    } catch (e) {
      console.error('Unlock plan error:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Admin: recalculate the frozen plan from LIVE balances WITHOUT unlocking the
  // book. Keeps expenses locked; clears the divergence flag; resyncs "who owes
  // who" to reality after off-plan / over payments.
  recalculatePlan: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;
      if (!validId(groupId)) return res.status(400).json({ error: 'Invalid group id' });
      const membership = await db
        .select({ role: groupMembers.role })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (membership.length === 0) return res.status(404).json({ error: 'Group not found' });
      if (!isAdmin(membership[0])) return res.status(403).json({ error: 'Only an admin can recalculate the book' });
      // Guard: only meaningful when the book is actually locked.
      const g = await db.select({ isBookLocked: groups.isBookLocked }).from(groups).where(eq(groups.id, groupId)).limit(1);
      if (!g[0]?.isBookLocked) return res.status(400).json({ error: 'Book is not locked' });
      const [gName, actor] = await Promise.all([
        db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)).limit(1),
        db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
      ]);
      await recalculatePlan(groupId);
      await logGroupActivity(groupId, userId, 'book_recalculated', {
        actorName: actor[0]?.name || 'An admin',
        groupName: gName[0]?.name || 'this group',
      });
      res.status(200).json(await getLockState(groupId));
    } catch (e) {
      console.error('Recalculate plan error:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
