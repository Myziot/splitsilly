import { Request, Response } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../services/password';
import { createSession, buildCookieValue, buildClearCookieValue } from '../middleware/session';
import { isLocked, recordLoginFailure, clearLoginFailures } from '../middleware/ratelimit';

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

      // Per-account lockout (IP-rotation resistant brute-force defence).
      if (isLocked(email)) {
        return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
      }

      const userResult = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (userResult.length === 0) {
        // Log the distinct reason server-side only; never leak to client.
        console.warn('Login failed: no user for email', email);
        recordLoginFailure(email);
        return res.status(401).json({ error: GENERIC });
      }

      const user = userResult[0];
      const valid = await verifyPassword(password, user.passwordHash);

      if (!valid) {
        console.warn('Login failed: wrong password for user', user.id);
        recordLoginFailure(email);
        return res.status(401).json({ error: GENERIC });
      }

      // Success — clear any prior failure history for this email.
      clearLoginFailures(email);

      const token = await createSession(user.id);
      res.setHeader('Set-Cookie', buildCookieValue(token));

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

      // Check if user exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await hashPassword(password);

      const result = await db
        .insert(users)
        .values({ email, passwordHash, name })
        .returning();

      const user = result[0];
      const token = await createSession(user.id);
      res.setHeader('Set-Cookie', buildCookieValue(token));

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
      res.setHeader('Set-Cookie', buildClearCookieValue());
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
};
