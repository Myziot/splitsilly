import { Request, Response, NextFunction } from 'express';
import { ensureAuth } from './session';

/**
 * Authorize the operator back-office. Two sufficient paths:
 *   1) ADMIN_API_KEY header matches process.env.ADMIN_API_KEY (curl-from-anywhere), OR
 *   2) a valid session whose user.isAdmin === true (captain logged into the web app).
 * If ADMIN_API_KEY is not configured, only the admin-session path is allowed.
 */
function adminKeyMatches(req: Request): boolean {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) return false;
  const provided = req.header('x-admin-key') || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!provided) return false;
  // Constant-time-ish compare (lengths are secret but this is defense-in-depth).
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Path 1: API key.
  if (adminKeyMatches(req)) {
    return next();
  }

  // Path 2: admin session cookie.
  const session = await ensureAuth(req);
  if (session && session.user && session.user.isAdmin) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}
