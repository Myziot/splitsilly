# Split Silly

Split expenses with friends — a privacy-friendly expense-splitting web app.

> Internal package name is `cost-sharing` (pnpm workspace); the product is branded **Split Silly**.

Split Silly lets a group track shared expenses in a master currency, see who
owes whom, record settlements, and reset balances — with live exchange-rate
context and a transparent activity log.

## Stack

| Layer      | Tech                                                        |
| ---------- | ----------------------------------------------------------- |
| Client     | Vite + React 18 + TypeScript + Tailwind + Zustand          |
| Server     | Express + TypeScript (tsx) + Drizzle ORM                   |
| Database   | PostgreSQL                                                  |
| Realtime   | Socket.io (notifications / live updates)                   |
| Auth       | Session-cookie based (bcrypt-hashed passwords)             |
| Build      | pnpm monorepo (`@cost-sharing/server`, `@cost-sharing/client`) |
| Exchange   | [Frankfurter API](https://www.frankfurter.dev) (ECB data)  |

## Quick start

```bash
# 1. Install
pnpm install

# 2. Configure the server
cp packages/server/.env.example packages/server/.env   # then fill in values
#   Required: DATABASE_URL, SESSION_SECRET, CORS_ORIGINS
#   Optional: RESEND_API_KEY (email reminders/invites), FRONTEND_BASE_URL

# 3. Database
pnpm db:push          # sync schema to Postgres
pnpm db:seed          # seed categories (Food & Drink, Transport, Drinks, ...)

# 4. Run
pnpm dev              # starts server (tsx watch) + client (vite) together
#   Client: http://localhost:5173   Server: http://localhost:3002
```

For production, build the client and serve it from the Express server:

```bash
pnpm build            # outputs client bundle into packages/server/dist/client
pnpm start           # Express serves the built SPA + API on :3002
```

## Scripts (root)

| Script            | Purpose                                  |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | Run server + client in watch mode        |
| `pnpm build`      | Build the client bundle                  |
| `pnpm start`      | Run the production server                |
| `pnpm db:push`    | Push Drizzle schema to the database      |
| `pnpm db:seed`    | Seed reference data (categories)         |
| `pnpm typecheck`  | Type-check server + client               |
| `pnpm test`       | Run server vitest suite                  |

## Key features

- **Groups & members** — invite by code, join, roles (admin/member).
- **Expenses** — multi-currency, converted to a group master currency via live rates.
- **Balances** — per-member net owed/is-owed, optimized settlement suggestions.
- **Settlements** — record payments; reset-all is logged to the activity feed.
- **Activity log** — transparent group-wide feed (joins, expenses, settlements, resets).
- **Live rate footline** — USD-based basket (EUR/GBP/JPY/CHF/CAD/PLN + group currency)
  shown on auth pages and group pages, with a Frankfurter credit line.
- **"Who paid cash"** — per-member cash paid out of the total, on both Expenses and Balances tabs.

## Project layout

See [`FILE_STRUCTURE.md`](./FILE_STRUCTURE.md) for the full tree and
[`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) for design rationale and conventions.
Active feature plans live in [`docs/active_plans/`](./docs/active_plans/).

## License

Proprietary — see repository owner. Not licensed for redistribution.
