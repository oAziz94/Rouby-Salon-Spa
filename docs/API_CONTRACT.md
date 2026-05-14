# REST API Contract — MVP (Alrouby Salon & Spa)

**Document type:** HTTP API surface (normative for MVP implementation)  
**Product source of truth:** `/docs/SRS.md`  
**Alignment:** `/docs/ARCHITECTURE.md`, `/docs/DATABASE_SCHEMA.md`, `/docs/RBAC_MATRIX.md`, `/docs/BOOKING_ENGINE_RULES.md`, `.cursor/rules/project-rules.mdc`

**Backend:** NestJS REST (`services/api` or `apps/api` per monorepo layout in `/docs/ARCHITECTURE.md`). **Repository:** npm **workspaces** at repo root; shared types/SDK may live in `packages/api-client` and consume this contract.

**Discovery:** Implement **OpenAPI 3** (e.g. `@nestjs/swagger`) in addition to this document; keep paths and DTOs in sync.

---

## Global MVP business rules (API-enforced)

| Rule | Reference |
|------|-----------|
| Public website booking submission **always** creates `Booking.status = PENDING` and `source = WEBSITE`. | SRS §10.3, FR-BK-006, `/docs/BOOKING_ENGINE_RULES.md` §9 |
| **Pending** bookings **do not** increment `BookingSlot.bookedCount`. | `/docs/BOOKING_ENGINE_RULES.md` §6 |
| **Confirmed**, **Rescheduled**, **Arrived**, **In Progress** consume slot capacity (`bookedCount`). | `/docs/BOOKING_ENGINE_RULES.md` §6 |
| Slot **capacity** and **status** (including manual **Filled**) are receptionist/dashboard controlled. | FR-BK-004, FR-BK-005, RBAC `slots.*` |
| Client **cancellation** and **reschedule** are **requests** only (no direct `bookings.cancel` / slot mutation). Staff fulfill via dashboard. | `/docs/BOOKING_ENGINE_RULES.md` §11–§13 |
| Client **request** window: only if `now <= slotStart - 24h` (slot start from `BookingSlot.date` + `startTime`, evaluated in **branch timezone** for this rule per booking engine doc). Outside window: API returns error with guidance to WhatsApp/phone. | FR-BK-008, `/docs/BOOKING_ENGINE_RULES.md` §13 |
| Staff actions have **no** 24-hour limit; RBAC governs who may override. | SRS §10.7 |
| One **Booking** has many **BookingItem** rows; each item persists **snapshots** (`nameSnapshot`, `priceSnapshot`, `durationMinutesSnapshot`). | FR-BK-001, FR-BK-009 |
| **VAT** and **payment/deposit policy** are read from configurable settings; admin updates via guarded endpoints. | FR-PAY-001, FR-VAT-001 |
| **WhatsApp MVP:** deep links only (no Business API). | FR-WA-001–006, `/docs/ARCHITECTURE.md` §14 |
| **RBAC** enforced on **every** protected handler (guards); client routes enforce **ownership** (clientId). | FR-AUTH-004, `/docs/RBAC_MATRIX.md` |

---

## 1. API conventions

### 1.1 Base URL and versioning

| Item | Convention |
|------|------------|
| **Base URL** | `https://{API_HOST}/api/v1` — `{API_HOST}` from deployment (`API_URL` per `/docs/ARCHITECTURE.md` §20). |
| **Versioning** | **URI prefix** `v1`. Breaking changes ship as `v2` later. |
| **Trailing slashes** | Accept **without** trailing slash; redirects optional. |

### 1.2 Format

- **Request/response bodies:** `Content-Type: application/json; charset=utf-8`.
- **Unicode:** UTF-8.
- **Identifiers:** UUIDs as lowercase strings in JSON.
- **Money:** Decimal numbers in **EGP** (default currency per `/docs/ARCHITECTURE.md` §20, `/docs/DATABASE_SCHEMA.md`). Document `currency: "EGP"` on totals where ambiguity could exist (e.g. invoices).

### 1.3 Pagination (list endpoints)

Query parameters:

| Param | Type | Default | Max |
|-------|------|---------|-----|
| `page` | integer | `1` | — |
| `pageSize` | integer | `20` | `100` (cap server-side) |

**Response envelope** (lists):

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false
  }
}
```

Optional `sort` / `order` query params per resource (documented per section). **Cursor pagination** may be added later for large logs without changing `v1` list shape if wrapped in `meta.nextCursor`.

### 1.4 Error response format

Align with NestJS HTTP exceptions (adjust `message` for validation arrays):

```json
{
  "statusCode": 400,
  "message": "Human-readable message or string[] for validation",
  "error": "Bad Request",
  "code": "BOOKING_SLOT_FULL"
}
```

| HTTP | Meaning |
|------|---------|
| `400` | Validation / business rule violation |
| `401` | Missing or invalid auth |
| `403` | Authenticated but forbidden (RBAC or ownership) |
| `404` | Resource not found or not visible in scope |
| `409` | Conflict (e.g. optimistic locking, duplicate) |
| `429` | Rate limited |
| `500` | Server error |

**Optional** stable `code` string for clients (e.g. `CLIENT_PHONE_REQUIRED`, `CANCEL_WINDOW_EXPIRED`, `SLOT_NOT_ONLINE`).

### 1.5 Authentication headers

| Audience | Header |
|----------|--------|
| **Dashboard** | `Authorization: Bearer <dashboard_access_token>` |
| **Client** | `Authorization: Bearer <client_access_token>` |

Tokens are **JWT**s with distinguishable **audience** or **claim** (`typ` / `aud`: `dashboard` vs `client`) so a client token cannot call dashboard-only routes.

**Refresh:** Optional `POST /api/v1/auth/refresh` (dashboard/client variants or body discriminator); TTL is implementation detail per `/docs/ARCHITECTURE.md` §7.

### 1.6 Date and time

| Context | Rule |
|---------|------|
| **API serialization** | ISO 8601: instant fields as `timestamptz` in UTC with `Z` offset, **or** `date` as `YYYY-MM-DD` and wall times as `HH:mm` when stored as separate columns per `/docs/DATABASE_SCHEMA.md`. |
| **Business timezone** | Default **Africa/Cairo** for booking calendar, slot `date`/`startTime` interpretation, and **public slot picker** “no past slots” rule per `/docs/BOOKING_ENGINE_RULES.md` §6 and `/docs/ARCHITECTURE.md` §20. |
| **24-hour client rule** | Evaluated using **branch timezone** when configured; else default Cairo (per `/docs/BOOKING_ENGINE_RULES.md` §13). |

### 1.7 Branch scoping (dashboard)

- Branch-scoped users (`User.branchId`): server **filters** and **validates** `branchId` on writes; do not trust client-supplied branch for authorization.
- Optional query `branchId` only where Owner/Admin may select scope; otherwise derive from JWT.

### 1.8 Rate limiting

Apply stricter limits to `POST .../auth/login`, `POST .../client/auth/*`, public booking submit, and password reset (if added). Per SRS non-functional expectations and `/docs/ARCHITECTURE.md` §21.

### 1.9 Idempotency (recommended)

Optional header `Idempotency-Key: <uuid>` on `POST` mutations that create payments or bookings to avoid duplicates on retry.

---

## 2. Public website APIs

**Auth:** `Public` — no JWT unless noted. **Rate limit** public catalog and slot endpoints.

### 2.1 Catalog and content

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/public/categories` | Public | — | Active categories; `sortOrder`. |
| `GET` | `/public/services` | Public | — | Query: `categoryId`, `branchId`, `isActive=true` default. |
| `GET` | `/public/services/{serviceId}` | Public | — | Detail + branch availability summary. |
| `GET` | `/public/services/{serviceId}/variants` | Public | — | Active variants. |
| `GET` | `/public/packages` | Public | — | Filter by `branchId`, date validity. |
| `GET` | `/public/packages/{packageId}` | Public | — | Included services summary. |
| `GET` | `/public/bundles` | Public | — | |
| `GET` | `/public/bundles/{bundleId}` | Public | — | Eligible services, rules. |
| `GET` | `/public/offers` | Public | — | Active offers only; no secret stack eligibility beyond public rules. |
| `GET` | `/public/gallery` | Public | — | Active `GalleryItem`, ordered. |
| `GET` | `/public/testimonials` | Public | — | Approved reviews with `displayOnWebsite=true`. |

**Response example** (`GET /public/services` item shape, illustrative):

```json
{
  "data": [
    {
      "id": "uuid",
      "categoryId": "uuid",
      "name": "Haircut",
      "basePrice": 200,
      "currency": "EGP",
      "durationMinutes": 45,
      "isTaxable": true,
      "imageUrl": "https://..."
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1, "hasNextPage": false }
}
```

### 2.2 Branches and contact

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/public/branches` | Public | — | Active branches; phone, WhatsApp, map, hours. |
| `GET` | `/public/branches/{branchId}` | Public | — | Single branch public profile. |

### 2.3 Public slots (online picker)

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/public/branches/{branchId}/slots` | Public | — | Query: `date` (`YYYY-MM-DD`). Returns only slots that satisfy **online predicate** in `/docs/BOOKING_ENGINE_RULES.md` §6–§8 (including **Africa/Cairo** “start not in past”, `isOnlineBookable`, `AVAILABLE`, capacity, not `FILLED`/`BLOCKED`/`CLOSED`). |

### 2.4 Booking estimate (pre-submit)

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `POST` | `/public/bookings/estimate` | Public | — | **Read-only** pricing: current catalog + VAT/policy; **does not** persist. Optional client JWT to apply known client offers. |

**Request body example:**

```json
{
  "branchId": "uuid",
  "items": [
    { "itemType": "SERVICE_VARIANT", "serviceId": "uuid", "serviceVariantId": "uuid", "quantity": 1 }
  ]
}
```

**Response example** (VAT-exclusive subtotal; VAT applied on top):

```json
{
  "subtotal": 200,
  "discountAmount": 0,
  "vatRate": 0.14,
  "vatAmount": 28,
  "totalAmount": 228,
  "currency": "EGP",
  "pricesIncludeVat": false
}
```

### 2.5 Public booking submission

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `POST` | `/public/bookings` | Client | Client JWT + **phone present** on `Client` (FR-AUTH-002) | Creates **PENDING** booking; nested `items[]`; server writes **snapshots**; **no** `bookedCount` increment. Reject if slot no longer public-eligible. |

**Request body example:**

```json
{
  "branchId": "uuid",
  "slotId": "uuid",
  "clientNotes": "optional",
  "items": [
    { "itemType": "PACKAGE", "packageId": "uuid", "quantity": 1 }
  ]
}
```

**Response example:**

```json
{
  "id": "uuid",
  "status": "PENDING",
  "branchId": "uuid",
  "slotId": "uuid",
  "totalAmount": 450,
  "currency": "EGP",
  "createdAt": "2026-05-02T10:00:00.000Z"
}
```

---

## 3. Client auth APIs

**Auth:** `Client` JWT for protected routes below.

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `POST` | `/client/auth/otp/request` | Public | — | Request login OTP by phone. Phone is normalized to E.164. `429` when rate-limited. In non-production only, response may include `devCode` for safe local testing. |
| `POST` | `/client/auth/otp/verify` | Public | — | Verify OTP and return client JWT (`aud=client`) + client profile. OTP expires (default 5 minutes), consumed on success, attempts limited. |
| `POST` | `/client/auth/logout` | Client | Session | Stateless MVP logout; client clears local token after success. |
| `GET` | `/client/me` | Client | Own | Profile: `fullName`, `email`, normalized E.164 `phone`, `profileImageUrl`, etc. |
| `GET` | `/client/bookings` | Client | Own | Paginated; filter `status`. |
| `GET` | `/client/bookings/{bookingId}` | Client | Own | Detail + items (snapshots visible to owner). |
| `POST` | `/client/bookings/{bookingId}/cancellation-requests` | Client | Own | **Request only**; validates 24h rule; persists **`BookingChangeRequest`** (`requestType=CANCEL`, `status=PENDING`); does **not** set booking `CANCELLED`. |
| `POST` | `/client/bookings/{bookingId}/reschedule-requests` | Client | Own | Body: `{ "requestedSlotId": "uuid", "reason": "optional" }`. **Request only**; persists **`BookingChangeRequest`** (`requestType=RESCHEDULE`); staff fulfillment via dashboard approve. Validates 24h rule. |

**Cancellation/reschedule request response example:**

```json
{
  "id": "uuid",
  "bookingId": "uuid",
  "requestType": "CANCEL",
  "status": "PENDING",
  "createdAt": "2026-05-02T10:00:00.000Z"
}
```

**Persistence:** `/docs/DATABASE_SCHEMA.md` (`BookingChangeRequest`). Behavior rules: `/docs/BOOKING_ENGINE_RULES.md` §11–§13.

**Phone normalization policy (client OTP + dashboard client writes):**

- Accept valid international inputs for any country.
- Accept `+` prefix as international.
- Accept `00` prefix and normalize to `+`.
- For local numbers without `+`/`00`, parse with default country `EG`.
- Store `Client.phone` in normalized **E.164** format only.
- Reject invalid numbers with `400` and `code = PHONE_INVALID`.
- `Client.phone` uniqueness is enforced on normalized values.

---

## 4. Dashboard auth APIs

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `POST` | `/dashboard/auth/login` | Public | — | Body: `{ "email", "password" }`. Returns access (+ refresh) token. |
| `POST` | `/dashboard/auth/logout` | Dashboard | Session | Invalidate refresh token. |
| `GET` | `/dashboard/auth/me` | Dashboard | Authenticated | Current user: `id`, `name`, `email`, `roleId`, `branchId`, `staffId?`. |
| `GET` | `/dashboard/auth/permissions` | Dashboard | Authenticated | **Permissions / “me”**: flat list of permission keys for UI gating; **must match** server enforcement. |

**Login response example:**

```json
{
  "accessToken": "jwt",
  "expiresIn": 3600,
  "user": {
    "id": "uuid",
    "name": "Reception",
    "email": "rec@salon.com",
    "roleId": "uuid",
    "branchId": "uuid"
  }
}
```

---

## 5. Dashboard booking APIs

Base path: `/dashboard/bookings`. **Auth:** `Dashboard`. Branch filter automatic for Branch Manager/Receptionist.

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/bookings` | Dashboard | `bookings.read` | Query: `branchId`, `status`, `dateFrom`, `dateTo`, `clientId`, `slotId`, pagination. |
| `GET` | `/dashboard/bookings/{bookingId}` | Dashboard | `bookings.read` | Full detail + items + payments summary per RBAC. Includes `activeQueueEntryId` when a `QueueEntry` is **WAITING** or **IN_SERVICE** for this booking. |
| `POST` | `/dashboard/bookings` | Dashboard | `bookings.create` | Manual booking; body includes `source` (non-WEBSITE), `clientId`, `slotId`, `items[]`. May create **CONFIRMED** or **PENDING** per `/docs/BOOKING_ENGINE_RULES.md` §9; apply `bookedCount` when status counts. |
| `POST` | `/dashboard/bookings/{bookingId}/confirm` | Dashboard | `bookings.confirm` | PENDING → CONFIRMED; capacity check + optional override per booking engine. |
| `POST` | `/dashboard/bookings/{bookingId}/reject` | Dashboard | `bookings.reject` | PENDING → REJECTED. |
| `POST` | `/dashboard/bookings/{bookingId}/require-follow-up` | Dashboard | `bookings.status.progress` | PENDING → REQUIRES_FOLLOW_UP (typical). |
| `POST` | `/dashboard/bookings/{bookingId}/reschedule` | Dashboard | `bookings.reschedule` | Body: `{ "slotId": "new-uuid" }`. Normative: → **RESCHEDULED**, slot move + `bookedCount` per `/docs/BOOKING_ENGINE_RULES.md` §11. |
| `POST` | `/dashboard/bookings/{bookingId}/confirm-reschedule` | Dashboard | `bookings.confirm` | **RESCHEDULED** → **CONFIRMED** after client acknowledgement (`/docs/BOOKING_ENGINE_RULES.md` §11); no `bookedCount` change. Branch + state guards required. |
| `POST` | `/dashboard/bookings/{bookingId}/cancel` | Dashboard | `bookings.cancel` | Sets CANCELLED; decrement `bookedCount` if counted. |
| `POST` | `/dashboard/bookings/{bookingId}/mark-arrived` | Dashboard | `bookings.status.progress` | Specialist **Own** only on assigned lines where applicable (RBAC §3.2). |
| `POST` | `/dashboard/bookings/{bookingId}/mark-in-progress` | Dashboard | `bookings.status.progress` | |
| `POST` | `/dashboard/bookings/{bookingId}/mark-completed` | Dashboard | `bookings.status.progress` | |
| `POST` | `/dashboard/bookings/{bookingId}/mark-no-show` | Dashboard | `bookings.status.progress` | |
| `POST` | `/dashboard/bookings/{bookingId}/recalculate-pricing` | Dashboard | `bookings.update` | **Pending only**; refreshes snapshots from catalog; audit `booking.price_recalculated`. |
| `POST` | `/dashboard/bookings/{bookingId}/discount` | Dashboard | `bookings.discount.apply` | Body: `{ "discountAmount": 50, "reason": "..." }`; audited. |
| `POST` | `/dashboard/bookings/{bookingId}/check-in` | Dashboard | `queue.manage` **and** `bookings.status.progress` | Eligible booking statuses: **CONFIRMED**, **RESCHEDULED**, **ARRIVED**. Creates `QueueEntry` (**WAITING**, `source=BOOKING`); **CONFIRMED**/**RESCHEDULED** → **ARRIVED** via existing lifecycle. **409** `QUEUE_ACTIVE_FOR_BOOKING` when an active queue row exists. Audit `queue.checked_in_from_booking`. |

**PATCH** `/dashboard/bookings/{bookingId}` — `bookings.update`: non-status fields, `adminNotes`, slot reassignment only if product allows without going through reschedule workflow (default: use reschedule endpoint for slot changes).

### 5.1 Booking change requests (dashboard)

Base: `/dashboard/booking-change-requests`. **Auth:** `Dashboard`. List/detail filtered by authorized **branch** (via parent booking).

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/booking-change-requests` | Dashboard | `bookings.read` | Query: `status`, `branchId`, `bookingId`, pagination. |
| `GET` | `/dashboard/booking-change-requests/{requestId}` | Dashboard | `bookings.read` | Includes booking summary, client ref, `requestedSlotId` when set. |
| `POST` | `/dashboard/booking-change-requests/{requestId}/approve` | Dashboard | `bookings.cancel` **or** `bookings.reschedule` | **Approve** only when request `status=PENDING`. If `requestType=CANCEL`: requires `bookings.cancel` — runs **staff cancellation** workflow on the booking (`/docs/BOOKING_ENGINE_RULES.md` §12). If `requestType=RESCHEDULE`: requires `bookings.reschedule` — runs **staff reschedule** workflow (new `slotId` from `requestedSlotId`, §11). Sets request `status=APPROVED`, `handledByUserId`, `handledAt`. **Audit-log** every outcome. |
| `POST` | `/dashboard/booking-change-requests/{requestId}/reject` | Dashboard | `bookings.read` | Sets request `status=REJECTED`; **booking unchanged**. `handledByUserId`, `handledAt`. **Audit-log**. |
| `POST` | `/dashboard/booking-change-requests/{requestId}/cancel` | Dashboard | `bookings.read` | Sets request `status=CANCELLED` (void/supersede **request** row only; **does not** cancel the booking). `handledByUserId`, `handledAt`. **Audit-log**. |

**Rules:** Approving cancellation executes the same domain outcome as `POST /dashboard/bookings/{bookingId}/cancel` (capacity + status). Approving reschedule executes the same domain outcome as `POST /dashboard/bookings/{bookingId}/reschedule` (including **RESCHEDULED** + `bookedCount` per booking engine). Rejecting leaves the **booking** unchanged. All actions emit **`AuditLog`** rows.

### 5.2 Operational queue (dashboard MVP)

Base path: `/dashboard/queue`. **Branch-scoped.** Multi-branch users must pass **`branchId`**. Same-day operational board: **`Booking`** remains the scheduled appointment; **`QueueEntry`** is the front-desk visit row (see `/docs/DATABASE_SCHEMA.md`). **No** invoice/payment side effects from queue endpoints in this MVP.

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/queue` | Dashboard | `queue.read` | Query: **`date`** (`YYYY-MM-DD`, UTC day boundary; default today), **`branchId`** (when needed), optional **`status`**. Default result set: **WAITING** / **IN_SERVICE** (open visits for the branch) plus **COMPLETED** rows whose **`completedAt`** falls on **`date`**. |
| `POST` | `/dashboard/queue/walk-ins` | Dashboard | `queue.manage` | Body: `branchId`, optional **`clientId`** (existing CRM row; snapshots taken from client record; visibility rules apply), **or** `clientName` with optional `phone` / `notes` / `items[]` when **`clientId`** omitted (same booking-line shape for `items[]`). Phone normalization + link/create behavior unchanged when not using **`clientId`**. Audit **`queue.created`**. |
| `PATCH` | `/dashboard/queue/{queueEntryId}` | Dashboard | `queue.manage` | Notes only (`notes`). |
| `POST` | `/dashboard/queue/{queueEntryId}/start` | Dashboard | `queue.manage` | **WAITING** → **IN_SERVICE**. If **`bookingId`** set: also **`bookings.status.progress`** required; delegates **`mark-in-progress`**. Audit **`queue.started`**. |
| `POST` | `/dashboard/queue/{queueEntryId}/complete` | Dashboard | `queue.manage` | **WAITING** / **IN_SERVICE** → **COMPLETED**. If **`bookingId`** set: also **`bookings.status.progress`** required; delegates **`mark-completed`**. Audit **`queue.completed`**. |
| `POST` | `/dashboard/queue/{queueEntryId}/cancel` | Dashboard | `queue.manage` | **WAITING** / **IN_SERVICE** → **CANCELLED**; booking unchanged. Audit **`queue.cancelled`**. |

**Duplicate guard:** at most one active (**WAITING** or **IN_SERVICE**) **`QueueEntry`** per **`bookingId`**; **`409`** `QUEUE_ACTIVE_FOR_BOOKING` on check-in when violated (application check).

---

## 6. Booking slot APIs

Base: `/dashboard/branches/{branchId}/slots` (or `/dashboard/slots?branchId=` — pick one convention in implementation; table uses branch-scoped path).

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/branches/{branchId}/slots` | Dashboard | `slots.read` | Query: `dateFrom`, `dateTo`, `status`. |
| `GET` | `/dashboard/branches/{branchId}/slots/{slotId}` | Dashboard | `slots.read` | |
| `POST` | `/dashboard/branches/{branchId}/slots` | Dashboard | `slots.create` | Body: `date`, `startTime`, `endTime`, `capacity`, `isOnlineBookable`, `status`, `notes`. |
| `POST` | `/dashboard/branches/{branchId}/slots/generate-week` | Dashboard | `slots.create` | Body: `weekStartDate` (`YYYY-MM-DD`) plus optional overrides (`workingDays`, `startTime`, `endTime`, `slotDurationMinutes`, `defaultCapacity`, `defaultOnlineBookable`, `breakPeriods`). Creates **7 calendar days** of `AVAILABLE` slots from saved defaults; skips duplicates (same branch/date/start/end, active rows only); audit `slots.week_generated`. Returns `{ createdCount, skippedCount, dateFrom, dateTo }`. |
| `PATCH` | `/dashboard/branches/{branchId}/slots/{slotId}` | Dashboard | `slots.update` | Times, notes, `isOnlineBookable`; capacity may require separate permission below. |
| `PATCH` | `/dashboard/branches/{branchId}/slots/{slotId}/capacity` | Dashboard | `slots.capacity.configure` | Body: `{ "capacity": 5 }`; audit `slot.capacity_changed`. |
| `PATCH` | `/dashboard/branches/{branchId}/slots/{slotId}/online-bookable` | Dashboard | `slots.update` | Body: `{ "isOnlineBookable": false }`. |
| `PATCH` | `/dashboard/branches/{branchId}/slots/{slotId}/status` | Dashboard | `slots.status.manage` | Body: `{ "status": "FILLED" }`; manual **Filled** per FR-BK-005; audit `slot.marked_filled` when entering FILLED. |
| `DELETE` | `/dashboard/branches/{branchId}/slots/{slotId}` | Dashboard | `slots.delete` | **Soft deactivate** preferred (project rules); if hard delete, reject when bookings reference slot. |

---

## 7. Catalog management APIs

Base `/dashboard/...`. **Auth:** `Dashboard`.

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/service-categories` | Dashboard | `services.read` | Admin: `services.categories.manage` for mutations. |
| `POST` | `/dashboard/service-categories` | Dashboard | `services.categories.manage` | |
| `PATCH` | `/dashboard/service-categories/{id}` | Dashboard | `services.categories.manage` | |
| `GET` | `/dashboard/services` | Dashboard | `services.read` | |
| `POST` | `/dashboard/services` | Dashboard | `services.manage` | Include branch links, taxable, images via upload URL pattern. |
| `PATCH` | `/dashboard/services/{id}` | Dashboard | `services.manage` | |
| `PATCH` | `/dashboard/services/{id}/status` | Dashboard | `services.manage` | Body: `{ "isActive": false }` — soft **deactivate** / reactivate catalog row (project rules). |
| `GET` | `/dashboard/services/{serviceId}/variants` | Dashboard | `service_variants.read` | |
| `POST` | `/dashboard/services/{serviceId}/variants` | Dashboard | `service_variants.manage` | |
| `PATCH` | `/dashboard/service-variants/{id}` | Dashboard | `service_variants.manage` | |
| `PATCH` | `/dashboard/service-variants/{id}/status` | Dashboard | `service_variants.manage` | Body: `{ "isActive": false }`. |
| `GET` | `/dashboard/packages` | Dashboard | `packages.read` | |
| `POST` | `/dashboard/packages` | Dashboard | `packages.manage` | |
| `PATCH` | `/dashboard/packages/{id}` | Dashboard | `packages.manage` | |
| `PATCH` | `/dashboard/packages/{id}/status` | Dashboard | `packages.manage` | Body: `{ "isActive": false }`. |
| `GET` | `/dashboard/bundles` | Dashboard | `bundles.read` | |
| `POST` | `/dashboard/bundles` | Dashboard | `bundles.manage` | |
| `PATCH` | `/dashboard/bundles/{id}` | Dashboard | `bundles.manage` | |
| `PATCH` | `/dashboard/bundles/{id}/status` | Dashboard | `bundles.manage` | Body: `{ "isActive": false }`. |
| `GET` | `/dashboard/offers` | Dashboard | `offers.read` | `/docs/RBAC_MATRIX.md` §3.9. |
| `POST` | `/dashboard/offers` | Dashboard | `offers.manage` | |
| `PATCH` | `/dashboard/offers/{id}` | Dashboard | `offers.manage` | |
| `PATCH` | `/dashboard/offers/{id}/status` | Dashboard | `offers.manage` | Body: `{ "isActive": false }`. |

**Upload:** `POST /dashboard/uploads/presign` — RBAC per resource (e.g. `services.manage`); returns signed URL for Cloudinary/S3 per `/docs/ARCHITECTURE.md` §17.

---

## 8. Client management APIs

Base: `/dashboard/clients`.

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/clients` | Dashboard | **`clients.read` OR `queue.manage`** | Pagination + search (name, phone, email). Branch-scoped visibility per matrix. **`queue.manage`** enables search for walk-in client picker without CRM-only permission. |
| `GET` | `/dashboard/clients/{clientId}` | Dashboard | `clients.read` | Without `clients.contact.view`: **omit** phone/email or mask. Without `clients.notes.sensitive`: **omit** `notes`, `allergiesOrWarnings`. |
| `POST` | `/dashboard/clients` | Dashboard | `clients.create` | |
| `PATCH` | `/dashboard/clients/{clientId}` | Dashboard | `clients.update` | Sensitive fields require `clients.notes.sensitive` for allergies/notes edits. |
| `GET` | `/dashboard/clients/{clientId}/contact` | Dashboard | `clients.contact.view` | Optional dedicated endpoint for phone/email. |

---

## 9. Staff, branch, users, roles APIs

### 9.1 Staff

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/staff` | Dashboard | `staff.manage` or `staff.schedules.read` | Scope by branch for managers. |
| `POST` | `/dashboard/staff` | Dashboard | `staff.manage` | `dashboardLoginEnabled`, link `userId` when applicable. |
| `PATCH` | `/dashboard/staff/{staffId}` | Dashboard | `staff.manage` | |
| `GET` | `/dashboard/staff/{staffId}/schedule` | Dashboard | `staff.schedules.read` | Specialist **Own**; filter to self. |
| `PUT` | `/dashboard/branches/{branchId}/staff-schedules` | Dashboard | `staff.schedules.manage` | MVP shape: implementation-defined JSON for branch schedule (SRS §5.5). |

### 9.2 Branches

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/branches` | Dashboard | `branches.read` | |
| `GET` | `/dashboard/branches/{branchId}` | Dashboard | `branches.read` | |
| `POST` | `/dashboard/branches` | Dashboard | `branches.manage` | Owner |
| `PATCH` | `/dashboard/branches/{branchId}` | Dashboard | `branches.manage` | Hours, WhatsApp, map. |
| `PATCH` | `/dashboard/branches/{branchId}/settings` | Dashboard | `settings.branch.manage` | Branch operational settings (SRS §5.5). |

### 9.3 Users (dashboard identities)

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/users` | Dashboard | `users.read` | Owner |
| `POST` | `/dashboard/users` | Dashboard | `users.manage` | Body: role, branch, email, password (set/invite). |
| `PATCH` | `/dashboard/users/{userId}` | Dashboard | `users.manage` | Deactivate: `isActive: false`. |
| `GET` | `/dashboard/users/{userId}` | Dashboard | `users.read` | |

### 9.4 Roles and permissions

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/roles` | Dashboard | `roles.read` | Owner |
| `GET` | `/dashboard/roles/{roleId}` | Dashboard | `roles.read` | Include permission keys. |
| `PATCH` | `/dashboard/roles/{roleId}/permissions` | Dashboard | `roles.manage` | Replace permission set; **audit** role changes. |
| `GET` | `/dashboard/permissions` | Dashboard | `roles.read` | Catalog of all permission keys for UI. |

---

## 10. Payment, invoice, VAT, and policy APIs

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `POST` | `/dashboard/bookings/{bookingId}/payments` | Dashboard | `payments.record` | Full payment row: amount, method, status, reference. |
| `PATCH` | `/dashboard/payments/{paymentId}` | Dashboard | `payments.record` or `payments.refund` | Adjustments; sensitive. |
| `PATCH` | `/dashboard/bookings/{bookingId}/payment-status` | Dashboard | `payments.record_simple` | **Simple** status update when product enables for Receptionist (SRS §5.3). |
| `GET` | `/dashboard/bookings/{bookingId}/payments` | Dashboard | `payments.read` | |
| `GET` | `/dashboard/invoices` | Dashboard | `invoices.read` | Query by booking, client, date. |
| `POST` | `/dashboard/bookings/{bookingId}/invoices` | Dashboard | `invoices.create_finalize` | Generate from booking snapshots + VAT display rules. |
| `GET` | `/dashboard/invoices/{invoiceId}` | Dashboard | `invoices.read` | |
| `PATCH` | `/dashboard/invoices/{invoiceId}` | Dashboard | `invoices.edit` | Audited edits. |
| `GET` | `/dashboard/settings/vat` | Dashboard | `vat.settings.read` | |
| `PATCH` | `/dashboard/settings/vat` | Dashboard | `vat.settings.manage` | Admin; audit. |
| `GET` | `/dashboard/settings/payment-policy` | Dashboard | `payments.policy.read` | |
| `PATCH` | `/dashboard/settings/payment-policy` | Dashboard | `payments.policy.manage` | Admin |
| `GET` | `/dashboard/settings/slot-generation` | Dashboard | `slots.read` | Returns global JSON defaults (`schemaVersion`, `workingDays`, `startTime`, `endTime`, `slotDurationMinutes`, `defaultCapacity`, `defaultOnlineBookable`, optional `breakPeriods`). |
| `PATCH` | `/dashboard/settings/slot-generation` | Dashboard | `slots.create` **and** `slots.capacity.configure` | Partial body merged into stored defaults; validated; audit `slot_generation.defaults.updated`. |

**Record payment request example:**

```json
{
  "amount": 100,
  "method": "CASH",
  "status": "PAID",
  "reference": null,
  "paidAt": "2026-05-02T12:00:00.000Z"
}
```

---

## 11. WhatsApp APIs

MVP: **deep link generation** only (`/docs/ARCHITECTURE.md` §14).

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/whatsapp-templates` | Dashboard | `whatsapp.templates.read` / `manage` / `send` | Query: `search`, `category`, `language` (`ar` \| `en` \| `all`), `isActive`, `page`, `limit`. Each row has `language` and suffixed `templateKey` (e.g. `BOOKING_CONFIRMED_EN`). |
| `POST` | `/dashboard/whatsapp-templates` | Dashboard | `whatsapp.templates.manage` | |
| `PATCH` | `/dashboard/whatsapp-templates/{id}` | Dashboard | `whatsapp.templates.manage` | |
| `POST` | `/dashboard/whatsapp/deep-link` | Dashboard | `whatsapp.send` | Body: `{ "templateKey": "BOOKING_CONFIRMED", "bookingId": "uuid", "language": "ar" \| "en" }`. If `templateKey` has no `_EN`/`_AR` suffix, `language` selects the matching row (`_AR` / `_EN`). Returns `{ "url": "https://wa.me/...", "displayText": "..." }`. |

**Public site** may use static `wa.me` links from branch config without this endpoint.

---

## 12. Content APIs

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/gallery` | Dashboard | `gallery.read` | |
| `POST` | `/dashboard/gallery` | Dashboard | `gallery.manage` | |
| `PATCH` | `/dashboard/gallery/{id}` | Dashboard | `gallery.manage` | |
| `PATCH` | `/dashboard/gallery/{id}/status` | Dashboard | `gallery.manage` | Body: `{ "isActive": false }` — soft hide from public gallery while retaining row. |
| `GET` | `/dashboard/reviews` | Dashboard | `reviews.read` | Queue statuses. |
| `PATCH` | `/dashboard/reviews/{id}` | Dashboard | `reviews.manage` | Approve/reject/hide; `displayOnWebsite`. |
| `GET` | `/dashboard/cms/site` | Dashboard | `content.read` | Homepage, banners, featured IDs, SEO, contact blocks (SRS §20). |
| `PATCH` | `/dashboard/cms/site` | Dashboard | `content.manage` | Partial updates; version in audit if needed. |

---

## 13. Reports APIs

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/reports/overview` | Dashboard | `overview.read` | Today’s bookings, pending count, revenue widgets (SRS §17.2). Specialist: **Own** aggregates. |
| `GET` | `/dashboard/reports/operational` | Dashboard | `reports.view` | Bookings by status, services usage, sources; branch-scoped. |
| `GET` | `/dashboard/reports/financial` | Dashboard | `reports.view_financial` | Revenue, discounts, payment methods — **Owner** default; **Admin** only if role granted (RBAC matrix note). |

Query params: `branchId`, `dateFrom`, `dateTo`, `groupBy`.

---

## 14. Audit log APIs

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/audit-logs` | Dashboard | `audit.read` | Owner |

**Query filters:** `module`, `entityId`, `userId`, `action`, `dateFrom`, `dateTo`, `page`, `pageSize`.

**Action keys** (examples): see `/docs/BOOKING_ENGINE_RULES.md` §20 (`booking.confirmed`, `slot.capacity_changed`, etc.).

---

## 15. System settings (global)

| Method | Path | Auth | Required permission | Notes |
|--------|------|------|---------------------|-------|
| `GET` | `/dashboard/settings/system` | Dashboard | `settings.system.read` | |
| `PATCH` | `/dashboard/settings/system` | Dashboard | `settings.system.manage` | Owner; non-VAT global flags. |

---

## 16. Health and metadata (implementation)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET` | `/health` | Public | Liveness for load balancers (optional prefix outside `v1`). |
| `GET` | `/api/v1/openapi.json` | Configurable | OpenAPI document if exposed. |

---

## 17. Endpoint summary (quick index)

| Area | Base path |
|------|-----------|
| Public catalog / branches / slots / estimate / booking | `/api/v1/public/...` |
| Client session / profile / bookings / requests | `/api/v1/client/...` |
| Dashboard auth | `/api/v1/dashboard/auth/...` |
| Dashboard bookings + **booking-change-requests** | `/api/v1/dashboard/bookings/...`, `/api/v1/dashboard/booking-change-requests/...` |
| Dashboard operations (else) | `/api/v1/dashboard/...` |

---

*End of API contract.*
