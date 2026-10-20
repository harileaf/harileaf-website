# Rice & Turmeric Story Pages — Design Spec

**Date:** 2026-10-20
**Status:** Approved in brainstorming (layouts) · awaiting owner review of this document
**Branch:** `feat/rice-turmeric-pages` (from `main` @ `e7ed66d`)
**Builds on:** [E-commerce design](2026-10-18-ecommerce-design.md) (claims policy, catalog, edge cache, admin), [Rice & spices pages](2026-08-23-rice-spices-pages-design.md) (honest-claims research)
**Mockups:** `.superpowers/brainstorm/38284-1792493406/content/` (git-ignored): `turmeric-a-detailed.html` (right column, "Recommended"), `rice-wada-kolam.html`, `landing-pages.html`

---

## Overview

Turn the rice and turmeric pages into story-led pages in the spirit of Two Brothers Organic Farms, but built on evidence (batch lab reports, process steps, grower) and compliant with the store's claims policy. Five pages change:

| Page | Today | After |
|---|---|---|
| Turmeric product page (`/spices/<turmeric-slug>`) | Generic product layout | Product layout + story sections (approved "Recommended" layout) |
| Rice product pages (`/rice/<slug>`; Wada Kolam first) | Generic product layout | Same story sections + rice differences |
| `/turmeric` | Doesn't exist | New story-led landing page |
| `/rice` | Hard-coded Astro page | Reworked landing page, rendered from admin-edited content |
| `/spices` | Hard-coded page for turmeric + chilli | Short hub: Turmeric card → `/turmeric`, Red chilli card, stone-grinding note |

**Everything on these pages is edited in the admin portal (`/admin`)**, stored in D1, checked against the claims policy on save, previewable before it goes live, and purged from the edge cache on publish. Keystatic is not used: in production `/keystatic` can't write (local file storage; Workers can't write `src/content`).

### Goals

1. Story sections that sell on proof: proof line, process timeline, stone-ground vs industrial (and unpolished vs polished) comparison, batch lab results, origin story, grower card, how to cook/use.
2. Owner can edit every word, photo, step and row from `/admin`, with preview, without a deploy.
3. Every new text field passes `findBannedPhrases()`; certification wording only via `organicCopy()`; GI wording only with an authorised-user registration number.
4. Text Google and screen readers can read: infographics are a supplement, never the only home of a fact.

### Non-goals

- No change to cart, checkout, payments, orders or product JSON-LD (`productGroupJsonLd`).
- No new red chilli landing page (the hub links to its product page).
- No video, no multi-language, no A/B testing.
- No designed infographics produced by this work: the owner uploads them (two per product, see [Gallery infographics](#gallery-infographics)).
- Recipes and `/learn` articles stay in `src/content/store/*.ts` (read-only content shipped with the code).

---

## Decisions Made

| Question | Decision |
|---|---|
| Layout | Approach A (story as real page sections) **plus** two infographic gallery slides per product (comparison split, process strip); the comparison image is repeated beside the comparison table |
| Turmeric landing URL | New `/turmeric`; `/spices` becomes a hub |
| Turmeric certification | **PGS-India Organic** certificate exists → `organic_scheme = 'pgs_organic'` + certificate number; "organic" allowed on turmeric product and `/turmeric` |
| Rice certification | Applied, awaiting → `organic_scheme = 'none'`; "organic" never shown for rice; badge appears automatically once the certificate is entered |
| Rice practices (owner) | No synthetic inputs · traditional method 30+ years · hand-harvested & sun-dried · single-pass milling · Wada Kolam grown in Wada (GI region) |
| Turmeric practices (owner) | No synthetic inputs · boiled & sun-cured · stone-ground cool · curcumin lab-tested · oil retention is the key story |
| Where content lives | **D1**, not KV or Keystatic (see [Storage](#storage-d1)) |
| Who edits | Owner in `/admin` (Products editor for product story; new **Pages** section for landing pages) |

---

## Page Anatomy

Section names below are the shared **section kit** ([next chapter](#shared-section-kit)). Each section renders only when it has content, so a half-filled page never shows empty boxes.

### 1. Turmeric product page (`/spices/<slug>`) — approved "Recommended" layout

1. **Gallery + buy box** (existing `ProductPageView` + `BuyBox`), with additions:
   - Gallery order: hero photo → **comparison infographic** → **process infographic** → other photos (owner sets order; infographics are normal `product_images` rows with `kind = 'infographic'`).
   - **Proof line** under the name: `Curcumin X.X % · volatile oil X.X % · lab-tested every batch` (lab values pulled from the active batch's lab report).
   - **Certification line** from `organicCopy()`: "Certified organic (PGS-India Organic) · Certificate ####".
   - **Icon row** (max 3): 🪨 Stone-ground cool · ☀️ Boiled & sun-cured · 🧪 Batch lab report.
   - Existing: pack sizes, price/MRP/unit price, pincode check, add to cart, batch + best-before line.
2. **Process timeline** "How our turmeric is made" — 6 steps: planted · dug by hand · boiled · sun-cured · stone-ground slowly · tested then packed.
3. **Comparison block** "Stone-ground vs industrial": split image (same file as gallery slide 2) + table (heat, volatile oil, aroma, texture, batches) + taste note.
4. **Lab report card** (existing, restyled) beside **Grower card**.
5. Light band (existing): nutrition per 100 g · **Use block** "How to use" (+ recipe links) · reviews (only when approved reviews exist) · FAQ · more from the farm.

The existing dark "From our farm" bento (`description_md`, `how_its_made`, `harvest_info`, `attributes`) stays for products without story content. When a product has story content, `how_its_made` is replaced by the timeline; the other bento cards remain.

### 2. Rice product page (`/rice/<slug>`) — Wada Kolam first, same layout

Differences from turmeric (marked "RICE" in the mockup):

- **No certification line** (rice is `none`). Practice icons instead: 🌾 Grown without synthetic pesticides or fertilisers · ✋ Hand-harvested, sun-dried · 🟤 Bran & germ kept.
- **GI badge** "GI-tagged Wada Kolam · Reg. AU-####" — shown **only** when the product has a GI name **and** an authorised-user registration number (see [GI](#geographical-indication-gi)). Without it, copy may say "grown in Wada, Palghar" but not "GI-tagged".
- **Variety switcher** (Wada Kolam / Karjat 3 / Red Rice): links to the other active products in the category, when the product enables it.
- **Origin story** block ("A Palghar rice with its own name") between buy box and timeline.
- Timeline: nursery before the monsoon · transplanted by hand · fed with manure and compost · cut with sickles · sun-dried · milled once.
- Comparison is **single-pass vs polished white rice**: split image + per-100 g table (fibre, magnesium, thiamine) where every numeric row shows its source, plus a cooking row.
- Lab card shows moisture, broken grains, pesticide residue.
- **Use block** is "How to cook" (rinse, soak, water ratio, time) + recipes.

### 3. `/turmeric` landing page (new)

1. **Hero**: eyebrow, two-line headline ("Haldi the slow way." / "Boiled, sun-cured, stone-ground."), subtitle, badges (certification line from the turmeric product's `organicCopy()`, plus up to two lab proof items), CTA "Buy turmeric ↓", optional hero photo.
2. **Product cards**: the linked turmeric products (powder; whole dried fingers if the owner sells them later), using `ProductGrid` (price "from ₹…", link to product page).
3. **Photo strip** "A year in the field": 4–8 photo steps (photo + caption, 2 lines each).
4. **Comparison block**: split image + same table as the product page + "rub and smell" taste-test note.
5. **Batch lab table** "Every batch, tested": one row per visible lab report of the linked products, newest first (max 8), configured columns (Curcumin, Volatile oil, Moisture) + PDF link.
6. **Grower card(s)** "Who grows it".
7. Light band: **Facts block** "What's in turmeric" (curcumin, aromatic oils, colour — facts, no health claims), **Use block** + recipes, **FAQ**, closing line.

### 4. `/rice` landing page (reworked)

1. **Hero**: keeps "Rice with the bran left on." (restyled), practice badges, GI badge only when the Wada Kolam product carries a valid GI registration, CTA "Choose your rice ↓".
2. **Product cards** "Three varieties, three characters": merges today's "Buy our rice" grid and the variety cards (character line per card is a per-product card blurb set on the page).
3. **Origin story** "The Wada Kolam story".
4. **Photo strip** "Monsoon to milling".
5. **Comparison block** "What polishing takes away" (replaces today's polishing + nutrition sections; sourced numbers).
6. **Batch lab table** (moisture, broken grains, residue).
7. Light band: grower card, **Use block** "How to cook unpolished rice", FAQ, closing "Good food is grown, not manufactured."

### 5. `/spices` hub (reworked)

Hero (short) → two cards: **Turmeric** → `/turmeric`; **Red chilli** → its product page (or a notify-me card while it has no active product) → a short stone-grinding note → link to `/our-process`. Certification wording on cards comes from each product's `organicCopy()`; hub free text may not say "organic" because chilli isn't certified.

---

## Shared Section Kit

Astro components in `src/components/store/story/`, used by both product pages and landing pages. All take typed data from `src/lib/store/story.ts`; none fetch.

| Component | Content | Used on |
|---|---|---|
| `ProofLine.astro` | Up to 4 items; each is free text or a lab value (`{ kind: 'lab', key: 'Curcumin' }`) resolved from the active batch's lab report; an item whose lab value is missing is hidden | product, landing hero |
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
| `FaqSection` | Reuse the FAQ markup from `ProductPageView` (extracted to `FaqList.astro`) | product, landing |

Visual language follows today's dark "Organic Bento" shell (`#0c110c`, glass borders, gold `#e0a53a` for turmeric, wheat `#c9a86a` for rice) and the light band below, exactly as in the mockups.

### Gallery infographics

- Two per product, uploaded by the owner as product images with `kind = 'infographic'`: the **comparison split** and the **process strip**.
- Alt text for an infographic is required, at least 40 characters, and is claims-checked. The editor shows a reminder: "Every fact in this image must also appear in the page's sections".
- The comparison block may reuse the comparison infographic by choosing it as its `imageKey`.

---

## Data Model

### Storage: D1

Landing-page content goes in D1, not KV:

- It references catalog rows (product ids for cards, lab reports for the batch table, certification for badges) and must be claims-checked against those products' certification and process claims, which live in D1.
- Publishing must enqueue cache purges through the existing outbox (`purgeStmts` → `cache.purge`) in the same D1 batch as the write.
- KV (`HARILEAF_CMS`, `getContent`/`putContent`) stays for the legacy `/produce` text only.

### Migration `0008_story_pages.sql`

```sql
-- Product story sections (null = no story; product page uses the classic bento).
ALTER TABLE products ADD COLUMN story TEXT CHECK (story IS NULL OR (json_valid(story) AND json_type(story) = 'object'));
-- Geographical Indication: badge only when both name and authorised-user number exist.
ALTER TABLE products ADD COLUMN gi_name TEXT;
ALTER TABLE products ADD COLUMN gi_au_reg_number TEXT;
ALTER TABLE products ADD COLUMN gi_cert_r2_key TEXT;
-- Gallery images: photos vs designed infographics (stricter alt-text rule).
ALTER TABLE product_images ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'infographic'));

CREATE TABLE story_pages (
  slug            TEXT PRIMARY KEY CHECK (slug IN ('rice', 'turmeric', 'spices')),
  draft           TEXT NOT NULL CHECK (json_valid(draft) AND json_type(draft) = 'object'),
  published       TEXT CHECK (published IS NULL OR (json_valid(published) AND json_type(published) = 'object')),
  product_ids     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(product_ids) AND json_type(product_ids) = 'array'), -- of the published version; drives purges
  draft_saved_at  TEXT NOT NULL,
  draft_saved_by  TEXT,
  published_at    TEXT,
  published_by    TEXT
);
```

Seed rows (same migration): `rice` (draft = today's `/rice` copy ported into sections; its nutrient numbers have no source yet, so publishing stays blocked until the owner adds sources), `turmeric` (draft = mockup structure with empty fields), `spices` (draft = hub skeleton). All seeded with `published = NULL`.

`slug` is constrained to the three pages on purpose; a new landing page is a code change (route + slug), not an admin action.

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

```ts
interface StoryPage {
  seo: { title: string; description: string };
  hero: { eyebrow: string; line1: string; line2: string; subtitle: string; ctaLabel: string; photoKey: string | null; photoAlt: string; proof: ProofItem[] };
  productIds: number[];                         // claims context + cards + lab table (order = card order)
  cardBlurbs: Record<string, string>;           // productId → one line ("small, soft, fragrant")
  sections: StorySection[];                     // ordered; each { id, type, hidden, ...fields }
  closing: string;
}
type StorySection =
  | { type: 'cards'; heading: string }
  | { type: 'photo_strip'; heading: string; steps: Step[] }
  | { type: 'comparison'; comparison: Comparison }
  | { type: 'lab_table'; heading: string; columns: string[] }       // lab summary keys
  | { type: 'origin'; heading: string; bodyMd: string; photoKey: string | null; photoAlt: string }
  | { type: 'growers'; heading: string; growers: Grower[] }          // 1–3
  | { type: 'facts'; heading: string; items: Array<{ title: string; text: string }> }
  | { type: 'use'; use: UseBlock }
  | { type: 'faq'; heading: string; items: Faq[] };
```

### Lab summary keys

`lab_reports.summary` stays a free key → value map, but the editor suggests standard keys per category so proof lines and lab tables can find them:

- spices: `Curcumin`, `Volatile oil`, `Moisture`, `Added colour`
- rice: `Moisture`, `Broken grains`, `Pesticide residue`

Matching is case-insensitive, and an unknown key is simply not shown.

### Geographical Indication (GI)

- The GI badge renders only when `gi_name` **and** `gi_au_reg_number` are both set. Uploading the certificate (`gi_cert_r2_key`) is optional; when present it is linked from the badge.
- Without the number, any free text containing "GI", "geographical indication" or "GI-tagged" is rejected on save, for that product and for any landing page linking it, with the message: "GI wording needs the authorised-user registration number (Products → Geographical Indication)".

---

## Claims Compliance

All checks reuse `findBannedPhrases()` / `organicCopy()` from `src/lib/store/claims.ts`. New code lives in `src/lib/store/story-claims.ts`.

1. **Every new text field is checked on save**: the story JSON (proof text, icon labels, steps, comparison cells/notes, origin, grower, use steps), infographic alt text, and every string in a landing page draft. This works like `validateProduct()`, which already walks text fields (`catalog-admin.ts` lines 113–116 and 150–160).
2. **Context for a product** is the same as today: its `organic_scheme`, certificate, `process_claims`, and `RAW_PRODUCE_TERMS` if perishable.
3. **Context for a landing page** is derived from its `productIds`:
   - "organic" is allowed only if **every** linked product has `organicCopy().mayUseOrganic`. So `/turmeric` allows it while it links only certified turmeric products; `/rice` and `/spices` (chilli) don't.
   - A conditional term (`traditional`, `natural`, `pure`, …) is allowed only if **every** linked product has an evidenced process claim with that code. For example, "traditional" on `/rice` needs a `traditional` claim with an evidence note (30+ years) on all three rice products.
   - Health claims are always rejected.
   - A page with no linked products gets the strictest context: no "organic", no conditional terms.
4. **Certification wording is never typed.** Badges come from `organicCopy()` for each product. Typing "PGS", "NPOP", "Jaivik Bharat", "India Organic" or "certified organic" in page text is rejected unless every linked product is certified under that scheme. Unrelated uses such as "NABL-accredited lab" are not affected.
5. **Numbers need sources.** In a comparison row, if `ours` or `theirs` contains a digit, `source` is required, e.g. "IFCT 2017", "Lab report T-01". This is the same rule `nutrition.source` follows.
6. **Industrial-mill comparisons are factual and non-disparaging.**
   - The `theirs` column describes a process ("high-speed mill", "polished white rice"), never a brand.
   - A comparison-only banned list **rejects** `adulterat*`, `fake`, `poison*`, `toxic`, `harmful`, `dangerous` and `cheap`.
   - A capitalised word in `theirs` that isn't in a small allow-list (e.g. "White", "Polished", "High-speed") only raises a **warning**, "Looks like a brand name", and doesn't block the save.
   - The admin shows the guidance: "Describe the other process, not a competitor. Use numbers only with a source." Reference figures for heat and volatile-oil loss come from the 2026-08-23 spec's research ("High-speed mills reach ~90–120 °C…"), always attributed to "cold & low-temperature grinding studies", never presented as our own measurements.
7. **Lab-driven proof values are never typed.** Curcumin % and volatile oil % in the proof line and lab table come from the lab report rows, so the page can't show a number that no report backs up.
8. The **publish checklist** (`publishChecklist()`) gains these warnings: "Story has a comparison with unsourced numbers", "Infographic without long alt text", "GI badge configured but no registration number".

---

## Admin UX

All screens sit under `/admin` (Cloudflare Access + passphrase session; `requiresAdminAccess` already covers `/admin*` and `/api/admin*`). They follow the `ProductEditor.tsx` patterns: one React island per screen, field groups as `<section>` blocks with `<h2>`, inline field errors, and a toast on save.

### Products → product editor (extended)

New groups in `src/components/admin/ProductEditor.tsx`, placed after "Claims & story":

1. **Story: buy box**
   - Proof line: rows of either text or a lab value. A lab value is picked from the standard keys, and the current value is shown live, e.g. "Curcumin → 5.1 % from T-01".
   - Icon row: up to 3 rows of icon picker + label.
   - "Show variety switcher" checkbox.
2. **Story: timeline**: reorderable steps (title, text, photo, alt), plus "Convert from How it's made".
3. **Story: comparison**: heading, our and their labels, reorderable rows (aspect / ours / theirs / source), note, image (pick from this product's infographics or the photo library).
4. **Story: origin & grower**: origin heading, body (basic markdown), photo; grower names, place, since, body, photo.
5. **Story: how to cook / use**: kind toggle, heading, reorderable steps.
6. **Geographical Indication**, next to "Organic certification": GI name, authorised-user registration number, certificate upload (reuses the `/certificate` upload pattern, but to a separate R2 key).
7. **Photos** (existing): each image gets a "Photo / Infographic" toggle. Infographics show the alt-text length counter and the "same facts in sections" reminder.

**Reordering:** each row has ↑ / ↓ buttons with aria-labels such as "Move step 3 up", plus a delete button. Drag-and-drop is not required. Focus stays on the moved row.

**Preview:** a "Preview" button POSTs the editor's current, unsaved state to `/admin/preview/product` and opens the result in a new tab (see [API](#api-routes)).

**Validation messages** (examples, shown next to the field):
- "Step 4: 'traditional' needs a process claim `traditional` with an evidence note (Claims & story)."
- "Comparison row 2: numbers need a source, e.g. 'IFCT 2017' or 'Lab report T-01'."
- "Comparison row 3: describe the other process, not a competitor ('fake' isn't allowed)."
- "Infographic 2: alt text needs at least 40 characters describing what the image says."
- "Proof item 1: no lab report on the active batch has 'Volatile oil'." (warning; the item is hidden on the page)
- "GI wording needs the authorised-user registration number."

### Pages (new section)

A new nav item, **Pages**, in `AdminLayout.astro`, next to Products.

- **`/admin/pages`**: lists Rice, Turmeric and Spices hub, each with a status (Never published · Published · Unpublished changes), last saved and last published (who and when), and Edit / View live links.
- **`/admin/pages/[slug]`**: a React island (`src/components/admin/StoryPageEditor.tsx`) with these groups:
  1. **Search appearance**: SEO title and description, with character counters and a Google snippet preview.
  2. **Hero**: eyebrow, line 1, line 2, subtitle, CTA label, photo + alt, proof items (lab values from linked products).
  3. **Products**: pick and order the linked products from active products in the matching category (rice → rice; turmeric and spices → spices), plus a one-line card blurb each. A note explains: "These products decide what wording is allowed on this page."
  4. **Sections**: an ordered list. "Add section" offers the section types (photo strip, comparison, lab table, origin, growers, facts, cook/use, FAQ, product cards). Each section is a collapsible card with its fields, ↑ / ↓ / hide / delete controls, and the same row reordering as the product editor.
  5. **Closing line.**
- **Action bar**, sticky at the bottom:
  - **Save draft**: validates structure and claims. The save is blocked on errors, as with `PUT /api/content`, with "Not saved — …" and per-field messages.
  - **Preview**: opens the draft in a new tab.
  - **Publish**: runs the same checks, copies draft to published, and enqueues the purge.
  - **Discard draft**: resets draft to published, after a confirm dialog.
- **Images**: an image picker modal that reuses the existing photo library (`GET/POST /api/photos`, R2 `photos/…` keys, 8 MB limit). Choose an existing photo or upload a new one with a label and category `story`. The editor stores the R2 key and alt text. Alt text is required, except for images marked decorative.

---

## API Routes

All routes below are under the Access + session gate. JSON in, JSON out. Errors use `{ error, fieldErrors? }`, like the product API.

| Route | Purpose |
|---|---|
| `PUT /api/admin/products/[id]` (existing, extended) | Accepts `story`, `giName`, `giAuRegNumber`; `coerceProductInput` + `validateProduct` gain story validation; purge now also covers story pages linking this product |
| `PATCH /api/admin/products/[id]/images` (existing, extended) | Accepts `kind` |
| `POST /api/admin/products/[id]/gi-certificate` | Upload GI certificate PDF/image to R2 (mirrors `certificate.ts`) |
| `GET /api/admin/pages` | List pages with status |
| `GET /api/admin/pages/[slug]` | `{ draft, published, savedAt, publishedAt, … }` |
| `PUT /api/admin/pages/[slug]` | Save draft (structure + claims; blocked on errors) |
| `POST /api/admin/pages/[slug]/publish` | Validate draft, then in one D1 batch: `published = draft`, `product_ids`, `published_at/by`, and purge statements |
| `POST /api/admin/pages/[slug]/discard` | `draft = published` (404 if never published) |
| `POST /admin/preview/product` · `POST /admin/preview/page/[slug]` | Astro pages that read a JSON body (the editor's unsaved state), validate it, and render `ProductPageView` / `StoryPageView` with `noindex`, `Cache-Control: no-store` and a "Preview — not live" banner. `GET /admin/preview/page/[slug]` renders the saved draft |

Library modules:
- `src/lib/store/story.ts`: types, `coerceProductStory`, `coerceStoryPage`, structural validation (limits, required alt text, step counts, source-for-numbers).
- `src/lib/store/story-claims.ts`: product and page claims context, comparison rules, GI rule.
- `src/lib/store/story-pages.ts`: D1 read/save/publish/discard and purge statements.
- `src/components/store/StoryPageView.astro`: renders a `StoryPage` and is shared by the public routes and preview.

---

## Public Routes, SEO, Caching

### Routes

- `src/pages/turmeric.astro` (new), `src/pages/rice.astro` and `src/pages/spices.astro` (rewritten) all load `story_pages.published` + linked product cards + lab reports, then render `StoryPageView`.
  - **Rollout guard:** while `published IS NULL`, `/rice` and `/spices` render their current hard-coded markup (moved to `src/components/store/legacy/RiceLegacy.astro` and `SpicesLegacy.astro`), and `/turmeric` returns 404.
  - **On D1 failure:** behave like today's category pages: log, send `Cache-Control: no-store`, and render the legacy page (rice and spices) or `/store-unavailable` (turmeric).
- Product pages: `ProductPageView` renders story sections when `product.story` is non-null.

### SEO

- `/turmeric`:
  - Title and description come from the page's SEO fields, with the claims check applied: "organic" is allowed because all linked products are certified.
  - Suggested title: "Stone-Ground Turmeric Powder (Haldi), Sun-Cured | HariLeaf". Canonical `https://harileaf.org/turmeric/`.
  - Emits BreadcrumbList (Home › Turmeric) and FAQPage when the FAQ is non-empty.
- `/rice` and `/spices`: the same pattern. `/spices` links to `/turmeric` (internal link) and to the chilli product.
- Product JSON-LD is unchanged. Story text adds crawlable content and is not marked up.
- `sitemap-store.xml` always lists `/rice/` and `/spices/` (they render either the story page or the legacy page), and lists `/turmeric/` only once it is published. `lastmod` is `published_at` when set.
- Internal links:
  - turmeric product page → `/turmeric` ("The turmeric story →", in place of the generic "How we grow, mill and grind →")
  - rice product pages → `/rice`
  - `/turmeric` → product pages and recipes

### Edge cache and purge

- `isEdgeCacheable()`: add `/turmeric` to `CACHED_EXACT` (`src/lib/store/edge-cache.ts`).
- On publish: purge the page's own path. Turmeric also purges `/spices`, since the hub card may change.
- On product save, `productPurgePaths()` adds every story page whose `product_ids` contains the product (`json_each` lookup), because prices, cards, lab tables and badges come from the product.
- On lab-report add/visibility change and on batch activation: purge the product path plus the story pages linking it, since proof lines and lab tables change.
- `purgeStorefrontStmts()` adds `/turmeric`.
- Preview routes are never cached (`/admin*` isn't edge-cacheable, and the response is `no-store`).

---

## Accessibility

- Timeline is an `<ol>`. Comparison is a `<table>` with `<caption>`, `scope="col"`/`scope="row"`. Lab table has headers and a text "Download PDF" link per row.
- The split comparison image carries `alt="Comparison: <ours> vs <theirs>; details in the table below"`. Gallery infographics carry full-sentence alt text (≥ 40 chars).
- Icons are inline SVG with `aria-hidden` next to visible labels. No emoji-only meaning.
- Text contrast is ≥ 4.5:1 on the dark shell (checked by Lighthouse CI). `FadeIn` already respects `prefers-reduced-motion`.
- Admin: every control is labelled, reorder buttons have descriptive aria-labels, field errors are linked via `aria-describedby`, and focus moves to the first error on a failed save.

---

## Testing

- **Unit** (`tests/unit/`):
  - `story.test.ts`: coercion, limits, step counts, required alt text, the numbers-need-source rule.
  - `story-claims.test.ts`:
    - page context: "organic" allowed only when all linked products are certified
    - "traditional" only with an evidenced claim on every product
    - health claims rejected
    - comparison banned terms
    - GI rule
    - certification words not typable
  - Extend `claims.test.ts` for comparison terms.
- **Integration** (`tests/integration/`):
  - `story-pages.test.ts`: save draft (blocked on banned wording), publish copies draft and writes `product_ids` + two `cache.purge` outbox rows, discard, preview POST renders without writing.
  - Extend `catalog-admin.test.ts`: product save with story and GI, and purge paths include linked story pages.
  - Extend `schema.test.ts` for migration 0008 constraints.
- **E2E** (`e2e/storefront.spec.ts`; `e2e/setup-db.mjs` seeds a published turmeric page and a story on the seeded rice product):
  - `/turmeric` renders hero, cards, comparison table, lab table
  - `/spices` links to `/turmeric`
  - the product page shows the proof line, timeline and comparison
  - legacy `/rice` still renders when unpublished (separate seed)
- **Lighthouse CI**: add `/turmeric/` to `lighthouserc.json`.

---

## Rollout

1. Ship code with migration 0008. Pages stay on the legacy markup, and `/turmeric` returns 404, until each page is published.
2. Owner fills in the turmeric product story and lab report, uploads two infographics, then publishes `/turmeric`, then the `/spices` hub.
3. Owner fills in the Wada Kolam story (plus GI number if available), then Karjat 3 and Red Rice, then publishes `/rice`.
4. Once all three pages are published, delete the legacy components in a follow-up PR.

---

## Owner-Supplied Inputs

| Input | Used for | Blocks |
|---|---|---|
| Turmeric batch lab report PDF with **curcumin %, volatile oil %, moisture** (and "added colour: not detected" if tested) | Proof line, lab card, lab table, oil-retention comparison row | Proof line values; numeric comparison rows |
| **PGS-India Organic certificate number** (and scan) for turmeric | Certification badge | Any "organic" wording on turmeric |
| **GI authorised-user registration number** for Wada Kolam (and certificate) | GI badge | Any "GI" wording |
| Grower names, village, years on the land, photos, **and the grower's OK to be named and pictured** | Grower cards | Grower section |
| **Years** the boiling/curing and the rice nursery/transplanting method have been used (≥ 30), with an evidence note | `traditional` process claims | Word "traditional" |
| **Grinding temperature basis**, e.g. measured at the mill | Comparison "heat" row | Any °C figure |
| Rice nutrient figures: lab or IFCT 2017 values for fibre, magnesium, thiamine (ours vs polished) | Rice comparison table | Numeric rice rows |
| Rice lab report (moisture, broken grains, residue) | Rice lab card and table | — |
| Prices, MRP, pack sizes (100/250/500 g turmeric; 1/5/10 kg rice), HSN, GST | Buy box | Selling |
| Rice district(s) / village | Hero eyebrow, origin story | — |
| Field and process photos (planting → stone mill; nursery → milling) | Photo strips, timeline | — |
| Two infographics per product (designed outside this work) | Gallery | — |

---

## Open Questions

1. Will whole dried turmeric fingers be sold? If yes, they need the same PGS certificate for `/turmeric` to keep "organic" (page context rule).
2. Does the PGS certificate name the specific farm and the turmeric crop? The badge assumes it covers this product.
3. Does the owner hold Wada Kolam GI **authorised-user** registration, or only grow in the GI area?
4. Is red chilli going to have an active product at hub launch, or a notify-me card?
5. Who designs the two infographics per product, and in which sizes? We recommend 1200×900, matching the gallery aspect ratio.
