> **ARCHIVED (2026-09-30)** — docs consolidation pass; moved out of the active plans list.
**Status:** IMPLEMENTED — routes/notifications.ts + store/notifications.ts + NotificationBell in TopBar.tsx. See docs/archived/NOTIFICATIONS_IMPLEMENTATION_NOTES.md for the verification log.

# Feature Plan: Notifications + New-Member Join Flow (share/% attention)

**Project:** split_silly (cost-sharing app, port 3002)
**Date:** 2026-07-10
**Status:** READY TO IMPLEMENT (design signed off via grilling skill + playground)

---

## Context / Investigation findings

User wants a new member joining a group to be handled gracefully when that group has
existing `percent` / `shares` expenses. The design was reached by grilling (one question
per turn) and validated with a mock playground at `/notifications-playground`.

### Verified against the live codebase
- `expenseSplits` table stores one row per participant per expense, with `splitMode`
  ∈ {equal, percent, shares} and `value` (null for equal, 0–100 for percent, count for shares).
- Join flow (`routes/join.ts`) only inserts a `groupMembers` row — it does NOT touch expenses.
  Past expenses are independent of membership. This is correct (Splitwise-style): a new
  member does not retroactively change past expenses.
- When a NEW expense is created with `equal` split, the server only splits among the people
  in that expense's payload — it does NOT auto-include all current members. So "equal" means
  "equal among the people listed on this expense," not "all group members."
- Expense "owner" in the UI = `added_by` (GroupDetail shows creator name from
  `expense.added_by`, and `can_edit` gates editing). So "expense owner" for notifications = `addedBy`.
- NO notification system exists yet (no `notifications`/alert table, no bell in TopBar).
- `calculateBalances` already sums shares correctly and nets to 0 with the exact-cent fix.

### The core trap (why not to auto-add to past percent/shares expenses)
For `equal` expenses, adding a newcomer just grows the denominator (everyone's share shrinks)
— clean and intuitive. For `percent`/`shares`, each row carries a fixed weight that must keep
summing to 100% / total shares. Auto-inserting the newcomer would either (a) require guessing
their weight, or (b) rescale existing weights — which silently rewrites recorded splits and
corrupts already-settled balances (the same class of bug we just fixed). Therefore the newcomer
is auto-added ONLY to `equal` past expenses; `percent`/`shares` ones are surfaced for the
*owner* to handle, never auto-mutated.

---

## Design — 7 locked decisions

1. **Interactive join-time flow (Tricount-style).** When a member joins, ask them about past
   expenses rather than silently doing something.
2. **Group-level question, newcomer self-reports, with a per-expense "review individually"
   toggle as escape hatch.** "Include me in all past expenses?" — yes routes them into the
   review list; the toggle lets them untick specific expenses (e.g. they joined halfway).
3. **Auto-add newcomer only to `equal` past expenses.** `percent`/`shares` past expenses are
   NOT auto-added; they go into the review list where the newcomer types their own weight
   (validated to sum correctly). Never rescale existing weights.
4. **Real `notifications` table** (persistent, in-app only — no email/push yet). Bell sits
   LEFT of the user details in TopBar, with a red badge showing the unread count. Clicking the
   bell opens a dropdown.
5. **(refined) One notification per join event**, text: "X joined <group> — N of your share/%
   expenses need attention." Clicking the notification (or its **"go →"** button):
   (a) navigates to that group's **Expenses tab** (where the ⚠ marks live), and
   (b) **removes exactly 1 from the bell badge** (per-notification counter, NOT clear-all).
   The per-expense ⚠ on the Expenses tab is where the actual fixing happens.
6. **⚠ clears on any edit (C):** the `expense_flag` on an owner's `percent`/`shares` expense
   (predating a member who joined after it) clears when the owner edits that expense. The edit
   modal proactively nudges "New member X isn't in this split — add them?" The Edit button on
   the row turns **prominent/amber** while flagged. This avoids trapping the owner (any edit
   clears it) while nudging correctness.
7. **"Your participation" column in the Expenses list:** shows `equal` / `shares` / `%` plus
   the amount the viewer participates for, on every expense row. Doubles as an at-a-glance
   "how involved am I" view.

8. **New-expense notification (activity pulse):** when ANY member adds a new expense to a group,
   EVERY OTHER member of that group gets a notification: "<adder> added an expense '<desc>' in
   <group>." Clicking it (or its "go →") navigates to that group's **Expenses tab** (so they see
   the new line + their "Your participation" share) and decrements the badge by 1. The adder
   does NOT notify themselves.
9. **Settlement notification (activity pulse):** when ANY member records a settlement/payment
   (a transaction that settles a balance) in a group, EVERY OTHER member gets a notification:
   "<payer> settled with <payee> (<amount>) in <group>." Clicking it (or its "go →") navigates
   to that group's **Balances tab** (so they see the updated who-owes-who) and decrements the
   badge by 1. The member who initiated the settlement does NOT notify themselves.

> Note: Decisions 8 & 9 make notifications the group's activity feed for the two highest-signal
> events (money added, money settled). The join-event notification (Decision 5) remains the only
> one that also implies an action (reviewing share/% expenses). All three share the same bell,
> badge, grouped (B) dropdown, "go →" button, and per-notification decrement behavior.

### Chosen dropdown layout: **B (grouped by group)**
The playground showed 4 layouts (A stacked, B grouped, C compact, D card-with-action). User
picked **B** — notifications sectioned under each group header; opened items dim. Each
notification row carries a small indigo **"go →"** button.

---

## Implementation

### A. DB — new `notifications` table + migration
`packages/server/src/db/schema.ts`:
```
notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 32 }).notNull(),   // 'member_joined_review' | 'expense_added' | 'settlement_recorded'
  payload: jsonb('payload').notNull(),               // { memberName, memberId, expenseCount?, groupName, expenseDesc?, payer?, payee?, amount?, currency? }
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```
Migration: run via a node/pg script (same pattern as the expense_type migration) — create
table + indexes on (user_id, is_read). No enum needed; `type` is a varchar.

### B. Server — notification endpoints `routes/notifications.ts` (new)
- `GET /api/v1/notifications` → list for `req.user.userId`, ordered by createdAt desc.
  Return `{ id, type, payload, isRead, createdAt }`. 401 if unauth.
- `PATCH /api/v1/notifications/:id/read` → set `isRead = true` for that notification IF it
  belongs to the user. 404 if not found/belongs to someone else.
- `GET /api/v1/notifications/unread-count` → `{ count }` (for the badge; cheap count query).
  (Client can also derive count from the list; provide both — count endpoint avoids loading all.)

### C. Server — create notification in join flow `routes/join.ts`
After a successful member insert, find owners who need attention:
```
const groupExpenses = await db.select({ id, addedBy, createdAt })
  .from(expenses).where(eq(expenses.groupId, groupId));
// for each expense that is percent/shares AND createdAt < joinTime AND has splits
const flagged = groupExpenses.filter(e => isWeighted(e) && e.createdAt < joinTime);
// group flagged expenses by owner (addedBy)
const byOwner = groupBy(flagged, 'addedBy');
for (const [ownerId, exps] of byOwner) {
  if (ownerId === newMemberId) continue; // skip if they're the owner too
  await db.insert(notifications).values({
    userId: ownerId, groupId, type: 'member_joined_review',
    payload: { memberName, memberId: newMemberId, expenseCount: exps.length, groupName },
  });
}
```
`isWeighted(e)` = the expense's splits contain a `percent` or `shares` mode (query
expense_splits for that expense id, check splitMode). Keep it efficient: one query for the
group's expenses + one query for their split modes, build a set.

### C2. Shared helper — `notifyGroupMembers(groupId, exceptUserId, type, payloadData)`
A small reusable function (put in `routes/notifications.ts` or a `services/notifications.ts`):
fetches all `groupMembers` for `groupId`, excludes `exceptUserId`, and inserts one
`notifications` row per remaining member with the given `type` + `payload`. Used by the join
flow (C), the new-expense trigger (D2), and the settlement trigger (D3) so the "notify everyone
else" logic lives in exactly one place.

### D2. Server — new-expense trigger `routes/expenses.ts` `createExpense`
After a successful expense insert, call:
```
await notifyGroupMembers(groupId, req.user.userId, 'expense_added', {
  memberName: adderName, memberId: req.user.userId,
  expenseDesc: description, groupName,
});
```
(adderName = the creating user's name; fetch from the user record or `req.user`.)

### D3. Server — settlement trigger `routes/settlements.ts` `createSettlement`
After a successful settlement insert, call:
```
await notifyGroupMembers(groupId, req.user.userId, 'settlement_recorded', {
  memberName: payerName, memberId: req.user.userId,
  payer: payerName, payee: payeeName, amount, currency, groupName,
});
```
Skip notifying the member who initiated it (the `exceptUserId` arg). If the settlement was
created by an admin on behalf of two other members, still exclude only the initiator (the two
counterparties will each get notified — acceptable; can refine later).
Notification text is built client-side from `payload` (keeps server dumb).

### D. Client — TopBar bell + badge `components/TopBar.tsx`
- Add a `NotificationBell` component (or inline) to the LEFT of the user section.
- On mount + on a lightweight interval/refetch, fetch `/notifications/unread-count` → red badge
  with the number (hide if 0).
- Click toggles a dropdown panel rendered **B (grouped by group)** from
  `GET /api/v1/notifications`. Each row: member avatar initial, a type-specific message built
  client-side from `payload`, relative time, and a small indigo **"go →"** button.
  Message + destination by type:
  - `member_joined_review`: "X joined <group> — N of your share/% expenses need attention" →
    Expenses tab (where the ⚠ marks live). (Decision 5)
  - `expense_added`: "X added an expense '<desc>' in <group>" → Expenses tab. (Decision 8)
  - `settlement_recorded`: "X settled with <payee> (<amount>) in <group>" → Balances tab. (Decision 9)
- Clicking a row (or "go →") → `PATCH /notifications/:id/read` (decrement badge by 1) THEN
  `navigate('/groups/' + groupId + '?tab=' + targetTab)` where `targetTab` is `expenses` for
  `member_joined_review`/`expense_added` and `balances` for `settlement_recorded`. Opened rows dim.
  (GroupDetail must read the `?tab=` query param and switch to that tab on mount.)

> Notification text is built client-side from `payload` (keeps server dumb).

### E. Client — Expense ⚠ + prominent Edit + "Your participation" `pages/GroupDetail.tsx`
- Derive a `flaggedExpenseIds: Set` for the current viewer: for each `percent`/`shares`
  expense in this group whose `createdAt <` the MIN join time of a member who joined AFTER the
  expense, AND `added_by === currentUser.id` → flagged. (Compute per group: get members +
  their join times; for each weighted expense owned by me, if any member joined after
  expense.createdAt, flag it.) This is view-only logic, no new storage beyond `notifications`.
  Alternatively store an explicit `expense_flags` row on join — see "Open question" below.
- Render ⚠ (amber circle "!" with title) on flagged expense rows; Edit button gets amber
  prominent styling while flagged.
- Edit modal: when editing a flagged expense, show a nudge line "New member X isn't in this
  split — add them?" with a quick-add control; on save the flag clears (re-evaluate on refetch).
- Add a **"Your participation"** column to the Expenses table: for the current viewer, show
  `equal` / `shares` / `%` (from the viewer's split row `splitMode`) + the viewer's
  `yourShare` amount (already computed in `transformExpenses`). If the viewer isn't in the
  expense's splits, show "—".

### F. Client — store
- `store/notifications.ts` (new): `fetchNotifications()`, `markRead(id)`, `unreadCount`,
  `fetchUnreadCount()`. Wire into TopBar.
- `store/expenses.ts`: ensure `transformExpenses` already exposes each expense's splits so the
  UI can find the viewer's `splitMode` + amount for the participation column (verify; add if missing).

---

## Files
- NEW `packages/server/src/db/schema.ts` (add `notifications` table)
- NEW `packages/server/src/routes/notifications.ts` (list, mark-read, unread-count, + `notifyGroupMembers` helper)
- PATCH `packages/server/src/routes/join.ts` (create `member_joined_review` notifications via helper)
- PATCH `packages/server/src/routes/expenses.ts` (create `expense_added` notifications on createExpense)
- PATCH `packages/server/src/routes/settlements.ts` (create `settlement_recorded` notifications on createSettlement)
- PATCH `packages/server/src/db/index.ts` or wherever `db` is exported (ensure notifications imported)
- PATCH `packages/server/src/server.ts` (register `/api/v1/notifications` routes)
- NEW `packages/client/src/store/notifications.ts`
- PATCH `packages/client/src/components/TopBar.tsx` (bell + badge + grouped dropdown + go→, type-aware message + destination)
- PATCH `packages/client/src/pages/GroupDetail.tsx` (⚠, prominent Edit, Your-participation column, edit nudge, read `?tab=` to switch tab on notification navigation)
- PATCH `packages/client/src/store/expenses.ts` (expose viewer split info if needed)
- Migration script (run against live DB): create `notifications` table + indexes.

## Open question (decide at impl time)
The ⚠ flag in E can be either:
  (a) **derived view-only** from expenses + member join times (no new storage; recomputed each render), or
  (b) **explicit `expense_flags` row** created at join time (persisted; survives logic changes; pairs naturally with the notification).
Recommendation: **(b)** — create an `expense_flags(user_id, expense_id, reason)` row at the same
time we create the notification (same loop in join.ts). It's the source of truth for both the ⚠
and "clears on edit" — on expense update we simply delete that flag row. This avoids recomputing
join-time comparisons on every render and stays consistent with the persisted `notifications`
model. (The plan above describes (a) for clarity; implement (b) unless it proves heavier.)

## Verification (real)
1. Client `pnpm --filter @cost-sharing/client build` clean (tsc + vite).
2. Server files esbuild-syntax-check; restart `npx tsx src/server.ts`.
3. DB: confirm `notifications` table created; existing rows = 0.
4. Via API (curl with a real auth token, or browser logged in):
   - **Join trigger:** join a group that has a `percent`/`shares` expense owned by another member → assert a
     `notifications` row (`member_joined_review`) is inserted for that owner with correct payload.
   - **Expense-added trigger:** as member A, add an expense → assert every OTHER member (B, C…) gets an
     `expense_added` row; A gets none. Badge for B increments. Click → navigates to Expenses tab, badge −1.
   - **Settlement trigger:** as member A, record a settlement with B → assert B (and any other members) get a
     `settlement_recorded` row; A gets none. Click → navigates to Balances tab, badge −1.
   - `GET /notifications/unread-count` returns the expected count per user.
   - `GET /notifications` returns grouped notifications; bell badge shows the count.
   - Click a `member_joined_review` notification → `PATCH /notifications/:id/read` → count drops by 1; navigates to group Expenses tab.
   - Open the owner's Expenses tab → ⚠ on the flagged expense; "Your participation" column shows
     `% · <amount>` etc.
   - Edit the flagged expense (any save) → ⚠ clears (flag row deleted); Edit button returns normal.
5. Browser (logged in, on phone or desktop): full click-through — join → bell → go→ → Expenses → edit;
   add-expense → other-member bell → go→ → Expenses; settle → other-member bell → go→ → Balances.
6. Log to neonlin.conversation_logs (PROJECT SPLIT_SILLY).

## Notes
- No external push/email in this iteration (dashboard-first). Bell + in-app dropdown only.
- Admin-confirmation of the newcomer's past-expense answer (grill Q2 option C) is DEFERRED —
  self-report is trusted for friend/camping groups; can become a group setting later.
- Mock playground page `/notifications-playground` (NotificationsPlayground.tsx) stays as a
  design reference; it is mock-only and not wired to the real API.
