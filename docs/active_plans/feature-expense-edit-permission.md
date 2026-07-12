# Feature Plan: Per-Group "Who can edit expenses" setting + promote Captain to admin

**Project:** split_silly (port 3002)  **Date:** 2026-07-10  **Status:** READY TO IMPLEMENT

---

## 1. Goal
Add a group-level setting controlling WHO may edit/delete an expense, with 4 modes:
- `admin`            → expense creator AND group admins
- `creator_admin`    → expense creator AND group admins  (note: see decision below)
- `creator`          → expense creator only
- `any`              → all group members

Wait — re-reading the request the four options are:
  [] admin only
  [] expense creator and admin
  [] creator only
  [] all members

So the canonical enum values:
- `admin_only`        → only group admins
- `creator_admin`     → expense creator + group admins
- `creator_only`      → only the expense creator
- `all_members`       → any group member

Default on new groups: `creator_admin` (keeps current behaviour + lets admins correct mistakes).

Plus manual task: promote Captain to `admin` role in group `7625f056-06da-4a8b-bcff-674c07d14b77` (Crow Reef camping).

---

## 2. Current state (audited)
- `groupMembers.role` enum `admin|member` EXISTS; group creator auto-gets `admin`.
- There is NO expense-edit-permission setting.
- `updateExpense` (expenses.ts) currently requires `addedBy === userId` (creator only).
- `deleteExpense` (expenses.ts) currently requires `addedBy === userId`.
- Client (GroupDetail.tsx) shows Edit/Delete ONLY when `expense.added_by === currentUser.id`.
- Edit-splits UI from a prior session was partially wired (updateExpense server + client store) but not finished; will complete the gating here.

## 3. Backend changes
### 3.1 schema.ts
- Add `expenseEditEnum = pgEnum('expense_edit', ['admin_only','creator_admin','creator_only','all_members'])`.
- Add to `groups`: `expenseEdit: expenseEditEnum('expense_edit').default('creator_admin').notNull()`.
- Migration: `ALTER TABLE groups ADD COLUMN expense_edit expense_edit NOT NULL DEFAULT 'creator_admin';`

### 3.2 New helper `src/routes/expenses.ts` (or `src/services/authz.ts`)
```
async function canEditExpense(groupId, userId, expense): Promise<boolean> {
  const mem = await db.select({role}).from(groupMembers)
    .where(and(eq(groupId), eq(userId))).limit(1);
  if (!mem.length) return false;
  const isAdmin = mem[0].role === 'admin';
  const isCreator = expense.addedBy === userId;
  const setting = (await getGroupSetting(groupId)); // 'admin_only'|...
  switch(setting){
    case 'admin_only':   return isAdmin;
    case 'creator_admin':return isAdmin || isCreator;
    case 'creator_only': return isCreator;
    case 'all_members':  return true;
  }
}
```
Prefetch the group's expenseEdit once per request (avoid N queries).

### 3.3 Gate updateExpense + deleteExpense on canEditExpense
- Replace `addedBy === userId` check with canEdit; 403 if not permitted.

### 3.4 New settings endpoints (groups.ts)
- `GET /api/v1/groups/:id/settings` (any member): returns `{ expenseEdit, currency, name }`.
- `PUT /api/v1/groups/:id/settings` (admin only): body `{ expenseEdit }` validated against enum; updates groups.expenseEdit; 200 with updated group.

### 3.5 Make group detail return expenseEdit + per-expense canEdit
- `getGroup` / expense list detail: include `expenseEdit` on group object; when returning expense detail, include `canEdit` boolean (computed server-side from requester).

## 4. Client changes (GroupDetail.tsx)
- Add `expenseEdit` to the group store type; fetch via GET settings on mount.
- Settings panel (admin-only): 4 radio options bound to PUT settings.
- Replace `expense.added_by === currentUser.id` condition for Edit/Delete with `expense.canEdit` (from server) so the UI reflects the actual policy.
- Edit modal: reuse existing updateExpense store call (already added) — verify it's wired; otherwise wire it.
- Delete stays as-is (confirm + call deleteExpense).

## 5. Manual DB task
- `UPDATE group_members SET role='admin' WHERE group_id='7625f056-06da-4a8b-bcff-674c07d14b77' AND user_id=(SELECT id FROM users WHERE email=<captain>);`
- Verify with SELECT.

## 6. Verification (real)
- Unit-style: call calculateBalances-style check NOT needed; instead:
  - PUT settings to `all_members` → non-creator member can edit (200); revert.
  - PUT to `admin_only` → creator-member cannot edit (403), admin can (200).
  - PUT to `creator_only` → admin cannot edit non-own (403).
  - Promote Captain → confirm role='admin' in DB.
  - Browser: login as Captain, open Crow Reef camping, confirm Edit/Delete visible (creator_admin default) and settings panel visible (admin).
- Log to neonlin.conversation_logs.

## 7. Risks
- Backward compat: existing groups get default `creator_admin` → no behaviour regression.
- Enum default must be added in migration (NOT NULL).
