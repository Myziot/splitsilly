import { Request, Response } from 'express';
import { db } from '../db';
import { notifications, groupMembers, groups, users, groupActivity } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * Insert one notification per group member EXCEPT `exceptUserId`.
 * Shared by all activity triggers (join, new expense, settlement) so the
 * "notify everyone else" logic lives in exactly one place.
 */
export async function notifyGroupMembers(
  groupId: string,
  exceptUserId: string,
  type: string,
  payload: Record<string, any>,
) {
  const members = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));

  const rows = members
    .filter((m) => m.userId !== exceptUserId)
    .map((m) => ({
      userId: m.userId,
      groupId,
      type,
      payload,
    }));

  if (rows.length > 0) {
    await db.insert(notifications).values(rows);
  }
}

/**
 * Append one row to the group-wide activity log. Unlike `notifyGroupMembers`
 * (which inserts per recipient), this is a SINGLE transparent row every member
 * can read. `actorId` may be null (e.g. system actions). Fire-and-forget-ish:
 * we swallow errors so logging never breaks the primary operation.
 */
export async function logGroupActivity(
  groupId: string,
  actorId: string | null,
  action: string,
  details: Record<string, any>,
) {
  try {
    await db.insert(groupActivity).values({ groupId, actorId, action, details });
  } catch (err) {
    console.error('logGroupActivity error:', err);
  }
}

export const notificationsHandler = {
  // List the current user's notifications (newest first).
  getNotifications: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const rows = await db
        .select({
          id: notifications.id,
          type: notifications.type,
          payload: notifications.payload,
          isRead: notifications.isRead,
          createdAt: notifications.createdAt,
          groupId: notifications.groupId,
        })
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(100);

      res.status(200).json(
        rows.map((r) => ({
          id: r.id,
          type: r.type,
          payload: r.payload,
          is_read: r.isRead,
          group_id: r.groupId,
          created_at: r.createdAt.toISOString(),
        })),
      );
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Unread count for the badge (cheap).
  getUnreadCount: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
      res.status(200).json({ count: result[0]?.count ?? 0 });
    } catch (error) {
      console.error('Get unread count error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Mark a single notification read (badge drops by exactly 1).
  markRead: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { id } = req.params;
      const result = await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
        .returning({ id: notifications.id });
      if (result.length === 0) {
        return res.status(404).json({ error: 'Notification not found' });
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Mark read error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Group-wide activity log (all members can read). Newest first.
  getActivity: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;

      // Must be a current member to read the log.
      const membership = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (membership.length === 0) {
        return res.status(403).json({ error: 'Not a member of this group' });
      }

      const rows = await db
        .select({
          id: groupActivity.id,
          actorId: groupActivity.actorId,
          action: groupActivity.action,
          details: groupActivity.details,
          createdAt: groupActivity.createdAt,
        })
        .from(groupActivity)
        .where(eq(groupActivity.groupId, groupId))
        .orderBy(desc(groupActivity.createdAt));

      res.status(200).json(
        rows.map((r) => ({
          id: r.id,
          actor_id: r.actorId,
          action: r.action,
          details: r.details,
          created_at: r.createdAt.toISOString(),
        })),
      );
    } catch (error) {
      console.error('Get activity error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
