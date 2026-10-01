> **ARCHIVED (2026-09-30)** — docs consolidation pass; moved out of the active plans list.
**Status:** IMPLEMENTED — RateFootnote.tsx + lib/rates.ts rendered on Login/Register/Groups/GroupDetail/JoinGroup.

# Rate Footnote ("live rates" authority line) — Grilled Implementation Plan

**Generated:** 2026-07-11
**Status:** READY FOR IMPLEMENTATION
**Target Objective:** Add a quiet muted footnote at the bottom of every page showing
today's exchange rates (as-of date) for a fixed basket of currencies, always including
USD-PLN (Polish owner), to give the app a "live / authoritative" feel.

---

## Architectural Decisions

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | Currency basket | Fixed: EUR, GBP, JPY, CHF, CAD, PLN + USD (always) + group currency if not already in set | Predictable, calm, guarantees USD-PLN requirement. |
| 2 | Footer placement | Non-sticky muted line at bottom of each page's content (scrolls away) | Just authority flavor, not a persistent HUD. |
| 3 | Data source | Browser fetches Frankfurter directly via `src/lib/rates.ts`; no backend endpoint | CORS is `*`; cosmetic feature, avoids server rebuild. |
| 4 | Always include USD-PLN | Footer always fetches with `base=USD`; PLN always rendered | Owner is Polish; explicit requirement. |
| 5 | Domain fix (separate) | Update `currency.ts` EXCHANGE_RATE_API_URL default + .env from `.app` to `api.frankfurter.dev/v1` | `.app` now 301-redirects; real expense conversions must not rely on silent redirects. |

## Edge Cases Handled

- Frankfurter fetch fails / rate-limited -> footnote shows muted "rates unavailable" + last-known date, never crashes the page.
- Group currency equals one of the basket (e.g. EUR or PLN or USD) -> de-dupe so it is not shown twice.
- Group currency set late (GroupDetail loads async) -> footnote reads `currentGroup?.currency` reactively; renders once currency known.
- Login/Register have no group -> base basket only (USD + EUR/GBP/JPY/CHF/CAD/PLN), USD default.
- Date format -> show ECB "as of" date (field `date` in response) as YYYY-MM-DD, labeled "rates as of".

## Implementation Phases

### Phase 1: Rate helper (client lib)
**Files:** `packages/client/src/lib/rates.ts` (NEW)
**Changes:**
- Export `RATE_BASKET = ['EUR','GBP','JPY','CHF','CAD','PLN']` constant.
- Export `fetchUsdRates(): Promise<{ date: string; rates: Record<string, number> }>` that GETs
  `https://api.frankfurter.dev/v1/latest?from=USD`, returns `{ date, rates }`.
- Export `buildFootnoteCurrencies(groupCurrency?: string): string[]` -> `['USD', ...RATE_BASKET, groupCurrency]`
  filtered to unique, uppercase, 3-letter codes.
- Handle fetch error -> throw a tagged error so caller can show "unavailable".

### Phase 2: Reusable footline component
**Files:** `packages/client/src/components/RateFootnote.tsx` (NEW)
**Changes:**
- Props: `base?: string` (default `'USD'`), `groupCurrency?: string`.
- On mount + when `groupCurrency` changes: call `fetchUsdRates()`, store `{date, rates}`.
- When base === 'USD': render `1 USD = X.XX EUR · ... · 3.9x PLN` + `· rates as of {date}`.
- If groupCurrency provided and not USD: also append `1 {groupCurrency} = {usdRate} USD`? Keep simple:
  show basket as `1 USD = ...` then a separate line `1 {groupCurrency} = {1/usdToGroup} USD` only if groupCurrency !== 'USD'.
- Muted styling: `text-xs text-gray-400 text-center py-3`.
- On error: `text-xs text-gray-400 text-center py-3` -> "Live rates temporarily unavailable".
- Memoize fetch so it runs once per mount, not per render.

### Phase 3: Mount on every page
**Files:** `packages/client/src/pages/Login.tsx`, `Register.tsx`, `Groups.tsx`, `GroupDetail.tsx`, `JoinGroup.tsx`
**Changes:**
- Import `<RateFootnote>`; render at end of each page's root container (after main content, before close).
- Login/Register: `<RateFootnote />` (no groupCurrency).
- Groups: `<RateFootnote />` (no current group necessarily selected) — or use first group's currency; keep `base=USD` default for simplicity.
- GroupDetail: `<RateFootnote groupCurrency={currentGroup?.currency} />`.
- JoinGroup: `<RateFootnote />` (no group context yet).

### Phase 4: Fix currency.ts domain (real-feature correctness)
**Files:** `packages/server/src/services/currency.ts` line 1; `packages/server/.env` line 17
**Changes:**
- currency.ts default: `process.env.EXCHANGE_RATE_API_URL || 'https://api.frankfurter.dev/v1'`.
- Note: new `/v1` path uses `?from=X&to=Y` still; verify `data.rates[to]` shape unchanged (it is: `{"amount":1,"base":"USD","date":"...","rates":{...}}`).
- .env: set `EXCHANGE_RATE_API_URL=https://api.frankfurter.dev/v1`.

## Integration / Verification

- Client build must pass: `cd packages/client && npx tsc --noEmit && npx vite build` (this is the reliable check per project notes; server tsc is known-phony).
- Manual: open app on phone over LAN (`home-port.local`), scroll each page bottom, confirm footnote shows
  `1 USD = ... PLN ... · rates as of 2026-07-10`. Confirm PLN always present. Confirm GroupDetail reflects group currency.
- Kill network / block api.frankfurter.dev -> footnote shows "unavailable" gracefully, page still works.

## Manual Verification Checklist

- [ ] Login page bottom shows muted USD basket incl. PLN.
- [ ] Register page bottom shows same.
- [ ] Groups page bottom shows same.
- [ ] GroupDetail bottom shows group currency + PLN.
- [ ] Join page bottom shows same as login.
- [ ] No duplicate currency when group currency is EUR/PLN/USD.
- [ ] Footer does NOT stick on scroll (scrolls away).
- [ ] "rates as of YYYY-MM-DD" date shown.
- [ ] Currency.ts + .env now use `api.frankfurter.dev/v1`; a test expense conversion still works.

## Out of Scope

- No server endpoint for rates (browser fetches directly).
- No caching layer / TTL (cosmetic, low traffic).
- No historical/per-expense-date rates in the footnote (that stays in expense rows as-is).
- No top-5 "by volume" dynamic computation.
