# RBAC Matrix — Alrouby Salon & Spa Booking & Management System

**Document type:** Role–permission matrix  
**Product source of truth:** `/docs/SRS.md`  
**Alignment:** `/docs/ARCHITECTURE.md`, `/docs/DATABASE_SCHEMA.md`, `.cursor/rules/project-rules.mdc`

This document maps **dashboard** permissions to roles. **Clients** use separate client auth and are not covered here (SRS §5.2). **Guests** have no dashboard access.

---

## 1. Roles

| Role | SRS reference | Notes |
|------|----------------|--------|
| **Owner / Super Admin** | §5.7 | Full system access; users, roles, permissions, audit logs, branches, sensitive configuration, financial reports. |
| **Admin** | §5.6 | Catalog, clients, staff, VAT, payment/deposit policy, WhatsApp templates, website content, gallery, testimonials, reports (general). |
| **Branch Manager** | §5.5 | One branch; branch dashboard, branch bookings/appointments, branch staff schedules, branch reports/revenue, branch operational settings, special approvals *if allowed*. |
| **Receptionist** | §5.3 | Daily bookings, **slot management including capacity**, confirm/reject/reschedule/cancel, arrival/completion/no-show, WhatsApp from templates, client contact, **simple payment status if allowed**. |
| **Specialist / Staff** | §5.4 | **Assigned appointments only**, own schedule, service details on assignments, internal notes *if allowed*, item/service status *if allowed*. May have **no** dashboard login (SRS §5.4, §15). |

**Hierarchy (SRS §6):** Owner → Admin → Branch Manager → Receptionist → Specialist.

**Enforcement:** Every permission must be checked on the **backend** (NestJS guards + policies). The UI must not be the only enforcement (SRS §6; project rules).

---

## 2. Access levels (cell legend)

Each cell is one of:

| Level | Meaning |
|--------|---------|
| **Full** | Create/read/update/delete (or full workflow) across **all branches** where the feature is global. |
| **Branch** | Full operational access **within the user’s assigned branch** (and only that branch, unless multi-branch assignment is added later). |
| **Own** | Access **only** to records assigned to that user (e.g. specialist’s assigned booking lines / appointments). |
| **Read** | View-only. **Scope:** all branches for Owner/Admin where the row applies globally; **branch-scoped** for Branch Manager/Receptionist when their role is branch-bound; **own assignments** for Specialist when noted. |
| **None** | No access. |

**Read + branch:** For Branch Manager and Receptionist, **Read** implies data filtered to their **branch** without implying write access.

**Own (limited):** Where the SRS grants only specific actions (e.g. specialist notes/status), implement **fine-grained permission keys** in the API; the matrix marks **Own** and the implementation restricts to those actions only.

---

## 3. Permissions by module

Permission keys are **stable identifiers** for `Permission.key` in the database (see `/docs/DATABASE_SCHEMA.md`). Adjust naming in Prisma/seed to match exactly.

### 3.1 Dashboard overview

SRS §17.2 (widgets: today’s bookings, pending, revenue, reminders, etc.).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `overview.read` | View dashboard overview widgets | Full | Full | Branch | Branch | Own |

**Specialist `Own`:** Overview queries must be filtered to **appointments assigned to that staff member** (and aggregates only from those rows).

---

### 3.2 Bookings

SRS §5.3, §5.5, §5.6–5.7, §10, §18 (discounts: *only authorized roles*).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `bookings.read` | List/filter/view bookings | Full | Full | Branch | Branch | Own |
| `bookings.create` | Create manual booking | Full | Full | Branch | Branch | None |
| `bookings.update` | Edit booking fields (non-status, notes, slot assignment per policy) | Full | Full | Branch | Branch | None |
| `bookings.confirm` | Confirm pending → confirmed | Full | Full | Branch | Branch | None |
| `bookings.reject` | Reject pending | Full | Full | Branch | Branch | None |
| `bookings.cancel` | Cancel booking (authorized) | Full | Full | Branch | Branch | None |
| `bookings.reschedule` | Change slot / time (authorized) | Full | Full | Branch | Branch | None |
| `bookings.status.progress` | Mark arrived / in progress / completed / no-show / requires follow-up per SRS | Full | Full | Branch | Branch | Own |
| `bookings.discount.apply` | Apply manual discount to booking or invoice (SRS §18) | Full | Full | Branch | None | None |

**Specialist `Own` on `bookings.status.progress`:** Only transitions **allowed by SRS §5.4** for assigned work (e.g. mark assigned service line status **if allowed**). No confirm/reject/cancel unless explicitly granted later.

**Branch Manager `Branch` on `bookings.discount.apply`:** SRS §5.5: *approve special actions if allowed* — grant **Branch** only if product enables it via permission assignment; default seed can be **None** and document override. Matrix shows intended **maximum** per SRS: **Branch** when “if allowed” is true.

---

### 3.3 Booking slots

SRS §5.3 (receptionist manages slots, **capacity**, statuses); §5.5 branch operations; §10.5–10.6.

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `slots.read` | View slots / calendar slot layer | Full | Full | Branch | Branch | Own |
| `slots.create` | Create slots | Full | Full | Branch | Branch | None |
| `slots.update` | Edit slot times, notes, online bookable | Full | Full | Branch | Branch | None |
| `slots.capacity.configure` | Set or change **capacity** (receptionist-controlled, SRS §4, §10.6) | Full | Full | Branch | Branch | None |
| `slots.status.manage` | Set status available / pending / filled / blocked / closed; **manual Filled** (SRS §10.6) | Full | Full | Branch | Branch | None |
| `slots.delete` | Remove slot row (prefer soft rules per project rules) | Full | Full | Branch | Branch | None |

**Specialist `Own` on `slots.read`:** Optional: read slots that intersect **own assigned appointments** for personal schedule context; if not needed, implement as **None** and use `bookings.read` Own only. Default matrix: **Own** = schedule context only, read-only via same permission or merge to **Read** Own — here **Own** means “see slots relevant to own assignments” without edit.

---

### 3.4 Clients

SRS §5.6 (admin manages clients), §5.3 (receptionist views contact), §5.5 (branch operations), §14 (sensitive notes).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `clients.read` | View client list/profile | Full | Full | Branch | Branch | Own |
| `clients.create` | Create client record | Full | Full | Branch | None | None |
| `clients.update` | Edit demographics, tags, preferred branch/specialist | Full | Full | Branch | None | None |
| `clients.contact.view` | View phone/email for communication | Full | Full | Branch | Branch | None |
| `clients.notes.sensitive` | View/edit sensitive notes, allergies (SRS §14) | Full | Full | Branch | None | None |

**Specialist `Own` on `clients.read`:** Only fields exposed on **assigned appointments** (minimal PII per policy); not full CRM list. If product gives no client PII to specialists, use **None** and gate fields in `bookings.read` Own.

---

### 3.5 Services (includes categories)

SRS §5.6 (admin manages services); categories SRS §8.1 / dashboard §17.1.

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `services.categories.manage` | CRUD service categories | Full | Full | None | None | None |
| `services.manage` | CRUD services, branch availability links, booking flags | Full | Full | None | None | None |
| `services.read` | View catalog for operations | Full | Full | Read | Read | Read |

**Receptionist / Specialist Read:** Branch context for pricing/descriptions when handling bookings; global read is acceptable if catalog is shared.

---

### 3.6 Service variants

SRS §5.6.

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `service_variants.manage` | CRUD variants | Full | Full | None | None | None |
| `service_variants.read` | View variants | Full | Full | Read | Read | Read |

---

### 3.7 Packages

SRS §5.6.

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `packages.manage` | CRUD packages, included services, branch availability | Full | Full | None | None | None |
| `packages.read` | View packages | Full | Full | Read | Read | Read |

---

### 3.8 Bundles

SRS §5.6.

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `bundles.manage` | CRUD bundles, eligible services, rules | Full | Full | None | None | None |
| `bundles.read` | View bundles | Full | Full | Read | Read | Read |

---

### 3.9 Offers

SRS §18 (offers / promotions).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `offers.read` | View offers (dashboard lists, booking context) | Full | Read | Read | Read | Read |
| `offers.manage` | CRUD offers, eligibility rules, activation | Full | Full | None | None | None |

---

### 3.10 Staff

SRS §5.6 (admin manages staff), §5.5 (branch staff schedules).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `staff.manage` | CRUD staff, services performed, dashboard login flags | Full | Full | None | None | None |
| `staff.schedules.read` | View staff schedules | Full | Full | Branch | Read | Own |
| `staff.schedules.manage` | Manage branch staff schedules (SRS §5.5) | Full | Full | Branch | None | None |

**Specialist `Own` on `staff.schedules.read`:** View **own** schedule only.

---

### 3.11 Branches

SRS §5.7 (owner manages branches); others need read for context.

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `branches.manage` | CRUD branches, working hours, WhatsApp numbers | Full | None | None | None | None |
| `branches.read` | View branch directory | Full | Read | Read | Read | Read |

---

### 3.12 Payments

SRS §5.6–5.7, §5.3 (simple payment status *if allowed*).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `payments.read` | View payments for bookings | Full | Full | Branch | Branch | None |
| `payments.record` | Record payments, methods, statuses (SRS §13) | Full | Full | Branch | None | None |
| `payments.record_simple` | Receptionist: record **simple payment status** (*if allowed*) | Full | Full | Branch | Branch | None |
| `payments.refund` | Refund / adjust (sensitive) | Full | Full | None | None | None |

**Default seed recommendation:** Receptionist may **`payments.read`** (branch) and **`payments.record_simple`** (branch) **only** if the salon enables that operationally (SRS §5.3). If receptionists must not record payment status, seed **`payments.record_simple`** as **None** for Receptionist while keeping the matrix **Branch** cell as the **maximum** when the role is granted that permission.

---

### 3.13 Invoices

SRS dashboard §17.1; invoicing §13.5; audit for edits §22.

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `invoices.read` | View invoices | Full | Full | Branch | Read | None |
| `invoices.create_finalize` | Create/issue/finalize invoices | Full | Full | None | None | None |
| `invoices.edit` | Edit invoice (audited, SRS §22) | Full | Full | None | None | None |

**Note:** Branch Manager **read** is branch-scoped. Issue/finalize/edit stay Owner/Admin-only by default; grant **Branch** on `invoices.create_finalize` only if the business extends policy beyond the SRS minimum.

---

### 3.14 VAT settings

SRS §5.6–5.7 (admin enables/disables VAT; owner sensitive config).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `vat.settings.manage` | Enable/disable VAT, rates, display flags, tax ID (SRS §13.4) | Full | Full | None | None | None |
| `vat.settings.read` | View VAT settings | Full | Read | None | None | None |

---

### 3.15 Payment / deposit policy

SRS §5.6 (admin manages policies), §4.

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `payments.policy.manage` | Configure pay-at-salon / deposit / future online / Instapay rules (SRS §13.1) | Full | Full | None | None | None |
| `payments.policy.read` | View policy | Full | Read | None | None | None |

---

### 3.16 WhatsApp templates

SRS §5.6 (admin manages templates), §5.3 (receptionist sends using templates).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `whatsapp.templates.manage` | CRUD template content/keys/variables | Full | Full | None | None | None |
| `whatsapp.send` | Generate deep links / send actions from dashboard for clients | Full | Full | Branch | Branch | None |

---

### 3.17 Gallery

SRS §5.6.

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `gallery.manage` | CRUD gallery items | Full | Full | None | None | None |
| `gallery.read` | View gallery admin list | Full | Read | None | None | None |

---

### 3.18 Testimonials / reviews

SRS §5.6 (admin manages testimonials), §19.2.

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `reviews.manage` | Approve/reject/hide; publish to website | Full | Full | None | None | None |
| `reviews.read` | View review queue | Full | Read | None | None | None |

---

### 3.19 Website content / CMS

SRS §5.6 (admin manages website content), §20 (editable homepage, banners, featured items, About, contact, SEO, etc.).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `content.manage` | Manage homepage hero, banners, featured services/packages/bundles, About, contact details, SEO title/description, and related CMS fields (SRS §20) | Full | Full | None | None | None |
| `content.read` | View CMS / site configuration in dashboard (read-only) | Full | Read | None | None | None |

---

### 3.20 Reports

SRS §5.6 (admin view reports), §5.5 (branch reports), §5.7 (owner financial / all reports).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `reports.view` | Operational reports (bookings, services, etc.) | Full | Read | Branch | None | None |
| `reports.view_financial` | Revenue / financial / sensitive aggregates | Full | Read | Branch | None | None |

**Admin:** SRS §5.6 “View reports” — use **Read** on `reports.view`.

**Note:** The Owner may **omit** `reports.view_financial` from the **Admin** role’s assigned permissions to **disable** Admin financial report access even though this matrix defaults Admin to **Read** for that key.

---

### 3.21 Users

SRS §5.7 (owner manages users).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `users.manage` | Create/update/deactivate dashboard users | Full | None | None | None | None |
| `users.read` | List users | Full | None | None | None | None |

---

### 3.22 Roles

SRS §5.7 (owner manages roles and permissions).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `roles.manage` | Assign roles/permissions to roles | Full | None | None | None | None |
| `roles.read` | View roles/permission sets | Full | None | None | None | None |

---

### 3.23 Audit logs

SRS §5.7 (owner views audit logs).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `audit.read` | View audit log entries | Full | None | None | None | None |

---

### 3.24 System settings

SRS §5.7 (owner manages system settings); §5.5 (branch-level operational settings).

| Permission key | Description | Owner | Admin | Branch Manager | Receptionist | Specialist |
|----------------|-------------|-------|-------|----------------|--------------|------------|
| `settings.system.manage` | Global system configuration (sensitive) | Full | None | None | None | None |
| `settings.system.read` | Read global settings | Full | Read | None | None | None |
| `settings.branch.manage` | Branch operational settings (SRS §5.5) | Full | None | Branch | None | None |

Website and marketing CMS permissions are **`content.manage`** / **`content.read`** in §3.19 (SRS §20).

---

## 4. Summary matrix (role × coarse capability)

Quick reference; detail is in §3.

| Capability area | Owner | Admin | Branch Manager | Receptionist | Specialist |
|------------------|-------|-------|----------------|--------------|------------|
| Global / financial / audit / users & roles | Full | Read / None (financial optional via permissions) | Branch (reports) | None | None |
| Catalog & marketing content (incl. **offers** §3.9) | Full | Full (manage) | Read | Read | Read |
| Website / CMS | Full | Full (manage + read per §3.19) | None | None | None |
| VAT & payment **policy** | Full | Full (manage) | None | None | None |
| Branches CRUD | Full | None | None | None | None |
| Slots & capacity | Full | Full | Branch | Branch | Own / None (read) |
| Bookings lifecycle | Full | Full | Branch | Branch | Own (limited) |
| Payments recording | Full | Full | Branch | Branch (simple, optional) | None |
| Invoices | Full | Full | Read/None | Read | None |
| WhatsApp templates vs send | Both | Both | Send (Branch) | Send (Branch) | None |

---

## 5. Implementation notes (backend)

1. **Store** permissions as rows; assign to roles via `RolePermission` (see `/docs/DATABASE_SCHEMA.md`).
2. **Guards** on NestJS controllers/handlers: resolve `User` → `Role` → permissions; apply **branch** filter using `user.branchId` (and enforce Branch Manager/Receptionist cannot set `branchId` outside their branch on writes).
3. **Own** for Specialist: join through `Staff` ↔ `User`, then `BookingItem.assignedStaffId = staff.id` (or equivalent) for queries and mutation checks.
4. **None** must **fail closed** (403), not empty lists from forgotten filters.
5. **Receptionist slot capacity:** `slots.capacity.configure` + `slots.status.manage` must be **Branch** for Receptionist in seed data (SRS §5.3, user rules).
6. **Admin VAT / payment policy:** `vat.settings.manage` + `payments.policy.manage` = **Full** for Admin (user rules).
7. **Offers:** Seed `offers.read` and `offers.manage` per §3.9; map to `/docs/API_CONTRACT.md` dashboard offer routes.

---

*End of RBAC matrix.*
