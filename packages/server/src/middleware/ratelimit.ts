import { Request, Response, NextFunction } from 'express';

/**
 * App-level abuse protection for the public auth endpoints.
 *
 * Volumetric DDoS is handled upstream by Cloudflare (in front of the tunnel),
 * so this is the SECOND line of defence: brute-force / credential-stuffing /
 * registration-spam throttling. It is in-memory (single node) — limits reset
 * on server restart. That is acceptable for this app's scale.
 */

/** Return the REAL client IP, accounting for the Cloudflare tunnel. */
export function getClientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.length > 0) return cf;
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

interface WindowHit {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Fixed-window rate limiter keyed by an arbitrary string (IP, email, etc.).
 * Stores hit timestamps per key; prunes on access so the map stays bounded.
 */
class FixedWindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  hit(key: string): WindowHit {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const arr = (this.hits.get(key) || []).filter((t) => t > cutoff);
    arr.push(now);
    this.hits.set(key, arr);

    if (arr.length > this.max) {
      // Too many hits in the window — deny and tell them when it clears.
      const oldest = arr[0];
      const retryAfterSec = Math.ceil((oldest + this.windowMs - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSec };
    }
    return { allowed: true, remaining: this.max - arr.length, retryAfterSec: 0 };
  }

  /** Reset a key (e.g. on successful login, clear that IP's penalty). */
  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Periodic cleanup so empty/expired keys don't accumulate forever. */
  prune(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [k, arr] of this.hits) {
      const live = arr.filter((t) => t > cutoff);
      if (live.length === 0) this.hits.delete(k);
      else this.hits.set(k, live);
    }
  }
}

// --- Configured limiters -------------------------------------------------
export const loginLimiter = new FixedWindowLimiter(5, 15 * 60 * 1000); // 5 / 15 min per IP
export const registerLimiter = new FixedWindowLimiter(3, 60 * 60 * 1000); // 3 / 60 min per IP

const LIMIT_MSG =
  'Too many attempts from this address. Please try again later.';

/** Express middleware factory: throttle an endpoint by client IP. */
function ipLimiter(limiter: FixedWindowLimiter, label: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const r = limiter.hit(ip);
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

// --- Account lockout (IP-rotation resistant brute-force defence) ----------
interface LockState {
  fails: number;
  lockedUntil: number; // epoch ms; 0 = not locked
}
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes
const lockMap = new Map<string, LockState>();

// Wrong attempts (per account) before we surface the operator reset path to the
// user and flag the account in the admin panel. Kept in lockstep with the
// login handler's flagging logic and returned to the client as a live counter.
export const RESET_HINT_THRESHOLD = 3;

/**
 * Check whether an email is currently locked out. Returns the lock state so
 * the handler can decide. Does NOT increment — callers bump the counter on a
 * failed attempt via recordLoginFailure().
 */
export function getLockState(email: string): LockState {
  const key = email.toLowerCase();
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

export function isLocked(email: string): boolean {
  return getLockState(email).lockedUntil > Date.now();
}

/** Record a failed login for this email (advances toward lockout). */
export function recordLoginFailure(email: string): void {
  const key = email.toLowerCase();
  const s = getLockState(key);
  s.fails += 1;
  if (s.fails >= MAX_FAILS) {
    s.lockedUntil = Date.now() + LOCK_MS;
    console.warn(`Account locked (${key}) after ${s.fails} failures`);
  }
  lockMap.set(key, s);
}

/** Clear failure history for an email after a SUCCESSFUL login. */
export function clearLoginFailures(email: string): void {
  lockMap.delete(email.toLowerCase());
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
  const fails = getLockState(email).fails;
  const remaining = Math.max(0, RESET_HINT_THRESHOLD - fails);
  return { attemptsRemaining: remaining, resetAvailable: fails >= RESET_HINT_THRESHOLD };
}

// --- Background memory hygiene -------------------------------------------
setInterval(() => {
  loginLimiter.prune();
  registerLimiter.prune();
  const now = Date.now();
  for (const [k, s] of lockMap) {
    if (s.lockedUntil && s.lockedUntil <= now) lockMap.delete(k);
  }
}, 10 * 60 * 1000).unref();
