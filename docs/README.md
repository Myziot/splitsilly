# Docs Index — Split Silly

**Where things live:**

| Dir | Holds | Rule |
|-----|-------|------|
| `docs/active_plans/` | Blueprints for work **not yet shipped or not yet verified** | A plan gets a `**Status:**` header; when it ships, stamp the verified status and move it to `docs/archived/` |
| `docs/archived/`     | Shipped plans, closed grill-ledgers, superseded designs, past audits | Every file carries an `ARCHIVED` banner with its verified final status. **Non-authoritative history** — code + README + PROJECT_CONTEXT win on conflict |
| root `*.md`           | Canonical references only: README, PROJECT_CONTEXT, FILE_STRUCTURE | Keep lean; long-form design docs belong in `docs/` |

**Currently in flight:** `active_plans/feature-invite-vs-add-member.md` (three-state seats —
COMPLETE 2026-09-30, commit 77fc804; kept as the most recent reference).

**Grill-ledgers:** a ledger is the decision log of its feature plan. When the feature ships,
the ledger closes and archives alongside the plan (see the three closed ledgers in `archived/`).

Last consolidation pass: **2026-09-30** — 20 docs moved to `archived/` with verified status
banners; statuses re-derived from code, not from doc headers.
