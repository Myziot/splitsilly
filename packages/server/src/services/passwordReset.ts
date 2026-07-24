import * as crypto from 'crypto';
import { db } from '../db';
import { eq, and, lt, isNull, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { hashPassword } from './password';
import { clearLoginFailures } from '../middleware/ratelimit';

// Lifetime of a reset link. Short on purpose — the operator hands it to the
// user over Telegram same-day. The future email flow can reuse this verbatim.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Base URL for the reset link. Reuses the same FRONTEND_BASE_URL env that the
// invite links use so the link matches whatever origin the app is served from.
const FRONTEND_BASE = (process.env.FRONTEND_BASE_URL || 'http://home-port.local:3002').replace(/\/$/, '');

export function buildResetLink(token: string): string {
  return `${FRONTEND_BASE}/reset?token=${encodeURIComponent(token)}`;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a fresh reset token for a user. Invalidates any prior unused tokens for
 * that user (so only the latest link works — no stale-link confusion). Returns
 * the RAW token (caller must NOT log/store it) and the full reset link.
 */
export async function mintResetToken(userId: string): Promise<{ token: string; link: string }> {
  // Invalidate previously issued, unused tokens for this user.
  await db
    .delete(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.userId, userId),
        isNull(schema.passwordResetTokens.usedAt),
      ),
    );

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db.insert(schema.passwordResetTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return { token, link: buildResetLink(token) };
}

export interface ConsumeResult {
  ok: boolean;
  error?: string;
}

/**
 * Consume a reset token: verify it is present, unexpired, and unused, then set
 * the user's password to `newPassword`. On success the token is marked used,
 * the `password_reset_requested` flag is cleared, AND all of the user's active
 * sessions are revoked (so a stolen old session can't linger after a reset).
 *
 * Returns ok:false with an error for any failure (expired / used / not found).
 */
export async function consumeResetToken(rawToken: string, newPassword: string): Promise<ConsumeResult> {
  if (!rawToken || typeof rawToken !== 'string') {
    return { ok: false, error: 'Invalid or missing token' };
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }
  if (newPassword.length > 200) {
    return { ok: false, error: 'Password too long' };
  }

  const tokenHash = hashToken(rawToken);

  const rows = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (rows.length === 0) {
    return { ok: false, error: 'Invalid or expired reset link' };
  }

  const row = rows[0];

  // Expired?
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: 'This reset link has expired. Please request a new one.' };
  }
  // Already used?
  if (row.usedAt) {
    return { ok: false, error: 'This reset link has already been used' };
  }

  const newHash = await hashPassword(newPassword);

  // All-or-nothing: mark token used + update password + clear flag + revoke
  // sessions. Wrap in a transaction so a failure leaves nothing half-done.
  await db.transaction(async (tx) => {
    await tx
      .update(schema.passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.passwordResetTokens.id, row.id));

    await tx
      .update(schema.users)
      .set({ passwordHash: newHash, passwordResetRequested: false, updatedAt: new Date() })
      .where(eq(schema.users.id, row.userId));

    // Revoke every active session for the user (force re-login everywhere).
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId));
  });

  // Clear any per-account login lockout so the freshly-reset user isn't then
  // blocked at sign-in (lockout is in-memory; keyed by lowercased email).
  const owner = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, row.userId))
    .limit(1);
  if (owner.length > 0) clearLoginFailures(owner[0].email);

  return { ok: true };
}

/**
 * Look up a reset token by its hashed value WITHOUT consuming it. Used by the
 * reset page to show a generic validity state before the user submits. Returns
 * { valid } only (never the raw token).
 */
export async function peekResetToken(rawToken: string): Promise<{ valid: boolean }> {
  if (!rawToken || typeof rawToken !== 'string') return { valid: false };
  const tokenHash = hashToken(rawToken);
  const rows = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  if (rows.length === 0) return { valid: false };
  const row = rows[0];
  if (row.usedAt) return { valid: false };
  if (row.expiresAt.getTime() <= Date.now()) return { valid: false };
  return { valid: true };
}

/** Periodic hygiene: drop used or expired tokens so the table stays small. */
export async function purgeExpiredResetTokens(): Promise<void> {
  await db
    .delete(schema.passwordResetTokens)
    .where(
      sql`${schema.passwordResetTokens.usedAt} IS NOT NULL OR ${schema.passwordResetTokens.expiresAt} <= NOW()`,
    );
}
