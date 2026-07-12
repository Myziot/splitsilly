# Project Context — Split Silly

Internal package name: `cost-sharing` (pnpm workspace). Product brand: **Split Silly**.

This document captures the design philosophy, conventions, and hard-won lessons
that aren't obvious from the code. It is the "why", not the "what".

## Product

A group expense-splitting app. One group = one shared pot of expenses in a single
**master currency**. Members add expenses (any currency), the app converts them to
the master currency, computes who owes whom, and lets members record settlements.

Expense types adapt the UI copy: `trip` / `household` / `event` / `project`
(`groupExpenseLabel` in the client).

## Design philosophy

- **Pressure-test before building.** Non-trivial UI gets a `/X-playground` mock page
  with ~4 labeled variants (A/B/C/D) the owner clicks through and picks from, then a
  blueprint is written to `docs/active_plans/` before implementation. Playgrounds are
  kept live after a choice for future recall.
- **Keep it simple / low-friction.** The owner consults friends on product calls and
  prefers native, simple controls (e.g. picked `<input type="date">` over a custom
  wheel). Implement the current ask, pivot fast — UI choices reverse often mid-task.
- **Verify against live state, not files.** Confirm behavior against the running app
  and the real database. Audit findings belong in the `neonlin` DB, not just chat.
- **Non-destructive by default.** Test new code before removing legacy. Ask before
  irreversible deletions (untracked dirs, tracked-file removes).

## Conventions

### Currency & exchange

- Master currency = the group's `currency`. Every expense stores both the original
  `amount`/`currency` and `amount_master` (converted) + `exchange_rate`.
- Rates come from **Frankfurter** (`https://api.frankfurter.dev/v1`, ECB data).
  The old `api.frankfurter.app` domain 301-redirects and was replaced.
- The client footline fetches rates directly from Frankfurter (CORS `*`) — no new
  server endpoint. `lib/rates.ts` builds a fixed basket:
  `EUR, GBP, JPY, CHF, CAD, PLN` + always USD + the group's own currency (de-duped).
- Icon rule: `EUR/GBP/JPY` show a flag icon; `CHF/CAD/PLN` (and unknown group
  currencies) render ticker-only. Centralized in `CurrencyBadge` (`showSymbol` prop).

### Visual system

- Tailwind. Monospace (`font-mono`, ui-monospace stack) is used for the rate footline
  and the "Who paid cash" amounts to match the terminal/Hermes aesthetic.
- `memberColor` (`utils/memberColor.ts`) assigns a stable per-member color as a pure
  function of sorted member IDs (golden-angle hue spread) — colors never shift between
  renders or API orderings.
- Avatars/payers use `PayerBadge`; currency pills use `CurrencyBadge`.

### State

- Client state: Zustand stores per domain (`auth`, `groups`, `expenses`, `balances`,
  `notifications`, `activity`).
- Server state: Express + Drizzle; sessions via cookie (`middleware/session.ts`).

### Activity log

- Group-wide, transparent feed in `group_activity`. Written by
  `logGroupActivity()` (fire-and-forget, errors swallowed so logging never breaks the
  primary op). Client renders it in the **log** tab using `ACTIVITY_META` + a
  per-action summary branch in `GroupDetail.tsx`.
- Actions: `member_joined`, `expense_created/updated/deleted`, `settlement_recorded`,
  `reset_settlements`.

## Known gotchas

- **Server `tsc` is unreliable here.** The installed LSP/drizzle types emit phony
  errors (mysql2/getSQL noise, MapIterator/downlevelIteration). Trust the **client**
  `tsc --noEmit` + `vite build` for verification; the server is run via `tsx` which
  transpiles without full type-checking.
- **CORS**: a browser "Network error" that `curl` reaches fine usually means CORS —
  check `CORS_ORIGINS` includes the host you browse from.
- **GroupDetail line ~586**: a pre-existing `'log'` tab type error in the balances
  `changeTab` union (the tab list includes `'log'` but `changeTab` doesn't accept it).
  esbuild ignores it; it is latent, not introduced by recent work.

## Security notes

- `.env` is git-ignored (root + `packages/server/.gitignore`). Never commit secrets.
- Auth has a honeypot + rate limiting on login/register (`middleware/`).
- Settlement reset is admin-only and logs to the activity feed.

## Repo layout (summary)

```
packages/client   React SPA (Vite)
packages/server   Express + Drizzle API + Socket.io
docs/             Design blueprints (active_plans/) + implementation notes
```

See [`FILE_STRUCTURE.md`](./FILE_STRUCTURE.md) for the full file tree.
