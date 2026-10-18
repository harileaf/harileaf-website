# E-commerce Store — Design Spec
**Date:** 2026-10-18
**Status:** Draft — awaiting user review
**Branch target:** `feat/ecommerce`

---

## Overview

Turn harileaf.org into a shoppable, SEO-led store for HariLeaf's farm products. Rice, spices, mangoes and other fresh produce become buyable online with pan-India delivery, online payment (Razorpay) or cash on delivery, Shiprocket fulfilment, GST invoices, coupons, verified reviews, a Google Merchant Center feed and a recipes section.

Catalog, checkout and order management **launch together** as one release, built in the sequence in [Build order](#build-order).

### Goals

1. Rank for high-intent searches from people looking for **high-quality, traditionally made, nutrition-preserving farm products**: heritage rice, farm-direct mangoes, low-temperature stone-ground spices, chemical-free fresh produce.
2. Compete with Two Brothers Organic Farms by winning specific long-tail searches and showing **proof** (process detail, batch lab reports, harvest/grind dates), rather than competing head-on for broad terms.
3. Keep running costs "free-ish": about ₹0/month of infrastructure on the existing Cloudflare stack; costs are only per transaction or per shipment.
4. Let the owner configure every listing from `/admin` with no rebuild or deploy.

### Non-goals (this release)

- Customer accounts / login (guest checkout only)
- International shipping or multi-currency checkout (data model is ready for it, but there's no UI)
- WhatsApp / SMS notifications
- Review photo uploads
- Live courier rate calculation (shipping is always free)
- Subscriptions, gift cards, wishlists, loyalty points
- Marketplace sync (Amazon / Flipkart)

---

## Decisions Made

| Question | Decision |
|---|---|
| Domain | Subfolder on `harileaf.org` (not a subdomain) |
| Platform | Custom build on the existing Astro 6 + Cloudflare Workers stack (D1, R2, KV) |
| Products at launch | Rice, spices, mangoes, other fresh produce |
| Delivery | Pan-India for all products; international later |
| Launch | Catalog + checkout + orders released together |
| Payments | Razorpay (UPI / cards / netbanking) **and** COD for all products |
| Shipping | Shiprocket API integration |
| Shipping charge | Always free (built into prices) |
| Accounts | Guest checkout only |
| GST | Registered; per-product GST rate; GST invoices + credit notes |
| Inventory | Exact stock count per variant, reserved at checkout |
| Off-season | Per product: **Notify me** *or* **Pre-order** |
| Notifications | Email only (Resend) |
| Extras at launch | Coupons, verified reviews, Merchant Center feed, recipes/blog |
| Product page layout | **C — Hybrid**: light buy box above the fold, dark "From our farm" bento band, then reviews / FAQ / related |
| Reviews display | Hidden entirely (section, stars, rating data) until a product has ≥1 approved review |
| Organic wording | Per-product organic status; HariLeaf is currently **in conversion**, so "naturally grown / chemical-free / traditionally made" until certified |

---

## Architecture

Everything runs inside the existing `harileaf` Cloudflare Worker (`output: 'server'`, `@astrojs/cloudflare`).

```
Browser ── Astro pages (HTML-first) + Cart island (React) + Razorpay checkout.js
   │
   ▼
Cloudflare Worker (Astro SSR)
   ├─ Existing pages (about, technology, contact, …)
   ├─ Storefront pages        /shop, /rice, /rice/[slug], /cart, /checkout, /order/[id]
   ├─ Store API               /api/store/*      (cart pricing, checkout, pincode, reviews, notify)
   ├─ Webhooks                /api/webhooks/razorpay, /api/webhooks/shiprocket
   ├─ Admin API               /api/admin/*      (session-gated)
   ├─ SEO endpoints           /sitemap-store.xml, /feeds/google.xml
   ├─ Recipes                 /recipes, /recipes/[slug]  (Keystatic, prerendered)
   └─ Cron trigger            every 15 min: expire reservations, retry Shiprocket/email syncs
        │
        ├─ D1  `harileaf-store`  products, variants, orders, stock, coupons, reviews, settings
        ├─ R2  `harileaf-media`  product photos, lab reports, certificates, invoice/credit-note PDFs
        ├─ KV  `HARILEAF_CMS`    admin sessions (existing), page content (existing)
        └─ External: Razorpay · Shiprocket · Resend · Google Merchant Center
```

### New Cloudflare resources

| Resource | Type | Purpose |
|---|---|---|
| `harileaf-store` | D1 database (binding `STORE_DB`) | All commerce data |
| Cron trigger | `*/15 * * * *` | Release expired stock reservations; retry failed Shiprocket pushes and emails |

### New secrets

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `ORDER_TOKEN_SECRET`. All are added to `.env.example`.

### Rendering and caching

- Product, category and `/shop` pages: server-rendered from D1 and cached at the edge (Cache API, `s-maxage=3600`). Any admin write clears the affected URLs (product, its category, `/shop`, `/sitemap-store.xml`, `/feeds/google.xml`), so changes go live within seconds.
- Price, stock and availability shown on a cached page are **for display only**. The server recomputes all of them at checkout.
- Recipes: prerendered at build time from Keystatic content (git-based), matching the existing prerendered marketing pages.
- `/cart`, `/checkout`, `/order/*`, `/review`: never cached, `noindex`.

---

## URL Structure

| URL | Purpose | Indexed |
|---|---|---|
| `/shop` | All products; category and process chips (Stone ground, Unpolished, Sun dried, In season, Pre-order) | Yes |
| `/rice`, `/spices`, `/produce` | Existing story pages become category pages: existing hero + **product grid near the top** + existing story sections | Yes |
| `/{category}/{product-slug}` e.g. `/rice/karjat-3`, `/produce/alphonso-mango` | Product page; variants (1 kg / 5 kg / 1 dozen) live on one page | Yes |
| `/recipes`, `/recipes/{slug}` | Recipes / blog, each linked to products | Yes |
| `/our-process` | How HariLeaf grows, mills and grinds; linked from every product | Yes |
| `/shipping-policy`, `/refund-policy` | New policy pages (needed for Razorpay KYC) | Yes |
| `/cart`, `/checkout` | Cart and guest checkout | No |
| `/order/{orderNo}?t={token}` | Order status, tracking, invoice, cancel | No |
| `/review?o={orderNo}&t={token}` | Verified-buyer review form | No |
| `/admin/*` | Admin | No |

- Archived products that once had a public page return a **301 redirect** to their category page. Draft products return 404.
- `robots.txt` disallows `/cart`, `/checkout`, `/order`, `/review`, `/admin`, `/api`.
- The existing `@astrojs/sitemap` keeps covering static pages; `/sitemap-store.xml` (dynamic) is added to the sitemap index.

---

## Data Model (D1)

All money is stored as **integer paise** with a `currency` column (`'INR'`). Prices are **GST-inclusive**. Timestamps are ISO-8601 UTC text.

### `categories`
`id`, `slug` (rice | spices | produce), `name`, `intro`, `seo_title`, `seo_description`, `google_product_category`, `sort`.

### `products`
| Field | Notes |
|---|---|
| `id`, `slug` (unique per category), `category_id` | |
| `name`, `short_description`, `description_md` | |
| `status` | `draft` · `active` · `archived` |
| `organic_status` | `none` · `in_conversion` · `pgs` · `npop` |
| `organic_cert_number`, `organic_cert_r2_key`, `allow_in_conversion_label` (bool) | The label is only shown if the certification body permits it |
| `process_badges` (JSON array) | e.g. `["stone_ground","unpolished","sun_dried","hand_harvested"]` |
| `how_its_made` (JSON) | method, grinding temperature, drying method, batch size, milling level, free-text story |
| `harvest_info` (JSON) | harvest season, last milled/ground date, "packed within N days" |
| `attributes` (JSON) | origin, shelf life, storage, grain type, etc. (rendered as a spec list) |
| `faq` (JSON array of {q, a}) | Rendered on the page and as FAQ data |
| `hsn_code`, `gst_rate_bp` | GST rate in basis points (500 = 5%) |
| `perishable` (bool), `cod_allowed` (bool, default true) | |
| `season_start_md`, `season_end_md` (`MM-DD`, nullable) | Null means always in season; supports windows that wrap the year end |
| `off_season_mode` | `notify` · `preorder` |
| `preorder_dispatch_date` (nullable) | |
| `seo_title`, `seo_description` (nullable) | Generated automatically when null |
| `related_product_ids` (JSON) | Optional manual picks; otherwise same category |
| `created_at`, `updated_at`, `published_at` | |

### `variants`
`id`, `product_id`, `sku` (unique), `label` ("5 kg", "1 dozen · Large"), `price_paise`, `mrp_paise`, `currency`, `weight_g`, `length_cm`, `breadth_cm`, `height_cm`, `stock_qty`, `low_stock_threshold`, `active`, `sort`.

### `product_images`
`id`, `product_id`, `r2_key`, `alt` (required), `sort`. The first image is used as the Open Graph and feed image.

### `lab_reports`
`id`, `product_id`, `batch_code`, `tested_on`, `lab_name`, `summary` (JSON: e.g. curcumin %, volatile oil %, pesticide residue "not detected"), `pdf_r2_key`, `visible`.

### `orders`
| Field | Notes |
|---|---|
| `id`, `order_no` (`HL-YYMM-NNNN`), `view_token_hash` | The view token is an HMAC; only its hash is stored |
| `status` | `pending_payment` · `payment_failed` · `placed` · `packed` · `shipped` · `delivered` · `cancelled` · `rto` · `refunded` |
| `payment_method` (`razorpay` · `cod`), `payment_status` (`unpaid` · `paid` · `refunded` · `partially_refunded`) | |
| `customer_name`, `email`, `phone` | |
| `ship_line1`, `ship_line2`, `ship_city`, `ship_state`, `ship_state_code`, `ship_pincode` | Delivery state decides CGST+SGST vs IGST |
| `subtotal_paise`, `discount_paise`, `cod_fee_paise`, `gst_paise`, `total_paise`, `currency` | |
| `coupon_code` (nullable) | |
| `is_preorder`, `expected_dispatch_date`, `ready_to_dispatch` | |
| `razorpay_order_id`, `razorpay_payment_id` | |
| `shiprocket_order_id`, `shiprocket_shipment_id`, `awb`, `courier`, `tracking_url`, `sync_state` (`ok` · `needs_sync`) | |
| `invoice_no`, `invoice_r2_key` | |
| `created_at`, `updated_at` | |

### `order_items`
A snapshot of each line at the moment the order is placed: `order_id`, `variant_id`, `product_name`, `variant_label`, `sku`, `hsn_code`, `gst_rate_bp`, `unit_price_paise`, `qty`, `discount_paise`, `taxable_paise`, `cgst_paise`, `sgst_paise`, `igst_paise`, `line_total_paise`, `perishable`. Later product edits never change past orders.

### Supporting tables
- `order_events`: `order_id`, `at`, `type`, `actor` (`customer` · `admin` · `razorpay` · `shiprocket` · `system`), `note`.
- `stock_reservations`: `id`, `variant_id`, `order_id`, `qty`, `expires_at`, `released` (bool).
- `coupons`: `code` (unique, case-insensitive), `type` (`percent` · `flat`), `value`, `max_discount_paise`, `min_order_paise`, `starts_at`, `ends_at`, `usage_limit`, `used_count`, `one_per_phone` (bool), `category_ids` (JSON, nullable), `active`.
- `coupon_redemptions`: `coupon_code`, `order_id`, `phone`.
- `reviews`: `id`, `product_id`, `order_id`, `rating` (1–5), `title`, `body`, `display_name`, `city`, `status` (`pending` · `approved` · `rejected`), `created_at`; unique per (`order_id`, `product_id`).
- `notify_requests`: `product_id`, `email`, `created_at`, `notified_at`.
- `credit_notes`: `id`, `credit_note_no`, `order_id`, `amount_paise`, tax breakdown, `reason`, `r2_key`, `created_at`.
- `invoice_counters`: `series` (`invoice` · `credit_note`), `fy` (`26-27`), `last_no`.
- `webhook_events`: `source`, `event_id` (unique), `received_at`, used to ignore duplicate webhooks.
- `settings`: key → value (`gstin`, `legal_name`, `address`, `state_code`, `fssai_license`, `cod_fee_paise`, `cod_max_order_paise`, `invoice_prefix`, `notify_email`, `low_stock_email`).

### Stock reservation
- Checkout reserves stock using a conditional update, `UPDATE variants SET stock_qty = stock_qty - ? WHERE id = ? AND stock_qty >= ?`, inside the same D1 batch that creates the order, the reservation rows and the coupon redemption. If any line cannot be reserved, the whole batch fails and the shopper sees which item is short.
- COD orders: the reservation is turned into a sale straight away.
- Online orders: the reservation expires after **30 minutes**. The cron job releases expired reservations (adds the stock back) and marks the order `payment_failed`.
- Cancellations add stock back. RTO adds stock back **only for non-perishable lines**; perishable lines are recorded as a write-off.

---

## Product Availability Rules

A pure function `availability(product, variant, today)` returns one of:

| State | Condition | Buy box shows |
|---|---|---|
| `buy` | active, in season (or no season), stock > 0 | Add to cart |
| `sold_out` | in season, stock = 0 | "Sold out" + Notify me |
| `preorder` | out of season, `off_season_mode = preorder`, dispatch date set, stock > 0 | Pre-order · "Dispatches from {date}" |
| `notify` | out of season, `off_season_mode = notify` (or pre-order without stock/date) | Notify me when in season |

Pre-order items and ship-now items **cannot be in the same cart**. Adding one to a cart that holds the other asks the shopper to check out separately.

---

## Storefront Pages

### Product page — Layout C (Hybrid)

1. **Header + breadcrumb**: Home › Category › Product.
2. **Above the fold (light)**: gallery (main image + thumbnails, a harvest/process badge on the image) | buy box: category chip, H1 name, one-line summary, rating line (*only if ≥1 approved review*), price + struck-through MRP + % off, "Inclusive of all taxes · Free shipping across India", variant chips showing per-kg price, quantity stepper, Add to cart, pincode check (serviceability + estimated delivery date + COD availability), trust row (process badges, Free delivery, COD), organic status line, lab-tested badge (when a visible lab report exists).
3. **Dark "From our farm" bento band** (existing `#0c110c` design language): How it's grown / How it's made (from `how_its_made`), nutrition, why this process matters, cook / store, linked recipe, harvest & batch freshness, lab report summary + PDF link.
4. **Reviews**: only when approved reviews exist.
5. **FAQ** (`<details>`), from `products.faq`.
6. **You may also like**: related products.
7. **Mobile**: sticky bottom bar with price, variant and Add to cart.

Reference mockup: `docs/superpowers/specs/assets/2026-10-18-product-page-mockup.html` (switch to tab **C · Hybrid**; prices, ratings and reviews in it are sample data). It uses the existing Tailwind tokens, Manrope and the dark bento styles from `/rice` and `/spices`.

### Category pages (`/rice`, `/spices`, `/produce`)
- Keep the existing hero and story sections.
- Insert a **product grid** right after the hero (cards: image, name, process badges, "from ₹X", availability badge).
- Remove the "Online Ordering — Coming Soon" badge and replace `WaitlistForm` with real product cards. The produce bulk-request form stays for B2B.
- `/produce` keeps its bento catalogue design; cards link to product pages.

### `/shop`
All active products in a grid, with category chips and process/season filter chips (client-side filtering of server-rendered cards; no JS needed to see the products).

### Header
Add `Shop` to the navigation and a cart icon with an item count (React island reading localStorage).

---

## SEO

### Positioning and keyword targets

| Keyword group | Examples | Content asset |
|---|---|---|
| Heritage rice | "Karjat 3 rice", "Wada Kolam rice buy online", "unpolished red rice Maharashtra" | Product pages + `/rice` + "polished vs unpolished rice" recipe/blog |
| Farm-direct mangoes | "Alphonso mango direct from farm", "Kesar mango online Mumbai", "carbide-free mangoes" | Product pages + seasonal landing copy on `/produce` + "how to tell naturally ripened mangoes" post |
| Traditionally made spices | "stone ground turmeric powder", "cold ground chilli powder", "high curcumin turmeric", "turmeric with natural oils" | Product pages with grinding temperature + lab reports + "stone ground vs machine ground" post |
| Fresh produce | "chemical-free vegetables Mumbai", "dragon fruit online" | Product pages + `/produce` |

Trust signals for Google and shoppers (first-hand experience and expertise): `/our-process` page, farm/farmer story, process detail per product, harvest/grind dates, batch lab reports, organic status shown honestly.

### Organic wording (compliance)

A single helper, `organicCopy(product)`, decides every organic-related word on the page, in titles, badges, the feed and product data:

| `organic_status` | Wording |
|---|---|
| `none` | "Naturally grown · Chemical-free · Traditionally made"; never "organic" |
| `in_conversion` | As above + "Organic certification in progress"; "Organic in conversion" only if `allow_in_conversion_label` |
| `pgs` / `npop` | "Organic" + the matching logo + certificate number |

**Existing copy to fix in this release**: `/rice` and `/produce` currently say "100% Organic", "organically grown", and the title "Organic Rice | HariLeaf Farm". Reword to match the current `in_conversion` status.

**Health claims**: FAQ and descriptions state nutrition facts ("higher fiber than polished rice") and never disease claims ("good for diabetics"), in line with FSSAI advertising and claims rules. The admin product editor shows this guidance next to the FAQ and description fields.

### On-page, per product
- Title: `seo_title`, or generated as `{Name}, {default variant} | {organic/process phrase} | HariLeaf`.
- Meta description: `seo_description`, or generated from `short_description`.
- Canonical: the product URL (variants never get their own URLs).
- Open Graph / Twitter: first product image.
- Structured data via the existing `JsonLd.astro`:
  - `Product` with an `Offer` per variant: `price`, `priceCurrency: INR`, `availability` (InStock / PreOrder / OutOfStock), `shippingDetails` (free, IN), `hasMerchantReturnPolicy`.
  - `aggregateRating` + `review`: **only when approved reviews exist**.
  - `BreadcrumbList`, `FAQPage` (from `faq`).
- Images: required alt text, responsive sizes via Cloudflare image resizing, lazy-loaded below the fold.

### Site-wide
- `/sitemap-store.xml`: categories, active products (with `lastmod`), recipes.
- `/feeds/google.xml`: Merchant Center RSS 2.0 feed, one item per active variant: `g:id` = SKU, `g:item_group_id` = product id, title, description, link, image, price, availability, `g:brand` HariLeaf, `g:identifier_exists` no, `g:google_product_category` from the category, free shipping.
- `Organization` + `WebSite` data on the homepage (if not already present).
- Internal links: category ↔ product ↔ recipe ↔ `/our-process`.
- Performance budget: Lighthouse mobile ≥ 95; only the cart icon, Add to cart, pincode check and checkout run JavaScript.

### Recipes (`/recipes`)
A Keystatic collection `recipes`: title, slug, hero image, summary, ingredients, steps (Markdown), prep/cook time, `productsUsed` (product slugs). Prerendered with `Recipe` structured data and plain HTML links to each `productsUsed` product page (slugs are known from content, so links are crawlable). A small island loads the buyable cards (image, price, Add to cart) from `GET /api/store/products?slugs=…` in the browser, because prerendered pages can't read D1 during the build.

---

## Cart and Checkout

### Cart
- Stored in localStorage as `[{variantId, qty}]` only. Prices are never stored on the client.
- A cart drawer island + `/cart` page call `POST /api/store/cart/quote` → current prices, stock, availability, COD eligibility, line errors.

### Checkout (`/checkout`, single page)
1. Contact: name, 10-digit mobile, email.
2. Address: **pincode first** → city/state auto-filled; Shiprocket serviceability check (express coverage for perishables). Lines that can't be delivered are flagged and block checkout until removed.
3. Coupon.
4. Payment: *Pay online* or *Cash on delivery (+ COD fee)*. COD is hidden if any line has `cod_allowed = false` or the total exceeds `cod_max_order_paise`.
5. Summary: lines, discount, COD fee, GST included, shipping "Free", total.

If the quote changes between cart and submit (price, stock, coupon expiry), the server returns `409` with the new quote, and the UI shows "Price updated" or "Only N left" for the shopper to confirm.

### Online payment flow
1. `POST /api/store/checkout` → re-quote → D1 batch: order (`pending_payment`) + items + reservations + coupon redemption → Razorpay Orders API → returns `razorpay_order_id`.
2. Razorpay checkout.js opens (UPI / cards / netbanking).
3. On success, the browser posts `{razorpay_payment_id, razorpay_order_id, razorpay_signature}` to `POST /api/store/checkout/verify` → HMAC check → mark paid.
4. Webhook `payment.captured` → `POST /api/webhooks/razorpay` (signature-verified) → mark paid.
5. Steps 3 and 4 can safely run in either order and more than once. "Mark paid" only moves `pending_payment` → `placed` once, then: confirm reservations, assign invoice number + PDF, send email, push to Shiprocket (unless pre-order).
6. Payment failure or closing checkout: the order stays `pending_payment` until the reservation expires (30 min) → `payment_failed`, stock released. The order page offers "Retry payment" while the order is still pending.

### COD flow
`POST /api/store/checkout` with `payment_method: cod` → re-quote → D1 batch (order goes straight to `placed`) → invoice → email → Shiprocket push (COD amount = total).

### Pre-orders
- A separate cart (see Availability Rules). The order stores `is_preorder` and `expected_dispatch_date`.
- Not pushed to Shiprocket until the admin marks it **Ready to dispatch**, which also sends the "ready to dispatch" email.
- Same payment options and COD rules as normal orders.

### Order page (`/order/{orderNo}?t={token}`)
Status timeline, items, totals, tracking link, invoice / credit-note downloads, **Cancel order** (allowed while `placed` and not `packed`), and **Retry payment** (while `pending_payment`).

---

## Orders and Fulfilment

### Status transitions
```
pending_payment → placed → packed → shipped → delivered → (refunded)
      │             │         │         │
payment_failed  cancelled  cancelled   rto
```
Every transition is written to `order_events`. Transitions are enforced by a single `transition(order, to, actor)` function; any change outside it is rejected.

### Shiprocket
- On `placed` (not pre-order): create the Shiprocket order (items, weight and box size from variants, COD amount). On failure, set `sync_state = needs_sync`; the cron job retries every 15 min and admin shows a manual Retry.
- Admin **"Packed → Book courier"**: assign AWB (Shiprocket recommended courier), generate label, request pickup; label PDF downloadable.
- Webhook `POST /api/webhooks/shiprocket` (token-verified) maps courier statuses → `shipped` / `delivered` / `rto`, sets `tracking_url`.
- Perishable orders are sorted first in admin with a "ship within 24h" flag.

### GST invoices
- Issued when an order becomes `placed` (COD) or paid (online). PDF generated in the Worker (a library that runs in Workers, e.g. `pdf-lib`) and stored in R2.
- Contents: legal name, GSTIN, address, state code, FSSAI licence no.; invoice no. from a **gapless per-financial-year series** (`HL/26-27/00042`, assigned inside the D1 batch); invoice date; billing and shipping address; place of supply; lines with HSN, qty, unit price, discount, taxable value, GST rate, CGST + SGST (delivery state = seller state) or IGST (otherwise); totals; amount in words.
- GST is backed out of the GST-inclusive price per line: `taxable = round(line_after_discount × 10000 / (10000 + rate_bp))`, tax = line − taxable, split into CGST and SGST halves (any odd paise goes to SGST).
- Cancellation or refund after invoicing → **credit note** (own series `HL/CN/26-27/00003`). Invoices are never changed or deleted.
- Suggested defaults (owner to confirm with their CA): rice HSN 1006 @ 5% (pre-packaged and labelled), turmeric powder 0910 30 @ 5%, chilli powder 0904 22 @ 5%, fresh mangoes 0804 50 @ 0%, other fresh fruit/vegetables @ 0%.

### Cancellations, refunds, RTO
- Customer cancel (before `packed`): online orders are refunded in full via the Razorpay Refunds API; COD orders just close; stock is restored; credit note issued.
- Admin cancel or refund at any stage, full or partial, with a reason → Razorpay refund (online) → credit note → email.
- RTO: non-perishable stock restored; perishable lines recorded as a write-off; the order is labelled "RTO – write-off" in admin, and the dashboard shows the monthly RTO count and value.

### Emails (Resend, from `orders@harileaf.org`)

| To | Trigger |
|---|---|
| Customer | Placed (with invoice link) · Shipped (tracking) · Delivered (with review link) · Cancelled / Refunded (credit note) · Pre-order ready to dispatch |
| Notify-me sign-ups | Product becomes buyable (back in season / restocked); each request is notified once |
| Owner | New order (perishables flagged) · Shiprocket sync failed · Stock at or below the low-stock threshold |

Email sends are logged in `order_events`. Failures are retried by the cron job, can be resent from admin, and never block an order.

---

## Admin

Split the current single-file `src/pages/admin.astro` (506 lines, inline scripts) into separate pages under a shared `AdminLayout.astro` that reuses the existing passphrase session (`src/lib/auth.ts`).

| Page | Contents |
|---|---|
| `/admin` | Dashboard: today's orders & revenue, to pack, perishables to ship today, needs-sync, low stock, pending reviews, RTO this month |
| `/admin/orders`, `/admin/orders/[id]` | List with filters (status, payment, perishable, pre-order). Detail: timeline, customer, items, totals, invoice/credit notes, Book courier, label, Ready to dispatch, Cancel / Refund, Resend email |
| `/admin/products`, `/admin/products/[id]` | List (status, stock, season). Editor (React island): basics, organic status + certificate upload, process badges, How it's made, harvest info, attributes, FAQ (with health-claims guidance), lab reports, SEO fields with live title/description preview, photos (drag to reorder, alt required), variants (SKU, label, price, MRP, weight, box size, stock, low-stock threshold, active), season window + off-season mode + pre-order date, COD switch, GST rate + HSN, status |
| `/admin/coupons` | Create / edit / disable; usage counts |
| `/admin/reviews` | Pending queue with order context; approve / reject |
| `/admin/settings` | GSTIN, legal name, address, state code, FSSAI licence, COD fee, COD limit, invoice prefix, notification emails |
| `/admin/photos`, `/admin/content` | Existing photo strip & produce-page content tools, moved without changes in behaviour |

Each admin write clears the affected edge-cache URLs (see Rendering and caching).

---

## Coupons

- `percent` (optionally capped by `max_discount_paise`) or `flat`.
- Optional: minimum order, start/end dates, total usage limit, one per phone number, category restriction.
- Validated only on the server, during quote and checkout. The discount is spread across eligible lines in proportion to their value (any rounding difference goes to the largest line), before the GST back-out.
- `used_count` and `coupon_redemptions` are written in the order-creation batch. For online orders that end in `payment_failed`, the redemption is reversed.

---

## Reviews

- The delivered email includes `/review?o={orderNo}&t={token}`; the form lists each product in the order.
- Rating 1–5, title, body, display name (default: first name + city).
- One review per (order, product); status `pending` until approved in admin.
- A product with no approved reviews renders **no** rating line, reviews section or rating data.
- Rating data (`aggregateRating`) uses only approved reviews.

---

## Notify Me

- `POST /api/store/notify` stores `{productId, email}`, ignoring duplicates per product + email. Turnstile protects against bots (already used on the contact form).
- When a product's availability changes from `notify` / `sold_out` to `buy` or `preorder`, the cron job emails everyone not yet notified and sets `notified_at`.

---

## Security

- `/api/admin/*` and `/admin/*`: existing session cookie (`HttpOnly; Secure; SameSite=Strict`) checked on every request.
- Order and review tokens: random tokens; only an HMAC hash (`ORDER_TOKEN_SECRET`) is stored; compared in constant time.
- Razorpay: payment signature check (HMAC-SHA256 with the key secret) and webhook signature check (`X-Razorpay-Signature` with the webhook secret).
- Shiprocket webhook: shared-token header check.
- Webhook events are stored by event ID, so duplicates are ignored.
- Store APIs: Cloudflare rate-limiting rules on `/api/store/checkout*`, `/api/store/notify`, `/review`.
- All inputs validated on the server (phone, pincode, email, quantities 1–20 per line, cart ≤ 20 lines).
- No card data ever touches HariLeaf servers (Razorpay-hosted checkout).

---

## Error Handling

| Situation | Behaviour |
|---|---|
| Stock short at checkout | D1 batch fails as a whole → 409 with the short lines → UI shows "Only N left" |
| Price / coupon changed since quote | 409 with the new quote → shopper confirms |
| Razorpay order creation fails | The D1 batch (order + reservations) has already been committed, so the order is immediately set to `payment_failed`, reservations are released and any coupon redemption is reversed → "Payment couldn't start, please retry" |
| Paid but browser closed before verify | Webhook marks it paid; the email still goes out |
| Webhook arrives twice / out of order | Duplicates ignored by event ID; state transitions only move forward |
| Payment captured after the reservation expired | Re-reserve if stock allows; otherwise automatic full refund + apology email + admin alert |
| Shiprocket API down | Order `placed` with `needs_sync`; cron + manual retry |
| Resend down | Logged; cron retry; manual resend |
| Pincode service down | Allow checkout with a "delivery confirmed after order" note for non-perishables; block perishables |

Logging: structured `console.log` JSON with `order_no`, viewable in Cloudflare Workers logs.

---

## Testing

New test setup (the repo has none today):

- **Vitest unit tests**: money/GST maths (back-out, CGST/SGST/IGST split, odd-paise handling), coupon rules and spreading discounts across lines, invoice numbering per financial year, `availability()` incl. year-wrapping seasons, COD eligibility, `organicCopy()`, title/meta generation, order status `transition()` rules.
- **Integration tests** with `@cloudflare/vitest-pool-workers` (real local D1): checkout API, simultaneous reservations of the last unit, reservation expiry cron, Razorpay verify + webhook (valid / invalid signature / duplicate), Shiprocket webhook mapping, cancel → refund → credit note.
- **Playwright end-to-end tests** against `astro dev` with Razorpay **test mode** and a mocked Shiprocket: browse → cart → online payment; COD; coupon; pre-order separate cart; notify-me; customer cancel; mobile sticky bar; reviews hidden with 0 approved reviews.
- **SEO checks**: JSON-LD validated (schema snapshot tests + Rich Results Test before launch), feed XML validated against the Merchant Center spec, Lighthouse CI on mobile ≥ 95 for a product page and `/shop`.
- CI (`.github/workflows/ci.yml`): add `npm test` (unit + integration) next to `astro check` and build; end-to-end tests run on PRs labelled `e2e` and before release.

---

## Build Order

One launch, built in this order:

1. **Foundation**: D1 database + migrations, `wrangler.toml` binding + cron, `src/lib/store/` (money, GST, availability, organic copy, status transitions) with unit tests, `AdminLayout` + admin split (existing tabs moved over), policy pages.
2. **Catalog**: product/category admin, product page (Hybrid), category grids, `/shop`, header cart icon, SEO (meta, JSON-LD, sitemap, feed, robots), `/our-process`, Keystatic recipes, rewording existing copy for compliance.
3. **Checkout**: cart island + quote API, pincode serviceability, checkout page, Razorpay online flow, COD flow, reservations + cron, coupons.
4. **Orders**: admin orders, invoices + credit notes (PDF → R2), Shiprocket push / book courier / webhook, emails, cancellations & refunds, RTO handling.
5. **Engagement**: reviews, notify-me, pre-orders + ready-to-dispatch.
6. **Hardening**: end-to-end tests, a load test of checkout, Lighthouse CI, security review, launch checklist.

---

## Owner Launch Checklist (outside the codebase)

- [ ] Razorpay account + KYC (policy pages must be live first)
- [ ] Shiprocket account, pickup address, KYC, COD remittance bank account
- [ ] Resend account + DNS verification for `harileaf.org`
- [ ] Google Merchant Center account linked to Search Console
- [ ] FSSAI licence number (shown on product pages and invoices)
- [ ] Final prices, MRPs, HSN codes and GST rates per product (confirm with CA)
- [ ] ≥3 real photos per product; lab reports where available
- [ ] Organic certification status per product; certificates as they arrive
- [ ] Refund / shipping policy wording approved (especially perishables and COD refusals)
