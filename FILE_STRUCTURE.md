# File Structure — Split Silly

Internal package name: `cost-sharing`. Regenerated from the actual repo tree (2026-11-07
docs-currency pass; counts verified with `wc -l` / `find`, not copied from older docs).

```
split_silly/
├── package.json                 # pnpm workspace root; dev/build/start/db/test scripts
├── pnpm-workspace.yaml          # workspace members: packages/*
├── pnpm-lock.yaml               # locked dependency graph
├── tsconfig.json                # base TS config (references)
├── .npmrc                       # pnpm settings (shamefully-hoist etc.)
├── .gitignore                   # ignores: node_modules, dist, all .env-style files (*.env included), temp scripts, client dev dumps
├── .env                         # (root, git-ignored) not used; server .env is the real one
├── README.md                    # quick start + stack table
├── PROJECT_CONTEXT.md           # design philosophy, conventions, gotchas
├── FILE_STRUCTURE.md            # this file
│
├── assets/                      # brand art (split_silly_white_*.png, etc.)
│
├── packages/
│   ├── shared/                  # ── shared code ──
│   │   └── src/
│   │       ├── contract.ts      # ts-rest API contract (NOT wired into routes; spec-only)
│   │       └── index.ts
│   │
│   ├── client/                  # ── React SPA (Vite + TS + Tailwind + Zustand) ──
│   │   ├── index.html           # Vite entry HTML (<title> branding, manifest link)
│   │   ├── package.json         # deps: react, zustand, radix-*, tailwind, vite
│   │   ├── vite.config.ts       # dev port 3000; build.outDir = ../server/dist/client
│   │   ├── tailwind.config.js / postcss.config.js / tsconfig.json
│   │   ├── scripts/             # prefill-proof.playwright.cjs (settlement-prefill live proof;
│   │   │                        #   args: <session-token> <group-id>, self-derived expectations)
│   │   ├── public/              # manifest.json (PWA name), favicon, nav_logo, split_silly_icon
│   │   └── src/
│   │       ├── main.tsx         # React root (BrowserRouter — NOT HashRouter)
│   │       ├── index.css        # Tailwind directives + base styles
│   │       ├── App.tsx          # Routes (auth-gated) + playground routes
│   │       ├── components/      # 20 components
│   │       │   ├── TopBar.tsx           # logo/bell/logout chrome; portrait two-row layout;
│   │       │   │                        #   NotificationBell deep-links via navigate() (BrowserRouter)
│   │       │   ├── MembersTab.tsx       # roster: active/added/invited badges, Promote, kick
│   │       │   ├── GroupActivityTab.tsx # Log tab: full event roster + category filter
│   │       │   ├── ExpenseFormModal.tsx # add/edit expense (edit = initialExpense prop),
│   │       │   │                        #   equalParticipants checkboxes, native date input
│   │       │   ├── ExpenseDetailView.tsx# expense expand + Edit/Delete actions
│   │       │   ├── GroupSettingsModal.tsx # currency, expense_edit setting
│   │       │   ├── InviteFormModal.tsx  # Add Member (placeholder) vs Send Invite
│   │       │   ├── InvitationCard.tsx   # pending-invitation disclosure card
│   │       │   ├── InviteLink.tsx       # shareable invite code UI
│   │       │   ├── SettleConfirmModal.tsx / SettlementFormModal.tsx / EditSettlementModal.tsx
│   │       │   ├── EqualParticipationPicker.tsx # joiner per-expense opt-in/out
│   │       │   ├── CurrencyBadge.tsx    # currency pill (icon/ticker); showSymbol prop
│   │       │   ├── DateBadge.tsx        # date pill
│   │       │   ├── DateWheelPicker.tsx  # custom wheel (kept for design playground only;
│   │       │   │                        #   native <input type=date> chosen for the form)
│   │       │   ├── PayerBadge.tsx       # "paid by" member badge
│   │       │   ├── RateFootnote.tsx     # live exchange-rate footline (Frankfurter credit)
│   │   │   ├── PaidCashSummary.tsx  # "Who paid cash" block + rounding-hero pennies
│   │   │   └── VerifyEmailBanner.tsx # soft-gate nag on authed pages + Resend link (flips off on verify)
│   │       ├── pages/           # 9 real pages + 11 playgrounds
│   │       │   ├── Login.tsx / Register.tsx     # honeypot field, rate-limited, ?invite= flow
│   │       │   ├── ResetPassword.tsx            # token reset (/reset)
│   │       │   ├── VerifyEmail.tsx          # emailed confirm landing (/verify?token= -> public POST /auth/verify)
│   │       │   ├── Groups.tsx           # group list / create + net pill
│   │       │   ├── JoinGroup.tsx        # join via invite code (/join/:inviteCode)
│   │       │   ├── GroupDetail.tsx      # (~1.2k lines after the Sep staged-split refactor):
│   │       │   │                        #   tabs expenses/balances/members/log, lock toggle,
│   │       │   │                        #   frozen-leg rows, group:changed live refresh
│   │       │   ├── AdminPanel.tsx       # operator back-office (/admin)
│   │       │   ├── About.tsx            # public about page
│   │       │   └── *Playground.tsx (11) # design mock pages (kept live by convention):
│   │       │       RateFootnote, PaidSummary, PaidSummaryD, PaidCashColor, PennyHero,
│   │       │       Balance, Topbar, LogFilter, Notifications, Invite, Design
│   │       ├── store/               # Zustand stores
│   │       │   ├── auth.ts / groups.ts / expenses.ts (incl. updateExpense) / balances.ts
│   │       │   ├── books.ts         # lock state (useLockPlanStore) + recalculate
│   │       │   ├── notifications.ts # notifications + unread count
│   │       │   └── activity.ts      # group activity feed + ACTIVITY_META (full event roster)
│   │       ├── lib/
│   │       │   ├── rates.ts         # Frankfurter fetch + basket builder + formatRate
│   │       │   └── socket.ts        # singleton socket.io client (cookie-auth handshake)
│   │       ├── types/group.ts       # shared client shapes (extracted from GroupDetail)
│   │       └── utils/
│   │           ├── format.ts        # date/number formatting helpers
│   │           ├── memberColor.ts   # stable golden-angle per-member color map
│   │           └── splits.ts        # share math mirroring server roundSharesToCents
│   │
│   └── server/                  # ── Express + Drizzle + Socket.io (:3002, systemd unit) ──
│       ├── package.json         # deps: express, drizzle-orm, pg, socket.io, bcryptjs, resend, sharp
│       ├── tsconfig.json
│       ├── drizzle.config.ts    # Drizzle Kit config (push NOT used — see PROJECT_CONTEXT)
│       ├── vitest.config.ts
│       ├── .gitignore           # ignores .env, node_modules, dist, uploads
│       ├── .env                 # (git-ignored) real config (RESEND_* keys)
│       ├── .env.example         # template: DATABASE_URL, SESSION_SECRET, RESEND_*, ...
│       ├── server.log           # runtime log (git-ignored; systemd journal is authoritative)
│       ├── scripts/             # backfill_activity.ts, e2e_activity_roster.ts (one-off ops)
│       ├── uploads/receipts/    # compressed receipt images (auth-gated /uploads mount)
│       ├── tests/unit/          # balances.test.ts + currency.test.ts (vitest)
│       └── src/
│           ├── server.ts        # mounts, CORS allowlist (hardcoded), auth gate, purge timers
│           ├── db/
│           │   ├── index.ts     # Drizzle client (pg Pool)
│   │   │   ├── schema.ts    # 19 tables, 7 enums (incl. member_status; rate_hits/auth_locks/
│   │   │   │                #   email_verification_tokens), indexes declared
│           │   ├── seed.ts      # seed categories
│           │   ├── migrate.ts   # manual SQL migration runner
│           │   └── migrations/  # 0001 books, 0002 lockplan repurpose, 0003 password reset,
│           │                    #   0004 index reconciliation, 0005 placeholder members,
│           │                    #   0006 member_status (three-state seats), 0007 email verification
│           ├── routes/
│           │   ├── auth.ts      # register/login/logout/me/verify + lockout + admin back-office
│           │   ├── groups.ts    # CRUD, settings, members (kick cascade), invite
│           │   ├── invitations.ts # placeholder add, promote, pending inbox, accept/merge
│           │   ├── join.ts      # join via invite code/info + equal-participation
│           │   ├── expenses.ts  # expenses CRUD + receipt upload + flags + edit-permission gate
│           │   ├── categories.ts# category list/create
│           │   ├── balances.ts  # balances + optimize
│           │   ├── books.ts     # lock/unlock/recalculate (frozen plan)
│           │   ├── settlements.ts # create/reset/delete/update + reminders + plan striking
│           │   └── notifications.ts # notifications + getActivity (log feed)
│           ├── services/
│           │   ├── balances.ts  # THE MONEY ENGINE: roundSharesToCents + calculateBalances + optimizeBalances
│           │   ├── books.ts     # freezePlan/strikePlan/unstrikePlan/recalculatePlan + divergence (Model Z)
│           │   ├── members.ts   # ghost merge/lookup/purge helpers (placeholder/invite flow)
│           │   ├── currency.ts  # Frankfurter fetch (EXCHANGE_RATE_API_URL)
│           │   ├── rounding.ts  # money rounding helpers
│           │   ├── email.ts     # Resend transactional email (invites, reminders, resets)
│           │   ├── emailLog.ts  # email send log + reminder rate-limit helper
│           │   ├── emailVerification.ts # one-click verify tokens + nag-link builder (soft gate)
│           │   ├── password.ts / passwordReset.ts  # bcrypt + one-time reset tokens
│           │   ├── upload.ts    # sharp compress → /uploads/receipts/<hash>.webp
│           │   └── housekeeping.ts  # purge expired sessions + old read notifications (timers in server.ts)
│           ├── middleware/
│           │   ├── session.ts   # cookie session auth (cost_sharing_session)
│           │   ├── admin.ts     # requireAdmin (admin session OR ADMIN_API_KEY)
│           │   ├── honeypot.ts  # anti-bot honeypot field
│           │   └── ratelimit.ts # login/register IP limits + per-account lockout
│           └── sockets/
│               └── index.ts     # Socket.io: cookie-auth handshake, group:<id> rooms,
│                                #   broadcastGroupChanged (every mutating route calls it)
│
└── docs/
    ├── README.md                # docs index + filing convention
    ├── active_plans/            # IN-FLIGHT blueprints only (empty — all shipped work archived)
    └── archived/                # 23 shipped/superseded plans + closed grill-ledgers + the
                                 #   2026-09-23 audit report — each carries an ARCHIVED banner
                                 #   with its verified final status. Non-authoritative history.
```

## Notes

- **Playground pages** (`*Playground.tsx`, 11) are intentional, kept live per project
  convention — do not delete them.
- **Stray one-off scripts** (`add_drinks_cat.ts`, `check_cat.ts`, `_mk.ts`,
  `test_*.ts` in `packages/server/`) are git-ignored and not part of the app.
- **`.env` is never committed** (root + server `.gitignore`); `.env.example` is the template.
- Server runs via `tsx` under systemd (`systemctl --user split_silly.service`);
  `pnpm build` outputs the client bundle into `packages/server/dist/client`, served at
  **:3002** alongside the API (single dedicated port; vite dev port 3000 is transient only).
- **Docs convention:** `docs/active_plans/` holds only blueprints not yet shipped/verified.
  Shipped plans, closed grill-ledgers, and superseded designs move to `docs/archived/`
  with a status banner (see `docs/README.md`).
