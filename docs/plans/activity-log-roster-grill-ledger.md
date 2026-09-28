# Activity Log Roster + Filter — Grill Ledger

**Started:** 2026-09-27 · **Status:** IN LOOP
**Resume protocol:** open this file, continue at OPEN question, never re-ask ticked items.

## Verified ground truth
- Group "Skull Cove Camp 2026" = `26186ae3-50a9-4a16-a255-301889d7b4f2`, created 2026-09-27 10:26 PDT; members Captain (admin, 10:26:07) + Sailor (member, 10:27:30). `group_activity` rows for it: **0**.
- ROOT CAUSE of empty Log tab: `member_joined` is logged ONLY in `routes/join.ts:312` inside `applyEqualParticipation` (POST /groups/:id/equal-participation). The actual join route `joinGroup` (join.ts:35–164) never calls `logGroupActivity`. Client `JoinGroup.tsx` skips the participation step when there are no equal expenses → no POST → no log row.
- No `group_created` / creator-join event exists anywhere (`createGroup` groups.ts:44–82).
- `kickMember` (groups.ts:211) logs nothing. `inviteMember` (groups.ts:396) logs only to `email_logs`, not group_activity. `updateGroupSettings` (groups.ts:357) logs nothing.
- Existing logged actions (11): member_joined, expense_created/updated/deleted, settlement_recorded/reverted/edited, book_locked/unlocked/recalculated, reset_settlements.
- 4-place edit recipe for new actions: server `logGroupActivity` call + `ActivityAction` union (store/activity.ts) + `ACTIVITY_META` entry + summary branch in GroupActivityTab.tsx (the if/else chain now lives in the extracted component, not GroupDetail).
- `getActivity` (notifications.ts:126) returns ALL rows, no action filter, no limit.
- Server on :3002 runs under systemd --user (pid 1687339 at time of writing); client builds via `node ./node_modules/vite/bin/vite.js build` from packages/client.

## Locked decisions
- [x] Q1 roster scope = **Tier B**: fix `member_joined` (move logGroupActivity into joinGroup, join.ts:35–164), add `group_created` (in createGroup tx; single row "X created the group" — creator's admin-join folded in, no separate row), `member_removed` (kickMember), `invite_sent` (inviteMember route), `settings_changed` (updateGroupSettings). 5 new/changed types total.
- [x] Q2 invite coverage = **C**: email invites logged in `inviteMember` (`invite_sent`, details: toName/toEmail) + new `POST /groups/:id/invite-link-shared` fired fire-and-forget on clipboard copy in InviteLink.tsx; dedupe via unique index on `(group_id, actor_id, action)` for `invite_link_shared` only (partial unique index WHERE action='invite_link_shared') → one "shared the invite link" row per member per group. Wording: "X shared the invite link" (honest — not a claim about delivery).
- [x] Q3 filter UX = **D** (category pills + drill-down type chips), click-verified variants at /log-filter-playground (kept live). Client-side filter over fetched feed; GroupActivityTab gets the two-row control; playground stays.
- [x] Q4 backfill = **B**: one-off script inserts `group_created` (actor=creator, created_at=groups.created_at) + one `member_joined` per current member (created_at=group_members.joined_at) for ALL groups with 0 rows of that type (idempotent skip). Kicked-member joins/invites/settings are unrecoverable — not invented. Dump-first: run on scratch DB copy, diff, then live.

## Question queue
1. Roster scope (tiered) — DONE (B)
2. Filter chip design — DONE (D, playground click-verified)
3. Backfill of pre-existing groups — DONE (B, dump-first, live-verified)
4. Invite events — DONE (C)

## Build & verification log (2026-09-27)
- Phase 1 (server): join.ts member_joined moved to joinGroup; createGroup/kickMember/inviteMember/updateGroupSettings triggers added; new POST /invite-link-shared (dedupe pre-check + partial unique index); server.ts route registered. esbuild parse OK.
- Phase 2 (DB): uq_group_activity_link_shared index + backfill (7 group_created, 18→15 member_joined after creator-rule fix) run on scratch dump first, then live. Live verified: timestamps byte-match, creator rows removed, idempotent re-run = 0 inserts. NOTE: expense_edit default is 'creator_admin' (not admin_only).
- Phase 3 (client): activity.ts +5 types +ACTIVITY_CATEGORY; GroupActivityTab rewritten (switch summaries + Variant D filter); InviteLink groupId prop + fire-and-forget POST (both call sites); ?tab=log deep-link support added. tsc clean, vite built, server restarted (systemd split_silly.service).
- Phase 4 (E2E): scripts/e2e_activity_roster.ts — 12/12 PASS over live HTTP (create/link-shared-dedupe/settings-diff+noop/join-fix/kick/gate), self-cleaning. UI proof: headless Chromium as Captain (DB-minted session via Network.setCookie) on Skull Cove Log tab — 3 rows render, People pill + Joined chip filter correctly.
- NOT live-tested: invite_sent (would send a REAL email) — code-reviewed only.
- Leftover: `ws` devDep in packages/client (test harnesses only); removal blocked pending user consent.
