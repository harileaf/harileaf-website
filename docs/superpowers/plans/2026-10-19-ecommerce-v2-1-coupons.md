# E-commerce V2-1 — Coupons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Each task: failing test → see it fail → implement → see it pass → commit.

**Goal:** Discount codes (spec: v2 Features → Coupons). Server-only validation in quote and checkout with a clear reason per failure, a largest-remainder split over eligible lines before the GST back-out, a redemption that is part of the order batch and is released exactly once if the payment fails, an admin page to create, pause and inspect codes, and the code and discount on the order page, emails and invoices.

**Architecture:** `coupons.ts` holds pure evaluation (`evaluateCoupon`) plus loads and admin writes. `quoteCart` takes `{ coupon, phone }` and returns per-line `discount` with `lineTotal` after the discount, so `createOrder`, `taxForQuote` and invoices pick it up unchanged. The database enforces the rest:
- `coupon_redemptions` triggers keep `coupons.used_count` in step: +1 on insert, −1 on delete.
- `CHECK (usage_limit IS NULL OR used_count <= usage_limit)` stops a use past the limit.
- `UNIQUE (coupon_code, phone)` stops a second use by the same phone (`phone` is set only for one-per-phone codes).
- A `BEFORE INSERT` trigger refuses paused, not-yet-started or expired codes, judged against the row's `created_at`.
- A `BEFORE UPDATE` trigger freezes a code's terms after its first use.
- Release is a `DELETE` of the order's redemption inside the `expire` claim batch, so it's exactly once by construction. A late capture re-inserts the redemption, and if that's refused, the payment is not captured.

**Base branch:** `feat/ecommerce-m5-hardening` (v1 PRs #1–#5 unmerged). Branch: `feat/ecommerce-v2-1-coupons`.

**Decisions (recorded in the spec's Implementation notes v2):**
- The minimum order (store and coupon) is checked against the subtotal **before** the discount, so applying a code never makes a valid cart invalid.
- `percent` is a whole percent (1–90). A flat code needs `min_order_paise > value`. Together these mean a coupon can never bring a total to ₹0, and ₹0 orders stay reserved for free replacements.
- The redemption row is written for every coupon order (it records order ↔ code). `phone` is only filled for one-per-phone codes.
- A cancelled or refunded order keeps its use. Only `payment_failed` releases it, as the prompt specifies.
- The DPDP anonymisation job clears the redemption phone together with the order.

## Tasks

- [x] **1. Migration `0005_coupons.sql`.** `coupons`, `coupon_redemptions`, the triggers above, and an `orders` trigger: a discount needs a coupon code unless the order is a replacement. Schema test: last-use CHECK, phone UNIQUE, paused/expired refusal, terms frozen after first use, release decrements.
- [x] **2. `allocateDiscount` back in `gst.ts`** (from 059989d). Property test: Σ shares = discount, each share ≤ its line, and Σ `splitTax` totals = Σ lines − discount.
- [x] **3. `coupons.ts`:** `normalizeCode`, `evaluateCoupon` (reasons: not_found, paused, not_started, expired, below_minimum, limit_reached, phone_used, no_eligible_items; percent cap, flat cap, category eligibility), `validateCouponInput`, `createCoupon`, `setCouponActive`, `updateCoupon`, `listCoupons`, `couponUsage`. One table-driven unit test for the reasons and amounts.
- [x] **4. Quote:** `quoteCart(..., { coupon, phone })` → `Quote.coupon`, per-line `discount`/`categoryId`, `discount`, `total`. `publicQuote` exposes the coupon result and line discounts.
- [x] **5. Order batch:** `createOrder` writes `coupon_code`, `discount_paise`, item discounts and the redemption insert; `classifyD1Error` → `'coupon'`; `createOrder` returns `reason: 'coupon'`. The checkout API passes `coupon` and the phone, refuses an invalid code with 422 `{ errors: { coupon } }`, and includes the code in the fingerprint.
- [x] **6. Release and late capture:** `releaseStatements` deletes the redemption. `lateCapture` re-inserts it (with the original `created_at`) and, if the coupon refuses, takes the late-release path with a coupon-specific email. Integration races: last use (exactly one wins), one-per-phone, release on expiry exactly once (overlapping expiry + abort), cancel keeps the use, late capture re-takes it.
- [x] **7. Retention:** anonymisation clears `coupon_redemptions.phone` (extend the existing retention test with one assertion).
- [x] **8. Storefront UI:** "Have a discount code?" disclosure on `/cart` and `/checkout` (code in `localStorage` `hl_coupon_v1`). Apply/remove re-quotes live. The discount shows as its own line and the total is what the shopper pays. Place order is blocked while an applied code is invalid, with the reason shown.
- [x] **9. Order page, emails, invoices, admin order detail:** lines at gross, then "Discount (CODE) −₹X", then the total. The invoice snapshot gains an optional `order.couponCode`; the discount column is already there.
- [x] **10. Admin `/admin/coupons`:** list with usage and status, create form, pause/resume, edit while unused, usage drill-down (orders using the code). API `/api/admin/coupons` (+ `[code]`). Nav entry.
- [x] **11. Policies:** privacy (phone kept for one-per-phone codes), terms (coupon terms sentence), flagged for owner approval.
- [x] **12. e2e:** one flow: apply a code in the cart → discount line → checkout total matches. Seed one coupon in `e2e/setup-db.mjs`.
- [x] **13. Gates + browser pass** (desktop 1280, phone 390): admin create → cart/checkout → COD order → order page, outbox email rows, invoice after pack; feed/JSON-LD unchanged. Spec notes, PR.

## SEO (§3)
- Coupons never change `Offer.price`, the feed price or any structured data. Nothing in `seo.ts`/`feed.ts` reads coupons (checked by grep in review).
- No `?coupon=` landing pages and no shareable code links in this milestone.
- Merchant Center Promotions: proposed in the PR, not built.
