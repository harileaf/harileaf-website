# E-commerce M3 — Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shopper can go from cart to a placed order — prepaid (Razorpay, authorize-then-capture) or COD — with server-side re-pricing, stock reservations, exactly-once payment confirmation from either the browser or the webhook, late-authorisation handling, reservation expiry, payment reconciliation, an order status page with retry, and an order-confirmation email (spec: Build Order → v1 → 3. Checkout).

**Architecture:** `quote.ts` prices a cart from D1 (never from the client). `orders.ts` builds the order-creation batch (order number from a per-month counter, items with GST split by place of supply, stock decrement + reservations, events, outbox) keyed by an idempotency key. `payments.ts` holds the exactly-once `mark_paid` / `late_capture` / `expire` claims. `razorpay.ts`, `shiprocket.ts` (serviceability only in M3) and `email.ts` (Resend) are thin fetch clients with injectable `fetch` for tests. Webhooks verify the signature over the raw body and record the event id in the same batch as the state change.

**Tech Stack:** Astro 6 SSR on Workers, D1, KV (Shiprocket token cache), Razorpay Orders/Payments API + checkout.js, Shiprocket serviceability API, Resend, Cloudflare Turnstile, Web Crypto HMAC.

**Base branch:** `feat/ecommerce-m2-catalog`. Branch: `feat/ecommerce-m3-checkout`.

## Tasks
1. Migration `0002_checkout.sql`: `order_counters (yymm PK, last_no)`.
2. `india-states.ts` (GST state codes), `tokens.ts` (128-bit view tokens + HMAC hash, constant-time check), settings additions (`pickup_pincode`, `shiprocket_pickup_location`).
3. `quote.ts`: price cart lines from D1 (active, purchasable, stock, qty caps), totals, minimum order, COD eligibility, GST split by state; tests.
4. `orders.ts`: `createOrder()` with idempotency key, per-month order number, items/GST snapshot, stock decrement + reservations (held for prepaid, consumed for COD), events, outbox (`email.placed`); `getOrderForView()`; tests incl. stock race and idempotent retry.
5. `razorpay.ts`: create order (manual capture), fetch payment, list order payments, capture, signature + webhook verification; tests with fetch mocks.
6. `payments.ts`: `markPaid` (verify path + webhook path, exactly-once), `lateCapture`, `expireReservations`, `reconcilePending`; `razorpay.capture` outbox handler; cron wiring; concurrency tests.
7. APIs: `POST /api/store/cart/quote`, `GET /api/store/pincode`, `POST /api/store/checkout`, `POST /api/store/checkout/verify`, `POST /api/store/order/retry`, `POST /api/webhooks/razorpay`.
8. `shiprocket.ts` serviceability + token cache; `email.ts` + order-placed template + owner notification; outbox handlers.
9. Pages: `/cart`, `/checkout`, `/order/[orderNo]` (token-gated, `noindex`, `no-store`, `Referrer-Policy: no-referrer`).
10. Verify (unit + integration + browser with Razorpay stubbed), docs, PR against `feat/ecommerce-m2-catalog`.
