> **ARCHIVED (2026-09-30)** — docs consolidation pass; moved out of the active plans list.
**Status:** IMPLEMENTED — TopBar.tsx responsive two-row layout (Variant A).

# TopBar — Portrait Phone Responsive Layout

**Status:** approved, ready to implement
**Chosen design:** Variant A (two-row stacked) with group name + currency **centered** on row 2.
Confirmed live at `/topbar-playground`.

## Problem
On portrait phones the single 64px `h-16` header crowds 4 clusters into ~360px:
back + group name + currency pill + Share invite (left), centered logo, bell + user
block + logout (right). Everything fights for one row.

## Decision
- Desktop (`sm:` and up): **unchanged** — current single-row layout.
- Mobile (`< sm`): **stack into rows**.
  - Row 1: `← Back` (left) · logo (center) · 🔔 bell + Logout (right)
  - Row 2: group name + currency pill, **centered horizontally**
  - Row 3: full-width **Share invite** button
- User name/email block already `hidden sm:flex` — stays hidden on mobile.

## Implementation notes
- `TopBar.tsx` renders bell/logout/logo; group name + currency + Share invite arrive
  from `GroupDetail.tsx` as `children`. To let the meta row span full width and center
  independently, split the children slot:
  - Keep the single-row flex for `sm:` via responsive classes.
  - On mobile, relax fixed `h-16` (let it be `h-auto` / `min-h`) so rows stack.
  - The absolute-centered logo must remain pinned to **row 1 only** on mobile (anchor it
    to the top chrome row, not the whole nav) — otherwise it floats over the stacked rows.
- Cleanest approach: give `TopBar` an optional `meta`/`actions` structure OR have
  `GroupDetail` pass children that are already row-structured with responsive classes.
  Prefer keeping the API simple: children = the group-meta block; TopBar owns chrome.
- Pages other than GroupDetail (e.g. Groups.tsx) pass simple children ("Splitsilly"
  link) — must still render fine (single row, no empty second row).

## Verify
- Rebuild client (`pnpm build` in packages/client → outputs to server/dist/client, port 3002).
- Desktop: header visually identical to before.
- Mobile (≤360px): name+currency centered, Share invite full-width, no crowding, logo
  centered on top row only.
- Groups list page header still fine (no orphan rows).
