# Inventory system — limited sneaker drop demo

Full **pnpm monorepo**: `apps/server` (Express + Prisma + Socket.io), `apps/web` (React + Vite), `packages/types` (shared DTOs + socket event names).

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- Docker (for local Postgres), or any PostgreSQL instance

## Quick start

1. **Start Postgres**

   ```bash
   docker compose up -d
   ```

2. **Environment**

   Copy `apps/server/.env.example` to `apps/server/.env`. The bundled Compose file maps Postgres to host port **5433** (to avoid clashes with a local `:5432`).

3. **Install dependencies**

   ```bash
   pnpm install
   ```

4. **Database**

   ```bash
   pnpm db:generate
   pnpm db:migrate
   pnpm db:seed
   ```

5. **Run apps** (API on `:5000`, Vite on `:5173`)

   ```bash
   pnpm dev
   ```

   Optional: copy `apps/web/.env.example` to `apps/web/.env.development` if you change the API port (see troubleshooting below).

Open [http://localhost:5173](http://localhost:5173). Pick a demo user (**alice**, **bob**, or **carol**); the UI sends `X-User-Id` on reserve/purchase requests.

### Port `5000` already in use (`EADDRINUSE`)

Something else is bound to **5000** (often a previous `pnpm dev` / `tsx` you forgot to stop).

1. **Stop the old process** (Linux):

   ```bash
   ss -tlnp | grep ':5000 '
   # or: lsof -i :5000
   ```

   End that PID (e.g. Ctrl+C in the old terminal, or `kill <pid>`).

2. **Or use another API port**: set `PORT=5001` (or any free port) in `apps/server/.env`, then set `VITE_API_ORIGIN=http://localhost:5001` in `apps/web/.env.development` so Vite’s proxy and Socket.io still reach the server.

The Vite `EPIPE` / websocket proxy errors are a side effect of the API failing to start on **5000**; they usually go away once the server listens successfully.

## Architecture — 60-second reservation expiry

- Each reservation stores `expiresAt` (`now + 60s`).
- A **periodic sweep** (every 5 seconds) loads expired `ACTIVE` reservations, locks the parent **Drop** row (`SELECT … FOR UPDATE`), verifies status is still `ACTIVE`, marks `EXPIRED`, and moves one unit from `reservedQuantity` back to `availableQuantity`.
- After any inventory mutation (reserve, purchase, expiry), the server emits `drops:changed` over Socket.io so browsers refetch `/api/drops`.

## Concurrency — preventing overselling on reserve

- Reserve runs inside a **single DB transaction**.
- The handler locks the **`Drop` row with `FOR UPDATE`** before checking `availableQuantity` or inserting the reservation.
- Only one transaction can hold that lock at a time, so concurrent reserves serialize; if stock is already `0`, later transactions receive `409 OUT_OF_STOCK`.

Purchases lock the **same drop row** after validating ownership so expiry and checkout cannot corrupt counters.

## API highlights

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/users` | Demo shoppers |
| `GET` | `/api/drops` | Active drops + nested **top 3** recent purchasers |
| `POST` | `/api/drops` | Initialize a drop (`name`, `price`, `totalUnits`, `startsAt`, optional `endsAt`) |
| `POST` | `/api/reservations` | Requires `X-User-Id`; body `{ dropId }` |
| `GET` | `/api/reservations/active?dropId=` | Current hold for user |
| `POST` | `/api/purchases` | Requires `X-User-Id`; body `{ reservationId }` |

## Deployment note

Socket.io needs a **long-lived** HTTP server. **Vercel serverless alone is not suitable** for this Socket.io process; typical patterns are static frontend on Vercel + API/socket on Railway/Render/Fly, or one VPS running both.

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Turbo: builds `@inventory/types`, runs server + web |
| `pnpm db:migrate` | Prisma migrate dev (from `@inventory/server`) |
| `pnpm db:seed` | Seed demo users + sample drop |
