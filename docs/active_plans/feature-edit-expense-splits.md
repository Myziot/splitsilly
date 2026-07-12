# Feature Plan: Edit Expense Splits (after an expense is added)

**Project:** split_silly (cost-sharing app, port 3002)
**Date:** 2026-07-10
**Status:** READY TO IMPLEMENT

---

## Context / Investigation findings
User reported: in group "Crow Reef camping" an expense shows but balances are 0.00 after adding.

Verified against the live DB + the real `calculateBalances` code path:
- Group "Crow Reef camping" real id = `7625f056-06da-4a8b-bcff-674c07d14b77` (the "325A433E" given was a display fragment, not a UUID).
- It has TWO expenses ($80 🥩, $9 Wood), each with valid `equal` splits in `expense_splits`.
- Running the actual `calculateBalances` returns **Bones +13.17, Captain −208.83, Bosun +26.67, Carmen 0** — NOT zero. Backend balances are CORRECT.
- Conclusion: the backend is fine. The "$7 / all zero" symptom is either a different group the user was viewing, or stale client state. The real missing capability is **editing splits after creation** (no UI exists; only read-only detail + Delete).

### Existing edit support (server-side, already present)
`expenses.ts updateExpense` (PUT `/api/v1/groups/:groupId/expenses/:expenseId`):
- creator-only (403 if not adder)
- updates expense fields, deletes + re-inserts splits (correct)
- **BUG**: line ~362 `amountMaster: amount.toString()` with comment "Simplified - should recalculate". For cross-currency expenses this leaves `amount_master` stale → wrong balances after edit. MUST FIX.

### Client gaps
- No `updateExpense` in `store/expenses.ts`.
- No edit modal in `GroupDetail.tsx` (detail panel line ~661 has only Delete).

---

## Design
Add an **Edit Expense** flow that reuses the Add-Expense form's fields/split logic, prefilled from the selected expense, posting to the existing `updateExpense` endpoint.

### A. Server fix — `routes/expenses.ts` `updateExpense`
- Recompute `amountMaster` exactly like `createExpense`: if `currency === groupCurrency` → `amountMaster = amount`; else fetch `getExchangeRate(currency, groupCurrency, expense_date)` and `convertAmount`. Handle 400 if rate unavailable.
- Recompute exchangeRate accordingly (store or null).
- Reuse the same split validation (percent=100, shares>0).
- After update, return the full updated expense object (mirror createExpense's response shape) so the client can replace it in state without a refetch.

### B. Client store — `store/expenses.ts`
- Add `updateExpense(groupId, expenseId, data)` → PUT, throw on !ok, return updated expense, and `set` replace the expense in `expenses` array.

### C. Client UI — `pages/GroupDetail.tsx`
- Add edit state: `showEditForm`, `editingExpenseId`, and prefill the SAME form fields used by Add (description, amount, currency, paid_by, category_id, expense_date, splitMode, splitValues).
- Add an **"Edit"** button in the expense DETAIL panel, visible only to the creator (`expense.added_by === currentUser?.id`), next to Delete.
- On Edit click: load the selected expense into the form fields (map `expense.splits` → splitMode + splitValues; equal → no values; percent/shares → values), open the modal (reuse the Add modal markup, or a parallel Edit modal that shares handlers). Simplest: reuse one modal component driven by an `editing` flag.
- `handleSubmitExpense` branches: if editing → call `updateExpense` then `setSelectedExpenseId(null)` + `fetchBalances`; else → `createExpense` (existing).
- Prefill logic: set newPaidBy, newCurrency (from expense), splitMode from first split, splitValues from splits.
- Validation reuse: same percent=100 / shares>0 checks already in `handleCreateExpense`.

### D. UX detail
- Modal title swaps "Add Expense" / "Edit Expense"; submit button "Add Expense" / "Save Changes".
- After save, balances auto-refresh (call `fetchBalances(groupId)`).

---

## Files
- PATCH `packages/server/src/routes/expenses.ts`  (recompute amountMaster/exchangeRate on edit; return full expense)
- PATCH `packages/client/src/store/expenses.ts`    (add updateExpense)
- PATCH `packages/client/src/pages/GroupDetail.tsx` (edit button + prefill + submit branch)

## Verification (real)
1. `npm run build` client clean.
2. Restart server.
3. Via server test (or browser): pick an expense in Crow Reef camping, edit its splits (e.g. change payer or switch to percent), confirm:
   - PUT returns 200 + updated expense
   - GET balances reflects new split (run calculateBalances or hit /balances)
   - cross-currency edit recomputes amount_master correctly
4. Browser: open Crow Reef camping → expense detail → Edit → change a split → Save → balances tab updates.
5. Log to neonlin.conversation_logs (PROJECT SPLIT_SILLY).

## Note on the user's "all 0.00" symptom
Will investigate which group/user view showed zeros; if it's a different group with a genuinely broken expense (missing splits), the edit UI also lets the user FIX it. If a specific broken expense is found, report it. Backend logic itself computes correctly; the bug was only the missing edit UI + the amountMaster-recompute gap.
