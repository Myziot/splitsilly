import { Request, Response } from 'express';
import { db } from '../db';
import { users, passwordResetTokens, groups } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../services/password';
import { createSession, buildCookieValue, buildClearCookieValue, isSecureRequest, getSessionToken, getSessionByToken } from '../middleware/session';
import { isLocked, recordLoginFailure, clearLoginFailures, loginFailureStatus } from '../middleware/ratelimit';
import { consumeResetToken, mintResetToken, peekResetToken, getActiveResetToken } from '../services/passwordReset';
import { sendPasswordResetEmail, sendVerificationEmail, isEmailConfigured } from '../services/email';
import { mintVerifyToken, consumeVerifyToken } from '../services/emailVerification';
import { logEmail } from '../services/emailLog';

// Field-length caps (defence against pathological inserts; reject cheaply).
const MAX_EMAIL = 254;
const MAX_PASSWORD = 200;
const MAX_NAME = 100;
// P2 (feature-email-verification): server-side minimum — the client's minLength
// is cosmetic; curl bypassed it. Applies at register + reset (existing hashes
// are untouched).
const MIN_PASSWORD = 8;
// P1: pragmatic email shape check (local@domain.tld). Deliberately NOT RFC-5322
// exhaustive — we reject junk, not exotic-but-real addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
      if (await isLocked(normalizedEmail)) {
        return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
      }

      const userResult = await db
        .select()
        .from(users)
        // "Real accounts win" (feature-placeholder-member D10): ghost rows are
        // invisible to login — a placeholder can never authenticate.
        .where(and(eq(users.email, normalizedEmail), eq(users.isPlaceholder, false)))
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
      const { email, password, name, inviteCode } = req.body;

      if (!email || !password || !name ||
          typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' ||
          email.length > MAX_EMAIL || password.length > MAX_PASSWORD || name.length > MAX_NAME) {
        return res.status(400).json({ error: 'Invalid request' });
      }
      // P1: server-side email shape check (was client-only).
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      // P2: server-side password minimum (was client-only minLength=6).
      if (password.length < MIN_PASSWORD) {
        return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
      }

      // Normalize to lowercase so lookup/login/reset all agree on casing.
      const normalizedEmail = email.toLowerCase();

      // Check if a REAL account exists (ghost rows do NOT block registration —
      // feature-placeholder-member D10: the friend registers normally and the
      // pending invitation then surfaces in their inbox).
      const existing = await db
        .select()
        .from(users)
        .where(and(eq(users.email, normalizedEmail), eq(users.isPlaceholder, false)))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await hashPassword(password);

      // D5: an invite-code signup means the user ALREADY clicked a link that
      // landed in this mailbox — that's delivery+click proof, so the account
      // starts verified and no verification email is sent. (The code is only
      // trusted as a boolean hint here; the actual join happens on the
      // /join/:code page with the session.)
      let arrivedViaInvite = false;
      if (typeof inviteCode === 'string' && inviteCode.length >= 4 && inviteCode.length <= 12) {
        const g = await db
          .select({ id: groups.id })
          .from(groups)
          .where(eq(groups.inviteCode, inviteCode.toUpperCase()))
          .limit(1);
        arrivedViaInvite = g.length > 0;
      }

      const result = await db
        .insert(users)
        .values({ email: normalizedEmail, passwordHash, name, emailVerified: arrivedViaInvite })
        .returning();

      const user = result[0];
      const token = await createSession(user.id);
      res.setHeader('Set-Cookie', buildCookieValue(token, isSecureRequest(req)));

      // D1/D6: walk-in signup → fire-and-forget verification email. A send
      // failure NEVER affects the signup response; the real error text lands
      // in email_logs and the client's nag banner offers a Resend.
      if (!arrivedViaInvite) {
        (async () => {
          try {
            if (!isEmailConfigured()) return;
            const { link } = await mintVerifyToken(user.id);
            const { id } = await sendVerificationEmail({ toName: name, toEmail: normalizedEmail, verifyLink: link });
            await logEmail({ type: 'verification', toEmail: normalizedEmail, subject: 'Confirm your email for Splitsilly', toUserId: user.id, resendId: id, status: 'sent' });
          } catch (err: any) {
            await logEmail({ type: 'verification', toEmail: normalizedEmail, subject: 'Confirm your email for Splitsilly', toUserId: user.id, status: 'failed', errorMessage: String(err?.message || err).slice(0, 500) });
          }
        })().catch(() => {});
      }

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          email_verified: user.emailVerified,
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

  // POST /api/v1/auth/verify {token} — consume a verification token (public,
  // no session needed; the link must work from a fresh browser). Marks the
  // TOKEN'S OWNER verified, never the session user (edge case: a logged-in
  // different account clicking someone's link can't hijack the flag).
  verify: async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      const result = await consumeVerifyToken(token);
      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Verify error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // POST /api/v1/auth/resend-verification — authed; mints a fresh token +
  // emails it. Throttled per USER (3/hr) by resendVerifyUserLimiter. If the
  // send fails the token still exists and the error goes to email_logs (D6);
  // the response is generic-ok so it can't probe mailbox validity.
  resendVerification: async (req: Request, res: Response) => {
    try {
      const sessionUser = (req as any).user;
      if (!sessionUser) return res.status(401).json({ error: 'Unauthorized' });

      const rows = await db
        .select({ emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.id, sessionUser.userId))
        .limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
      if (rows[0].emailVerified) return res.status(200).json({ ok: true, alreadyVerified: true });

      (async () => {
        try {
          if (!isEmailConfigured()) return;
          const { link } = await mintVerifyToken(sessionUser.userId);
          const { id } = await sendVerificationEmail({
            toName: sessionUser.user?.name || '',
            toEmail: sessionUser.user?.email || '',
            verifyLink: link,
          });
          await logEmail({ type: 'verification', toEmail: sessionUser.user?.email || '', subject: 'Confirm your email for Splitsilly', toUserId: sessionUser.userId, resendId: id, status: 'sent' });
        } catch (err: any) {
          await logEmail({ type: 'verification', toEmail: sessionUser.user?.email || '', subject: 'Confirm your email for Splitsilly', toUserId: sessionUser.userId, status: 'failed', errorMessage: String(err?.message || err).slice(0, 500) });
        }
      })().catch(() => {});

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Resend verification error:', error);
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
      // P2: same server-side minimum as register (blueprint D7).
      if (newPassword.length < MIN_PASSWORD) {
        return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
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

  // User-initiated "forgot password" request (reached from the login page after
  // enough failed attempts). Flags the account so the operator sees it in the
  // admin panel AND — when email is configured — mints a one-time reset link and
  // emails it to the account owner directly (self-service). The admin panel can
  // still view the same active link (raw token is retained). Idempotent; always
  // returns a generic ok:true so it can't be used to enumerate accounts.
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
        // Ghosts are invisible to forgot-password (feature-placeholder-member
        // D10): a reset link must never activate a placeholder account — that
        // would bypass the invitation Accept ritual. A ghost-only email is
        // treated like a missing account (generic ok, no enumeration).
        .where(and(eq(users.email, normalizedEmail), eq(users.isPlaceholder, false)))
        .limit(1);

      if (target.length === 0) {
        // Don't enumerate — treat a missing account as a no-op success.
        return res.status(200).json({ ok: true });
      }

      const user = target[0];

      // Flag the account so the admin panel + login reflect the outreach.
      await db
        .update(users)
        .set({ passwordResetRequested: true, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      // Best-effort: mint + email the reset link. Never surface send failures to
      // the caller (no enumeration, and an unverified domain is a non-fatal
      // operator state — the link is still visible/mintable in the admin panel).
      if (isEmailConfigured() && user.email) {
        try {
          const { link } = await mintResetToken(user.id, 'email');
          await sendPasswordResetEmail({
            toName: user.name,
            toEmail: user.email,
            resetLink: link,
          });
          await logEmail({
            type: 'password_reset',
            toEmail: user.email,
            subject: 'Reset your Splitsilly password',
            toUserId: user.id,
            status: 'sent',
          });
        } catch (sendErr: any) {
          console.info('Password reset email not sent (non-fatal):', sendErr?.message);
          await logEmail({
            type: 'password_reset',
            toEmail: user.email,
            subject: 'Reset your Splitsilly password',
            toUserId: user.id,
            status: 'failed',
            errorMessage: sendErr?.message || 'Unknown send error',
          });
        }
      }

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
          isPlaceholder: users.isPlaceholder,
          emailVerified: users.emailVerified,
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
          isPlaceholder: r.isPlaceholder,
          emailVerified: r.emailVerified,
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
  // If `sendEmail: true` is passed, ALSO emails the link to the user directly.
  createResetLink: async (req: Request, res: Response) => {
    try {
      const { email, requested, sendEmail } = req.body;
      if (!email || typeof email !== 'string' || email.length > MAX_EMAIL) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      // Normalize so a lookup for "De_fpyyz@..." still matches the stored
      // "de_fpyyz@..." row (emails are stored lowercased by register/backfill).
      const normalizedEmail = email.toLowerCase();

      const target = await db
        .select()
        .from(users)
        // Ghosts have no usable password to reset (D10) — 404 like a missing
        // account so the operator can't mail a link that activates a placeholder.
        .where(and(eq(users.email, normalizedEmail), eq(users.isPlaceholder, false)))
        .limit(1);

      if (target.length === 0) {
        // Generic-ish: don't enumerate, but the operator is trusted. Return a
        // clear 404 so the admin panel can tell the captain the email is wrong.
        return res.status(404).json({ error: 'No user with that email' });
      }

      const doSend = sendEmail === true;
      const { token, link } = await mintResetToken(target[0].id, doSend ? 'email' : 'admin');

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

      // Optionally email the link directly to the user (self-service delivery).
      let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
      let emailError: string | null = null;
      if (doSend) {
        if (!isEmailConfigured() || !target[0].email) {
          emailStatus = 'failed';
          emailError = 'Email service not configured or user has no email on file';
        } else {
          try {
            await sendPasswordResetEmail({
              toName: target[0].name,
              toEmail: target[0].email,
              resetLink: link,
            });
            await logEmail({
              type: 'password_reset',
              toEmail: target[0].email,
              subject: 'Reset your Splitsilly password',
              toUserId: target[0].id,
              status: 'sent',
            });
            emailStatus = 'sent';
          } catch (sendErr: any) {
            emailStatus = 'failed';
            emailError = sendErr?.message || 'Unknown send error';
            await logEmail({
              type: 'password_reset',
              toEmail: target[0].email,
              subject: 'Reset your Splitsilly password',
              toUserId: target[0].id,
              status: 'failed',
              errorMessage: emailError,
            });
          }
        }
      }

      res.status(200).json({
        ok: true,
        email: target[0].email,
        name: target[0].name,
        link,
        token,
        emailStatus,
        emailError,
      });
    } catch (error) {
      console.error('Admin create reset link error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // View the CURRENT active (unused, unexpired) reset link for a user WITHOUT
  // minting a new one — so the operator can see/copy the exact same link a user
  // received by email. Returns { active: false } when there is no live token.
  getResetLink: async (req: Request, res: Response) => {
    try {
      const email = (req.query.email as string) || '';
      if (!email || typeof email !== 'string' || email.length > MAX_EMAIL) {
        return res.status(400).json({ error: 'Invalid request' });
      }
      const normalizedEmail = email.toLowerCase();

      const target = await db
        .select()
        .from(users)
        // Ghosts never hold reset tokens (D10) — same rule as createResetLink.
        .where(and(eq(users.email, normalizedEmail), eq(users.isPlaceholder, false)))
        .limit(1);

      if (target.length === 0) {
        return res.status(404).json({ error: 'No user with that email' });
      }

      const active = await getActiveResetToken(target[0].id);
      if (!active) {
        return res.status(200).json({ ok: true, active: false });
      }

      res.status(200).json({
        ok: true,
        active: true,
        email: target[0].email,
        name: target[0].name,
        link: active.link,
        token: active.token,
        expiresAt: active.expiresAt,
        lastSentVia: active.lastSentVia,
        createdAt: active.createdAt,
      });
    } catch (error) {
      console.error('Admin get reset link error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
