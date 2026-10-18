# E-commerce Store — Design Spec
**Date:** 2026-10-18
**Status:** Draft v2: revised after a four-model review (Codex, Antigravity, Sonnet, Claude), awaiting user review
**Branch target:** `feat/ecommerce`

---

## Overview

Turn harileaf.org into a shoppable, SEO-led store for HariLeaf's farm products, with pan-India delivery, online payment (Razorpay) or cash on delivery, Shiprocket fulfilment, GST invoices, a Google Merchant Center feed and honest, evidence-backed product pages.

The work ships in **two releases**:

- **v1 (target: before end of 2026): rice and spices.** These are non-perishable. Catalog, checkout (prepaid and COD) and order management launch together.
- **v2 (target: mid-February 2027, before mango season): perishables and engagement.** Mangoes and other fresh produce, delivery zones, pre-orders, notify-me, coupons, verified reviews and recipes.

The v1 build sequence is in [Build order](#build-order). Every v2 feature already has a place in the data model, so v2 adds behaviour, not migrations of existing data.

### Goals

1. Rank for high-intent searches from people looking for **high-quality, traditionally processed, nutrition-preserving farm products**: heritage rice, low-temperature stone-ground spices, and (v2) farm-direct mangoes and fresh produce.
2. Compete with Two Brothers Organic Farms by winning specific long-tail searches ("Karjat 3 rice", "Wada Kolam rice", "stone ground turmeric curcumin") and showing **proof**: process detail, batch lab reports, packed-on and ground-on dates. Don't compete head-on for broad terms.
3. Keep running costs low. Infrastructure is the existing Cloudflare stack on **Workers Paid (US$5/month)**. Everything else costs per transaction or per shipment. (The Workers Free plan's 10 ms CPU limit rules out SSR, invoice rendering and crypto on the free tier.)
4. Let the owner configure every listing from `/admin` with no rebuild or deploy.

### Non-goals (v1)

Deferred to v2 (designed below, built later): perishable products, delivery zones, pre-orders, notify-me, coupons, verified reviews, partial refunds, the Keystatic recipes collection, in-admin courier booking (AWB, labels, pickup), and PDF invoices.

Not planned:

- Customer accounts / login (guest checkout only)
- International shipping or multi-currency checkout (the data model is ready for it, but there's no UI)
- WhatsApp / SMS notifications
- Review photo uploads
- Live courier rate calculation
- Subscriptions, gift cards, wishlists, loyalty points
- Marketplace sync (Amazon / Flipkart)

### Ownership

A custom store needs a named engineering owner for at least the 12 months after launch, covering payments, tax and courier changes. **Owner to name this person before planning starts.** If nobody can own it, the fallback is headless Shopify: Astro keeps the `/rice/...` subfolder pages and uses the Storefront API, and checkout is hosted by Shopify. A Worker reverse proxy in front of Shopify is ruled out because Shopify doesn't support Cloudflare proxying.

---

## Decisions Made

| Question | Decision |
|---|---|
| Domain | Subfolder on `harileaf.org` (not a subdomain) |
| Platform | Custom build on the existing Astro 6 + Cloudflare Workers stack (D1, R2, KV), Workers Paid plan |
| Products, v1 | Rice and spices (non-perishable) |
| Products, v2 | Mangoes and other fresh produce |
| Delivery | v1: pan-India to serviceable pincodes. v2: perishables only to per-product delivery zones on express lanes |
| Payments | Razorpay (UPI / cards / netbanking) **authorize-then-capture**, plus COD for non-perishables up to `cod_max_order_paise`. Perishables and pre-orders are prepaid only |
| COD fee | **None.** It's a GST classification headache and a drip-pricing risk |
| Shipping charge | Always free, with a **minimum order value** (`min_order_paise`, the owner sets it from courier rate cards; the placeholder is ₹499) |
| Shipping, v1 | Orders are created in Shiprocket through its API; AWB, labels and pickup are handled in the Shiprocket panel; the tracking webhook updates status |
| Accounts | Guest checkout only |
| GST | Registered; per-product GST rate; invoice issued **at dispatch**; invoice-cum-bill of supply for mixed taxable/exempt carts; credit notes |
| Invoice format, v1 | Immutable invoice snapshot stored in D1, rendered as printable HTML. PDF in v2 |
| Inventory | Exact stock count per variant, enforced by database constraints, reserved at checkout |
| Off-season, v2 | Per product: **Notify me** *or* **Pre-order** |
| Notifications | Email only (Resend) |
| Extras, v1 | Merchant Center feed, sitemap, `/our-process`, 2–3 static recipe pages |
| Product page layout | **C — Hybrid**: light buy box above the fold, dark "From our farm" bento band, then reviews / FAQ / related |
| Reviews display | Hidden entirely (section, stars, rating data) until a product has ≥1 approved review |
| Product claims | Only specific, evidence-backed process claims. No "organic", "chemical-free" or "naturally grown" wording until certified (see [Claims policy](#claims-policy)) |
| Admin access | Cloudflare Access (free plan) in front of `/admin*` and `/api/admin*`, in addition to the existing passphrase session |

---

## Architecture

Everything runs inside the existing `harileaf` Cloudflare Worker (`output: 'server'`, `@astrojs/cloudflare`).

```
Browser ── Astro pages (HTML-first) + Cart island (React) + Razorpay checkout.js
   │
   ▼
Cloudflare Worker (custom entry src/worker.ts: fetch → Astro handler, scheduled → jobs)
   ├─ Existing pages (about, technology, contact, …)
   ├─ Storefront pages        /shop, /rice, /rice/[slug], /cart, /checkout, /order/[id]
   ├─ Store API               /api/store/*      (cart quote, checkout, pincode)
   ├─ Webhooks                /api/webhooks/razorpay, /api/webhooks/courier
   ├─ Admin API               /api/admin/*      (Cloudflare Access + session)
   ├─ SEO endpoints           /sitemap-store.xml, /feeds/google.xml
   └─ Cron trigger            every 5 min: drain outbox, expire reservations, reconcile payments
        │
        ├─ D1  `harileaf-store`  products, variants, orders, stock, invoices, outbox, settings
        ├─ R2  `harileaf-media`  product photos, lab reports, certificates
        ├─ KV  `HARILEAF_CMS`    admin sessions (existing), page content (existing), Shiprocket token
        └─ External: Razorpay · Shiprocket · Resend · Google Merchant Center · Cloudflare purge API
```

### Worker entry and cron

The adapter's generated entry only exports `fetch` (`node_modules/@astrojs/cloudflare/dist/entrypoints/server.js`), and `wrangler.toml` has no `main`. Add a custom entry, `src/worker.ts`, that re-exports the adapter's `fetch` handler and adds a `scheduled()` handler, then point the adapter's worker entry or `main` at it. Cron jobs must be safe to run more than once, and safe to overlap with themselves. Every job claims rows with a guarded `UPDATE … WHERE state = 'pending'` before acting on them. Test locally with `wrangler dev --test-scheduled`.

### Side effects: the outbox

State changes never call external services directly. The D1 batch that changes an order's state also inserts rows into `outbox` (`kind`: `email.placed`, `shiprocket.create`, `razorpay.capture`, `razorpay.refund`, `notify.send` …). The request that made the change drains its own rows straight away, best effort, after the batch commits, and the cron drains whatever is left. A crash between "placed" and "pushed to Shiprocket" therefore loses nothing. Each outbox row has `attempts`, `next_attempt_at` (exponential backoff), `last_error`, and `state` (`pending` · `done` · `dead`). Rows in the `dead` state show up on the admin dashboard.

### New Cloudflare resources

| Resource | Type | Purpose |
|---|---|---|
| `harileaf-store` | D1 database (binding `STORE_DB`) | All commerce data |
| Cron trigger | `*/5 * * * *` | Drain the outbox, release expired reservations, reconcile payments |
| Cloudflare Access app | Zero Trust (free ≤50 users) | Protect `/admin*`, `/api/admin*` |
| Workers Paid plan | Billing | CPU headroom for SSR, HMAC, invoice rendering |

### New secrets

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `ORDER_TOKEN_SECRET`, `CF_ZONE_ID`, `CF_PURGE_API_TOKEN` (scoped to Cache Purge only). All are added to `.env.example`.

### Rendering and caching

- `/rice`, `/spices` and `/produce` currently have `export const prerender = true` at line 2. They switch to SSR (`prerender = false`) so they can render the live product grid.
- Product, category and `/shop` pages are server-rendered from D1 and cached at the edge (`Cache-Control: s-maxage=3600, stale-while-revalidate=60`).
- **Invalidation is global.** Any admin write (product, variant, stock, lab report, review approval) calls the Cloudflare **purge-by-URL API** (`CF_PURGE_API_TOKEN`) for the affected URLs: the product, its category, `/shop`, `/sitemap-store.xml` and `/feeds/google.xml`. `caches.default.delete()` only clears one data centre, so it isn't used for invalidation. A stock change from checkout doesn't purge anything: displayed stock is approximate, and the server always re-quotes.
- If the purge call fails, the admin write still succeeds, and the URL is queued as an outbox row (`cache.purge`) for retry.
- Price, stock and availability shown on a cached page are **for display only**. The server recomputes all of them at checkout.
- `/cart`, `/checkout`, `/order/*` and `/review` are never cached, are `noindex`, and send `Referrer-Policy: no-referrer`.

---

## URL Structure

| URL | Purpose | Indexed |
|---|---|---|
| `/shop` | All products; category and process chips (Stone ground, Unpolished, Sun dried; v2: In season, Pre-order) | Yes |
| `/rice`, `/spices`, `/produce` | Existing story pages become category pages: existing hero + **product grid near the top** + existing story sections | Yes |
| `/{category}/{product-slug}` e.g. `/rice/karjat-3` | Product page; variants (1 kg / 5 kg) live on one page | Yes |
| `/{category}/{product-slug}?v={sku}` | Same page with that variant preselected. Canonical is the base URL. Used as the Merchant Center landing link | No (canonicalised) |
| `/recipes/{slug}` | v1: 2–3 static Astro pages linked to products. v2: Keystatic collection | Yes |
| `/our-process` | How HariLeaf grows, mills and grinds; linked from every product | Yes |
| `/shipping-policy`, `/refund-policy`, `/grievance` | Policy pages (needed for Razorpay KYC and the E-Commerce Rules) | Yes |
| `/cart`, `/checkout` | Cart and guest checkout | No |
| `/order/{orderNo}?t={token}` | Order status, tracking, invoice, cancel | No |
| `/order/{orderNo}/invoice?t={token}` | Printable HTML invoice / credit note | No |
| `/admin/*` | Admin | No |

- **Seasonal and out-of-stock products are never archived.** Their pages stay live with `OutOfStock` / `PreOrder` availability.
- **Discontinued products:** the admin picks a relevant replacement product, and the page 301-redirects there. With no replacement, the page returns **410**. Never blanket-redirect to the category page, because Google treats that as a soft 404.
- Draft products return 404.
- `robots.txt` disallows `/cart`, `/checkout`, `/order`, `/review`, `/admin`, `/api`.
- The existing `@astrojs/sitemap` keeps covering static pages; `/sitemap-store.xml` (dynamic) is added to the sitemap index.

---

## Data Model (D1)

All money is stored as **integer paise** with a `currency` column (`'INR'`). Prices are **GST-inclusive**. Timestamps are ISO-8601 UTC text. Financial-year logic uses **IST** (FY starts 1 April 00:00 IST).

Invariants are enforced **in the database**, not only in application code, because a D1 batch only rolls back when a statement *errors*. An `UPDATE` that matches 0 rows does not error.

### `categories`
`id`, `slug` (rice | spices | produce), `name`, `intro`, `seo_title`, `seo_description`, `google_product_category`, `sort`.

### `products`
| Field | Notes |
|---|---|
| `id`, `slug` (unique per category), `category_id` | |
| `name`, `short_description`, `description_md` | |
| `status` | `draft` · `active` · `discontinued`. `discontinued` + `replacement_product_id` gives a 301; without one, a 410 |
| `organic_scheme` | `none` · `pgs_green` (PGS-India, under conversion) · `pgs_organic` · `npop`. Only scheme-backed states produce certification wording |
| `organic_conversion_since` (year, nullable), `organic_cert_number`, `organic_cert_r2_key` | |
| `process_claims` (JSON array of `{code, text, evidence_note}`) | e.g. `{code:"stone_ground", text:"Stone ground below 40 °C", evidence_note:"Mill log, batch thermometer"}`. Admin can't save a claim without an evidence note |
| `how_its_made` (JSON) | method, grinding temperature, drying method, batch size, milling level, free-text story |
| `harvest_info` (JSON) | harvest season, "packed within N days" |
| `attributes` (JSON) | grain type, origin district, etc. (rendered as a spec list) |
| `faq` (JSON array of {q, a}) | Rendered on the page and as `FAQPage` data (no rich result is expected; it's kept for users and answer engines) |
| **Listing compliance** | `net_qty_label` lives on the variant (below); on the product: `best_before_days`, `storage_instructions`, `country_of_origin` (default `India`), `ingredients` (e.g. "Turmeric (100%)"), `allergen_info` (nullable), `veg_mark` (bool, default true), `nutrition` (JSON per 100 g, from lab data) |
| `hsn_code`, `gst_rate_bp` | GST rate in basis points (500 = 5%; 0 = exempt) |
| `perishable` (bool), `cod_allowed` (bool; **default false when `perishable`**) | |
| `delivery_zone` (v2, JSON: allowed state codes or pincode prefixes, plus `max_transit_days`) | Null = pan-India (non-perishables only) |
| `season_start_md`, `season_end_md` (`MM-DD`, nullable) | Null means always in season; supports windows that wrap the year end |
| `off_season_mode` (v2) | `notify` · `preorder` |
| `preorder_dispatch_date` (v2, nullable) | |
| `seo_title`, `seo_description` (nullable) | Generated automatically when null |
| `related_product_ids` (JSON), `replacement_product_id` (nullable) | |
| `created_at`, `updated_at`, `published_at` | |

### `variants`
`id`, `product_id`, `sku` (unique), `label` ("5 kg"), `net_qty_label` ("5 kg", the declared net quantity), `unit_qty_g` (for the unit sale price), `price_paise`, `mrp_paise` (**must be the MRP printed on the pack**; `CHECK (price_paise <= mrp_paise)`), `currency`, `weight_g`, `length_cm`, `breadth_cm`, `height_cm`, `stock_qty` (**available** stock; `CHECK (stock_qty >= 0)`), `low_stock_threshold`, `active`, `sort`.

### `product_images`
`id`, `product_id`, `r2_key`, `alt` (required), `sort`. The first image is used as the Open Graph and feed image.

### `lab_reports`
`id`, `product_id`, `batch_code`, `tested_on`, `lab_name`, `lab_accreditation` (e.g. NABL cert no.), `test_scope` (what was tested), `summary` (JSON: values with units and detection limits, e.g. curcumin 4.1 %, pesticide residue "not detected, LOD 0.01 mg/kg"), `pdf_r2_key`, `visible`.

### `batches`
`id`, `product_id`, `batch_code`, `packed_on`, `ground_or_milled_on`, `lab_report_id` (nullable), `active`. The buy box shows the **current active batch**: its packed-on date, its batch code, and a "Lab tested" badge when it has a visible lab report.

### `orders`
| Field | Notes |
|---|---|
| `id`, `order_no` (`HL-YYMM-NNNN`), `view_token_hash` | The view token is random; only its HMAC (`ORDER_TOKEN_SECRET`) is stored |
| `status` | `pending_payment` · `payment_failed` · `placed` · `packed` · `shipped` · `delivered` · `cancelled` · `rto` · `returned` |
| `payment_method` (`razorpay` · `cod`) | |
| `payment_status` | `unpaid` · `authorized` · `paid` · `refund_pending` · `refunded` · `partially_refunded` |
| `customer_name`, `email`, `phone` | |
| `ship_line1`, `ship_line2`, `ship_city`, `ship_state`, `ship_state_code`, `ship_pincode` | The delivery state decides CGST+SGST vs IGST (place of supply) |
| `bill_same_as_ship` (bool), `bill_name`, `bill_line1`, `bill_line2`, `bill_city`, `bill_state`, `bill_state_code`, `bill_pincode` | Billing snapshot for the invoice |
| `buyer_gstin` (nullable, validated format + checksum), `buyer_legal_name` (nullable) | Optional, for B2B buyers claiming ITC |
| `subtotal_paise`, `discount_paise`, `gst_paise`, `total_paise`, `currency` | No COD fee |
| `coupon_code` (v2, nullable) | |
| `is_preorder`, `expected_dispatch_date`, `ready_to_dispatch` (v2) | |
| `razorpay_order_id`, `razorpay_payment_id`, `paid_at` | |
| `shiprocket_order_id`, `shiprocket_shipment_id`, `awb`, `courier`, `tracking_url` | |
| `invoice_id` (nullable, set at dispatch) | |
| `cancel_reason`, `cancelled_by` | |
| `created_at`, `updated_at` | |

### `order_items`
A snapshot of each line at the moment the order is placed: `order_id`, `variant_id`, `product_name`, `variant_label`, `sku`, `hsn_code`, `gst_rate_bp`, `unit_price_paise`, `mrp_paise`, `qty`, `discount_paise`, `taxable_paise`, `cgst_paise`, `sgst_paise`, `igst_paise`, `line_total_paise`, `perishable`. Later product edits never change past orders.

### `invoices` (immutable)
`id`, `doc_type` (`tax_invoice` · `bill_of_supply` · `invoice_cum_bill_of_supply` · `credit_note`), `fy` (`2627`), `seq`, `doc_no` (≤ 16 characters), `order_id`, `ref_invoice_id` (credit notes), `issued_at`, `snapshot` (JSON: seller block, buyer/billing/shipping, place of supply, lines, tax totals, amount in words), `reason` (credit notes).
- `UNIQUE(fy, doc_type_series, seq)`, `UNIQUE(order_id) WHERE doc_type <> 'credit_note'`.
- Rows are never updated or deleted. A trigger raises `ABORT` on `UPDATE`/`DELETE`.
- The HTML invoice is rendered from `snapshot` alone. Template changes never alter an issued document.

### `refunds`
`id`, `order_id`, `credit_note_id`, `amount_paise`, `razorpay_refund_id`, `status` (`pending` · `processed` · `failed`), `reason`, `created_at`, `updated_at`.

### Supporting tables
- `order_events`: `order_id`, `at`, `type`, `actor` (`customer` · `admin` · `razorpay` · `shiprocket` · `system`), `actor_email` (from the Cloudflare Access JWT for admin), `note`.
- `ops` (exactly-once claims): `order_id`, `kind` (`mark_paid` · `cancel` · `issue_invoice` · `late_capture` …), `ok INTEGER NOT NULL CHECK (ok = 1)`, `created_at`, `PRIMARY KEY (order_id, kind)`. See [Exactly-once transitions](#exactly-once-transitions).
- `outbox`: `id`, `order_id` (nullable), `kind`, `payload` (JSON), `state`, `attempts`, `next_attempt_at`, `last_error`, `created_at`.
- `stock_reservations`: `id`, `variant_id`, `order_id`, `qty`, `expires_at`, `state` (`held` · `consumed` · `released`). A state change only moves forward, guarded by `WHERE state = 'held'`.
- `doc_counters`: `series` (`INV` · `CN`), `fy`, `last_no`. Rows are pre-created for the current and next FY.
- `webhook_events`: `source`, `event_id`, `received_at`, `PRIMARY KEY (source, event_id)`. Written **in the same batch** as the state change it causes.
- `settings`: key → value: `gstin`, `legal_name`, `trade_name`, `address`, `state_code`, `fssai_license`, `customer_care_phone`, `customer_care_email`, `grievance_officer_name`, `grievance_officer_email`, `grievance_officer_phone`, `min_order_paise`, `cod_max_order_paise`, `notify_email`, `low_stock_email`.
- v2: `coupons`, `coupon_redemptions`, `reviews`, `notify_requests` (as in the v2 sections below).

### Stock reservation (enforced by constraints)
- Checkout decrements stock **unconditionally**, `UPDATE variants SET stock_qty = stock_qty - ?1 WHERE id = ?2 AND active = 1`, in the same D1 batch that creates the order, its items and the reservation rows. If any line is short, `CHECK (stock_qty >= 0)` raises an error and the whole batch rolls back. The API then re-quotes and returns `409` with the short lines ("Only N left").
- Duplicate cart lines for the same variant are merged before the batch is built.
- COD orders: reservations are created as `consumed` straight away.
- Online orders: reservations are `held` for **30 minutes**. The cron releases expired held reservations (`held → released`, stock added back) and moves the order `pending_payment → payment_failed`.
- Cancellation before dispatch adds stock back. **Returns and RTO add stock back only after the goods are received and inspected** (an admin "Receive return" action); perishable lines are always written off.

---

## Product Availability Rules

A pure function `availability(product, variant, today)` returns one of:

| State | Condition | Buy box shows |
|---|---|---|
| `buy` | active, in season (or no season), stock > 0 | Add to cart |
| `sold_out` | in season, stock = 0 | v1: "Sold out — back soon". v2: + Notify me |
| `preorder` (v2) | out of season, `off_season_mode = preorder`, dispatch date set, stock > 0 | Pre-order · "Dispatches from {date}" (prepaid only) |
| `notify` (v2) | out of season, `off_season_mode = notify` (or pre-order without stock/date) | Notify me when in season |

v2: pre-order items and ship-now items **cannot be in the same cart**. Adding one to a cart that holds the other asks the shopper to check out separately. Perishable items can't share a cart with non-perishables either, because the shipping lane and payment rules differ.

---

## Storefront Pages

### Product page — Layout C (Hybrid)

1. **Header + breadcrumb**: Home › Category › Product.
2. **Above the fold (light)**:
   - Gallery: the main image plus keyboard-operable thumbnail buttons, with a harvest badge on the image.
   - Buy box:
     - category chip and H1 name;
     - one-line summary;
     - **proof line**: packed-on date · batch code · "Lab tested" badge (only when the current batch has a visible report);
     - rating line, *only if ≥1 approved review*;
     - price, struck-through MRP and % off;
     - "MRP inclusive of all taxes · ₹X/kg · Free shipping · Minimum order ₹Y";
     - **variant radio group**: every chip shows the pack price and the unit price;
     - quantity spinbutton and Add to cart;
     - pincode check (serviceability, estimated delivery date, COD availability);
     - a one-line damaged/wrong-item promise linking to the refund policy;
     - trust row (process claims, Free delivery, COD with its cap);
     - organic certification line (only when `organic_scheme` ≠ `none`);
     - collapsible **Product information** block: net quantity, best before, storage, country of origin, ingredients, allergens, veg mark, packer name and address, FSSAI licence no., customer care.
3. **Dark "From our farm" bento band** (existing `#0c110c` design language): how it's grown / how it's made (from `how_its_made`), **measured** nutrition per 100 g (from `nutrition`, with units and no decorative bars), why this process matters, cook / store, linked recipe, harvest and batch freshness, lab report summary + PDF link.
4. **Reviews**: only when approved reviews exist (v2).
5. **FAQ** (`<details>`), from `products.faq`.
6. **You may also like**: related products.
7. **Mobile**: a sticky bottom bar that **mirrors the selected variant** (label, price, unit price) with Add to cart. It respects `env(safe-area-inset-bottom)` and hides while the on-screen keyboard is open (`visualViewport`).

**States to design and test:**
- no reviews (launch-day reality);
- no pincode entered;
- pincode not serviceable;
- sold out;
- (v2) notify-me and pre-order;
- add-to-cart error;
- a product with no lab report.

**Accessibility:**
- variants use `role="radiogroup"`/`radio` with arrow-key navigation;
- the quantity control is a `spinbutton` or two labelled buttons;
- visible focus rings;
- `aria-live` for the pincode result and cart count;
- contrast checked for every text style in the dark band.

Icons are inline SVG, not emoji.

Reference mockup: `docs/superpowers/specs/assets/2026-10-18-product-page-mockup.html`. Switch to tab **C · Hybrid**. Prices, ratings, reviews, nutrition values and lab data in it are sample data, and the rating line and reviews section don't render at launch. It uses the existing Tailwind tokens, Manrope, and the dark bento styles from `/rice` and `/spices`.

### Category pages (`/rice`, `/spices`, `/produce`)
- Switch from prerendered to SSR + edge cache (see Rendering and caching).
- Keep the existing hero and story sections.
- Insert a **product grid** right after the hero. Each card has an image, name, process claims, "from ₹X" and an availability badge.
- Remove the "Online Ordering — Coming Soon" badge on `/rice` and `/spices`, and replace `WaitlistForm` with real product cards. `/produce` keeps its waitlist and the bulk-request form until v2. In v2, `/produce` keeps its bento catalogue design, and its cards link to product pages.

### `/shop`
All active products in a grid, with category chips and process filter chips (client-side filtering of server-rendered cards; no JS needed to see the products).

### Header
Add `Shop` to the navigation and a cart icon with an item count (React island reading localStorage, with an `aria-live` count).

### Footer
Add links to Shipping policy, Refund policy, Grievance officer, Privacy, Terms.

---

## Compliance

HariLeaf sells its own stock on its own site, so it is an **inventory e-commerce entity** under the Consumer Protection (E-Commerce) Rules 2020 and a seller of pre-packaged food. It is not an e-commerce operator collecting TCS. Owner to confirm each point with their CA / legal adviser.

| Area | Requirement | Where it's met |
|---|---|---|
| Legal Metrology (Packaged Commodities) Rules, Rule 6 (e-commerce) | Packer/manufacturer name and address, common name, net quantity, MRP, **unit sale price**, best before, country of origin, consumer care contact, shown on the listing | Product information block, variant chips, `settings` |
| FSSAI (Labelling & Display; e-commerce guidance) | Licence number and mandatory label information on the listing; ingredients, allergens, veg mark, nutrition for packaged food; ≥30% shelf life (or ≥45 days) left at delivery | Product information block, `batches.packed_on` + `best_before_days` (admin warns when the active batch is too old) |
| FSSAI Advertising & Claims Regulations 2018 | Claims must be specific and substantiated. "Natural", "fresh", "pure", "traditional" carry conditions ("traditional" needs a process used for ≥30 years). No disease or health claims | [Claims policy](#claims-policy) |
| FSSAI Organic Food Regulations / PGS-India / NPOP | Products under conversion can't be sold as "organic" or carry the Jaivik Bharat logo. PGS-Green produce may say "under conversion to organic" | `organicCopy()` |
| Consumer Protection (E-Commerce) Rules 2020 | Seller legal name, address, GSTIN, customer care. A **grievance officer** with name and contact; acknowledge within 48 h and resolve within 1 month. Clear return, refund, exchange and delivery terms. No cancellation charges unless HariLeaf bears similar charges | `/grievance` page, footer, `settings`, policy pages |
| CCPA Dark Patterns Guidelines 2023 | No drip pricing (there is no COD fee; the minimum order is shown on the product page). "Only N left" must be exactly true. The struck-through MRP is the real printed MRP. No pre-ticked consents | Buy box, checkout |
| DPDP Act 2023 + Rules (phased commencement) | A privacy notice at collection (checkout, notify-me); a **separate, unticked** marketing opt-in; retention (order and tax records kept for 72 months, other personal fields anonymised after the retention window); a grievance and erasure route | `/privacy` update, checkout notice, `marketing_opt_in` column, retention job (v2) |

### Claims policy

A single helper, `organicCopy(product)`, decides every organic-related word on the page, in titles, badges, the feed and product data. Process claims come only from `process_claims` (each one has an evidence note). Nothing is generated from certification status.

| `organic_scheme` | Certification wording | Allowed process claims |
|---|---|---|
| `none` | None. Never "organic" | Only from `process_claims`, e.g. "No synthetic pesticides or fertilisers used", "Stone ground below 40 °C", "Unpolished", "Hand harvested" |
| `pgs_green` | "Under conversion to organic (PGS-India Green), since {year}" + PGS-Green mark, only with a valid certificate | Same |
| `pgs_organic` / `npop` | "Organic" + the matching logo + certificate number | Same |

**Banned everywhere** (validated in admin and in a unit test): "chemical-free", "100% organic" or "organic" without a matching scheme, "naturally grown", and "traditionally made" unless that claim exists in `process_claims` with evidence for the 30-year condition.

**Health claims**: FAQ and descriptions state nutrition facts backed by `nutrition`/lab data ("3.2 g dietary fibre per 100 g"). They never make disease claims ("good for diabetics"). Comparative claims ("more fibre than polished rice") need a cited reference. The admin product editor shows this guidance next to the FAQ and description fields.

**Existing copy to fix in this release**: `/rice` and `/produce` currently say "100% Organic", "organically grown", and use the titles "Organic Rice | HariLeaf Farm" and "Organic Produce | HariLeaf Farm". Reword them to match the claims policy.

---

## SEO

### Positioning and keyword targets

| Keyword group | Examples | Content asset | Release |
|---|---|---|---|
| Heritage rice | "Karjat 3 rice", "Wada Kolam rice buy online", "unpolished red rice Maharashtra" | Product pages + `/rice` + a "polished vs unpolished rice" article | v1 |
| Stone-ground spices | "stone ground turmeric powder", "cold ground chilli powder", "high curcumin turmeric" | Product pages with grinding temperature + lab reports + a "stone ground vs machine ground" article | v1 |
| Farm-direct mangoes | "Kesar mango online Mumbai", "how to tell naturally ripened mangoes" | Product pages + seasonal copy on `/produce`. "Alphonso direct from farm" is a crowded head term, so it isn't a primary target | v2 |
| Fresh produce | "dragon fruit online Mumbai" | Product pages + `/produce` (zone-limited) | v2 |

Expect results in 6–12 months. Merchant Center free listings will bring visibility sooner than organic ranking. Trust signals: the `/our-process` page, the farm/farmer story, process detail per product, packed-on and ground-on dates, batch lab reports, and certification status shown honestly.

### On-page, per product
- Title: `seo_title`, or generated as `{Name}, {default variant} | {top process claim} | HariLeaf`. Never includes "organic" unless the scheme allows it.
- Meta description: `seo_description`, or generated from `short_description`.
- Canonical: the base product URL (`?v=` variant URLs canonicalise to it).
- Open Graph / Twitter: first product image.
- Structured data via the existing `JsonLd.astro`:
  - `ProductGroup` (`productGroupID`, `variesBy: size`), with `hasVariant` → `Product` per variant (`sku`, `name`, `url` with `?v=`, `Offer` with `price`, `priceCurrency: INR`, `availability` InStock / PreOrder / OutOfStock, `shippingDetails` free in IN, `hasMerchantReturnPolicy`, which is per product because perishables aren't returnable).
  - `aggregateRating` + `review`: **only when approved reviews exist**.
  - `BreadcrumbList`, `FAQPage` (from `faq`; kept for users and answer engines; no rich result is expected).
- Images: required alt text, responsive sizes via Cloudflare image resizing, lazy-loaded below the fold.

### Site-wide
- `/sitemap-store.xml`: categories, active products (with `lastmod`), recipes.
- `/feeds/google.xml`: Merchant Center RSS 2.0 feed, one item per active variant:
  - `g:id` = SKU, `g:item_group_id` = product id;
  - title, description;
  - `link` = the `?v={sku}` URL;
  - image;
  - `g:price` = **MRP** and `g:sale_price` = the selling price (only when they differ);
  - availability, and for pre-orders (v2) `g:availability_date`;
  - `g:brand` HariLeaf, `g:identifier_exists` no, `g:condition` new;
  - `g:google_product_category` from the category;
  - free shipping.

  Shipping and returns policies are also configured at account level in Merchant Center.
- `Organization` + `WebSite` data on the homepage (if not already present).
- Internal links: category ↔ product ↔ recipe ↔ `/our-process`.
- Performance budget: Lighthouse mobile ≥ 95. Only the cart icon, Add to cart, pincode check and checkout run JavaScript. Razorpay `checkout.js` loads only on `/checkout` and `/order/*`.

### Recipes
- v1: 2–3 hand-written Astro pages under `/recipes/`, with `Recipe` structured data and plain links to product pages.
- v2: a Keystatic collection `recipes` (title, slug, hero image, summary, ingredients, steps, prep/cook time, `productsUsed`). It uses the existing JSON-import pattern for prerendered pages: per `astro.config.mjs`, `createReader` fails during prerender. A small island loads buyable cards from `GET /api/store/products?slugs=…`. Publishing a recipe needs a deploy (Keystatic is git-based).

---

## Cart and Checkout

### Cart
- Stored in localStorage as `[{variantId, qty}]` only. Prices are never stored on the client.
- A cart drawer island and the `/cart` page call `POST /api/store/cart/quote`. It returns current prices, stock, availability, COD eligibility, line errors, and whether the minimum order value is met.

### Checkout (`/checkout`, single page)
1. Contact: name, 10-digit mobile, email. A privacy notice, plus a separate unticked opt-in for marketing email.
2. Address: **pincode first** → city and state auto-filled → Shiprocket serviceability check. Lines that can't be delivered are flagged and block checkout until removed. Then billing address ("same as shipping" by default) and an optional GSTIN.
3. Payment: *Pay online* or *Cash on delivery*. COD is hidden when any line has `cod_allowed = false`, the total exceeds `cod_max_order_paise`, or the pincode isn't COD-serviceable.
4. Summary: lines, discount (v2), GST included, shipping "Free", total. The order can't be placed below `min_order_paise`.

If the quote changes between cart and submit (price or stock), the server returns `409` with the new quote, and the UI shows "Price updated" or "Only N left" for the shopper to confirm.

`POST /api/store/checkout` takes an `Idempotency-Key` header, generated once per checkout attempt in the browser. A retried submit returns the same order instead of creating a second one.

### Online payment flow (authorize-then-capture)
1. `POST /api/store/checkout` → re-quote → D1 batch: the order (`pending_payment`), its items and its `held` reservations → Razorpay Orders API (`payment_capture: 0`, i.e. manual capture) → returns `razorpay_order_id`. Checkout.js gets `timeout: 900` (15 min). This is a UX hint only, so the server's reservation expiry stays authoritative.
2. Razorpay checkout.js opens (UPI / cards / netbanking).
3. The browser posts `{razorpay_payment_id, razorpay_order_id, razorpay_signature}` to `POST /api/store/checkout/verify`. The server verifies the HMAC, then **fetches the payment from Razorpay** and confirms `status = authorized|captured`, that the `order_id` matches the stored order, and that `amount` and `currency` equal `total_paise`. A valid signature alone never fulfils an order.
4. The `payment.authorized` / `payment.captured` webhook hits `POST /api/webhooks/razorpay`. The signature is verified over the **raw body** (`request.text()` before parsing), and the dedupe key is the `x-razorpay-event-id` header. It then runs the same checks as step 3.
5. Steps 3 and 4 run the **`mark_paid` exactly-once transition** (below). Whichever one wins, it:
   - moves the order `pending_payment → placed` and the reservations `held → consumed`;
   - sets `payment_status = authorized`;
   - enqueues `razorpay.capture`, `email.placed` and `shiprocket.create`, all in one batch.

   The loser sees a constraint error, re-reads the order and returns the current state. The capture job captures the payment and sets `paid`.
6. Payment failure or closing checkout: the order stays `pending_payment` until the reservation expires (30 min) → `payment_failed`, stock released. The order page offers "Retry payment" while the order is still `pending_payment`.

### Late authorisation (after the reservation expired)
When a valid authorisation arrives for an order in `payment_failed`, the `late_capture` claim runs:
- **Stock is still available** and the order was never customer-cancelled: re-reserve in the same batch (`payment_failed → placed`), then capture.
- **Otherwise**: don't capture. Razorpay automatically releases uncaptured authorisations, so there's no MDR loss. HariLeaf sends an apology email and an admin alert, and the reconciliation cron checks that the authorisation lapses.

If a payment was captured by mistake, use `refund_pending` → `razorpay.refund` → `refunded`.

### Reconciliation
Every 5 minutes, the cron also fetches Razorpay payments for any `pending_payment` order older than 10 minutes, to catch missed webhooks. Once a day, it compares captured payments with `paid` orders and flags any mismatch on the admin dashboard.

### COD flow
`POST /api/store/checkout` with `payment_method: cod` → re-quote → D1 batch: the order goes straight to `placed`, reservations are `consumed`, and the batch enqueues `email.placed` and `shiprocket.create` (COD amount = total).

### Exactly-once transitions
D1 batches can't branch, so every state change that must happen once is guarded by inserting a claim row whose `ok` value is computed from the current state in SQL:

```sql
-- statement 1 of the mark_paid batch: aborts the whole batch if this order
-- is not payable or was already claimed (PK conflict)
INSERT INTO ops (order_id, kind, ok, created_at)
SELECT ?1, 'mark_paid',
       (SELECT status = 'pending_payment' AND total_paise = ?2 FROM orders WHERE id = ?1),
       ?3;
-- statements 2..n run only if statement 1 succeeded (same transaction)
UPDATE orders SET status = 'placed', payment_status = 'authorized',
       razorpay_payment_id = ?4, paid_at = ?3 WHERE id = ?1;
UPDATE stock_reservations SET state = 'consumed' WHERE order_id = ?1 AND state = 'held';
INSERT INTO order_events (...) VALUES (...);
INSERT INTO outbox (...) VALUES (...), (...), (...);
INSERT INTO webhook_events (source, event_id, received_at) VALUES ('razorpay', ?5, ?3); -- webhook path only
```

When `ok` evaluates to 0, `CHECK (ok = 1)` fails. When the subquery finds no row, `ok` is NULL and `NOT NULL` fails. A second claim of the same kind fails on the primary key. In every case the batch rolls back with no side effects. The same pattern is used for `cancel`, `issue_invoice`, `late_capture` and `refund`. `transition(order, to, actor)` is the only code path that builds these batches.

---

## Orders and Fulfilment

### Status transitions
```
pending_payment ──► placed ──► packed ──► shipped ──► delivered ──► returned
      │   ▲            │          │          │
      ▼   │ (late auth,│          │          ▼
payment_failed  re-reserve)       │         rto
                       ▼          ▼
                   cancelled  cancelled (admin only)
```
Payment status moves independently: `unpaid → authorized → paid → refund_pending → refunded | partially_refunded (v2)`, with `refund_pending → paid` if the refund fails and an admin retries. Customer-cancelled orders are never revived. Every transition is written to `order_events`.

### Shiprocket (v1)
- **Auth**: log in with a dedicated API user and cache the token in KV (valid about 10 days). Refresh on 401 or when it's near expiry.
- **Order push**: the `shiprocket.create` outbox job sends items, weight and box size (from variants) and the COD amount. The job uses `order_no` as Shiprocket's `order_id`. Before retrying a create, it looks the order up to avoid duplicates.
- **Fulfilment in the Shiprocket panel (v1)**: assign AWB, print the label, request pickup. Admin has fields to paste the AWB and courier if the webhook is late. v2 adds in-admin "Book courier".
- **Webhook**: `POST /api/webhooks/courier`. The path deliberately avoids the word "shiprocket", which Shiprocket's docs disallow in webhook URLs. It's verified with a shared-token header and maps courier statuses to `shipped` / `delivered` / `rto`, and sets `tracking_url`. NDR (failed delivery attempt) events show up in admin for the owner to act on.
- **COD remittance**: an admin page lists delivered COD orders against Shiprocket remittance reports (CSV import in v1) and flags unremitted orders older than 10 days.
- v2, perishables: only couriers whose ETD for the pincode is within the product's `delivery_zone.max_transit_days`, express mode only, no pickups scheduled for Friday to Sunday (a dispatch calendar), sorted first in admin with a "ship within 24h" flag.

### GST invoices
- **When**: an invoice is issued when the admin marks an order **packed / ready to dispatch**, before the goods leave (CGST s.31(1)(a)). The order page shows "Invoice available once shipped". Online payment before dispatch is an advance on goods, so no GST is due on it, and the order confirmation email works as the payment acknowledgement.
- **How**: an `issue_invoice` exactly-once batch:
  1. claims `ops(order_id, 'issue_invoice')`;
  2. increments `doc_counters` for `(series, fy)`;
  3. inserts the immutable `invoices` row with the full `snapshot`, its number read from the counter in the same transaction.

  A failure rolls back the whole batch, so no number is ever burned. Rendering never assigns numbers.
- **Document type**:
  - only taxable lines → `tax_invoice`;
  - only exempt lines (0%) → `bill_of_supply`;
  - mixed → `invoice_cum_bill_of_supply` (Rule 46A).
- **Numbering**: consecutive and unique per financial year, **≤ 16 characters**:
  - invoices `HL/2627/000042` (14);
  - credit notes `HLCN/2627/00003` (15).

  The FY rolls over at 1 April 00:00 IST.
- **Contents**:
  - legal name, GSTIN, address, state code, FSSAI licence no.;
  - document no. and date;
  - buyer name, billing and shipping address, buyer GSTIN if given;
  - place of supply;
  - lines with HSN, qty, unit price, discount, taxable value, GST rate, CGST + SGST (delivery state = seller state) or IGST (otherwise);
  - totals and amount in words.
- **Format (v1)**: printable HTML at `/order/{orderNo}/invoice?t=…` (with print CSS), rendered only from `invoices.snapshot`. Admin can print any invoice. v2 adds a PDF rendered asynchronously from the same snapshot (an outbox job on Workers Paid, pdf-lib + fontkit with a subset Noto Sans font, because pdf-lib's standard fonts can't encode ₹) and stored in R2.
- **GST back-out per line**: `taxable = round(line_after_discount × 10000 / (10000 + rate_bp))`, tax = line − taxable, split into CGST and SGST halves (any odd paise goes to SGST). Property test: Σ line totals = `total_paise` and Σ tax = `gst_paise`, for any cart.
- **Credit notes**: a cancellation, return or refund after an invoice has been issued creates a credit note (own series) that references the invoice and lists the credited lines. Invoices are never changed or deleted. A cancellation before dispatch needs no credit note, because no invoice exists yet.
- Suggested defaults (owner to confirm with their CA): rice HSN 1006 @ 5% (pre-packaged and labelled; loose would be 0%), turmeric powder 0910 30 @ 5%, chilli powder 0904 22 @ 5%. v2: fresh mangoes 0804 50 @ 0%, other fresh fruit and vegetables @ 0%.

### Cancellations, refunds, returns, RTO
- **Customer cancel** (allowed while `placed`): for online orders, if the payment is only authorised it's voided by not capturing it, and if it's captured it gets a full refund via the Razorpay Refunds API. COD orders simply close. Stock is restored. No credit note is needed (no invoice exists yet). The Shiprocket order is cancelled if it was already pushed.
- **Admin cancel / refund** at any stage, **full refund only in v1**, with a reason: `refund_pending` → `razorpay.refund` job → `refunded` (or `failed`, which shows on the dashboard). A credit note is issued if invoiced, and an email is sent. v2 adds partial refunds.
- **Damaged / wrong item** (most common for food): the customer replies to the delivered email or contacts support with a photo. The admin chooses **Replace** (a new zero-value replacement order linked to the original) or **Refund**, with a reason.
- **Return / RTO**: the admin action "Receive return" restores non-perishable stock after inspection; perishable lines are written off. The dashboard shows the monthly RTO count and value.

### Emails (Resend, from `orders@harileaf.org`)

| To | Trigger |
|---|---|
| Customer | Placed (order summary, payment acknowledgement) · Shipped (tracking + invoice link) · Delivered · Cancelled / Refunded (credit note link if any) · v2: review request, pre-order ready to dispatch |
| Notify-me sign-ups (v2) | Product becomes buyable (back in season or restocked); each request is notified once |
| Owner | New order · Shiprocket sync failed (dead outbox row) · Payment reconciliation mismatch · Stock at or below the low-stock threshold |

Email sends go through the outbox and are logged in `order_events`. Failures are retried and can be resent from admin. They never block an order. (Resend's free tier allows 100 emails/day, about 25 orders/day at 3–4 emails each; upgrade when volume nears that.)

---

## Admin

Split the current single-file `src/pages/admin.astro` (506 lines, inline scripts) into separate pages under a shared `AdminLayout.astro`. Access needs **both** Cloudflare Access (an email one-time code or Google login, allowlisted emails) **and** the existing passphrase session (`src/lib/auth.ts`, with login throttling added). The Access identity is written to `order_events.actor_email` for every admin action.

| Page | Contents |
|---|---|
| `/admin` | Dashboard: today's orders and revenue, to pack, needs attention (dead outbox rows, reconciliation mismatches, failed refunds, NDRs), low stock, unremitted COD, RTO this month |
| `/admin/orders`, `/admin/orders/[id]` | List with filters (status, payment, COD). Detail: timeline, customer, items, totals, **Mark packed (issues the invoice)**, AWB/courier fields, Cancel / Refund, Replace, Receive return, Resend email, Print invoice |
| `/admin/products`, `/admin/products/[id]` | List (status, stock, current batch). Editor (React island): basics, organic scheme + certificate upload, process claims with evidence notes (banned-word validation), How it's made, harvest info, attributes, listing-compliance fields, nutrition, FAQ (with health-claims guidance), batches and lab reports, SEO fields with a live title/description preview, photos (drag to reorder, alt required), variants (SKU, label, net qty, price, printed MRP, weight, box size, stock, low-stock threshold, active), COD switch, GST rate + HSN, status + replacement product |
| `/admin/remittance` | COD remittance reconciliation (Shiprocket CSV import) |
| `/admin/settings` | GSTIN, legal and trade name, address, state code, FSSAI licence, customer care, grievance officer, minimum order, COD limit, notification emails |
| `/admin/photos`, `/admin/content` | Existing photo strip and produce-page content tools, moved over with no change in behaviour |
| v2 | `/admin/coupons`, `/admin/reviews`, pre-order "Ready to dispatch", in-admin courier booking |

Each admin write purges the affected edge-cache URLs (see Rendering and caching).

---

## v2 Features (designed now, built for February 2027)

### Perishables and delivery zones
- `perishable` products are prepaid only (`cod_allowed` forced false) and sold only to pincodes inside `delivery_zone` that have an express courier within `max_transit_days`.
- Cart rule: perishables check out separately from non-perishables.
- Before launch: packaging trials and test shipments to each zone, and a contribution-margin sheet per zone (courier, packaging, expected damage/RTO). A zone is enabled only if its margin is positive.
- Refund policy: no returns on perishables; replacement or refund for damage on arrival with a photo within 24 h of delivery.

### Pre-orders
- A separate, prepaid-only cart. The order stores `is_preorder` and `expected_dispatch_date`.
- It isn't pushed to Shiprocket until the admin marks it **Ready to dispatch**, which also issues the invoice and sends the "ready to dispatch" email.
- Harvest shortfall or delay: the admin can push back the dispatch date (an email goes out, and the customer can cancel for a full refund) or cancel and refund.
- Feed: `g:availability = preorder` + `g:availability_date`.

### Coupons
- `percent` (optionally capped by `max_discount_paise`) or `flat`. Optional: minimum order, start/end dates, total usage limit, one per phone number, category restriction.
- Validated only on the server, during quote and checkout. The discount is spread across eligible lines in proportion to their value, using **largest-remainder rounding** so the line discounts add up exactly to the order discount. This happens before the GST back-out, which is correct for a discount known at the time of supply (CGST s.15(3)(a)). Per-slab tax totals fall out of the per-line amounts.
- Enforced in the order-creation batch: `UPDATE coupons SET used_count = used_count + 1` with `CHECK (usage_limit IS NULL OR used_count <= usage_limit)`, and `coupon_redemptions` with `UNIQUE(coupon_code, phone)` when `one_per_phone`. When an online order ends `payment_failed`, the redemption row is deleted and `used_count` is decremented in the expiry batch.

### Reviews
- The delivered email links to `/review?o={orderNo}&t={token}`. The form lists each product in the order.
- Rating 1–5, title, body, display name (default: first name + city).
- One review per (order, product), `pending` until approved in admin. Approval purges the product URL from the cache.
- A product with no approved reviews renders **no** rating line, reviews section or rating data. `aggregateRating` uses only approved reviews.
- Reviews follow IS 19000:2022 practice: verified buyers only, no paid or incentivised reviews, negative reviews are not suppressed.

### Notify me
- `POST /api/store/notify` stores `{productId, email}`, ignoring duplicates per product + email. Turnstile protects against bots (already used on the contact form). The privacy notice is shown at the form.
- When a product's availability changes from `notify` / `sold_out` to `buy` or `preorder`, the outbox emails everyone not yet notified and sets `notified_at`.

---

## Security

- `/admin*` and `/api/admin*`: Cloudflare Access plus the existing session cookie (`HttpOnly; Secure; SameSite=Strict`), checked on every request. The login is rate-limited.
- Order and review tokens: random 128-bit tokens. Only an HMAC (`ORDER_TOKEN_SECRET`) is stored, compared in constant time. Token pages send `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. The invoice route requires the token too.
- Razorpay: payment signature check (HMAC-SHA256 with the key secret), plus a server-side fetch of the payment (status, order id, amount, currency). Webhook signature is checked over the raw body (`X-Razorpay-Signature` with the webhook secret).
- Courier webhook: shared-token header check.
- Webhook events are deduplicated by event ID **in the same batch as the state change**, so a failed run is retried rather than swallowed.
- Store APIs: one Cloudflare rate-limiting rule covering `/api/store/checkout*` (the free plan allows one rule), plus the Workers Rate Limiting binding per IP on checkout and pincode, plus Turnstile on checkout submit.
- All inputs validated on the server (phone, pincode, email, GSTIN checksum, quantities 1–20 per line, cart ≤ 20 lines).
- Admin-entered Markdown and FAQ are sanitised on render.
- No card data ever touches HariLeaf servers (Razorpay-hosted checkout).
- **Backups**: a nightly D1 export to R2 (financial records are kept for 72 months), with a restore drill before launch. D1 Time Travel covers the last 30 days.

---

## Error Handling

| Situation | Behaviour |
|---|---|
| Stock short at checkout | `CHECK (stock_qty >= 0)` aborts the batch → re-quote → 409 with the short lines → UI shows "Only N left" |
| Price changed since quote | 409 with the new quote → shopper confirms |
| Double submit / network retry | `Idempotency-Key` returns the existing order |
| Razorpay order creation fails | The order batch has already committed, so the order is immediately set to `payment_failed` and its reservations released → "Payment couldn't start, please retry" |
| Paid but browser closed before verify | The webhook (or the 5-minute reconciliation) runs `mark_paid`; the email still goes out |
| Webhook arrives twice / out of order | The `ops` claim and the `webhook_events` PK make duplicates fail harmlessly; transitions only move forward |
| Authorised after the reservation expired | `late_capture`: re-reserve and capture if possible; otherwise don't capture (auto-release, no MDR) + apology email + admin alert |
| Refund API fails | `refund_pending` stays, the outbox retries, and a dead row shows on the dashboard |
| Shiprocket API down | The order stays `placed`; the outbox retries with backoff; a dead row shows on the dashboard with a manual Retry |
| Resend down | Outbox retry; manual resend |
| Cache purge API fails | The admin write succeeds; the purge retries through the outbox |
| Pincode service down | Allow checkout with a "delivery confirmed after order" note for non-perishables; block perishables (v2) |

Logging: structured `console.log` JSON with `order_no`, viewable in Cloudflare Workers logs.

---

## Testing

New test setup (the repo has none today). Store logic lives in plain TypeScript modules in `src/lib/store/` that take a `D1Database` and an `env`. Astro routes stay thin wrappers, so tests target the modules, not Astro.

- **Vitest unit tests**:
  - money/GST maths: back-out, CGST/SGST/IGST split, odd-paise handling, and the property test Σlines = total;
  - document type selection, and invoice numbering per FY, including the IST rollover at 31 March 23:59:59 IST and the 16-character limit;
  - `availability()`, including year-wrapping seasons;
  - COD eligibility, minimum order;
  - `organicCopy()` and banned-word validation;
  - title/meta generation;
  - `transition()` rules.
- **Integration tests** with `@cloudflare/vitest-pool-workers` (real local D1):
  - checkout API, including the idempotency key;
  - **concurrent reservations of the last unit** (exactly one wins);
  - the `CHECK` constraint abort;
  - verify and webhook racing (exactly one `mark_paid`, one outbox set);
  - duplicate and invalid-signature webhooks;
  - late authorisation, both with and without stock;
  - reservation expiry cron and overlapping cron runs;
  - `issue_invoice` racing (no burned or duplicated numbers);
  - a crash between the batch and the outbox drain (the effect still happens);
  - courier webhook mapping;
  - cancel → refund → credit note.
- **Playwright end-to-end tests** against `astro dev`, with Razorpay `checkout.js` stubbed for CI and a manual run against Razorpay **test mode** before release, plus a mocked Shiprocket:
  - browse → cart → online payment;
  - COD;
  - minimum order;
  - customer cancel;
  - mobile sticky bar following the variant;
  - reviews hidden with 0 approved reviews;
  - keyboard-only purchase.
- **SEO checks**: JSON-LD validated (schema snapshot tests + Rich Results Test before launch), feed XML validated against the Merchant Center spec, Lighthouse CI on mobile ≥ 95 for a product page and `/shop`.
- **Launch rehearsal** on the deployed Worker:
  - a real ₹1 test product through Razorpay live mode → Shiprocket pickup → delivery → refund → credit note;
  - backup restore drill.
- CI (`.github/workflows/ci.yml`): add `npm test` (unit + integration) next to `astro check` and the build. End-to-end tests run on PRs labelled `e2e` and before release.

---

## Build Order

### v1 (rice and spices), about 30 dev-days for one experienced developer
1. **Foundation**:
   - D1 database + migrations with every constraint and trigger;
   - `wrangler.toml` binding + cron + custom `src/worker.ts` entry;
   - outbox runner;
   - `src/lib/store/` (money, GST, document types, availability, claims/`organicCopy`, `transition()` + `ops` batches) with unit and integration tests;
   - Cloudflare Access;
   - `AdminLayout` + admin split (existing tabs moved over);
   - policy pages + `/grievance`.
2. **Catalog**:
   - product/category admin (incl. compliance fields, batches, lab reports);
   - product page (Hybrid, all states);
   - SSR category grids, `/shop`, header cart icon;
   - SEO (meta, ProductGroup JSON-LD, sitemap, feed, robots);
   - global cache purge;
   - `/our-process`, 2–3 static recipes;
   - rewording existing copy per the claims policy.
3. **Checkout**:
   - cart island + quote API, pincode serviceability, checkout page;
   - Razorpay authorize-then-capture + verify + webhook + late capture + reconciliation;
   - COD flow, reservations + expiry cron.
4. **Orders**:
   - admin orders;
   - Mark packed → invoice (HTML, snapshot), credit notes;
   - Shiprocket order push + courier webhook + AWB fields;
   - emails via outbox;
   - cancel / full refund / replace / receive return;
   - COD remittance import.
5. **Hardening**:
   - end-to-end tests, concurrency tests, Lighthouse CI;
   - security review, backup drill;
   - launch rehearsal, launch checklist.

### v2 (by mid-February 2027), about 20–25 dev-days
Perishables + delivery zones + dispatch calendar, pre-orders + ready-to-dispatch, notify-me, coupons, reviews, partial refunds, in-admin courier booking, PDF invoices, Keystatic recipes, DPDP retention job.

---

## Owner Launch Checklist (outside the codebase)

- [ ] **Name the engineering owner** for 12 months post-launch (otherwise switch to the headless Shopify fallback)
- [ ] Upgrade to Workers Paid; set up Cloudflare Access with the admin emails; create the purge-only API token
- [ ] Razorpay account + KYC (policy pages must be live first); enable manual capture
- [ ] Shiprocket account, dedicated API user, pickup address, KYC, COD remittance bank account; get courier rate cards → set `min_order_paise` and `cod_max_order_paise`
- [ ] Resend account + DNS verification for `harileaf.org`
- [ ] Google Merchant Center account linked to Search Console; account-level shipping and returns settings
- [ ] FSSAI licence number; packer address; customer care phone/email; grievance officer name and contact
- [ ] **CA sign-off**: invoice at dispatch, invoice-cum-bill of supply, document numbering format, HSN codes and GST rates per product (incl. "pre-packaged and labelled" status for rice), advance-receipt handling
- [ ] Final prices and **printed MRPs** per pack; label artwork matching the website declarations
- [ ] Organic scheme (PGS-India / NPOP / none) and conversion start year; certificates as they arrive
- [ ] Evidence for every process claim (milling/grinding logs, input records); lab reports from an accredited lab
- [ ] ≥3 real photos per product
- [ ] Refund / shipping policy wording approved (damaged-on-arrival process, COD refusals)
- [ ] v2: packaging trials and zone margin sheet for perishables

---

## Implementation notes (M1 Foundation)

Deltas from the design above, made while building M1 (`docs/superpowers/plans/2026-10-18-ecommerce-m1-foundation.md`):

- **Invoices** have an explicit `series` column (`INV` | `CN`); uniqueness is `UNIQUE(series, fy, seq)` (the design referred to an undefined `doc_type_series`). A `BEFORE INSERT` trigger requires `seq` to equal the just-incremented `doc_counters.last_no`, so numbering is gapless at the database level. Document numbers are built in SQL from the counter.
- **Purchasable-variant guard**: instead of `UPDATE … WHERE active = 1` (which silently matches 0 rows and doesn't abort a batch), a `BEFORE INSERT` trigger on `stock_reservations` aborts unless the variant is active and its product is `active`. Checkout puts the decrement and the reservation in one batch, so both roll back. Admins can still correct stock on inactive variants.
- **Forward-only / append-only**: `stock_reservations.state` can't leave `consumed`/`released`; `order_events` can't be updated or deleted.
- **Extra CHECKs**: perishable products can't allow COD; `orders.total_paise = subtotal_paise - discount_paise`; order lines must satisfy `line_total = unit × qty − discount = taxable + CGST + SGST + IGST` and never mix IGST with CGST/SGST; at most one active batch per product.
- **Outbox** has a `running` state with `lease_until`: drains claim rows with a guarded `UPDATE`, so overlapping cron runs never execute a row twice within its lease, and a crashed run's rows are reclaimed. Handlers must be idempotent. Unknown kinds go straight to `dead`.
- **`orders.idempotency_key UNIQUE`** backs the checkout `Idempotency-Key` header (M3).
- **`workers_dev = false`** in `wrangler.toml`, and the Worker verifies the Cloudflare Access JWT itself (RS256 against the team JWKS) for `/admin*`, `/api/admin*` and `/api/auth`, so no other URL can bypass Access. Not configured → passphrase-only with a dashboard warning; half-configured → 503.
- **Types**: Cloudflare runtime types are aliased in `src/env.d.ts` rather than added globally, because the global runtime types break DOM typing in client `<script>`s.
- **Local cron testing**: Wrangler's local assets proxy can't forward `ScheduledController`; see README → Cron.
- **Review fixes (pre-PR code review)**:
  - Document numbers are issued only through `issueDocStmts()` (`src/lib/store/docnumbers.ts`): `INSERT OR IGNORE` the FY counter, advance it by one (a trigger rejects any other step), insert the invoice with `seq` from a scalar subquery. A missing counter can no longer make the batch silently insert nothing. `doc_no` is CHECKed to equal the value derived from series/FY/seq, and credit notes must reference a non-credit invoice of the same order.
  - Reservations: one live hold per order line via a partial unique index (`WHERE state = 'held'`), so a late authorisation can re-reserve. Lines are immutable and rows are never deleted.
  - `ops` kinds are claimable once per order, so repeatable actions use a discriminator (`refund:<refund_id>`, `credit_note:<n>`).
  - Outbox: per-row lease timestamps, completion updates require the claimed attempt number (a taken-over drain can't overwrite the newer result), and final attempts that never report back are swept to `dead`.
  - Access: path matching normalises trailing slashes (`/api/auth/` is routed by Astro) and also covers Keystatic and writes to `/api/photos*`, `/api/produce`, `/api/content`. JWKS fetch failures fall back to the cached keys.
  - Claims: "organic" requires `mayUseOrganic` from `organicCopy()` (scheme and certificate); all FSSAI Reg 4 conditional terms (natural, fresh, pure, traditional, authentic, genuine, real, original) need an evidenced claim with that code; "cured"/"curing" are not treated as health claims.
  - Deploy applies D1 migrations (`wrangler d1 migrations apply --remote`) before `wrangler deploy`.

## Implementation notes (M2 Catalog)

- **No React on storefront pages.** The buy box, gallery, cart icon and /shop filters are small TypeScript modules; React is only used for the admin product editor. Keeps product pages light for the Lighthouse target.
- **Product routes** are `src/pages/{rice,spices,produce}/[slug].astro` (not a catch-all `[category]/[slug]`, which would compete with `/farms/*` and Keystatic). `404.astro` is now on-demand so product routes can `Astro.rewrite('/404')`.
- **Edge cache key** drops the trailing slash and these query params: `v`, `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `gad_source`, `srsltid`, `ref`. Any other param (e.g. `?waitlist=success`, read server-side) bypasses the cache. Skipped entirely in `astro dev`.
- **Stock is edited as a delta** (`stock_qty = stock_qty + Δ`) so an admin save can't overwrite concurrent sales. A product's URL (category + slug) is frozen once published.
- **Nutrition** is stored as `{ per, source, rows: [{ name, amount }] }`.
- **Claims checker**: "fresh" is allowed for raw produce (perishable products and the produce-page content); it still needs evidence elsewhere. `/admin/content` rejects banned wording, and the dashboard warns when stored KV content still contains it.
- **Return policy in JSON-LD** is `MerchantReturnNotPermitted` (food packs are only replaced/refunded when damaged or wrong). Revisit if the refund policy changes.
- **Copy reworded** on `/rice`, `/spices`, `/produce`, the homepage and content defaults: removed organic/chemical-free, disease/health-benefit wording and uncited statistics; nutrition panels are labelled as typical values for the variety until lab values exist.
- **Fixed a live mobile bug**: the invisible `#mobile-backdrop` (fixed, full-screen, z-30) caught every tap on phones while the menu was closed; it now has `pointer-events: none` until opened.
- **Real Cloudflare types**: `src/env.d.ts` aliases each type from `@cloudflare/workers-types/latest` (the earlier `import('@cloudflare/workers-types')` alias silently resolved to `any`).

## Implementation notes (M3 Checkout)

- **Razorpay manual capture** uses the documented per-order `payment: { capture: "manual", capture_options: { manual_expiry_period: 4320 } }` (3 days), not the undocumented legacy `payment_capture` flag. Uncaptured authorisations auto-release; refunds are only possible after capture.
- **Order numbers** come from `order_counters` (one row per IST `yymm`, +1-only trigger) inside the order batch: `HL-YYMM-NNNN`.
- **View tokens** are derived, not stored: `token = HMAC(ORDER_TOKEN_SECRET, "view-token:" + idempotency_key)[:32]`; only `HMAC(secret, "order-view:" + token)` is stored. A retried submit (same key) gets the same order and link, and email handlers rebuild the link from the stored key.
- **Idempotency key** is generated per cart *and* form contents in the browser; a retry of an attempt whose payment window already closed gets `409 { code: "expired" }` and the browser starts a fresh attempt.
- **Payment confirmation**: verify (signature + payment fetch), webhook (raw-body signature, `x-razorpay-event-id` dedupe) and the 5-minute reconciliation all call the same exactly-once `markPaid`. Expiry gives stock back only for reservations still `held` (conditional `UPDATE`), and a late authorisation without stock is never captured; the customer gets an apology email (`email.payment_released`).
- **Shiprocket in M3** is serviceability only (`/api/store/pincode`, checkout check); results are cached in KV for 12 h per pincode/weight bucket. Unreachable Shiprocket fails open for non-perishables. New settings: `pickup_pincode`, `shiprocket_pickup_location`.
- **Order confirmation email** (customer + owner) moved from M4 to M3 so `email.placed` rows always have a handler; Resend `Idempotency-Key = email.placed/<order_no>`.
- **Cart** is a `/cart` page (no drawer); all client rendering uses `textContent` via a tiny DOM helper.
- **No SRI** on Turnstile `api.js` / Razorpay `checkout.js`: both vendors change these files in place (Cloudflare documents that SRI must not be used for Turnstile). They load only on checkout/order pages.

## Review record

This revision applies the consensus of a four-model design review (Codex, Antigravity, Sonnet, Claude; 2 rounds, 2026-10-18). Key changes from v1 of this spec:
- descoped release plan;
- database-enforced atomicity (`CHECK` constraints, `ops` claims, outbox);
- authorize-then-capture with late-authorisation handling;
- invoices at dispatch, with Rule 46A document types and 16-character numbering;
- no COD fee;
- claims policy and the mockup copy fixed;
- listing compliance (Legal Metrology, FSSAI, E-Commerce Rules, DPDP);
- minimum order and perishables prepaid-only;
- global cache purge, a custom Worker entry for cron, SSR category pages, Workers Paid;
- Cloudflare Access on admin;
- ProductGroup structured data and variant landing URLs.

Claims to re-verify during implementation:
- the Shiprocket webhook-keyword rule;
- the current FAQ rich-result status;
- the DPDP Rules commencement dates;
- current Resend and Cloudflare free-tier limits.

### M3 review fixes

- Checkout looks up the Idempotency-Key **first**: a retried submit returns its existing order before Turnstile, re-quote or courier calls (stock already left `stock_qty`, so a re-quote would wrongly fail). Keys are bound to a fingerprint (SHA-256 of sorted lines + email); a reused key with a different body gets 409 `key_reused`.
- Turnstile tokens are single-use: the client resets the widget after every attempt; an `expired`/`key_reused` 409 asks the shopper to press Place order again with a fresh key.
- `markPaid`/`lateCapture` throw on unexpected D1 errors so the webhook returns 5xx and Razorpay retries. Reconciliation also covers `payment_failed` orders from the last 3 days that were neither late-captured nor released, and isolates per-order failures.
- `late_capture` is refused once `late_release` ran (the customer was told they weren't charged).
- Order-page retry first checks Razorpay for a completed payment; extra authorisations on a paid order are recorded as `extra_payment` events (never captured; the bank auto-releases them).
- Pincode endpoint: clamped/bucketed value in the cache key, only positive answers cached, Workers Rate Limiting binding `STORE_RATE_LIMITER` (30/min/IP) on checkout, pincode and retry.
- Checkout sends `expectedTotal`; a different server total → 409 `price_changed` with the fresh quote. The courier's state for the pincode must match the chosen state. Buyer GSTIN prefix must match the billing state; place of supply follows IGST Act s.10(1)(b) for bill-to/ship-to B2B.
- 8 s timeouts on Razorpay, Shiprocket and Resend; 5 s on Turnstile (fails closed). The owner email is its own outbox row. A cron sweep re-queues capture (hourly at most) for authorised orders whose capture rows died, within the 3-day authorisation window.
- Deferred: COD verification (OTP/confirmation before the Shiprocket push) → M5 hardening; view-token rotation ("resend link") → M5.

### M4 implementation notes

- **Fulfilment** (`fulfilment.ts`): every transition is an `ops` claim whose `ok` re-checks the status in SQL, so admin clicks, courier webhooks and customer cancels race safely (tested). Packing issues the GST invoice in the same batch (refuses until legal name, address and GSTIN are set); replacements are zero-value orders linked by `replacement_for_order_id` with no invoice (flagged for the CA).
- **Cancel**: customers while `placed`, admin while `placed`/`packed`. Stock is restored; an issued invoice gets a credit note (`HLCN/…`); captured payments are refunded, authorised ones simply not captured (the bank releases them). If a cancel lands mid-capture, the capture batch itself records the refund instead of queueing the shipment.
- **Refunds** after dispatch: Razorpay through the outbox (receipt `rf-<id>`, looked up before creating so a retry can't refund twice; settled by `refund.processed`/`refund.failed` webhooks); COD manually with a UPI/bank reference.
- **Shiprocket**: COD orders are pushed at placement, prepaid orders only after capture. Creation looks the order up by channel order id first (idempotent). Tracking webhook `/api/webhooks/courier` (`x-api-key`), deduped per AWB+status+timestamp, maps `shipment_status_id` to ship/deliver/RTO/NDR; a pickup on an unpacked order packs it (and invoices) first. COD becomes `paid` on delivery.
- **Documents**: `/order/[no]/invoice?t=` (customer) and `/admin/orders/[id]/invoice`, rendered only from the frozen snapshot; print CSS for A4.
- **Admin**: `/admin/orders` (filters, search by order no./phone/email/AWB/name), detail with actions, timeline, notes, background-task retry; dashboard to-dos (to pack/ship, RTO, NDR, failed refunds, extra authorisations, unremitted COD); `/admin/remittance` CSV import matched by AWB with mismatch report.

### M4 review fixes

- **Cancel vs capture**: the cancel claim re-checks the exact status *and* payment status it read; if a capture (or pack) lands in between, cancel re-reads and retries, so a just-captured payment is always refunded (interleaving test). Every cancel queues `shiprocket.cancel`, which resolves the Shiprocket order when it runs (by id or channel-order lookup) and treats "already cancelled" as done.
- **Payments gate fulfilment**: pack and ship require `payment_method = 'cod' OR payment_status = 'paid'` (an authorisation can lapse). A payment that arrives already captured queues the Shiprocket push directly.
- **Refunds**: settling is exactly-once per refund row (`ops` claim `refund_settled:<id>`); a failure puts the order back to `paid` and shows on the dashboard; admin retry creates a new row with a new receipt (`rf-<id>`, also in notes) so the failed Razorpay refund isn't mistaken for it; a cron re-checks refunds still pending after 24 h.
- **Courier webhook**: an event is recorded as seen only after it was applied; unexpected errors answer 5xx. Missed scans are walked forward (pack → ship → deliver/RTO). Events that can't be applied (e.g. pickup of a cancelled order), lost parcels and Shiprocket-side cancellations are logged on the order and counted on the dashboard. Fulfilment functions throw on unexpected D1 errors instead of reporting "wrong state".
- **GST**: invoice place of supply uses the same rule as checkout (IGST s.10(1)(b) for B2B bill-to/ship-to) and the intra/inter-state split follows the tax charged. Free replacements get a **delivery challan** (Rule 55, `HLDC/<fy>/<n>`, own table, gapless per FY) instead of an invoice, and declare the goods' value to Shiprocket. Invoices show quantity units (NOS) and "unit price (incl. GST)"; tax columns appear only where tax applies.
- **Replacements** are idempotent per admin page load (request key → order idempotency key) and capped cumulatively at the originally ordered quantity per line.
- COD remittance import: chunked lookups and batched inserts, at most 800 rows per file (D1 per-invocation query limit), and flags matches to prepaid orders.
- Perishables are restocked on cancellation (they never left the farm); never after dispatch.

### M5 implementation notes

- **COD confirmation** (setting `cod_confirmation`, default on; migration 0004 `orders.cod_confirmed_at`): unconfirmed COD orders are not pushed to Shiprocket and can't be packed. The customer confirms with a button on the order page (linked from the order email as `#confirm`; a POST, so mail link scanners can't confirm), or an admin confirms after a call. One reminder email after 24 h (cron); orders unconfirmed for 2 days appear as a dashboard to-do. No auto-cancel — that stays a human call (stock is held meanwhile).
- **Find your order** (`/order/find`): order number + email → emails a fresh link; same answer whether or not they match, per-IP rate limit, at most one email per order per 10 minutes. Missing/wrong order tokens land on this page (404), whether or not the order exists. Token rotation is out of scope (links are derived from the order's idempotency key).
- **Headers**: HSTS everywhere; an enforced CSP on `/cart`, `/checkout`, `/order/*` allowing scripts only from self, Razorpay Checkout and Turnstile (inline allowed for layout code). Playwright fails on CSP violations.
- **Edge cache keys carry the build id** (`?__b=<git sha>`), so a deploy never serves HTML cached by the previous build (which references replaced asset hashes). Purges target the current build's keys.
- **D1 outage**: product and order pages render a 503 "back in a moment" page (`Retry-After`, `no-store`, never edge-cached); listing and policy pages already degrade gracefully.
- **Privacy policy** rewritten for the shop and the DPDP Act 2023 (data collected at checkout, processors, retention aligned with CGST s.36, data-principal rights, grievance officer, breach notice, children) — for legal review.
- **Testing & ops**: seeded concurrency stress test (stock conservation, gapless documents); Playwright e2e on desktop + mobile; Lighthouse CI (accessibility, SEO, best practices and CLS are errors, performance a warning); nightly D1 export to the private R2 bucket `harileaf-backups`; Workers Logs enabled; `docs/launch-checklist.md`.

### M5 review fixes

- **COD confirmation is decided per order at placement** (`createOrder({ codConfirmationRequired })`; migration 0004 backfills older COD orders as confirmed). Toggling the setting no longer strands orders or re-blocks them, and an order already with Shiprocket counts as confirmed, so courier scans are never blocked. Reminders go out only between 09:00 and 20:00 IST.
- **Order links rotate**: `view_token_rev` (0004) feeds the link HMAC; "find your order" bumps it, so earlier (forwarded/leaked) links stop working. Caps: one email per order per 10 minutes, 3 per day, 40 per day store-wide (protects the shared email quota); Turnstile when configured; the no-match path does the same hashing work.
- **CSP pages are always full page loads**: a global `astro:before-preparation` handler cancels view-transition swaps into or out of `/cart`, `/checkout`, `/order/*` (Astro then navigates normally), so the CSP header always applies and never leaks onto other pages. Added `https://cdn.razorpay.com` to `script-src` (checkout.js's risk script) and `https://*.razorpay.com` to `form-action` (its redirect flow).
- **Retention backed by code**: a cron job anonymises orders that never became a sale (never paid, or cancelled before any payment; no invoice, no refund) after 180 days; admin *Erase personal data* does the same on request and refuses tax records; *Stop marketing emails* withdraws consent for an email across all orders. The privacy policy now matches the code (data sent to Shiprocket, Google Fonts, Behold, retention, withdrawal, admin sign-in).
- **Lighthouse runs on mobile** (default emulation): `/shop/` and a product page must score ≥ 0.95 for performance (they score 0.99); accessibility/SEO/best-practices and CLS are errors everywhere except SEO on the noindex cart; the home page's performance is a warning (marketing hero, outside store scope). Fixed a site-wide a11y bug: the closed mobile menu is now `inert`.
- **e2e scope**: added click-through navigation (asserting full loads), minimum order, hidden reviews, keyboard-only add to cart and the mobile sticky bar. **Online payment is not in e2e**: the server talks to Razorpay's API (order create, payment fetch), which can't be stubbed from the browser; it is covered by the integration tests with a stubbed API, plus the launch checklist's test-mode run on real devices.
- Backups use their own least-privilege token, run off the cron minute, verify gzip integrity and read the upload back. Deploys must be 100% (no gradual rollouts): purges and hashed assets assume one live version.
- Known limits: the stress test's seed fixes the operations, not their interleaving; unconfirmed COD orders hold stock until someone cancels them.
