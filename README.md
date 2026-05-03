# Alrouby Salon & Spa — monorepo

Booking and management system for Alrouby Salon & Spa. Product requirements live in [`docs/SRS.md`](docs/SRS.md). This repository implements the stack described in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Sprint 0 (current):** npm workspaces, NestJS API skeleton, two Next.js apps (public + dashboard), Prisma + PostgreSQL for local dev, Swagger in development, shared `api-client` placeholder, seed hook, and CI.

## Requirements

- **Node.js** 20+ and **npm** 10+ (see [`package.json`](package.json) `engines` and [`.nvmrc`](.nvmrc))
- **PostgreSQL** reachable from your machine — either a [free hosted database](#using-a-free-hosted-postgresql-database) (no local server or Docker) or [local PostgreSQL via Docker Compose](#local-postgresql-with-docker-compose-optional)
- **Docker** (optional — only if you use Compose for a local database)

## Repository layout

| Path | Description |
|------|-------------|
| [`apps/web`](apps/web) | Next.js — public website (Sprint 10+ UI) |
| [`apps/dashboard`](apps/dashboard) | Next.js — staff dashboard (Sprint 11+ UI) |
| [`services/api`](services/api) | NestJS REST API (`/api/v1`, plus unversioned `/health`) |
| [`packages/api-client`](packages/api-client) | Typed helpers for API base URL (placeholder) |
| [`prisma`](prisma) | Prisma schema, migrations, and seed |

## Quick start

1. **Clone** and install from the repository root:

   ```bash
   npm ci
   ```

   (`npm install` is fine for local iteration; CI uses `npm ci`.)

2. **Environment:** copy the example env file and adjust if needed:

   ```bash
   cp .env.example .env
   ```

3. **PostgreSQL:** choose one:

   - **[Using a free hosted PostgreSQL database](#using-a-free-hosted-postgresql-database)** — works without Docker or a local PostgreSQL installation.
   - **[Local PostgreSQL with Docker Compose](#local-postgresql-with-docker-compose-optional)** — if you use Docker for a dev database on your machine.

4. **Migrations:**

   ```bash
   npm run db:migrate
   ```

5. **Seed (placeholder + `schema_version` row):**

   ```bash
   npm run db:seed
   ```

6. **Prisma schema check (optional):** `npx prisma validate` requires `DATABASE_URL` in the environment (use the same value as in `.env`).

7. **Run services** (separate terminals):

   ```bash
   npm run dev:api
   npm run dev:web
   npm run dev:dashboard
   ```

   Defaults:

   - API: [http://localhost:4000](http://localhost:4000) — `GET /health`, Swagger UI at [http://localhost:4000/docs](http://localhost:4000/docs), OpenAPI JSON at [http://localhost:4000/docs-json](http://localhost:4000/docs-json) (dev / when Swagger is enabled), smoke `GET /api/v1/smoke`
   - Web: [http://localhost:3000](http://localhost:3000)
   - Dashboard: [http://localhost:3001](http://localhost:3001)

## Using a free hosted PostgreSQL database

For development you do **not** need Docker or PostgreSQL installed locally. A free hosted PostgreSQL instance is enough.

**Preferred option:** [Neon](https://neon.tech) — serverless PostgreSQL with a generous free tier and straightforward connection strings. It fits this repo’s Prisma + NestJS workflow well.

Other common choices include [Supabase](https://supabase.com) and [Aiven](https://aiven.io); any hosted PostgreSQL that allows connections from your machine works the same way.

If you use Neon, Supabase, Aiven, or another hosted provider for your dev database, you can **skip** `docker compose up -d` entirely. You only need `DATABASE_URL` in `.env` pointing at that instance.

### Hosted database quick start

1. Create a free PostgreSQL database on [Neon](https://neon.tech) (or your chosen provider).
2. Copy the PostgreSQL connection string from the provider’s dashboard.
3. Paste it into the repository root `.env` as `DATABASE_URL` (see [`.env.example`](.env.example)).
4. Ensure the URL includes **`sslmode=require`** (Neon and most cloud providers require TLS; add `?sslmode=require` or `&sslmode=require` if it is missing).
5. From the repository root, run:

   ```bash
   npm run db:migrate
   npm run db:seed
   npm run dev:api
   ```

   Then start the frontends as in [Quick start](#quick-start) step 7 if you need them.

## Local PostgreSQL with Docker Compose (optional)

If you prefer a database on your machine and have Docker installed:

```bash
docker compose up -d
```

After the container is healthy, continue with **Quick start** from step 4 (`npm run db:migrate`).

## Root scripts

| Script | Purpose |
|--------|---------|
| `npm run lint` | Lint all workspaces that define `lint` |
| `npm run test` | Run tests in workspaces that define `test` |
| `npm run build` | Build `api-client`, API, web, and dashboard |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:push` | `prisma db push` (prototyping only) |
| `npm run db:seed` | Run `prisma/seed.ts` |

`postinstall` runs `prisma generate` so the Prisma Client is available after install.

## Sprint plan

Delivery sequencing: [`docs/SPRINT_PLAN.md`](docs/SPRINT_PLAN.md). Sprint 0 stops at foundation; auth, RBAC, catalog, and bookings start in Sprint 1+.

## CI

GitHub Actions workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `npm ci`, `lint`, `test`, and `build` on pushes and pull requests to `main`/`master`.

## License

Private / unlicensed unless otherwise specified by the project owner.
