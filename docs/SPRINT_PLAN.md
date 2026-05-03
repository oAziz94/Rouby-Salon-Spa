# Sprint Plan — MVP (Alrouby Salon & Spa)

**Document type:** Delivery plan (normative for sequencing and scope control)  
**Product source of truth:** `/docs/SRS.md`  
**Alignment:** `/docs/ARCHITECTURE.md`, `/docs/DATABASE_SCHEMA.md`, `/docs/RBAC_MATRIX.md`, `/docs/BOOKING_ENGINE_RULES.md`, `/docs/API_CONTRACT.md`, `.cursor/rules/project-rules.mdc`

**Monorepo:** **npm workspaces** at repository root. Suggested layout (from architecture): `apps/web`, `apps/dashboard` (or a single Next.js app with route groups), `services/api` (NestJS), `packages/api-client`, `prisma/`. Exact folder names may vary; **workspace boundaries and shared types stay in sync** with `/docs/API_CONTRACT.md`.

**MVP posture:** **Receptionist-controlled** booking (slots, capacity, confirm/reject/reschedule). **No** fully automated staff-availability engine. **WhatsApp:** deep links only (no Business API). **Defaults:** **Africa/Cairo** timezone, **EGP** currency. **API docs:** **OpenAPI/Swagger** alongside this plan.

This plan does **not** replace detailed design; each sprint should start with a short implementation note (files, migrations, endpoints, guards, UI) per `.cursor/rules/project-rules.mdc`.

---

## 1. Development principles

| Principle | Practice |
|-----------|----------|
| **Docs are source of truth** | Behavior matches **SRS** first; technical detail in **ARCHITECTURE**, **DATABASE_SCHEMA**, **RBAC_MATRIX**, **BOOKING_ENGINE_RULES**, **API_CONTRACT**. Do not contradict them. |
| **Plan before coding** | Per sprint: schema deltas, REST surface, RBAC keys, and manual test notes before large merges. |
| **Small modules** | Vertical slices (e.g. slots + slot APIs) over big-bang PRs. |
| **Backend authorization first** | NestJS guards + branch scope + ownership; UI only reflects permissions (**FR-AUTH-004**). |
| **No features outside SRS** | If unclear, clarify with stakeholders; do not invent scope. |
| **No automated staff availability engine in MVP** | No auto-scheduling from staff calendars/skills (**SRS §10.1**, **§28**, project rules). |
| **Quality bar** | Validation, error shape per **API_CONTRACT**, audit on sensitive writes, mobile-first UI (**SRS §25**). |

---

## 2. Sprint 0: Foundation

**Goal:** Runnable monorepo, API skeleton, database connectivity, CI baseline, OpenAPI stub, seed hook.

**Scope:** Tooling and empty vertical slice—not business features.

### Backend tasks

- NestJS app in workspace (`services/api` or `apps/api`); global validation pipe; exception filter aligned with **API_CONTRACT** error shape.
- Config module: `DATABASE_URL`, JWT secrets, `DEFAULT_TIMEZONE=Africa/Cairo`, `DEFAULT_CURRENCY=EGP`, CORS, `API_URL` / front URLs.
- **Swagger/OpenAPI** (`@nestjs/swagger`) mounted; restrict in production per **ARCHITECTURE §5**.
- Health route (`/health`).

### Frontend tasks

- Next.js workspace app(s) scaffold: `apps/web`, `apps/dashboard` (or one app + route groups); Tailwind/shadcn baseline optional.
- Shared `packages/api-client` placeholder (typed base URL `/api/v1`).

### Database tasks

- **Prisma** + **PostgreSQL**; initial `schema.prisma` minimal (e.g. `_prisma_migrations` only or placeholder model).
- **Docker Compose** (optional) for local Postgres; documented `DATABASE_URL`.
- **Seed script** structure (`prisma/seed.ts`): empty or minimal bootstrap hook for later sprints.

### Tests / manual checks

- `npm` scripts: `lint`, `test` (smoke), `build` for api + web roots.
- CI runs lint + unit smoke on PR.
- Manual: API boots, Swagger loads in dev, web builds.

### Done criteria

- One command (documented) starts DB (if Docker), migrates, runs API + one frontend dev server.
- OpenAPI JSON generated or served in dev.

### Out of scope (MVP)

- Real business modules, OAuth providers, production deploy.

---

## 3. Sprint 1: Auth + RBAC

**Goal:** Dashboard JWT login/logout/me/permissions; Prisma models for **User**, **Role**, **Permission**, **RolePermission**; guards keyed by **RBAC_MATRIX**; client auth **structure** (JWT shape + placeholders).

**Scope:** Identity and authorization only—no catalog/booking UI beyond login shell.

### Backend tasks

- Implement **API_CONTRACT** §4 (`/dashboard/auth/login`, `logout`, `me`, `permissions`).
- Password hash (bcrypt/argon2); JWT access (+ refresh if in scope).
- **Permission guard**: resolve `User` → `Role` → permission keys; fail closed (**RBAC_MATRIX §5**).
- **Client** auth routes: structure for Bearer client JWT; **OAuth** routes as **placeholders** or thin stub returning 501 + doc link (**ARCHITECTURE §8**, **API_CONTRACT** §3).
- Rate limit auth endpoints.

### Frontend tasks

- Dashboard: login page; store token; call `permissions` for menu gating.
- Web: optional placeholder “Sign in” that hits client auth stub.

### Database tasks

- Prisma: **User**, **Role**, **Permission**, **RolePermission** per **DATABASE_SCHEMA**.
- **Seed:** all permission keys from **RBAC_MATRIX**; roles (Owner, Admin, Branch Manager, Receptionist, Specialist) with default assignments; one Owner user (dev-only password documented outside repo).

### Tests / manual checks

- 401/403 matrix: wrong password, missing token, token without permission.
- Owner can hit a protected “ping” route; stripped permission fails.

### Done criteria

- All **RBAC_MATRIX** keys exist in DB; guards reference same strings.
- Dashboard user can log in and receive permission list matching role.

### Out of scope (MVP)

- 2FA, production IdP hardening, full Google/Facebook OAuth (unless explicitly pulled into this sprint as “implement” vs placeholder—prefer **placeholder** to keep sprint small).

---

## 4. Sprint 2: Branches + System Settings

**Goal:** **Branch** CRUD/read per RBAC; **SystemSettings** singleton (or keyed rows) for VAT + payment/deposit policy; reads for dashboard; defaults **Cairo** / **EGP** surfaced in API responses where relevant.

**Scope:** Organization + global financial config—no bookings yet.

### Backend tasks

- **API_CONTRACT** branches (dashboard) + public branch list/detail if not deferred to Sprint 8.
- **SystemSettings** (or equivalent): **VAT** read/update (`vat.settings.*`); **payment policy** read/update (`payments.policy.*`) per **RBAC_MATRIX**.
- Audit on VAT/policy changes (**BOOKING_ENGINE_RULES** / SRS §22).

### Frontend tasks

- Dashboard: branches list (Owner); branch read for others; settings screens for Admin (VAT + policy) per permissions.

### Database tasks

- Prisma: **Branch**, **SystemSettings** fields per **DATABASE_SCHEMA**; seed **default branch**, default VAT/policy sensible for dev.

### Tests / manual checks

- Branch Manager cannot CRUD branches unless granted (default: Owner only `branches.manage`).
- Admin cannot manage branches but can manage VAT/policy per matrix.

### Done criteria

- API returns consistent **EGP** and documents **Africa/Cairo** defaults in settings or env contract.

### Out of scope (MVP)

- Multi-branch operational UX polish; production tax advice.

---

## 5. Sprint 3: Catalog

**Goal:** Full catalog model and **dashboard** CRUD; **public** read-only catalog endpoints; **offers** with **`offers.read` / `offers.manage`**; soft **`isActive`** via status PATCHs per **API_CONTRACT**.

**Scope:** Services, categories, variants, packages, bundles, offers—no booking logic yet.

### Backend tasks

- Entities per **DATABASE_SCHEMA**: **ServiceCategory**, **Service**, **ServiceBranch**, **ServiceVariant**, **Package**, **PackageService**, **PackageBranch**, **Bundle**, **BundleService**, **Offer**.
- Dashboard routes per **API_CONTRACT** §7; RBAC `services.*`, `packages.*`, `bundles.*`, `service_variants.*`, `offers.*`.
- Public routes per **API_CONTRACT** §2.1–2.2 (catalog + offers + branch context as needed).
- Optional **upload presign** endpoint (**ARCHITECTURE §17**).

### Frontend tasks

- Dashboard: catalog CRUD tables/forms; image URL fields wired to presign when available.
- Minimal public consumption can wait until Sprint 10; optional smoke page in `web`.

### Database tasks

- Migrations for all catalog tables; seed sample categories/services/one package/one bundle/one offer.

### Tests / manual checks

- Public GET never returns inactive rows unless product explicitly allows “preview.”
- RBAC: Receptionist **Read** on catalog; no **manage** on packages for Receptionist.

### Done criteria

- **API_CONTRACT** catalog and public catalog surfaces implemented and listed in Swagger.

### Out of scope (MVP)

- Inventory, product retail, loyalty, dynamic pricing engines.

---

## 6. Sprint 4: Booking Slots

**Goal:** **BookingSlot** lifecycle: capacity, `bookedCount` field (maintained later), **online bookable**, **status** enums, manual **Filled**; **public** slot picker aligned with **BOOKING_ENGINE_RULES** §6–§8 (incl. **Africa/Cairo** “no past starts”).

**Scope:** Slots only—no booking mutations beyond optional empty validations.

### Backend tasks

- Prisma **BookingSlot**; APIs per **API_CONTRACT** §6.
- **Public** `GET .../public/branches/{branchId}/slots?date=` implementing predicate (Available, online, capacity, not blocked/filled/closed, future start in Cairo).
- RBAC: `slots.*` keys; branch scope on writes.

### Frontend tasks

- Dashboard: slot list/create/edit; capacity editor; status controls; “Filled” affordance.
- Optional read-only calendar shell.

### Database tasks

- Migration **BookingSlot**; indexes per **DATABASE_SCHEMA** §5.

### Tests / manual checks

- Manual cases from **BOOKING_ENGINE_RULES** §19 (slots): Filled with `bookedCount=0` still hidden online; Pending offline.

### Done criteria

- Public slot API matches booking engine doc; integration test or scripted manual checklist signed off.

### Out of scope (MVP)

- Auto-generating slots from staff hours; recurring slot wizard.

---

## 7. Sprint 5: Booking Engine

**Goal:** End-to-end **booking request** flow: **estimate**, **public submit** → **PENDING**; **BookingItem** snapshots; dashboard confirm/reject/follow-up/cancel/reschedule/**confirm-reschedule**; **`bookedCount`** rules; **BookingChangeRequest** + dashboard approve/reject/cancel request per **API_CONTRACT** / **BOOKING_ENGINE_RULES**.

**Scope:** Core product value—no payments/WhatsApp UI beyond placeholders if needed.

### Backend tasks

- **Booking**, **BookingItem**, **BookingChangeRequest** (DATABASE_SCHEMA).
- Public: **estimate**, **POST booking** (Client JWT + phone required).
- Client: cancellation/reschedule **request** endpoints (24h rule).
- Dashboard: full **API_CONTRACT** §5 + §5.1; transactions for status + `bookedCount` (**BOOKING_ENGINE_RULES** §6, §11–§12).
- Audit keys per **BOOKING_ENGINE_RULES** §20 for lifecycle events.

### Frontend tasks

- Dashboard: booking list, filters, detail view, action buttons gated by permissions.
- Optional: minimal booking request UI in web (can expand Sprint 10).

### Database tasks

- Migrations for bookings + items + change requests; FKs and indexes.

### Tests / manual checks

- Execute **BOOKING_ENGINE_RULES** §19 scenarios: PENDING no capacity; CONFIRMED +1; reschedule RESCHEDULED path; client request → approve cancel/reschedule.
- RBAC: Specialist cannot confirm.

### Done criteria

- Swagger lists booking + change-request endpoints; manual walkthrough from website submit to confirm documented.

### Out of scope (MVP)

- Staff auto-availability, automated confirmations, client self-cancel without staff.

---

## 8. Sprint 6: WhatsApp MVP

**Goal:** **WhatsAppTemplate** CRUD (admin); **deep link** generation for dashboard actions (**API_CONTRACT** §11); seed default templates (**SRS §11.4**).

**Scope:** No Meta Cloud API, no outbound job automation—link generation only.

### Backend tasks

- Model **WhatsAppTemplate**; CRUD + `POST .../whatsapp/deep-link` with server-side substitution (**ARCHITECTURE §14**).
- RBAC `whatsapp.templates.manage`, `whatsapp.send`.
- Prisma **seed** template keys aligned with **BOOKING_ENGINE_RULES** §14 table.

### Frontend tasks

- Dashboard: template editor; booking detail “Send WhatsApp” using returned `wa.me` URL.
- Encode `text` query safely.

### Database tasks

- Migration + seed rows for core templates.

### Tests / manual checks

- Open generated link in browser (dev): body contains substituted variables.

### Done criteria

- Staff can produce correct deep link for at least: pending received, confirmed, rescheduled, cancelled.

### Out of scope (MVP)

- **Future:** WhatsApp Business API, BullMQ outbound sends, webhooks (**ARCHITECTURE §15**).

---

## 9. Sprint 7: Payments, VAT, Invoices

**Goal:** **Payment** recording, optional **simple payment status**, **invoice** create/read/edit with RBAC; VAT math consistent with **SystemSettings** and line snapshots.

**Scope:** Money movement recording and documents—no online card capture.

### Backend tasks

- **Payment**, **Invoice** models; endpoints per **API_CONTRACT** §10.
- RBAC: `payments.*`, `invoices.*`; receptionist simple status optional per seed.
- Invoice generation from **Booking** + **BookingItem** snapshots (**DATABASE_SCHEMA** §20).
- Audit on payment/invoice edits.

### Frontend tasks

- Dashboard: booking payments panel; invoice view; policy/VAT read-only where user lacks manage.

### Database tasks

- Migrations; seed optional sample payment for dev booking.

### Tests / manual checks

- VAT off → `vatAmount=0` on new invoices; totals match spreadsheet.
- Branch Manager invoice read scope.

### Done criteria

- At least one booking flows: confirm → record payment → generate invoice → view PDF/HTML (format implementation choice).

### Out of scope (MVP)

- Online payment intents, refunds workflow beyond stub, accounting export.

---

## 10. Sprint 8: Content

**Goal:** **Gallery**, **Review** (testimonials pipeline), **CMS** site blocks; public reads; admin approval (**API_CONTRACT** §2 + §12).

**Scope:** Marketing content—not booking logic.

### Backend tasks

- Models per **DATABASE_SCHEMA**; dashboard CRUD + public GET for approved gallery/testimonials.
- `content.manage` / `content.read` for CMS payloads (**RBAC_MATRIX** §3.19).
- Soft status PATCHs for gallery per **API_CONTRACT**.

### Frontend tasks

- Dashboard: gallery manager, review queue, CMS form.
- Public endpoints consumed by web in Sprint 10.

### Database tasks

- Migrations + seed sample gallery + pending/approved review.

### Tests / manual checks

- Public never shows non-approved reviews.

### Done criteria

- Admin can approve review and see it on public GET.

### Out of scope (MVP)

- Full headless CMS versioning, A/B testing, blog engine.

---

## 11. Sprint 9: Reports + Audit Logs

**Goal:** **Overview**, **operational**, **financial** report endpoints; **audit log** list with filters (**API_CONTRACT** §13–§14); Owner-only audit where matrix says so.

**Scope:** Read aggregations + compliance visibility.

### Backend tasks

- SQL/Prisma aggregations for overview + operational (`overview.read`, `reports.view`).
- Financial endpoint gated by `reports.view_financial` (**RBAC_MATRIX** note on Admin).
- `GET /dashboard/audit-logs` with filters; `audit.read` Owner.

### Frontend tasks

- Dashboard: overview widgets; report pages with export optional (CSV **future**).
- Audit log table with filters.

### Database tasks

- Ensure **AuditLog** indexed; optional read-optimized views later (**ARCHITECTURE §18**).

### Tests / manual checks

- Receptionist denied financial report if matrix/seed says None.
- Audit entries for Sprint 5–7 actions visible.

### Done criteria

- Stakeholder demo: “today’s picture” + booking source breakdown from real seed data.

### Out of scope (MVP)

- Heavy materialized views, scheduled email reports.

---

## 12. Sprint 10: Frontend Website

**Goal:** **Mobile-first** public site: home, catalog pages, gallery/testimonials/contact, **booking wizard** (estimate → slot → auth → phone → submit), client **my bookings** + **change requests**, **WhatsApp** floating CTA (**SRS §2.2**, **§11**).

**Scope:** `apps/web` (or public route group)—assumes API sprints 3–6 delivered.

### Backend tasks

- None required if API complete; minor DTO tweaks as discovered.

### Frontend tasks

- Integrate **packages/api-client**; Zod + RHF forms; error handling per **API_CONTRACT**.
- Booking flow respects **24h** messaging for requests; post-window copy to WhatsApp/phone.
- SEO basics for static/marketing pages (**SRS §20** where applicable).

### Database tasks

- None unless content gaps found.

### Tests / manual checks

- Responsive breakpoints; Lighthouse sanity (no hard numeric gate unless team sets one).
- E2E optional: happy path booking submit (Playwright) **if** team capacity.

### Done criteria

- Client can complete booking request and see it pending in account area.

### Out of scope (MVP)

- PWA offline, native apps, marketing automation.

---

## 13. Sprint 11: Admin Dashboard UI

**Goal:** Full internal UX: login, overview, **slots/calendar**, **pending queue**, **booking detail** (drawer/modal), catalog, clients, settings, WhatsApp templates, reports, audit (**SRS §2.3**, **API_CONTRACT**).

**Scope:** `apps/dashboard`—consumes all prior APIs.

### Backend tasks

- Polish pagination/filter query params; fix any RBAC gaps found during UI integration.

### Frontend tasks

- Layout, nav from `permissions`; branch context selector for multi-branch-ready users.
- Calendar/slot views; booking actions + **change request** inbox; payments/invoice panels.
- Clients list with field masking per **RBAC_MATRIX** (`clients.contact.view`, `clients.notes.sensitive`).

### Database tasks

- None except migration fixes from UI-driven findings.

### Tests / manual checks

- Role walkthrough: Receptionist day-in-life; Specialist limited view.

### Done criteria

- No critical action is UI-only (server must still 403).

### Out of scope (MVP)

- Advanced scheduling UX, drag-drop resource allocation.

---

## 14. Sprint 12: QA, Polish, Deployment

**Goal:** Release-ready MVP: full **manual** regression, deployment runbook, backups, seed for demo/staging.

**Scope:** Hardening—not new features.

### Backend tasks

- Production Swagger policy; CORS lockdown; secure cookie/Headers review.
- Connection pooling notes; logging redaction.

### Frontend tasks

- Empty/loading/error states; copy pass; accessibility quick pass (focus, labels).

### Database tasks

- Migration review; backup/restore documented (Neon/Railway/self-host per **ARCHITECTURE §20**).
- Production seed: roles/permissions, branch, templates, **no** weak default passwords in prod.

### Tests / manual checks

- Full checklist aggregation: **BOOKING_ENGINE_RULES** §19 + **API_CONTRACT** global rules + RBAC matrix spot-checks + VAT/payment + WhatsApp links.
- Load smoke optional.

### Done criteria

- Signed go-live checklist; rollback path documented.

### Out of scope (MVP)

- SOC2 audit, pen-test remediation scope (unless separately scheduled).

---

## 15. Post-MVP / future (explicitly not MVP sprints)

Track separately from the sprint backlog; **do not** implement during MVP sprints unless the SRS is formally extended:

| Area | Examples |
|------|-----------|
| Scheduling | Fully automated staff availability (**FR-BK-010** direction), room/resource optimization |
| WhatsApp | Business Cloud API, automated reminders (**ARCHITECTURE §15**) |
| Payments | Online capture, webhooks, refunds at scale |
| Product | Inventory, loyalty, gift cards, memberships, mobile native apps (**SRS §28** themes) |

---

## 16. Dependency overview (high level)

```text
Sprint 0 ──► 1 (Auth/RBAC) ──► 2 (Branch/Settings)
                    │
                    ├──► 3 (Catalog) ──┐
                    │                  │
                    └──► 4 (Slots) ────┼──► 5 (Bookings + Change requests)
                                       │         │
                                       │         ├──► 6 (WhatsApp)
                                       │         ├──► 7 (Payments/Invoices)
                                       │         └──► 9 (Reports/Audit)
                                       │
                                       └──► 8 (Content)
```

**Frontend:** Sprints **10–11** depend on stable APIs from prior sprints; start UI early only with mocked `api-client` if needed.

---

*End of sprint plan.*
