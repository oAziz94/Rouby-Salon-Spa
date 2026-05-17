# AlRouby Salon & Spa — deployment notes

This document reflects the **accepted deployment stack** for this repository: existing PostgreSQL database, NestJS API on Render, public website and staff dashboard as Next.js apps, DNS/SSL on Cloudflare, and **Cloudinary** for new production media uploads. Client OTP can use the **dummy** provider for local testing or **WhatsApp via WAPilot** in production (see below).

---

## Current database decision

- **Production uses the same PostgreSQL instance you already run** (no new production database is created as part of this work).
- **Do not** point `DATABASE_URL` at a fresh empty database unless you intend to replace all data.
- **No production seed pipeline** is introduced here; use existing operational procedures for data.
- Run migrations with care: `npx prisma migrate deploy` against the real DSN when you are ready. Review migration SQL in `prisma/migrations/` in PRs; this repo’s history is additive MVP-style DDL. One historical migration drops an unused `schema_version` table only (`DROP TABLE IF EXISTS`).

---

## Client OTP (dummy vs WhatsApp)

- OTP codes are stored **hashed** with expiry, resend cooldown, and verification attempt limits.
- **`OTP_PROVIDER=dummy`** (default for local dev): no outbound message; when **`NODE_ENV` is not `production`** and **`OTP_DUMMY_EXPOSE_CODE` is not `false`**, `POST /client/auth/otp/request` may include **`devCode`** for testers. Do not use dummy OTP in production.
- **`OTP_PROVIDER=whatsapp`** with **`WHATSAPP_PROVIDER=wapilot`**: sends OTP via [WAPilot](https://wapilot.net) `POST /{instance_id}/send-message`. Required: **`WAPILOT_API_TOKEN`**, **`WAPILOT_INSTANCE_ID`**. Optional: **`WAPILOT_API_BASE_URL`** (default `https://api.wapilot.net/api/v2`).
- **Phone format:** accept `010…`, `+2010…`, or `2010…`; the API normalizes Egyptian mobiles to **international digits without `+`** for WAPilot `chat_id` (e.g. `201001234567`). Client records in the database continue to use E.164 with `+` from the same normalization path.
- **Transactional notifications:** set **`NOTIFICATIONS_ENABLED=true`** in production (same WAPilot env vars). Sends booking confirmation, cancellation, change-request updates, and **two** appointment reminders per booking: **`BOOKING_REMINDER_HOURS_BEFORE=24`** (default) and **`BOOKING_REMINDER_MINUTES_BEFORE_FINAL=90`** (default). Leave **`NOTIFICATIONS_ENABLED=false`** locally unless you are testing live WhatsApp delivery.
- **Dashboard monitoring:** grant **`notifications.read`** (and **`notifications.retry`** for managers) so staff can use **Admin → Notification Logs** to inspect delivery history and retry failed messages without exposing WAPilot tokens.

---

## Cloudinary media

### Behaviour

- **`MEDIA_STORAGE=local`** (default): uploads stay on disk under `MEDIA_STORAGE_ROOT` (default `uploads` relative to `services/api`), served by the API at `/uploads/...`.
- **`MEDIA_STORAGE=cloudinary`**: dashboard uploads go to Cloudinary; the API stores **`secure_url`** in `imageUrl` (and **`public_id`** in `imageKey` / gallery `storageKey`).
- Existing **local URLs** and **Cloudinary URLs** remain valid in the database; validation accepts both when configured.

### Required environment variables

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER` (default `alrouby`)
- `MEDIA_STORAGE=cloudinary`

### Migrating existing files

1. Ensure local files exist under `services/api/uploads` (or `MEDIA_STORAGE_ROOT` relative to repo root).
2. From the **repo root**, with `DATABASE_URL` and Cloudinary env set:

   ```bash
   DRY_RUN=true npm run migrate:media:cloudinary
   ```

   Inspect the log, then run without `DRY_RUN` when satisfied.

3. The script skips rows that already use Cloudinary (or non-`/uploads/` HTTP URLs). It prints per-table summaries and a total.

If some rows reference files that no longer exist on disk, they are reported as skipped; the API can still serve old URLs until you fix or re-upload.

---

## Render — API

**Monorepo root directory:** repository root (same folder as `package.json` and `prisma/`).

**Build command (API + Prisma client only):**

```bash
npm ci && npm run build -w @rouby/api-client && npm run build -w api && npx prisma generate
```

**Start command:**

```bash
npm run start:prod -w api
```

**Health check path:** `/health` (this route is **not** under `/api/v1`).

**Port:** Render sets `PORT`; the app listens with `await app.listen(Number(process.env.PORT ?? 4000))`.

**CORS:** Set **`CORS_ORIGIN`** to a comma-separated list of allowed web origins, e.g.

`https://www.yourdomain.com,https://dashboard.yourdomain.com`

(`CORS_ORIGINS` is still read if `CORS_ORIGIN` is unset.) In **production**, omitting both causes the API to fail fast at boot so you never accidentally ship open localhost CORS.

**Public media when `MEDIA_STORAGE=local`:** set **`PUBLIC_MEDIA_BASE_URL`** (and/or **`API_URL`**) to your public API URL. On Render, **`RENDER_EXTERNAL_URL`** is also used as a last-resort base when building local upload URLs.

---

## Cloudflare Pages — public website & dashboard

### Static export?

Both `apps/web` and `apps/dashboard` are **Next.js 15 App Router** apps that load catalog and content via **server components** calling the HTTP API at request time. They are **not** compatible with a pure `output: 'export'` static site without a large refactor (moving all data loading to the client or to build-time SSG with a fixed dataset).

### Practical hosting options

| Option | Notes |
|--------|--------|
| **Cloudflare Workers + OpenNext** | Possible path to run full Next on Cloudflare; requires OpenNext adapter setup and CI tuning. |
| **Vercel** (two projects) | Straightforward for Next 15; set the same env vars as below. |
| **Render / Fly.io / Railway** | Run `next start` per app (`npm run start -w web` / `dashboard`) behind HTTPS. |

**Cheapest “it just works” for this codebase today:** two small **Render Web Services** (or one machine + path routing if you prefer), or **Vercel** hobby tier for both frontends.

### Suggested Cloudflare Pages–style env (when you host Next elsewhere)

- **Website:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL`
- **Dashboard:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DASHBOARD_URL`, `NEXT_PUBLIC_WEB_URL` (for “preview website” links)

---

## Environment variables (checklist)

### API (Render)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `DIRECT_URL` | Optional Prisma direct URL |
| `NODE_ENV` | `production` |
| `PORT` | Set by Render |
| `CORS_ORIGIN` | Comma-separated allowed browser origins |
| `JWT_SECRET` | Dashboard JWT signing |
| `JWT_EXPIRES_IN` | Dashboard access token TTL (e.g. `7d`) |
| `DEFAULT_TIMEZONE` | e.g. `Africa/Cairo` |
| `DEFAULT_CURRENCY` | e.g. `EGP` |
| `DEFAULT_VAT_RATE` | Optional; business VAT may live in DB |
| `OTP_PROVIDER` | `whatsapp` in production; `dummy` for local dev only |
| `OTP_ENABLED` | `true` |
| `WHATSAPP_PROVIDER` | `wapilot` when `OTP_PROVIDER=whatsapp` |
| `WAPILOT_API_BASE_URL` | Default `https://api.wapilot.net/api/v2` |
| `WAPILOT_API_TOKEN` | WAPilot API token (header `token`) |
| `WAPILOT_INSTANCE_ID` | WAPilot instance id |
| `NOTIFICATIONS_ENABLED` | `true` in production for booking WhatsApp alerts |
| `BOOKING_REMINDER_HOURS_BEFORE` | Hours before appointment for first reminder (default `24`) |
| `BOOKING_REMINDER_MINUTES_BEFORE_FINAL` | Minutes before appointment for second reminder (default `90`) |
| `MEDIA_STORAGE` | `cloudinary` in production uploads |
| `CLOUDINARY_*` | As above |
| `PUBLIC_MEDIA_BASE_URL` | Public API origin if serving `/uploads` locally |
| `API_URL` | Fallback public API URL |

### Frontends

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Base URL including `/api/v1` |
| `NEXT_PUBLIC_WEB_URL` | Public site origin (links, previews) |
| `NEXT_PUBLIC_DASHBOARD_URL` | Dashboard origin (optional cross-links) |

---

## DNS & SSL (Cloudflare)

- Point `api.` (or single host) to Render as per Render’s docs.
- Point `www` / apex to your chosen web host (Pages static export is insufficient for this repo’s Next SSR data fetching; use full Next hosting).
- Enable **Full (strict)** SSL between Cloudflare and origin.

---

## Smoke test checklist

1. `GET https://<api>/health` → `{ "status": "ok" }`
2. Dashboard login with a known staff user.
3. CORS: browser login from deployed dashboard origin succeeds (no blocked preflight).
4. Upload a catalog image with `MEDIA_STORAGE=cloudinary`; confirm DB stores `https://res.cloudinary.com/...` and the public website shows the image.
5. Client OTP request returns `devCode` only when you intend it to; verify OTP completes login.
6. Public website: home, services list, single service, booking flow through slot selection.

---

## Related files

- Root `.env.example`, `apps/web/.env.example`, `apps/dashboard/.env.example`, `services/api/.env.example`
- `scripts/migrate-media-to-cloudinary.ts` — optional media migration (not run automatically)
