import * as crypto from 'crypto';
import { db } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../db/schema';

const COOKIE_NAME = 'cost_sharing_session';
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

  await db
    .insert(schema.sessions)
    .values({ userId, token: hashToken(token), expiresAt });

  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await db
    .delete(schema.sessions)
    .where(eq(schema.sessions.token, hashToken(token)));
}

export async function getSessionByToken(token: string): Promise<{
  userId: string;
  user: {
    id: string;
    email: string;
    name: string;
    created_at: string;
    isAdmin: boolean;
    is_admin: boolean;
    email_verified: boolean;
  };
} | null> {
  const result = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      isAdmin: schema.users.isAdmin,
      emailVerified: schema.users.emailVerified,
      createdAt: schema.users.createdAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(
      eq(schema.sessions.token, hashToken(token)),
      sql`${schema.sessions.expiresAt} > NOW()`
    ))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const row = result[0];

  return {
    userId: row.userId,
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      isAdmin: row.isAdmin,
      is_admin: row.isAdmin,
      email_verified: row.emailVerified,
      created_at: row.createdAt.toISOString(),
    },
  };
}

export async function refreshSession(token: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);
  await db
    .update(schema.sessions)
    .set({ expiresAt })
    .where(and(
      eq(schema.sessions.token, hashToken(token)),
      sql`${schema.sessions.expiresAt} > NOW()`
    ));
}

export function getSessionToken(req: import('express').Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith(`${COOKIE_NAME}=`));
  if (!sessionCookie) return null;

  const rawValue = sessionCookie.split('=', 2)[1];
  if (!rawValue) return null;

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export function buildCookieValue(token: string, secure: boolean): string {
  const secureFlag = secure ? 'Secure; ' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_EXPIRY_MS / 1000}; ${secureFlag}`;
}

export function buildClearCookieValue(secure: boolean): string {
  const secureFlag = secure ? 'Secure; ' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; ${secureFlag}`;
}

/**
 * Whether the original request was served over HTTPS. Behind Cloudflare Tunnel
 * TLS terminates at the edge, so we trust the forwarded-proto / cf-visitor
 * headers rather than req.secure (which would report plain HTTP on localhost).
 * The session cookie is marked Secure whenever this is true so browsers will
 * store & replay it on the HTTPS public domain (they reject non-Secure
 * cookies on encrypted pages).
 */
export function isSecureRequest(req: import('express').Request): boolean {
  const proto = (req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (proto === 'https') return true;
  const cf = req.get('cf-visitor');
  if (cf && cf.includes('https')) return true;
  return !!req.secure;
}

export async function ensureAuth(req: import('express').Request): Promise<{
  userId: string;
  user: { id: string; email: string; name: string; created_at: string; isAdmin: boolean; is_admin: boolean };
} | null> {
  const token = getSessionToken(req);
  if (!token) return null;

  const session = await getSessionByToken(token);
  if (!session) return null;

  // Sliding expiration
  await refreshSession(token);

  return session;
}
