# Books & Settlement Lock — Grilled Implementation Plan

**Generated:** 2026-07-11
**Status:** READY FOR IMPLEMENTATION
**Target Objective:** Add per-group "books" (accounting periods). Closing a book freezes its
who-owes-who plan so settlements strike items off it instead of re-optimizing, killing the
"paid once, now owes again" confusion. A group can be closed once all books are settled.

---

## Locked decisions (from the grill)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Root cause | Ledger math is sound (verified SUM=0 on Crow Reef). Bug is UX: who-owes-who re-optimizes every render, reshuffling counterparties. Fix = freeze the *plan*, not the arithmetic. |
| 2 | Book meaning | Book = a FULL closed period: its own slice of expenses + settlements + a snapshot of who-owes-who at lock time. (Not just a plan snapshot.) |
| 3 | Standing expenses | Flagged `isStanding` expenses bypass the lock: always addable, always land in the OPEN book, exempt from the "expenses locked" warning. |
| 4 | Permissions | Lock / Unlock / Close / Reopen are ADMIN-only (matches existing Group Settings + Reset All Settlements). |
| 5 | Settlement under lock | Plan frozen. Recording a settlement strikes the matching planned transaction (partial pay supported). NO re-optimize while book is closed. |
| 6 | Group balance roll-up | Per-book optimize. Card pill = Σ(book nets). Balances tab lists each book + a Total row. No cross-book global optimize. |
| 7 | Group close | Button appears ONLY when every book (incl. open) is settled AND no live standing series remain. Blocks member-adds + expense-adds. Admin "Force close" override with confirm. Reopenable by admin. |

---

## Data model

```
groups (existing)
  + status: enum('open','closed') default 'open'   -- group-level close
  + closedAt: timestamp nullable

books (NEW)
  id, groupId FK, status enum('open','closed') default 'open'
  openedAt, closedAt nullable
  -- exactly one OPEN book per group at a time

balance_plans (NEW)  -- frozen who-owes-who snapshot taken at lock
  id, bookId FK, fromUserId, toUserId, amount, createdAt
  -- only populated when a book is locked (mirrors optimizeBalances output)

expenses (existing)
  + bookId FK -> books.id   -- new expenses hit the OPEN book
  + isStanding boolean default false

settlements (existing)
  + bookId FK -> books.id   -- payment belongs to the book it settled

groupMembers (existing)  -- on group close, add-member blocked
```

Migration: backfill — assign every existing expense/settlement to a freshly-created OPEN book
per group. `bookId` NOT NULL after backfill.

---

## Behavior rules

- **Open book**: behaves exactly like today (live net, live optimize). New + standing expenses → open book.
- **Lock (admin)**: snapshot `optimizeBalances(openBook)` → `balance_plans`; flip open book to `closed`; create a new OPEN book. Standing expenses keep posting to the new open book.
- **Under a closed book**: Balances tab renders `balance_plans` rows. Recording a settlement marks the matching plan row paid (partial allowed; overpay credited to that book's net). No re-optimize.
- **Card pill** (`Groups.tsx`): sum each book's net for the user. Closed-book nets come from `balance_plans` struck by settlements; open-book net from live `calculateBalances`.
- **Group close (admin)**: enabled only if all books settled (Σ remaining ≈ 0) AND no `isStanding` expense with live series. Sets `groups.status='closed'`. Blocks: add member, add expense (incl. standing). Force-close override archives any open standing series into a final book.
- **Reopen (admin)**: flips `groups.status='open'`, restores buttons.

---

## Implementation phases

### Phase 1 — Schema + migration
**Files:** `server/src/db/schema.ts`, new `server/src/db/migrations/xxxx_books.sql` (+ drizzle), backfill script.
- Add `books`, `balance_plans` tables; add `bookId`, `isStanding` to expenses; `bookId` to settlements; `status`/`closedAt` to groups.
- Backfill: per group, create one OPEN book; set all its expenses/settlements `bookId`.
**Verify:** migration applies; `SELECT count(*) FROM books` == number of groups; every expense has bookId.

### Phase 2 — Book service + lock/unlock
**Files:** `server/src/services/books.ts`, `server/src/routes/books.ts`.
- `lockBook(groupId, adminId)`: snapshot plans, close open, open new.
- `unlockBook(bookId, adminId)`: reopen a closed book (reopen its plan for edits).
- `getBooks(groupId)`: list with status + computed nets.
**Verify:** lock creates closed+open pair; plans match `optimizeBalances` output.

### Phase 3 — Settlement-assignment + frozen plan
**Files:** `server/src/routes/settlements.ts`, `calculateBalances` consumes `bookId`.
- Settlement create requires `bookId`; strikes matching `balance_plans` row if book closed.
- New endpoints: `GET /books/:bookId/plan`, `POST /books/:bookId/settle` (partial).
**Verify:** recording payment against closed book does NOT change suggested routing for other members.

### Phase 4 — Group close
**Files:** `server/src/routes/groups.ts` (close/reopen), guard in member-add + expense-add + expense-create.
- `closeGroup` gated on settled + no standing series; `forceClose` override.
**Verify:** close button hidden until predicate true; after close, add-member/add-expense return 403.

### Phase 5 — Client UI
**Files:** `pages/GroupDetail.tsx` (Balances tab: book switcher + frozen plan rendering), `pages/Groups.tsx` (card pill sums books), `components/TopBar`? no, `InviteLink`/member-add guard, new `bookLock` store.
- Lock/Unlock/Close/Reopen buttons (admin only). Warning banner when non-standing add attempted under lock.
- Balances tab: stacked book sections + Total row; closed books show struck plan.
**Verify:** `npx tsc --noEmit` + `npx vite build` clean; manual walk-through.

---

## Edge cases handled

- Partial settlement on a frozen plan → marks row partially paid, remainder stays.
- Overpay in closed book → credited to that book's net (shown in Total).
- Standing expense under lock → allowed, lands in open book, no warning.
- Group close blocked by live standing series → admin ends series or Force-close (confirm dialog).
- Reopen group → restores add buttons; closed books stay closed (auditable).
- Late-joiner flag (existing) → still applies within a book's expenses.
- Migration of existing groups → seamless; users see one open book with their history.

---

## Out of scope

- Cross-book global debt simplification (rejected — conflates trips).
- Per-member settlement reminders changes (existing Remind button stays).
- Multi-currency within a single book (group currency already fixed).
- Automatic recurring standing generation (flag only; triggering is separate work).

---

## Manual verification checklist

- [ ] Lock a test group → closed+open books created; plans frozen.
- [ ] Record a payment in closed book → routing for others unchanged.
- [ ] Add standing expense under lock → succeeds, no warning, lands in open book.
- [ ] Add one-off expense under lock → blocked + warning shown.
- [ ] Card pill = Σ across books.
- [ ] Group close appears only when all settled + no standing; blocks member/expense add.
- [ ] Reopen restores functionality.
- [ ] `npx tsc --noEmit` + `npx vite build` green.
