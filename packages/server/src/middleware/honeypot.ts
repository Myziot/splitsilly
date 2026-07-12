import { Request, Response, NextFunction } from 'express';

/**
 * Honeypot trap for dumb bots.
 *
 * The client renders a visually-hidden field named `company`. Real humans
 * never see or fill it; naive autofill bots populate every field they find.
 * If `company` arrives non-empty, we treat the request as automated and drop
 * it cheaply (no DB hit). The field is NOT type=hidden so autofillers grab it.
 */
export function honeypot(req: Request, res: Response, next: NextFunction) {
  const trap = (req.body && req.body.company) as unknown;
  if (typeof trap === 'string' && trap.trim().length > 0) {
    console.warn('Honeypot tripped (company field filled):', trap);
    return res.status(400).json({ error: 'Invalid form submission.' });
  }
  next();
}
