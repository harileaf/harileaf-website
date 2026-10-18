# E-commerce M2 — Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Products configurable from `/admin` and published as SEO-led pages: product pages (Hybrid layout), SSR category grids on `/rice` and `/spices`, `/shop`, ProductGroup JSON-LD, `/sitemap-store.xml`, `/feeds/google.xml`, edge caching with global purge, `/our-process`, 2–3 recipe pages, and existing copy reworded to the claims policy (spec: Build Order → v1 → 2. Catalog).

**Architecture:** Reads go through `src/lib/store/catalog.ts` (pure row mapping + D1 queries); admin writes through `src/lib/store/catalog-admin.ts`, which validates with the claims policy and enqueues `cache.purge` outbox rows in the same batch. Public pages are server-rendered and cached at the edge by `src/lib/store/edge-cache.ts` (Workers Cache API) and purged by URL through the Cloudflare API. Public interactivity (variant picker, add to cart, header cart count) is plain TypeScript — no React on storefront pages; the admin product editor is a React island.

**Tech Stack:** Astro 6 SSR, D1, R2 (product images, lab-report PDFs, certificates), Workers Cache API + Cloudflare purge API, React 19 (admin only), Vitest in workerd.

**Base branch:** `feat/ecommerce` (M1). Branch: `feat/ecommerce-m2-catalog`.

---

## File structure

```
migrations/0002_catalog_indexes.sql        # indexes for catalog reads, outbox purge dedupe
src/lib/store/catalog.ts                    # types, row mappers, read queries
src/lib/store/catalog-admin.ts              # validation (claims, publish checklist) + writes + purge enqueue
src/lib/store/seo.ts                        # titles/meta, ProductGroup/Breadcrumb/FAQ JSON-LD
src/lib/store/feed.ts                       # Google Merchant Center RSS feed + store sitemap XML
src/lib/store/edge-cache.ts                 # cache wrapper + purge URL sets + cache.purge outbox handler
src/lib/store/urls.ts                       # canonical product/category URLs
src/pages/media/[...key].ts                 # R2 media (product images, lab PDFs, certificates)
src/pages/api/admin/products/*.ts           # admin product/variant/image/batch/lab-report APIs
src/pages/admin/products/index.astro        # product list
src/pages/admin/products/[id].astro         # editor shell
src/components/admin/ProductEditor.tsx      # React island editor
src/components/store/ProductCard.astro, ProductGrid.astro, BuyBox.astro, ProductPageView.astro, CartIcon.astro
src/scripts/store/cart.ts                   # localStorage cart (variantId, qty only)
src/scripts/store/buybox.ts                 # variant radiogroup, qty, add to cart, sticky bar sync
src/pages/{rice,spices,produce}/[slug].astro
src/pages/shop.astro, our-process.astro, recipes/index.astro, recipes/*.astro
src/pages/sitemap-store.xml.ts, feeds/google.xml.ts
scripts/seed-dev.sql                        # local-only sample catalog (never applied remotely)
tests/unit/{catalog,seo,feed,edge-cache,catalog-validate,cart}.test.ts
tests/integration/{catalog,catalog-admin}.test.ts
```

## Tasks

1. **Catalog read layer** — `catalog.ts`: `listProducts(db, {categorySlug?})` → cards (min active variant price/MRP, unit price, availability summary, first image, claims); `getProductPage(db, category, slug, today)` → `{kind:'ok', product, variants, images, batch, labReports, related}` | `{kind:'redirect', to}` | `{kind:'gone'}` | `{kind:'not_found'}`. Tests: mapping, drafts hidden, discontinued → 301/410, inactive variants hidden, availability per variant, related fallback to same category.
2. **SEO builders** — `seo.ts`, `feed.ts`, `urls.ts`: title/meta generation (banned-phrase safe), ProductGroup + per-variant Product/Offer (price, INR, availability, free shipping IN, return policy, `?v=sku` url), BreadcrumbList, FAQPage; `aggregateRating` only with approved reviews (none in v1); feed items per active variant (`g:price` = MRP, `g:sale_price` when lower, identifier_exists no, brand, condition, google category, free shipping); store sitemap. Tests with snapshot-style assertions + XML escaping.
3. **Edge cache + purge** — `edge-cache.ts`: `withEdgeCache(request, ctx, render)` for GET HTML/XML on catalog paths; `purgeUrlsForProduct()`; `cache.purge` outbox handler calling `POST /zones/{zone}/purge_cache {files}` in chunks of 30 (no-op + log when `CF_ZONE_ID`/`CF_PURGE_API_TOKEN` unset). Tests with fetch mock.
4. **Admin writes** — `catalog-admin.ts` + APIs: create/update product (claims validation on every text field via `findBannedPhrases` + `validateProcessClaims` with `organicCopy().mayUseOrganic`), publish checklist (≥1 active variant, ≥1 image, HSN, best-before, ingredients, storage, net quantity), variants upsert (deactivate instead of delete), images (R2 upload ≤ 5 MB, alt required, reorder), batches (one active) + lab reports (PDF to R2), certificate upload; every write enqueues `cache.purge` for affected URLs and drains it in the request. Tests (integration).
5. **Media route** — `/media/[...key]`: serves only `products/`, `lab-reports/`, `certificates/` prefixes from R2 with `Cache-Control: public, max-age=31536000, immutable` and correct content type.
6. **Admin UI** — `/admin/products` (list: status, stock, current batch, missing-for-publish) and `/admin/products/[id]` with `ProductEditor.tsx` (sections: basics, compliance, claims & story, nutrition, FAQ, SEO preview, variants, images, batches & lab reports, status). Nav gets "Products".
7. **Storefront** — `ProductPageView` (Hybrid: gallery, buy box, proof line, product information block, dark "From our farm" bento, FAQ, related, sticky mobile bar), `BuyBox` script (radiogroup with arrow keys, spinbutton, add to cart → `hl_cart_v1`, aria-live), `CartIcon` in the header, `/rice/[slug]`, `/spices/[slug]`, `/produce/[slug]`, `/shop` with filter chips.
8. **Category pages** — `/rice`, `/spices` → SSR (edge-cached), live product grid after the hero, waitlist and "Coming soon" removed; `/produce` keeps waitlist + bulk form (perishables are v2) but its copy is reworded.
9. **Content** — `/our-process`; 3 static recipes (`/recipes/konkan-masoor-khichdi`, `/recipes/red-rice-pulao`, `/recipes/haldi-doodh`) with Recipe JSON-LD linking to products; reword `/rice`, `/spices`, `/produce`, homepage teaser and KV content defaults to the claims policy (no "organic", "chemical-free", disease/health benefit claims; unverified percentages softened).
10. **SEO endpoints & robots** — `/sitemap-store.xml`, `/feeds/google.xml` (edge-cached, purged on writes); `robots.txt` disallows `/cart`, `/checkout`, `/order`, `/review`, adds the store sitemap.
11. **Verify & PR** — `astro check`, `npm test`, build, browser run-through with `scripts/seed-dev.sql`, Rich Results-shaped JSON-LD check; PR against `feat/ecommerce`.
