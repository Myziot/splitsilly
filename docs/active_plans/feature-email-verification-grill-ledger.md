# Grill Ledger — Email Verification (signup flow)

**Started:** 2026-09-30 · **Status:** IN LOOP
**Resume protocol:** open this file, continue at the OPEN question, never re-ask ticked items.

**Feature ask:** Signup currently creates a fully-live account with an unproven email. Add email verification + the quick signup hardening patches (server-side password min, email format check, real email-error logging, XFF trust fix, DB-backed rate-limit/lockout — the last one already DECIDED: DB-backed, user-approved).

## Verified ground truth (codebase, 2026-09-30)
- register (routes/auth.ts): validates length caps only; NO password min server-side, NO email format check; session minted immediately (auto-login).
- No email_verified column, no verification tokens table, no verify route — verification NEVER existed here (password-reset tokens DO exist: services/passwordReset.ts + password_reset_tokens — reuse this pattern).
- Ghost rows (is_placeholder) invisible to login/register/reset (D10 rule) — verification must not change that.
- Email: Resend SDK (services/email.ts), logged to email_logs; history of domain-verification failures → email is a FLAKY dependency by experience.
- Rate limits: in-memory Maps (login 5/15min, register 3/hr, lockout 5 fails) — wiped on restart. DECIDED: move to DB.
- Honeypot `company` field on login/register; Cloudflare in front of the public domain.
- Invite/placeholder flow: accept-merge path (routes/invitations.ts) — an invitee may register then accept; verification must not deadlock this ritual.

## Locked decisions
- D1: **Soft gate (B).** Everything works unverified; persistent muted nag banner + "Resend link"; `email_verified` flag visible in admin panel. Rationale: email is a flaky dependency here (domain saga); anti-bot load carried by DB-backed rate limits + honeypot + Cloudflare. B→C escalation possible later in one line.

- D2: **New `email_verification_tokens` table** (fork of password_reset_tokens: hashed token, expires_at, single-use, resend invalidates prior). 48h expiry. Purge rides the existing housekeeping sweep.

- D3: **Grandfather existing accounts** — migration sets email_verified=true for all current users; only new signups start unverified. Ghost cleanup (audit H5/H6) is the proper channel for dead addresses, not a verification ambush.

- D5: **Invite-click counts as proof-of-email.** Signup carrying an invite code → email_verified=true, no verification email sent. Walk-in signups get the normal verification email + soft nag. (One-line branch in register handler.)

- D4: **Nag banner on ALL authed pages** (Groups, GroupDetail, JoinGroup-success) — one shared component in the authed shell, muted one-liner + [Resend link], RateFootnote-restraint styling, vanishes on verify. Pick-blind (no playground).

- D6: **Silent on send failure** — signup completes normally; failure recorded in email_logs (real error text, per quick-patch); banner's Resend button is the recovery path (mints fresh token even if prior send failed).

FOLDED (mechanical, no grill needed): resend throttle = reuse register limiter keyed per-user (3/hr); verify link host = FRONTEND_BASE_URL (same as invite links); /me + /auth/verify endpoints; email format check = pragmatic regex (local@domain.tld, no quoted-pairs); reminder/invite emails NOT suppressed for unverified (soft gate).

- D7: **Server-side password minimum = 8 chars**, no complexity rules (NIST-style). Applies at register + reset-password. Client minLength/placeholder updated 6→8.

**Status: SHIPPED (2026-10-01) — blueprint implemented, live E2E 17/17 PASS; see feature-email-verification.md for post-ship fixes.**
