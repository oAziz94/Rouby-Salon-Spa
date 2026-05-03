# Booking Engine Rules — MVP (Alrouby Salon & Spa)

**Document type:** Normative booking behavior  
**Product source of truth:** `/docs/SRS.md`  
**Alignment:** `/docs/ARCHITECTURE.md`, `/docs/DATABASE_SCHEMA.md`, `/docs/RBAC_MATRIX.md`, `.cursor/rules/project-rules.mdc`

This document defines **exact MVP behavior** for slots, bookings, items, capacity, status transitions, client vs staff rules, pricing/VAT touchpoints, WhatsApp touchpoints, edge cases, and manual QA. It does **not** specify a fully automated staff-availability engine (SRS §10.1, §28; project rules).

**Enforcement:** Rules are implemented in the **NestJS** domain layer (validation + transactions + RBAC per `/docs/RBAC_MATRIX.md`). Clients and receptionists may only perform actions allowed by their APIs.

---

## 1. Booking concept

- A **Booking** is **one client visit** at a branch, anchored to a **BookingSlot** (time window) per SRS §10.2–10.3 and `/docs/DATABASE_SCHEMA.md` (`Booking.slotId`, `Booking.branchId`, `Booking.clientId`).
- A booking has **header money fields** (`subtotal`, `discountAmount`, `vatRate`, `vatAmount`, `totalAmount`) and **operational fields** (`status`, `source`, `clientNotes`, `adminNotes`, `createdByUserId`).
- **One booking** may include **many catalog lines** via **`BookingItem`** rows (SRS §10.2).
- **MVP:** There is **no** engine that auto-computes feasibility from staff calendars, room inventory, or skill graphs. **Receptionist/admin** resolve conflicts and capacity using slots, statuses, notes, and manual overrides (SRS §10.1).

---

## 2. BookingItem concept

- Each **BookingItem** is **one priced line** on the visit (service, service+variant, package, bundle, or add-on line per SRS §10.2).
- **Required snapshots** at line creation time (SRS §23.13, FR-BK-009): `nameSnapshot`, `priceSnapshot`, `durationMinutesSnapshot` (plus `quantity`, optional `assignedStaffId`, optional line `status`).
- **Foreign keys** (`serviceId`, `serviceVariantId`, `packageId`, `bundleId`) are populated consistently with `itemType`; they are **historical references**, not live price sources for totals.
- **Estimated** cart preview on the website may read **live** catalog prices; **persisted** booking lines always store **snapshots** at submit (and optionally refresh on staff **recalculate** action before confirmation—see §15).

---

## 3. BookingSlot concept

- A **BookingSlot** is a **receptionist-defined** container: `branchId`, `date`, `startTime`, `endTime`, `capacity`, `bookedCount`, `status`, `isOnlineBookable`, `notes`, `createdByUserId` (SRS §10.5; schema doc).
- Slots are **not** generated from staff working hours in MVP. Creating/editing slots is a **dashboard** operation (RBAC: `slots.*` keys).
- A slot represents **parallel seats** in that window: **`capacity`** is an integer ≥ 1 (receptionist-configurable, SRS §10.6).

---

## 4. Slot statuses

Allowed enum values (SRS §10.5): **Available**, **Pending**, **Filled**, **Blocked**, **Closed**.

| Status | MVP meaning |
|--------|----------------|
| **Available** | Slot may appear in **internal** calendar lists. **Online** visibility still requires §8 and `isOnlineBookable`. |
| **Pending** | **Staff-controlled** intermediate state. Slot is **not** offered on the **public** slot picker regardless of `isOnlineBookable`. (SRS does not define automation for slot-level Pending; do **not** auto-drive this from booking workflow in MVP unless explicitly built as a later phase.) |
| **Filled** | Slot is **not** available online. May be set **manually** even when `bookedCount < capacity` (SRS §10.6). |
| **Blocked** | Slot is **not** bookable online; used for holds/maintenance. |
| **Closed** | Slot is **not** bookable online; end-of-day or operational closure. |

**Ordering:** `Blocked`, `Closed`, and `Filled` all imply **no online selection**; internal calendar may still show them for context.

---

## 5. Booking statuses

Allowed enum values (SRS §10.4): **Pending**, **Confirmed**, **Requires Follow-up**, **Rescheduled**, **Arrived**, **In Progress**, **Completed**, **Cancelled**, **Rejected**, **No-show**.

**Recommended progression (informational):** Pending → Confirmed → Arrived → In Progress → Completed.

**Alternative exits (SRS §10.4):**

- Pending → **Rejected** | **Requires Follow-up** | **Rescheduled**
- Confirmed → **Cancelled** | **Rescheduled** | **No-show**

**Normative transition matrix (MVP):**

| From → To | Allowed when |
|-----------|----------------|
| **→ Pending** | Initial create for **website** bookings (mandatory, SRS §10.3, FR-BK-006). Dashboard-created bookings **may** start as Pending or Confirmed (§9). |
| **→ Confirmed** | Authorized staff (`bookings.confirm`); client rules satisfied for confirm path. |
| **→ Rejected** | Authorized staff (`bookings.reject`); from **Pending** (typical). |
| **→ Requires Follow-up** | Authorized staff; from **Pending** (typical). |
| **→ Rescheduled** | Authorized staff (`bookings.reschedule`) after handling a client **request** if applicable (§11–§13); implies **slot change** and capacity rules per §11. |
| **→ Arrived** | Authorized staff (`bookings.status.progress`). |
| **→ In Progress** | Authorized staff; from **Arrived** (typical). |
| **→ Completed** | Authorized staff; from **In Progress** (typical). |
| **→ Cancelled** | Authorized staff always; client **request** only per §13. |
| **→ No-show** | Authorized staff; from **Confirmed** (typical). |

**Invalid examples (reject in API):** Confirmed → Pending; Completed → Confirmed; Rejected → Confirmed (use **new** booking instead).

---

## 6. Slot capacity rules

Definitions:

- **`capacity`:** Integer ≥ 1; editable by authorized slot managers (SRS §10.6; RBAC `slots.capacity.configure`).
- **`bookedCount`:** Integer ≥ 0; **derived and maintained by application rules** (not user-editable), unless a future admin tool explicitly allows correction with audit.

**Capacity consumption (MVP normative):**

A booking **counts toward** `bookedCount` for its `slotId` **if and only if**:

1. `booking.slotId` equals the slot, and  
2. `booking.status` ∈ **{Confirmed, Rescheduled, Arrived, In Progress}**.

**Does not count toward active capacity:** Pending, Requires Follow-up, Rejected, Cancelled, **Completed**, **No-show**.

**Completed and No-show:** The booking remains **historically** tied to the slot it occupied (`slotId` unchanged), but after lifecycle closure it **does not** consume **active** future capacity: those statuses are **outside** the counting set above, and `bookedCount` is decremented when leaving a counting state **into** Completed or No-show (same transaction as the status change).

**Rationale:** Pending must not exhaust online capacity (multiple pending could deadlock the public picker). **Rescheduled** reserves capacity on the **current** slot (§11); staff reschedule decrements the **old** slot when the booking previously counted there and increments the **new** slot because **Rescheduled** counts as reserved capacity.

**Online availability predicate (public picker):**

A slot is **selectable** for a **new** website booking **only if**:

1. `BookingSlot.status === Available`  
2. `BookingSlot.isOnlineBookable === true`  
3. `BookingSlot.status` is not `Filled`, `Blocked`, or `Closed` (redundant with §4 but explicit)  
4. `bookedCount < capacity`  
5. The slot’s scheduled **start** (`BookingSlot.date` + `startTime` interpreted in **Africa/Cairo**) is **strictly after** “now” in **Africa/Cairo** — a slot **must never** appear as publicly selectable if its start time is already in the past in that timezone.  
6. Catalog/Branch rules satisfied (branch active, etc.)

When **`bookedCount >= capacity`**, the slot **must not** appear as selectable online (SRS §10.6).

**`bookedCount` maintenance operations:**

| Event | `bookedCount` change |
|--------|----------------------|
| Booking → **Confirmed** (from a state that did **not** count, e.g. Pending) | `+1` on that booking’s `slotId` |
| Booking → **Rescheduled** after staff moves it to a new slot (from a state that counted on the **old** slot, typically **Confirmed**; §11) | `-1` on **old** slot; `+1` on **new** slot (**Rescheduled** counts on the new slot) |
| Booking **Rescheduled** → **Confirmed** (receptionist after client acknowledgement; §11) | no change (both statuses count toward `bookedCount`) |
| Booking transitions **into** **Arrived** or **In Progress** from a counting state | no change (still one seat) |
| Booking leaves the **counting set** for **Cancelled**, **Rejected** (if it had counted), **Completed**, **No-show**, or staff moves it off a slot without the new state counting (not typical after §11 move) | `-1` on the slot that was counting **before** the transition |
| Manual **Filled** on slot | **no automatic** change to `bookedCount` by status alone; see §7 |

**Clarification:** **Completed** and **No-show** do not appear in the public capacity math for picking new seats, but the row stays associated with the slot for history and reporting.

All changes to `bookedCount` occur in the **same database transaction** as the booking status/slot change that triggers them.

---

## 7. Manual mark-as-filled behavior

- Authorized users may set `BookingSlot.status = Filled` **even if** `bookedCount < capacity` (SRS §10.6).
- Effect: slot **immediately fails** the public online predicate (§6) regardless of capacity arithmetic.
- **`bookedCount`:** Setting **Filled** does **not** by itself increment `bookedCount`. Receptionist may use **Filled** to stop online intake while keeping internal visibility.
- **Clearing Filled:** Receptionist may set status back to **Available** or **Pending** per operational policy (not restricted by SRS); audit when combined with money-affecting actions (SRS §22 slot marked filled).

---

## 8. Online bookable behavior

- **`isOnlineBookable`:** Boolean on `BookingSlot`. If `false`, slot **never** appears on the **public** booking slot picker, even if status is `Available` and capacity remains.
- **Staff** may still assign bookings to non–online-bookable slots via **dashboard** (`bookings.create` / `bookings.reschedule`).
- **`isOnlineBookable` + status `Pending`:** Slot remains **offline** for public (§4).

---

## 9. Pending booking workflow

**Trigger:** Client completes SRS §10.3 steps 1–7 (catalog cart, estimate, slot pick, auth, phone, submit).

**Post-conditions (website source):**

1. `Booking.source = WEBSITE` (or as coded).  
2. `Booking.status = PENDING` (**mandatory**, SRS §10.3 step 8, FR-BK-006).  
3. `Booking.createdByUserId = null`.  
4. All `BookingItem` rows persisted with **snapshots** (§15).  
5. Header totals persisted using **same pricing engine inputs** as estimate (VAT/policy §16–17).  
6. **Do not** increment slot `bookedCount` (§6).  
7. **WhatsApp:** No automated send in MVP; optional UX deep link for client “contact us” does not change DB (§14).

**Dashboard queue:** Booking appears in **Pending** lists for authorized branch users (`bookings.read` Branch scope).

---

## 10. Receptionist confirmation workflow

**Actor:** User with `bookings.confirm` (RBAC matrix).

**Preconditions:**

- `booking.status === PENDING` (typical path).  
- Booking belongs to actor’s authorized **branch** scope.  
- Slot still acceptable to staff (manual judgment—no auto staff engine).

**Actions:**

1. Validate slot/branch invariants (`slot.branchId === booking.branchId`).  
2. If policy requires **capacity** check: ensure confirming does not violate business rules **unless** staff override flag passed—MVP default: **reject** confirm if `bookedCount >= capacity` **unless** receptionist uses an explicit **override** reason code (optional field) or increases capacity first. (Without override, hard reject prevents silent overbooking.)  
3. Set `status` → **CONFIRMED**.  
4. Apply `bookedCount += 1` if entering counting set (§6).  
5. Recompute header totals if staff edited lines/discounts before confirm (optional step); snapshots on lines already set at submit unless staff recalculated (§15).  
6. **Audit** `booking.confirmed` with before/after payload (SRS §22).  
7. **WhatsApp:** Staff uses template action **Booking Confirmed** (deep link, SRS §11.3–11.4); not automatic.

**Reject path (`bookings.reject`):** PENDING → **REJECTED**; no `bookedCount` change; audit; WhatsApp optional **Booking Cancelled** / rejection wording per template set.

**Requires follow-up:** PENDING → **REQUIRES_FOLLOW_UP**; no `bookedCount` change unless product later ties follow-up to capacity (out of MVP scope).

---

## 11. Reschedule workflow

**Normative MVP — staff reschedule (`bookings.reschedule`):**

1. Authorized user selects a booking that is **CONFIRMED** (typical); other states follow the same capacity rules in §6 only if they counted on the old slot.  
2. Select **new** `slotId` (MVP assumes the slot defines the time window).  
3. **Single transaction:**  
   - If the booking **counted** toward the **old** slot per §6, `bookedCount(oldSlot) -= 1`.  
   - Assign `booking.slotId = newSlotId`; keep `branchId` consistent with the new slot.  
   - Set `booking.status = RESCHEDULED`.  
   - `bookedCount(newSlot) += 1` because **RESCHEDULED** is in the active counting set (§6).  
4. **Audit** `booking.rescheduled` with before/after slot (and status) payload (SRS §22).

**After client acknowledgement** (WhatsApp or other manual communication), the receptionist sets the booking back to **CONFIRMED**. That transition **does not** change `bookedCount` (**RESCHEDULED** and **CONFIRMED** both count).

**WhatsApp:** Template **Booking Rescheduled** when staff informs the client (SRS §11.4); acknowledgement remains a **process** step until receptionist sets **CONFIRMED**.

**Client-initiated reschedule (SRS §10.7):**

- Applies **24-hour rule** (§13).  
- A client reschedule is a **request**, not an immediate booking/slot mutation. **Staff** must approve or handle it; the public/client API **must not** silently change `slotId` or force **RESCHEDULED** without staff action.  
- Staff performs the actual move and status updates via `bookings.reschedule` as above.

**Recommended future / simple model (not implemented unless the database schema is extended later):** a **`BookingChangeRequest`** entity with: `id`, `bookingId`, `clientId`, `requestType`, `requestedSlotId`, `reason`, `status`, `createdAt`, `handledByUserId`, `handledAt`. Until that exists, store intent using whatever minimal request/ticket pattern the product chooses, without bypassing staff approval.

---

## 12. Cancellation workflow

**Staff-initiated (`bookings.cancel`):**

- From **CONFIRMED** (typical) or other allowed states per policy.  
- Set `status → CANCELLED`.  
- If booking counted toward slot, `bookedCount -= 1` (§6).  
- Audit `booking.cancelled`.  
- WhatsApp template **Booking Cancelled** optional (SRS §11.4).

**Client-initiated cancellation:**

- Subject to **§13** (24-hour window).  
- Outside window: API returns error with message directing client to **WhatsApp/phone** (SRS §10.7).  
- Inside window: record a **cancellation request** only — **not** an immediate `bookings.cancel` mutation on behalf of the client. **Staff** must approve or handle the request and then execute `bookings.cancel` when appropriate. Same **recommended future** pattern as reschedule: **`BookingChangeRequest`** (see §11) if/when the schema adds it.

**Pending rejection overlap:** `Rejected` is terminal for a **request**; treat similarly to cancel for capacity (never counted).

---

## 13. 24-hour cancellation / reschedule rule

**Client actions (website):**

- Client may **request** cancel/reschedule only if `now <= appointmentStart - 24h` using the booking’s **slot start** (`BookingSlot.date` + `startTime` in branch timezone).  
- Fulfilling the request is **always** a staff step (§11–§12); the client action never directly moves the booking or slot as if staff had already approved.  
- **After** window: block automated self-service; show CTA to WhatsApp/phone (SRS §10.7).

**Staff actions:**

- **No** 24-hour restriction for authorized dashboard users (SRS §10.7).

**Timezone:** Use branch timezone if configured; else system default—document in deployment config (implementation detail).

---

## 14. WhatsApp communication points (MVP)

MVP uses **manual deep links** only (SRS §11.1). DB changes are **not** required to send WhatsApp; points below are **product/UX obligations** tied to booking lifecycle:

| Step / event | Who | Template key (examples SRS §11.4) |
|--------------|-----|-------------------------------------|
| After client submits pending request | Staff → client | Booking Request Received |
| After confirm | Staff → client | Booking Confirmed |
| After reschedule communicated | Staff → client | Booking Rescheduled |
| After cancel | Staff → client | Booking Cancelled |
| Reminder | Staff → client | Appointment Reminder |
| After payment/deposit recorded | Staff → client | Deposit/Payment Confirmation |
| After completed visit (MVP testimonial flow) | Staff → client | Review Request |

**Dashboard affordances:** Booking detail: **Send WhatsApp**, **Call**, **Copy phone** (SRS §11.3). No Business API in MVP.

---

## 15. Booking price snapshot rules

1. **On website submit:** For each `BookingItem`, persist `nameSnapshot`, `priceSnapshot`, `durationMinutesSnapshot` from current catalog + chosen variant/package/bundle rules.  
2. **Header fields** (`subtotal`, `discountAmount`, `vatRate`, `vatAmount`, `totalAmount`) persisted with the same calculation pass.  
3. **Later catalog price changes** must **not** alter existing snapshots automatically.  
4. **Staff edits before confirm:** Authorized users may **recompute** lines from catalog **while** `status === PENDING` (optional product button); each recompute **overwrites snapshots** and header totals **and** must be **audit-logged** as pricing change (SRS §22).  
5. **After CONFIRMED:** Do **not** auto-refresh snapshots; adjustments go through **discount** (`bookings.discount.apply`) or manual invoice/payment flows with audit.

---

## 16. VAT calculation points

Inputs (SRS §13.4): system VAT enabled/disabled, default rate, prices include VAT yes/no, show VAT on invoice, tax registration number; line/catalog taxable flags.

**When to calculate:**

1. **Website estimate** (pre-submit): read-only for UX.  
2. **Booking create** (Pending): persist `vatRate`, `vatAmount`, totals on `Booking` consistent with settings at that time.  
3. **Staff recompute** (optional, Pending only): same as (2) with audit.  
4. **Invoice generation** (SRS §13.5): invoice lines derive from **booking snapshots** + header; VAT breakdown respects **show VAT on invoice** and enabled/disabled flags.

**If VAT disabled:** `vatAmount = 0`; `vatRate` stored as 0 or null per implementation; invoice still coherent.

---

## 17. Deposit / payment policy points

Admin-configured policy (SRS §13.1): pay at salon, optional deposit, required deposit, future online payment, manual Instapay confirmation.

**MVP behavior (normative):**

1. **Policy read** on booking checkout and on staff confirm screens to show **copy/CTA** (e.g. deposit required → must acknowledge; enforcement beyond copy is **manual** staff/process unless payment integration exists).  
2. **Recording payments** uses `Payment` rows (`payments.record`, `payments.record_simple` per RBAC).  
3. **No** automatic capture of online card payments in MVP (SRS §13.1 MVP recommendation).  
4. Changing policy **does not** retroactively alter old bookings; new calculations use **current** policy at time of action.

---

## 18. Edge cases

| Case | Rule |
|------|------|
| Confirm when `bookedCount >= capacity` | **Reject** by default; allow only with explicit documented override path or after capacity increase / manual Filled cleared. |
| Slot set **Filled** while bookings exist | Allowed; online picker blocked; staff still manage existing bookings manually. |
| Website booking references slot that flipped to Blocked before submit | **Reject** submit with friendly error; user must pick another slot. |
| Race: two clients submit last seat | Second submit **rejects** at transaction commit if first confirm consumed capacity; website must handle error. |
| Dashboard booking immediately **Confirmed** | Allowed; apply `bookedCount` rules on confirm; `source != WEBSITE`. |
| Move booking to slot in another branch | **Reject** unless product explicitly supports cross-branch moves (default **reject**). |
| Specialist tries confirm | **Deny** (`bookings.confirm` None). |
| Client tries API confirm | **Deny** (no permission). |
| Reschedule client request inside 24h but staff not yet acted | Request stored; staff acts without 24h limit. |
| Bundle/package inactive after pending submit | Do **not** auto-cancel; staff resolves (reject or adjust lines) with audit. |
| `slotId` null | Schema default **discouraged**; if allowed for “TBD”, never show online; staff must assign slot before confirm if policy requires. |

---

## 19. Manual testing checklist

**Slots**

- [ ] Create slot `Available`, `isOnlineBookable=true`, `capacity=3`, `bookedCount=0` → appears online.  
- [ ] Set `isOnlineBookable=false` → disappears online, staff can still assign.  
- [ ] Set status `Blocked` / `Closed` / `Filled` → disappears online.  
- [ ] Set `Filled` with `bookedCount=0` → still not online (§7).  
- [ ] Increase/decrease **capacity** as receptionist → online visibility updates per §6.  
- [ ] Set slot `Pending` → not online.

**Website booking**

- [ ] Submit booking → `PENDING`, snapshots populated, `bookedCount` unchanged.  
- [ ] Confirm → `CONFIRMED`, `bookedCount+1`.  
- [ ] Reject pending → `REJECTED`, count unchanged.

**Capacity**

- [ ] Confirm bookings until `bookedCount == capacity` → slot not selectable online.  
- [ ] Cancel confirmed → `bookedCount-1`, slot may reappear online.

**Reschedule**

- [ ] Staff reschedule **Confirmed** booking to new slot → status **RESCHEDULED**, old slot decrements, new slot increments; after “ack” flow, receptionist → **CONFIRMED** with no further count change (§11 + audit).

**24-hour rule**

- [ ] Client request cancel **inside** window → records a **request** only; booking stays until staff runs `bookings.cancel` (§12).  
- [ ] Client request cancel **outside** window → blocked with WhatsApp/phone message (SRS copy).  
- [ ] Staff cancel anytime → succeeds.

**RBAC**

- [ ] Receptionist cannot manage VAT or payment policy endpoints.  
- [ ] Specialist cannot confirm/reject/slots mutate.

**WhatsApp**

- [ ] From booking detail, deep link renders expected substituted template for pending/confirmed/reschedule/cancel flows.

**VAT / totals**

- [ ] Toggle VAT off → new bookings show `vatAmount=0`; invoices respect flag.  
- [ ] Taxable vs non-taxable line mix → totals match spreadsheet expectation.

**Payments**

- [ ] Record payment against booking → visible on booking and invoice views per permissions.

**Audit**

- [ ] Confirm, reject, reschedule, cancel, slot filled, discount apply, payment edit each emit **AuditLog** with meaningful `oldValue`/`newValue` (SRS §22).

---

## 20. Audit action keys (examples)

Use stable string keys for `AuditLog` / domain events (exact examples; extend only with product approval):

- `booking.created`
- `booking.confirmed`
- `booking.rejected`
- `booking.requires_follow_up`
- `booking.rescheduled`
- `booking.cancelled`
- `booking.arrived`
- `booking.in_progress`
- `booking.completed`
- `booking.no_show`
- `slot.created`
- `slot.updated`
- `slot.capacity_changed`
- `slot.marked_filled`
- `booking.price_recalculated`
- `booking.discount_applied`
- `payment.recorded`
- `invoice.generated`

---

*End of booking engine rules.*
