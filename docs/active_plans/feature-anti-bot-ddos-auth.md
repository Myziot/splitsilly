# Feature Plan: Anti-Bot & DDoS Protection for Login / Register

**Project:** split_silly (cost-sharing app, port 3002)  
**Date:** 2026-07-10  
**Status:** READY TO IMPLEMENT  
**Design principle:** Keep it simple, dependency-free, app-level. Volumetric DDoS is handled upstream by Cloudflare (already in front of `splitsilly.818888817.xyz`). This plan covers *abuse* protection on the two public auth endpoints.

---

## Threats addressed
1. **Credential stuffing / brute force** on `/login` (many attempts, one or many IPs).
2. **Automated registration spam** (bot account creation).
3. **Oversized / malformed request bodies** (cheap DoS via memory).
4. **Dumb bots** that auto-fill every form field.

## What we will NOT do (and why)
- No CAPTCHA (adds friction + external dep; Cloudflare already provides bot mgmt at edge — out of scope here).
- No distributed/Redis-backed limiter (single-node app; in-memory is adequate; note reboot clears state).
- No IP-blocklists / fail2ban (overkill for this scale; rate-limit + lockout covers it).

---

## Design

### A. Rate limiting (in-memory, fixed-window) — NEW `src/middleware/ratelimit.ts`
- `getClientIp(req)`: returns `req.headers['cf-connecting-ip']` → first `x-forwarded-for` → `req.ip`. (Cloudflare tunnel sets CF-Connecting-IP, so limits key on the REAL client, not Cloudflare's IP. Critical — without this every visitor shares one IP and legit users get throttled.)
- Generic `FixedWindowLimiter` keyed by string:
  - store: `Map<string, number[]>` (timestamps of hits within window)
  - on hit: prune timestamps older than window, push now, return `{ allowed, remaining, retryAfter }`
- Two configured limiters:
  - **LOGIN**: 5 attempts / 15 min per IP. On breach → HTTP 429 `{ error: "Too many login attempts. Try again later." }`.
  - **REGISTER**: 3 attempts / 60 min per IP. On breach → HTTP 429 `{ error: "Too many registration attempts. Try again later." }`.
- **Account lockout** (targeted brute-force, IP-rotation resistant): `Map<string, { fails, lockedUntil }>` keyed by lowercase email.
  - Count FAILED logins for that email. After **5 fails**, lock for **15 min** (lockedUntil = now+15m).
  - Locked → 429 generic "Too many login attempts. Try again later." regardless of IP.
  - SUCCESS resets the counter for that email (and does NOT reset the IP counter — only success on the IP limiter resets that; implement IP counter success-reset too).
- **Memory hygiene**: prune both maps on each access (filter expired); plus a `setInterval` every 10 min to drop empty/expired keys so the Map can't grow unbounded.

### B. Honeypot — NEW `src/middleware/honeypot.ts`
- Hidden field named `company` (off-screen, not `type=hidden` so autofill bots grab it; real users never see/touch it).
- Server: if `req.body.company` is a non-empty string → treat as bot → respond `400 { error: "Invalid form submission." }` (cheap, no DB hit). Applied to BOTH login and register.

### C. Body size + basic validation — server.ts + auth.ts
- `express.json({ limit: '25kb' })` (was unlimited → default 100kb). 25kb is ample for our tiny payloads; rejects oversized bodies cheaply. (Multer uploads are separate and unaffected.)
- In `auth.ts` handlers, cap field lengths before DB work:
  - email ≤ 254 chars, password ≤ 200 chars, name ≤ 100 chars; reject otherwise with 400 (prevents pathological inserts).

### D. Client honeypot field — `Login.tsx` + `Register.tsx`
- Add a visually-hidden `<input name="company" tabIndex={-1} autoComplete="off" aria-hidden />` wrapped in a `<div>` with style `position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden`.
- Real users never interact; bots that fill all fields trip the server check.
- No JS logic needed; field is just submitted with the form (it's inside the `<form>`).

### E. Wiring — server.ts
```
app.use(express.json({ limit: '25kb' }));
...
app.post('/api/v1/auth/login',    honeypot, loginLimiter,    authHandler.login);
app.post('/api/v1/auth/register', honeypot, registerLimiter, authHandler.register);
```
Order matters: honeypot + limiter run BEFORE the handler (cheap rejection, no DB hit). Account-lockout check lives INSIDE authHandler.login (needs the email + must run after we know it's a failed attempt).

---

## Files to change / create
- CREATE `packages/server/src/middleware/ratelimit.ts`  (IP limiter + account lockout + getClientIp)
- CREATE `packages/server/src/middleware/honeypot.ts`    (hidden-field bot trap)
- PATCH  `packages/server/src/server.ts`                 (json limit; mount honeypot+limiters on auth routes)
- PATCH  `packages/server/src/routes/auth.ts`            (field-length caps; account-lockout on failed login; success reset)
- PATCH  `packages/client/src/pages/Login.tsx`           (honeypot hidden input)
- PATCH  `packages/client/src/pages/Register.tsx`        (honeypot hidden input)

## Verification (real, not asserted)
1. `npm run build` in client (clean) — confirms client compiles.
2. Restart server (`kill` old tsx pid, relaunch `npx tsx src/server.ts`).
3. `curl` login 6x from same IP with bad creds → 5× 401, then 1× 429. Confirm retryAfter / message.
4. `curl` register 4× from same IP → 3× 409 (email-exists on real path) OR 400/429; confirm 4th = 429. (Use a random email each time so it's not the lockout path — proves IP limiter.)
5. Honeypot: `curl -d '{"email":"x","password":"y","company":"bot"}'` → 400 "Invalid form submission."
6. Lockout: 5 failed logins for ONE real-ish email (nonexistent is fine — counts as fail) from rotating IPs (use `-H "CF-Connecting-IP: 1.1.1.1"` etc.) → 6th attempt 429 even on fresh IP.
7. Success path: valid login still returns 200 + sets cookie, and resets counters.
8. Log to `neonlin.conversation_logs` (PROJECT SPLIT_SILLY) with root cause/fixes/verification/outstanding.

## Outstanding / notes
- Limits reset on server restart (in-memory) — acceptable for this scale; if persistence wanted later, move to Redis/drizzle.
- Cloudflare remains the primary volumetric DDoS shield; this plan is the app-layer second line.
- Account-lockout map + IP map are per-process; single server only.
