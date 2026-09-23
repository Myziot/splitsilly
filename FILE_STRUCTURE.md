# File Structure — Split Silly

Internal package name: `cost-sharing`. Regenerated from the actual repo tree (2026-09-23).

```
split_silly/
├── package.json                 # pnpm workspace root; dev/build/start/db/test scripts
├── pnpm-workspace.yaml          # workspace members: packages/*
├── pnpm-lock.yaml               # locked dependency graph
├── tsconfig.json                # base TS config (references)
├── .npmrc                       # pnpm settings (shamefully-hoist etc.)
├── .gitignore                   # ignores: node_modules, dist, .env(.*) except .env.example, temp scripts
├── .env                         # (root, git-ignored) not used; server .env is the real one
├── README.md                    # quick start + stack table
├── PROJECT_CONTEXT.md           # design philosophy, conventions, gotchas
├── FILE_STRUCTURE.md            # this file
├── AUDIT_FINDINGS.md            # 2026-09-23 full audit report (+ review corrections)
├── assets/                      # brand art (split_silly_white_*.png, etc.)
│
├── packages/
│   ├── shared/                  # ── shared code ──
│   │   └── src/
│   │       ├── contract.ts      # ts-rest API contract (NOT wired into routes; spec-only)
│   │       └── index.ts
│   │
│   ├── client/                  # ── React SPA (Vite + TS + Tailwind + Zustand) ──
│   │   ├── index.html           # Vite entry HTML (<title> branding)
│   │   ├── package.json         # deps: react, zustand, radix-*, tailwind, vite
│   │   ├── vite.config.ts       # build.outDir = ../server/dist/client
│   │   ├── tailwind.config.js / postcss.config.js / tsconfig.json
│   │   ├── public/manifest.json # PWA name/short_name
│   │   └── src/
│   │       ├── main.tsx         # React root (HashRouter)
│   │       ├── index.css        # Tailwind directives + base styles
│   │       ├── App.tsx          # Routes (auth-gated) + playground routes
│   │       ├── components/
│   │       │   ├── TopBar.tsx           # Back/logo/bell/logout chrome (portrait-responsive)
│   │       │   ├── InviteLink.tsx       # Shareable invite code UI
│   │       │   ├── CurrencyBadge.tsx    # Currency pill (icon/ticker); showSymbol prop
│   │       │   ├── DateBadge.tsx        # Date pill
│   │       │   ├── DateWheelPicker.tsx  # Custom date wheel (kept; native <input date> chosen)
│   │       │   ├── PayerBadge.tsx       # "paid by" member badge
│   │       │   ├── RateFootnote.tsx     # Live exchange-rate footline (Frankfurter credit)
│   │       │   └── PaidCashSummary.tsx  # "Who paid cash" block (both tabs)
│   │       ├── pages/
│   │       │   ├── Login.tsx / Register.tsx     # honeypot field, rate-limited
│   │       │   ├── ResetPassword.tsx            # token reset (/reset)
│   │       │   ├── Groups.tsx           # group list / create + net pill
│   │       │   ├── JoinGroup.tsx        # join via invite code
│   │       │   ├── GroupDetail.tsx      # THE BIG ONE (~2.3k lines): tabs expenses/balances/members/log,
│   │       │   │                        #   lock toggle, frozen-leg rows, equal-participation checkboxes
│   │       │   ├── AdminPanel.tsx       # operator back-office (/admin)
│   │       │   ├── About.tsx            # public about page
│   │       │   └── *Playground.tsx (9)  # design mock pages (kept live):
│   │       │       ├── RateFootnotePlayground, PaidSummaryPlayground,
│   │       │       ├── PaidSummaryDPlayground, PaidCashColorPlayground,
│   │       │       ├── BalancePlayground, TopbarPlayground,
│   │       │       ├── NotificationsPlayground, InvitePlayground, DesignPlayground
│   │       ├── store/               # Zustand stores
│   │       │   ├── auth.ts           # session login/logout/me
│   │       │   ├── groups.ts         # groups + members
│   │       │   ├── expenses.ts       # expenses list + CRUD
│   │       │   ├── balances.ts       # balances, settlements, optimize
│   │       │   ├── books.ts          # lock state (useLockPlanStore) + recalculate
│   │       │   ├── notifications.ts  # notifications + unread count
│   │       │   └── activity.ts       # group activity feed + ACTIVITY_META
│   │       ├── lib/
│   │       │   ├── rates.ts          # Frankfurter fetch + basket builder + formatRate
│   │       │   └── socket.ts         # singleton socket.io client (cookie-auth handshake)
│   │       └── utils/
│   │           ├── format.ts         # date/number formatting helpers
│   │           └── memberColor.ts    # stable golden-angle per-member color map
│   │
│   └── server/                  # ── Express + Drizzle + Socket.io (:3002, systemd unit) ──
│       ├── package.json         # deps: express, drizzle-orm, pg, socket.io, bcrypt, brevo-sharp
│       ├── tsconfig.json
│       ├── drizzle.config.ts    # Drizzle Kit config (push NOT used — see PROJECT_CONTEXT)
│       ├── vitest.config.ts
│       ├── .gitignore           # ignores .env, node_modules, dist, uploads
│       ├── .env                 # (git-ignored) real config
│       ├── .env.example         # template: DATABASE_URL, SESSION_SECRET, BREVO_*, ...
│       ├── server.log           # runtime log (git-ignored)
│       ├── uploads/receipts/    # compressed receipt images (auth-gated /uploads mount)
│       ├── tests/unit/          # balances.test.ts + currency.test.ts (19 tests, vitest)
│       └── src/
│           ├── server.ts        # mounts, CORS allowlist, auth gate, /uploads guard, purge timers
│           ├── db/
│           │   ├── index.ts     # Drizzle client (pg Pool)
│           │   ├── schema.ts    # 16 tables, 6 enums, all 19 indexes declared
│           │   ├── seed.ts      # Seed categories (incl. Drinks)
│           │   ├── migrate.ts   # manual SQL migration runner
│           │   └── migrations/  # 0001 books, 0002 lockplan repurpose,
│           │                    #   0003 password reset, 0004 index reconciliation
│           ├── routes/
│           │   ├── auth.ts      # register/login/logout/me + admin back-office handlers
│           │   ├── groups.ts    # CRUD, settings, members (kick cascade), invite
│           │   ├── join.ts      # join via invite code / info + equal-participation
│           │   ├── expenses.ts  # expenses CRUD + receipt upload + flags
│           │   ├── categories.ts# category list/create
│           │   ├── balances.ts  # balances + optimize
│           │   ├── books.ts     # lock/unlock/recalculate (frozen plan)
│           │   ├── settlements.ts # create/reset/delete/update + reminders + plan striking
│           │   └── notifications.ts # notifications + getActivity (log feed)
│           ├── services/
│           │   ├── balances.ts  # THE MONEY ENGINE: roundSharesToCents + calculateBalances + optimizeBalances
│           │   ├── books.ts     # freezePlan/strikePlan/unstrikePlan/recalculatePlan + divergence (Model Z)
│           │   ├── currency.ts  # Frankfurter fetch (EXCHANGE_RATE_API_URL)
│           │   ├── rounding.ts  # money rounding helpers (+ legacy re-exports)
│           │   ├── email.ts     # Brevo transactional email sending
│           │   ├── emailLog.ts  # email send log + reminder rate-limit helper
│           │   ├── password.ts  # bcrypt hash/verify
│           │   ├── passwordReset.ts # one-time reset tokens (operator flow)
│           │   ├── upload.ts    # sharp compress → /uploads/receipts/<hash>.webp
│           │   └── housekeeping.ts  # purge expired sessions + old read notifications
│           ├── middleware/
│           │   ├── session.ts   # cookie session auth (cost_sharing_session)
│           │   ├── admin.ts     # requireAdmin (admin session OR ADMIN_API_KEY)
│           │   ├── honeypot.ts  # anti-bot honeypot field
│           │   └── ratelimit.ts # login/register IP limits + account lockout
│           └── sockets/
│               └── index.ts     # Socket.io: cookie-auth handshake, group:<id> rooms, broadcastSettlement
│
└── docs/
    ├── NOTIFICATIONS_IMPLEMENTATION_NOTES.md
    └── active_plans/           # feature blueprints (grilled designs)
        ├── cost-sharing-impl-plan.md
        ├── feature-rate-footnote.md
        ├── feature-currency-badge.md
        ├── feature-expense-date-wheel.md
        ├── feature-expense-detail-and-invite.md
        ├── feature-expense-edit-permission.md
        ├── feature-edit-expense-splits.md
        ├── feature-equal-split-participation-checkboxes.md
        ├── feature-invite-ux-flow.md
        ├── feature-notifications-join-flow.md
        ├── feature-anti-bot-ddos-auth.md
        ├── feature-books-settlement-lock.md   # SUPERSEDED (see banner) — simplified lock shipped instead
        └── topbar-portrait-responsive.md
```

## Notes

- **Playground pages** (`*Playground.tsx`) are intentional, kept live per project
  convention — do not delete them.
- **Stray one-off scripts** (`add_drinks_cat.ts`, `check_cat.ts`, `_mk.ts`,
  `test_*.ts`) are git-ignored and not part of the app.
- **`.env` is never committed** (root + server `.gitignore`); `.env.example` is the template.
- Server is run via `tsx` under systemd (`systemctl --user split_silly.service`);
  `pnpm build` produces the client bundle into `packages/server/dist/client` for
  production serving (no separate client port).
