> **ARCHIVED (2026-09-30)** — docs consolidation pass; moved out of the active plans list.
**Status:** IMPLEMENTED — equalParticipants checkboxes in ExpenseFormModal.tsx; server equal-participation flow in routes/join.ts. (The 2026-09-23 audit's NOT-IMPLEMENTED verdict was wrong.)

# Equal-Split Participation Checkboxes — Grilled Implementation Plan

**Generated:** 2026-07-11
**Status:** READY FOR IMPLEMENTATION
**Target Objective:** Let users pick *who participated* in an equal-split expense via checkboxes (binary share), fully editable, and give new joiners a per-expense opt-in/out flow over existing equal expenses.

---

## Key Insight (why this is mostly UI)

`services/balances.ts` line 92 computes an equal share as `amountMaster / splits.length` — it divides by the **number of split rows**, NOT the number of group members. Therefore "who participated" is already encoded by *which `expense_splits` rows exist*. Omitting a row for an unchecked member Just Works with **zero balance-engine or schema changes**. Settlements are an append-only ledger (`balances.ts` 126-134) independent of expense shares, so retroactively adding/removing a participant re-derives the net correctly without rewriting past settlements.

---

## Architectural Decisions

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | Data model | Participation = presence/absence of an `expense_splits` row. No `participated` column, no migration. | Balance engine already divides by row count. Info fully recoverable from which rows exist. Matches Splitwise. |
| 2 | Editability | Reopening an equal expense pre-checks exactly the members that currently have a split row. | Decision requirement: "easily editable." |
| 3 | New-expense default | All members checked by default; block save when zero checked. | Preserves the "equal = everyone" mental model; reuses existing "at least one member" guard (GroupDetail line 274). |
| 4 | Join-flow granularity | Joiner sees a per-expense checklist of all EQUAL expenses, each checked by default. | Mirrors the per-expense participation model; accurate ("I was at dinner, not groceries"). |
| 5 | Join-flow action | Checked → insert joiner split row (live recompute). Unchecked → flag + notify that expense's creator. | Explicit intent; opt-out is surfaced to the creator for review. |
| 6 | Balances | Always dynamic. If a member settled before others joined and shares later change, the rebalance surfaces the delta and they resettle. | Settlement ledger is append-only & independent of shares — no phantom debt. |
| 7 | Notification reuse | Reuse `expense_flags` (reason `member_joined_after`) + `member_joined_review` notification exactly for opt-outs. | ⚠ badge, amber Edit, clear-on-edit already work (post-fix). Zero new client code. |

## Edge Cases Handled

- **Zero participants** → save blocked client-side (reuse line 274 guard), also validated server-side.
- **New member joins after an equal expense** → NOT auto-added; they decide via the join checklist. Checking adds their row; unchecking flags the creator.
- **Joiner checks an already-"settled" expense** → allowed; live recompute. Because settlements are immutable ledger rows, net re-derives; affected members simply resettle the delta.
- **Edit removes a previously-participating member** → their split row is deleted on the update (existing "delete all splits then re-insert" path, expenses.ts ~505-517). Balance recomputes.
- **Creator is the joiner** → skip flag/notify for their own expenses (mirror join.ts line 108 `e.addedBy !== userId`).
- **Percent/shares expenses** → UNCHANGED. Existing weighted-review flow (join.ts `WEIGHTED`) stays as-is.

## Implementation Phases

### Phase 1: Create-expense checkbox UI (equal mode)
**Files:** `packages/client/src/pages/GroupDetail.tsx`
**Changes:**
- Add `equalParticipants: Set<string>` state (or reuse `splitValues` as a presence map), defaulting to all `members` when the form opens / split mode is set to `equal` (see `handleSplitModeChange` ~line 241).
- In equal mode, render a checkbox per member (label = name/color chip) instead of the current implicit "everyone".
- In `handleCreateExpense` (line 254-272): for `equal`, only push a split row for CHECKED members: `if (equalParticipants.has(m.user_id)) splits.push({ user_id, split_mode:'equal', value:null })`.
- Keep the `splits.length === 0` guard (line 274) — now also enforces "≥1 checkbox".
**Verification:** Create an equal expense with 2 of 3 members checked; confirm only 2 `expense_splits` rows exist and each owes half via `/balances`.

### Phase 2: Edit prefill from existing rows
**Files:** `packages/client/src/pages/GroupDetail.tsx`
**Changes:**
- In the edit-open handler (where existing splits populate `splitValues`), for `equal` expenses build the checked-set from existing split rows' `user_id`s.
- On save (the `editingExpenseId` branch, ~line 304), rebuild the `splits` array from checked members exactly like Phase 1. Existing server path already deletes+reinserts splits and clears flags.
- Confirm the local flag-clear from the prior fix still fires (line ~306): `setFlaggedIds(ids => ids.filter(id => id !== editingExpenseId))`.
**Verification:** Reopen the Phase-1 expense; the 2 participants are pre-checked, the 3rd unchecked. Check the 3rd, save; balance recomputes to thirds.

### Phase 3: Server — accept partial equal splits (defensive)
**Files:** `packages/server/src/routes/expenses.ts` (createExpense + updateExpense)
**Changes:**
- Confirm createExpense/updateExpense already persist exactly the `splits` array sent (they do — they map the array). Add a server-side guard: reject if `splits.length === 0` with 400.
- No balance-engine change needed.
**Verification:** `curl` POST an equal expense with a subset of members → 201, correct rows. POST with empty splits → 400.

### Phase 4: Join flow — per-expense equal checklist
**Files:** `packages/client` (join page/component — find via the `/api/v1/join/:inviteCode` caller), `packages/server/src/routes/join.ts`
**Changes (client):**
- After a successful join (or as a post-join step), fetch the group's EQUAL expenses and render a per-expense checklist (description, amount, date, payer), all checked by default.
- On confirm, POST the joiner's selections (list of expenseIds they opted INTO and/or OUT of).
**Changes (server, join.ts):**
- New endpoint (e.g. `POST /api/v1/groups/:groupId/join/equal-participation`) OR extend joinGroup response to include the equal-expense list, then a follow-up endpoint to apply selections.
- For each CHECKED equal expense: insert an `expense_splits` row `{ expenseId, userId: joiner, splitMode:'equal', value:null }` (idempotent — skip if a row already exists).
- For each UNCHECKED equal expense: insert an `expense_flags` row `{ userId: creator(addedBy), groupId, expenseId, reason:'member_joined_after' }` + one `member_joined_review` notification per affected creator (reuse the exact pattern in join.ts 117-140). Skip if creator === joiner.
- Wrap in try/catch (best-effort), never block the join.
**Verification:** Second account joins; sees the checklist; unchecks one expense. Confirm: (a) checked expenses got a joiner split row, (b) unchecked expense's creator got a ⚠ flag + bell notification, (c) balances reflect the joiner only on checked expenses.

### Phase 5: End-to-end + regression
**Files:** —
**Changes:** none; verification only.
**Verification:** Full live run (browser) of create → edit → join checklist → creator sees ⚠ → creator edits → ⚠ clears. Confirm percent/shares flows still flag as before (no regression).

## Database Migrations

**None.** Feature relies entirely on presence/absence of existing `expense_splits` rows and the existing `expense_flags` / `notifications` tables.

## Integration Tests

- Equal expense with subset of members → only those owe, split evenly.
- Edit toggles a member in/out → rows added/removed, balance recomputes.
- Zero participants → rejected (client + server 400).
- Joiner opts INTO a past equal expense → split row added, live rebalance.
- Joiner opts OUT → creator gets `expense_flags` row + `member_joined_review` notification.
- Creator edits the opted-out expense → flag clears (existing fix).
- Percent/shares join flow unchanged (regression).

## Manual Verification Checklist

- [ ] Create equal expense with checkboxes; uncheck 1 member; only checked members owe.
- [ ] Reopen for edit; checked-set matches existing rows.
- [ ] Toggle a member and save; balance recomputes correctly.
- [ ] Block save with all unchecked.
- [ ] New member join shows per-expense checklist (checked by default).
- [ ] Opt into an expense → appears in that expense's split, balances update.
- [ ] Opt out → creator sees ⚠ + bell notification.
- [ ] Creator edits flagged expense → ⚠ disappears.
- [ ] Percent/shares expenses unaffected.

## Out of Scope

- `participated` boolean column / audit trail (Decision 1 chose presence-based).
- Per-group setting for auto-include behavior.
- Retroactive settlement auto-adjustment (users resettle manually — Decision 6).
- Changing percent/shares participation UX (this feature is equal-mode only).
- Master "select all/none" toggle on the join checklist (add later only if lists grow long).
