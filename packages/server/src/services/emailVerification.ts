import * as crypto from 'crypto';
import { db } from '../db';
import { and, eq, isNull, lt } from 'drizzle-orm';
import * as schema from '../db/schema';

/**
 * Email verification tokens — feature-email-verification.md (D2).
 * Fork of the passwordReset.ts pattern: random token, SHA-256 stored, 48h TTL,
 * single active token per user (minting invalidates prior unused ones).
 * Unlike reset tokens, the raw token is NEVER persisted (no operator need).
 */

// Longer-lived than reset links: the user may sign up before they check email.
const VERIFY_TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours (D2)

const FRONTEND_BASE = (process.env.FRONTEND_BASE_URL || 'http://home-port.local:3002').replace(/\/$/, '');

export function buildVerifyLink(token: string): string {
  // Token is 64 hex chars; sanitize defensively before interpolating into a URL.
  const safe = token.replace(/[^a-fA-F0-9]/g, '');
  const enc = globalThis.encodeURIComponent;
  return `${FRONTEND_BASE}/verify?token=${enc(safe)}`;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a fresh verification token for a user, invalidating any prior unused
 * ones. Returns the RAW token (caller must not log it) + the full link.
 */
export async function mintVerifyToken(userId: string): Promise<{ token: string; link: string }> {
  await db
    .delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, userId));

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

  await db.insert(schema.emailVerificationTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return { token, link: buildVerifyLink(token) };
}

/**
 * Consume a verification token: must exist, be unexpired. Marks the TOKEN'S
 * OWNER verified (never the session user — prevents account-link hijacking).
 * Idempotent: if the owner is already verified, success without token lookup
 * is NOT assumed — an invalid/expired token still errors for unverified users,
 * but a valid token for an already-verified user returns ok (double-click safe).
 */
export async function consumeVerifyToken(
  token: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const INVALID = 'Link expired or already used';
  if (!token || typeof token !== 'string' || token.length > 64) {
    return { ok: false, error: INVALID };
  }

  const rows = await db
    .select()
    .from(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.tokenHash, hashToken(token)))
    .limit(1);

  if (rows.length === 0) return { ok: false, error: INVALID };
  const row = rows[0];

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(schema.emailVerificationTokens).where(eq(schema.emailVerificationTokens.id, row.id));
    return { ok: false, error: INVALID };
  }

  // Single-use: remove the token, then flip the flag. Order matters so a crash
  // between the two still leaves the token unusable.
  await db.delete(schema.emailVerificationTokens).where(eq(schema.emailVerificationTokens.id, row.id));
  await db
    .update(schema.users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(schema.users.id, row.userId));

  return { ok: true, userId: row.userId };
}

/** Purge expired verification tokens (housekeeping sweep). */
export async function purgeExpiredVerifyTokens(): Promise<number> {
  const dead = await db
    .delete(schema.emailVerificationTokens)
    .where(lt(schema.emailVerificationTokens.expiresAt, new Date()))
    .returning({ id: schema.emailVerificationTokens.id });
  return dead.length;
}
