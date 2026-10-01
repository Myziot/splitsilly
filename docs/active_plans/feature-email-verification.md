# Email Verification + Signup Hardening — Grilled Implementation Plan

**Generated:** 2026-09-30 · **Status:** SHIPPED — live E2E 17/17 PASS (2026-10-01)
**Ledger:** feature-email-verification-grill-ledger.md (D1–D7, closed)
**Target Objective:** New signups prove their mailbox via a one-click emailed link (soft gate — nothing is blocked), the auth endpoints gain server-side input validation, and rate-limit/lockout state survives restarts.

## Architectural Decisions

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | Enforcement | Soft gate: full access; muted nag banner + Resend link on all authed pages; `email_verified` flag in admin panel | Email is a flaky dependency (domain saga); anti-bot load is carried by rate limits + honeypot + Cloudflare. B→C escalation = one line later. |
| 2 | Token store | New `email_verification_tokens` table, forked from `password_reset_tokens` pattern (hashed token, 48h expiry, single-use, resend invalidates prior) | Near-verbatim copy of proven `services/passwordReset.ts`; purge rides the housekeeping sweep. |
| 3 | Migration | Grandfather: all existing users get `email_verified = true` | No ambush on working logins; dead-address cleanup is the ghost-account job. |
| 4 | Nag UI | Shared banner component in the authed shell (Groups, GroupDetail, JoinGroup-success); muted one-liner + [Resend link]; vanishes on verify | Pick-blind, RateFootnote restraint. |
| 5 | Invite path | Signup carrying an invite code → `email_verified = true`, no verification email | The invite email click IS delivery+click proof; no double-email on the friendliest flow. |
| 6 | Send failure | Silent: signup completes normally; real error text → `email_logs`; banner Resend is the recovery path | Banner is already the failure UI; no scary toast on first contact. |
| 7 | Password min | Server-side ≥ 8 chars at register + reset-password; client minLength/placeholder 6→8 | Today's 6-char rule is client-only (bypassable by curl). |

**Folded mechanics (no grill):** resend throttle = register limiter keyed per-user (3/hr); verify link host = `FRONTEND_BASE_URL` (same as invite links); pragmatic email regex `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`; unverified users still receive invites/reminders (soft gate).

## Quick patches bundled (from the signup-flow review)

- P1: email format check at register (400 `Invalid request` on mismatch) — `routes/auth.ts`.
- P2: password ≥8 at register + resetPassword — `routes/auth.ts`.
- P3: log the REAL Resend error in placeholder-add path — `routes/invitations.ts` (~262) currently swallows it into a generic "Send failed (placeholder add)"; capture `err.message` into `email_logs.error_message`.
- P4: XFF trust — set `app.set('trust proxy', ...)` OR only honor `x-forwarded-for` when `cf-connecting-ip`/known-proxy present; keep `cf-connecting-ip` precedence (already correct) — `server.ts` + `middleware/ratelimit.ts`.

## Implementation Phases

### Phase 1: DB — migration 0007 + schema
**Files:** `packages/server/src/db/migrations/0007_email_verification.sql` (new), `db/schema.ts`
- `users`: add `email_verified boolean NOT NULL DEFAULT false` + backfill `UPDATE users SET email_verified = true` (grandfather, D3).
- New table `email_verification_tokens (id uuid pk, user_id fk cascade, token_hash text unique, expires_at timestamptz, created_at)` + index on user_id — mirror `password_reset_tokens`.
- schema.ts: declare both + `.index()`/`.unique()` parity (house rule: declare indexes, see migration 0004 lesson).
- **Verification:** `pnpm db:migrate`, then `psql \d users` + `SELECT count(*) FILTER (WHERE NOT email_verified) FROM users` → 0.

### Phase 2: Server — token service + auth wiring
**Files:** `services/emailVerification.ts` (new, fork of passwordReset.ts), `services/email.ts` (add `sendVerificationEmail`), `routes/auth.ts`, `server.ts`, `services/housekeeping.ts`
- register: email regex (P1) + pw ≥8 (P2); after user insert → if invite code present in body, set verified (D5); else mint token + send email **fire-and-forget with logEmail success/fail** (D6); response gains `email_verified`.
- New routes: `POST /api/v1/auth/verify` `{token}` → consume → set verified (honeypot + loginIpLimiter); `POST /api/v1/auth/resend-verification` (authed, per-user register-limiter 3/hr) → invalidate old + mint + send.
- `/auth/me`: include `email_verified`. housekeeping: purge expired verification tokens beside reset tokens.
- **Verification:** curl register (bad email → 400; 7-char pw → 400; valid → 201 + email_logs row); consume token via SQL-minted row; resend throttle returns 429 on 4th.

### Phase 3: DB-backed rate limits (user-approved)
**Files:** migrations (same 0007 file OK), `middleware/ratelimit.ts`
- Tables `rate_hits (key text, bucket_ts timestamptz)` + `auth_locks (key text pk, fails int, locked_until timestamptz)`; limiter hit = INSERT + count-in-window SELECT (index on (key, bucket_ts)); lockout read/write via auth_locks; housekeeping purges old rows.
- Keep in-memory Maps as fast-path cache is OPTIONAL — simplest correct: go straight to DB (traffic is tiny; 2 extra queries per auth op is fine).
- **Verification:** fail 5 logins for a test email → `systemctl --user restart split_silly.service` → 6th attempt still 429 (was the bug).

### Phase 4: Client
**Files:** `store/auth.ts`, `components/VerifyEmailBanner.tsx` (new), `App.tsx` (authed shell), `pages/Register.tsx` (minLength 8 + copy), `pages/AdminPanel.tsx` (verified column)
- auth store keeps `emailVerified` from /me; banner = muted amber one-liner "✉ email not verified — [Resend link]" (SVG glyph, no emoji — house rule), calls resend, disabled + "sent ✓" for 60s after click; hidden on playground/about/login routes; vanishes when emailVerified flips.
- **Verification:** `cd packages/client && npx tsc --noEmit` clean; live browser: register throwaway → banner visible on Groups + GroupDetail → SQL-consume token → refetch → banner gone.

## Edge Cases Handled
- Email send fails at signup → signup still 201; error in email_logs; banner Resend recovers (D6).
- Verify link clicked by a logged-in DIFFERENT account → token maps to its owner; verify endpoint marks the TOKEN'S owner, not the session user (prevents account-link hijack); if session user ≠ token owner, still verify owner + generic response.
- Expired/double-clicked token → 400 "Link expired or already used" + banner offers Resend.
- Ghost rows untouched: `is_placeholder` users never get verification emails (they can't log in; D10 rule preserved — queries keep `WHERE NOT is_placeholder` where auth-facing).
- Resend storm → per-user 3/hr limiter.
- Restart mid-lockout → lock survives (Phase 3).

## Manual Verification Checklist
- [x] Walk-in signup: 201 + `email_verified:false` + token minted + email_logs row (send failed cleanly: Resend rejects `example.com` test addresses — proves the D6 silent-fail path in production shape).
- [x] Invite-link signup: NO verification email, response `email_verified:true`, admin panel shows verified.
- [x] curl register with `not-an-email` / 5-char pw → 400s.
- [x] Lockout survives service restart (429 with CORRECT password post-restart — the headline Phase 3 fix).
- [x] Verify token: consume 200 → flag flips → reuse 400 (single-use) → `/me` reports verified.
- [x] Resend keeps exactly one active token; 200 authed.
- [x] `npx tsc --noEmit` client clean; server clean (2 errors pre-existing in balancePlans/join.ts, verified via git stash); E2E script: scratch/e2e_email_verify2.sh.

**Post-ship fixes found by live E2E (not in the blueprint):**
1. `/auth/verify` moved to its OWN rate bucket (`verify`, 10/15min/IP) — it was
   mounted on `loginIpLimiter`, so a user who'd failed 5 logins couldn't click
   their emailed link. Blueprint said no limiter; a shared login budget was worse.
2. `recordLoginFailure`/`isLocked` race: check-then-increment now fully
   synchronous before any await (5 rapid failures used to land fails=3).
3. Ops note: DB-backed limiter keeps an in-process cache — hand-deleting
   `rate_hits` rows needs a service restart to take effect.

## Out of Scope
- Hard/monetary gating (D1 explicitly leaves B→C for later, separate decision).
- Email deliverability/dashboard (email_logs table already covers observability).
- Cleaning orphan/ghost accounts (audit H5/H6 — separate job).
- OAuth/passkeys/password-strength meters.
