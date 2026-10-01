> **ARCHIVED (2026-09-30)** — docs consolidation pass; moved out of the active plans list.
**Status:** CLOSED — the final OPEN question (compile blueprint?) resolved: compiled to docs/active_plans/feature-invite-vs-add-member.md and shipped (commit 77fc804).

# Grill Ledger — feature-invite-vs-add-member

Goal: split the Invite button into (1) admin-only "Add Member" (current placeholder, in-math) and (2) "Send Invite" for ALL members creating a passive "invited" person — invisible in expenses/balances until they accept; an admin can later promote them into an added member.

## Locked decisions
- D1 (user-corrected): `group_members.status` enum with THREE states — `active` (joined), `added` (admin placeholder, in-math), `invited` (passive ghost: seat exists for roster/dedup, but no split rows, invisible in expenses/balances until accept or admin promote). Enforcement = ONE server guard: expense create/update rejects invited user_ids in splits (400). Grounding: calculateBalances reads expense_splits (services/balances.ts:62), NOT memberships — so an invited seat is mathematically inert; the guard protects the single write chokepoint. Promote = flip invited→added; accept = existing merge path.

- D2: Promote path = A — invited ghosts NEVER appear in expense splitters (guard already covers it); admin flips them via a Promote button on the roster row. Cue for non-admin members: (a) success banner after Send Invite: "they'll show in Members as pending; they join the math when they accept, or an admin can add them sooner"; (b) Members tab caption under invited rows for non-admins: "Only admins can add pending members to expenses." Badges split: added = violet "in the calculations · not joined" (+ Add to expenses, admin), invited = grey "invited · pending" (+ Promote, admin only).

- D3: All members may send invites. ONE dedup rule: one seat per email per group; creating an invite NEVER changes an existing seat's status — collision with active/added/invited = re-send email + "already invited" message, seat untouched. Removal stays admin-side (kick). No self-cancel in v1.

- D4: One inbox card, one accept flow for both seat kinds. Disclosure line branches by status: invited = "you start at zero", added = current balance-inheritance wording. Accept = flip seat to active; existing merge machinery (mergeGhostIntoUser) runs unchanged and finds nothing to merge for invited seats. Invite-link claim path (wrong-email + code, prior D10b) works for both kinds unchanged.

- D5: Members tab header = two buttons, right-aligned: `Add Member` solid violet (admin-only, leftmost) + `Send Invite` solid blue (all members). Members see only blue — bar looks like today's. Both open the SAME InviteFormModal in mode="add" | "invite" (checkbox retired; titles/labels branch). Header height unchanged (no full-width buttons — pitfall 17/19).

- D6: Signals routed by consequence. Invite sent → bell ADMINS only (actionable: Promote) + `invite_sent` activity-feed row for everyone; invitee gets the email. Promote → full broadcast via existing `member_added_pending` bell (math changes). Uses existing notifyGroupMembers except-list + logGroupActivity — less code than blanket broadcast.

- D7 (mechanical): migration = ALTER group_members ADD status enum(active|added|invited) default 'active'; backfill seats with is_placeholder user → 'added'. Existing ghosts become the 'added' state unchanged; no behavior change on deploy; reversible.

## OPEN — final: compile blueprint to docs/active_plans/feature-invite-vs-add-member.md?

## Ground truth (verified this session)
- Placeholder ghost = users row (is_placeholder=true) + group_members seat → counts in math (services/balances.ts iterates members; splits are per-expense rows).
- inviteMember (routes/groups.ts ~L396): any MEMBER can email the invite link; creates NO seat, NO record — email only.
- Placeholder add (routes/invitations.ts): admin-only, seat + ghost row.
- Inbox = ghost memberships matched by email; accept = mergeGhostIntoUser; kick/discard share purgeMemberGroupData.
- group_members has no status column today (id, group_id, user_id, role, joined_at).

## Resume protocol
Open this file, continue at the OPEN question, never re-ask ticked items.
