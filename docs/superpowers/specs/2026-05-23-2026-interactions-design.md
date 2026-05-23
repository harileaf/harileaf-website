# 2026 Motion & Interaction Upgrade — Design Spec
**Date:** 2026-05-23
**Status:** Approved
**Branch:** `feat/2026-interactions`

---

## Overview

Add 9 micro-animations and micro-interactions sitewide to make HariLeaf feel premium and investor-ready. Layout and content are unchanged. All interactions layer on top of the existing design system.

**Chosen style:** Subtle & Premium (Linear / Stripe / Vercel aesthetic — motion that makes content feel alive, not motion that distracts from it).

**Priority page:** Homepage, but all effects applied sitewide.

---

## Decisions

| Question | Decision |
|---|---|
| Style direction | A — Subtle & Premium |
| Layout changes | None — motion layer only |
| Interactions scope | All 9 selected |
| Implementation | No new npm packages — pure DOM JS + CSS |
| Delivery | Branch `feat/2026-interactions`, merge when done |

---

## Architecture

### New file: `src/scripts/interactions.ts`

One consolidated client-side script for the 4 JS-based effects. Loaded via `<script>` in `SiteLayout.astro`. Uses `data-*` attributes to opt-in per element — no class coupling.

```
data-magnetic   → magnetic hover on brand-gradient buttons
data-tilt       → 3D perspective tilt on cards
data-cursor-glow-zone → marks the hero section for cursor glow
```

The script initialises on `astro:page-load` (compatible with View Transitions) and tears down listeners on `astro:before-swap`. ~150 lines total.

### CSS-only changes: `src/styles/global.css`

5 interactions are pure CSS — no JS:
- Nav link underline reveal (pseudo-element)
- Gradient text shimmer (one-shot on page load)
- Button press ring flash (`:active` rule)
- Mobile menu slide transition (CSS `transform` replaces `display: none`)
- Scroll progress bar styles (element positioned by JS, styled by CSS)

### `CountUp.astro` — existing component, just wire it in

`src/components/animations/CountUp.astro` already exists and works. Tasks just replace bare number strings with `<CountUp>` calls on the homepage, technology, and solutions pages.

---

## The 9 Interactions

### 1 — CountUp numbers

**Where:** Every stat/number on every page that is a real metric.

- Homepage: `bento.cards[1].statValue` ("12,400+" active nodes), `editorial.metricValue` ("1.2 MT/yr")
- Technology page: "99.4%" uptime (line 77), "98%" accuracy (line 211), "40% reduction", "65% reduction"
- Solutions page: any numeric stats in farm cards

**Implementation:**
```astro
import CountUp from '../components/animations/CountUp.astro';

<!-- Replace: <span>99.4%</span> -->
<!-- With:    <CountUp value={99.4} suffix="%" decimals={1} /> -->
```

For values like "12,400+" — use `<CountUp value={12400} suffix="+" />` (CountUp already abbreviates 12k+).

**Behaviour:** Rolls from 0 to target over 2000ms with ease-out-quart easing when scrolled into view. Fires once. Respects `prefers-reduced-motion` (snaps to final value instantly).

---

### 2 — Magnetic CTAs

**Where:** All elements with class `brand-gradient` that are buttons or anchor tags sitewide.

**Behaviour:**
- On `mousemove` within 80px of the button boundary: button translates toward the cursor, max displacement 8px X and 5px Y
- Displacement = `(cursor distance from center / 80) * maxOffset`
- On `mouseleave`: spring back to (0,0) with `cubic-bezier(0.34, 1.56, 0.64, 1)` over 400ms
- Uses `transform: translate(x, y)` — no layout thrash

**Opt-in:** Add `data-magnetic` attribute to buttons in templates. The `interactions.ts` script finds all `[data-magnetic]` elements and attaches listeners.

**Pages to update:** `Header.astro` CTA button, `index.astro` primary CTA, all pages with a brand-gradient `<a>` or `<button>`.

---

### 3 — 3D card tilt

**Where:** Technology bento cards (section 2 of homepage), feature cards (section 4 of homepage), farm cards on solutions page.

**Behaviour:**
- On `mousemove` over card: `perspective(800px) rotateX(Ydeg) rotateY(Xdeg)` — max 6deg each axis
- Shadow shifts in the direction of tilt: `box-shadow` offset proportional to rotation
- On `mouseleave`: reset to `rotateX(0) rotateY(0)` with `transition: transform 400ms cubic-bezier(0.16, 1, 0.3, 1)`
- `transform-style: preserve-3d` on the card wrapper

**Opt-in:** Add `data-tilt` to card `<div>` wrappers. Existing `.bento-card` hover transform in `produce.astro` is separate and not replaced.

---

### 4 — Hero cursor glow

**Where:** Homepage hero section only (`src/pages/index.astro`, section 1).

**Behaviour:**
- A `300px × 300px` radial gradient `<div>` sits absolutely inside the hero at pointer-none
- On `mousemove` within the hero: move the glow to cursor position using CSS custom properties `--cx` and `--cy` via JS, with 80ms lerp smoothing
- CSS: `background: radial-gradient(circle at var(--cx) var(--cy), rgba(127,200,186,0.12) 0%, transparent 60%)`
- On `mouseleave`: fade glow to opacity 0 over 600ms
- Hidden entirely on touch devices (`@media (hover: none) { display: none }`)

**Implementation:**
```html
<!-- In hero section -->
<div id="hero-glow" class="absolute inset-0 pointer-events-none" aria-hidden="true"
  style="background: radial-gradient(600px circle at var(--cx, 50%) var(--cy, 50%), rgba(127,200,186,0.10) 0%, transparent 60%); opacity: 0; transition: opacity 600ms;">
</div>
```

---

### 5 — Scroll progress bar

**Where:** All pages — rendered inside `SiteLayout.astro`.

**Implementation:**
```html
<!-- In SiteLayout.astro, after <Header> -->
<div id="scroll-progress" aria-hidden="true"
  class="fixed top-0 left-0 z-[60] h-[2px] w-0 pointer-events-none"
  style="background: linear-gradient(90deg, #196a5e, #9fb17d);">
</div>
```

JS in `interactions.ts`:
```ts
function initScrollProgress() {
  const bar = document.getElementById('scroll-progress');
  if (!bar) return;
  const update = () => {
    const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight);
    bar.style.width = `${Math.min(pct * 100, 100)}%`;
  };
  window.addEventListener('scroll', update, { passive: true });
}
```

---

### 6 — Nav link underlines

**Where:** Desktop nav links in `Header.astro` (non-active links only).

**CSS to add to `global.css`:**
```css
.nav-link-animated {
  position: relative;
}
.nav-link-animated::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 1.5px;
  background: linear-gradient(90deg, #196a5e, #9fb17d);
  border-radius: 999px;
  transition: width 300ms cubic-bezier(0.16, 1, 0.3, 1);
}
.nav-link-animated:hover::after {
  width: 100%;
}
```

**In `Header.astro`:** Add `nav-link-animated` to the inactive link class list. Active links keep their `border-b-2 border-[#196A5E]` — no pseudo-element on active.

---

### 7 — Gradient text shimmer

**Where:** `.text-brand-gradient` elements on hero h1 and section headings.

**CSS to add to `global.css`:**
```css
@keyframes shimmer-once {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}

.text-brand-gradient {
  /* extend existing rule */
  background-size: 200% auto;
  animation: shimmer-once 1.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s 1 forwards;
}
```

The `1` iteration count + `forwards` fill means it runs once on load and stops. The gradient then stays static (no looping).

**Reduced motion:** Wrapped in `@media (prefers-reduced-motion: no-preference)` — motion-sensitive users see a static gradient.

---

### 8 — Mobile menu slide transition

**Where:** `Header.astro` mobile menu overlay (`#mobile-menu`).

**Current behaviour:** `display: none` / `removeAttribute('style')` — instant show/hide.

**New behaviour:**
- Menu starts `translateX(100%)`, transitions to `translateX(0)` in 350ms with `cubic-bezier(0.16, 1, 0.3, 1)`
- Nav links stagger in: each `<li>` has `opacity: 0; translateY(8px)` → visible, staggered at 40ms intervals
- On close: reverse — menu slides to `translateX(100%)`, links fade out simultaneously

**CSS approach (replace `display: none` toggle):**
```css
#mobile-menu {
  transform: translateX(100%);
  transition: transform 350ms cubic-bezier(0.16, 1, 0.3, 1);
  /* Remove display:none — always in DOM, hidden via transform */
}
#mobile-menu.open {
  transform: translateX(0);
}
#mobile-menu li {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 250ms, transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
}
#mobile-menu.open li:nth-child(1) { opacity:1; transform:none; transition-delay: 80ms; }
#mobile-menu.open li:nth-child(2) { opacity:1; transform:none; transition-delay: 120ms; }
#mobile-menu.open li:nth-child(3) { opacity:1; transform:none; transition-delay: 160ms; }
#mobile-menu.open li:nth-child(4) { opacity:1; transform:none; transition-delay: 200ms; }
#mobile-menu.open li:nth-child(5) { opacity:1; transform:none; transition-delay: 240ms; }
```

**JS change:** Replace `menu.removeAttribute('style')` / `menu.setAttribute('style', 'display:none')` with `menu.classList.add('open')` / `menu.classList.remove('open')`. Keep `aria-hidden` toggle. Remove `style="display: none;"` from the HTML.

**Backdrop:** Existing backdrop div fades in with `opacity: 0 → 1` on open (CSS transition, replace `display:none` with `opacity` toggle).

---

### 9 — Button press feedback

**Where:** All buttons and anchor CTAs sitewide.

**Current state:** `active:scale-[0.98]` already exists on some buttons. Inconsistent.

**New CSS in `global.css`:**
```css
/* All buttons */
button:active {
  transform: scale(0.95);
  transition: transform 80ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Brand-gradient CTAs — scale + ring flash */
.brand-gradient:active {
  transform: scale(0.95);
  transition: transform 80ms cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 0 0 3px rgba(127, 200, 186, 0.35);
}

/* Pill secondary buttons */
.btn-secondary:active {
  transform: scale(0.95);
  transition: transform 80ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

Add `btn-secondary` class to secondary pill buttons in templates (currently they have inline `active:scale-[0.98]`). Remove all existing `active:scale-[0.98]` Tailwind classes from templates — replaced by the global CSS rules.

---

## Files Changed

| File | Change |
|---|---|
| `src/scripts/interactions.ts` | **New** — magnetic, tilt, cursor glow, scroll progress JS |
| `src/styles/global.css` | Add 6 CSS rules: nav underline, shimmer, button press, mobile menu transition, scroll progress bar, reduced-motion guards |
| `src/layouts/SiteLayout.astro` | Add scroll progress bar `<div>` + `<script src="/src/scripts/interactions.ts">` |
| `src/components/layout/Header.astro` | Nav link underline class, mobile menu CSS transition (remove `style="display:none"`) |
| `src/pages/index.astro` | Add `data-magnetic` to CTAs, `data-tilt` to bento/feature cards, hero glow div, `<CountUp>` on stats |
| `src/pages/technology.astro` | `<CountUp>` on metrics (99.4%, 98%, 40%, 65%), `data-tilt` on feature cards |
| `src/pages/solutions.astro` | `<CountUp>` on farm stats, `data-tilt` on farm cards |

---

## Animations not changed

- `FadeIn` / `StaggerChildren` scroll reveal system — unchanged
- Produce page `pulse-dot` / bento card hover — unchanged
- All existing `hover:opacity-90`, `transition-colors` etc. — unchanged (button press rule adds on top)

---

## Performance

- No new npm packages
- `interactions.ts` is ~150 lines, tree-shaken at build
- All JS uses `passive: true` on scroll/mousemove listeners
- Tilt and magnetic use `transform` only — no layout thrash, GPU composited
- Reduced motion: all JS effects check `window.matchMedia('(prefers-reduced-motion: reduce)')` and skip if true
- Touch devices: magnetic and cursor glow skip on `'ontouchstart' in window`
