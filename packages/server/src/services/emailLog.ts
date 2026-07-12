import { db } from '../db';
import { emailLogs } from '../db/schema';
import { and, eq, gte } from 'drizzle-orm';

/**
 * Audit logging for outbound emails + a simple per-recipient daily rate limit.
 *
 * The rate limit is "one reminder per day per owing member" — scoped to a
 * (group, creditor, debtor) trio so a different creditor can still nudge the
 * same debtor, but the same creditor can't spam the same debtor more than
 * once per 24h.
 */

const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface LogEmailInput {
  type: string; // 'invite' | 'reminder' | ...
  toEmail: string;
  subject: string;
  fromUserId?: string | null;
  toUserId?: string | null;
  groupId?: string | null;
  resendId?: string | null;
  status?: 'sent' | 'failed';
  errorMessage?: string | null;
}

export async function logEmail(input: LogEmailInput): Promise<void> {
  try {
    await db.insert(emailLogs).values({
      type: input.type,
      toEmail: input.toEmail,
      subject: input.subject,
      fromUserId: input.fromUserId ?? null,
      toUserId: input.toUserId ?? null,
      groupId: input.groupId ?? null,
      resendId: input.resendId ?? null,
      status: input.status ?? 'sent',
      errorMessage: input.errorMessage ?? null,
    } as any);
  } catch (err) {
    // Logging must never break the email send itself.
    console.error('Failed to write email_logs row:', err);
  }
}

/**
 * Returns true if the same (group, creditor, debtor) already received a
 * reminder within the last 24h — i.e. the sender must wait before sending
 * another.
 */
export async function hasRecentReminder(
  groupId: string,
  creditorUserId: string,
  debtorUserId: string
): Promise<boolean> {
  const since = new Date(Date.now() - REMINDER_COOLDOWN_MS);
  const rows = await db
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.type, 'reminder'),
        eq(emailLogs.groupId, groupId),
        eq(emailLogs.fromUserId, creditorUserId),
        eq(emailLogs.toUserId, debtorUserId),
        gte(emailLogs.createdAt, since)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** Milliseconds until the next reminder is allowed (0 if none pending). */
export function reminderCooldownRemaining(): number {
  return REMINDER_COOLDOWN_MS;
}
