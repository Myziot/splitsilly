> **ARCHIVED (2026-09-30)** — docs consolidation pass; moved out of the active plans list.
**Status:** IMPLEMENTED (core) — Phases 1-9 shipped; PWA install flow and full test suite never built. Superseded as a living doc by README + PROJECT_CONTEXT.

# Cost-Sharing App -- Grilled Implementation Plan

**Generated:** 2026-07-06
**Status:** READY FOR IMPLEMENTATION
**Target Objective:** A lightweight cost-sharing web app (like Splitwise) for friends — groups, multi-currency expenses, three split modes, debt optimization, real-time updates, deployable locally via Cloudflare Tunnel.

---

## Architectural Decisions

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | Auth | Email/password + OAuth (Google) scaffolding | Full control, no external deps for MVP. OAuth routes/schema ready for future activation. |
| 2 | Sessions | Server-side sessions (PostgreSQL `sessions` table) | Same proven pattern as dungeon_arena. Instant revocation, no JWT complexity. |
| 3 | Group invites | Invite link only (e.g., `/join/abc123`) | No email infra needed. Share via chat. Email deferred to Phase 2. |
| 4 | Split modes | Equal (checkboxes), Percent (sum=100%), Shares (integers) | Covers all common split patterns. Stored in `expense_splits` table with `split_mode` enum. |
| 5 | Expense splits storage | Dedicated `expense_splits` table | Fully dynamic, one row per (expense, user). Normalized, Drizzle-friendly, referential integrity. |
| 6 | Settlements | Separate `settlements` table | Clean separation: expenses drive obligations, settlements discharge them. No re-routing through settled parties. |
| 7 | Post-settlement expenses | Open ledger (balances shift naturally) | Industry standard (Splitwise). New expenses naturally shift balances. No locking. |
| 8 | Multi-currency | Per-expense currency + group master currency, rate locked at creation | No retroactive drift. Users see master currency with original currency in parentheses/tooltip. |
| 9 | Exchange rates | Frankfurter.app (free, no API key, ECB-backed) | Zero setup, unlimited requests, daily rates. |
| 10 | Debt optimization | Greedy algorithm (sort by balance, match biggest creditor/debtor) | Industry standard. O(N log N). Good enough for groups of 2-10. |
| 11 | Real-time | Socket.io, group = Socket.io room | Proven in dungeon_arena. Low latency, reconnection handling, room-based messaging. |
| 12 | Frontend | Vite + React + TypeScript + Zustand + Tailwind + Radix (selective) | Established ecosystem, type-safe, PWA-ready, Capacitor-compatible. |
| 13 | Backend | Express + ts-rest + Drizzle + Zod + PostgreSQL + Socket.io | Contract-first API, end-to-end type safety, SQL-authoritative persistence. |
| 14 | Deployment | Local machine + Cloudflare Tunnel | No port forwarding, free SSL, simple setup with `cloudflared`. |
| 15 | Package manager | pnpm monorepo with workspaces | Fast, strict deps, native workspace support. `/packages/server`, `/packages/client`, `/packages/shared`. |
| 16 | Frontend routing | React Router v6, nested with layout | Clean URLs, deep linking, shared group header with tabs. |
| 17 | Timezone | UTC storage (`TIMESTAMPTZ`) + client-side conversion | Standard approach. Each user sees dates in their local timezone. |
| 18 | Expense details | Description + optional receipt upload + categories | Receipt: `sharp` compression (1200px longest side, WebP, 80%). Categories: DB-stored with emoji icons, admin-manageable. |
| 19 | Testing | Unit + integration tests | Unit tests for balancing algorithm and currency conversion. Integration tests for API routes via Supertest. |
| 20 | Group permissions | Creator is admin (role enum: admin/member) | Admin can delete group, kick members, change settings. Members can add expenses, settle, invite. |
| 21 | Expense editing | Creator-only edits | Person who added the expense is responsible for fixing it. |
| 22 | Currency rounding | Remainder to payer | Industry standard. Lost cent goes to the person who paid the full amount. |
| 23 | API versioning | Versioned from day one (`/v1/`) | Proper structure upfront. All routes prefixed `/v1/`. |
| 24 | Notifications | In-app toast notifications via Socket.io | Subtle awareness for connected users. No OS-level push. |
| 25 | PostgreSQL | Existing local PostgreSQL instance | New database, no extra container. |

## Edge Cases Handled

- **Settlement then new expense:** Open ledger — balances shift naturally, no confusion. UI shows current net balance prominently.
- **Rounding errors:** Remainder assigned to payer. Sum of rounded shares always equals total.
- **Multi-currency rate drift:** Rate locked at expense creation. Future rate changes don't affect recorded expenses.
- **Same email, multiple auth methods:** `auth_providers` table handles linking email + OAuth to same user.
- **Empty group invite link:** The group's `invite_code` is a PERMANENT, shareable group link (a convenience for inviting/joining) — NOT a single-use token. Joining does NOT rotate/invalidate the code, so an emailed or shared invite link works repeatedly for any number of people. Duplicate joins are blocked by the membership check. (Corrected 2026-07-10: earlier plan said single-use; changed per user decision that invites are just a convenience to share the group link.)
- **Percent split not summing to 100%:** Client-side validation blocks submission. Server-side Zod validation also enforces sum = 100.
- **Shares mode with zero total shares:** Validation rejects — at least one share must be assigned.
- **Currency not supported by Frankfurter:** User must manually enter the converted amount.
- **Concurrent expense edits:** Last-write-wins (simple). For a friends app, conflicts are rare.
- **Receipt upload failure:** Graceful fallback — expense is saved without receipt. Upload is optional.
- **Category deleted but expenses reference it:** Soft delete on categories. Expired references show a fallback icon/name.

## Database Schema

```
users
  id (UUID, PK)
  email (varchar, unique, not null)
  password_hash (varchar, not null)
  name (varchar, not null)
  created_at (timestamptz, default now())
  updated_at (timestamptz, default now())

auth_providers (OAuth scaffolding)
  id (UUID, PK)
  user_id (UUID, FK -> users.id, not null)
  provider (varchar, not null) -- 'google'
  provider_user_id (varchar, not null)
  created_at (timestamptz, default now())
  UNIQUE(provider, provider_user_id)

sessions
  id (UUID, PK)
  user_id (UUID, FK -> users.id, not null)
  token (varchar, not null) -- SHA-256 hash of plaintext token
  expires_at (timestamptz, not null)
  created_at (timestamptz, default now())

groups
  id (UUID, PK)
  name (varchar, not null)
  currency (varchar(3), not null) -- ISO 4217 master currency
  invite_code (varchar, unique, not null) -- random string for /join/:code
  created_by (UUID, FK -> users.id, not null)
  created_at (timestamptz, default now())
  updated_at (timestamptz, default now())

group_members
  id (UUID, PK)
  group_id (UUID, FK -> groups.id, ON DELETE CASCADE, not null)
  user_id (UUID, FK -> users.id, ON DELETE CASCADE, not null)
  role (varchar, default 'member') -- 'admin' | 'member'
  joined_at (timestamptz, default now())
  UNIQUE(group_id, user_id)

categories
  id (UUID, PK)
  name (varchar, not null)
  icon (varchar, not null) -- emoji
  color (varchar, null) -- hex color for UI badges
  is_active (boolean, default true)
  created_at (timestamptz, default now())

expenses
  id (UUID, PK)
  group_id (UUID, FK -> groups.id, ON DELETE CASCADE, not null)
  description (varchar, not null)
  amount (numeric(12,2), not null) -- amount in original currency
  currency (varchar(3), not null) -- ISO 4217 original currency
  exchange_rate (numeric(10,6), null) -- null if same as group currency
  amount_master (numeric(12,2), not null) -- amount converted to group master currency
  paid_by (UUID, FK -> users.id, not null)
  added_by (UUID, FK -> users.id, not null) -- who created the expense record
  category_id (UUID, FK -> categories.id, null)
  expense_date (date, not null, default current_date)
  receipt_path (varchar, null) -- path to compressed receipt image
  created_at (timestamptz, default now())
  updated_at (timestamptz, default now())

expense_splits
  id (UUID, PK)
  expense_id (UUID, FK -> expenses.id, ON DELETE CASCADE, not null)
  user_id (UUID, FK -> users.id, not null)
  split_mode (varchar, not null) -- 'equal' | 'percent' | 'shares'
  value (numeric(10,4), null) -- NULL for equal, 0-100 for percent, positive int for shares
  UNIQUE(expense_id, user_id)

settlements
  id (UUID, PK)
  group_id (UUID, FK -> groups.id, ON DELETE CASCADE, not null)
  from_user_id (UUID, FK -> users.id, not null) -- who paid
  to_user_id (UUID, FK -> users.id, not null) -- who received
  amount (numeric(12,2), not null) -- in group master currency
  description (varchar, null)
  created_by (UUID, FK -> users.id, not null)
  created_at (timestamptz, default now())
```

## Pre-seeded Categories

| Name | Icon | Color |
|------|------|-------|
| Food & Drink | 🍔 | #FF6B6B |
| Transport | 🚗 | #4ECDC4 |
| Lodging | 🏨 | #45B7D1 |
| Activities | 🎭 | #96CEB4 |
| Shopping | 🛍️ | #FFEAA7 |
| Miscellaneous | 📦 | #DDA0DD |

## Implementation Phases

### Phase 1: Monorepo Scaffolding & Database
**Packages:**
- `/packages/shared` — ts-rest contract, shared types, Zod schemas
- `/packages/server` — Express + Drizzle + Socket.io
- `/packages/client` — Vite + React + TypeScript + Zustand + Tailwind

**Changes:**
- Initialize pnpm monorepo with workspaces
- Create Drizzle schema in `/packages/server/src/db/schema.ts`
- Run migrations to create all tables
- Seed categories table
- Set up ts-rest contract in `/packages/shared/src/contract.ts`
- Configure tsconfig paths for cross-package imports

**Verification:** `drizzle-kit push` creates tables. `npx tsc --noEmit` passes.

### Phase 2: Auth & Sessions
**Files:**
- `/packages/server/src/routes/api/auth.ts` — login, register, logout
- `/packages/server/src/middleware/session.ts` — session creation, validation, cookie handling (same pattern as dungeon_arena)
- `/packages/server/src/routes/api/auth-oauth.ts` — OAuth scaffolding (Google routes, disabled until credentials configured)
- `/packages/client/src/components/auth.tsx` — Login/Register forms
- `/packages/client/src/store/auth.ts` — Zustand auth store

**Changes:**
- bcrypt password hashing
- Session table CRUD (create, validate, refresh, delete)
- httpOnly cookie management
- OAuth routes that return "not configured" until Google credentials are set
- Frontend auth forms with Zod validation

**Verification:** Register → login → session persists → logout clears session.

### Phase 3: Groups & Members
**Files:**
- `/packages/server/src/routes/api/groups.ts` — CRUD for groups, invite links, member management
- `/packages/server/src/routes/api/join.ts` — Handle `/join/:code` flow
- `/packages/client/src/components/groups.tsx` — Group list, create group, invite link display
- `/packages/client/src/store/groups.ts` — Zustand groups store

**Changes:**
- Create group (generates invite code, sets creator as admin)
- Join group via invite link (single-use)
- List groups for current user
- Kick member (admin only)
- Delete group (admin only)
- Change group name/currency (admin only)

**Verification:** Create group → copy invite link → join as second user → both see group.

### Phase 4: Expenses & Splits
**Files:**
- `/packages/server/src/routes/api/expenses.ts` — Expense CRUD with split modes
- `/packages/server/src/services/currency.ts` — Frankfurter integration, rate locking, rounding
- `/packages/server/src/services/uploads.ts` — Receipt upload with sharp compression
- `/packages/client/src/components/expenses.tsx` — Expense form with three split modes
- `/packages/client/src/store/expenses.ts` — Zustand expenses store

**Changes:**
- Add expense with description, amount, currency, category, optional receipt
- Three split mode UIs: checkboxes (equal), % inputs (percent), integer inputs (shares)
- Server-side validation: percent sums to 100, shares > 0
- Currency conversion via Frankfurter, rate locked on creation
- Receipt upload → sharp compression (1200px longest side, WebP, 80%) → save to disk
- Remainder-to-payer rounding logic

**Verification:** Add expense in different currency → rate fetched and locked → splits calculated correctly → rounding handled.

### Phase 5: Settlements & Balances
**Files:**
- `/packages/server/src/routes/api/settlements.ts` — Settlement CRUD
- `/packages/server/src/routes/api/balances.ts` — Balance calculation + greedy optimization
- `/packages/server/src/services/balances.ts` — Core balancing algorithm
- `/packages/client/src/components/balances.tsx` — Balance display with optimize toggle
- `/packages/client/src/store/balances.ts` — Zustand balances store

**Changes:**
- Record settlement (from_user, to_user, amount in master currency)
- Calculate net balances: `sum(expense_splits) - sum(settlements_made) + sum(settlements_received)`
- Simple mode: show raw per-expense debts
- Optimized mode: greedy algorithm to minimize transactions
- Toggle between modes in UI

**Verification:** Add expenses → check balances → settle → balances update → add new expense → balances shift correctly.

### Phase 6: Real-time & Notifications
**Files:**
- `/packages/server/src/sockets/index.ts` — Socket.io setup, room management
- `/packages/server/src/sockets/handlers.ts` — Event handlers for expense/settlement changes
- `/packages/client/src/sockets/index.ts` — Socket.io client, event listeners
- `/packages/client/src/components/toast.tsx` — Toast notification component
- `/packages/client/src/components/providers.tsx` — Socket provider wrapping app

**Changes:**
- On connect: join rooms for all user's groups
- On expense add/edit/delete: emit to group room
- On settlement: emit to group room
- Client receives events → updates Zustand store → shows toast
- Auto-recalculate balances on changes

**Verification:** Open two browser windows → add expense in one → appears in other with toast.

### Phase 7: Frontend Polish & PWA
**Files:**
- `/packages/client/src/App.tsx` — React Router setup with nested routes
- `/packages/client/src/layouts/group.tsx` — Group layout with header and tabs
- `/packages/client/src/pages/*` — Group list, group detail, expenses, balances, members
- `/packages/client/public/manifest.json` — PWA manifest
- `/packages/client/public/sw.js` — Service worker (basic caching)

**Changes:**
- Nested routing: `/groups`, `/groups/:id` (layout), `/groups/:id/expenses`, `/groups/:id/balances`, `/groups/:id/members`
- Group layout: header with group name, tabs for navigation
- Responsive design (mobile-first with Tailwind)
- PWA manifest + service worker for "Add to Home Screen"
- Radix components for modals, dropdowns, tooltips

**Verification:** Navigate between routes → browser back/forward works → deep link to specific group → PWA installable.

### Phase 8: Admin & Categories
**Files:**
- `/packages/server/src/routes/api/categories.ts` — Category CRUD
- `/packages/client/src/components/categories-admin.tsx` — Category management UI

**Changes:**
- Admin can add/edit/delete categories (name, emoji, color)
- Soft delete (is_active flag)
- Categories dropdown in expense form reads from DB dynamically

**Verification:** Add new category → appears in expense form dropdown → delete category → existing expenses show fallback.

### Phase 9: Cloudflare Tunnel & Deployment
**Files:**
- `/packages/server/src/server.ts` — Production server setup
- `docker-compose.yml` (optional, for local dev)
- `ecosystem.config.js` — PM2 config
- `deploy.sh` — Deployment script with cloudflared setup

**Changes:**
- PM2 process management
- Nginx reverse proxy config (optional, can use cloudflared directly)
- Cloudflare Tunnel setup script
- Environment variable documentation

**Verification:** App accessible via Cloudflare Tunnel URL from external device.

### Phase 10: Tests
**Files:**
- `/packages/server/tests/unit/balances.test.ts` — Balancing algorithm tests
- `/packages/server/tests/unit/currency.test.ts` — Currency conversion and rounding tests
- `/packages/server/tests/integration/auth.test.ts` — Auth flow tests
- `/packages/server/tests/integration/groups.test.ts` — Group CRUD tests
- `/packages/server/tests/integration/expenses.test.ts` — Expense CRUD tests
- `/packages/server/tests/integration/settlements.test.ts` — Settlement tests

**Changes:**
- Unit tests for greedy algorithm (edge cases: zero balances, single user, all positive/negative)
- Unit tests for currency rounding (remainder to payer)
- Integration tests with Supertest + test database
- Test categories: happy path, validation errors, auth guards, permission checks

**Verification:** `pnpm test` passes. Coverage report generated.

## Database Migrations

1. `001_create_users.sql` — Users table with email, password_hash, name
2. `002_create_auth_providers.sql` — OAuth scaffolding table
3. `003_create_sessions.sql` — Sessions table with token hash and expiry
4. `004_create_groups.sql` — Groups table with invite_code and master currency
5. `005_create_group_members.sql` — Group membership with roles
6. `006_create_categories.sql` — Categories with emoji icons + seed data
7. `007_create_expenses.sql` — Expenses with multi-currency support
8. `008_create_expense_splits.sql` — Expense splits with three modes
9. `009_create_settlements.sql` — Settlements table
10. `010_create_indexes.sql` — Performance indexes on foreign keys and query patterns

## Integration Tests

- **Auth flow:** Register → login → session persists → logout → session cleared
- **OAuth scaffolding:** Google route returns "not configured" without credentials
- **Group lifecycle:** Create → invite → join → kick → delete
- **Expense CRUD:** Add with all three split modes → edit (creator only) → delete
- **Multi-currency:** Add expense in different currency → rate locked → balance correct
- **Settlements:** Record settlement → balance decreases → new expense shifts balance
- **Balancing:** Simple mode shows raw debts → optimized mode shows minimized transactions
- **Real-time:** Expense added in one tab → appears in another with toast
- **Receipt upload:** Upload image → compressed → served correctly
- **Categories:** Add/edit/delete → reflected in expense form
- **Permissions:** Non-admin cannot kick/delete group. Non-creator cannot edit expense.

## Manual Verification Checklist

- [ ] Register new user → login → session persists across page reload
- [ ] Create group → copy invite link → join as second user
- [ ] Add expense with equal split → verify balances
- [ ] Add expense with percent split (must sum to 100%) → verify balances
- [ ] Add expense with shares split → verify balances
- [ ] Add expense in different currency → verify rate locked and master amount correct
- [ ] Upload receipt photo → verify compressed image saved and displayed
- [ ] Select category with emoji → verify displayed in expense list
- [ ] Record settlement → verify balance decreases
- [ ] Add new expense after settlement → verify balance shifts
- [ ] Toggle optimize mode → verify greedy algorithm minimizes transactions
- [ ] Open two browser tabs → add expense in one → verify real-time update + toast in other
- [ ] Admin kicks member → verify member removed
- [ ] Non-creator tries to edit expense → verify blocked
- [ ] PWA: "Add to Home Screen" available → app launches full-screen
- [ ] Cloudflare Tunnel: app accessible from external device

## Out of Scope

- Email invitations (deferred to Phase 2)
- Email notifications (deferred)
- Browser push notifications (deferred)
- Google OAuth activation (scaffolding only, credentials not configured)
- Playwright E2E tests (can be added later)
- Multiplayer real-time editing (last-write-wins)
- Expense approval workflows
- Recurring expenses
- Expense categories with subcategories
- Export to CSV/PDF
- Dark/light theme toggle (can be added later)
- Mobile app (Capacitor wrapper — PWA is the MVP target)
