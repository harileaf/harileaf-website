# Rice & Turmeric Story Pages — Design Spec

**Date:** 2026-10-20
**Status:** Revised after two-model review (2026-10-20) · awaiting owner review
**Branch:** `feat/rice-turmeric-pages` (from `main` @ `e7ed66d`)
**Builds on:** [E-commerce design](2026-10-18-ecommerce-design.md) (claims policy, catalog, edge cache, admin), [Rice & spices pages](2026-08-23-rice-spices-pages-design.md) (honest-claims research)
**Mockups:** `.superpowers/brainstorm/38284-1792493406/content/` (git-ignored): `turmeric-a-detailed.html` (right column, "Recommended"), `rice-wada-kolam.html`, `landing-pages.html`

---

## Review Changes

A two-model review (Codex + Antigravity, moderated by Claude) checked this spec against the code. The debate is in `~/.claude-octopus/debates/session_01Y2zppyESNgVGq4M413PM1D/001-rice-turmeric-pages-spec/` (`synthesis.md`). What changed:

- **Fixed templates instead of a section builder.** Landing pages have a fixed section order per page. Their story blocks (timeline, comparison, grower, use, origin) come from a linked product's story rather than from a second copy, so there's one place to edit and nothing drifts.
- **Drafts save freely; live writes still block.** Page drafts accept incomplete or unchecked copy and show warnings. Publish enforces the claims rules. Product and story saves still block, because they're live straight away (no published snapshot, `catalog-admin.ts:362–372`).
- **Published pages are re-checked when product evidence changes.** A product save that would make a published page's wording unsupported is blocked, and the message names the page and the wording.
- **Claims context.** Page-wide copy keeps the strict "every linked product" rule. Wording about one product is allowed only inside that product's card or attributed section. `/spices` free text is always checked in the strictest context.
- **GI sweep.** Every place that uses the GI wording or the name "Wada Kolam" is listed in [GI sweep](#gi-sweep), including frozen product slugs.
- **Simpler purges.** `productPurgePaths()` stays synchronous and adds `/turmeric` for spices products. The `story_pages.product_ids` column and the `json_each` lookup are gone. Publishing also purges the sitemap.
- **Preview that works.** Pages preview the saved draft over GET. The product story previews its unsaved state through a form POST with `target=_blank`.
- **Cut or deferred:** the infographic artwork (now a separate design task), GI certificate upload, discard draft, "saved/published by", the Google snippet preview, the brand-name warning, and the ≥ 40-character alt-text blocker.
- **Corrections:** `publishChecklist()` entries block saves rather than warn (`catalog-admin.ts:199`). `nutrition.source` is optional today. `/media` doesn't serve `photos/` keys. Notify-me needs an active product. The proof line must not fall back to an older lab report. The timeline needs its own place outside the 3-column bento.

---

## Overview

Turn the rice and turmeric pages into story-led pages in the spirit of Two Brothers Organic Farms, but built on evidence (batch lab reports, process steps, grower) and compliant with the store's claims policy. Five pages change:

| Page | Today | After |
|---|---|---|
| Turmeric product pages (`/spices/<slug>`: powder, whole fingers) | Generic product layout | Product layout + story sections (approved "Recommended" layout) |
| Rice product pages (`/rice/<slug>`; Kolam rice from Wada first) | Generic product layout | Same story sections + rice differences |
| `/turmeric` | Doesn't exist | New story-led landing page |
| `/rice` | Hard-coded Astro page | Reworked landing page from a fixed template |
| `/spices` | Hard-coded page for turmeric + chilli | Short hub: Turmeric card → `/turmeric`, Red chilli card, stone-grinding note |

**The words, photos and steps on these pages are edited in the admin portal (`/admin`)** and stored in D1. Product stories are claims-checked on save. Landing pages are claims-checked on publish, previewable from their saved draft, and purged from the edge cache on publish. The layouts themselves are code. Keystatic is not used: in production `/keystatic` can't write (local file storage; Workers can't write `src/content`).

### Goals

1. Story sections that sell on proof: proof line, process timeline, stone-ground vs industrial (and unpolished vs polished) comparison, batch lab results, origin story, grower card, how to cook/use.
2. The owner can edit every word, photo, step and row from `/admin`, with preview, without a deploy. Section order and layout are fixed in code.
3. Every new text field passes `findBannedPhrases()`; certification wording only via `organicCopy()`; GI wording and GI names only with an authorised-user registration number.
4. Text Google and screen readers can read: infographics are a supplement, never the only home of a fact.

### Non-goals

- No change to cart, checkout, payments, orders or product JSON-LD (`productGroupJsonLd`).
- No new red chilli landing page.
- No video, no multi-language, no A/B testing.
- No page builder: pages can't add, remove or reorder section types (sections can be hidden).
- **No infographic artwork in this work.** The two infographics per product are a separate design task (see [Gallery infographics](#gallery-infographics)). The pages are complete without them.
- Recipes and `/learn` articles stay in `src/content/store/*.ts` (read-only content shipped with the code).

---

## Decisions Made

| Question | Decision |
|---|---|
| Layout | Approach A (story as real page sections). Two infographic gallery slides per product come later from the design task; the comparison image slot beside the table stays optional |
| Turmeric landing URL | New `/turmeric`; `/spices` becomes a hub |
| Turmeric certification | **PGS-India Organic** certificate covers this farm and the turmeric crop (powder and whole fingers) → `organic_scheme = 'pgs_organic'` + certificate number; "organic" allowed on both turmeric products and `/turmeric` |
| Rice certification | Applied, awaiting → `organic_scheme = 'none'`; "organic" never shown for rice; badge appears automatically once the certificate is entered |
| Rice practices (owner) | No synthetic inputs · traditional method 30+ years · hand-harvested & sun-dried · single-pass milling · Kolam rice grown in Wada (GI region; owner not a registered authorised user) |
| Turmeric practices (owner) | No synthetic inputs · boiled & sun-cured · stone-ground cool · curcumin lab-tested · oil retention is the key story |
| Where content lives | **D1**, not KV or Keystatic (see [Storage](#storage-d1)) |
| Who edits | Owner in `/admin`: a **Story** editor on each product; a new **Pages** section for the three landing pages |
| Landing pages | Fixed templates; story blocks come from one linked product ("Story from"); page-owned fields only for hero, SEO, card blurbs, facts, lab-table columns, FAQ, closing |

---

## Page Anatomy

Section names below are the shared **section kit** ([next chapter](#shared-section-kit)). Each section renders only when it has content, so a half-filled page never shows empty boxes.

### 1. Turmeric product page (`/spices/<slug>`) — approved "Recommended" layout

1. **Gallery + buy box** (existing `ProductPageView` + `BuyBox`), with additions:
   - Gallery order: hero photo → (later) comparison infographic → (later) process infographic → other photos. The owner sets the order; infographics are normal `product_images` rows with `kind = 'infographic'`.
   - **Proof line** under the name: `Curcumin X.X % · volatile oil X.X % · lab-tested every batch`. Lab values come from the **active batch's** linked, visible lab report only. If there isn't one, lab items are hidden; the proof line never uses the older-report fallback the lab card uses today (`ProductPageView.astro:51`, `batch?.labReport ?? labReports[0]`).
   - **Certification line** from `organicCopy()`: "Certified organic (PGS-India Organic) · Certificate ####".
   - **Icon row** (max 3): Stone-ground cool · Boiled & sun-cured · Batch lab report (inline SVG icons).
   - Existing: pack sizes, price/MRP/unit price, pincode check, add to cart, batch + best-before line.
2. **Process timeline** "How our turmeric is made" — 6 steps: planted · dug by hand · boiled · sun-cured · stone-ground slowly · tested then packed.
3. **Comparison block** "Stone-ground vs industrial": table (heat, volatile oil, aroma, texture, batches) + taste note + optional image.
4. **Lab report card** (existing, restyled) beside **Grower card**.
5. Light band (existing): **Use block** "How to use" (+ recipe links) · reviews (only when approved reviews exist) · FAQ · more from the farm.

**Placement against the existing bento.** The dark "From our farm" bento is a 3-column grid (`ProductPageView.astro:131–186`: description spans 2, then how-it's-made, harvest, nutrition, attributes, lab cards). Story sections 2–4 render as **full-width sections between the buy-box row and the bento**, never as cards inside the grid. When a product has `processSteps`, the bento's "How it's made" card is not rendered; the other bento cards stay as they are. When the lab card is shown in the story row, it isn't repeated in the bento. Products without a story keep today's layout unchanged.

### 2. Rice product page (`/rice/<slug>`) — the Kolam rice from Wada first, same layout

Differences from turmeric (marked "RICE" in the mockup):

- **No certification line** (rice is `none`). Practice icons instead: Grown without synthetic pesticides or fertilisers · Hand-harvested, sun-dried · Bran & germ kept.
- **GI badge** "GI-tagged <GI name> · Reg. AU-####" — shown **only** when the product has a GI name **and** an authorised-user registration number (see [GI](#geographical-indication-gi)). The owner is **not** a registered authorised user today (grows in the GI area only), so at launch there is no badge **and the registered name "Wada Kolam" is not used anywhere** (see [GI sweep](#gi-sweep)). Working name: **"Kolam rice from Wada, Palghar"** — confirm with the lawyer, since even this phrasing sits close to the GI name. Registering as an authorised user (through the GI's registered proprietor) unlocks the name and badge without code changes.
- **Variety switcher** (Kolam from Wada / Karjat 3 / Red Rice): links to the other active products in the category, when the product enables it.
- **Origin story** block ("A Palghar rice with its own name") between buy box and timeline.
- Timeline: nursery before the monsoon · transplanted by hand · fed with manure and compost · cut with sickles · sun-dried · milled once.
- Comparison is **single-pass vs polished white rice**: per-100 g table (fibre, magnesium, thiamine) where every numeric row shows its source, plus a cooking row.
- Lab card shows moisture, broken grains, pesticide residues.
- **Use block** is "How to cook" (rinse, soak, water ratio, time) + recipes.

### 3. `/turmeric` landing page (new, fixed template)

Page-owned fields are marked **(page)**. Everything else comes from the "Story from" product (turmeric powder) or from the linked products' catalog data.

1. **Hero (page)**: eyebrow, two-line headline ("Haldi the slow way." / "Boiled, sun-cured, stone-ground."), subtitle, CTA "Buy turmeric ↓", optional hero photo. Badges: the certification line from `organicCopy()` (shown only when every linked product has the same line) plus up to two lab proof items, **each attributed to a product** (`{ productId, key }`) and resolved from that product's active batch report.
2. **Product cards**: powder and whole dried fingers (both sold, both under the PGS-India Organic certificate), using `ProductGrid` (price "from ₹…", link to product page) and a one-line **card blurb (page)** each.
3. **Photo strip** "A year in the field": the Story-from product's `processSteps`, in the photo variant (4–8 steps with photos).
4. **Comparison block**: the Story-from product's comparison + its note.
5. **Batch lab table** "Every batch, tested": one row per visible lab report of the linked products, newest first (max 8). **Columns (page)**: Curcumin, Volatile oil, Moisture. Each row shows its product and batch, plus a PDF link.
6. **Grower card(s)** "Who grows it": the growers of the linked products, de-duplicated by name, max 3.
7. Light band: **Facts block (page)** "What's in turmeric" (curcumin, aromatic oils, colour — facts, no health claims), **Use block** from the Story-from product + recipes, **FAQ (page)**, **closing line (page)**.

Sections that come from a product carry a visible attribution ("From our turmeric powder →", linking the product page). That makes them product-scoped for claims (see [Claims](#claims-compliance)).

### 4. `/rice` landing page (reworked, fixed template)

1. **Hero (page)**: keeps "Rice with the bran left on." (restyled), practice badges, a GI badge only when the attributed product carries a valid GI registration, CTA "Choose your rice ↓".
2. **Product cards** "Three varieties, three characters": merges today's "Buy our rice" grid and the variety cards (**card blurb (page)** per product).
3. **Origin story** "Rice from Wada, Palghar": the Story-from product's `originStory` (Kolam rice from Wada).
4. **Photo strip** "Monsoon to milling": the Story-from product's `processSteps`.
5. **Comparison block** "What polishing takes away": the Story-from product's comparison (replaces today's polishing + nutrition sections; sourced numbers).
6. **Batch lab table** (**columns (page)**: moisture, broken grains, pesticide residues).
7. Light band: grower card(s), **Use block** "How to cook unpolished rice", **FAQ (page)**, **closing (page)** "Good food is grown, not manufactured."

### 5. `/spices` hub (reworked, fixed template)

Same template code as the other two, with fewer fields:

- **Hero (page)**: eyebrow, headline, subtitle.
- **Two cards**, fixed in code:
  - **Turmeric** → `/turmeric` (only when `/turmeric` is published; before that it links the turmeric powder product page). Its certification line comes from `organicCopy()`.
  - **Red chilli**: when an active chilli product exists, its product card. If every pack is sold out or out of season, its product page already takes notify-me sign-ups (`acceptsNotify()`, `notify.ts:31`). When there's no active chilli product, a plain "Coming soon" card with no sign-up form, because notify-me can't store a request without an active product.
- **Stone-grinding note (page)**, a link to `/our-process`, and a **closing (page)**.

Hub free text is always checked in the **strictest context** (no "organic", no conditional terms), whatever products exist, because the hub speaks for chilli too.

---

## Shared Section Kit

Astro components in `src/components/store/story/`, used by both product pages and landing pages. All take typed data from `src/lib/store/story.ts`; none fetch.

| Component | Content | Used on |
|---|---|---|
| `ProofLine.astro` | Up to 4 items; each is free text or a lab value (`{ kind: 'lab', key: 'Curcumin' }`, on landing pages also `productId`) resolved from the active batch's lab report; an item whose lab value is missing is hidden | product, landing hero |
| `IconRow.astro` | Up to 3 `{ icon, label }`; icons from a fixed preset list (`stone_mill`, `sun`, `lab`, `hand`, `grain`, `leaf`, `water`, `gi`) rendered as inline SVG, not emoji | product |
| `ProcessTimeline.astro` | 3–8 steps `{ title, text, photoKey? }`; renders as an ordered list; with photos it renders as the landing "photo strip" variant | product, landing |
| `ComparisonBlock.astro` | `{ heading, oursLabel, theirsLabel, rows[{ aspect, ours, theirs, source? }], note?, imageKey?, imageAlt? }`; real `<table>` with `<caption>` | product, landing |
| `BatchLabTable.astro` | Columns (lab summary keys) + rows from `lab_reports` of linked products | landing |
| `OriginStory.astro` | `{ heading, bodyMd, photoKey?, photoAlt? }` | product (rice), landing |
| `GrowerCard.astro` | `{ names, place, since?, bodyMd?, photoKey?, photoAlt? }`; up to 3 per page | product, landing |
| `UseBlock.astro` | `{ kind: 'cook' \| 'use', heading, steps[] }` + recipe links from `recipesUsing()` | product, landing |
| `FactsBlock.astro` | Up to 6 `{ title, text }` | landing |
| `StoryHero.astro` | eyebrow, headline line 1/2, subtitle, CTA label/target, hero photo | landing |
| `CardsSection.astro` | Ordered product ids + optional per-card blurb; wraps `ProductGrid` | landing |
| `Attribution.astro` | "From our <product name> →" link under a product-sourced section | landing |
| `FaqList.astro` | FAQ markup extracted from `ProductPageView` | product, landing |

`StoryPageView.astro` renders a page from its slug's fixed layout (`PAGE_LAYOUTS` in `story.ts`: the ordered section keys per slug) plus the page data and the resolved product data.

Visual language follows today's dark "Organic Bento" shell (`#0c110c`, glass borders, gold `#e0a53a` for turmeric, wheat `#c9a86a` for rice) and the light band below, exactly as in the mockups.

### Images

Story photos come from the existing photo library (R2 `photos/…` keys). `/media` serves only `products/`, `lab-reports/` and `certificates/` (`media/[...key].ts:12`); photos are served today only via `GET /api/photos/image?key=…` (`api/photos/image.ts:10–13`). **Add `photos/` to `PUBLIC_PREFIXES`** so story images get path URLs like product images. Photo-library keys are already public through the API route, so this exposes nothing new.

### Gallery infographics

- **Deferred to a separate design task**, not part of this work: two per product, the **comparison split** and the **process strip** (turmeric powder and fingers share the turmeric pair; rice varieties share the rice pair, with a red-rice variant of the comparison).
- This work ships only the plumbing: the `kind` column, the Photo / Infographic toggle, and the optional `imageKey` on the comparison.
- **No batch numbers in images** (curcumin %, volatile oil %, prices, certificate numbers): those change per batch and live in page text. Images carry only stable process facts.
- Alt text for an infographic is required and claims-checked. The editor shows guidance (no length blocker): "Describe what the image says in a full sentence. Every fact in this image must also appear in the page's sections."

---

## Data Model

### Storage: D1

Landing-page content goes in D1, not KV:

- It references catalog rows (product ids for cards and the Story-from product, lab reports for the batch table, certification for badges) and must be claims-checked against those products' certification and process claims, which live in D1.
- Publishing must enqueue cache purges through the existing outbox (`purgeStmts` → `cache.purge`, `catalog-admin.ts:294`) in the same D1 batch as the write.
- KV (`HARILEAF_CMS`, `getContent`/`putContent`) stays for the legacy `/produce` text only.

### Migration `0008_story_pages.sql`

```sql
-- Product story sections (null = no story; product page uses the classic bento).
ALTER TABLE products ADD COLUMN story TEXT CHECK (story IS NULL OR (json_valid(story) AND json_type(story) = 'object'));
-- Geographical Indication: badge and GI name only when both name and authorised-user number exist.
ALTER TABLE products ADD COLUMN gi_name TEXT;
ALTER TABLE products ADD COLUMN gi_au_reg_number TEXT;
-- Gallery images: photos vs designed infographics.
ALTER TABLE product_images ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'infographic'));

CREATE TABLE story_pages (
  slug            TEXT PRIMARY KEY,   -- validated in code: isStoryPageSlug()
  draft           TEXT NOT NULL CHECK (json_valid(draft) AND json_type(draft) = 'object'),
  published       TEXT CHECK (published IS NULL OR (json_valid(published) AND json_type(published) = 'object')),
  draft_saved_at  TEXT NOT NULL,
  published_at    TEXT
);
```

Seed rows (same migration):
- `rice`: draft = today's `/rice` copy ported into the template fields, **with the GI wording and the name "Wada Kolam" removed** (see [GI sweep](#gi-sweep)). Its nutrient numbers have no source yet, so the draft saves with warnings and publishing stays blocked until the owner adds sources.
- `turmeric`: draft = mockup structure with empty fields.
- `spices`: draft = hub skeleton.

All are seeded with `published = NULL`.

`STORY_PAGE_SLUGS = ['rice', 'turmeric', 'spices']` and `isStoryPageSlug()` live in `src/lib/store/urls.ts`, next to `CATEGORY_SLUGS` / `isCategorySlug` (`urls.ts:5–8`). There's no SQL CHECK: SQLite can only change a CHECK by rebuilding the table. A new landing page is still a code change (route + slug + layout), not an admin action.

There's no `product_ids` column: purges don't need it (see [Edge cache](#edge-cache-and-purge)). Re-validation reads `productIds` from the three `published` JSON rows in code.

### `products.story` JSON (shape, in `src/lib/store/story.ts`)

```ts
interface ProductStory {
  proofLine: Array<{ kind: 'text'; text: string } | { kind: 'lab'; key: string; label: string; suffix?: string }>; // ≤ 4
  icons: Array<{ icon: StoryIcon; label: string }>;                                                                // ≤ 3
  showCategorySwitcher: boolean;                                                                                   // rice variety switcher
  originStory: { heading: string; bodyMd: string; photoKey: string | null; photoAlt: string } | null;
  processSteps: Array<{ title: string; text: string; photoKey: string | null; photoAlt: string }>;                // 0 or 3–8
  comparison: Comparison | null;
  grower: Grower | null;
  use: { kind: 'cook' | 'use'; heading: string; steps: string[] } | null;                                         // ≤ 8 steps
}
interface Comparison { heading: string; oursLabel: string; theirsLabel: string; rows: ComparisonRow[]; note: string; imageKey: string | null; imageAlt: string }
interface ComparisonRow { aspect: string; ours: string; theirs: string; source: string }                           // 2–8 rows
interface Grower { names: string; place: string; since: string; bodyMd: string; photoKey: string | null; photoAlt: string }
```

Reused, unchanged: `process_claims` (evidence for "traditional", etc.), `organic_*`, `faq`, `nutrition`, `harvest_info`, `attributes`, `description_md`, `lab_reports`, `batches`, `product_images` (+ `kind`).

`how_its_made` stays for products without `processSteps`. The editor offers "Convert to timeline", which copies its entries into steps.

### `story_pages.draft` / `published` JSON

One shape for all three pages. The fields a slug doesn't use are ignored by its layout and hidden in its editor.

```ts
interface StoryPage {
  seo: { title: string; description: string };
  hero: { eyebrow: string; line1: string; line2: string; subtitle: string; ctaLabel: string; photoKey: string | null; photoAlt: string;
          proof: Array<{ productId: number; key: string; label: string; suffix?: string }> };   // ≤ 2, lab values only
  productIds: number[];                    // cards (order = card order) + claims context + lab table
  storyFromProductId: number | null;       // supplies origin, photo strip, comparison, use (must be in productIds)
  cardBlurbs: Record<string, string>;      // productId → one line ("small, soft, fragrant")
  labColumns: string[];                    // lab summary keys for the batch table
  facts: Array<{ title: string; text: string }>;   // ≤ 6
  faq: Array<{ q: string; a: string }>;
  note: string;                            // /spices stone-grinding note
  closing: string;
  hidden: Array<'origin' | 'photo_strip' | 'comparison' | 'lab_table' | 'growers' | 'facts' | 'use' | 'faq'>;
}
```

`PAGE_LAYOUTS` fixes the section order per slug. The owner can hide a section but not add, remove or reorder sections.

### Lab summary keys

`lab_reports.summary` stays a free key → value map, but the editor suggests standard keys per category so proof lines and lab tables can find them:

- spices: `Curcumin`, `Volatile oil`, `Moisture`, `Added colour`
- rice: `Moisture`, `Broken grains`, `Pesticide residues` (plural, matching today's editor default, `ProductEditor.tsx:502`)

Matching is case-insensitive, and an unknown key is simply not shown. The lab-report form gets labelled rows (key picker + value) instead of the raw JSON textarea. The stored shape is unchanged.

### Geographical Indication (GI)

- The GI badge renders only when `gi_name` **and** `gi_au_reg_number` are both set. Setting `gi_name` without a number is a field error: "Add the authorised-user registration number, or clear the GI name".
- Without the number, the following is rejected on save, for that product, and on publish for any landing page linking it:
  - any free text, including product name, slug, image alt text and story fields, containing `GI` (uppercase, whole word), "geographical indication" or "GI-tagged"
  - a registered GI name from a fixed list in `claims.ts` (starting with "Wada Kolam", case-insensitive, flexible spaces and hyphens, so `wada-kolam` in a slug matches too)

  The message: "GI wording and the name 'Wada Kolam' need the authorised-user registration number (Products → Geographical Indication)". "Low GI" stays rejected as a health claim anyway.

### GI sweep

Every place that uses the GI wording or the name "Wada Kolam":

| Where | Today | Change |
|---|---|---|
| Live `/rice` (`rice.astro:136,137,139`) | "Aromatic · GI-Tagged", "GI-tagged in 2021…", `GI-tagged` chip | **Removed now in a separate PR to `main`** (independent of this work); the legacy components below are moved from that cleaned copy |
| `/rice` title, description, gallery filter label, card heading, photo alt (`rice.astro:17,18,23,132,135`) | "Wada Kolam" | Working name "Kolam rice from Wada" in `RiceLegacy.astro` (in the same `main` PR if the lawyer has confirmed the name by then) |
| `/produce` rice teaser (`produce.astro:340`) | "Karjat 3, Wada Kolam and Red Rice" | Working name |
| Admin photo category label (`admin/photos.astro:28`) | "Rice — Wada Kolam" | "Rice — Kolam from Wada". The internal key `rice:wada` stays (it's not shown to shoppers) |
| Migration 0008 `rice` seed draft | ported `/rice` copy | ported without GI wording or the name |
| D1 product rows: name, short description, SEO fields, description, FAQ, image alt | owner data | the GI rule blocks the next save until they're renamed; the owner renames them in place |
| D1 product **slug** containing `wada-kolam` | frozen once published (`catalog-admin.ts:139`) | Don't rename it in place. Mark the product **discontinued** with a replacement product under a new slug (e.g. `kolam-rice-wada`), using the existing 301 mechanism (`rice/[slug].astro:16–17`) |
| Google feed (`/feeds/google.xml`) and `sitemap-store.xml` | built from product rows | follow from the product rename and replacement; nothing extra |

---

## Claims Compliance

All checks reuse `findBannedPhrases()` / `organicCopy()` from `src/lib/store/claims.ts`. New code lives in `src/lib/store/story-claims.ts`.

1. **What is checked, and when.**
   - The product story is checked on every story save, and a save with errors is blocked, because it's live at once. That covers proof text, icon labels, steps, comparison cells and notes, origin, grower, use steps, and image alt text.
   - A landing-page **draft** save checks structure only (shape, limits, `isStoryPageSlug`) and returns claims problems as **warnings**.
   - **Publish** runs the full claims check and blocks on errors.
   - This walks text fields the way `validateProduct()` already does (`visibleTexts()`, `catalog-admin.ts:105–119`, checked at `:152–156`).
2. **Context for a product** is the same as today: its `organic_scheme`, certificate, `process_claims`, and `RAW_PRODUCE_TERMS` if perishable.
3. **Context for a landing page.** It depends on where the text sits:
   - **Page-wide copy** (SEO, hero, facts, FAQ, note, closing) uses the **intersection** over `productIds`:
     - "organic" is allowed only if **every** linked product has `organicCopy().mayUseOrganic`. `/turmeric` allows it (powder and fingers are both certified); `/rice` doesn't.
     - A conditional term (`traditional`, `natural`, `pure`, …) is allowed only if **every** linked product has an evidenced process claim with that code.
     - A page with no linked products gets the strictest context.
     - `/spices` always gets the strictest context.
   - **Product-scoped copy** is checked against that product's own context. It covers the card blurb for product X, and the sections that come from the Story-from product and carry its attribution. So "traditional" can appear in the attributed Kolam-from-Wada timeline on `/rice` even if Karjat 3 has no `traditional` claim. It can't appear in the `/rice` hero.
   - Health claims are always rejected.
4. **Published pages are re-checked when evidence changes.**
   - A product save or story save that changes any of the following re-checks every published page whose `published.productIds` contains the product, against the new values:
     - `organic_scheme`, the certificate number or conversion year
     - `process_claims`
     - `gi_name` / `gi_au_reg_number`
     - the product's story, when that product is a page's Story-from product
   - If a page would fail, **the product save is blocked**. The message names the page and the wording, e.g. "/turmeric uses 'organic' in Hero line 2; edit and republish the page first". Nothing is unpublished silently.
   - The owner fixes the page draft, publishes it, then saves the product.
   - With three pages this is three JSON parses per save, and needs no index.
5. **Certification wording is never typed.**
   - Badges come from `organicCopy()` for each product.
   - Typing "PGS", "NPOP", "Jaivik Bharat", "India Organic" or "certified organic" in page text is rejected unless every product in the text's context is certified under that scheme.
   - Unrelated uses such as "NABL-accredited lab" are not affected.
6. **Numbers need sources.** In a comparison row, if `ours` or `theirs` contains a digit, `source` is required, e.g. "IFCT 2017", "Lab report T-01". This is a **new** rule: `nutrition.source` is optional today (`catalog-admin.ts:116`) and stays optional.
7. **Industrial-mill comparisons are factual and non-disparaging.**
   - The `theirs` column describes a process ("high-speed mill", "polished white rice"), never a brand.
   - A comparison-only banned list **rejects** `adulterat*`, `fake`, `poison*`, `toxic`, `harmful`, `dangerous` and `cheap`.
   - The admin shows the guidance: "Describe the other process, not a competitor. Use numbers only with a source." Reference figures for heat and volatile-oil loss come from the 2026-08-23 spec's research ("High-speed mills reach ~90–120 °C…"), always attributed to "cold & low-temperature grinding studies", never presented as our own measurements.
8. **Lab values aren't typed into stories or pages.** Curcumin % and volatile oil % in proof lines and lab tables are read from lab-report rows. The owner types them once, in the lab report for the batch that its PDF covers. A page can't show a number that no report carries. Lab summary values are claims-checked on save like other text.
9. **Warnings vs errors.** `publishChecklist()` entries are blocking errors for active products (`catalog-admin.ts:199`), so no story rule is added there.
   - Story rules are field errors (block) or **warnings**. Save responses gain a `warnings` map, shown next to the field without blocking.
   - Warnings: a proof item with no matching lab value, infographic alt-text guidance, and (pages only) every claims problem in a draft.

---

## Admin UX

All screens sit under `/admin` (Cloudflare Access + passphrase session; `requiresAdminAccess` already covers `/admin*` and `/api/admin*`, `access.ts:57–64`). They follow the `ProductEditor.tsx` patterns: one React island per screen, field groups as `<section>` blocks with `<h2>`, inline field errors, and a toast on save.

Messages are written as next steps and link to the field or screen that fixes them. They never show internal codes or JSON.

### Products → Story editor (new island)

`ProductEditor.tsx` is already 574 lines, so the story gets **its own island**, `src/components/admin/ProductStoryEditor.tsx`, on the product edit page below the existing editor. It has its own Save, which calls `PUT /api/admin/products/[id]/story`. Groups:

1. **Buy box**
   - Proof line: rows of either text or a lab value. A lab value is picked from the standard keys, and the current value is shown live, e.g. "Curcumin → 5.1 % from batch T-01 (active)".
   - Icon row: up to 3 rows of icon picker + label.
   - "Show variety switcher" checkbox.
2. **Timeline**: reorderable steps (title, text, photo, alt), plus "Convert from How it's made".
3. **Comparison**: heading, our and their labels, reorderable rows (aspect / ours / theirs / source), note, optional image (pick from this product's infographics or the photo library).
4. **Origin & grower**: origin heading, body (basic markdown), photo; grower names, place, since, body, photo.
5. **How to cook / use**: kind toggle, heading, reorderable steps.

In the existing `ProductEditor.tsx`:
- **Geographical Indication** fields (GI name, authorised-user registration number) go next to "Organic certification".
- **Photos** get a "Photo / Infographic" toggle per image, with the alt-text guidance for infographics.
- **Process claims** (`ProductEditor.tsx:235`) get labelled controls: a claim picker (traditional, natural, …) + text + evidence note, instead of typing codes.

**Reordering:** each row has ↑ / ↓ buttons with aria-labels such as "Move step 3 up", plus a delete button. Drag-and-drop is not required. Focus stays on the moved row.

**Preview:** a "Preview" button submits a hidden `<form method="post" action="/admin/preview/product" target="_blank">` whose `payload` field holds `{ productId, story }`: the story island's unsaved state as JSON. See [API](#api-routes).

**Validation messages** (examples, shown next to the field):
- "Step 4: 'traditional' needs a 'Traditional' claim with an evidence note. Add it under Claims & story."
- "Comparison row 2: numbers need a source, e.g. 'IFCT 2017' or 'Lab report T-01'."
- "Comparison row 3: describe the other process, not a competitor ('fake' isn't allowed)."
- "Proof item 1: the active batch's lab report has no 'Volatile oil', so this item is hidden on the page." (warning)
- "This change would make /turmeric say 'organic' without support (Hero line 2). Edit and republish the page first." (blocks)
- "GI wording and the name 'Wada Kolam' need the authorised-user registration number."

### Pages (new section)

A new nav item, **Pages**, in `AdminLayout.astro`, next to Products.

- **`/admin/pages`**: lists Rice, Turmeric and Spices hub. Each row shows a status (Never published · Published · Unpublished changes), last saved and last published times, and Edit / View live links.
- **`/admin/pages/[slug]`**: a React island (`src/components/admin/StoryPageEditor.tsx`) showing **only the fields the slug's layout uses**, in page order:
  1. **Search appearance**: SEO title and description, with character counters.
  2. **Hero**: eyebrow, line 1, line 2, subtitle, CTA label, photo + alt, and proof items (product picker + lab key, current value shown).
  3. **Products**:
     - Pick and order the linked products from the matching category (rice → rice; turmeric → spices).
     - Add a one-line card blurb for each.
     - Choose **"Story from"** (one of the linked products).
     - A note explains: "These products decide what wording is allowed on this page. Sections from the 'Story from' product are edited on that product."
  4. **Page sections**: for each section in the layout, either its page-owned fields (lab-table columns, facts, FAQ, note), or a read-only summary plus an "Edit on <product> →" link for product-sourced sections. Every section has a **Hide** checkbox. There's no add, remove or reorder.
  5. **Closing line.**
- **Action bar**, sticky at the bottom:
  - **Save draft**: checks structure only; always saves when the structure is valid, then shows claims and completeness warnings next to the fields. "Saved — 3 things to fix before publishing."
  - **Preview**: saves the draft, then opens `GET /admin/preview/page/[slug]` in a new tab.
  - **Publish**: runs the full checks. On errors: "Not published — …" with per-field messages. On success it copies draft to published and enqueues the purge.
- **Images**: an image picker modal that reuses the existing photo library (`GET/POST /api/photos`, R2 `photos/…` keys, 8 MB limit). Choose an existing photo or upload a new one with a label and category `story`. The editor stores the R2 key and alt text. Alt text is required, except for images marked decorative.

---

## API Routes

All routes below are under the Access + session gate. JSON in, JSON out, except the product preview (a form post). Errors use `{ error, fieldErrors? }`, like the product API. Successful saves may add `warnings`.

| Route | Purpose |
|---|---|
| `PUT /api/admin/products/[id]` (existing, extended) | Accepts `giName`, `giAuRegNumber`; `validateProduct` gains the GI rule and the [published-page re-check](#claims-compliance) |
| `PUT /api/admin/products/[id]/story` (new) | Coerce + validate the story against the saved product's context; re-check published pages that use it as Story-from; save; purge `productPurgePaths()` |
| `PATCH /api/admin/products/[id]/images` (existing, extended) | Accepts `kind` |
| `GET /api/admin/pages` | List pages with status |
| `GET /api/admin/pages/[slug]` | `{ draft, published, draftSavedAt, publishedAt }` + resolved product data for the editor |
| `PUT /api/admin/pages/[slug]` | Save draft (structure only; returns `warnings`) |
| `POST /api/admin/pages/[slug]/publish` | Full checks, then in one D1 batch: `published = draft`, `published_at`, and purge statements |
| `POST /admin/preview/product` | Astro page. Reads `await request.formData()` → `payload` → JSON. It's same-origin form POST only: Astro's origin check (default on for form posts) plus the admin gate. It loads the saved product, overlays the coerced unsaved story, and renders `ProductPageView`, with validation messages in the "Preview — not live" banner. **No writes**, `Cache-Control: no-store`, `noindex` meta + `X-Robots-Tag: noindex`. If the product has no variants yet, the buy box shows "No pack sizes yet" instead of dereferencing `initial` (`ProductPageView.astro:38,109–111`) |
| `GET /admin/preview/page/[slug]` | Renders the saved draft with `StoryPageView`, the same banner, `no-store`, `noindex` |

Library modules:
- `src/lib/store/story.ts`: types, `PAGE_LAYOUTS`, `coerceProductStory`, `coerceStoryPage`, structural validation (limits, required alt text, step counts, source-for-numbers).
- `src/lib/store/story-claims.ts`: product, page-wide and product-scoped claims contexts, comparison rules, GI rule, published-page re-check.
- `src/lib/store/story-pages.ts`: D1 read/save/publish and purge statements.
- `src/components/store/StoryPageView.astro`: renders a `StoryPage` and is shared by the public routes and preview.

---

## Public Routes, SEO, Caching

### Routes

- `src/pages/turmeric.astro` (new), `src/pages/rice.astro` and `src/pages/spices.astro` (rewritten) all load `story_pages.published`, the linked products (cards, Story-from story, growers) and their lab reports, then render `StoryPageView`.
  - **Rollout guard:** while `published IS NULL`, `/rice` and `/spices` render their current hard-coded markup, moved to `src/components/store/legacy/RiceLegacy.astro` and `SpicesLegacy.astro`. That markup is taken from `main` **after** the GI clean-up PR (see [GI sweep](#gi-sweep)). `/turmeric` returns 404 until published.
  - **On D1 failure:** behave like today's category pages (`rice.astro:28–35`): log, send `Cache-Control: no-store`, and render the legacy page (rice and spices) or `/store-unavailable` (turmeric). Once the legacy components are deleted (Rollout step 4), rice and spices also render `/store-unavailable` on D1 failure.
  - A linked product that is no longer active drops out of cards, lab table and growers. It stays in the claims context until the page is republished, which keeps that context strict.
- Product pages: `ProductPageView` renders story sections when `product.story` is non-null.

### SEO

- `/turmeric`:
  - Title and description come from the page's SEO fields, with the page-wide claims check applied: "organic" is allowed because both linked products are certified.
  - Suggested title: "Stone-Ground Turmeric Powder (Haldi), Sun-Cured | HariLeaf". Canonical `https://harileaf.org/turmeric/`.
  - Emits BreadcrumbList (Home › Turmeric) and FAQPage when the FAQ is non-empty.
- `/rice` and `/spices`: the same pattern. `/spices` links to `/turmeric` (internal link) and to the chilli product when there is one.
- Product JSON-LD is unchanged. Story text adds crawlable content and is not marked up.
- **Sitemap** (`sitemap-store.xml.ts`, `storeSitemapXml()` in `feed.ts:105–122`):
  - Category URLs are listed today only when the category has active products. An `extra` entry that duplicates a listed URL is dropped, along with its `lastmod` (`feed.ts:116,119`).
  - Change: pass `/rice/` and `/spices/` (always, since they render either the story page or the legacy page) and `/turmeric/` (only once published) as `extra` entries with `lastmod = published_at`.
  - Change `storeSitemapXml()` so that a duplicate `extra` **raises** the existing entry's `lastmod` when it's newer, instead of being dropped.
- Internal links:
  - turmeric product pages → `/turmeric` ("The turmeric story →", in place of the generic "How we grow, mill and grind →"), once `/turmeric` is published
  - rice product pages → `/rice`
  - `/turmeric` → product pages and recipes

### Edge cache and purge

- `isEdgeCacheable()`: add `/turmeric` to `CACHED_EXACT` (`edge-cache.ts:24`). `/rice` and `/spices` are already cacheable as category paths.
- `productPurgePaths(categorySlug, productSlug)` (`edge-cache.ts:97`) stays a pure synchronous function. It already returns `/${categorySlug}`, which covers `/rice` and `/spices`. Add: when `categorySlug === 'spices'`, also `/turmeric`.
  - Product saves (`catalog-admin.ts:401–403`) and image, lab-report and batch writes (via `productPaths()`, `catalog-admin.ts:445–448`) already use it, so prices, cards, proof lines, lab tables and badges on landing pages are purged with no further code.
  - Story saves use it too.
- On publish: purge the page's own path and `/sitemap-store.xml`. Turmeric also purges `/spices` (the hub card's link target changes) and every turmeric product page (the "The turmeric story →" link appears). All of this goes through `purgeStmts()` (immediate + 30 s).
- `purgeStorefrontStmts()` adds `/turmeric` (`catalog-admin.ts:314–316`).
- Preview routes are never cached (`/admin*` isn't edge-cacheable, and the response is `no-store`).

---

## Accessibility

- Timeline is an `<ol>`. Comparison is a `<table>` with `<caption>`, `scope="col"`/`scope="row"`. Lab table has headers and a text "Download PDF" link per row.
- A comparison image carries `alt="Comparison: <ours> vs <theirs>; details in the table below"`. Gallery infographics carry full-sentence alt text (guidance, not a length rule).
- Icons are inline SVG with `aria-hidden` next to visible labels. No emoji-only meaning.
- Text contrast is ≥ 4.5:1 on the dark shell (checked by Lighthouse CI). `FadeIn` already respects `prefers-reduced-motion`.
- Admin: every control is labelled, reorder buttons have descriptive aria-labels, field errors and warnings are linked via `aria-describedby`, and focus moves to the first error on a failed save.

---

## Testing

- **Unit** (`tests/unit/`):
  - `story.test.ts`: coercion, limits, step counts, required alt text, the numbers-need-source rule, `PAGE_LAYOUTS` per slug, `isStoryPageSlug`.
  - `story-claims.test.ts`:
    - page-wide context: "organic" allowed only when all linked products are certified; `/spices` always strictest
    - product-scoped context: "traditional" allowed in an attributed section of an evidenced product, rejected in the hero
    - health claims rejected
    - comparison banned terms
    - GI rule, including "Wada Kolam" in name, slug and alt text, and `GI` matching only as an uppercase whole word
    - certification words not typable
    - published-page re-check: removing the turmeric certificate or the Kolam `traditional` claim reports the page and the wording
  - Extend `claims.test.ts` for comparison terms; `edge-cache.test.ts` for `/turmeric` in `productPurgePaths('spices', …)` and `isEdgeCacheable`; `feed.test.ts` for the `extra` lastmod rule.
- **Integration** (`tests/integration/`):
  - `story-pages.test.ts`:
    - a draft with banned wording **saves** and returns warnings
    - publish is blocked on the same draft
    - a valid publish copies the draft and writes two `cache.purge` outbox rows that include `/sitemap-store.xml`
    - the product preview POST renders without writing, and a form post from another origin is rejected
  - Extend `catalog-admin.test.ts`:
    - product save with GI fields
    - a story save
    - a product save blocked by a published page that depends on its certificate
- Extend `schema.test.ts` for migration 0008 columns.
- **E2E** (`e2e/storefront.spec.ts`; `e2e/setup-db.mjs` seeds a published turmeric page and a story on the seeded rice product):
  - `/turmeric` renders hero, cards, comparison table, lab table
  - `/spices` links to `/turmeric`
  - the product page shows the proof line, timeline and comparison
  - legacy `/rice` still renders when unpublished (separate seed) and contains no "GI-tagged"
- **Lighthouse CI**: add `/turmeric/` to `lighthouserc.json`.

---

## Rollout

0. **Separate PR to `main`, now:** remove the live GI wording from `/rice` (see [GI sweep](#gi-sweep)).
1. Ship code with migration 0008. Pages stay on the legacy markup, and `/turmeric` returns 404, until each page is published.
2. Owner fills in the turmeric powder story (and fingers' card details) and the active batch's lab report, then publishes `/turmeric`, then the `/spices` hub.
3. Owner renames the rice product to the working name (or discontinues and replaces it if its slug contains `wada-kolam`). The owner then fills in the Kolam-from-Wada story, then Karjat 3 and Red Rice, then publishes `/rice`.
4. Once all three pages are published, delete the legacy components in a follow-up PR.
5. Later, separately: the infographic design task delivers the gallery images, and the owner uploads them as `kind = 'infographic'`.

---

## Owner-Supplied Inputs

| Input | Used for | Blocks |
|---|---|---|
| Turmeric batch lab report PDF with **curcumin %, volatile oil %, moisture** (and "added colour: not detected" if tested), linked to the active batch | Proof line, lab card, lab table, oil-retention comparison row | Proof line values; numeric comparison rows |
| **PGS-India Organic certificate number** (and scan) for turmeric | Certification badge | Any "organic" wording on turmeric |
| **GI authorised-user registration number** for Wada Kolam — *not held today; owner may apply* | GI badge, use of the name "Wada Kolam" | Any "GI" wording and the name "Wada Kolam" |
| Lawyer's confirmation of the interim name "Kolam rice from Wada, Palghar" | Product name, cards, origin story | Renaming the rice product |
| Grower names, village, years on the land, photos, **and the grower's OK to be named and pictured** | Grower cards | Grower section |
| **Years** the boiling/curing and the rice nursery/transplanting method have been used (≥ 30), with an evidence note | `traditional` process claims | Word "traditional" |
| **Grinding temperature basis**, e.g. measured at the mill | Comparison "heat" row | Any °C figure |
| Rice nutrient figures: lab or IFCT 2017 values for fibre, magnesium, thiamine (ours vs polished) | Rice comparison table | Numeric rice rows; publishing `/rice` |
| Rice lab report (moisture, broken grains, pesticide residues) | Rice lab card and table | — |
| Prices, MRP, pack sizes (100/250/500 g turmeric; 1/5/10 kg rice), HSN, GST | Buy box | Selling |
| Rice district(s) / village | Hero eyebrow, origin story | — |
| Field and process photos (planting → stone mill; nursery → milling) | Photo strips, timeline | — |

---

## Resolved Questions (owner, 2026-10-20)

1. **Whole dried turmeric fingers:** sold, and covered by the same PGS-India Organic certificate, so `/turmeric` keeps "organic".
2. **PGS certificate scope:** names this farm and the turmeric crop.
3. **Wada Kolam GI:** the owner grows in the GI area but is **not** a registered authorised user. No GI badge and no use of the name "Wada Kolam" until registered (see the rice product page, GI and GI sweep sections). Lawyer to confirm the interim name.
4. **Red chilli:** a "Coming soon" card on the `/spices` hub while there's no active chilli product. Once one is active, its product card, with notify-me on its product page while packs can't be bought.
5. **Infographics:** polished illustrations (shading, shadows, texture), 1200×900 + 2400×1800 WebP, made in a **separate design task** after this work. The pages don't depend on them.
