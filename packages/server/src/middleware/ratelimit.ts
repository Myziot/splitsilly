import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import * as schema from '../db/schema';
import { and, eq, gt, lt, sql, count } from 'drizzle-orm';

/**
 * App-level abuse protection for the public auth endpoints.
 *
 * Volumetric DDoS is handled upstream by Cloudflare (in front of the tunnel),
 * so this is the SECOND line of defence: brute-force / credential-stuffing /
 * registration-spam throttling.
 *
 * DB-BACKED (feature-email-verification Phase 3): hit counts live in
 * `rate_hits` and lockouts in `auth_locks`, so limits SURVIVE service restarts
 * (they were in-memory Maps — a `systemctl restart` used to wipe them).
 * The Maps remain as a fast-path cache with write-through.
 */

/** Return the REAL client IP, accounting for the Cloudflare tunnel.
 *  P4 (signup-flow review): XFF is only honored when the request arrived
 *  through a proxy Express TRUSTS (app.set('trust proxy', loopback+docker in
 *  server.ts — the cloudflared tunnel connects from loopback). A DIRECT
 *  connection to :3002 can no longer spoof x-forwarded-for to dodge the IP
 *  limits: req.ip is the real socket peer there. cf-connecting-ip (set by
 *  Cloudflare itself) keeps precedence. */
export function getClientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.length > 0) return cf;
  return req.ip || 'unknown';
}

interface WindowHit {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * DB-backed fixed-window rate limiter. One row per hit in `rate_hits`;
 * allowed = (hits in window <= max). The in-memory Map is a fast-path cache:
 * over-limit decisions come from the cache without a read; under-limit
 * decisions are confirmed against the DB (the restart-surviving truth).
 */
class DbFixedWindowLimiter {
  private cache = new Map<string, number[]>();
  constructor(
    private readonly bucket: string,
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  async hit(key: string): Promise<WindowHit> {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    // Write-through to the cache + DB.
    const arr = (this.cache.get(key) || []).filter((t) => t > cutoff);
    arr.push(now);
    this.cache.set(key, arr);
    db.insert(schema.rateHits)
      .values({ bucket: this.bucket, key, hitAt: new Date() })
      .catch(() => {});

    // Fast path: cache already proves we're over the limit → deny, no read.
    if (arr.length > this.max) {
      const oldest = arr[0];
      return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((oldest + this.windowMs - now) / 1000) };
    }

    // Authoritative count (survives restarts).
    try {
      const [row] = await db
        .select({ n: count() })
        .from(schema.rateHits)
        .where(
          and(
            eq(schema.rateHits.bucket, this.bucket),
            eq(schema.rateHits.key, key),
            gt(schema.rateHits.hitAt, new Date(cutoff)),
          ),
        );
      const n = row?.n ?? arr.length;
      if (n > this.max) {
        return { allowed: false, remaining: 0, retryAfterSec: Math.ceil(this.windowMs / 1000) };
      }
      return { allowed: true, remaining: this.max - n, retryAfterSec: 0 };
    } catch {
      // DB read failed → fall back to the cache.
      if (arr.length > this.max) return { allowed: false, remaining: 0, retryAfterSec: 60 };
      return { allowed: true, remaining: this.max - arr.length, retryAfterSec: 0 };
    }
  }

  /** Periodic cleanup so rate_hits doesn't grow forever. */
  prune(): void {
    const cutoff = new Date(Date.now() - this.windowMs);
    db.delete(schema.rateHits).where(lt(schema.rateHits.hitAt, cutoff)).catch(() => {});
    const cutoffMs = cutoff.getTime();
    for (const [k, arr] of this.cache) {
      const live = arr.filter((t) => t > cutoffMs);
      if (live.length === 0) this.cache.delete(k);
      else this.cache.set(k, live);
    }
  }
}

// --- Configured limiters -------------------------------------------------
export const loginLimiter = new DbFixedWindowLimiter('login', 5, 15 * 60 * 1000); // 5 / 15 min per IP
export const registerLimiter = new DbFixedWindowLimiter('register', 3, 60 * 60 * 1000); // 3 / 60 min per IP
export const resendVerifyLimiter = new DbFixedWindowLimiter('resend-verify', 3, 60 * 60 * 1000); // 3/hr per user
// Verify-link clicks get their OWN bucket (NOT the login budget): a user who
// just failed 5 logins must still be able to click their emailed link.
// The 64-hex token is the real defence; this is brute-force hygiene only.
export const verifyLimiter = new DbFixedWindowLimiter('verify', 10, 15 * 60 * 1000); // 10 / 15 min per IP

const LIMIT_MSG =
  'Too many attempts from this address. Please try again later.';

/** Express middleware factory: throttle an endpoint by client IP. */
function ipLimiter(limiter: DbFixedWindowLimiter, label: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const r = await limiter.hit(ip);
    if (!r.allowed) {
      res.set('Retry-After', String(r.retryAfterSec));
      console.warn(`Rate limited (${label}) for IP ${ip}`);
      return res.status(429).json({ error: LIMIT_MSG });
    }
    // Expose remaining budget for debugging/observability.
    res.set('X-RateLimit-Remaining', String(r.remaining));
    next();
  };
}

export const loginIpLimiter = ipLimiter(loginLimiter, 'login');
export const registerIpLimiter = ipLimiter(registerLimiter, 'register');
export const verifyIpLimiter = ipLimiter(verifyLimiter, 'verify');

/** Resend-verification throttle keyed by USER id (not IP) — blueprint FOLDED. */
export function resendVerifyUserLimiter() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const uid = (req as any).user?.userId || 'anon';
    const r = await resendVerifyLimiter.hit(uid);
    if (!r.allowed) {
      res.set('Retry-After', String(r.retryAfterSec));
      return res.status(429).json({ error: 'Too many verification emails. Try again later.' });
    }
    next();
  };
}

// --- Account lockout (IP-rotation resistant brute-force defence) ----------
interface LockState {
  fails: number;
  lockedUntil: number; // epoch ms; 0 = not locked
}
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes
const lockMap = new Map<string, LockState>();
let locksLoaded: Promise<void> | null = null;

/** Rehydrate the lock Map from auth_locks once (survives restarts). Merges
 *  without clobbering any entry a concurrent failure already bumped. */
function ensureLocksLoaded(): Promise<void> {
  if (!locksLoaded) {
    locksLoaded = db
      .select()
      .from(schema.authLocks)
      .where(gt(schema.authLocks.lockedUntil, new Date()))
      .then((rows) => {
        for (const r of rows) {
          if (!lockMap.has(r.key)) {
            lockMap.set(r.key, { fails: r.fails, lockedUntil: r.lockedUntil!.getTime() });
          }
        }
      })
      .catch(() => {});
  }
  return locksLoaded;
}

// Wrong attempts (per account) before we surface the operator reset path to the
// user and flag the account in the admin panel. Kept in lockstep with the
// login handler's flagging logic and returned to the client as a live counter.
export const RESET_HINT_THRESHOLD = 3;

function localState(key: string): LockState {
  const now = Date.now();
  const s = lockMap.get(key) || { fails: 0, lockedUntil: 0 };
  if (s.lockedUntil && s.lockedUntil <= now) {
    // Lock expired — reset.
    s.fails = 0;
    s.lockedUntil = 0;
    lockMap.set(key, s);
  }
  return s;
}

/** Check whether an email is currently locked out. The local fast path is
 *  SYNC (no await before the check) so back-to-back requests can't slip past
 *  a lock that's already in memory; the DB rehydration only gates the cold
 *  first look. */
export async function isLocked(email: string): Promise<boolean> {
  const key = email.toLowerCase();
  if (localState(key).lockedUntil > Date.now()) return true; // fast path
  await ensureLocksLoaded();
  return localState(key).lockedUntil > Date.now();
}

/** Record a failed login for this email (advances toward lockout). The
 *  increment is SYNCHRONOUS (before any await) so concurrent failures can't
 *  lose updates; only persistence is async. */
export async function recordLoginFailure(email: string): Promise<void> {
  const key = email.toLowerCase();
  const s = localState(key); // sync — no await before mutation
  s.fails += 1;
  if (s.fails >= MAX_FAILS) {
    s.lockedUntil = Date.now() + LOCK_MS;
    console.warn(`Account locked (${key}) after ${s.fails} failures`);
  }
  lockMap.set(key, s);
  await ensureLocksLoaded();
  const lockedUntil = s.lockedUntil ? new Date(s.lockedUntil) : null;
  await db
    .insert(schema.authLocks)
    .values({ key, fails: s.fails, lockedUntil })
    .onConflictDoUpdate({ target: schema.authLocks.key, set: { fails: s.fails, lockedUntil } })
    .catch(() => {});
}

/** Clear failure history for an email after a SUCCESSFUL login. */
export function clearLoginFailures(email: string): void {
  const key = email.toLowerCase();
  lockMap.delete(key);
  db.delete(schema.authLocks).where(eq(schema.authLocks.key, key)).catch(() => {});
}

/**
 * Snapshot of an account's login-failure state for the client, so it can show
 * a live "attempts remaining before reset is offered" counter.
 *   attemptsRemaining — how many more wrong tries before the reset hint shows
 *   resetAvailable    — true once the threshold is reached
 */
export function loginFailureStatus(email: string): {
  attemptsRemaining: number;
  resetAvailable: boolean;
} {
  const fails = localState(email.toLowerCase()).fails;
  const remaining = Math.max(0, RESET_HINT_THRESHOLD - fails);
  return { attemptsRemaining: remaining, resetAvailable: fails >= RESET_HINT_THRESHOLD };
}

// --- Background hygiene (DB rows + cache) ---------------------------------
setInterval(() => {
  loginLimiter.prune();
  registerLimiter.prune();
  resendVerifyLimiter.prune();
  const now = Date.now();
  for (const [k, s] of lockMap) {
    if (s.lockedUntil && s.lockedUntil <= now) lockMap.delete(k);
  }
  db.delete(schema.authLocks)
    .where(sql`${schema.authLocks.lockedUntil} IS NOT NULL AND ${schema.authLocks.lockedUntil} < now()`)
    .catch(() => {});
}, 10 * 60 * 1000).unref();
