# Feature Plan: Expense Detail View + Email Invites (Resend)

**Project:** split_silly (cost-sharing app, port 3002)
**Date:** 2026-07-09
**Status:** IMPLEMENTING

## Feature 1 — Expense detail expand + back button
- Add `selectedExpenseId` state to `GroupDetail.tsx`.
- Clicking an expense row in the Expenses tab replaces the list with a detail panel (no route change — stays inside tab, matches modal-free tab pattern).
- Detail panel shows: category icon+name, description, payer + amount (+ converted master amount), date, who added + created/updated timestamps, and per-person split breakdown (name, split_mode, value, computed share in master currency).
- "← Back to expenses" button returns to the list and hides Add/Delete chrome in detail mode.

## Feature 2 — Members invite via email (Resend scaffolding)
**Decision:** Keep current `invite_code`; just email the existing invite link as-is (NO rotation).
- `pnpm add resend` in `packages/server`.
- New `packages/server/src/services/email.ts`: `sendInviteEmail({ toName, toEmail, groupName, inviteLink, invitedBy })`. Reads `RESEND_API_KEY` (and optional `RESEND_FROM_EMAIL`) from env. If key missing → throws clear "Email service not configured" error (deferred activation, like OAuth scaffolding).
- New handler `groupsHandler.inviteMember` (POST `/api/v1/groups/:groupId/invite`), body `{ name, email }`:
  - auth-protected (all /api/v1 routes require session)
  - verify requester is a member of the group (403 otherwise)
  - validate name non-empty + email format
  - build link `${FRONTEND_BASE_URL}/join/${group.inviteCode}` (FRONTEND_BASE_URL default `http://myzi.gmk:3002`)
  - send email via Resend; return `{ ok: true, invite_code }`
  - 503 if Resend not configured (token deferred to tomorrow)
- Register route in `server.ts`.
- Add `InviteMemberRequestSchema` + contract entry in `shared/src/contract.ts` (docs parity).
- Client: Members tab gets an "Invite" button → Name + Email form → POST; shows success + sent confirmation.
- `.env`: append `RESEND_API_KEY=` (blank, set tomorrow) + `FRONTEND_BASE_URL=http://myzi.gmk:3002` + `RESEND_FROM_EMAIL=onboarding@resend.dev`.

## Caveat (logged)
Existing join flow is single-use: joining invalidates/rotates the code. Since we now email that code, a join will break future emailed links. Deferred to a later change if multi-use invites are wanted.

## CORRECTION (2026-07-10)
User clarified invites are a CONVENICE to share the group link, not single-use. Changed join flow: `routes/join.ts` no longer rotates/invalidates `invite_code` on join. The code is now a permanent, reusable group link. Removed unused `crypto` import from join.ts. Verified end-to-end: registered throwaway user, joined via POST /api/v1/join/:code (HTTP 200), invite_code stayed 6928D78E (unchanged). Test user cleaned up. Also updated design doc edge-case entry (single-use -> permanent shareable link).

## Verification
- `npx tsc --noEmit` clean on server + client.
- `npm run build` (client) succeeds.
- Restart server; `GET` list still 200; `POST /invite` with no token → 503 clear message; with token → 200.
- Browser: click expense → detail renders → back returns; Members Invite form opens/sends.
- Log progress to neonlin.conversation_logs (split_silly project).
