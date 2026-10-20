# E-commerce V2-5 — Partial Refunds, In-admin Courier Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Each task: failing test → see it fail → implement → see it pass → commit.

**Goal:** Partial refunds (per line or per amount, never more than is still refundable, each with a credit note covering exactly the refunded lines, `payment_status` moving `partially_refunded` → `refunded`) and in-admin courier booking (choose a courier and rate from Shiprocket serviceability, assign the AWB, schedule the pickup, print the label and manifest), with v1's automatic Shiprocket push kept behind a setting. **PDF invoices are not built** (owner decision 2026-10-19): the print-ready HTML documents stay.

**Architecture — refunds:**
- Migration `0007`:
  - `refund_lines (refund_id, order_item_id, qty, amount_paise)`;
  - a trigger caps each line at its `line_total_paise` across non-failed refunds;
  - a trigger caps each order at `total_paise` across pending and processed refunds.
- `refunds.ts` → `refundPartial(db, orderId, { lines?: [{itemId, qty}], amount?, reason, manualReference?, requestKey })`:
  - Per line: amount = the line's value for that qty, from what remains.
  - Per amount: spread over each line's remaining value with `allocateDiscount`.
  - One claim `refund:<requestKey>` per admin action. In the same batch: refund row + lines, a credit note built from exactly those amounts (tax backed out per line at the invoice's intra/inter-state split), the outbox `razorpay.refund {refundId}` (prepaid) or `email.refunded` (COD with manual reference), and an event.
- `payment_status` is recomputed in SQL after every refund change: `refund_pending` while any is pending; otherwise `refunded` once processed equals total, `partially_refunded` if some was refunded, else `paid`. Used on create, on settle (processed or failed), and on retry.
- The v1 full "Refund" becomes "refund everything remaining" through the same path. The refund handler takes `{refundId}` from the payload (older rows fall back to the latest pending refund).

**Architecture — courier booking:**
- Setting `shiprocket_auto_push` (`on`, the default, keeps v1). When it's `off`, `shiprocket.create` doesn't push; the admin books instead.
- `shiprocket-booking.ts`:
  - `courierOptions(order)` lists serviceability couriers with rate, ETA and mode; for perishables only those meeting the zone, flagged "ship within 24 h".
  - `bookCourier(order, courierId)` creates the Shiprocket order if missing, then `POST /courier/assign/awb` (saves AWB, courier, shipment) and `POST /courier/generate/pickup`.
  - `printLabel` → `POST /courier/generate/label`; `printManifest` → `POST /manifests/generate`, falling back to `/manifests/print`.
  - Shiprocket endpoint shapes are UNCONFIRMED against the live API (same caveat as v1's research doc); errors are shown to the admin verbatim.
- Admin order detail: a "Book courier" panel (list → choose → AWB, pickup date, Print label / Manifest links).

**Base branch:** `feat/ecommerce-v2-4-preorders`. Branch: `feat/ecommerce-v2-5-refunds-courier`.

## Tasks
- [x] 1. Migration 0007 + schema test (line cap, order cap; failed refunds don't count).
- [x] 2. `refundPartial` + payment-status recompute + credit note from lines; the full refund via the same path; handler payload; retry copies lines. Integration: per-line then per-amount then the rest → `refunded` with three credit notes summing to the invoice; **race: two partial refunds that together exceed the total → exactly one succeeds**; COD manual refund; a failed refund returns to the right status.
- [x] 3. Admin refund UI (lines with qty, or an amount; refundable remaining shown); order page and emails show refunded amounts.
- [x] 4. Courier booking module + setting + admin panel; integration with stubbed Shiprocket (options filtered for perishables, booking saves the AWB, a second booking refused, auto-push off skips create).
- [x] 5. Gates + browser pass. Spec notes (incl. PDF deferral). PR.
