# Alrouby — Fix & Update Plan (v3, cut around VISIT_WORKFLOW_SPEC_V2)

Inputs: code audit, Owner walkthrough of 30 pages, Receptionist end-to-end walkthrough on the dev branch, industry research (Fresha, Zenoti, Phorest, Booksy). Business rules: `docs/VISIT_WORKFLOW_SPEC_V2.md` (approved 2 Oct 2026).

Done so far: DST freeze fixed and deployed; `/health/ready`; `next` advisory; dev branch isolation; Receptionist test account; **Batch 1** (4ea8050), **Batch 2** (da61b21) and **Batch 2b** (treatment picker) shipped.

## Guiding rules for every batch
- Backend enforces every rule; UI only reflects it.
- HARD / SOFT / FREE tags from the spec are implemented literally: SOFT = backend accepts an `overrideReason`, audits it, and the UI shows a confirm dialog with the warning text.
- Each batch ends with: unit tests, lint, tsc, build, Playwright re-walk of the receptionist day (the scripts from this audit become `apps/dashboard/e2e/`), then one commit per batch.
- No production data is touched until the batch is verified on the dev branch; migrations run with `prisma migrate deploy` after a Neon backup branch.

## Batch 1 — Unblock the front desk (Small–Medium; seed + one SQL grant on prod; no schema change)
1. Permissions: Receptionist += `invoices.create_finalize`, `payments.record`, `bookings.discount.apply` (capped); Staff += `bookingServiceItems.complete` (own lines). One-off grant script for production.
2. Queue API: `GET /dashboard/queue` returns `assignedStaff[]`, `lines[] {name, status, staff}`, `allLinesDone`, `invoice {status, remaining}` so cards are correct without the drawer.
3. Queue UI: errors on the card (toast + inline); per-line "Done" ticks on the card + "Mark all done"; Finish/Pay/Close buttons driven by the new payload; staff shown on cards; auto-refresh 15 s when tab visible with "Updated hh:mm".
4. Landing: Receptionist → Queue; Overview shows a light "Today" strip for roles without `reports.view` (new `GET /dashboard/overview/today` under `overview.read`).
5. Remove developer copy from dialogs; hide Branches / Client Groups / Loyalty; Holidays & Closures stays visible as "coming in Batch 3".
6. Login: no stored password; non-401 bootstrap errors show a retry panel instead of logging out.

## Batch 2 — Soft blocks and the visit lifecycle (Medium; small migration)
1. Start service: qualified / on-shift / busy become SOFT with `overrideReason`; several lines may be in progress at once; actual `startedAt/completedAt` already stored.
2. Finish = all lines done (or "Mark all done"); invoice auto-created as draft when the last line is done; finalised at close.
3. Close visit: FREE when paid; SOFT with reason when balance remains (invoice `PARTIALLY_PAID`/`UNPAID`; `QueueEntry.closedWithBalanceReason`). Booking status derived (`ARRIVED`/`IN_PROGRESS`/`COMPLETED`) — manual buttons removed from booking detail.
4. Discount at the queue: ≤ 15 % by Receptionist with reason; above → manager. Setting `receptionistDiscountLimitPercent`.
5. No-show offered only after slot start; confirm into a full slot and booking a past slot become SOFT warnings.
6. Reschedule lands on Confirmed (drop RESCHEDULED hop; keep enum value for history).
7. Migration: `queue_entries.closed_with_balance_reason`, `system_settings` new keys, audit keys for overrides.

## Batch 3 — Slots, walk-ins, closures (Medium; migration + data backfill)
1. Nightly rolling slot generation (28 days) from branch defaults; Overview warning when horizon < 7 days; Slots page becomes "exceptions".
2. Walk-ins without a fake slot: `bookings.slot_id` nullable for `WALK_IN`; backfill existing walk-in rows to null and delete bucket slots; calendar/drawer show "Walk-in · arrival time".
3. Holidays & Closures: real page; closure days skip generation, block online booking, list affected bookings for reschedule.
4. Daily Closing: open visits / unpaid invoices listed; each resolved or "carry over" with reason; setting `dayClose.openInvoices = alert|block` (default alert).

## Batch 4 — Reliability & speed (Medium; one env change on Render)
P2034 retry + global exception filter + request ids; api-client `request()` wrapper (timeout, GET retry, plain-language errors) and dashboard `error.tsx`; light notifications feed instead of the 55-query overview on every page; dedupe `/branches` and list calls; fix Packages 10× fetch; JWT user cache; **Render `DATABASE_URL` → Neon `-pooler` + `connection_limit`**; booking-collision test.

## Batch 2b — Service picker (Medium; migration for `nameAr` / `searchAliases`)
Spec §3a: single search across services/variants/packages/add-ons; large side panel with category chips and selected-lines footer; Arabic names + aliases + typo tolerance; inline variants; editable price for STARTS_FROM/RANGE/CONTACT; add-on chips; "last visit" and "recent/popular" at the top; keyboard navigation; catalog cached per session. Reused in walk-in, new booking, add-service, and later the website cart. Admin catalog screens get the `nameAr`/aliases fields.

## Batch 5 — Clarity pass (Medium)
One date formatter; humanised statuses; single primary action per card/detail (remove duplicate Confirm); labels/aria on icon buttons; calendar copy; receipt from Completed cards.

## Batch 6 — Security, tests, observability (Medium–Large)
Audit-log branch scoping; no-branch users fail closed; shorter JWT + refresh; helmet; remaining `npm audit` highs; tests for queue lifecycle per role, booking create/confirm/check-in, payment totals, Cairo dates; structured logs; uptime alert on `/health/ready`; reminder cron single-instance guard; `processingMinutes` on services (processing-time model) and staff "free during processing" on the calendar.

## Dependencies
1 → 2 (payload + permissions first) → 2b (picker; independent of 3) → 3 (needs lifecycle stable before touching slots/walk-in schema). 4 and 5 can run alongside 2–3. 6 last.

## Production steps per batch
- B1: deploy API + dashboard; run grant script.
- B2: backup branch → `migrate deploy` → deploy.
- B3: backup branch → `migrate deploy` + backfill script → deploy; set `SLOT_HORIZON_DAYS=28`.
- B4: set pooled `DATABASE_URL`; deploy.

## Complexity
B1 Small–Medium · B2 Medium · B2b Medium · B3 Medium · B4 Medium · B5 Medium · B6 Medium–Large.
