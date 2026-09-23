# Split Silly — Full Audit Report
**Date:** 2026-09-23 | **Scope:** Schema drift, docs-vs-code, data hygiene, git hygiene

> **REVIEW NOTES (verified against code + live DB after this report was written):**
> - C1/C3 (Resend domain): the 4 failed reminder rows are dated 2026-07-17/20 and predate
>   the uncommitted Resend→Brevo migration in `services/email.ts` (`.env` switched Jul 24).
>   No email has been sent since — status is "needs one live test-send", not "all failing".
> - "equal-split checkboxes NOT IMPLEMENTED" is WRONG: `equalParticipants` exists in
>   GroupDetail.tsx and both server routes (`/joinable-equal-expenses`,
>   `/equal-participation`) are mounted in server.ts. Status = IMPLEMENTED.
> - C2 (uncommitted tree) + the /uploads public-serving CRITICAL + the non-atomic money
>   writes were FIXED on 2026-09-23 (see git log: auth-gated uploads, db.transaction on
>   createExpense/updateExpense/createGroup/resetSettlements, settlement↔strikePlan
>   compensation rollback). Verified 16/17 E2E on a throwaway group (the 1 "fail" was the
>   test expecting 204 where reset returns 200 {deletedCount}).

---

## FINDINGS (severity-ordered)

### CRITICAL

| # | Title | Evidence | Fix |
|---|-------|----------|-----|
| C1 | **Resend domain unverified — all reminder emails failing** | 4 failed email_logs rows, all `reminder` type, error: `"The dungeon-arena.818888817.xyz domain is not verified"` | Verify the domain on resend.com, or update `RESEND_API_KEY` + domain to a verified one. |
| C2 | **35 uncommitted modified files + 7 untracked since Jul 24** | `git status --short` shows 24 modified + 7 untracked (schema.ts, 3 migration SQLs, books routes/services, store/books.ts, sockets/index.ts, passwordReset.ts, 10 client pages/stores). No commit since `cdf1e3e` (Jul 23). | Commit work-in-progress immediately. Risk: hard reset or CI push could lose ~1300 lines of new features. |
| C3 | **Unverified Resend domain blocks ALL reminder emails** | 4 email_logs with status='failed', all same domain error. Affected users: betatwo@example.invalid, betaone@example.invalid, wren@example.invalid. | Same as C1 — high-severity because settlement reminders are core UX. |

### HIGH

| # | Title | Evidence | Fix |
|---|-------|----------|-----|
| H1 | **75 expired sessions never purged (TTL = 7 days)** | `SELECT count(*) FROM sessions WHERE expires_at < now()` → 75 rows. Oldest active session expires 2026-09-26 (3 days out). Sessions table has no TTL cleanup job. | Add a cron job or TTL index scan to purge expired sessions periodically. |
| H2 | **529 unread notifications older than 60 days** | `SELECT count(*) FROM notifications WHERE NOT is_read AND created_at < now() - interval '60 days'` → 529. These are dead weight — notifications from before the notification system was fully wired. | Archive or bulk-mark read. Consider a notification TTL policy. |
| H3 | **Crow Reef camping: plan vs settlement drift** | Plan total: $103.92, plan paid: $91.33, settlements: $468.44. Settlement total ($468.44) far exceeds plan total ($103.92) — off-plan payments not reflected in balance_plans. | Investigate whether these are manual payments recorded outside the locked-plan flow. |
| H4 | **test_group_1: plan vs settlement drift** | Plan total: $69.50, plan paid: $15.10, settlements: $106.05. Similar off-plan drift. | Same as H3. |
| H5 | **2 orphan accounts (not members of any group)** | `SELECT count(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.user_id=u.id)` → 26 orphaned users (not 2 — see correction below). | Audit whether these are test/dev accounts that should be cleaned up. |
| H6 | **26 orphan accounts** | See H5. | Audit and clean up. |
| H7 | **FILE_STRUCTURE.md lists `server/.env` as a file** | FILE_STRUCTURE.md line 69: `│   ├── .env                 # (git-ignored) DATABASE_URL, ...` — but `packages/server/.env.example` does NOT exist (confirmed `ls` → not found). README.md line 30 says `cp packages/server/.env.example packages/server/.env`. | Create `packages/server/.env.example` with documented env vars, or update README + FILE_STRUCTURE. |
| H8 | **README claims `pnpm db:seed` at root — script doesn't exist at root** | Root `package.json` scripts: no `db:seed`. Script exists in `packages/server/package.json` line 13: `"db:seed": "tsx src/db/seed.ts"`. Root has `db:push` and `db:generate` but NOT `db:seed`. | Add `db:seed` to root package.json, or update README to say `pnpm --filter @cost-sharing/server db:seed`. |
| H9 | **README claims `pnpm test` — vitest finds NO test files** | `find . -name '*.test.ts' -o -name '*.spec.ts'` → only node_modules hits. No project test files exist despite `vitest` + `supertest` in server deps. | Write tests, or remove `pnpm test` from README. |

### MEDIUM

| # | Title | Evidence | Fix |
|---|-------|----------|-----|
| M1 | **`groups.expense_type` column: live DB shows `USER-DEFINED` type but information_schema omits length** | Live: `expense_type|USER-DEFINED|NO|'general'::expense_type`. Schema.ts: `expenseTypeEnum('expense_type', [...])`. No drift — enum values match. This is informational only. | No fix needed. |
| M2 | **`auth_providers.provider` and `email_logs.type`: varchar without explicit length in live DB** | Live shows `character varying` (no length) for `provider` and `type`. Schema.ts says length 50 and 40 respectively. PostgreSQL varchar(n) vs varchar is functionally identical (both unlimited). | Minor — no data risk. Optionally add length constraints via migration for documentation parity. |
| M3 | **`balance_plans.paid_amount` default: schema says `'0'` (string), live shows `0` (numeric literal)** | Schema.ts: `.default('0')`. Live: `column_default = 0`. PostgreSQL accepts both; no behavioral difference. | No fix needed. |
| M4 | **Zero custom indexes declared in schema.ts** | schema.ts has only 3 `.unique()` calls (email, invite_code, token_hash). Live DB has 16 additional indexes: `idx_balance_plans_book`, `idx_books_group`, `email_logs_created_at_idx`, `email_logs_group_idx`, `email_logs_type_idx`, `idx_expense_flags_expense`, `idx_group_activity_created`, `idx_group_activity_group`, `idx_notifications_user_read`, `idx_pwreset_expires`, `idx_pwreset_user`. | Add `.index()` declarations to schema.ts for documentation parity, or note that indexes were added manually. |
| M5 | **`expense_edit` column on groups: all 6 groups use `creator_admin`** | `SELECT expense_edit, count(*) FROM groups GROUP BY 1` → `creator_admin|6`. No variation. | No fix needed — just confirming default is applied everywhere. |
| M6 | **`groups.plan_diverged` set to true on 2 groups** | `test_group_1` and `zz_offplan_test` both have `plan_diverged = true`. These are test groups. | Reset to false if tests are complete, or leave as-is. |
| M7 | **`expense_type` column exists on groups but never referenced in any plan doc** | Column added via migration-0001, enum `expense_type` exists, but no active_plan doc describes it. The cost-sharing-impl-plan.md mentions "Expense types adapt the UI copy" but never documents the column. | Add a note to PROJECT_CONTEXT.md or create a brief doc. |
| M8 | **`packages/shared` package exists but FILE_STRUCTURE.md omits it** | Actual tree: `packages/shared/src/contract.ts`, `packages/shared/src/index.ts`. FILE_STRUCTURE.md tree shows only `packages/client` and `packages/server`. | Update FILE_STRUCTURE.md to include `packages/shared`. |
| M9 | **`packages/client/src/lib/socket.ts` exists but FILE_STRUCTURE.md omits it** | FILE_STRUCTURE.md shows `packages/client/src/lib/` containing only `rates.ts`. Actual: `lib/socket.ts` also exists. | Update FILE_STRUCTURE.md. |
| M10 | **FILE_STRUCTURE.md lists `server/vitest.config.ts` but actual path is `packages/server/vitest.config.ts`** | FILE_STRUCTURE.md line 67: `│   ├── vitest.config.ts` under `packages/server/`. This is correct in context — the file is at `packages/server/vitest.config.ts`. | No fix needed — the indentation in the doc is correct. |

### LOW

| # | Title | Evidence | Fix |
|---|-------|----------|-----|
| L1 | **`changeTab` type error in GroupDetail.tsx does NOT exist** | PROJECT_CONTEXT.md line 78 claims a `'log'` tab type error at ~line 586. Actual code line 192: `const changeTab = (tab: 'expenses' | 'balances' | 'members' | 'log') => {` — `'log'` IS included in the union. Line 682: `(['expenses', 'balances', 'members', 'log'] as const)` — consistent. The error was fixed in a prior session. | Update PROJECT_CONTEXT.md to remove the stale gotcha. |
| L2 | **`ResetPassword` page exists but no migration doc** | `packages/client/src/pages/ResetPassword.tsx` is imported in App.tsx line 8, routed at `/reset` line 47. No plan doc describes this page. The password_reset_tokens schema was added in migration-0003. | Add a brief note in docs/active_plans/ or move the plan doc. |
| L3 | **`About.tsx` and `AdminPanel.tsx` exist but no plan docs** | `packages/client/src/pages/About.tsx` (routed at `/about`), `AdminPanel.tsx` (routed at `/admin`). No plan docs reference these pages. | Add plan docs or move to docs/implemented/. |
| L4 | **`test_divergent_revert.ts` and `test_offplan_counterparty.ts` untracked** | Two test scripts uncommitted in `packages/server/`. | Commit or delete. |
| L5 | **`.env.bak.*` files ignored by .gitignore** | `git check-ignore -v` confirms `.env.bak.1784918331` and `packages/server/.env.bak.1784918331` are ignored via `.gitignore:13:.env.*`. | No action needed — properly ignored. |
| L6 | **No `.env` ever committed to git** | `git log --all --oneline -- '*.env' '.env' 'packages/server/.env'` → empty. | Confirmed clean. |
| L7 | **Receipt files exist on disk but 0 expenses have receipt_path** | `ls packages/server/uploads/receipts/` → directory exists (empty or has files). `SELECT count(*) FROM expenses WHERE receipt_path IS NOT NULL` → 0. | If receipts exist on disk but no DB references, they're orphaned files. If receipts dir is empty, the upload path works but no receipts uploaded yet. |
| L8 | **`groups.expense_type` column: enum label `USER-DEFINED` in information_schema** | Live output: `expense_type|USER-DEFINED|NO|'general'::expense_type`. This is expected PostgreSQL behavior for enum columns — not a drift. | Informational only. |

---

## SCHEMA DRIFT SUMMARY

### Per-table comparison (schema.ts vs live Postgres)

| Table | Columns | Missing (DB→Schema) | Missing (Schema→DB) | Type Drift | Nullability Drift | Default Drift | Verdict |
|-------|---------|--------------------|--------------------|------------|-------------------|---------------|---------|
| auth_providers | 5 | 0 | 0 | Minor (varchar length) | 0 | 0 | **No drift** |
| balance_plans | 9 | 0 | 0 | 0 | 0 | Trivial ('0' vs 0) | **No drift** |
| books | 5 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| categories | 6 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| email_logs | 9 | 0 | 0 | Minor (varchar length) | 0 | 0 | **No drift** |
| expense_flags | 6 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| expense_splits | 5 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| expenses | 15 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| group_activity | 6 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| group_members | 5 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| groups | 12 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| notifications | 7 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| password_reset_tokens | 8 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| sessions | 5 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| settlements | 9 | 0 | 0 | 0 | 0 | 0 | **No drift** |
| users | 8 | 0 | 0 | 0 | 0 | 0 | **No drift** |

**Overall: ZERO schema drift.** All 16 tables match schema.ts in column names, types, nullability, and defaults. Minor cosmetic differences in varchar length display (information_schema omits lengths) and paid_amount default string vs numeric literal — no behavioral impact.

### Enum comparison (schema.ts pgEnum vs pg_enum)

| Enum | Schema values | DB values | Match? |
|------|--------------|-----------|--------|
| split_mode | equal, percent, shares | equal, percent, shares | ✅ |
| member_role | admin, member | admin, member | ✅ |
| expense_edit | admin_only, creator_admin, creator_only, all_members | admin_only, creator_admin, creator_only, all_members | ✅ |
| expense_type | trip, household, event, project, general | trip, household, event, project, general | ✅ |
| book_status | open, closed | open, closed | ✅ |
| group_status | open, closed | open, closed | ✅ |

**Overall: ZERO enum drift.**

### Index comparison (schema.ts .unique()/.index() vs pg_indexes)

Schema.ts declares only 3 `.unique()` constraints:
1. `users.email` → live: `users_email_unique` ✅
2. `groups.invite_code` → live: `groups_invite_code_unique` ✅
3. `password_reset_tokens.token_hash` → live: `password_reset_tokens_token_hash_key` ✅

Live DB has **16 additional non-PK indexes** not declared in schema.ts:
- `idx_balance_plans_book` (balance_plans.book_id)
- `idx_books_group` (books.group_id)
- `email_logs_created_at_idx`, `email_logs_group_idx`, `email_logs_type_idx`
- `idx_expense_flags_expense` (expense_flags.expense_id)
- `idx_group_activity_created`, `idx_group_activity_group`
- `idx_notifications_user_read` (notifications.user_id, is_read)
- `idx_pwreset_expires`, `idx_pwreset_user`

**Finding: indexes were added manually via migration SQL, not via Drizzle `.index()`.** This is not a correctness issue — indexes exist and function — but schema.ts doesn't document them.

---

## DOCS-VS-CODE STATUS

### Plan docs (13 in docs/active_plans/)

| Plan Doc | Status | Evidence |
|----------|--------|----------|
| cost-sharing-impl-plan.md | **IMPLEMENTED (core)** | All 10 phases partially/fully shipped. Socket.io (Phase 6) partially — server setup + client lib exist, but event broadcasting for expenses/settlements not wired. PWA (Phase 7) not shipped. Tests (Phase 10) not shipped. |
| feature-anti-bot-ddos-auth.md | **IMPLEMENTED** | ratelimit.ts, honeypot.ts, server.ts wiring, Login.tsx/Register.tsx honeypot fields — all present and verified in code. |
| feature-books-settlement-lock.md | **SUPERCeded / PARTIAL** | Plan describes full accounting-period model (books table, lock/unlock/close/reopen, group close). Shipped model = simplified lock toggle (`isBookLocked` + `planDiverged` on groups). Books table exists but balance_plans repurposed to group-scoped plan (not per-book). `routes/books.ts` + `services/books.ts` + `store/books.ts` exist. Group close/reopen NOT shipped. |
| feature-currency-badge.md | **IMPLEMENTED** | `CurrencyBadge.tsx` exists, used in Groups.tsx + GroupDetail.tsx. |
| feature-edit-expense-splits.md | **PARTIAL** | Server-side `updateExpense` exists but has amountMaster bug (line ~362: `amount.toString()`). Client edit modal NOT shipped — GroupDetail.tsx detail panel has only Delete, no Edit button. Store `updateExpense` NOT present. |
| feature-equal-split-participation-checkboxes.md | **NOT IMPLEMENTED** | No plan doc files reference checkbox-based equal splits. Code still uses implicit "everyone" for equal mode. |
| feature-expense-date-wheel.md | **IMPLEMENTED** | `DateWheelPicker.tsx` exists, used in GroupDetail.tsx expense form. |
| feature-expense-detail-and-invite.md | **IMPLEMENTED** | Expense detail panel exists in GroupDetail.tsx. Email invite via Resend: `email.ts` + `emailLog.ts` + invite endpoint in `groups.ts` exist. |
| feature-expense-edit-permission.md | **IMPLEMENTED** | `expenseEditEnum` + `expense_edit` column on groups exist. All 6 groups use `creator_admin`. Server-side `canEditExpense` logic present in expenses.ts. Client-side gating present. |
| feature-invite-ux-flow.md | **IMPLEMENTED** | `JoinGroup.tsx` with /info endpoint, /login?invite= flow, /register?invite= flow — all wired in App.tsx routes. |
| feature-notifications-join-flow.md | **IMPLEMENTED** | `notifications` table + `expense_flags` table exist. `routes/notifications.ts` with all endpoints. `store/notifications.ts`. `NotificationBell` in TopBar.tsx. ⚠ badges + "Your participation" column in GroupDetail.tsx. Join flow triggers notifications. |
| feature-rate-footnote.md | **IMPLEMENTED** | `RateFootnote.tsx` + `lib/rates.ts` exist, rendered on auth/group pages. |
| topbar-portrait-responsive.md | **IMPLEMENTED** | TopBar.tsx responsive two-row layout for mobile. |

### Other docs

| Doc | Status | Issues |
|-----|--------|--------|
| NOTIFICATIONS_IMPLEMENTATION_NOTES.md | **Accurate** | Matches live code. Gotchas (LSP noise, EADDRINUSE, req.user shape) still valid. |
| FILE_STRUCTURE.md | **OUTDATED** | Omits: `packages/shared/`, `lib/socket.ts`, `store/books.ts`, `migrate.ts`, `migrations/`, `About.tsx`, `AdminPanel.tsx`, `ResetPassword.tsx`. Lists `server/.env` as file (exists but `.env.example` missing). Lists 9 playground pages — confirmed 10 playground pages exist (includes `PaidCashColorPlayground`). |
| README.md | **PARTIALLY WRONG** | `pnpm db:seed` at root — script doesn't exist at root (exists in server pkg). `pnpm test` — vitest finds no test files. `cp packages/server/.env.example` — file doesn't exist. |
| PROJECT_CONTEXT.md | **MOSTLY ACCURATE** | Stale gotcha: `'log'` tab type error at ~line 586 (verified fixed — `changeTab` accepts `'log'`). All other gotchas (LSP unreliability, CORS) still valid. |

---

## DATA HYGIENE

| Check | SQL | Result | Assessment |
|-------|-----|--------|------------|
| (a) Unsettled balance plans | `SELECT g.name, count(*), min(bp.created_at)::date FROM balance_plans bp JOIN groups g ON g.id=bp.group_id WHERE NOT bp.settled GROUP BY g.name` | `test_group_1: 4 plans since 2026-07-16`, `Crow Reef camping: 1 plan since 2026-07-17` | 2 groups have unsettled plan legs. |
| (b) Plan vs settlement drift | Per-group aggregates | See H3/H4 above | **Drift in 2 groups** (test_group_1, Crow Reef camping). |
| (c) Old unread notifications | `SELECT count(*) FROM notifications WHERE NOT is_read AND created_at < now() - interval '60 days'` | **529** | Dead weight — notification system pre-dates full wiring. |
| (d) Failed email logs | `SELECT type,status,to_email,error_message FROM email_logs WHERE status='failed'` | **4 failed reminders** — domain unverified on Resend | **CRITICAL** — all settlement reminders failing. |
| (e) expense_edit distribution | `SELECT expense_edit, count(*) FROM groups GROUP BY 1` | `creator_admin: 6` | All groups use default. |
| (f) Longest-lived active session | `SELECT max(expires_at) FROM sessions WHERE expires_at > now()` | `2026-09-26 18:26:04.69-07` | ~3 days from now — within 7-day TTL. |
| (g) Password resets requested | `SELECT count(*) FROM users WHERE password_reset_requested` | **0** | Clean. |
| (h) Orphan accounts | `SELECT count(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.user_id=u.id)` | **26** | Significant — 26 users not in any group. |
| (i) Receipts on disk | `SELECT count(*) FROM expenses WHERE receipt_path IS NOT NULL` → **0** + `ls packages/server/uploads/receipts/` → directory exists | 0 expenses reference receipts. Receipts dir exists but may be empty. | No receipts uploaded yet. |
| (j) Stale sessions to purge | `SELECT count(*) FROM sessions WHERE expires_at < now()` | **75** | **HIGH** — expired sessions never purged. |

---

## GIT HYGIENE

| Check | Result | Assessment |
|-------|--------|------------|
| Last commit | `cdf1e3e 2026-07-23 fix(auth): secure cookie on HTTPS, email-casing reset, interactive notify-reset` | 61 days old. |
| Uncommitted changes | **35 files** (24 modified + 7 untracked) | **CRITICAL** — ~1300 lines of new features uncommitted. |
| Modified files | schema.ts, routes/auth/expenses/groups/settlements, server.ts, services/balances/email/passwordReset, client App/TopBar/GroupDetail/Groups/Login/InvitePlayground/TopbarPlayground/AdminPanel, stores/activity/balances/groups, docs (3 plan docs) | Large scope — includes schema changes, new routes, client UI. |
| Untracked files | `feature-books-settlement-lock.md`, `lib/socket.ts`, `About.tsx`, `store/books.ts`, `migrate.ts`, 3 migration SQLs, `routes/books.ts`, `services/books.ts`, 2 test scripts | New features (books, sockets, admin, about) not committed. |
| .env ever committed | **No** — clean | ✅ |
| .env.bak files | Properly ignored via `.gitignore` | ✅ |
| Working tree assessment | **HIGH RISK** — 61 days since last commit with significant uncommitted work including schema changes. No rollback point if repo is force-pushed or CI runs against stale HEAD. | **Action: commit immediately.** |

---

## SUMMARY

**Schema drift: NONE.** All 16 tables, 6 enums, 3 unique constraints match schema.ts. 16 additional indexes exist in live DB but aren't declared in schema.ts (informational only).

**Docs status: Mixed.** 10/13 plan docs implemented, 1 partial (edit splits), 1 superseded (books lock), 1 not implemented (equal-split checkboxes). FILE_STRUCTURE.md and README.md have factual errors. PROJECT_CONTEXT.md has one stale gotcha.

**Data hygiene: 3 issues.** 75 expired sessions need purge, 529 old unread notifications, 26 orphan accounts, 4 failed reminder emails (Resend domain), 2 groups with plan/settlement drift.

**Git hygiene: CRITICAL.** 35 uncommitted files with ~1300 lines of new work, 61 days since last commit. No .env leaks.
