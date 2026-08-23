# Alrouby Salon & Spa

Alrouby Salon & Spa is a full-stack booking and management platform for a salon and spa business. It gives clients a public website to browse services and book appointments, and gives staff a protected dashboard to manage bookings, scheduling, billing, and content — built for salon owners and operations staff who need a single system to run day-to-day front-desk and back-office work.

## Features

**Public website**
- Service catalog with categories, variants, and benefits, plus individual service detail pages
- Packages, bundles, and promotional offers
- Slot-based online booking flow with confirmation
- Client accounts secured by WhatsApp OTP sign-in/registration, with booking history
- Gallery, testimonials, about, and contact pages

**Staff dashboard**
- Bookings, calendar, booking change requests, and walk-in queue management
- Client CRM with client groups
- Staff scheduling, including exceptions, holidays, and branch closures
- Multi-branch support
- Catalog management for services, service enhancements, packages, bundles, and offers
- Booking slot configuration
- Payments, invoices, cash drawer sessions, and daily closing (point-of-sale style finance)
- Revenue reporting, including staff/services revenue reports
- Loyalty program and review/testimonial curation
- Website CMS for gallery, homepage content, and site content sections
- WhatsApp transactional notifications (confirmations, reminders, cancellations, change requests) with delivery logs and retry
- Role-based access control (roles, permissions) with an audit log
- System settings, including payment policy and VAT configuration

## Tech Stack

**Frontend**
- [Next.js](https://nextjs.org/) 15 (App Router) — two apps: public website and staff dashboard
- [React](https://react.dev/) 19
- [Tailwind CSS](https://tailwindcss.com/) 4
- [Lucide](https://lucide.dev/) / [react-icons](https://react-icons.github.io/react-icons/) for iconography

**Backend**
- [NestJS](https://nestjs.com/) 11 — REST API (`/api/v1`)
- [Passport](https://www.passportjs.org/) + `@nestjs/jwt` — staff JWT authentication
- [class-validator](https://github.com/typestack/class-validator) / [class-transformer](https://github.com/typestack/class-transformer) — request validation
- [@nestjs/throttler](https://docs.nestjs.com/security/rate-limiting) — rate limiting
- [@nestjs/schedule](https://docs.nestjs.com/techniques/task-scheduling) — cron jobs (booking reminders)
- [@nestjs/swagger](https://docs.nestjs.com/openapi/introduction) — API documentation
- [argon2](https://github.com/ranisalt/node-argon2) — password/OTP hashing
- [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js) — phone number normalization

**Database**
- [PostgreSQL](https://www.postgresql.org/)
- [Prisma](https://www.prisma.io/) ORM (schema, migrations, seeding)

**Other**
- npm workspaces monorepo (`apps/*`, `services/*`, `packages/*`)
- [Cloudinary](https://cloudinary.com/) — optional media storage (local disk by default)
- WAPilot — WhatsApp API integration for client OTP login and transactional booking notifications
- GitHub Actions — CI (lint, test, build)
- TypeScript across all workspaces

## Architecture

This is an npm-workspaces monorepo with two Next.js frontends talking to a single NestJS API, backed by PostgreSQL via Prisma:

- **`apps/web`** — the public marketing and booking site. Server components fetch data from the API for the service catalog, packages/bundles, and gallery; client booking and account flows (OTP sign-in, booking, booking history) call the API directly.
- **`apps/dashboard`** — the staff-facing admin app, with all operational screens behind a protected route group. It consumes the API through the shared `@rouby/api-client` package for typed requests.
- **`services/api`** — the NestJS backend, organized as one module per domain (auth, bookings, catalog, staff, billing, finance, reports, notifications, etc.), exposing a versioned REST API at `/api/v1` plus an unversioned `/health` check. Swagger docs are available in development at `/docs`.
- **`prisma/`** — the single source of truth for the data model, shared by the API. Migrations are applied via `prisma migrate`, and the schema models every domain in the system (branches, users/roles/permissions, catalog, bookings, staff scheduling, queue, billing/finance, notifications, content).
- **`packages/api-client`** and **`packages/wall-clock`** — shared code: a typed API client consumed by the dashboard, and a timezone/date utility (the business operates on `Africa/Cairo` time) consumed by both frontends.

There are two independent authentication paths: staff authenticate with JWTs issued by the API (via Passport), while clients authenticate with a WhatsApp OTP flow (delivered through WAPilot in production, or a dummy/dev-code provider locally) that also issues a client JWT. Booking-related WhatsApp messages (confirmations, reminders, cancellations, change-request updates) reuse the same WAPilot integration and are tracked in a notification log with retry support for failed deliveries. Access control throughout the dashboard is enforced via a role/permission model with an audit trail. This is a single-tenant system with multi-branch support baked into the data model (branches, per-branch service/package availability, staff-branch access) rather than a multi-tenant or delivery/partner-routing platform.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+ and npm 10+ (see `.nvmrc` and the `engines` field in `package.json`)
- A reachable PostgreSQL database — either a local instance via Docker Compose, or a free hosted instance (e.g. [Neon](https://neon.tech))
- [Docker](https://www.docker.com/) (optional, only needed for a local PostgreSQL via Compose)

### Clone

```bash
git clone https://github.com/<your-org>/rouby-salon.git
cd rouby-salon
```

### Install

```bash
npm ci
```

### Environment variables

Copy the example env file and fill in your own values:

```bash
cp .env.example .env
```

Required/available variables (names only — see `.env.example` for local defaults and comments):

```
DATABASE_URL
DIRECT_URL
PORT
NODE_ENV
API_URL
CORS_ORIGIN
DEFAULT_TIMEZONE
DEFAULT_CURRENCY
JWT_SECRET
JWT_EXPIRES_IN
CLIENT_JWT_EXPIRES_IN
CLIENT_OTP_TTL_SECONDS
CLIENT_OTP_MAX_ATTEMPTS
CLIENT_OTP_REQUEST_COOLDOWN_SECONDS
OTP_CODE_SECRET
OTP_PROVIDER
OTP_ENABLED
OTP_DUMMY_EXPOSE_CODE
WHATSAPP_PROVIDER
WAPILOT_API_BASE_URL
WAPILOT_API_TOKEN
WAPILOT_INSTANCE_ID
NOTIFICATIONS_ENABLED
BOOKING_REMINDER_HOURS_BEFORE
BOOKING_REMINDER_MINUTES_BEFORE_FINAL
SWAGGER_ENABLED
MEDIA_STORAGE
MEDIA_STORAGE_ROOT
PUBLIC_MEDIA_BASE_URL
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
CLOUDINARY_FOLDER
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_WEB_URL
NEXT_PUBLIC_DASHBOARD_URL
SEED_OWNER_PASSWORD
```

Replace secret-bearing values (`JWT_SECRET`, `WAPILOT_API_TOKEN`, `CLOUDINARY_API_SECRET`, `SEED_OWNER_PASSWORD`, etc.) with your own — never commit real values. For example: `JWT_SECRET=YOUR_JWT_SECRET_HERE`.

### Database

```bash
npm run db:migrate
npm run db:seed
```

### Run locally

Start each app in a separate terminal:

```bash
npm run dev:api        # NestJS API → http://localhost:4000 (Swagger at /docs)
npm run dev:web        # Public website → http://localhost:3000
npm run dev:dashboard  # Staff dashboard → http://localhost:3001
```

## Project Structure

```
rouby-salon/
├── apps/
│   ├── web/              # Next.js public website (booking, catalog, account, content)
│   └── dashboard/        # Next.js staff dashboard (protected admin/operations screens)
├── services/
│   └── api/               # NestJS REST API, one module per domain (bookings, catalog, billing, ...)
├── packages/
│   ├── api-client/        # Shared typed API client, consumed by the dashboard
│   └── wall-clock/        # Shared timezone/date utility
├── prisma/                # Prisma schema, migrations, and seed scripts
├── docs/                  # Architecture, API contract, DB schema, deployment, and RBAC docs
├── scripts/                # One-off maintenance scripts (e.g. Cloudinary media migration)
├── docker-compose.yml      # Local PostgreSQL for development
└── package.json            # npm workspaces root
```

## Live Demo

Not yet publicly deployed — the project is currently in active development. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the intended production setup (API on Render, frontends on a Next.js-capable host, Cloudinary for media, Cloudflare for DNS/SSL).

## License

Private / unlicensed. All rights reserved unless otherwise specified by the project owner.
