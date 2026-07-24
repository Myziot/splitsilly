import { Request, Response } from 'express';
import { db } from '../db';
import { users, passwordResetTokens } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../services/password';
import { createSession, buildCookieValue, buildClearCookieValue, isSecureRequest } from '../middleware/session';
import { isLocked, recordLoginFailure, clearLoginFailures, loginFailureStatus } from '../middleware/ratelimit';
import { consumeResetToken, mintResetToken, peekResetToken } from '../services/passwordReset';

// Field-length caps (defence against pathological inserts; reject cheaply).
const MAX_EMAIL = 254;
const MAX_PASSWORD = 200;
const MAX_NAME = 100;

export const authHandler = {
  login: async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Generic message returned for ALL failure cases (no user enumeration).
      const GENERIC = 'Invalid email or password';

      if (!email || !password) {
        return res.status(401).json({ error: GENERIC });
      }
      if (typeof email !== 'string' || typeof password !== 'string' ||
          email.length > MAX_EMAIL || password.length > MAX_PASSWORD) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      // Normalize so the per-account lockout + lookup agree on casing.
      const normalizedEmail = email.toLowerCase();

      // Per-account lockout (IP-rotation resistant brute-force defence).
      if (isLocked(normalizedEmail)) {
        return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
      }

      const userResult = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (userResult.length === 0) {
        // Log the distinct reason server-side only; never leak to client.
        console.warn('Login failed: no user for email', normalizedEmail);
        recordLoginFailure(normalizedEmail);

        const status = loginFailureStatus(normalizedEmail);
        return res.status(401).json({
          error: GENERIC,
          attemptsRemaining: status.attemptsRemaining,
          resetAvailable: status.resetAvailable,
        });
      }

      const user = userResult[0];
      const valid = await verifyPassword(password, user.passwordHash);

      if (!valid) {
        console.warn('Login failed: wrong password for user', user.id);
        recordLoginFailure(normalizedEmail);

        // The client surfaces the operator-reset path (a "notify admin" button)
        // after the threshold of wrong attempts. We do NOT auto-flag the
        // account here anymore — flagging happens only when the user actually
        // clicks "Notify administrator" (POST /api/v1/auth/notify-reset), so the
        // amber badge in the admin panel means a real request, not just a typo.
        const status = loginFailureStatus(normalizedEmail);
        return res.status(401).json({
          error: GENERIC,
          attemptsRemaining: status.attemptsRemaining,
          resetAvailable: status.resetAvailable,
        });
      }

      // Success — clear any prior failure history for this email.
      clearLoginFailures(normalizedEmail);

      // If the "reset requested" hint was set (e.g. after 3 wrong attempts),
      // clear it now — a successful login proves the user didn't need a reset.
      if (user.passwordResetRequested) {
        await db
          .update(users)
          .set({ passwordResetRequested: false, updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }

      const token = await createSession(user.id);
      res.setHeader('Set-Cookie', buildCookieValue(token, isSecureRequest(req)));

      res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          created_at: user.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  register: async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;

      if (!email || !password || !name ||
          typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' ||
          email.length > MAX_EMAIL || password.length > MAX_PASSWORD || name.length > MAX_NAME) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      // Normalize to lowercase so lookup/login/reset all agree on casing.
      const normalizedEmail = email.toLowerCase();

      // Check if user exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await hashPassword(password);

      const result = await db
        .insert(users)
        .values({ email: normalizedEmail, passwordHash, name })
        .returning();

      const user = result[0];
      const token = await createSession(user.id);
      res.setHeader('Set-Cookie', buildCookieValue(token, isSecureRequest(req)));

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          created_at: user.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  logout: async (req: Request, res: Response) => {
    try {
      res.setHeader('Set-Cookie', buildClearCookieValue(isSecureRequest(req)));
      res.status(204).send();
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  me: async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      res.status(200).json({ user: user.user });
    } catch (error) {
      console.error('Me error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  resetPassword: async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || typeof token !== 'string' || !newPassword || typeof newPassword !== 'string') {
        return res.status(400).json({ error: 'Invalid request' });
      }
      if (newPassword.length > MAX_PASSWORD) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      const result = await consumeResetToken(token, newPassword);
      if (!result.ok) {
        return res.status(400).json({ error: result.error || 'Reset failed' });
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // User-initiated "notify administrator" request (reached from the login page
  // after enough failed attempts). Flags the account so the operator sees it in
  // the admin panel. No email is sent (Resend is down) — the operator mints a
  // reset link by hand once they see the flag. Idempotent.
  notifyReset: async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string' || email.length > MAX_EMAIL) {
        return res.status(400).json({ error: 'Invalid request' });
      }
      const normalizedEmail = email.toLowerCase();

      const target = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (target.length === 0) {
        // Don't enumerate, but the caller is the account owner clicking a
        // button — treat a missing account as a no-op success.
        return res.status(200).json({ ok: true });
      }

      await db
        .update(users)
        .set({ passwordResetRequested: true, updatedAt: new Date() })
        .where(eq(users.id, target[0].id));

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Notify reset error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

/**
 * Operator back-office. Two auth paths (either is sufficient):
 *   1) a valid ADMIN session cookie (the captain is logged in), OR
 *   2) the ADMIN_API_KEY header (so the captain can curl it from anywhere
 *      without a browser session).
 * Both are checked in `requireAdmin` (middleware/routes).
 */
export const adminHandler = {
  // List users (id, email, name, isAdmin, resetRequested, createdAt, group count).
  listUsers: async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          isAdmin: users.isAdmin,
          passwordResetRequested: users.passwordResetRequested,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));

      res.status(200).json({
        users: rows.map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          isAdmin: r.isAdmin,
          passwordResetRequested: r.passwordResetRequested,
          created_at: r.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error('Admin list users error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Mint a reset link for a given user and set the "reset requested" flag.
  // Returns the FULL link for the operator to send out-of-band (Telegram/etc).
  createResetLink: async (req: Request, res: Response) => {
    try {
      const { email, requested } = req.body;
      if (!email || typeof email !== 'string' || email.length > MAX_EMAIL) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      // Normalize so a lookup for "De_fpyyz@..." still matches the stored
      // "de_fpyyz@..." row (emails are stored lowercased by register/backfill).
      const normalizedEmail = email.toLowerCase();

      const target = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (target.length === 0) {
        // Generic-ish: don't enumerate, but the operator is trusted. Return a
        // clear 404 so the admin panel can tell the captain the email is wrong.
        return res.status(404).json({ error: 'No user with that email' });
      }

      const { token, link } = await mintResetToken(target[0].id);

      // Flag the account as "reset requested" so the admin panel + login can
      // reflect that outreach has been initiated. Default true unless the
      // operator explicitly passed requested=false.
      const setRequested = requested === false ? false : true;
      if (setRequested) {
        await db
          .update(users)
          .set({ passwordResetRequested: true, updatedAt: new Date() })
          .where(eq(users.id, target[0].id));
      }

      res.status(200).json({
        ok: true,
        email: target[0].email,
        name: target[0].name,
        link,
        token,
      });
    } catch (error) {
      console.error('Admin create reset link error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
