# Placeholder Member ("add a person before they join") — Grilled Implementation Plan

**Generated:** 2026-09-29 · **Status:** READY FOR IMPLEMENTATION
**Ledger:** `docs/active_plans/feature-placeholder-member-grill-ledger.md` (all 10 decisions signed off)
**Target Objective:** An admin can add a named person (by email) to a group so they count in all calculations immediately; the person sees a pending invitation in-app (and by email), and Accept merges the placeholder into their real account with full history.

## Architectural Decisions

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | Data model | Shadow `users` row + `is_placeholder` flag + normal `group_members` row | All FKs/splits/balances untouched; engine never learns what a placeholder is |
| 2 | Claim/merge | Detect at register/login + invite-link arrival; merge runs ONLY on explicit Accept | Splitwise-style; nothing lands on a real account until accepted |
| 3 | Inbox source of truth | The placeholder row IS the invitation; partial unique `users.email WHERE NOT is_placeholder` | One entity, one merge path; email = messenger only |
| 4 | Accept proof | Email match + disclosure card (group, who added, balance you'd inherit); token check can bolt on later | Pragmatic threat model; honest by disclosure |
| 5 | Math participation | Full: split, payer, settlement party. Inactive = no login/edit; admins act as proxy | Zero special-casing in balances/books |
| 6 | Permission | Admins only (kick-gate). UI: toggle in existing InviteFormModal | Feature story is admin-driven |
| 7 | Backfill | Reuse join participation picker (`getJoinableEqualExpenses`/`applyEqualParticipation`) with admin as proxy | Same machinery already shipped |
| 8 | Signals | Full broadcast: group_activity row + invite email + bell to EVERY member | Transparency |
| 9 | Discard | Reuse kickMember cascade + 400 dedup (same email twice in group); typo fix = discard + re-add | Battle-tested tx cascade |
| 10 | Auth lookups | "Real accounts win": login/register/notify-reset filter `NOT is_placeholder`; register beside a ghost SUCCEEDS (no 409) | Ghosts don't act; deterministic lookups |
| 10b | Email mismatch | Invite link claimable by any logged-in account with disclosure card; Accept re-keys onto claimer | Covers typo'd/changed emails without token machinery |

## Data model specifics

- `users.is_placeholder boolean NOT NULL DEFAULT false`; placeholder rows get a random bcrypt hash (never usable) and the invited email.
- Drop full UNIQUE on `users.email`; add partial unique index on real accounts only. Ghosts may share an email across groups (one ghost per email via find-or-create; discard deletes the ghost row only when it has no memberships left).
- Inbox query = `group_members ⋈ users WHERE users.email = <my email> AND is_placeholder`.

## Implementation Phases

### Phase 1: Schema + auth hardening
**Files:** `packages/server/src/db/schema.ts`, `packages/server/src/db/migrations/0005_placeholder_members.sql`, `packages/server/src/routes/auth.ts`, `packages/server/src/routes/auth.ts` (adminHandler.listUsers), `packages/server/src/routes/groups.ts` (getGroupMembers select)
- Migration: add column; `DROP CONSTRAINT users_email_key`; `CREATE UNIQUE INDEX users_email_real_unique ON users(email) WHERE NOT is_placeholder`.
- login / register collision check / notifyReset: add `NOT isPlaceholder` to every email lookup (`.limit(1)` ambiguity fix). Register with a placeholder-only email → succeeds.
- Admin panel user list + roster query expose `is_placeholder`.
**Verify:** register ghost email → 201; login ghost email → 401 generic; two ghost rows same email insert OK; two REAL rows same email → unique violation.

### Phase 2: Add-placeholder endpoint + email + broadcast
**Files:** `packages/server/src/routes/groups.ts` (new `addPlaceholderMember`), `packages/server/src/server.ts` (route `POST /api/v1/groups/:groupId/placeholder-members`), `packages/server/src/routes/notifications.ts` (log helper), `packages/server/src/services/email.ts` (reuse `sendInviteEmail`)
- Admin gate (copy kickMember's membership+role check). Validate name/email (same regex as inviteMember).
- Dedup: 400 if a placeholder with that email already holds a membership in this group; 400 if a REAL user with that email is already a member.
- Tx: find-or-create ghost user by email → insert group_member (role member). Then: send invite email (non-fatal if Resend fails — in-app invite is the source of truth), bell `notifications` row for EVERY member (type `member_invited_pending`), `group_activity` action `member_added_pending`.
**Verify:** curl as throwaway admin → 201 + email_logs row + N notification rows + activity row; non-admin → 403; double-add → 400.

### Phase 3: Participation picker as proxy
**Files:** `packages/server/src/routes/join.ts`, `packages/client/src/pages/JoinGroup.tsx` (extract `components/EqualParticipationPicker.tsx` — one shared component), `packages/client/src/components/MembersTab.tsx`
- Add optional `for=<placeholderUserId>` to `getJoinableEqualExpenses` + `applyEqualParticipation`; when present, require ADMIN of the group and apply rows for the placeholder's id (weighted path reuses expenseFlags/member_joined_review as-is).
- Client: after successful add, open the picker for the new placeholder.
**Verify:** admin ticks boxes → expense_splits rows for ghost id; balances tab shows ghost with negative share.

### Phase 4: Inbox + accept/merge
**Files:** `packages/server/src/routes/groups.ts` (or new `routes/invitations.ts`), `server.ts` (`GET /api/v1/invitations`, `POST /api/v1/invitations/:membershipId/accept`), `packages/server/src/routes/join.ts` (`getInviteInfo` + new authed `GET /api/v1/join/:inviteCode/placeholder` for the claim card), `packages/client/src/pages/Groups.tsx` (invitation cards), `packages/client/src/pages/JoinGroup.tsx` (claim-card branch)
- Inbox item payload: group name, inviter name, invited-email, current balance-if-accepted (`calculateBalances` on ghost id), invite code.
- Accept (authed): allowed when ghost email == my email OR claim arrived via that group's invite link (10b). Tx: repoint `expense_splits.user_id`, `expenses.paid_by`/`added_by`, `settlements.from/to_user_id`, `balance_plans.from/to_user_id`, `expense_flags.user_id`, ghost's `notifications` → my id; move membership (delete ghost membership, insert mine); delete ghost user row if no memberships remain; activity `member_joined` (+ "claimed invite addressed to …" when emails differ).
- Decline button = same cascade as discard (D9), actor = invitee.
**Verify:** ghost owes $42 → accept → real account owes $42, ghost gone, totals identical; mismatched-email claim via code works and logs.

### Phase 5: Roster + discard UI
**Files:** `packages/client/src/components/MembersTab.tsx`, `InviteFormModal.tsx` (toggle "Add to calculations now"), `GroupDetail.tsx` (roster badge)
- Ghost rows: grey "pending" pill (reuse badge styling), admin-only discard (X) → `DELETE` reuses `kickMember` (extend it: when target is placeholder, also delete ghost user row + activity text "removed X (never joined)").
**Verify:** browser on :3002 — add ghost → badge + bell + activity; discard → balances renormalize, ghost row gone from users table.

## Database Migrations
1. `0005_placeholder_members.sql` — add `is_placeholder`, swap full UNIQUE for partial index (Phase 1).

## Integration Tests
- register-succeeds-beside-ghost; login-invisible-to-ghost; dedup 400; admin-gate 403.
- accept-merge preserves every balance to the cent (before == after across all members).
- discard cascade: percent renorm + settlements deleted + ghost row removed.
- inbox shows one card per pending group per email; decline removes it.

## Manual Verification Checklist
- [ ] Admin: InviteFormModal toggle → picker → ghost in Balances tab
- [ ] Friend (throwaway acct, same email): bell + Groups-page card w/ disclosure balance → Accept → group appears, history intact
- [ ] Claim via invite link from a DIFFERENT email account shows "invited as …" warning
- [ ] Admin panel lists ghosts with flag; `curl :3002` UI only (no dev-port sprawl)

## Edge Cases Handled
- Ghost as payer → merge repoints `expenses.paid_by` (credit follows the person).
- Ghost email already has a real account → allowed; invite lands in their inbox; accept merges.
- Same email ghosted in two groups → two inbox cards, independent accepts.
- Resend down → ghost still created (200 + warning); in-app invite is truth.
- Locked book → merge repoints `balance_plans` legs so the frozen list keeps sailing.

## Out of Scope
- Email-change flow (future feature; invites follow the account when it ships), email verification, token claim links, reassign-shares-to-admin on discard, mobile UI redesign.
