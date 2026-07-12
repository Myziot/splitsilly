# File Structure — Split Silly

Internal package name: `cost-sharing`. Generated from the actual repo tree.

```
split_silly/
├── package.json                 # pnpm workspace root; dev/build/start/db scripts
├── pnpm-workspace.yaml          # workspace members: packages/*
├── pnpm-lock.yaml               # locked dependency graph
├── tsconfig.json                # base TS config (references)
├── .npmrc                       # pnpm settings (shamefully-hoist etc.)
├── .gitignore                   # root ignores: node_modules, dist, .env, *.log, temp scripts
├── .env                         # (root, git-ignored) not used; server .env is the real one
├── README.md                    # this repo's README
├── PROJECT_CONTEXT.md           # design philosophy, conventions, gotchas
├── FILE_STRUCTURE.md            # this file
├── assets/                      # brand art (split_silly_white_*.png, etc.)
│
├── packages/
│   ├── client/                  # ── React SPA ──
│   │   ├── index.html           # Vite entry HTML
│   │   ├── package.json         # deps: react, zustand, radix-*, tailwind, vite
│   │   ├── vite.config.ts       # Vite + proxy to :3002 in dev
│   │   ├── tailwind.config.js   # Tailwind theme
│   │   ├── postcss.config.js
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.tsx         # React root + router
│   │       ├── index.css        # Tailwind directives + base styles
│   │       ├── App.tsx          # Routes (auth-gated) + playground routes
│   │       ├── components/
│   │       │   ├── TopBar.tsx           # Back/logo/bell/logout chrome
│   │       │   ├── InviteLink.tsx       # Shareable invite code UI
│   │       │   ├── CurrencyBadge.tsx    # Currency pill (icon/ticker); showSymbol prop
│   │       │   ├── DateBadge.tsx        # Date pill (badge methodology)
│   │       │   ├── DateWheelPicker.tsx  # Custom date wheel (used in some flows)
│   │       │   ├── PayerBadge.tsx       # "paid by" member badge
│   │       │   ├── RateFootnote.tsx     # Live exchange-rate footline (4-col ledger)
│   │       │   └── PaidCashSummary.tsx  # "Who paid cash" D3 block (both tabs)
│   │       ├── pages/
│   │       │   ├── Login.tsx / Register.tsx
│   │       │   ├── Groups.tsx           # group list / create
│   │       │   ├── JoinGroup.tsx        # join via invite code
│   │       │   ├── GroupDetail.tsx      # Tabs: expenses / balances / members / log
│   │       │   └── *Playground.tsx      # design mock pages (kept live):
│   │       │       ├── RateFootnotePlayground, PaidSummaryPlayground,
│   │       │       ├── PaidSummaryDPlayground, PaidCashColorPlayground,
│   │       │       ├── BalancePlayground, TopbarPlayground,
│   │       │       ├── NotificationsPlayground, InvitePlayground, DesignPlayground
│   │       ├── store/               # Zustand stores
│   │       │   ├── auth.ts           # session login/logout/me
│   │       │   ├── groups.ts         # groups + members
│   │       │   ├── expenses.ts       # expenses list + CRUD
│   │       │   ├── balances.ts       # balances, settlements, optimize
│   │       │   ├── notifications.ts  # notifications + unread count
│   │       │   └── activity.ts       # group activity feed + ACTIVITY_META
│   │       ├── lib/
│   │       │   └── rates.ts          # Frankfurter fetch + basket builder + formatRate
│   │       └── utils/
│   │           ├── format.ts         # date/number formatting helpers
│   │           └── memberColor.ts   # stable golden-angle per-member color map
│   │
│   └── server/                  # ── Express + Drizzle API ──
│       ├── package.json         # deps: express, drizzle-orm, pg, socket.io, bcrypt
│       ├── tsconfig.json
│       ├── drizzle.config.ts    # Drizzle Kit config (Postgres)
│       ├── vitest.config.ts
│       ├── .gitignore           # ignores .env, node_modules, dist, uploads
│       ├── .env                 # (git-ignored) DATABASE_URL, SESSION_SECRET,
│       │                         #   CORS_ORIGINS, RESEND_API_KEY, FRONTEND_BASE_URL,
│       │                         #   EXCHANGE_RATE_API_URL
│       ├── server.log           # runtime log (git-ignored)
│       └── src/
│           ├── server.ts        # Express app, middleware, route mounting, static SPA
│           ├── db/
│           │   ├── index.ts     # Drizzle client (pg)
│           │   ├── schema.ts    # Tables: users, groups, groupMembers, expenses,
│           │   │                 #   categories, settlements, notifications,
│           │   │                 #   groupActivity, expenseFlags, ...
│           │   └── seed.ts      # Seed categories (incl. Drinks)
│           ├── routes/
│           │   ├── auth.ts      # register/login/logout/me
│           │   ├── groups.ts    # CRUD, settings, members, invite
│           │   ├── join.ts      # join via invite code / info
│           │   ├── expenses.ts  # expenses CRUD + receipt upload + flags
│           │   ├── categories.ts# category list/create
│           │   ├── balances.ts  # balances + optimize
│           │   ├── settlements.ts # create/reset/delete/update + reminders
│           │   └── notifications.ts # notifications + getActivity (log feed)
│           ├── services/
│           │   ├── currency.ts  # Frankfurter fetch (EXCHANGE_RATE_API_URL)
│           │   ├── email.ts     # Resend email sending
│           │   ├── emailLog.ts  # email send log + rate-limit helper
│           │   ├── balances.ts  # balance/settlement computation
│           │   ├── password.ts  # bcrypt hash/verify
│           │   ├── upload.ts    # receipt upload handling
│           │   └── rounding.ts  # money rounding helpers
│           ├── middleware/
│           │   ├── session.ts   # cookie session auth
│           │   ├── honeypot.ts  # anti-bot honeypot field
│           │   └── ratelimit.ts # login/register rate limiting
│           └── sockets/
│               └── index.ts    # Socket.io (live notifications/updates)
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
        └── topbar-portrait-responsive.md
```

## Notes

- **Playground pages** (`*Playground.tsx`) are intentional, kept live per project
  convention — do not delete them.
- **Stray one-off scripts** (`add_drinks_cat.ts`, `check_cat.ts`, `_mk.ts`) are
  git-ignored and not part of the app.
- **`.env` is never committed** (root + server `.gitignore`).
- Server is run via `tsx` (no separate `dist` needed for dev); `pnpm build` produces
  the client bundle into `packages/server/dist/client` for production serving.
