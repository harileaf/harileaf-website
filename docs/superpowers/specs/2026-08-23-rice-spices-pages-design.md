# Rice & Spices Product Pages — Design Spec

**Date:** 2026-08-23
**Status:** Draft — awaiting user review
**Depends on:** existing produce page, admin CMS (R2 + KV), Web3Forms, `SiteLayout`, `FadeIn`

---

## Overview

Add two new product pages and lightly extend the produce page:

1. **`/rice`** — a consumer-first page showcasing HariLeaf's new rice line (Karjat 3, Wada Kolam, Red Rice), heavily focused on nutrition education (why unpolished is better, macro + micro nutrition, red rice vs white/brown), a community/philosophy section, and an online-ordering waitlist.
2. **`/spices`** — turmeric + red chili powder, built around an honest "traditional stone grinding preserves aroma & colour" education story, per-spice benefit modules, a value ("why it costs more") section, and a waitlist. Structured so **more spices can be added later**.
3. **`/produce` additions** — a navigable "Our Ranges" section linking to Rice + Spices, and an "online ordering — coming soon" hint on the existing bulk-order CTA.

All three pages continue the existing **Organic Bento** visual language: dark earthy sections, glass pills, radial colour blobs, emoji watermarks, `FadeIn` animations, and the `brand-gradient` accent. Rice uses the teal/olive brand palette; spices introduce a warm turmeric-gold (`#e0a53a`/`#e8b84a`) + chili-red (`#c0392b`/`#d05656`) accent within the same dark shell.

---

## Decisions Made

| Question | Decision |
|---|---|
| Page structure | Two new pages (`/rice`, `/spices`) + a navigable section on `/produce` |
| Rice framing | Consumer/product first (hero still announces "Now Growing Rice" as eyebrow) |
| Online ordering | **Waitlist capture** (notify-me via WhatsApp/email) on all three pages |
| Content accuracy | Real researched facts; honest, defensible claims only |
| Regional references | **No "Konkan"** or region-of-origin references anywhere |
| Spice processing story | Honest framing: cold/slow stone grinding preserves **aroma & colour** (not "all nutrition"); curcumin/capsaicin robustness acknowledged |
| Galleries | Clickable variety/product cards open a **shared photo gallery modal** (admin-managed), with per-item filter tabs |
| Macro/micro numbers | Show approximate numbers, clearly marked "approximate," with a "lab-testing our grain" honesty line |
| Photos | Admin-driven (R2), slotted dynamically; static placeholders until uploaded |
| Spices extensibility | Page built from repeatable per-spice modules + auto-fill product grid |

---

## Honest-Claims Guardrails (applies to all copy)

Derived from nutrition/food-science research. **These constraints are load-bearing — do not soften them into stronger claims.**

**Rice — safe to say:**
- Unpolished rice keeps the bran & germ that white rice loses in polishing.
- Red/unpolished rice has more fiber and minerals than white rice; generally a **lower glycemic index** than white rice.
- Red colour comes from antioxidant pigments (proanthocyanidins, some anthocyanins).
- Macro/micro values shown as **approximate**, "vary by harvest," with intent to publish lab-verified figures.

**Rice — avoid:** disease-risk claims ("prevents/controls diabetes, heart disease, cancer"), "diabetic-friendly," "detox/superfood," hard mineral mg numbers stated as fact, "10x more antioxidants than brown rice."

**Spices — safe to say:**
- High-speed industrial mills reach ~90–120°C; friction heat drives off **15–43%** of volatile aromatic oils and dulls colour.
- Cold/low-temperature grinding studies show **15–25% higher retention** of volatile oils, oleoresin, and curcumin.
- Slow stone grinding stays cooler than high-speed hammer/pin mills, protecting **aroma and colour** (the most heat-sensitive parts).
- Curcumin (turmeric) and capsaicin (chili) are both natural antioxidants/actives; turmeric has Ayurvedic heritage.

**Spices — avoid / be careful:** "keeps 100% of nutrition," "curcumin is heat-stable" (it is moderately heat-sensitive), "cold grinding preserves all medicinal benefit through cooking," quoting cryogenic retention numbers **as if** they came from stone grinding (attribute to "cold & low-temperature grinding studies"), health/disease cures. Include a visible **"honest note on health"** disclaimer (education, not medical advice).

---

## Shared Components & Patterns

New reusable pieces (all match existing token/utility conventions):

- **Waitlist form** — a compact "Online ordering — coming soon" capture. Single field accepting WhatsApp number OR email + "Notify me →" button. Submits via **Web3Forms** (same provider/pattern as the produce interest form), with a distinct `subject` per page. Secondary link: "Talk to us on WhatsApp" / bulk-order fallback. Amber "coming soon" badge style: `rgba(255,180,80,.14)` bg, `rgba(255,180,80,.3)` border, `#ffc878` text.
- **Photo gallery modal** — full-screen overlay (`rgba(6,10,6,.92)` + blur) with a filterable photo grid. Filter tabs derived from the page's items (rice: All/Karjat 3/Wada Kolam/Red Rice; spices: All/Turmeric/Red Chili). Opened by clicking any variety/product card (pre-selects that filter) or an "open full gallery" link. Closes on ✕ or backdrop click. Photos come from `/api/photos` filtered by a new `category` field (see CMS section).
- **Photo slots** — dashed placeholder boxes shown wherever an admin photo will appear but none exists yet.
- **Community/philosophy block** — shared idea ("Good food is grown, not manufactured") reinforcing organic + minimally-processed eating; can appear on `/rice` and optionally be reused.

---

## Page 1 — `/rice`

**File:** `src/pages/rice.astro` (new, `prerender = true`)
**Palette:** teal/olive brand, with a deep-red accent for the red-rice "nutrition hero."

### Section order (education-forward, product-supported)

1. **Hero** — dark gradient `linear-gradient(135deg,#0e1a0e,#1a2a1a)`, red + teal radial blobs, 🌾 watermark.
   - Eyebrow: "HariLeaf Farm · Now Growing Rice"
   - H1: "Rice with the goodness **left in.**" (second line `text-brand-gradient`)
   - Sub: nutrition-forward — grown organically, milled gently, nutrition stays in the grain.
   - Badges: 🌱 100% Organic · 🌾 3 Varieties · 🙌 Hand-Harvested · ✨ Minimally Milled · 🛒 Online Ordering — Coming Soon (amber)

2. **Varieties** — three **clickable** cards (hover lift; "View photos →"), each with a photo slot on top:
   - **Karjat 3** — "Everyday · Bold Grain." Dependable short-grain bred at a respected rice research station (no region). Chips: Bold grain / Everyday / Wholesome.
   - **Wada Kolam** — "Aromatic · GI-Tagged." Fine, fragrant "Basmati of Maharashtra"; GI-tagged 2021. Chips: GI-tagged / Aromatic / Fine grain.
   - **Red Rice** — "★ NUTRITION HERO" badge, red-tinted card. Unpolished; bran kept; nutty. Chips: Whole grain / Higher fiber / Lower GI.
   - Below: "open the full rice gallery →" link. All cards + link open the gallery modal.

3. **Why unpolished is better** — education centerpiece. Grain-anatomy diagram (Bran / Germ / Endosperm) with "WE KEEP IT" tags on bran & germ, next to a Polished(white) vs Unpolished(ours) checklist. Caption: "Polishing trades nutrition for shelf-life and colour. We choose the grain over the shelf."

4. **The full nutrition picture (macro + micro)** — two panels:
   - **Macronutrients** (per 100g uncooked, approximate) — Complex carbs ~73g, Dietary fiber ~5g, Protein ~7g, Healthy fats ~2.5g, each with a bar.
   - **Micronutrients & bioactives** — chips: Magnesium, Iron, Zinc, B-complex, Vitamin E, Manganese, Proanthocyanidins, Anthocyanins (each with a one-word function).
   - Followed by **White vs Brown vs Red** comparison bars (Fiber / Antioxidant pigments / Minerals / Gentle on blood sugar), red rice highlighted.
   - Honesty caption: illustrative, varies by harvest, lab-testing to publish verified figures.

5. **Community / philosophy** — "Good food is grown, not manufactured." Three pillars (Grown organically / Minimally processed / Grown for a community) + "Join the HariLeaf community →" CTA.
   - **CTA behaviour:** scrolls to the waitlist form (default). *(Open item: could instead link to an Instagram/WhatsApp community — see Open Questions.)*

6. **Waitlist** — "🛒 Online ordering — coming soon" → "Be first to get our rice at home." Notify-me field + fallback WhatsApp bulk-order link.

### Nutrition numbers (approximate, for unpolished red rice, per 100g uncooked)
Carbs ~73g · Fiber ~5g · Protein ~7g · Fat ~2.5g. Rendered with "approximate" label and lab-testing caveat. *(Open item: keep concrete numbers vs qualitative High/Med/Low — see Open Questions.)*

---

## Page 2 — `/spices`

**File:** `src/pages/spices.astro` (new, `prerender = true`)
**Palette:** dark shell `#0c0a08`; turmeric-gold + chili-red accents.

### Section order

1. **Hero** — gradient `linear-gradient(135deg,#1a0f06,#1a0a08)`, gold + red radial blobs, 🌶️ watermark.
   - Eyebrow: "HariLeaf Farm · Stone-Ground Spices"
   - H1: "You can **smell** the difference." ("smell" uses gold→red gradient)
   - Sub: "Turmeric and red chili, ground slowly on stone the traditional way — so the aromatic oils and vivid colour survive, instead of being burned off by high-speed industrial mills." *(Note: "low heat" deliberately removed from this sentence.)*
   - Badges: 🪨 Stone-Ground · 🌱 Organic · ☀️ Sun-Dried · 📦 Small-Batch · 🛒 Online Ordering — Coming Soon

2. **Products (scalable grid)** — CSS `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`:
   - **Turmeric Powder** ("Haldi · Stone-Ground") — clickable → gallery (turmeric filter).
   - **Red Chili Powder** ("Lal Mirchi · Stone-Ground") — clickable → gallery (chili filter).
   - **Ghost "More spices coming" card** — dashed placeholder (mentions coriander/cumin) signalling extensibility.

3. **Why grinding temperature changes everything** — shared education centerpiece. Side-by-side **Hot industrial mill** (gauge maxed, "90–120°C", red — drives off oils, dulls colour) vs **Our slow stone grinding** (gauge low, "Low heat", teal — oils stay, colour vivid). Big stat block: **15–43%** volatile oils lost to heat; cold-grinding 15–25% higher retention.

4. **Per-spice modules (repeatable `.smod`)** — "What's inside — and why it's good for you." Each module = header + two columns:
   - *What stone grinding protects* (compounds)
   - *Why people love it* (benefits)
   - **Turmeric:** protects turmerone aroma oils / curcumin colour / oleoresin; benefits: natural antioxidant / Ayurvedic heritage / golden milk.
   - **Red chili:** protects carotenoid colour / volatile oils / (honest) robust capsaicin heat; benefits: capsaicin warmth / carotenoid antioxidants / colour-heat-aroma.
   - Ends with a shared **"honest note on health"** disclaimer box (education, not medical advice).
   - **Extensibility:** adding a spice = adding one product card + one `.smod` module + a gallery filter tag.

5. **Why it costs more** — "Yes, it costs more / And here's exactly why it's worth it." Three cards: Slow by design / Sun-dried whole / Small batches.

6. **Waitlist** — "Get first access to our spices." Notify-me field + bulk/wholesale WhatsApp fallback.

---

## Page 3 — `/produce` additions

**File:** `src/pages/produce.astro` (edit — existing hero, bento catalogue, photo strip, interest form, organic-promise banner all unchanged).

1. **New "Our Ranges" section** (inserted after the bento catalogue, before/near the existing inline CTA) — two large clickable cards:
   - 🌾 **HariLeaf Rice** → `/rice` (teal identity)
   - 🌶️ **Stone-Ground Spices** → `/spices` (gold identity)
   - No "NEW" badge (removed per feedback).
2. **Online-ordering hint on existing CTA strip** — add "🛒 Online ordering — coming soon" badge and a secondary "Notify me when ordering opens" button alongside the existing "Request Produce ↓" button. Existing bulk-order flow preserved.

---

## Navigation Changes

`src/content/navigation.json` — add two items. Proposed order (Produce remains the hub):

```json
{ "label": "Produce", "url": "/produce", "children": [] },
{ "label": "Rice",    "url": "/rice",    "children": [] },
{ "label": "Spices",  "url": "/spices",  "children": [] },
```

*(Open item: flat nav vs grouping Rice/Spices under a "Produce" dropdown — see Open Questions.)*

---

## CMS / Dynamic Content

Reuse the existing admin (R2 `harileaf-media` + KV `HARILEAF_CMS` + passphrase auth). Two extensions:

1. **Photo categories for galleries.** Extend the photo record with an optional `category` string so the rice/spices galleries can filter:
   ```json
   { "key": "...", "label": "...", "url": "...", "category": "rice:red" }
   ```
   - Suggested category values: `rice:karjat`, `rice:wada`, `rice:red`, `spice:turmeric`, `spice:chili` (plus future spices).
   - `GET /api/photos` already returns all photos; galleries filter client-side by `category` prefix (`rice:` / `spice:`) and exact tag. Admin upload form gains a category selector. Backward compatible: photos without a category simply don't appear in the filtered galleries.

2. **Waitlist submissions.** No new backend — waitlist uses **Web3Forms** (same `access_key` as the produce/contact forms). Distinct `subject` per page:
   - `subject` = "Rice Waitlist — HariLeaf Farm" / "Spices Waitlist — HariLeaf Farm" / "Produce Ordering Waitlist — HariLeaf Farm".
   - `redirect` → `?success=true` (existing success-banner pattern).
   - Honeypot `botcheck` included.

Static content (variety copy, nutrition text, benefit copy) is **hardcoded in the `.astro` files** for v1 (matches how the produce catalogue text was initially handled). Photos are the only dynamic content in v1. *(Making variety/spice copy CMS-editable is a possible follow-up, not in scope here.)*

---

## SEO

Each new page uses the existing `SEO` component with a canonical URL and page-specific title/description, e.g.:
- `/rice` — "Organic Rice | HariLeaf Farm — Karjat 3, Wada Kolam & Red Rice" ; nutrition-forward description.
- `/spices` — "Stone-Ground Organic Turmeric & Red Chili | HariLeaf Farm" ; aroma/traditional-processing description.

Galleries are modal (not separate URLs) in v1; dedicated per-variety gallery pages for extra SEO surface are a possible follow-up.

---

## Animations

Reuse existing `FadeIn` / IntersectionObserver system and `brand-gradient` utility. Hero: delay ladder (0/100/200/300ms). Cards: staggered `FadeIn`. Gallery modal: simple show/hide + backdrop blur. No new animation infrastructure.

---

## Files Changed / Created

| File | Change |
|---|---|
| `src/pages/rice.astro` | **New** — rice page |
| `src/pages/spices.astro` | **New** — spices page |
| `src/pages/produce.astro` | Edit — add "Our Ranges" section + ordering hint on CTA |
| `src/content/navigation.json` | Add "Rice" and "Spices" nav items |
| Gallery modal + waitlist form | New markup/partials (inline or small components under `src/components/`) reused across pages |
| Admin photo upload + `/api/photos` + photo record type | Extend with optional `category` field (CMS types in `src/lib/cms-types.ts`, admin UI in `src/pages/admin.astro`) |

No changes to auth, KV/R2 infrastructure, or the Web3Forms integration beyond new `subject` values.

---

## Open Questions (for implementation phase)

1. **Community CTA target** — scroll to waitlist (default) vs link to a real Instagram/WhatsApp community channel. Needs the actual channel URL if the latter.
2. **Rice nutrition numbers** — keep concrete approximate grams vs qualitative High/Med/Low bars until lab-tested.
3. **Nav shape** — flat (Rice, Spices as top-level) vs a "Produce ▾" dropdown grouping them.
4. **Gallery** — modal (v1) vs dedicated SEO gallery pages (follow-up).
