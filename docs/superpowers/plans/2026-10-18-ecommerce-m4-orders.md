# E-commerce M4 — Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything after "order placed": admin order list/detail, mark packed → immutable GST invoice (tax invoice / bill of supply / invoice-cum-bill of supply) with printable HTML, Shiprocket order push + courier webhook, shipped/delivered/cancelled/refunded emails, customer and admin cancellation, full refunds (Razorpay, or recorded manually for COD) with credit notes, replacements, receiving returns/RTO, and COD remittance reconciliation (spec: Build Order → v1 → 4. Orders).

**Architecture:** `fulfilment.ts` holds every post-placement state change as an exactly-once `ops` claim batch (`pack`, `ship`, `deliver`, `rto`, `return`, `cancel`, `refund`, `receive_return`). Invoices and credit notes are built by `invoices.ts` into a JSON snapshot and issued with M1's `issueDocStmts` inside the same batch. Side effects (Shiprocket create/cancel, Razorpay refund, emails) go through the outbox. The courier webhook maps Shiprocket `shipment_status_id` to transitions.

**Tech Stack:** Astro 6 SSR, D1, Shiprocket API, Razorpay refunds, Resend.

**Base branch:** `feat/ecommerce-m3-checkout`. Branch: `feat/ecommerce-m4-orders`.

## Tasks
1. Migration `0003_orders.sql`: `orders.replacement_for_order_id`, `cod_remittances`, indexes.
2. `invoices.ts`: snapshot builder (seller, buyer, place of supply, lines, totals, amount in words, doc type) + credit-note snapshot; tests incl. intra/inter-state and mixed-rate carts.
3. `fulfilment.ts`: pack (+invoice), ship, deliver, rto, mark returned, cancel (customer/admin; restock; void/refund; credit note; Shiprocket cancel), refund (Razorpay or manual), receive return (restock non-perishables), replacement order; tests incl. races.
4. Outbox handlers: `shiprocket.create` (idempotent lookup by channel order id), `shiprocket.cancel`, `razorpay.refund` (receipt-matched to avoid double refunds), `email.shipped|delivered|cancelled|refunded`; enqueue `shiprocket.create` on placement; refund webhook events.
5. `/api/webhooks/courier` (x-api-key) mapping Shiprocket statuses; NDR events.
6. Invoice pages: customer `/order/[orderNo]/invoice?t=…`, admin `/admin/orders/[id]/invoice`; print CSS.
7. Admin: `/admin/orders` list + filters, `/admin/orders/[id]` detail + actions API, `/admin/remittance` CSV import, dashboard metrics; customer cancel on the order page.
8. Verify, docs, PR against `feat/ecommerce-m3-checkout`.
