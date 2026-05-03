# Database Schema — Alrouby Salon & Spa Booking & Management System

**Document type:** Logical / physical data model reference  
**Product source of truth:** `/docs/SRS.md`  
**Alignment:** `/docs/ARCHITECTURE.md`, `.cursor/rules/project-rules.mdc`  
**Technology:** PostgreSQL, Prisma ORM (per SRS §29 and architecture)

This document describes tables, fields, relationships, enums, indexing, soft-delete behavior, audit logging, and booking-related rules. It does not introduce requirements beyond the SRS.

**Defaults (aligned with `/docs/ARCHITECTURE.md`):** Default timezone **Africa/Cairo**; default currency **EGP**. All **booking** dates, **slot** dates, and **appointment** times use the **Africa/Cairo** timezone by default. All **monetary amounts** are stored and displayed in **EGP** by default.

---

## 1. Main entities

Core entity groups:

| Domain | Entities |
|--------|-----------|
| **Organization** | `Branch` |
| **Catalog** | `ServiceCategory`, `Service`, `ServiceVariant`, `ServiceBranch`, `Package`, `PackageService`, `PackageBranch`, `Bundle`, `BundleService`, `Offer` |
| **Booking** | `BookingSlot`, `Booking`, `BookingItem`, `BookingChangeRequest` |
| **People** | `Client`, `ClientIdentity` (OAuth linkage), `Staff`, `StaffService`, `User` (dashboard) |
| **Access control** | `Role`, `Permission`, `RolePermission` |
| **Money** | `Payment`, `Invoice`, `SystemSettings` (VAT + payment/deposit policy) |
| **Comms** | `WhatsAppTemplate` |
| **Content** | `GalleryItem`, `Review` |
| **Compliance** | `AuditLog` |

**SRS §23** defines primary models; additional junction/link tables above are structural only (they implement SRS many-to-many or implied fields such as “included services,” “branch availability,” “services they can perform,” and social login).

---

## 2. Fields for each entity

Types are PostgreSQL-oriented (`uuid`, `text`, `boolean`, `timestamptz`, `numeric`, `integer`, `date`, `time`, `jsonb`). Exact Prisma types may differ (`String`, `DateTime`, `Decimal`).

### Branch — SRS §16, §23.5

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `name` | text | |
| `address` | text | |
| `phone` | text | |
| `whatsapp` | text | WhatsApp number |
| `mapUrl` | text | Google Maps link |
| `workingHours` | jsonb or text | Structured hours if JSON |
| `isActive` | boolean | |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

### ServiceCategory — SRS §8.1, §23.6

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `name` | text | |
| `description` | text | nullable |
| `imageUrl` | text | nullable; stored asset URL |
| `sortOrder` | integer | |
| `isActive` | boolean | |
| `createdAt` / `updatedAt` | timestamptz | |

### Service — SRS §8.2, §23.7 (+ branch / staff / notes)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `categoryId` | uuid | FK → `ServiceCategory` |
| `name` | text | |
| `description` | text | nullable |
| `imageUrl` | text | nullable |
| `priceDisplayType` | enum | See §4 |
| `basePrice` | numeric | nullable where “contact for price” |
| `durationMinutes` | integer | nullable when not applicable |
| `isTaxable` | boolean | SRS §13.4 |
| `bookingAvailability` | boolean or enum | “Booking availability” per SRS §8.2 |
| `preparationNotes` | text | nullable |
| `aftercareNotes` | text | nullable |
| `isActive` | boolean | |
| `createdAt` / `updatedAt` | timestamptz | |

**Branch availability** — SRS §8.2, §9.1: M:N via `ServiceBranch`.

**Staff eligibility** — SRS §8.2: M:N via `StaffService` (staff who can perform this service).

### ServiceBranch (junction)

| Column | Type | Notes |
|--------|------|--------|
| `serviceId` | uuid | FK, PK composite |
| `branchId` | uuid | FK, PK composite |

### ServiceVariant — SRS §8.3, §23.8

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `serviceId` | uuid | FK → `Service` |
| `name` | text | |
| `description` | text | nullable |
| `price` | numeric | |
| `durationMinutes` | integer | |
| `isActive` | boolean | |
| `createdAt` / `updatedAt` | timestamptz | |

### Package — SRS §9.1, §23.9 (+ included services, branches)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `name` | text | |
| `description` | text | nullable |
| `imageUrl` | text | nullable |
| `originalPrice` | numeric | |
| `packagePrice` | numeric | |
| `durationMinutes` | integer | estimated duration |
| `startDate` | date | nullable if open-ended |
| `endDate` | date | nullable |
| `isTaxable` | boolean | optional; SRS §13.4 taxable packages |
| `isActive` | boolean | |
| `createdAt` / `updatedAt` | timestamptz | |

**Included services:** `PackageService` (`packageId`, `serviceId`, optional `sortOrder`).

**Branch availability:** `PackageBranch` (`packageId`, `branchId`) per SRS §9.1.

### Bundle — SRS §9.2, §23.10 (+ eligible services)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `name` | text | |
| `description` | text | nullable |
| `bundleType` | enum | See §4 |
| `price` | numeric | |
| `rules` | text or jsonb | “Usage rules” per SRS |
| `selectableCount` | integer | number of selectable services for flexible bundles |
| `startDate` / `endDate` | date | nullable |
| `isActive` | boolean | |
| `createdAt` / `updatedAt` | timestamptz | |

**Eligible services:** `BundleService` (`bundleId`, `serviceId`, optional `sortOrder`).

### Offer — SRS §18

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `name` | text | |
| `offerCode` | text | unique nullable |
| `discountType` | enum | percentage, fixed, service, package, bundle, first booking, seasonal, promo — align to SRS offer types |
| `discountValue` | numeric | |
| `startDate` / `endDate` | date | |
| `usageLimit` | integer | nullable |
| `perClientUsageLimit` | integer | nullable |
| `isActive` | boolean | |
| `eligibilityRules` | jsonb | optional; references to eligible service/package/bundle IDs |
| `createdAt` / `updatedAt` | timestamptz | |

### BookingSlot — SRS §10.5–10.6, §23.11

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `branchId` | uuid | FK → `Branch` |
| `date` | date | calendar date |
| `startTime` | time | |
| `endTime` | time | |
| `capacity` | integer | receptionist-configurable |
| `bookedCount` | integer | default 0; maintained by application rules |
| `status` | enum | See §4 |
| `isOnlineBookable` | boolean | |
| `notes` | text | nullable |
| `createdByUserId` | uuid | nullable FK → `User` (maps SRS `createdBy`) |
| `createdAt` / `updatedAt` | timestamptz | |

**Business rules:** Capacity is editable by receptionist; status may be set to `Filled` manually even when `bookedCount < capacity` (SRS §10.6).

### Booking — SRS §10, §23.12

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `clientId` | uuid | FK → `Client` |
| `branchId` | uuid | FK → `Branch` |
| `slotId` | uuid | FK → `BookingSlot`; nullable only if product explicitly allows “no slot yet” — default **not null** for SRS flow |
| `status` | enum | See §4; **website-originated bookings default `Pending`** (SRS §4, §10.3) |
| `source` | enum | Website, Dashboard, Walk-in, Phone, WhatsApp, Instagram, Facebook (SRS §21) |
| `subtotal` | numeric | |
| `discountAmount` | numeric | default 0 |
| `vatRate` | numeric | snapshot of applicable rate at calculation time |
| `vatAmount` | numeric | |
| `totalAmount` | numeric | |
| `clientNotes` | text | nullable |
| `adminNotes` | text | nullable |
| `createdByUserId` | uuid | nullable FK → `User`; null when created by client via website |
| `createdAt` / `updatedAt` | timestamptz | |

### BookingItem — SRS §10.2–10.3, §23.13

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `bookingId` | uuid | FK → `Booking` |
| `itemType` | enum | See §4 |
| `serviceId` | uuid | nullable FK |
| `serviceVariantId` | uuid | nullable FK |
| `packageId` | uuid | nullable FK |
| `bundleId` | uuid | nullable FK |
| `nameSnapshot` | text | required |
| `priceSnapshot` | numeric | required |
| `durationMinutesSnapshot` | integer | required |
| `quantity` | integer | default 1 |
| `assignedStaffId` | uuid | nullable FK → `Staff` |
| `status` | text or enum | optional line-level status if product requires; SRS lists `status` on BookingItem |
| `createdAt` / `updatedAt` | timestamptz | |

**Constraint (application-enforced):** For each row, FKs must match `itemType` (e.g. package line has `packageId` set; service variant line has `serviceId` + `serviceVariantId` as appropriate).

**Add-ons (MVP):** Per SRS §8.1 example category “Add-ons” and §10.2 “add-ons” on a booking, **add-ons are modeled as normal `Service` rows** under a **ServiceCategory** such as “Add-ons” (no separate `AddOn` table in MVP). On **`BookingItem`**, use **`itemType = SERVICE`** with `serviceId` pointing at that service, **or** use **`itemType = ADD_ON`** as a semantic alias with **`serviceId`** still populated—both are valid; choose one convention in the application and stay consistent. **`ADD_ON`** does not require a dedicated table.

### BookingChangeRequest — client cancel/reschedule requests (SRS §10.7; `/docs/BOOKING_ENGINE_RULES.md` §11–§13)

Stores **client-initiated** cancellation or reschedule **requests**; staff fulfillment stays in dashboard booking APIs. Aligns with `/docs/API_CONTRACT.md` client and dashboard change-request endpoints.

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `bookingId` | uuid | FK → `Booking` |
| `clientId` | uuid | FK → `Client` |
| `requestType` | enum | See §4: `CANCEL`, `RESCHEDULE` |
| `requestedSlotId` | uuid | nullable FK → `BookingSlot`; required when `requestType = RESCHEDULE` (application-enforced) |
| `reason` | text | nullable |
| `status` | enum | See §4: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` (request lifecycle; **`CANCELLED`** = request voided or superseded, not the booking’s `CANCELLED` status) |
| `handledByUserId` | uuid | nullable FK → `User` (dashboard actor who approved/rejected/voided) |
| `handledAt` | timestamptz | nullable |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

**Relationships:**

- `Client` 1—* `BookingChangeRequest`
- `Booking` 1—* `BookingChangeRequest`
- `BookingSlot` 1—* `BookingChangeRequest` (optional target via `requestedSlotId`)
- `User` 1—* `BookingChangeRequest` (optional via `handledByUserId`)

### Client — SRS §14, §23.4

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `fullName` | text | |
| `phone` | text | required before booking submission (SRS §4) |
| `email` | text | nullable |
| `profileImageUrl` | text | nullable; from social provider when available (SRS §12.2) |
| `gender` | text | nullable |
| `birthDate` | date | nullable |
| `preferredBranchId` | uuid | nullable FK |
| `preferredSpecialistId` | uuid | nullable FK → `Staff` (SRS §14) |
| `notes` | text | nullable; sensitive visibility via RBAC |
| `allergiesOrWarnings` | text | nullable; sensitive (SRS §14) |
| `tags` | text[] or jsonb | SRS tag examples |
| `createdAt` / `updatedAt` | timestamptz | |

### ClientIdentity — implied by SRS §12.1–12.2 (OAuth)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `clientId` | uuid | FK → `Client` |
| `provider` | enum | `GOOGLE`, `FACEBOOK`, etc. |
| `providerSubject` | text | unique per provider |
| `email` | text | nullable cache |
| `createdAt` / `updatedAt` | timestamptz | |

Optional separate table for email/password credentials if implemented (`ClientCredential`) — omit detail here; keep auth storage out of this doc unless fixed by SRS.

### Staff — SRS §15

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `fullName` | text | |
| `phone` | text | nullable |
| `email` | text | nullable |
| `jobTitle` | text | nullable |
| `branchId` | uuid | FK → `Branch` |
| `profileImageUrl` | text | nullable |
| `isActive` | boolean | |
| `dashboardLoginEnabled` | boolean | SRS: staff may exist without dashboard login |
| `userId` | uuid | nullable unique FK → `User` when linked |
| `createdAt` / `updatedAt` | timestamptz | |

### StaffService (junction) — SRS §15

| Column | Type | Notes |
|--------|------|--------|
| `staffId` | uuid | PK composite |
| `serviceId` | uuid | PK composite |

### User — SRS §23.1 (dashboard)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `name` | text | |
| `email` | text | unique |
| `phone` | text | nullable |
| `passwordHash` | text | |
| `roleId` | uuid | FK → `Role` |
| `branchId` | uuid | nullable FK → `Branch` for branch-scoped users |
| `isActive` | boolean | deactivation instead of delete (SRS audit: user deactivated) |
| `createdAt` / `updatedAt` | timestamptz | |

### Role — SRS §23.2

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `name` | text | Owner, Admin, Branch Manager, Receptionist, Specialist (examples SRS) |
| `description` | text | nullable |
| `level` | integer | hierarchy ordering for defaults/UI |
| `createdAt` / `updatedAt` | timestamptz | |

### Permission — SRS §23.3

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `key` | text | unique, e.g. `bookings.confirm` |
| `module` | text | |
| `description` | text | nullable |

### RolePermission — junction

| Column | Type | Notes |
|--------|------|--------|
| `roleId` | uuid | FK |
| `permissionId` | uuid | FK |
| | | composite PK `(roleId, permissionId)` |

### Payment — SRS §13, §23.14

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `bookingId` | uuid | FK → `Booking` |
| `clientId` | uuid | FK → `Client` |
| `amount` | numeric | |
| `method` | enum | See §4 |
| `status` | enum | See §4 |
| `reference` | text | nullable; Instapay ref, etc. |
| `paidAt` | timestamptz | nullable |
| `createdByUserId` | uuid | nullable FK → `User` |
| `createdAt` / `updatedAt` | timestamptz | |

### Invoice — SRS §13.5, §23.15

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `invoiceNumber` | text | unique |
| `bookingId` | uuid | FK → `Booking` |
| `clientId` | uuid | FK → `Client` |
| `subtotal` | numeric | |
| `discountAmount` | numeric | |
| `vatRate` | numeric | |
| `vatAmount` | numeric | |
| `totalAmount` | numeric | |
| `paidAmount` | numeric | |
| `remainingAmount` | numeric | |
| `status` | text or enum | draft/finalized/cancelled — align with workflow |
| `paymentMethod` | enum | nullable mirror of primary method for display SRS §13.5 |
| `createdByUserId` | uuid | nullable FK → `User` (SRS §13.5 “Created by”) |
| `createdAt` / `updatedAt` | timestamptz | |

### SystemSettings — SRS §4, §13.1, §13.4 (single row or keyed rows)

Represent admin-configurable VAT and payment/deposit policy without inventing new business rules:

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK; singleton row acceptable |
| `vatEnabled` | boolean | |
| `defaultVatRate` | numeric | |
| `pricesIncludeVat` | boolean | |
| `showVatOnInvoice` | boolean | |
| `taxRegistrationNumber` | text | nullable |
| `paymentDepositPolicy` | enum | pay_at_salon, optional_deposit, required_deposit, future_online, manual_instapay, etc. (SRS §13.1) |
| `updatedAt` | timestamptz | |
| `updatedByUserId` | uuid | nullable FK → `User` (audit for VAT/policy changes) |

### WhatsAppTemplate — SRS §23.16

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `name` | text | |
| `templateKey` | text | unique stable key for code mapping |
| `content` | text | body with placeholders |
| `variables` | jsonb or text | description of allowed variables SRS §11.5 |
| `isActive` | boolean | |
| `createdAt` / `updatedAt` | timestamptz | |

### GalleryItem — SRS §19.1

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `imageUrl` | text | |
| `title` | text | nullable |
| `category` | text | SRS gallery categories |
| `description` | text | nullable |
| `isFeatured` | boolean | |
| `displayOrder` | integer | |
| `isActive` | boolean | |
| `createdAt` / `updatedAt` | timestamptz | |

### Review — SRS §19.2, §23.17 (testimonials pipeline)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `clientId` | uuid | nullable FK if anonymous display allowed |
| `bookingId` | uuid | nullable FK |
| `rating` | integer | |
| `comment` | text | nullable |
| `relatedServiceId` | uuid | nullable FK |
| `status` | enum | Pending, Approved, Rejected, Hidden (SRS §19.2) |
| `displayOnWebsite` | boolean | |
| `createdAt` / `updatedAt` | timestamptz | |

### AuditLog — SRS §22, §23.18

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `userId` | uuid | nullable FK → `User` (system actions nullable) |
| `action` | text | e.g. `booking.confirmed` |
| `module` | text | |
| `entityId` | uuid | nullable |
| `oldValue` | jsonb | nullable |
| `newValue` | jsonb | nullable |
| `ipAddress` | text | nullable |
| `createdAt` | timestamptz | |

---

## 3. Relationships

**High level:**

- `Branch` 1—* `BookingSlot`, `Booking`, `Staff`, `User` (optional), junctions `ServiceBranch`, `PackageBranch`.
- `Client` 1—* `Booking`, `Payment`, `Invoice`, `Review`, `BookingChangeRequest`; 1—* `ClientIdentity`.
- `Booking` *—1 `Client`, `Branch`, `BookingSlot`; 1—* `BookingItem`, `Payment`, `BookingChangeRequest`; 1—1 or 1—* `Invoice` (typically one invoice per booking; enforce in app layer if needed).
- `BookingSlot` 1—* `BookingChangeRequest` (as optional `requestedSlotId`).
- `User` 1—* `BookingChangeRequest` (as optional `handledByUserId`).
- `BookingItem` *—1 `Booking`; optional *—1 `Service`, `ServiceVariant`, `Package`, `Bundle`, `Staff`.
- `ServiceCategory` 1—* `Service`; `Service` 1—* `ServiceVariant`; M:N `ServiceBranch`, `StaffService`, `PackageService`, `BundleService`.
- `Package` M:N `Service` (included), M:N `Branch`.
- `Bundle` M:N `Service` (eligible).
- `User` *—1 `Role`, optional *—1 `Branch`, optional 1—1 `Staff`.
- `Role` M:N `Permission` via `RolePermission`.

```text
Branch ──┬──< BookingSlot
         ├──< Booking
         ├──< Staff
         └──< ServiceBranch / PackageBranch

Client ──┬──< Booking
         ├──< ClientIdentity
         ├──< BookingChangeRequest
         └──< Payment / Invoice / Review

Booking ──┬──< BookingItem
            ├──< Payment
            └──< BookingChangeRequest

BookingSlot ──< BookingChangeRequest (requestedSlotId)
User ──< BookingChangeRequest (handledByUserId)

ServiceCategory ──< Service ──< ServiceVariant
Service ──< ServiceBranch, StaffService, PackageService, BundleService
```

---

## 4. Enums

| Enum | Values (SRS-based) |
|------|---------------------|
| `PriceDisplayType` | `FIXED`, `STARTS_FROM`, `RANGE`, `CONTACT`, `HIDDEN` (SRS §7.4) |
| `BookingStatus` | `PENDING`, `CONFIRMED`, `REQUIRES_FOLLOW_UP`, `RESCHEDULED`, `ARRIVED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `REJECTED`, `NO_SHOW` (SRS §10.4) |
| `BookingSlotStatus` | `AVAILABLE`, `PENDING`, `FILLED`, `BLOCKED`, `CLOSED` (SRS §10.5) |
| `BookingSource` | `WEBSITE`, `DASHBOARD`, `WALK_IN`, `PHONE`, `WHATSAPP`, `INSTAGRAM`, `FACEBOOK` (SRS §21) |
| `BookingItemType` | `SERVICE`, `SERVICE_VARIANT`, `PACKAGE`, `BUNDLE`, `ADD_ON` (SRS §10.2; MVP add-ons are **services** in an Add-ons category—see **BookingItem** notes: `SERVICE` or semantic `ADD_ON` + `serviceId`, no `AddOn` table) |
| `BundleType` | `FIXED`, `FLEXIBLE`, `QUANTITY`, `MEMBERSHIP_STYLE` (SRS §9.2) |
| `PaymentMethod` | `CASH`, `CARD`, `INSTAPAY`, `MOBILE_WALLET`, `BANK_TRANSFER`, `ONLINE` (future) (SRS §13.2) |
| `PaymentStatus` | `UNPAID`, `PARTIALLY_PAID`, `PAID`, `REFUNDED`, `CANCELLED` (SRS §13.3) |
| `ReviewStatus` | `PENDING`, `APPROVED`, `REJECTED`, `HIDDEN` (SRS §19.2) |
| `BookingChangeRequestType` | `CANCEL`, `RESCHEDULE` |
| `BookingChangeRequestStatus` | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` (request row only; **`CANCELLED`** denotes a withdrawn/superseded/voided **request**, not `Booking.status`) |

**Storage:** PostgreSQL native `ENUM` or `text` + check constraint; Prisma `enum` maps cleanly.

---

## 5. Indexes

Recommended indexes (add more after query profiling):

| Table | Index | Purpose |
|-------|--------|---------|
| `Booking` | `(clientId, createdAt DESC)` | Client history |
| `Booking` | `(branchId, status, slotId)` | Dashboard lists, calendar |
| `Booking` | `(slotId)` | Slot occupancy / validation |
| `BookingSlot` | `(branchId, date)` | Calendar and public slot picker |
| `BookingSlot` | `(branchId, date, startTime)` | **Non-unique** B-tree index for sorting/filtering (MVP: **do not** enforce a strict **unique** constraint on `(branchId, date, startTime)` unless the product explicitly requires at most one slot row per window—receptionist-controlled flexibility may allow overlapping or duplicate windows until staff tidy data) |
| `BookingItem` | `(bookingId)` | Line load |
| `BookingChangeRequest` | `(bookingId, status)`, `(clientId, createdAt DESC)` | Staff queue and client history |
| `Payment` | `(bookingId)` | Booking payments |
| `Invoice` | `(bookingId)`, unique `(invoiceNumber)` | Lookups |
| `User` | unique `(email)` | Login |
| `Client` | `(phone)` | Lookup / dedup (partial unique if business requires unique phone) |
| `ClientIdentity` | unique `(provider, providerSubject)` | OAuth |
| `AuditLog` | `(module, entityId, createdAt DESC)` | Entity trail |
| `AuditLog` | `(userId, createdAt DESC)` | User trail |
| `Service` | `(categoryId, isActive)` | Public catalog |
| `Staff` | `(branchId, isActive)` | Rosters |

**Foreign keys:** Index all FK columns used in joins or `ON DELETE` paths (Prisma often indexes FKs depending on DB).

---

## 6. Soft delete strategy

Per project rules and SRS emphasis on history and audit:

- **Do not hard-delete** important business rows: `Booking`, `BookingItem`, `BookingChangeRequest`, `Payment`, `Invoice`, `Client`, `AuditLog`, and financial-adjacent records. Use **status** (bookings, payments, booking change requests) or **`isActive = false`** (users, staff, catalog).
- **Catalog** (`Service`, `ServiceVariant`, `Package`, `Bundle`, `Offer`, `ServiceCategory`): prefer **`isActive`** (already in SRS) over deletion.
- **Users:** `isActive` false; keep row for audit attribution.
- **Optional `deletedAt`:** May be added for entities that need “removed from UI” without losing referential integrity; if used, queries default to `deletedAt IS NULL`. Not required by SRS; **prefer `isActive`** where the SRS already specifies it.

**Anonymization** (GDPR) is out of SRS scope; if required later, implement as controlled updates + audit, not hard delete of invoices.

---

## 7. Audit log strategy

Per SRS §22 and §23.18:

- **Append-only** `AuditLog` rows for tracked actions (examples in SRS §22: booking confirm/cancel/reschedule, slot marked filled, service price change, discount applied, payment edit, VAT settings, role change, user deactivated, invoice edited).
- Store **`oldValue` / `newValue` as JSON** for flexible payloads; keep size reasonable (truncate large blobs if needed).
- **`userId`** references `User` when the actor is a dashboard user; nullable for client-only or system jobs if ever logged.
- **`ipAddress`** when HTTP context exists.
- Emit from **transactional application layer** around critical mutations (same transaction as the business write when strong consistency is required for money-moving events).

**Entity audit metadata (optional columns):** Dashboard-managed operational entities (for example **`BookingSlot`**, **`Booking`**, catalog rows, **`SystemSettings`**) may include **`createdByUserId`** and **`updatedByUserId`** (FK → `User`) where useful for support and reporting. These columns **do not** replace **`AuditLog`**: any **sensitive** or policy-critical change (SRS §22 examples) must still produce an **`AuditLog`** row with `oldValue` / `newValue` as appropriate.

`AuditLog` itself is **never** soft-deleted in normal operation.

---

## 8. Multi-branch readiness

Per SRS §16 and architecture:

- **`Branch`** is the tenant slice for slots, bookings, staff default branch, and optional `User.branchId`.
- **Junctions** `ServiceBranch`, `PackageBranch` encode catalog availability per branch.
- **Queries** for branch managers and receptionists should always filter by **authorized branch** (application + RBAC), not only by UI.

MVP may seed one branch; schema remains unchanged for multiple branches.

---

## 9. Booking engine data model

Conceptual flow stored in data:

1. Receptionist/admin maintains **`BookingSlot`** rows (`capacity`, `bookedCount`, `status`, `isOnlineBookable`).
2. Client (or staff) creates **`Booking`** linked to **`clientId`**, **`branchId`**, **`slotId`**, with **`status = PENDING`** for online requests (SRS §10.3).
3. **`BookingItem`** rows capture the visit composition with **snapshots** and optional **`assignedStaffId`**.
4. Client cancel/reschedule **intents** are stored as **`BookingChangeRequest`** rows (`PENDING` until staff act); staff approve/reject via dashboard APIs (`/docs/API_CONTRACT.md`).
5. Staff transitions **`Booking.status`** per SRS §10.4; optional updates to **`slotId`** for reschedule; **`bookedCount`** / slot **`status`** updated by application rules when confirming/cancelling (exact rules belong in `/docs/BOOKING_ENGINE_RULES.md`).

**No MVP dependency** on automated staff availability tables (SRS §10.1, project rules).

---

## 10. BookingSlot model

- Receptionist-controlled container for **branch + date + time window + capacity**.
- **`bookedCount`** supports automatic hiding when `bookedCount >= capacity` for online selection (SRS §10.6).
- **`status = FILLED`** may be set **manually** regardless of `bookedCount` (SRS §10.6).
- **`createdByUserId`** ties creation to a dashboard user when applicable.

---

## 11. Booking model

- One row = **one client visit** (SRS §10.2).
- Monetary columns are **header-level totals** at time of calculation; line detail lives on **`BookingItem`**.
- **`source`** supports reporting by channel (SRS §21).
- **`createdByUserId`** null for self-service website bookings; set for staff-created bookings.

---

## 12. BookingItem model

- **One booking, many items** (SRS §10.2–10.3, FR-BK-001–002).
- **`itemType`** determines which optional FK is populated.
- **Add-ons:** Same as the **BookingItem** field table: MVP add-ons are **services** under an Add-ons **category**; `SERVICE` or semantic `ADD_ON` + `serviceId`; no **`AddOn`** table.
- **`nameSnapshot`, `priceSnapshot`, `durationMinutesSnapshot` are required** for historical accuracy (SRS §23.13, FR-BK-009).
- **`quantity`** supports multiples of the same line where product allows.

---

## 13. Service, ServiceVariant, Package, Bundle models

- **Service** carries pricing display, base price, duration, taxable flag, booking flags, prep/aftercare (SRS §8.2, §23.7).
- **ServiceVariant** overrides price/duration per variant (SRS §8.3).
- **Package** groups fixed included services with package pricing and dates (SRS §9.1); **PackageService** and **PackageBranch** implement “included services” and “branch availability.”
- **Bundle** stores type, price, rules, selectable count, dates (SRS §9.2); **BundleService** lists eligible services.

---

## 14. Client model

- Stores profile and operational fields per SRS §14 and §23.4.
- **`tags`**, **`notes`**, **`allergiesOrWarnings`** support segmentation and safety; RBAC governs read/write for sensitive fields (SRS §14).
- **`ClientIdentity`** links OAuth subjects to **`Client`** (SRS §12.1–12.2).

---

## 15. Staff and dashboard User models

- **Staff** = service provider profile, branch assignment, optional **`userId`** when dashboard access exists (SRS §15).
- **`dashboardLoginEnabled`** on **Staff** must align with presence/absence of credentials on **`User`** (enforce in application).
- **User** = dashboard login identity with **`passwordHash`**, **`roleId`**, optional **`branchId`** (SRS §23.1).

---

## 16. Role / Permission models

- **Role** includes **`level`** for hierarchy (SRS §23.2).
- **Permission** rows are granular **`key`** values (examples SRS §23.3).
- **RolePermission** grants many-to-many assignments; backend guards resolve **effective permissions** for **`User.roleId`**.

---

## 17. Payment, Invoice, VAT settings models

- **Payment** records actual money movements / manual confirmations against a **booking** (SRS §13, §23.14).
- **Invoice** is the printable/document totals for a booking (SRS §13.5, §23.15), including VAT breakdown fields when enabled.
- **SystemSettings** (or equivalent) holds **VAT toggles/rates/display rules** and **payment/deposit policy** (SRS §4, §13.1, §13.4). Changes should generate **AuditLog** entries (SRS §22).

---

## 18. WhatsAppTemplate model

- Stores **`templateKey`**, human **`name`**, **`content`**, and **`variables`** metadata for substitution (SRS §11.4–11.5, §23.16).
- **`isActive`** allows retiring templates without delete.

---

## 19. Gallery and Review / Testimonial models

- **GalleryItem** for media library (SRS §19.1).
- **Review** supports MVP testimonial pipeline statuses and **`displayOnWebsite`** (SRS §19.2, §23.17).

---

## 20. Notes on snapshot fields (booking / invoice accuracy)

Per SRS §23.13:

- Catalog prices and durations **change over time**. **`BookingItem`** must persist **`nameSnapshot`**, **`priceSnapshot`**, and **`durationMinutesSnapshot`** at the time the line is priced/confirmed so **historical bookings and invoices** remain correct (FR-BK-009).
- **Booking** and **Invoice** header fields (`subtotal`, `discountAmount`, `vatRate`, `vatAmount`, `totalAmount`, `paidAmount`, `remainingAmount`) should be treated as **frozen financial snapshots** for issued invoices; corrections happen via **adjustment payments**, **credit notes**, or controlled **invoice edit** paths that are **audit-logged** (SRS §22), not by mutating past item snapshots casually.

---

*End of database schema document.*
