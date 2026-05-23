# Produce Section Design Spec
**Date:** 2026-05-23  
**Status:** Approved

---

## Overview

Add a produce catalogue + bulk request form to the HariLeaf site. Structure: a teaser section on the homepage and a full `/produce` page. All 18 items are organically grown and available for bulk orders. The design uses the existing Organic Bento direction with a light page shell and a dark bento catalogue section.

---

## Decisions Made

| Question | Decision |
|---|---|
| Structure | C — homepage teaser + full `/produce` page |
| Design direction | A — Organic Bento Grid |
| Theme | C — light page, dark bento section only |
| Form | C — Express Interest (name, contact, item chips) |

---

## Produce Catalogue

### Fruits (9 items)
- **Mangoes** — 6 varieties: Alphonso, Kesar Gir, Payri, Langda, Rajapuri, Badami *(featured hero cell)*
- Chicoo
- Papaya
- Watermelon
- Black Jamun
- Dragon Fruit
- Muskmelon
- Laxman Fruit
- Lemon

### Vegetables & Herbs (6 items)
- Okra
- Methi
- Cilantro
- Red Amaranth
- Cow Pea (Chavli)
- Elephant Foot (Suran)

### Flowers (3 items)
- Marigold
- Roses
- Lillies

---

## Part 1 — Homepage Teaser Section

**File:** `src/pages/index.astro` (new section inserted after existing Section 4 / intelligence+CTA section, before the footer)

**Background:** `bg-surface-container-low` (`#f1f5ee`) — matches existing alternating rhythm  
**Padding:** `py-24 px-6` — standard section rhythm

### Layout
```
[Label: "From Our Farm"]
[Headline: "Grown with care. Available in bulk."]
[Subtext: 18 organically grown produce items — fruits, vegetables, herbs and flowers...]
[Produce chips row: 🥭 Alphonso Mangoes (6 varieties badge) | 🍉 Watermelon | 🐉 Dragon Fruit | 🌿 Methi · Cilantro | 🌹 Roses · Marigold | +13 more →]
[CTA button: "See all produce & request in bulk →" (brand-gradient, rounded-full)]
[Sub-note: "100% organic · Farm direct"]
```

### Produce chips
- White pill cards with border, emoji + name
- Hover: border-color `primary/30`, text `primary`, translateY(-1px)
- The "+13 more →" chip links to `/produce`

### CTA
- `brand-gradient` background, `text-on-primary`, `rounded-full`
- Links to `/produce`
- Same style as existing primary CTAs across the site

---

## Part 2 — `/produce` Page

**File:** `src/pages/produce.astro` (new page)  
**Nav entry:** Add `{ "label": "Produce", "url": "/produce" }` to `src/content/navigation.json` between Solutions and About

### Section 1 — Hero
**Theme:** Dark (`bg` = `linear-gradient(135deg, #0e1a0e, #1a2a1a)`)  
**Height:** ~380px

- Eyebrow label: "HariLeaf Farm · Organic Produce" (`text-xs uppercase tracking-widest text-secondary`)
- H1: "From the earth, directly to you." — "directly to you" uses `text-brand-gradient`
- Subtext: "18 varieties of fruits, vegetables, herbs and flowers — all organically grown on our farm, available for bulk orders."
- Badge pills (glass style): 🌱 100% Organic · 🚜 Farm Direct · 📦 Bulk Available · No Chemicals
- Decorative: large mango emoji watermark, absolute positioned right, low opacity
- Radial colour blobs: warm amber top-right, teal bottom-left (CSS only, no images)

### Section 2 — Bento Catalogue
**Background:** `#0c110c` (deep forest near-black)  
**Padding:** `py-16 px-6`

**Grid:** CSS `grid-template-columns: repeat(12, 1fr)` with `gap-2`

#### Mango hero cell (col-span-7, min-height 200px)
- Background: `linear-gradient(145deg, #1e1208, #0e1a0e)` + amber radial glow top-right
- Large 🥭 emoji, absolute positioned, low opacity
- Tag: "⭐ Featured · 6 Varieties"
- Name: "Heritage Mangoes"
- Variety pills (glass): Alphonso · Kesar Gir · Payri · Langda · Rajapuri · Badami
- Hover on pills: amber tint

#### Watermelon cell (col-span-5, tall, row-span-2)
- Subtle red radial glow behind emoji
- Larger emoji (2.5rem)

#### Individual fruit cells (col-span-3 or col-span-4 each)
- Chicoo, Papaya, Lemon, Black Jamun, Muskmelon, Laxman Fruit
- Each: emoji + name + category sub-label + pulsing green organic dot (top-right)
- Hover: `translateY(-2px)`, border-color `primary/22`, ambient glow underneath

#### Vegetables & Herbs — wide grouped card (col-span-7)
- Olive-green gradient background
- Label: "🌿 Vegetables & Herbs"
- All 6 items listed: Okra · Methi · Cilantro · Red Amaranth · Cow Pea (Chavli) · Elephant Foot (Suran)

#### Flower cells
- Roses (col-span-3) with rose-pink glow, Marigold (col-span-2) with amber glow
- Lillies — full-width horizontal row card (col-span-12), inline layout

#### Inline CTA strip (col-span-12)
- Dark teal gradient background
- Text: "Interested in placing a bulk order?"
- Eyebrow: "All produce organically grown · No chemicals · No pesticides"
- Button: "Request Produce ↓" (brand-gradient, rounded-full) — smooth-scrolls to form below

#### Pulsing organic dot
- 6×6px circle, `#9fb17d`, `box-shadow: 0 0 6px rgba(159,177,125,0.6)`
- CSS keyframe animation: `pulse-dot` — scale 1→1.4→1, opacity 1→0.5→1, 2.5s infinite

### Section 3 — Express Interest Form
**Background:** `bg-surface` (`#f7faf4`) — back to light  
**Padding:** `py-24 px-6`

**Layout:** max-width 540px, left-aligned

- Eyebrow: "Bulk Orders"
- Heading: "Express your interest"
- Subtext: "Tell us what you're looking for and we'll get back to you on WhatsApp. All produce is organic, farm-direct, available in bulk."

**Fields:**
1. **Your Name** (text, required)
2. **WhatsApp or Email** (text, required) — single field, accepts either
3. **I'm interested in…** — all 18 produce items as toggleable chips (multi-select, no limit)
   - Chips are pill-shaped, white background, toggle to `primary/8` bg + `primary/30` border on select
   - No validation required — user may select none
   - **Implementation note:** Each item is a visually-styled `<label>` wrapping a hidden `<input type="checkbox" name="items">` — Web3Forms receives selected items as a comma-joined list via the `items` field. JavaScript toggles the visual selected state on click.

**Hidden fields (Web3Forms):**
- `access_key` — from existing CMS value (same key used on contact page)
- `subject` — "Bulk Produce Request — HariLeaf Farm"
- `redirect` — `?success=true` (same pattern as contact page)
- `botcheck` — honeypot

**Submit button:** "I'm Interested →" — `brand-gradient`, `rounded-full`, full-width on mobile  
**Success state:** Same success banner pattern as `contact.astro` — green check, "Thanks! We'll reach out within 24 hours."  
**Sub-note below button:** "We'll reach out on WhatsApp within 24 hours."

### Section 4 — Organic Promise Banner
**Background:** `#2e3a2e` (brand.forest)  
**Padding:** `py-14 px-6`

- Eyebrow: "Our promise"
- Heading: "Everything we grow is 100% organic. No chemicals, ever."
- Badge pills: No Pesticides · No Synthetic Fertilisers · Traditional Methods · Farm Direct
- Decorative: large 🌱 emoji, absolute right, very low opacity

---

## Navigation Change

`src/content/navigation.json` — insert after Solutions & Farms, before About:
```json
{ "label": "Produce", "url": "/produce", "children": [] }
```

---

## Animations

All sections use existing `FadeIn` component with `data-animate` / IntersectionObserver system already in place. No new animation infrastructure needed.

- Bento cells: `StaggerChildren` wrapper with `--stagger: 60ms`
- Hero content: standard `FadeIn` with delay ladder (0 / 100 / 200ms)
- Form chips: no animation (interactive element, no entrance animation)

---

## Form Submission

Uses Web3Forms (same provider as existing contact page). Access key sourced from `src/content/contact-page.json` → `form.web3formsKey`. No Cloudflare Turnstile on this form (low-stakes interest expression).

---

## CMS / Content

All produce data (names, categories, emoji, varieties) is hardcoded in the `.astro` file — no new CMS schema needed. The list is stable and unlikely to change frequently.

---

## Files Changed / Created

| File | Change |
|---|---|
| `src/pages/produce.astro` | **New** — full produce page |
| `src/pages/index.astro` | Add teaser section (Section 4.5) |
| `src/content/navigation.json` | Add "Produce" nav item |

No new components required — all layout uses existing `FadeIn`, `StaggerChildren`, `SiteLayout`, and Tailwind utilities.
