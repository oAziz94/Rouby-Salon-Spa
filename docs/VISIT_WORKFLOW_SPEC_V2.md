# Visit Workflow Spec v2 — proposal (supersedes BOOKING_ENGINE_RULES §5–§13 and RBAC §3.2a/§3.12/§3.13 where stated)

**Status:** APPROVED by owner on 2 Oct 2026 (decisions below). Nothing here is implemented yet.
**Why:** The current rules were written for a "booking request" system. The salon actually runs a **front-desk visit** flow (walk-ins, parallel services, pay-at-end). The two were bolted together, producing three state machines (Booking status, QueueEntry status, BookingItem line status), hard blocks that stop reception in normal situations, and permission gaps that make the day impossible for the Receptionist role.

Every rule below is tagged:
- **HARD** — the system refuses; no override.
- **SOFT** — the system warns and lets an authorised user proceed with a reason; audited.
- **FREE** — no check.

Items marked **[DECISION]** need the owner's answer; a recommended default is given.

---

## 1. One lifecycle, one screen

A **Visit** is the unit of work. A visit is created by a confirmed booking, a walk-in, or a phone booking. The Queue is the only screen reception needs during the day; Bookings/Calendar are for planning and history.

```
PLANNED (booking exists, client not here)
   │  check-in / walk-in
   ▼
WAITING ──start any service──▶ IN SERVICE ──all services done──▶ READY TO PAY ──close──▶ DONE
   │                                │                                 │
   └── no-show / cancel             └── cancel (reason)               └── close with balance (SOFT)
```

- **Booking status** becomes derived from the visit: `CONFIRMED` → `ARRIVED` (on check-in) → `IN_PROGRESS` (first service start) → `COMPLETED` (close). Reception never sets these by hand; the "Arrived / In progress / Completed" buttons in booking detail go away.
- **Line status** (per service: pending / in progress / done) stays, because it drives staff workload and reports, but it must never block the front desk (see §3).
- **Walk-ins** are visits without a planned slot. They **no longer** get a fake 11:30 PM "bucket slot"; the drawer/calendar shows "Walk-in · 10:36 PM arrival" instead. (Schema: `Booking.slotId` becomes nullable for `source = WALK_IN`; see §9.)

## 2. Getting the client in

| Step | Rule | Tag |
|---|---|---|
| Website booking | Pending until reception confirms (unchanged). Pending does **not** reserve capacity (unchanged). | HARD |
| Confirm | Slot must have capacity, else warn "slot is full (4/4) — confirm anyway?" | SOFT |
| Phone/dashboard booking | May be created directly as Confirmed (unchanged). Booking a slot already in the past warns. | SOFT |
| Check-in | One click from the Expected list. Allowed up to end of the business day; late arrival shows "+42 min late" badge. | FREE |
| Walk-in | Name + phone (phone optional only if `clients.create` policy allows anonymous; **[DECISION 1]** default: phone required, existing client auto-matched by phone). At least one service line required. | HARD (1 line) |
| Duplicate client names | Picker always shows phone; new-visitor flow warns "a client with this phone exists — use them?" | SOFT |

## 3. During the visit — the big change

Current: one service at a time per visit; staff must be on shift **right now** or the start is refused; each line is completed one by one inside a drawer; "Finish" is disabled until every line is done.

Proposed:

| Rule | Tag | Rationale |
|---|---|---|
| Starting a service requires a staff member | **HARD** | Needed for staff reports and commissions. |
| Staff must be **qualified** for the service | **SOFT** (warn "Doaa isn't listed for Keratin — assign anyway?") | Skills list is often out of date. |
| Staff must be **on shift now** | **SOFT** (warn "Outside Asmaa's hours (12:00–21:00)") | Stylists stay late and cover each other. Today this block makes after-hours visits impossible. |
| Staff already busy with another client | **SOFT** (warn, show who) | Hair-colour processing time: one stylist legitimately runs two clients. |
| Several services of one visit **in progress at once** | **FREE** | Manicure during colour processing is the normal case. |
| Add a service mid-visit | FREE until closed; after invoice finalised → adds a new invoice line and re-totals (no "finalised invoice blocks items"). | — |
| Mark a service done | From the card (one tap per line) **or** "Mark all done" on the card. Stylists with a dashboard login may mark **their own** line done from their phone (**[DECISION 2]** default: yes, Staff role gets `bookingServiceItems.complete` on own lines). | FREE |
| Service running > expected duration + 30 min | Card shows amber "running long"; nothing blocks. | — |
| Visit in service > 4 h with no activity | Card shows red "stale — check"; manager can cancel/close with reason. | SOFT |

## 3a. Choosing services — the receptionist's most repeated action

**Today (observed):** inside the walk-in / new-booking dialog the receptionist must (1) pick a line *type* from a dropdown (Service / Package / Add-on), (2) click "Select service", (3) type in a ~200 px popover that shows three items at a time, (4) pick, (5) if the service has variants, pick the variant in a second dropdown, (6) for "Ask" priced services type a price, (7) press "+ Service" and repeat for the next line. Search is an English substring match on the name only; there is no Arabic, no abbreviations ("mani", "pedi"), no typo tolerance, no keyboard navigation, no price edit for "From EGP 2,000" services, and nothing that says what this client had last time.

**Target (industry reference: Fresha/Zenoti checkout "add service" search, Booksy quick-add):** one search box, one list, two taps per line.

| Rule | Detail |
|---|---|
| One search box for everything | Services, variants, packages, add-ons and bundles are all results of the same search. No "type" dropdown first. The result row shows its kind as a small tag. |
| Big picker | Opens as a full-height panel (right side on desktop, full screen on phone) with at least 8–10 rows visible, category chips across the top (Hair, Nails, Spa, Hair removal…), and a sticky "Selected (3) · EGP 1,350 · 2h 15m" footer. |
| Search that matches how people talk | Match on: English name, **Arabic name** (new `nameAr` field on services/variants/packages/add-ons), **aliases** (new `searchAliases[]`: "mani", "pedi", "blowout", "صبغة", "مانيكير"), category name, and variant name. Prefix and word-start matches rank first; typo tolerance of one edit for words ≥ 5 letters. Diacritic/hamza-insensitive Arabic matching (أ/ا/إ, ة/ه, ى/ي). |
| Variants inline | A service with variants expands in place ("Full Hair Color → Short / Medium / Long") so the receptionist taps the variant directly; one tap, not a second dropdown. |
| Price shown, editable where the catalog allows | FIXED: shown, not editable (discount is a separate action). STARTS_FROM / RANGE: shown with the base, editable within [min, max] with a reason-free entry. CONTACT ("Ask"): price must be entered. HIDDEN: not bookable from the picker. |
| Add-ons attach to a line | After picking a service, its compatible add-ons appear as chips under it ("+ Scalp massage EGP 150"); tapping adds the add-on to that line. Add-ons are also searchable on their own. |
| Quantity | Tap-to-increment on the selected line for things sold per unit (e.g. "Single Nail Repair × 3"). |
| Client memory | Top of the list before typing: **"Last visit: Hair Cut, Blow Dry"** (one tap re-adds all), then **Recent / popular** (branch-wide, last 30 days), then categories. |
| Staff-qualified hint | If a stylist is already chosen on the visit, services she isn't listed for are shown greyed with "(not Asmaa)"; still selectable (SOFT, see §3). |
| Keyboard | ↑/↓ moves, Enter adds, Esc closes, typing refocuses search. Barcode/number pad not needed. |
| Speed | Catalog is loaded once per session and cached (today it is fetched on every dialog open); search runs client-side, < 50 ms. |
| Duration | Each selected line shows duration; the footer shows total; nothing blocks on duration. |

**Data changes:** `nameAr`, `searchAliases[]` on Service, ServiceVariant, Package, Bundle, ServiceEnhancement (migration, nullable, admin-editable in the catalog screens); `ServiceEnhancement.compatibleServiceIds[]` already exists as the enhancement–service link in the catalog — reuse it.

**Where it is used:** walk-in dialog, new booking, "Add service" on a queue card, and the website booking cart (same search logic, public names only).

## 4. Paying and closing

Current: Finish = finalize invoice (Owner/Admin-only permission) → full payment required → Complete. Receptionist can do neither.

Proposed:

| Rule | Tag |
|---|---|
| When the last service is done, the visit moves to **Ready to pay** automatically and the invoice is created (draft → finalised at close). | — |
| Receptionist can finalise invoices and record payments (any method) at the queue. **Permissions:** grant `invoices.create_finalize`, `payments.record` to Receptionist; keep `payments.refund` and `invoices.edit` manager-only. | — |
| Close visit with **full payment** | FREE |
| Close visit with **outstanding balance** (deposit, pay later, dispute) → invoice status `PARTIALLY_PAID`/`UNPAID`, visit closes, balance shows on client profile and Daily Closing "Outstanding". **[DECISION 3]** default: allowed for Receptionist with a reason; Daily Closing lists them. | SOFT |
| Discount | Receptionist may apply discounts **up to a configurable limit** (e.g. 10 % or EGP 100) with a reason; above that needs manager (`bookings.discount.apply`). **[DECISION 4]** default limit: 10 %. | SOFT below limit, HARD above |
| Refund / void payment | Manager only; reason required; audited. | HARD |
| Receipt | Available from the card at any time after invoice exists; print 58/80 mm. | FREE |
| Day close | Daily Closing cannot be finalised while visits are open **unless** marked "carry over" with reason (today it only warns). **[DECISION 5]** default: warn + list, do not block. | SOFT |

## 5. Capacity and slots

| Rule | Tag |
|---|---|
| Slots are generated **automatically** every night from branch defaults, keeping **28 days** ahead (configurable). Manual generate/override stays. | — |
| Online booking shows only future slots with free capacity (unchanged). | HARD |
| Dashboard booking into a full slot | SOFT (warn "4/4 booked") |
| Dashboard booking into a past slot | SOFT |
| Walk-ins never consume slot capacity. | — |
| Holidays & Closures page becomes real: a closure day skips generation and blocks online booking; existing bookings on that day are listed for reception to reschedule. | — |

## 6. Cancellations, no-shows, reschedules

- Client self-service inside 24 h stays as a **request** (unchanged).
- Reception cancels/reschedules freely with a reason (unchanged), but **No-show** is only offered after the slot start time has passed (today it's always offered).
- Rescheduling a confirmed booking moves it directly to Confirmed on the new slot; the extra "Rescheduled → Confirmed after acknowledgement" step is dropped unless WhatsApp acknowledgement is actually used. **[DECISION 6]** default: drop it.

## 7. Roles (changes only)

| Role | Add | Remove / keep |
|---|---|---|
| Receptionist | `invoices.create_finalize`, `payments.record`, `bookings.discount.apply` (limited, §4), `overview.today` (new light overview) | keep: no refunds, no invoice edit, no reports |
| Staff | `bookingServiceItems.complete` (own lines), `queue.read` (own branch, read-only board) | no money, no client PII beyond name |
| Branch Manager | unchanged + override reason prompts | — |

Users with **no branch assigned** are treated as **no access** to branch data (fail closed), except Owner/Admin. (Today they get all branches.)

## 8. Screens affected

- **Queue:** auto-refresh; staff shown on cards; per-line done ticks on the card; "Ready to pay" column gets Pay / Discount / Receipt / Close; errors appear on the card; Completed column collapsible but printable.
- **Booking detail:** remove manual Arrived/In progress/Completed buttons and the duplicate Confirm; keep Confirm/Reject/Reschedule/Cancel/Check-in.
- **Overview:** Receptionist lands on Queue; a small "Today" strip (expected, waiting, in service, unpaid) replaces the permission notice.
- **Slots:** mostly automatic; page becomes "exceptions" (block/close/capacity).
- **Holidays & Closures, Branches:** build or hide (**[DECISION 7]** default: build Holidays & Closures in this cycle; hide Branches, Client Groups, Loyalty).
- **Service picker:** keep the flat searchable list, add category chips and "recent for this client" at the top.

## 9. Data changes

- `Booking.slotId` nullable for walk-ins (migration + backfill: existing walk-in bucket slots → null, bucket slots deleted).
- `Invoice.status` already has UNPAID / PARTIALLY_PAID / PAID; `QueueEntry` gains `closedWithBalance` reason. 
- `Settings`: `receptionistDiscountLimitPercent`, `slotHorizonDays`, `staleVisitHours`.
- Override reasons stored in AuditLog (`override.staff_unavailable`, `override.slot_full`, `visit.closed_with_balance`, `discount.applied_by_reception`).

## 10. What stays exactly as is

Pending → Confirm/Reject flow for website bookings; capacity arithmetic for confirmed bookings; price snapshots; VAT; 24-hour client rule; WhatsApp deep links and transactional messages; audit keys.

---

## Decisions (owner, 2 Oct 2026) and industry reference

| # | Decision | Industry practice used as reference |
|---|---|---|
| 1 | **Phone required** for every walk-in; returning clients auto-matched by phone. | Zenoti makes the mobile number mandatory by default (configurable); Fresha allows a blank client only for retail-style sales. We follow the stricter default because the salon's WhatsApp flows depend on the phone. |
| 2 | Stylists **may** mark their own service done from a phone; reception can always do it. Not a must. | Zenoti queue: "Mark complete" from the service card by front desk; staff mobile apps allow the same. |
| 3 | **Allowed:** reception can close a visit with an outstanding balance. Invoice stays `UNPAID`/`PARTIALLY_PAID`; a reason is required; balance appears on the client profile, in the Queue "Completed" card (red "balance due"), and in Daily Closing → Outstanding. Collect later via "Pay now" from Invoices or the client profile. | Fresha: an appointment is *Completed* at checkout and "the payment may still be unpaid or part-paid"; outstanding balances are collected later with Pay now. This is the standard model. |
| 4 | Reception discount limit **15 %** per visit without a manager; above that a manager applies it. | Fresha/Zenoti expose "apply discount" as a permission level; a numeric cap is our addition because the role is shared on one till. |
| 5 | **Warn, don't block** when closing the day with open visits/unpaid invoices: the closing screen lists them, each must be either resolved or marked "carry over" with a reason, then the close proceeds. A system setting `dayClose.openInvoices = alert | block` is provided, default **alert**. | Zenoti offers exactly these two modes ("alert the front desk" vs "block register closure with open invoices"); Phorest cash-up is a reconciliation step, not a hard gate. |
| 6 | Drop the "Rescheduled → wait for acknowledgement" step. Reschedule lands on **Confirmed** on the new slot. | Fresha reschedule keeps the status; no intermediate state. |
| 7 | Build **Holidays & Closures**; hide Branches, Client Groups, Loyalty. | — |
| 8 | Slots generated nightly, **28 days** ahead. | Fresha/Booksy generate availability from shifts continuously; a rolling horizon is the equivalent for the slot model. |

### Other practices adopted from the research

- **No-show only after start time** (Fresha rule). Before that the action is hidden.
- **Warn + override** for booking outside a team member's hours and for double-booking a stylist (Fresha behaviour in-store), instead of refusing.
- **Processing time**: Fresha models colour services as *service time + processing time* during which the stylist is free. v2 allows parallel service lines now; a per-service `processingMinutes` field is added to the catalog in a later batch so the calendar can show the stylist as free during processing.
- **Reason codes** for every override and status change (Zenoti "reasons for status changes in queue"), stored in the audit log and selectable from a short list + free text.
- **Actual start/end times** recorded per service line when started/completed (Zenoti), so reports use real durations, not catalog estimates.
- **Deposits**: industry guidance is 20–50 % for regular bookings, non-refundable on no-show/late cancel, refundable with 24–48 h notice. The existing deposit policy settings stay; enforcement remains manual (pay-at-salon MVP) until online payment exists.

Sources: Fresha help — unpaid and part-paid sales, update appointment statuses, mark no-show, reschedule appointments, add extra/processing time, manage team permissions; Zenoti help — front desk operations on Queue, allow or block register closure with open invoices, guest profile rules; Phorest — salon POS / end-of-day cash-up; Booksy — check out clients; industry no-show policy guides (Square, Boulevard, SalonBiz).

Next: FIX_AND_UPDATE_PLAN batches are re-cut around this spec.
