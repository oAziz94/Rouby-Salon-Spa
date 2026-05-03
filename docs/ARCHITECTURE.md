# Architecture — Alrouby Salon & Spa Booking & Management System

**Document type:** Technical architecture  
**Source of truth for product scope:** `/docs/SRS.md`  
**Version:** 1.0 (aligned with SRS v1.0)

This document describes how the system is structured technically. It does not add requirements beyond the SRS.

---

## 1. System overview

The system has two major parts per the SRS:

1. **Public website** — Marketing content, service/package/bundle browsing, client authentication, booking request submission, client profile and booking history, WhatsApp-first contact, gallery and testimonials (approved content).
2. **Admin dashboard** — Internal operations: bookings, receptionist-managed slots, clients, catalog (services, variants, packages, bundles), staff and branches, payments and invoices, offers, content (gallery, testimonials, site content), WhatsApp templates, reports, users/roles, settings, audit logs.

**Booking model (MVP):** A flexible, semi-manual **booking request** flow. Receptionists and admins define **booking slots** with configurable **capacity** and statuses. Clients select items and a preferred slot; submissions create bookings in **Pending** status until staff confirm, reject, reschedule, or follow up. The MVP **does not** require a fully automated staff-availability scheduling engine; staff control remains primary.

**Cross-cutting concerns:** Role-based access (hierarchical), JWT-secured dashboard APIs, configurable VAT and payment/deposit policies, audit logging for sensitive actions, multi-branch-ready data model (MVP may use one active branch).

---

## 2. Recommended technology stack

Aligned with SRS §29:

| Layer | Technology |
|--------|------------|
| Public & dashboard UI | **Next.js**, **TypeScript**, **Tailwind CSS**, **shadcn/ui**, **React Hook Form**, **Zod** |
| Backend API | **NestJS**, **TypeScript**, **REST** |
| Data access | **Prisma ORM** |
| Database | **PostgreSQL** |
| Dashboard session | **JWT** authentication |
| Authorization | **RBAC** (permissions enforced in NestJS, not UI-only) |
| Background jobs (foundation) | **Redis**, **BullMQ** (future: reminders, automation, heavy reports) |
| File storage | **Cloudinary** or **S3-compatible** storage |
| Hosting (suggested) | Frontend: **Vercel**; Backend: **Railway** / **Render** / **VPS** / **DigitalOcean**; DB: **Neon** / **Supabase** / **Railway PostgreSQL** |

---

## 3. Monorepo / project structure

A practical layout (names illustrative; adjust to team preference):

```text
/
├── apps/
│   ├── web/                 # Next.js: public site + client account area
│   └── dashboard/           # Next.js: staff dashboard (or single Next.js app with route groups)
├── packages/
│   ├── api-client/          # Typed fetch/SDK for REST + shared types
│   ├── ui/                  # Shared UI primitives (optional)
│   └── config/              # Shared ESLint, TS config (optional)
├── services/                # or apps/api
│   └── api/                 # NestJS REST API
├── prisma/
│   └── schema.prisma        # Single schema; migrations versioned in repo
├── docs/                    # SRS, ARCHITECTURE, API_CONTRACT, etc.
└── package.json             # Workspace root (npm workspaces)
```

**Rationale:** One repository keeps API contracts, Prisma schema, and both frontends in sync. Alternative: separate repos for `web`, `dashboard`, and `api` — same architecture, more release coordination.

---

## 4. Frontend applications

**Option A (common):** One **Next.js** application with clear separation:

- **Public routes** — Marketing pages, catalog, booking flow, legal pages.
- **Authenticated client routes** — Profile, my bookings, cancellation/reschedule requests (within SRS 24-hour client rule; post-window messaging directs users to WhatsApp/phone per SRS).

**Option B:** Two Next.js apps (`web` + `dashboard`) sharing `packages/api-client` and types.

**Both UIs:**

- Call the **same NestJS REST API** (different auth: client JWT/session vs dashboard JWT).
- **Mobile-first** layout (SRS §25.3).
- **No business-rule duplication** for security: UI reflects permissions; **authorization is server-side**.

**Data loading:** Server Components where appropriate for public SEO pages; client state for booking wizard and dashboard calendar.

---

## 5. Backend application

Single **NestJS** service exposing **REST** resources for:

- Public read endpoints for published catalog/content (rate-limited where needed).
- Authenticated client endpoints (bookings owned by client, profile).
- Dashboard endpoints (all mutations guarded by RBAC + branch scope where applicable).

**Modules (conceptual mapping to SRS domains):** Auth, Users/Roles/Permissions, Clients, Branches, Services/Categories/Variants, Packages, Bundles, Offers, BookingSlots, Bookings/BookingItems, Payments, Invoices, VAT/Settings, WhatsAppTemplates, Gallery, Testimonials/Reviews, Reports (read-aggregations), AuditLogs, File uploads (presigned or server-mediated).

**Cross-cutting NestJS layers:** Global validation pipe (DTOs + class-validator or Zod via adapter), exception filters, JWT strategy (separate client vs dashboard issuers or claims if desired), RBAC guards, optional branch scoping guard for branch manager/receptionist data.

**Jobs:** Redis + BullMQ wired for no-op or minimal MVP queues; used later for WhatsApp automation and reminders without redesign.

**API documentation:** The NestJS API should expose **Swagger / OpenAPI** documentation (for example via `@nestjs/swagger`) so the live HTTP surface stays discoverable alongside `/docs/API_CONTRACT.md`. Restrict or disable public exposure in production according to deployment policy.

---

## 6. Database choice

**PostgreSQL** as the system of record.

- **Prisma** manages schema migrations and type-safe queries.
- Schema supports **multi-branch** from day one (branch-scoped slots, bookings, staff) even if MVP runs a single active branch (SRS §16, §25.4).
- Prefer **soft delete** or **active/inactive** flags for business entities unless the SRS explicitly requires hard delete (project rules: avoid hard-delete of important records unless required).

**Seed data (MVP bootstrap):** Provide a Prisma (or equivalent) **seed** that loads non-production-safe defaults for development/staging: **roles** and **permissions** aligned with `/docs/RBAC_MATRIX.md`, a **default branch**, **VAT and payment/deposit** settings (`SystemSettings` per `/docs/DATABASE_SCHEMA.md`), and **default WhatsApp templates** (SRS §11.4). Production bootstrap remains a controlled migration/runbook, not ad hoc re-seeding.

---

## 7. Authentication strategy

Two distinct audiences (SRS §12):

| Audience | Mechanism | Notes |
|----------|-----------|--------|
| **Dashboard users** | Email + password (hashed), JWT for API | Future: 2FA noted in SRS as recommendation, not MVP requirement |
| **Clients** | Social (Google, Facebook), optional phone-based and email/password | Phone **required before booking submission** (SRS §4, §12.1) |

**Implementation notes:**

- **Password hashing** for dashboard users (bcrypt/argon2 per security best practice; SRS §25.2, §26).
- **JWT** for stateless API auth; short-lived access tokens + refresh strategy as standard practice (exact TTL is implementation detail; not prescribed in SRS).
- **Client** and **dashboard** token types or audiences should be distinguishable so client tokens cannot call staff-only routes.

**Enforcement:** Every protected route runs **authentication** then **authorization** (RBAC for dashboard; ownership or client role for client routes).

---

## 8. Client social login strategy

Per SRS §12.1–12.2:

- Integrate **OAuth** providers: **Google**, **Facebook** (provider SDK or NextAuth/Auth.js–style flow — choice is implementation).
- On successful social login, persist/link **Client** record with: **name**, **email** (if provided), **profile image** (if provided).
- If **phone** is missing, block **booking submission** until the client supplies a verified or captured phone number (SRS: required before booking; exact verification level not specified — implement as phone capture + validation at minimum).

Optional **email/password** and **phone-based** login coexist with social login for clients per SRS.

**Account linking:** Architecture should allow one client identity to merge social provider IDs and phone/email without duplicate client records where possible (implementation detail; behavior must satisfy SRS).

---

## 9. Dashboard login strategy

Per SRS §12.3:

- **Email + password** for all dashboard users (`User` model in SRS §23.1).
- **Role** assigned via `roleId`; optional **branchId** for branch-scoped roles (SRS).
- **JWT** returned after credential validation; subsequent requests send `Authorization: Bearer <token>`.
- **Future:** Two-factor authentication mentioned as recommendation — reserve extension point (user flag, second step endpoint) without building it in MVP unless scoped.

Staff may exist **without** dashboard login (`dashboard login enabled/disabled` on staff — SRS §15); only `User` records with credentials access the dashboard API.

---

## 10. RBAC strategy

Per SRS §5–6, §23.2–23.3:

- **Hierarchical roles:** Owner / Super Admin → Admin → Branch Manager → Receptionist → Specialist (ordering and naming per SRS).
- **Permission** keys attached to roles (e.g. `bookings.confirm`, `slots.manage`, `vat.manage`) — example keys in SRS §23.3; full matrix should live in `/docs/RBAC_MATRIX.md` when authored.
- **Backend enforcement:** Guards check permissions (and branch, where applicable) on **every** mutating and sensitive read operation. UI hiding alone is insufficient (SRS §6, FR-AUTH-004).
- **Higher roles** inherit or supersede lower capabilities per product rules (exact matrix not duplicated here — implement per RBAC doc).

**Sensitive client data:** Notes/allergies visibility restricted to authorized roles per SRS §14.

---

## 11. Booking engine architecture

Semi-manual **booking request** engine (SRS §10.1, §28):

- **No** fully automated staff-based scheduling engine in **MVP** (explicit SRS and project rules).
- **Flow:** Client builds cart of items → sees estimated price/duration → selects date + **slot** → authenticates → provides phone → submits → API creates **Booking** with status **Pending** and associates **BookingItem** rows.
- **Staff:** Confirm, reject, reschedule, cancel, mark arrived / in progress / completed / no-show, etc., per SRS §10.4–10.5.
- **Sources:** Track `source` on booking (e.g. Website, Dashboard, Walk-in, Phone, WhatsApp, Instagram, Facebook — SRS §21 reports).
- **Future:** FR-BK-010 reserves extension for automated availability logic without MVP dependency.

**Domain service:** A dedicated NestJS module (e.g. `BookingsService`) encapsulates status transitions and validation (e.g. 24-hour rule for **client-initiated** cancel/reschedule requests vs staff override — SRS §10.7).

---

## 12. Booking slots architecture

Entity aligns with SRS **BookingSlot** (§10.5, §23.11):

- Scoped to **branch**, **date**, **start/end time**, **capacity**, **booked count**, **status** (Available, Pending, Filled, Blocked, Closed), **online bookable** flag, **notes**, audit metadata (`createdBy`, timestamps).
- **CRUD and transitions** exposed only to roles with `slots.manage` (or equivalent per RBAC matrix).
- **Online availability:** Slots shown to the public booking UI must be **online bookable**, within **Available** (or equivalent) state, and **booked count < capacity** for automatic hiding when full (SRS §10.6). Receptionist may **manually** mark slot **Filled** even when booked count < capacity.

**Calendar UI:** Consumes same API — daily/weekly/monthly/slot views; staff view / branch view marked **future** in SRS §17.3 — architecture can use same slot/booking APIs with additional filters later.

---

## 13. One booking with multiple booking items architecture

Per SRS §10.2–10.3, §23.12–23.13:

- **Booking** = one client visit: one `clientId`, `branchId`, `slotId`, `status`, `source`, pricing totals (`subtotal`, `discountAmount`, `vatRate`, `vatAmount`, `totalAmount`), notes, `createdBy`, timestamps.
- **BookingItem** = line on the visit: `itemType` discriminates service / variant / package / bundle / add-on as applicable; foreign keys (`serviceId`, `serviceVariantId`, `packageId`, `bundleId`) nullable per type; **snapshots** `nameSnapshot`, `priceSnapshot`, `durationMinutesSnapshot`, `quantity`, optional `assignedStaffId`, item-level `status`.

**Why snapshots:** Historical accuracy for invoices and reports if catalog prices change (SRS §23.13, FR-BK-009).

**API shape:** Create booking with nested `items[]`; server validates catalog IDs, computes snapshots from current catalog rules, applies offers/discounts only where product rules and permissions allow (SRS §18 — authorized roles for manual discounts).

---

## 14. WhatsApp deep link architecture (MVP)

Per SRS §11.1, §11.2–11.4:

- **No** WhatsApp Business API in MVP; communication is **user-initiated** via WhatsApp web links (for example `wa.me` with the salon WhatsApp number in E.164 format, without plus in the path) with a **URL-encoded** `text` query parameter for the pre-filled body.
- **Central utility** (shared or backend-generated): given `whatsappBusinessNumber`, `templateKey` or template body, and **variable map** (`{clientName}`, `{bookingDate}`, etc. — SRS §11.5), produce final **deep link** + display string.
- **Public site:** Floating button, contact, per-service/per-package “ask on WhatsApp” with pre-filled inquiry text (SRS examples).
- **Dashboard:** Actions on booking detail and client profile open WhatsApp with body filled from **WhatsAppTemplate** content stored in DB (editable defaults per SRS §11.4).

**Templates:** Stored model **WhatsAppTemplate** (SRS §23.16); admin manages content; variables documented in template metadata. Substitution runs **server-side** when generating links for dashboard (avoids tampering); public site may use static strings or fetch public-safe templates if ever exposed read-only.

---

## 15. Future WhatsApp Business API readiness

Per SRS §11.1, §11.5, FR-WA-006, §28:

- Keep **template key** + **body** + **variables** model; a future **WhatsAppProvider** abstraction can implement:
  - **MVP:** `DeepLinkProvider` (current).
  - **Future:** `CloudApiProvider` sending template messages via Meta WhatsApp Business API with approved templates.
- **BullMQ** queues hold outbound message jobs (reminders, confirmations) when automation is licensed and templates are approved.
- **Configuration:** Environment-based Meta tokens/phone number IDs; **no** MVP dependency on Meta webhooks for core booking acceptance.

---

## 16. VAT / payment configuration architecture

**Admin-configurable** (SRS §4, §13):

- **System / tenant settings** (single-tenant MVP; structure allows future multi-tenant if ever needed): VAT enabled/disabled, default VAT rate, prices include VAT yes/no, show VAT on invoice yes/no, tax registration number.
- **Payment/deposit policy** enum or structured config: pay at salon, optional deposit, required deposit, future full online payment, manual Instapay confirmation (SRS §13.1).
- **Catalog:** Per service/package taxable flags (SRS §13.4, §8.2).

**Booking/invoice calculation:** Server-side **pricing service** reads VAT settings + line taxable flags + snapshots; produces subtotal, discount, VAT, total, paid, remaining on **Invoice** (SRS §13.4–13.5). **Payment** records manual entries with method (cash, card, Instapay, wallet, optional bank transfer; online future — SRS §13.2) and status (Unpaid, Partially Paid, Paid, Refunded, Cancelled — §13.3).

**MVP emphasis:** Pay at salon + manual deposit tracking + **future-ready** schema for online payment provider fields without activating online capture in MVP (SRS §13.1).

---

## 17. File upload / storage architecture

Per SRS §29:

- **Binary assets** (service images, gallery, staff photos, homepage banners — SRS file storage section) stored in **Cloudinary** or **S3-compatible** bucket.
- **API pattern:** NestJS issues **upload policy** (signed URL or Cloudinary signature); client uploads **direct to provider**; API stores **stable URL + public ID/key** in PostgreSQL entities (Service, Gallery, Staff, CMS blocks, etc.).
- **Security (SRS §26):** Validate MIME type/size, scan policy if required by deployment, never trust client path; strip executable content; dashboard-only uploads behind RBAC.

---

## 18. Reports architecture

Per SRS §21:

- **Read-only aggregations** over bookings, payments, clients, catalog usage, discounts, booking sources, payment methods.
- **Implementation options for MVP:** SQL views or Prisma aggregate queries + optional materialized views later for performance (SRS §25.1: reports within acceptable time).
- **Access:** Permission such as `reports.view`; financial subsets stricter (Owner/Admin per SRS §5.7).
- **Export:** CSV/PDF optional future; SRS requires reports to exist — exact export format is implementation detail.

---

## 19. Audit logging architecture

Per SRS §22, §23.18:

- On **sensitive actions**, append **AuditLog**: `userId`, `action`, `module`, `entityId`, `oldValue`, `newValue`, `ipAddress` (when available), `createdAt`.
- **Tracked examples** listed in SRS (booking lifecycle changes, slot marked filled, price change, discount applied, payment edit, VAT settings, role changes, user deleted/deactivated, invoice edited).
- **Implementation:** Interceptors or domain services emit audit rows in same transaction as critical writes where possible; async queue acceptable if eventual consistency is documented and risk accepted for non-financial events only.

**Retention:** Policy per compliance needs (not specified in SRS).

---

## 20. Environment variables

Group by concern (illustrative names — adjust to deployment):

| Area | Examples |
|------|-----------|
| **Database** | `DATABASE_URL` |
| **JWT** | `JWT_SECRET`, `JWT_EXPIRES_IN`, optional `JWT_REFRESH_SECRET` |
| **OAuth (client)** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, redirect URLs |
| **App URLs** | `PUBLIC_WEB_URL`, `DASHBOARD_URL`, `API_URL` (CORS origins) |
| **Locale / defaults** | `DEFAULT_TIMEZONE=Africa/Cairo`, `DEFAULT_CURRENCY=EGP` |
| **WhatsApp** | `WHATSAPP_DEFAULT_NUMBER` (E.164 without + for wa.me), optional per-branch overrides in DB |
| **File storage** | Cloudinary: `CLOUDINARY_*` — or S3: `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` |
| **Redis** | `REDIS_URL` (BullMQ) |
| **Future Meta** | `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID` (unused until phase) |
| **Payments (future)** | Provider keys when online payments ship |

Secrets must never be committed; use platform secret managers in production.

**Default timezone:** Unless deployment overrides `DEFAULT_TIMEZONE`, all **booking calendar dates** and **slot start/end times** are interpreted, validated, and serialized for clients and staff using the **Africa/Cairo** IANA zone (store UTC or store local date+time with explicit zone per implementation, but the default business zone is Cairo).

**Default currency:** Unless deployment overrides `DEFAULT_CURRENCY`, all **customer-facing prices**, booking totals, payments, and **invoices** are shown in **EGP**, consistent with SRS pricing examples.

---

## 21. Security considerations

From SRS §25.2, §26 and project rules:

- **Hash passwords**; protect dashboard APIs with JWT + RBAC.
- **Validate all input** (DTOs + server validation).
- **Rate limiting** on auth and sensitive endpoints.
- **Audit logs** for sensitive actions.
- **Secure file uploads** (§17, §26).
- **Branch and role scoping** so dashboard users only access permitted data.
- **Least privilege** for specialist/receptionist roles.
- **HTTPS** everywhere in production.
- **CORS** restricted to known web origins.

---

## 22. Future scalability notes

SRS §25.4 and §28 already list directions; architecture should **not** block:

- **Multi-branch** operations (data model ready).
- **WhatsApp Business API** automation and **appointment reminders** (queue + provider abstraction).
- **Online payments** (payment intent fields, webhooks).
- **Advanced staff availability engine** and **staff-specific booking** (explicitly future — do not entangle MVP booking with staff auto-scheduling).
- **Room/resource scheduling**, **inventory**, **products**, **loyalty**, **memberships**, **gift cards**, **referrals**, **mobile app**, **marketing automation**, **Google Calendar**, **Google/Meta reviews**, **advanced pixels**.

**Horizontal scaling:** Stateless API + connection-pooled PostgreSQL + Redis for sessions/queues; read replicas for reporting if load grows.

---

*End of architecture document.*
