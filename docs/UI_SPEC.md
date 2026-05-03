# UI Specification — Alrouby Salon & Spa

**Document type:** Visual and interaction specification for implementation  
**Product source of truth:** `/docs/SRS.md`  
**Visual source of truth:** Approved Figma file (see §1)  
**Alignment:** `/docs/ARCHITECTURE.md`, `/docs/API_CONTRACT.md`, `/docs/SPRINT_PLAN.md`, `.cursor/rules/project-rules.mdc`

This document defines how the **public website**, **client booking/account UI**, and **admin dashboard** should look and behave. It does **not** replace backend rules in `/docs/BOOKING_ENGINE_RULES.md` or `/docs/RBAC_MATRIX.md`; the UI must reflect API responses, permissions, and validation errors without inventing parallel business logic.

**Language:** All user-facing copy is **English** only.  
**Currency:** Display all prices, estimates, totals, and invoices in **EGP** (see API `currency: "EGP"` where returned).

---

## 1. Figma source

| Item | Detail |
|------|--------|
| **Figma link** | https://www.figma.com/make/ugNs6kx30vJTxT6T5IJlQA/Alrouby-Salon?t=hQ7H96t8N4woEh38-1&preview-route=%2Fbooking%2Fservices |
| **Authority** | The approved Figma file is the **UI source of truth** for layout, composition, component variants, and pixel-level decisions. This `UI_SPEC.md` summarizes tokens and rules for developers and for Cursor; if Figma and this doc disagree, **follow Figma** and then update this doc in the same change. |
| **Exported screenshots** | Reference and regression visuals are stored under `/docs/ui-screens` (desktop and mobile exports, dashboard views, booking steps, etc.). Use these for implementation checks when Figma access is limited; they are **not** a substitute for the live Figma file for spacing and type scale. |

---

## 2. Brand direction

- **Positioning:** Premium botanical luxury salon and spa — confident, serene, and high-trust.
- **Personality:** Warm, elegant, calm, earthy, professional.
- **UX goals:** Mobile-first clarity for booking; fast-scan density for staff on the dashboard without visual noise; WhatsApp as a natural extension of service (prominent but not aggressive).

**Imagery and motifs (implementation guidance):** Botanical textures, soft natural light, restrained gold accents, deep greens and plums for depth. Avoid loud gradients or neon accents unless Figma explicitly introduces them.

---

## 3. Color tokens

Map these to **Tailwind theme tokens** (e.g. `colors.primary`, semantic aliases). Use names below consistently in design handoff and code.

| Token name | Hex | Typical usage |
|------------|-----|----------------|
| **Primary Green** | `#17351F` | Primary actions, key headers, strong brand anchors on public site |
| **Deep Plum** | `#2A1722` | Hero overlays, footer or dark sections, dashboard sidebar base |
| **Champagne Gold** | `#B9974A` | Accents, dividers, focus rings, premium highlights |
| **Warm Cream** | `#F3EBDD` | Section backgrounds, cards on public site, subtle panels |
| **Mushroom Taupe** | `#7A6A58` | Secondary text, borders, muted UI chrome |
| **Sage Green** | `#6E775D` | Secondary buttons, tags, supportive accents |
| **Rust Accent** | `#8B4428` | Warm CTAs sparingly, alerts that need warmth (not error red) |
| **Inky Blue** | `#24383B` | Dashboard workspace headers, data-dense chrome |
| **Charcoal Text** | `#1F2420` | Body text on light backgrounds |
| **Soft Background** | `#FAF7F0` | Global page background (public + dashboard canvas) |

**Semantics:** Define explicit **semantic** tokens (e.g. `foreground`, `muted-foreground`, `card`, `border`, `primary`, `destructive`) that reference the palette above so components do not scatter raw hex values. **Destructive** and **success** states should still meet WCAG contrast on their surfaces; if Figma specifies different reds/greens for system feedback, align Figma → tokens.

---

## 4. Typography

| Context | Font stack | Usage |
|---------|------------|--------|
| **Public website — headings** | `Cormorant Garamond` or `Playfair Display` (choose **one** family per build; match Figma) | H1–H6, section titles, hero headlines |
| **Public website — body** | `Manrope` or `Inter` (choose **one**; match Figma) | Paragraphs, UI labels on marketing pages, forms on `/booking` if Figma unifies with marketing |
| **Dashboard — all text** | `Inter` | Navigation, tables, forms, KPIs, badges |

**Clarification:** Use **Inter** for the dashboard UI even if the public website uses a different body font (**Manrope** or otherwise). The dashboard must prioritize readability, tables, forms, and operational clarity.

**Rules:**

- Load only the weights used in Figma (typically 400, 500, 600, 700 for UI; display may use 500–600).
- **Numeric alignment:** In dashboards, use tabular figures (`font-variant-numeric: tabular-nums`) for times, counts, and **EGP** amounts in tables and KPIs.
- **Line length:** Marketing body copy max-width ~65–75ch where layout allows.

---

## 5. Layout rules

Values below are **defaults for implementation**; Figma remains authoritative for exact pixels.

### 5.1 Desktop container widths

- **Public marketing pages:** Max content width **1280px** (outer container **1440px** with horizontal padding **24–48px**).
- **Booking wizard:** Max width **720–960px** for readability of forms and summaries (match Figma frame).
- **Dashboard workspace:** Fluid width with **24–32px** inner padding; optional max width for ultra-wide monitors per Figma.

### 5.2 Mobile-first behavior

- Design **320px** upward; primary breakpoints commonly **sm** / **md** / **lg** / **xl** per Tailwind defaults unless Figma specifies custom grids.
- **Touch targets:** Minimum **44×44px** for interactive controls on mobile.
- **Navigation:** Public header collapses to menu pattern defined in Figma (e.g. sheet, drawer, or icon menu).

### 5.3 Section spacing

- **Public vertical rhythm:** **64–96px** between major homepage sections on desktop; **40–56px** on mobile (tighten if Figma shows less).
- **Dashboard:** **24–32px** between widget regions; tighter **16–24px** inside cards.

### 5.4 Card spacing

- **Internal padding:** **16–24px** (mobile **16–20px**).
- **Gap between cards in a grid:** **16–24px**.

### 5.5 Border radius

- **Cards / inputs / modals:** **8–12px** (use one scale from Figma, e.g. `rounded-lg` / `rounded-xl`).
- **Pills / badges:** **full** or **6px** per Figma.
- **Hero media:** Radius per Figma (often **12–16px** or none full-bleed).

### 5.6 Shadows

- **Cards (rest):** Soft, low blur (e.g. `0 1px 2px` / `0 4px 12px` very subtle) using alpha black or **Mushroom Taupe** at low opacity — avoid harsh pure black.
- **Elevated / hover:** Slightly stronger shadow + **1px** border if Figma uses “outlined lift.”
- **Modals / drawers:** Stronger elevation + backdrop **Deep Plum** or neutral at **40–60%** opacity per Figma.

---

## 6. Public website UI rules

**Routing note:** Primary **“Book Appointment”** (and equivalent CTAs) navigate to **`/booking`** to start the booking flow (SRS §7.1 booking page; sprint plan).

### 6.1 Header / navbar

- Logo left; primary nav: key destinations per SRS (Services, Packages, Bundles, Offers, Gallery, Testimonials, Contact — exact subset per Figma).
- **Book Appointment** as primary CTA (Primary Green or Rust Accent per Figma); visually dominant.
- Optional **Sign in** / account entry for clients.
- Sticky behavior, background blur or solid **Soft Background** / cream per Figma on scroll.

### 6.2 Hero

- Premium hero: headline (display font), subcopy, primary **Book** CTA, secondary CTA (e.g. **Browse services** or **WhatsApp**) per Figma.
- Hero imagery or botanical treatment; text contrast meets WCAG on photos (overlay using **Deep Plum** / green scrim if needed).

### 6.3 Featured services

- Grid or carousel of featured items from **CMS/API** — not hardcoded (SRS §20, `GET /public/services` / CMS blocks).
- Show image, name, **EGP** price or price display type (fixed / starts from / range / contact — SRS §7.4).
- Link to service detail; optional **Ask on WhatsApp** with prefilled message (SRS §11.2).

### 6.4 Wellness packages

- Cards for packages (`GET /public/packages`): name, short description, **package price** in **EGP**, estimated duration, CTA to detail or add to booking flow per product wiring.

### 6.5 Bundles

- Distinct layout from packages; communicate **bundle type** and selection rules (`GET /public/bundles`) per SRS §9.2.
- CTA to booking flow with bundle pre-selection when applicable (implementation follows API).

### 6.6 Gallery

- Masonry or grid per Figma; data from `GET /public/gallery` (categories, ordering).

### 6.7 Testimonials

- Approved items only (`GET /public/testimonials`); star rating, quote, client display name per approval rules (SRS §19.2).

### 6.8 Visit Us / contact

- Branch card: address, phone, **WhatsApp**, map link, hours (`GET /public/branches`).
- **Soft Background** or **Warm Cream** section separation.

### 6.9 Footer

- Deep background (**Deep Plum** or **Primary Green** per Figma); muted links; social icons; legal links (Privacy, Terms & cancellation — SRS §7.1).

### 6.10 Floating WhatsApp button

- Fixed position (typically **bottom-right**), always visible on public pages, **brand green** or official WhatsApp green only if Figma specifies; tap opens `wa.me` with salon number and optional default text from branch config (SRS §11.2, ARCHITECTURE §14).

### 6.11 Additional SRS pages

Implement **About**, **Offers**, **Service detail**, **Legal**, **Login/Register**, **Profile** with the same token system and Figma layouts when frames exist; do not invent new section types beyond SRS §7.1.

---

## 7. Booking flow UI rules

**Data:** All catalog, slots, estimates, and submission come from **`/docs/API_CONTRACT.md`** (`/public/*`, `/client/*`). Show errors using API `message` / `code` (e.g. `CLIENT_PHONE_REQUIRED`, `CANCEL_WINDOW_EXPIRED`).

### 7.1 Entry

- **Book Appointment** → **`/booking`**.
- Guest may build a cart; **submission** requires client authentication and phone per SRS §5.1–5.2 and API §2.5.

### 7.2 Stepper behavior

- Linear steps with clear **completed / current / upcoming** states (Champagne Gold or Sage for completed checkmarks per Figma).
- Steps recommended (labels may shorten in UI): **1) Services** → **2) Date & slot** → **3) Account** → **4) Phone** → **5) Review** → **6) Submitted (pending)**.
- Allow **Back** without losing selections where API allows; re-fetch estimate on item or branch change (`POST /public/bookings/estimate`).

### 7.3 Service multi-select

- Multi-select **services**, **variants**, **packages**, **bundles** per booking engine (SRS §10.2).
- Variant picker inline or sheet per Figma; show **duration** and **EGP** from API.
- **Bundles:** UI for eligible picks and quantities must follow rules returned by API for the selected bundle.

### 7.4 Selected items summary

- Sticky summary panel (desktop) or collapsible bar (mobile): line items with **name snapshots** after submit; before submit, show catalog names + estimated **EGP** subtotal/total/VAT line from estimate response.
- Show **total duration** estimate when API provides basis for aggregation.

### 7.5 Date and slot selector

- Date picker constrained to allowed dates; slots from `GET /public/branches/{branchId}/slots?date=` — only API-eligible slots are selectable.
- Display slot as **localized time** in **Africa/Cairo** context per ARCHITECTURE; clear **empty slot** state for the selected day.

### 7.6 Login / register step

- Social providers (Google, Facebook) and optional email/phone auth per SRS §12 — UI matches whatever OAuth flow the API exposes; handle placeholder states gracefully if providers not yet wired.
- Explain **why** sign-in is needed before confirmation.

### 7.7 Phone required step

- Dedicated capture if profile lacks phone: `PUT /client/me/phone` before enabling **Submit** (`POST /public/bookings`).
- Validation UX: inline errors, country code UX per Figma.

### 7.8 Review request

- Show branch, slot, items, totals, policies snippet (deposit/VAT messaging from settings when available), optional **client notes** field (SRS §10.3).
- Primary button **Submit booking request** creates **`PENDING`** booking (`FR-BK-006`).

### 7.9 Pending confirmation

- Post-submit screen: success icon, copy that team will confirm via **WhatsApp** or contact, **booking reference** if API returns id, CTA **View my bookings**.
- Optional **Open WhatsApp** with prefilled “booking request” message to branch number (deep link, MVP).

### 7.10 My bookings

- List from `GET /client/bookings` with **status badges** (§10); filter by status if Figma includes chips.
- Row navigates to booking detail with items (snapshots), slot date/time, **EGP** totals.

### 7.11 Request cancellation / reschedule modal

- **Cancellation** and **reschedule** are **requests** only (`POST .../cancellation-requests`, `POST .../reschedule-requests`); never imply instant cancel in UI.
- Modal: reason (optional), for reschedule include **new slot** selector fed by public slots API.
- If API returns **24-hour window** violation: show message directing user to **phone/WhatsApp** (SRS §10.7, API global rules).

---

## 8. Dashboard UI rules

**Shell:** **Dark elegant sidebar** (**Deep Plum** / **Inky Blue** gradient or solid per Figma); **warm light workspace** (**Soft Background** / off-white) for content.

### 8.1 Sidebar

- Logo, branch selector (for multi-branch-ready roles), nav grouped by modules (SRS §17.1). Hide or disable items lacking permission keys from `GET /dashboard/auth/permissions`.

### 8.2 Workspace

- Page title + optional subtitle; **breadcrumbs** optional per Figma.

### 8.3 KPI cards

- Overview (`GET /dashboard/reports/overview`): today’s bookings, pending, revenue, etc. — card grid, **Inter**, tabular nums for **EGP**.

### 8.4 Tables

- Dense but readable; zebra or row hover subtle **Warm Cream**; actions as icon buttons with tooltips.
- Pagination per API `meta` (API_CONTRACT §1.3).

### 8.5 Filters

- Filter bar above tables: date range, branch (if allowed), status, client search; **Apply** / **Reset** behavior per Figma; sync to URL query params where sprint plan implies shareable views.

### 8.6 Calendar

- Day / week / month / slot views (SRS §17.3); color coding by **booking status** (legend uses §10 badge colors).
- Create manual booking entry point from calendar per permissions (`bookings.create`).

### 8.7 Slot management

- Slot list and editor: **capacity**, **booked count** (read-only where appropriate), **online bookable** toggle, **status** (Available, Pending, Filled, Blocked, Closed — SRS §10.5), notes.
- Manual **Filled** action clearly labeled (FR-BK-005); confirm if Figma uses destructive pattern.

### 8.8 Booking details drawer

- **Drawer or wide panel** (per Figma) opened from calendar/table: client summary (mask phone/email without `clients.contact.view`), items table with snapshots, payments, **admin notes**, status timeline.
- **Quick actions** gated by permission: confirm, reject, require follow-up, reschedule, confirm reschedule, cancel, mark arrived / in progress / completed / no-show (API_CONTRACT §5).

### 8.9 Status badges

- Use §10 mapping consistently in tables, calendar chips, and drawer header.

### 8.10 Quick actions

- Primary row of icon/text buttons: **Confirm**, **WhatsApp**, **Call** (tel:), **Copy phone** where contact permission allows.

### 8.11 WhatsApp actions

- **Send WhatsApp** opens generated URL from `POST /dashboard/whatsapp/deep-link` with template key + booking context; show toast on copy/open failures.
- Template management screens for admin (`whatsapp.templates.manage`).

### 8.12 Booking change request inbox

- Queue for client-initiated cancel/reschedule requests (`/dashboard/booking-change-requests`) with **Approve** / **Reject** / **Cancel request** actions per API_CONTRACT §5.1; copy explains staff outcome vs client messaging.

### 8.13 Other modules

- Clients, catalog, offers, gallery, testimonials queue, settings, users/roles, reports, audit: follow same **sidebar + workspace** pattern, tables, and forms; **field-level masking** per RBAC for sensitive client data.

---

## 9. Component rules

Use **shadcn/ui** primitives where they accelerate consistency (Button, Input, Dialog, Sheet, Tabs, Toast, Table, DropdownMenu, etc.), themed with §3–§5 tokens.

### 9.1 Buttons

- **Primary:** Primary Green background, **Warm Cream** or white text; hover darkens slightly; focus ring **Champagne Gold**.
- **Secondary:** outline or **Sage** muted fill per Figma.
- **Ghost / link:** text-only for tertiary actions.
- **Destructive:** reserved for irreversible actions (reject, delete slot); confirm dialogs mandatory.

### 9.2 Inputs

- **8–12px** radius, clear label, helper text, error text in accessible contrast (Rust or dedicated error token if defined in Figma).
- Disabled state muted background; readonly fields for snapshots post-booking.

### 9.3 Cards

- **Warm Cream** or white surface on **Soft Background**; subtle border or shadow per §5.

### 9.4 Tables

- Sticky header optional for long lists; empty state illustration + CTA; loading skeletons.

### 9.5 Modals

- Focus trap, **Close** control, mobile full-screen or bottom sheet if Figma specifies.

### 9.6 Drawers

- Booking detail: **right-side** drawer default; width **min(480px, 100vw)** or per Figma.

### 9.7 Badges

- Small caps or sentence case per Figma; see §10 for booking statuses.

### 9.8 Tabs

- Underline or pill style per Figma; keyboard accessible.

### 9.9 Toasts

- Success / error / info; non-blocking; API errors show human-readable `message` where safe.

### 9.10 Empty / loading / error states

- **Empty:** Illustration or icon, short headline, single primary CTA (e.g. “Create slot”, “Browse services”).
- **Loading:** Skeletons for cards/tables; avoid blocking spinners unless unavoidable.
- **Error:** Friendly copy + **Retry**; for 403, explain insufficient permissions.

---

## 10. Booking status badge styles

API enums align with SRS §10.4. Suggested visual mapping (adjust hex to match Figma swatches if specified there):

| Status | Suggested surface | Suggested text / icon |
|--------|-------------------|----------------------|
| **Pending** | Warm Cream / light yellow tint | **Mushroom Taupe** or **Inky Blue** |
| **Confirmed** | Soft sage tint (`#6E775D` at ~15% opacity) | **Primary Green** |
| **Requires Follow-up** | Light lavender or cool gray tint | **Inky Blue** |
| **Rescheduled** | Light blue-gray tint | **Inky Blue**; optional clock icon |
| **Arrived** | **Champagne Gold** at low opacity | **Deep Plum** or **Primary Green** |
| **In Progress** | **Sage Green** solid or strong tint | White or cream |
| **Completed** | Muted green or neutral gray “success” | **Charcoal Text** |
| **Cancelled** | Neutral gray | Dimmed **Charcoal** |
| **Rejected** | Light rose or muted red background | Dark red text (destructive-adjacent) |
| **No-show** | Light rust tint | **Rust Accent** or dark variant |

**Rules:**

- **Do not** rely on color alone — include **text label** always.
- **Legend** on calendar and reports uses the same mapping.

**Slot statuses** (dashboard slot management, SRS §10.5): use a **separate** badge set (e.g. Available = soft green outline, Filled = solid neutral, Blocked = striped or warning pattern) — define in Figma; do not conflate with booking statuses.

---

## 11. Implementation rules for Cursor

1. **Follow Figma and this `UI_SPEC.md`** for all UI work; do not invent alternate palettes, fonts, or layout systems.
2. **Do not invent new UI styles** beyond what Figma + this spec cover; if a screen is missing in Figma, extend by **analogy** from existing frames (same tokens, spacing, type).
3. **Reusable components:** Shared primitives between `web` and `dashboard` only where product makes sense (e.g. `packages/ui`); otherwise keep apps separate but **token-aligned**.
4. **Tailwind:** Encode §3–§5 as theme extensions (`theme.extend.colors`, `fontFamily`, `boxShadow`, `borderRadius`); prefer semantic class names or `@apply` in cva variants over scattered literals.
5. **shadcn/ui:** Use for accessible primitives; theme shadcn with the same tokens.
6. **No hardcoded business data** in components — fetch from API per **`/docs/API_CONTRACT.md`**; use CMS/home endpoints for marketing lists.
7. **Money and time:** **EGP** formatting; timezone **Africa/Cairo** for display of slots and bookings unless user locale is explicitly product-scoped later.
8. **English only** in UI strings.
9. **WhatsApp (MVP):** Use **deep links** (`wa.me` + encoded `text`) from branch config or `POST /dashboard/whatsapp/deep-link` — no WhatsApp Business API in MVP (SRS §11.1, ARCHITECTURE §14).
10. **Authorization:** UI hides forbidden actions based on `permissions`; **always** handle 403 from API without crashing.
11. **Accessibility:** Visible focus, labels on inputs, sufficient contrast — meet WCAG **AA** where feasible for text on backgrounds.

---

*End of UI specification.*
