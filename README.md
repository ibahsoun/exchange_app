# Exchange Terminal — Unified Currency Exchange Platform

A full-stack currency exchange terminal built with React, NestJS, and PostgreSQL. Monorepo managed with pnpm workspaces.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS, Zustand, Socket.io-client |
| Backend | NestJS 10, Prisma ORM, PostgreSQL 16, Socket.io |
| Shared | Zod schemas, TypeScript types |
| Tooling | pnpm workspaces, ESLint, Prettier |

## Project Structure

```
exchange-terminal/
├── apps/
│   ├── web/          # React frontend (Vite)
│   └── api/          # NestJS backend
├── packages/
│   └── shared/       # Shared types, schemas, constants
├── docker-compose.yml
└── package.json
```

## Prerequisites

- **Node.js** >= 18
- **pnpm** >= 8
- **Docker** (for PostgreSQL)

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start the database

```bash
pnpm docker:up
```

This starts PostgreSQL on port `5432` and pgAdmin on port `5050`.

### 3. Set up environment variables

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 4. Initialize the database

```bash
pnpm db:push      # Push schema to database
pnpm db:seed      # Seed with sample data
```

### 5. Start development servers

```bash
pnpm dev
```

This starts both servers in parallel:
- **Frontend**: http://localhost:3000
- **API**: http://localhost:4000
- **pgAdmin**: http://localhost:5050

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers in parallel |
| `pnpm dev:web` | Start frontend only |
| `pnpm dev:api` | Start backend only |
| `pnpm build` | Build all packages |
| `pnpm lint` | Run ESLint across all packages |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm format` | Format code with Prettier |
| `pnpm typecheck` | Type-check all packages |
| `pnpm db:push` | Push Prisma schema to database |
| `pnpm db:seed` | Seed the database |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm docker:up` | Start Docker services |
| `pnpm docker:down` | Stop Docker services |

## Pages

1. **Dashboard** — Exchange center with currency conversion, KYC form, live rate sidebar
2. **Live Rates** — Real-time rate board with search, manual override toggle, flash animations
3. **Transactions** — Searchable transaction history with filters, pagination, export
4. **Vault Inventory** — Currency vault management with KPIs, denomination tracking, inbound/outbound
5. **Customers** — Customer directory with detail drawer, identity verification, risk flagging

## Environment Variables

### API (`apps/api/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/exchange_terminal` | PostgreSQL connection string |
| `PORT` | `4000` | API server port |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `RATE_REFRESH_INTERVAL` | `5000` | Rate update interval (ms) |

### Web (`apps/web/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:4000` | API base URL |
| `VITE_WS_URL` | `ws://localhost:4000` | WebSocket URL |
| `VITE_RATE_REFRESH_INTERVAL` | `5000` | Rate polling interval (ms) |
