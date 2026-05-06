# Inventory system — limited sneaker drop demo

Full **pnpm monorepo**: `apps/server` (Express + Prisma + Socket.io), `apps/web` (React + Vite), `packages/types` (shared DTOs + socket event names).

## Submission Links

- GitHub repository: `https://github.com/Hazrat16/real-time-high-trafic-inventory`
- Demo video: `https://drive.google.com/file/d/13Gr7gjhdTJi-IVYbqWtC8Rhs-Ds6hoDt/view?usp=sharing`
- Live frontend URL: `https://real-time-high-trafic-inventory-web.vercel.app/`
- Live backend URL: `https://real-time-high-trafic-inventory-production.up.railway.app`

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

   For web, set `apps/web/.env.development` with:
   - `VITE_API_ORIGIN=http://localhost:5000` (local)
   - or your deployed backend URL in production.

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

If you deploy only frontend on Vercel, set `VITE_API_ORIGIN` in Vercel project settings to your backend domain. Otherwise calls to `/api/v1/*` on the frontend domain return 404.

## Architecture — 60-second reservation expiry

- Each reservation stores `expiresAt` (`now + 60s`).
- A **periodic sweep** (every 5 seconds) loads expired `ACTIVE` reservations, locks the parent **Drop** row (`SELECT … FOR UPDATE`), verifies status is still `ACTIVE`, marks `EXPIRED`, and moves one unit from `reservedQuantity` back to `availableQuantity`.
- After any inventory mutation (reserve, purchase, expiry), the server emits `drops:changed` over Socket.io so browsers refetch `/api/v1/drops`.
- You can inspect sweep runtime stats at `GET /api/v1/system/expiry-sweep` (`runs`, `lastRecovered`, `totalRecovered`, `lastRunAt`, `lastError`).

## Concurrency — preventing overselling on reserve

- Reserve runs inside a **single DB transaction**.
- The handler locks the **`Drop` row with `FOR UPDATE`** before checking `availableQuantity` or inserting the reservation.
- Only one transaction can hold that lock at a time, so concurrent reserves serialize; if stock is already `0`, later transactions receive `409 OUT_OF_STOCK`.

Purchases lock the **same drop row** after validating ownership so expiry and checkout cannot corrupt counters.

## API highlights

| Method | Path                                  | Notes                                                                            |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/users`                       | Demo shoppers                                                                    |
| `GET`  | `/api/v1/drops`                       | Active drops + nested **top 3** recent purchasers                                |
| `POST` | `/api/v1/drops`                       | Initialize a drop (`name`, `price`, `totalUnits`, `startsAt`, optional `endsAt`) |
| `POST` | `/api/v1/reservations`                | Requires `X-User-Id`; body `{ dropId }`                                          |
| `GET`  | `/api/v1/reservations/active?dropId=` | Current hold for user                                                            |
| `POST` | `/api/v1/purchases`                   | Requires `X-User-Id`; body `{ reservationId }`                                   |

## Deployment note

Socket.io needs a **long-lived** HTTP server. **Vercel serverless alone is not suitable** for this Socket.io process; typical patterns are static frontend on Vercel + API/socket on Railway/Render/Fly, or one VPS running both.

## Scripts

| Script                            | Purpose                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm dev`                        | Turbo: builds `@inventory/types`, runs server + web                                     |
| `pnpm db:migrate`                 | Prisma migrate dev (from `@inventory/server`)                                           |
| `pnpm db:seed`                    | Seed demo users + sample drop                                                           |
| `pnpm reservation:check`          | Runs 100 parallel reservations against a 1-unit drop; expects exactly 1 success         |
| `pnpm reservation:expiry-check`   | Forces one reservation stale and verifies stock is recovered + status becomes `EXPIRED` |
| `pnpm reservation:purchase-check` | Verifies purchase success path + guardrails (`INVALID_STATE`, `FORBIDDEN`, `EXPIRED`)   |
| `pnpm drop-feed:check`            | Verifies merch drop activity feed returns top 3 purchasers in newest-first order        |
