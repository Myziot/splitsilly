# Activity Log Roster + Category Filter — Grilled Implementation Plan

**Generated:** 2026-09-27 · **Status:** READY FOR IMPLEMENTATION
**Target Objective:** Fix the broken member-join logging, complete the group event roster (5 new types), backfill derivable history, and add a category→type drill-down filter to the Log tab.

## Architectural Decisions
| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | Roster scope | Tier B: fix `member_joined` + add `group_created`, `member_removed`, `invite_sent`, `invite_link_shared`, `settings_changed` | Log = story of the group; participation events deferred (Tier C) |
| 2 | Creator join | Folded into `group_created` ("X created the group") — no separate row | Two rows for one instant is ledger clutter |
| 3 | member_joined bug | Move `logGroupActivity` from `applyEqualParticipation` (join.ts:312) into `joinGroup` (after membership insert); DELETE the old call | Root cause: log only fired when joiner used the participation step; new groups with no expenses logged nothing |
| 4 | Link-share logging | New `POST /groups/:id/invite-link-shared`, fired fire-and-forget on clipboard copy in InviteLink.tsx (needs new `groupId` prop); dedupe = one row per (group, actor) via partial unique index | Copy→text is the real invite path; dedupe kills click-spam |
| 5 | Filter UX | Variant D: category pills (All/People/Expenses/Payments/Book) + drill-down type chips within category; client-side over fetched feed | Verified at /log-filter-playground; mobile-friendly, reaches all 16 types |
| 6 | Backfill | One-off script: `group_created` (actor=created_by, ts=groups.created_at) + `member_joined` per current member (ts=joined_at), idempotent, ALL groups; dump-first | Only reconstructable facts; unrecoverable events (kicks/invites/settings) NOT invented |

## Edge Cases Handled
- Kick/rejoin → multiple member_joined rows OK; backfill dedupes by (group_id, actor_id, action).
- invite-link-shared double POST (double-click) → partial unique index + pre-check, second is a silent 200 no-op.
- `applyEqualParticipation` keeps its notification/flag logic; ONLY its member_joined log line is removed (else double-log).
- inviteMember email failure → log only after successful send (route already throws on failure).
- Filter with 0 matches → "No activity matches this filter." empty state.
- Backfill script skips groups that already have the row type (rerunnable).

## Implementation Phases
### Phase 1: Server triggers (groups.ts, join.ts, notifications.ts, server.ts)
- join.ts `joinGroup`: after membership insert, look up joiner name, `logGroupActivity(groupId, userId,'member_joined',{actorName})`. Remove the log call in `applyEqualParticipation`.
- groups.ts `createGroup`: after tx, log `group_created` {actorName, groupName}.
- groups.ts `kickMember`: after tx, log `member_removed` {actorName, memberName} (both via users lookup BEFORE the tx deletes nothing of the target user — user row survives; only membership goes).
- groups.ts `inviteMember`: after sendInviteEmail success, log `invite_sent` {actorName, inviteeName}.
- groups.ts NEW `logInviteLinkShared`: membership gate; if a row (groupId, actorId, action='invite_link_shared') exists → 200 {ok,deduped:true}; else insert. Register `POST /api/v1/groups/:groupId/invite-link-shared` in server.ts.
- groups.ts `updateGroupSettings`: read old expenseEdit before update; log `settings_changed` {actorName, oldValue, newValue}.
**Verify:** esbuild parse per file; systemd restart picks up code; live-API script (Phase 4).

### Phase 2: DB migration (manual SQL, dump-first)
- `CREATE UNIQUE INDEX IF NOT EXISTS uq_group_activity_link_shared ON group_activity (group_id, actor_id) WHERE action = 'invite_link_shared';`
- Backfill script `scripts/backfill_activity.ts` (tsx, from packages/server): per group, insert missing `group_created` + `member_joined` rows with real timestamps. Run on `splitsilly_scratch` (pg_dump copy) → assert counts → run live.
**Verify:** row-count diff scratch vs live pre/post; Skull Cove must end with 1 group_created + 3 member_joined (Captain, Sailor, Polly).

### Phase 3: Client (activity.ts, GroupActivityTab.tsx, InviteLink.tsx + callers)
- store/activity.ts: union += 5 types; ACTIVITY_META += 5 entries (icons/labels/colors per playground); export `CATEGORY: Record<ActivityAction,string>` (People/Expenses/Payments/Book).
- GroupActivityTab.tsx: 5 summary branches + Variant D filter (pills row, then type chips scoped to selected category, clear-on-category-change, empty state).
- InviteLink.tsx: optional `groupId` prop → on copy, fire-and-forget POST invite-link-shared (ignore errors). Pass groupId at both call sites (GroupDetail navbar + MembersTab).
- `node ./node_modules/vite/bin/vite.js build`.
**Verify:** tsc clean; CDP harness on a throwaway group's real Log tab (mint session, Network.setCookie, click pills/chips, assert rows).

### Phase 4: End-to-end verification (self-cleaning)
- Throwaway users + throwaway group via API: create → expect group_created; link-shared POST ×2 → exactly 1 row; settings change → settings_changed row; second user joins → member_joined (proves the fix); kick → member_removed row. Then delete throwaway group (cascades activity rows).
- invite_sent NOT live-tested (would send a REAL email) — code-reviewed only; state this honestly.
- Skull Cove Camp 2026 Log tab (read-only browser check as a member session): shows creation + 3 joins, filter works.

## Out of Scope
- Tier C participation opt-in/out events; email-log audit tab; server-side pagination of the log; rotating invite codes.
