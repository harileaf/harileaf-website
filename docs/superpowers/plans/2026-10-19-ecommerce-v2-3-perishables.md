# E-commerce V2-3 — Perishables, Delivery Zones, Dispatch Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Each task: failing test → see it fail → implement → see it pass → commit.

**Goal:** Sell perishables (launch: Kesar mango, Mumbai MMR only) to pincodes inside an enabled delivery zone with an express courier within the zone's transit limit, prepaid only, checked out separately from other goods, with dispatch days and blackout dates (spec: v2 Features → Perishables and delivery zones; SEO §3.1–3.4).

**Architecture:**
- **`zones.ts`** (pure functions plus a settings loader):
  - zone definitions (setting `delivery_zones`: JSON `[{ id, name, pincodes: ['400', '4011'…], expressOnly, maxTransitDays, enabled }]`; entries are full 6-digit pincodes or prefixes);
  - `zoneFor(product, zones)` and `pincodeInZone`;
  - `pickCourier(couriers, zone)`: express-only means air (`is_surface === false`), and the ETA must be ≤ `maxTransitDays`;
  - the dispatch calendar (`dispatch_days` ISO weekdays, `dispatch_blackouts` dates, `dispatch_cutoff_hour` IST) → `nextDispatch(now)` and a delivery window.
- **Availability**: a perishable whose zone is missing or disabled is `notify`, so it can't be bought anywhere, its feed/JSON-LD say out of stock, and its notify-me form shows. `products.delivery_zone` stores `{"zone":"<id>"}`.
- **Cart groups**:
  - Every quote line has a `group` (`perishable` | `regular`; V2-4 adds `preorder`). A quote with more than one group is not ok (`mixed`), and the server refuses it.
  - The cart explains why and offers "Check out X now". The other group moves to a visible "Saved for your next order" list (`hl_cart_later_v1`) and comes back to the cart after the order is placed. Nothing is dropped silently.
- **Checkout for perishables**:
  - pincode in an enabled zone, plus a Shiprocket express courier within the transit limit;
  - fails closed if Shiprocket is unreachable;
  - COD hidden and refused (cod_allowed is already false);
  - shows the expected dispatch date and delivery window.
- **Product page**: the buy box gets a pincode check for perishable products that states the result in plain words (zone, courier, dispatch day).
- **SEO**:
  - JSON-LD keeps `MerchantReturnNotPermitted`, and drops `shippingDetails` for zone-limited products (Google Search supports postal-code shipping regions only for AU/CA/US, so all-India free shipping would be false).
  - The feed sends one `g:shipping` per zone pincode/prefix (`400*` form; Merchant Center supports postal codes for India), with transit times.
  - URLs stay permanent.
- **Policies** (rendered from settings): the shipping policy lists the zones, transit limits and dispatch days; the refund policy covers no returns on perishables and damage on arrival with a photo within 24 h; the terms get one sentence.
- **Content**: `scripts/seed-v2-produce.sql` (a **draft** Kesar mango product with people-first copy, an FAQ including "how to tell naturally ripened mangoes", and the hay-ripening claim with an evidence note for the owner to complete); seasonal Kesar copy on `/produce`, linking to the product.

**Base branch:** `feat/ecommerce-v2-2-reviews-notify`. Branch: `feat/ecommerce-v2-3-perishables`.

## Tasks
- [ ] 1. `zones.ts` + unit tests: zone parsing/validation, pincode matching, courier pick (express, ETA), next dispatch (weekday, cutoff, blackouts), delivery window.
- [ ] 2. Settings: `delivery_zones`, `dispatch_days`, `dispatch_blackouts`, `dispatch_cutoff_hour` (validated; JSON may exceed the 500-character limit) + `/admin/settings` fields; product editor "Delivery zone" select for perishables.
- [ ] 3. Availability: a perishable needs an enabled zone (catalog + quote); unit test.
- [ ] 4. Quote groups + mixed-cart refusal; integration test. Cart UI split + "saved for later"; checkout restores it after the order.
- [ ] 5. Checkout API: zone + express courier check for perishables (fail closed); `/api/store/pincode?product=` zone verdict; integration test with a stubbed Shiprocket.
- [ ] 6. Checkout and product page: dispatch date and delivery window; buy-box pincode check for perishables.
- [ ] 7. JSON-LD (no `shippingDetails` for zone-limited products) + feed `g:shipping` per pincode prefix; one test each (feed XML shape extended).
- [ ] 8. Policies, terms, `/produce` copy, Kesar seed script; claims check on new copy.
- [ ] 9. Lighthouse CI: add a perishable product page. Gates + browser pass (1280 / 390). Spec notes, PR.
