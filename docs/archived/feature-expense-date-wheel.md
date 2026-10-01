> **ARCHIVED (2026-09-30)** — docs consolidation pass; moved out of the active plans list.
**Status:** SUPERSEDED — native <input type="date"> was chosen for the expense form; DateWheelPicker.tsx kept only for /design-playground.

# Feature Plan: Interactive Expense-Date Wheel Picker

Date: 2026-07-10
Status: planned (design saved before code, per standing order)

## Goal
Add a native-feeling, scrollable day/month/year date picker to the Add/Edit
Expense flow (desktop now, Android/iOS later). Default to TODAY (client local)
if the user skips it. Keep the UI uncomplicated for users.

## Background — the "three times" the user likes
The app already models three distinct moments; this feature only improves how
the first one is *entered*:
  - expense_date  (DATE)        -> "when the expense was actually made"  [this picker]
  - created_at    (timestamptz) -> record creation time   [already shown in detail]
  - updated_at    (timestamptz) -> last edit time         [already shown in detail]

No new DB column is required. expense_date already exists, is validated by the
shared contract (CreateExpenseRequestSchema.expense_date: z.string()), flows
through the store and server untouched, and stores a LOCAL day (the UTC bug was
already fixed + historical rows backfilled). Adding a timestamptz + time picker
would "complicate the UI" — explicitly out of scope.

## Deliverables
1. New component `packages/client/src/components/DateWheelPicker.tsx`
   - Props: `value: string` (YYYY-MM-DD), `onChange: (v: string) => void`,
     optional `fromYear`/`toYear` (default currentYear-5 .. currentYear+1).
   - Renders 3 scrollable columns (Day | Month name | Year) using
     `overflow-y-auto` + `scroll-snap-y snap-mandatory`, items `snap-center`.
   - Initial scroll position centers the selected value.
   - Selection updates on scroll-end (debounced ~120ms) by reading the item
     nearest the center line, AND on item click (scroll + set).
   - Days-per-month handled correctly incl. leap years; if selected day
     exceeds days in the chosen month, clamp on change.
   - Keyboard/aria: each column is a `role="listbox"`, items `role="option"`,
     arrow keys move selection (basic), so it's not mouse-only.
   - Styled to match the app (rounded, bordered, centered highlight band).

2. Wire into `GroupDetail.tsx` expense form
   - Replace the existing `<input type="date">` (lines ~511-519) with
     `<DateWheelPicker value={newExpenseDate} onChange={setNewExpenseDate} />`.
   - Keep `newExpenseDate` state defaulting to local TODAY (already correct:
     `useState(() => local Y-M-D)`). "Skip" => stays today. ✔
   - `openEditExpense` already seeds `newExpenseDate` from `expense.expense_date`
     — picker will open on that date. ✔
   - Label the form field "Expense date" (clarity that this is "when made").

3. Minor detail-view clarity
   - Relabel the detail `<dt>` "Date" -> "Expense date" so the three times read
     clearly: Expense date / Created / Updated.

## Out of scope (explicit)
- No time-of-day picker, no new `expense_at` column, no migration.
- If the user later wants the actual clock time of purchase, that's a separate
  feature (timestamptz + migration + time wheel) — offer as follow-up only.

## Files touched
- packages/client/src/components/DateWheelPicker.tsx  (NEW)
- packages/client/src/pages/GroupDetail.tsx          (wire + 1 relabel)
- (no server / shared / store / schema changes)

## Verification
- `pnpm --filter @cost-sharing/client typecheck`  -> clean
- `pnpm --filter @cost-sharing/client build`      -> success (rebuilds into
  server/dist/client which the running server serves)
- Node sim: daysInMonth(2026,2)=28, daysInMonth(2024,2)=29, default=today local.
- Manual (browser, if login available): open Add Expense, confirm wheel shows
  today (10 Jul 2026 · PDT), scroll day/month/year, save, confirm list + detail
  show the chosen date and "Created" reflects real entry time.
