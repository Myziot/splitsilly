import { db } from '../db';
import { sessions, notifications } from '../db/schema';
import { eq, lt, and, sql } from 'drizzle-orm';

/**
 * Periodic table hygiene (audit 2026-09-23): expired sessions and long-read
 * notifications were never purged, so the tables only ever grew.
 * - Sessions: expired rows are dead (auth re-checks expires_at), safe to delete.
 * - Notifications: only READ ones older than 30 days are deleted — unread rows
 *   are never auto-deleted or auto-marked (that's a user-visible product call).
 */
export async function purgeStaleRows(): Promise<{ sessions: number; notifications: number }> {
  const deadSessions = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const deadNotifs = await db
    .delete(notifications)
    .where(and(eq(notifications.isRead, true), lt(notifications.createdAt, cutoff)))
    .returning({ id: notifications.id });

  // Expired email-verification tokens (feature-email-verification D2) —
  // ride the same sweep as reset tokens.
  const { purgeExpiredVerifyTokens } = await import('./emailVerification');
  const deadVerify = await purgeExpiredVerifyTokens().catch(() => 0);

  return { sessions: deadSessions.length, notifications: deadNotifs.length + deadVerify };
}
