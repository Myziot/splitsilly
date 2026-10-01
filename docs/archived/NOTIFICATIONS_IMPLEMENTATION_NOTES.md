> **ARCHIVED (2026-09-30)** — docs consolidation pass; moved out of the active plans list.
**Status:** HISTORICAL (2026-07-11) — verification log for the shipped notifications feature. Section 1 gotchas partly superseded: server now runs under systemd (see PROJECT_CONTEXT), and notification deep-links use router navigate(), not location.hash.

# Notifications + Join-Flow Implementation — Findings & Double-Check List

**Project:** split_silly (cost-sharing app, port 3002)
**Feature:** notification system (join / new-expense / settlement) + "needs review" flags + Your-participation column
**Status:** implemented & verified (2026-07-11)
**Blueprint:** `docs/active_plans/feature-notifications-join-flow.md`

---

## 1. ENVIRONMENT GOTCHAS (read before touching server code)

### 1.1 The LSP diagnostics are STALE / mostly noise — DO NOT trust them
The editor/language-server re-analysis spews a wall of `mysql2/promise`, `getSQL`,
`MySqlSelectBase`, `receiptPath`, `isRead`, `role`, `description` errors. These are NOT real:
- `mysql2/promise` / `getSQL` / `MySqlSelectBase` etc. come from the drizzle-orm
  SQLite/MySQL dialect typings — this project only uses **Postgres**. Dead weight; every
  existing server file trips it.
- `receiptPath`, `isRead`, `role`, `description`, `groupId` "does not exist" errors are the
  LSP reading a **cached** version of `schema.ts` from before migrations/this session's edits.

**Reliable truth instead:**
- `npx esbuild <file> --bundle --format=cjs --platform=node` — PARSES + resolves imports.
  Real syntax/missing-import errors fail here. (All server files passed this.)
- Boot via `tsx src/server.ts` + hit endpoints with `curl`. `tsx` strips types, so only genuine
  logic errors surface (used-before-declared, bad import, etc.).

### 1.2 A sibling subagent renamed `expenseHandler` → `expensesHandler` in `server.ts`
After editing, the LSP flagged `server.ts: Cannot find name 'expenseHandler'`. The import is
`expensesHandler`. Always re-grep the actual import name before referencing a handler.

### 1.3 `req.user` shape is `{ userId, user: { id, name, email, ... } }` — NOT `{ name }`
The session middleware (`middleware/session.ts`) puts the user under `req.user.user`.
Using `(req as any).user?.name` yields `undefined` → notification shows "A member".
Correct: `(req as any).user?.user?.name`. (Fixed in `expenses.ts`.)

### 1.4 Restarting the server — EADDRINUSE trap
`pkill -f "tsx src/server.ts"` killed the SHELL, not the old listener. The old server (pid from
`ss -tlnp | grep 3002`, e.g. `503972`) kept the port. Symptoms of hitting the OLD server:
new routes return 404 (not 401) and your code changes aren't live.
**Correct restart:**
```
ss -tlnp 2>/dev/null | grep 3002        # find the pid holding the port
kill -9 <pid>                            # or: fuser -k 3002/tcp
sleep 1
# then start fresh (background):
cd packages/server && npx tsx src/server.ts
```
Confirm with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/api/v1/notifications`
→ should be **401** (auth gate, i.e. route is registered), NOT 404.

### 1.5 Snap `curl` prints a noisy banner
`curl` on this host is the Snap build — prints "Caution: Snap version of curl" to stderr.
Harmless. Pipe through `grep -v Caution` to silence, or ignore.

---

## 2. DOUBLE-CHECK LIST (pre-merge / when revisiting)

### 2.1 Schema
- [ ] `notifications` table: `id, user_id (FK users), group_id (FK groups), type (varchar 32),
      payload (jsonb), is_read (bool default false), created_at (timestamptz default now)`.
- [ ] `expense_flags` table: `id, user_id, group_id, expense_id, reason (varchar 32),
      created_at`. **`groupId` column was added AFTER initial creation** — if you ever
      regenerate the schema from scratch, the ADD-column migration in
      `migrate_flags_group.mjs` logic must be re-run (`ALTER TABLE expense_flags ADD COLUMN IF NOT EXISTS group_id UUID NOT NULL REFERENCES groups(id)`).
- [ ] `expenseType` column on `groups` (added earlier) + its enum exist; backfill not needed (default 'general').

### 2.2 Server routes (all registered in `server.ts`)
- [ ] `GET  /api/v1/notifications` — list for current user, ordered by created_at DESC.
- [ ] `GET  /api/v1/notifications/unread-count` — `{ count }`.
- [ ] `PATCH /api/v1/notifications/:id/read` — marks one read, sets `is_read=true`.
- [ ] `GET  /api/v1/groups/:groupId/expense-flags` — current user's flagged expense IDs (array).
- [ ] `notifyGroupMembers(groupId, exceptUserId, type, payload)` — inserts one row per OTHER
      member; **never notifies the actor**. Best-effort (wrapped in try/catch so it can't break
      the parent action).

### 2.3 Triggers (the three events)
- [ ] **New expense** (`expenses.ts` createExpense): notifies all OTHER members
      (`expense_added`, payload has `memberName`, `memberId`, `expenseDesc`, `groupName`).
- [ ] **Settlement** (`settlements.ts` createSettlement): notifies all OTHER members
      (`settlement_recorded`, payload has `payer`, `payee`, `amount`, `currency`, `groupName`).
- [ ] **Join** (`join.ts`): for each `percent`/`shares` expense owned by another member that
      predates the join, creates ONE `member_joined_review` notification per affected OWNER +
      an `expense_flags` row (userId=owner, groupId, expenseId, reason='member_joined_after').
      Only flags the OWNER, skips if the joiner is the owner. Best-effort.
- [ ] **Edit expense** (`expenses.ts` updateExpense): clears `expense_flags` for that expense
      (Decision 6 — ⚠ clears on any edit).

### 2.4 Client
- [ ] `store/notifications.ts`: fetchNotifications / fetchUnreadCount / markRead (markRead also
      decrements local `unreadCount` by 1).
- [ ] `TopBar.tsx`: `<NotificationBell />` placed LEFT of the user section. Bell 🔔 + red badge =
      unread count. Dropdown groups by `payload.groupName` (Design B). Each row has a
      indigo **"go →"** button. Clicking a row: `markRead(id)` + navigates
      (`window.location.hash = #/groups/:id?tab=expenses|balances`) + badge drops by 1.
- [ ] `GroupDetail.tsx`:
      - [ ] On mount, reads `?tab=` from `window.location.hash` and switches the active tab
            (notification deep-link).
      - [ ] Fetches `/expense-flags` → `flaggedIds`.
      - [ ] Expense list table has a **"Your part"** column (mode + computed share for current user).
      - [ ] Flagged expenses show an amber **⚠** badge on the row.
      - [ ] When flagged, the **Edit** action is a prominent amber button (not the plain blue link).

---

## 3. VERIFICATION PERFORMED (2026-07-11, live DB, authenticated session)

Method: created a real `sessions` row (hashed token) for Captain, used it as the
`cost_sharing_session` cookie, then drove the API against a group with 3 other members.

- [x] POST expense (201) → OTHER member received `expense_added` (author name + description correct).
- [x] POST settlement (201) → OTHER member received `settlement_recorded` (payer/payee correct).
- [x] Actor (Captain) did NOT receive a notification for their own actions (correct exclusion).
- [x] OTHER member unread-count incremented by 1 per event.
- [x] Client `tsc && vite build` clean (56 modules).
- [x] Server boots clean ("Server running on port 3002").
- [x] Test rows (2 expenses + 2 settlements + their notifications) deleted afterward — no pollution.

### NOT yet live-tested (code mirrors verified paths; needs a real join)
- [ ] `member_joined_review` end-to-end (requires a real second account joining a group via invite
      link). Expected: owner of any `percent`/`shares` expense gets a bell + ⚠ on that expense.
- [ ] Browser click-through of the bell dropdown + "go →" navigation + ⚠ rendering (logic verified,
      visual not screenshotted this session).

---

## 4. HOW TO RE-RUN A QUICK VERIFICATION
```
# 1. ensure fresh server on :3002 (see 1.4)
# 2. make a session cookie for a user:
node -e "const pg=require('pg'),c=require('crypto');/* insert sessions row, hash token */"
# 3. curl with Cookie: cost_sharing_session=<token>
curl -b "cost_sharing_session=$TOK" http://localhost:3002/api/v1/notifications/unread-count
```

## 5. KEY DECISIONS (recap, full detail in the blueprint)
1. Interactive join-time flow. 2. Group-level "include me?" + per-expense review escape hatch.
3. Auto-add newcomer only to `equal` past expenses; `percent`/`shares` → review (never rescale
   existing weights — would corrupt settled balances). 4. Real `notifications` table; bell left of
   user; red badge; grouped (B) dropdown. 5. One notification per join event; clicking → navigate
   to Expenses tab + decrement badge by 1; "go →" button. 6. ⚠ clears on any edit; Edit turns amber.
7. "Your participation" column (equal/%/shares · amount). 8. `expense_added` → other members →
   Expenses tab. 9. `settlement_recorded` → other members → Balances tab.
