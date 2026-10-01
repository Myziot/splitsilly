# Decoupled Invite vs Add Member (three-state seats) — Grilled Implementation Plan

**Generated:** 2026-09-30 · **Status:** COMPLETE (E2E 21/21 + guard 400 + zero-start accept verified; committed 77fc804)
**Ledger:** `docs/archived/feature-invite-vs-add-member-grill-ledger.md` (D1–D7, closed)
**Objective:** Split "Invite" into admin-only **Add Member** (in-math placeholder) and all-member **Send Invite** (passive `invited` seat — invisible in expenses/balances until accept or admin Promote).

## Architectural Decisions
| # | Topic | Decision |
|---|-------|----------|
| D1 | Model | `group_members.status` enum `active/added/invited`. `invited` = ghost seat, mathematically inert (balances read `expense_splits`, not seats). ONE guard: split-writes reject invited ids. |
| D2 | Promote | Ghosts never in pickers; admin **Promote** button flips invited→added. Cues: banner after invite + caption under pending rows for non-admins. |
| D3 | Permissions/dedup | All members can invite. One seat per email per group; creating NEVER changes an existing seat's status (collision = re-send email + "already invited"). Removal admin-side (kick). |
| D4 | Accept | One card, one flow. Disclosure branches: invited → "you start at zero"; added → balance-inheritance. Existing merge/claim paths unchanged. |
| D5 | UI | Header: `Add Member` solid violet (admin-only, leftmost) + `Send Invite` solid blue. One `InviteFormModal` with `mode="add"|"invite"`; checkbox retired. |
| D6 | Signals | Invite → bell ADMINS only + `invite_sent` activity row. Promote → full broadcast (`member_added_pending` bell). |
| D7 | Migration | 0006: add column default 'active'; backfill placeholder seats → 'added'. Reversible. |

## Edge Cases
- Split-write on invited id → 400 (expenses create/update + admin-proxy participation).
- Invite email collides with active/added/invited seat → email re-sent, seat untouched, "already invited".
- Invited ghost in balances → filtered from userIds in routes/balances.ts (zero-rows vanish).
- Accept of invited seat → mergeGhostIntoUser is a no-op (guard guarantees no refs); new seat lands `active`.
- Kick/discard of invited ghost → existing purge path unchanged.
- settlements/books routes untouched (invited users have no balances/legs — inert).

## Phases
### P1 Schema — `db/schema.ts`, `db/migrations/0006_member_status.sql`
status column + enum; backfill. Verify: `\d group_members`, counts per status.
### P2 Server
- `routes/groups.ts`: getGroupMembers returns `status`; inviteMember = seat-creating (dedup by email any status; find-or-create ghost user; insert seat status='invited'; bell admins via notifyGroupMembers-style rows; activity `invite_sent` with `inMath:false`).
- `routes/expenses.ts`: guard before split inserts (create ~L324, update ~L560): reject split user_ids holding `invited` seats in group.
- `routes/join.ts`: resolveParticipationTarget rejects invited targets.
- NEW `POST /groups/:groupId/members/:userId/promote` (invitations.ts handler, server.ts mount): admin-only, invited→added, broadcastGroupChanged + full bell + activity.
- `routes/balances.ts`: exclude invited from userIds.
- `routes/invitations.ts` findPendingInvitations/buildInboxItem: return `seat_status`.
### P3 Client
- types: `status` on GroupMember; `seat_status` on Invitation.
- MembersTab: two buttons (violet Add Member admin-only / blue Send Invite); badges: added=violet "in the calculations · not joined"+Add to expenses, invited=grey "invited · pending"+Promote(admin); non-admin caption; banner branches.
- InviteFormModal: `mode` prop replaces checkbox; titles/labels branch.
- ExpenseFormModal + GroupDetail "Participants": filter `status!=='invited'`.
- InvitationCard: disclosure line branches on seat_status. TopBar: member_invited_pending wording uses `inMath` flag. activity.ts: reuse existing labels.
### P4 Verify
tsc both (no NEW errors vs baseline), vite build, systemctl restart, E2E (guard 400s, dedup, promote, accept-invited zero-start, balances exclusion), UI walkthrough + promote path.

## Out of Scope
Self-cancel of own invites; playground page; changes to settlements/books/lock internals.
