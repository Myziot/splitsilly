# Docs Index — Split Silly

**Where things live:**

| Dir | Holds | Rule |
|-----|-------|------|
| `docs/active_plans/` | Blueprints for work **not yet shipped or not yet verified** | A plan gets a `**Status:**` header; when it ships, stamp the verified status and move it to `docs/archived/` |
| `docs/archived/`     | Shipped plans, closed grill-ledgers, superseded designs, past audits | Every file carries an `ARCHIVED` banner with its verified final status. **Non-authoritative history** — code + README + PROJECT_CONTEXT win on conflict |
| root `*.md`           | Canonical references only: README, PROJECT_CONTEXT, FILE_STRUCTURE | Keep lean; long-form design docs belong in `docs/` |

**Currently in flight:** none — `active_plans/` is empty. All shipped blueprints (three-state
seats 77fc804, email verification + signup hardening 5715207) were archived on 2026-11-07.

**Grill-ledgers:** a ledger is the decision log of its feature plan. When the feature ships,
the ledger closes and archives alongside the plan (see the four closed ledgers in `archived/`).

Last consolidation pass: **2026-09-30**. Last currency pass: **2026-11-07** — shipped plans
(email verification + grill ledger, invite-vs-add-member) archived with banners; canonical docs
reconciled against commits c4552df..f15af71. Statuses re-derived from code, not doc headers.
