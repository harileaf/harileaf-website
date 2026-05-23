# Produce Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a produce catalogue page (`/produce`) with an organic bento grid, express-interest form, and a teaser section on the homepage.

**Architecture:** Three file changes — new `produce.astro` page, a teaser section appended to `index.astro`, and a nav item added to `navigation.json`. All produce data is hardcoded in the Astro frontmatter (no CMS). The bento catalogue is a dark section mid-page; the rest of the page is light, matching the existing site theme. Form uses Web3Forms (same key as contact page).

**Tech Stack:** Astro 6, Tailwind CSS 3, Web3Forms, existing `FadeIn` / `StaggerChildren` animation components.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/content/navigation.json` | Modify | Add "Produce" nav item |
| `src/pages/produce.astro` | **Create** | Full produce page — hero, bento, form, banner |
| `src/pages/index.astro` | Modify | Append teaser section before `</SiteLayout>` |

---

## Task 1: Add Produce to navigation

**Files:**
- Modify: `src/content/navigation.json`

- [ ] **Open `src/content/navigation.json`.** It currently reads:
  ```json
  {
    "items": [
      { "label": "Technology",        "url": "/technology", "children": [] },
      { "label": "Solutions & Farms", "url": "/solutions",  "children": [] },
      { "label": "About",             "url": "/about",      "children": [] },
      { "label": "Contact",           "url": "/contact",    "children": [] }
    ],
    ...
  }
  ```

- [ ] **Insert the Produce item after Solutions & Farms:**
  ```json
  {
    "items": [
      { "label": "Technology",        "url": "/technology", "children": [] },
      { "label": "Solutions & Farms", "url": "/solutions",  "children": [] },
      { "label": "Produce",           "url": "/produce",    "children": [] },
      { "label": "About",             "url": "/about",      "children": [] },
      { "label": "Contact",           "url": "/contact",    "children": [] }
    ],
    "ctaButton": {
      "label": "Get Started",
      "url": "/contact"
    }
  }
  ```

- [ ] **Verify in the browser** — open http://localhost:4321 and confirm "Produce" appears in the header between Solutions & Farms and About. It will 404 for now — that's expected.

- [ ] **Commit:**
  ```bash
  git add src/content/navigation.json
  git commit -m "feat: add Produce nav item"
  ```

---

## Task 2: Create produce.astro — scaffold, SEO, and hero

**Files:**
- Create: `src/pages/produce.astro`

- [ ] **Create the file with frontmatter, imports, and the hero section:**

  ```astro
  ---
  export const prerender = true;
  import SiteLayout from '../layouts/SiteLayout.astro';
  import FadeIn from '../components/animations/FadeIn.astro';
  import SEO from '../components/seo/SEO.astro';
  import contactJson from '../content/contact-page.json';

  const web3formsKey = contactJson.form.web3formsKey;
  const success = Astro.url.searchParams.get('success') === 'true';
  const canonicalURL = new URL(Astro.url.pathname, Astro.site ?? 'https://harileaf.ag');
  const pageTitle = 'Organic Produce | HariLeaf Farm — Fruits, Vegetables & Flowers';
  const pageDesc  = 'Organically grown fruits, vegetables, herbs and flowers from HariLeaf Farm. Mangoes, Dragon Fruit, Roses and more — available in bulk, farm direct.';

  const mangoVarieties = ['Alphonso', 'Kesar Gir', 'Payri', 'Langda', 'Rajapuri', 'Badami'];
  ---

  <SiteLayout title={pageTitle} description={pageDesc}>

    <slot name="head" slot="head">
      <SEO title={pageTitle} description={pageDesc} canonicalUrl={canonicalURL} />
    </slot>

    <!-- ══════════════════════════════════════════════════════
         HERO — dark earthy gradient
         ══════════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden" style="background: linear-gradient(135deg, #0e1a0e 0%, #1a2a1a 100%); min-height: 380px; display: flex; align-items: center; padding-top: 5rem;">

      <!-- Colour blobs (CSS only, no images) -->
      <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div style="position:absolute;top:0;right:0;width:40%;height:100%;background:radial-gradient(ellipse at 90% 30%, rgba(255,160,30,0.15) 0%, transparent 55%);"></div>
        <div style="position:absolute;bottom:0;left:0;width:40%;height:100%;background:radial-gradient(ellipse at 10% 80%, rgba(127,200,186,0.12) 0%, transparent 50%);"></div>
      </div>

      <!-- Decorative mango watermark -->
      <div class="absolute right-8 top-1/2 -translate-y-1/2 text-[8rem] opacity-[0.14] select-none pointer-events-none" aria-hidden="true">🥭</div>

      <div class="relative z-10 max-w-7xl mx-auto px-6 w-full">
        <FadeIn>
          <span class="text-xs uppercase tracking-widest font-bold" style="color: rgba(159,177,125,0.9);">
            HariLeaf Farm · Organic Produce
          </span>
        </FadeIn>
        <FadeIn delay={100}>
          <h1 class="text-5xl md:text-6xl font-extrabold tracking-tighter leading-[1.1] mt-4 text-white">
            From the earth,<br />
            <span class="text-brand-gradient">directly to you.</span>
          </h1>
        </FadeIn>
        <FadeIn delay={200}>
          <p class="mt-5 text-lg max-w-xl leading-relaxed" style="color: rgba(255,255,255,0.55);">
            18 varieties of fruits, vegetables, herbs and flowers — all organically grown on our farm, available for bulk orders.
          </p>
        </FadeIn>
        <FadeIn delay={300}>
          <div class="mt-7 flex flex-wrap gap-3">
            {[
              { icon: '🌱', label: '100% Organic' },
              { icon: '🚜', label: 'Farm Direct' },
              { icon: '📦', label: 'Bulk Available' },
              { icon: '🚫', label: 'No Chemicals' },
            ].map(b => (
              <span
                class="text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-full"
                style="background: rgba(255,255,255,0.08); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.75);"
              >
                {b.icon} {b.label}
              </span>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>

  </SiteLayout>
  ```

- [ ] **Check the dev server** — open http://localhost:4321/produce. You should see the dark hero with headline, badges, and mango watermark. Run type check:
  ```bash
  npm run astro check
  ```
  Expected: no errors.

- [ ] **Commit:**
  ```bash
  git add src/pages/produce.astro
  git commit -m "feat: add produce page hero"
  ```

---

## Task 3: Bento section — shell, styles, and mango hero cell

**Files:**
- Modify: `src/pages/produce.astro`

- [ ] **Add a `<style>` block inside the Astro file** (place it after the frontmatter closing `---`, before the `<SiteLayout>` tag):

  ```astro
  <style>
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.5; transform: scale(1.4); }
    }
    .organic-dot {
      animation: pulse-dot 2.5s ease-in-out infinite;
    }
    .bento-card {
      transition: background-color 200ms cubic-bezier(0.16, 1, 0.3, 1),
                  border-color 200ms cubic-bezier(0.16, 1, 0.3, 1),
                  transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
                  box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .bento-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(25,106,94,0.12);
    }
    .mango-pill:hover {
      background: rgba(255,170,50,0.2);
      border-color: rgba(255,170,50,0.35);
    }
    .item-chip {
      transition: background-color 150ms, border-color 150ms, color 150ms;
      cursor: pointer;
    }
    .item-chip:has(input:checked) {
      background-color: rgba(25, 106, 94, 0.09);
      border-color: rgba(25, 106, 94, 0.35);
      color: #196a5e;
    }
  </style>
  ```

- [ ] **Add the bento section** after the hero `</section>` and before `</SiteLayout>`:

  ```astro
  <!-- ══════════════════════════════════════════════════════
       BENTO CATALOGUE — dark section
       ══════════════════════════════════════════════════════ -->
  <section style="background: #0c110c;" class="py-16 px-6">
    <div class="max-w-7xl mx-auto">

      <FadeIn>
        <p class="text-xs uppercase tracking-widest font-bold mb-2" style="color: rgba(159,177,125,0.7);">Our Produce</p>
        <h2 class="text-3xl font-extrabold tracking-tight mb-10" style="color: #f0f0ee;">Everything we grow</h2>
      </FadeIn>

      <div class="grid grid-cols-12 gap-2">

        <!-- ── Mango hero cell (col-span-7) ── -->
        <FadeIn class="col-span-12 md:col-span-7">
          <div
            class="bento-card relative overflow-hidden rounded-xl p-6 flex flex-col justify-end border"
            style="min-height:210px; background:linear-gradient(145deg,#1e1208 0%,#0e1a0e 100%); border-color:rgba(255,160,30,0.12);"
          >
            <!-- Amber radial glow -->
            <div class="absolute inset-0 pointer-events-none" style="background:radial-gradient(ellipse at 88% 20%, rgba(255,160,30,0.22) 0%, transparent 55%);" aria-hidden="true"></div>
            <!-- Watermark emoji -->
            <div class="absolute top-4 right-5 text-[5rem] opacity-50 select-none pointer-events-none" aria-hidden="true">🥭</div>

            <div class="relative z-10">
              <p class="text-xs font-bold uppercase tracking-wider mb-1" style="color:rgba(255,180,80,0.85);">⭐ Featured · 6 Varieties</p>
              <h3 class="text-xl font-extrabold tracking-tight mb-3" style="color:#fff;">Heritage Mangoes</h3>
              <div class="flex flex-wrap gap-1.5">
                {mangoVarieties.map(v => (
                  <span
                    class="mango-pill text-xs font-semibold px-2.5 py-1 rounded-full transition-colors"
                    style="background:rgba(255,255,255,0.1);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.88);"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>

        <!-- Remaining cells added in Task 4 & 5 -->

      </div>
    </div>
  </section>
  ```

- [ ] **Check the browser** — http://localhost:4321/produce should show the dark section with the mango hero card. Variety pills should appear. Run `npm run astro check` — expect no errors.

- [ ] **Commit:**
  ```bash
  git add src/pages/produce.astro
  git commit -m "feat: add bento section shell and mango hero cell"
  ```

---

## Task 4: Bento — fruit cells (Watermelon + row 2 + row 3)

**Files:**
- Modify: `src/pages/produce.astro`

The grid layout after the mango cell:
- **Row 1 col 8-12:** Watermelon (col-span-5, tall)
- **Row 2:** Chicoo(3) | Papaya(3) | Lemon(3) | Dragon Fruit(3)
- **Row 3:** Black Jamun(4) | Muskmelon(4) | Laxman Fruit(4)

- [ ] **Add fruit cells** inside the `grid grid-cols-12 gap-2` div, after the mango FadeIn block (replace the `<!-- Remaining cells added in Task 4 & 5 -->` comment):

  ```astro
  <!-- ── Watermelon (col-span-5, tall) ── -->
  <FadeIn delay={60} class="col-span-12 md:col-span-5">
    <div
      class="bento-card relative overflow-hidden rounded-xl p-5 flex flex-col justify-between border"
      style="min-height:210px; background:radial-gradient(ellipse at 75% 15%, rgba(220,50,50,0.12), transparent 55%), rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.07);"
    >
      <div class="organic-dot absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full" style="background:#9fb17d;box-shadow:0 0 6px rgba(159,177,125,0.6);" aria-hidden="true"></div>
      <div class="text-4xl">🍉</div>
      <div>
        <p class="text-sm font-bold" style="color:#f0f0ee;">Watermelon</p>
        <p class="text-xs mt-0.5" style="color:rgba(240,240,238,0.38);">Fruit · Seasonal</p>
      </div>
    </div>
  </FadeIn>

  <!-- ── Row 2: Chicoo, Papaya, Lemon, Dragon Fruit ── -->
  {[
    { emoji: '🍈', name: 'Chicoo',       sub: 'Fruit',         delay: 0   },
    { emoji: '🍈', name: 'Papaya',       sub: 'Fruit',         delay: 60  },
    { emoji: '🍋', name: 'Lemon',        sub: 'Fruit',         delay: 120 },
    { emoji: '🐉', name: 'Dragon Fruit', sub: 'Fruit · Exotic', delay: 180 },
  ].map(item => (
    <FadeIn delay={item.delay} class="col-span-6 md:col-span-3">
      <div
        class="bento-card relative overflow-hidden rounded-xl p-4 flex flex-col justify-between border"
        style="min-height:110px; background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.07);"
      >
        <div class="organic-dot absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full" style="background:#9fb17d;box-shadow:0 0 6px rgba(159,177,125,0.6);" aria-hidden="true"></div>
        <div class="text-3xl">{item.emoji}</div>
        <div>
          <p class="text-sm font-bold" style="color:#f0f0ee;">{item.name}</p>
          <p class="text-xs mt-0.5" style="color:rgba(240,240,238,0.38);">{item.sub}</p>
        </div>
      </div>
    </FadeIn>
  ))}

  <!-- ── Row 3: Black Jamun, Muskmelon, Laxman Fruit ── -->
  {[
    { emoji: '🫐', name: 'Black Jamun',  sub: 'Fruit · Seasonal', delay: 0   },
    { emoji: '🍈', name: 'Muskmelon',    sub: 'Fruit · Seasonal', delay: 60  },
    { emoji: '🍈', name: 'Laxman Fruit', sub: 'Fruit · Rare',      delay: 120 },
  ].map(item => (
    <FadeIn delay={item.delay} class="col-span-12 md:col-span-4">
      <div
        class="bento-card relative overflow-hidden rounded-xl p-4 flex flex-col justify-between border"
        style="min-height:110px; background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.07);"
      >
        <div class="organic-dot absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full" style="background:#9fb17d;box-shadow:0 0 6px rgba(159,177,125,0.6);" aria-hidden="true"></div>
        <div class="text-3xl">{item.emoji}</div>
        <div>
          <p class="text-sm font-bold" style="color:#f0f0ee;">{item.name}</p>
          <p class="text-xs mt-0.5" style="color:rgba(240,240,238,0.38);">{item.sub}</p>
        </div>
      </div>
    </FadeIn>
  ))}
  ```

- [ ] **Check the browser** — http://localhost:4321/produce — should see three rows of fruit cells filling the bento grid. Mobile: cells stack to col-span-6 pairs or full-width. Run `npm run astro check`.

- [ ] **Commit:**
  ```bash
  git add src/pages/produce.astro
  git commit -m "feat: add fruit cells to bento grid"
  ```

---

## Task 5: Bento — vegetables card, flowers, and CTA strip

**Files:**
- Modify: `src/pages/produce.astro`

Add after the fruit cells, still inside `grid grid-cols-12 gap-2`:

- [ ] **Add vegetables grouped card, flower cells, Lillies row, and CTA strip:**

  ```astro
  <!-- ── Vegetables & Herbs wide card (col-span-7) ── -->
  <FadeIn class="col-span-12 md:col-span-7">
    <div
      class="rounded-xl p-5 flex flex-col gap-2 border"
      style="background:linear-gradient(135deg,rgba(46,58,46,0.55),rgba(25,26,25,0.65)); border-color:rgba(159,177,125,0.15); min-height:90px;"
    >
      <p class="text-xs font-bold uppercase tracking-wider" style="color:rgba(159,177,125,0.75);">🌿 Vegetables &amp; Herbs</p>
      <p class="text-sm font-semibold leading-relaxed" style="color:rgba(240,240,238,0.65);">
        Okra · Methi · Cilantro · Red Amaranth · Cow Pea (Chavli) · Elephant Foot (Suran)
      </p>
    </div>
  </FadeIn>

  <!-- ── Roses (col-span-3) ── -->
  <FadeIn delay={60} class="col-span-6 md:col-span-3">
    <div
      class="bento-card relative overflow-hidden rounded-xl p-4 flex flex-col justify-between border"
      style="min-height:90px; background:radial-gradient(ellipse at 75% 15%, rgba(255,140,180,0.1), transparent 55%), rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.07);"
    >
      <div class="organic-dot absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full" style="background:#ccb7a4;box-shadow:0 0 6px rgba(204,183,164,0.5);" aria-hidden="true"></div>
      <div class="text-3xl">🌹</div>
      <div>
        <p class="text-sm font-bold" style="color:#f0f0ee;">Roses</p>
        <p class="text-xs mt-0.5" style="color:rgba(240,240,238,0.38);">Flower · Fragrant</p>
      </div>
    </div>
  </FadeIn>

  <!-- ── Marigold (col-span-2) ── -->
  <FadeIn delay={120} class="col-span-6 md:col-span-2">
    <div
      class="bento-card relative overflow-hidden rounded-xl p-4 flex flex-col justify-between border"
      style="min-height:90px; background:radial-gradient(ellipse at 75% 15%, rgba(255,200,50,0.1), transparent 55%), rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.07);"
    >
      <div class="organic-dot absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full" style="background:#ccb7a4;box-shadow:0 0 6px rgba(204,183,164,0.5);" aria-hidden="true"></div>
      <div class="text-3xl">🌻</div>
      <div>
        <p class="text-sm font-bold" style="color:#f0f0ee;">Marigold</p>
        <p class="text-xs mt-0.5" style="color:rgba(240,240,238,0.38);">Flower</p>
      </div>
    </div>
  </FadeIn>

  <!-- ── Lillies — full-width horizontal row ── -->
  <FadeIn class="col-span-12">
    <div
      class="bento-card relative overflow-hidden rounded-xl px-5 py-4 flex items-center gap-4 border"
      style="background:radial-gradient(ellipse at 92% 50%, rgba(200,160,220,0.08), transparent 50%), rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.07);"
    >
      <div class="organic-dot w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:#ccb7a4;box-shadow:0 0 6px rgba(204,183,164,0.5);" aria-hidden="true"></div>
      <span class="text-3xl">🪷</span>
      <div>
        <p class="text-sm font-bold" style="color:#f0f0ee;">Lillies</p>
        <p class="text-xs mt-0.5" style="color:rgba(240,240,238,0.38);">Flower · Elegant · Seasonal</p>
      </div>
      <p class="ml-auto text-xs" style="color:rgba(240,240,238,0.25);">Flower</p>
    </div>
  </FadeIn>

  <!-- ── Bento inline CTA strip ── -->
  <FadeIn class="col-span-12">
    <div
      class="rounded-xl px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border"
      style="background:linear-gradient(135deg,rgba(25,106,94,0.25),rgba(84,100,55,0.15)); border-color:rgba(127,200,186,0.18);"
    >
      <div>
        <p class="text-xs font-bold uppercase tracking-wider mb-1" style="color:#9fb17d;">All produce organically grown · No chemicals · No pesticides</p>
        <p class="text-base font-bold" style="color:#f0f0ee;">Interested in placing a bulk order?</p>
      </div>
      <a
        href="#bulk-request"
        class="brand-gradient text-on-primary text-sm font-bold px-6 py-2.5 rounded-full whitespace-nowrap hover:opacity-90 active:scale-[0.98] transition-opacity"
        style="box-shadow:0 4px 14px rgba(127,200,186,0.28);"
      >
        Request Produce ↓
      </a>
    </div>
  </FadeIn>
  ```

- [ ] **Check the browser** — the full bento grid should now be visible. Verify the vegetables card, rose/marigold cells, Lillies row, and the CTA strip all render. Mobile layout should be readable.

- [ ] **Commit:**
  ```bash
  git add src/pages/produce.astro
  git commit -m "feat: add vegetables, flowers, and CTA to bento grid"
  ```

---

## Task 6: Express Interest form

**Files:**
- Modify: `src/pages/produce.astro`

Add after the bento `</section>` and before `</SiteLayout>`:

- [ ] **Add the form section with all 18 item chips:**

  ```astro
  <!-- ══════════════════════════════════════════════════════
       EXPRESS INTEREST FORM — light section
       ══════════════════════════════════════════════════════ -->
  <section id="bulk-request" class="bg-surface py-24 px-6">
    <div class="max-w-7xl mx-auto">
      <div class="max-w-xl">

        <FadeIn>
          <span class="text-xs uppercase tracking-widest text-secondary font-bold">Bulk Orders</span>
          <h2 class="text-4xl font-extrabold tracking-tight mt-3 mb-3">Express your interest</h2>
          <p class="text-on-surface-variant leading-relaxed mb-8">
            Tell us what you're looking for and we'll get back to you on WhatsApp. All produce is organic, farm-direct, and available in bulk.
          </p>
        </FadeIn>

        <!-- Success banner -->
        {success && (
          <div class="mb-8 flex items-start gap-4 bg-primary-fixed/60 border border-primary/20 rounded-lg px-5 py-4">
            <span class="material-symbols-outlined text-primary mt-0.5" style="font-variation-settings:'FILL' 1">check_circle</span>
            <div>
              <p class="font-bold text-on-surface">Thanks! We'll reach out within 24 hours.</p>
              <p class="text-on-surface-variant text-sm mt-0.5">We'll contact you on WhatsApp or by email shortly.</p>
            </div>
          </div>
        )}

        <FadeIn delay={100}>
          <form
            method="POST"
            action="https://api.web3forms.com/submit"
            class="space-y-6"
          >
            <input type="hidden" name="access_key" value={web3formsKey} />
            <input type="hidden" name="subject" value="Bulk Produce Request — HariLeaf Farm" />
            <input type="hidden" name="redirect" value={`${String(canonicalURL)}?success=true`} />
            <input type="checkbox" name="botcheck" class="hidden" style="display:none" />

            <!-- Name + Contact row -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-2">
                <label for="pr-name" class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Your Name
                </label>
                <input
                  id="pr-name"
                  name="name"
                  type="text"
                  required
                  placeholder="Ravi Mehta"
                  autocomplete="name"
                  class="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/40 focus:border-primary focus:outline-none text-on-surface transition-all placeholder:text-outline/40"
                />
              </div>
              <div class="space-y-2">
                <label for="pr-contact" class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  WhatsApp or Email
                </label>
                <input
                  id="pr-contact"
                  name="contact"
                  type="text"
                  required
                  placeholder="+91 98765 43210"
                  autocomplete="tel"
                  class="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/40 focus:border-primary focus:outline-none text-on-surface transition-all placeholder:text-outline/40"
                />
              </div>
            </div>

            <!-- Produce chips -->
            <div class="space-y-3">
              <p class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">I'm interested in…</p>
              <div class="flex flex-wrap gap-2">
                {[
                  { emoji: '🥭', label: 'Mangoes' },
                  { emoji: '🍉', label: 'Watermelon' },
                  { emoji: '🍈', label: 'Chicoo' },
                  { emoji: '🍈', label: 'Papaya' },
                  { emoji: '🍋', label: 'Lemon' },
                  { emoji: '🫐', label: 'Black Jamun' },
                  { emoji: '🐉', label: 'Dragon Fruit' },
                  { emoji: '🍈', label: 'Muskmelon' },
                  { emoji: '🍈', label: 'Laxman Fruit' },
                  { emoji: '🫛', label: 'Okra' },
                  { emoji: '🌿', label: 'Methi' },
                  { emoji: '🌱', label: 'Cilantro' },
                  { emoji: '🎋', label: 'Red Amaranth' },
                  { emoji: '🫘', label: 'Chavli (Cow Pea)' },
                  { emoji: '🥔', label: 'Suran (Elephant Foot)' },
                  { emoji: '🌻', label: 'Marigold' },
                  { emoji: '🌹', label: 'Roses' },
                  { emoji: '🪷', label: 'Lillies' },
                ].map(item => (
                  <label class="item-chip bg-surface-container-lowest border border-outline-variant/25 rounded-full px-3.5 py-2 text-sm font-semibold text-on-surface-variant select-none">
                    <input type="checkbox" name="items" value={item.label} class="sr-only" />
                    {item.emoji} {item.label}
                  </label>
                ))}
              </div>
            </div>

            <!-- Submit -->
            <div>
              <button
                type="submit"
                class="brand-gradient text-on-primary w-full sm:w-auto px-10 py-4 rounded-full font-bold shadow-sm hover:opacity-90 transition-opacity active:scale-[0.98]"
              >
                I'm Interested →
              </button>
              <p class="text-xs text-on-surface-variant mt-3">We'll reach out on WhatsApp within 24 hours.</p>
            </div>
          </form>
        </FadeIn>

      </div>
    </div>
  </section>
  ```

- [ ] **Verify chip toggle works** — open http://localhost:4321/produce, scroll to the form, click a chip. It should visually toggle (teal background, teal border, teal text). Click again to deselect.

- [ ] **Verify form submission** — submit the form with a name and contact. You should be redirected to `/produce?success=true` and see the green success banner. (Web3Forms key is a placeholder in dev — 422 response is expected and the redirect still fires for demo purposes.)

- [ ] **Commit:**
  ```bash
  git add src/pages/produce.astro
  git commit -m "feat: add express interest form with produce chips"
  ```

---

## Task 7: Organic Promise banner

**Files:**
- Modify: `src/pages/produce.astro`

Add after the form `</section>` and before `</SiteLayout>`:

- [ ] **Add the banner:**

  ```astro
  <!-- ══════════════════════════════════════════════════════
       ORGANIC PROMISE BANNER
       ══════════════════════════════════════════════════════ -->
  <section class="relative overflow-hidden py-14 px-6" style="background:#2e3a2e;">
    <!-- Decorative eco icon -->
    <div class="absolute right-6 top-1/2 -translate-y-1/2 text-[10rem] opacity-[0.07] select-none pointer-events-none" aria-hidden="true">🌱</div>

    <div class="relative z-10 max-w-7xl mx-auto">
      <FadeIn>
        <p class="text-xs uppercase tracking-widest font-bold mb-2" style="color:rgba(159,177,125,0.7);">Our promise</p>
        <h2 class="text-3xl font-extrabold tracking-tight mb-5" style="color:#f0f0ee;">
          Everything we grow is 100% organic.<br />No chemicals, ever.
        </h2>
        <div class="flex flex-wrap gap-2">
          {['No Pesticides', 'No Synthetic Fertilisers', 'Traditional Methods', 'Farm Direct'].map(b => (
            <span
              class="text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-full"
              style="background:rgba(159,177,125,0.12); border:1px solid rgba(159,177,125,0.22); color:rgba(159,177,125,0.9);"
            >
              {b}
            </span>
          ))}
        </div>
      </FadeIn>
    </div>
  </section>
  ```

- [ ] **Check the full page** — http://localhost:4321/produce — scroll through all four sections: dark hero → dark bento → light form → dark forest banner. Run `npm run astro check`. Expect no errors.

- [ ] **Commit:**
  ```bash
  git add src/pages/produce.astro
  git commit -m "feat: add organic promise banner, complete produce page"
  ```

---

## Task 8: Homepage teaser section

**Files:**
- Modify: `src/pages/index.astro`

The teaser goes after the closing `</section>` of the existing Section 4 (intelligence cards + CTA), just before `</SiteLayout>`.

- [ ] **Open `src/pages/index.astro`** and locate the closing tag of Section 4 — it ends with:
  ```astro
      </div>
    </div>
  </section>

  </SiteLayout>
  ```

- [ ] **Insert the teaser section between the last `</section>` and `</SiteLayout>`:**

  ```astro
  <!-- ══════════════════════════════════════════════════════
       PRODUCE TEASER
       ══════════════════════════════════════════════════════ -->
  <section class="bg-surface-container-low py-24 px-6">
    <div class="max-w-7xl mx-auto">

      <FadeIn>
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <span class="text-xs uppercase tracking-widest text-secondary font-bold">From Our Farm</span>
            <h2 class="text-4xl md:text-5xl font-extrabold tracking-tight mt-3 leading-tight">
              Grown with care.<br />Available in bulk.
            </h2>
            <p class="text-on-surface-variant mt-4 max-w-lg leading-relaxed">
              18 organically grown produce items — fruits, vegetables, herbs and flowers — direct from our fields to your table.
            </p>
          </div>
          <a
            href="/produce"
            class="brand-gradient text-on-primary px-8 py-4 rounded-full font-bold shadow-lg hover:opacity-90 transition-opacity active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 whitespace-nowrap flex-shrink-0"
          >
            See all produce →
          </a>
        </div>
      </FadeIn>

      <!-- Produce chips -->
      <FadeIn delay={100}>
        <div class="flex flex-wrap gap-3">
          {[
            { emoji: '🥭', label: 'Alphonso Mangoes', badge: '6 varieties' },
            { emoji: '🍉', label: 'Watermelon' },
            { emoji: '🐉', label: 'Dragon Fruit' },
            { emoji: '🌿', label: 'Methi · Cilantro' },
            { emoji: '🌹', label: 'Roses · Marigold' },
          ].map(chip => (
            <a
              href="/produce"
              class="group flex items-center gap-2 bg-surface-container-lowest border border-outline-variant/25 rounded-full px-4 py-2.5 text-sm font-semibold text-on-surface hover:border-primary/30 hover:text-primary hover:-translate-y-0.5 transition-all shadow-card"
            >
              <span>{chip.emoji}</span>
              <span>{chip.label}</span>
              {chip.badge && (
                <span class="text-xs font-bold bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full">
                  {chip.badge}
                </span>
              )}
            </a>
          ))}
          <a
            href="/produce"
            class="flex items-center gap-1 border border-primary/20 bg-primary/5 rounded-full px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/10 hover:-translate-y-0.5 transition-all"
          >
            +13 more →
          </a>
        </div>
      </FadeIn>

      <FadeIn delay={200}>
        <p class="text-xs text-on-surface-variant mt-6">100% organic · Farm direct · Bulk orders welcome</p>
      </FadeIn>

    </div>
  </section>
  ```

- [ ] **Check the homepage** — http://localhost:4321 — scroll to the bottom. The teaser section should appear with the chips and CTA. Clicking any chip or the CTA should navigate to `/produce`.

- [ ] **Run type check:**
  ```bash
  npm run astro check
  ```
  Expected: no errors.

- [ ] **Commit:**
  ```bash
  git add src/pages/index.astro
  git commit -m "feat: add produce teaser section to homepage"
  ```

---

## Task 9: Final verification

- [ ] **Check all pages render without errors:**
  - http://localhost:4321 — homepage has teaser, nav has "Produce"
  - http://localhost:4321/produce — all 4 sections visible, bento fills properly
  - http://localhost:4321/about — unaffected
  - http://localhost:4321/contact — unaffected

- [ ] **Mobile check** — resize browser to ~390px wide. Verify:
  - Homepage teaser chips wrap gracefully, CTA button is full-width or wraps
  - Produce hero text doesn't overflow
  - Bento cells — col-span-6 pairs on small screens, no horizontal scroll
  - Form inputs are full-width
  - Chip grid wraps into multiple rows

- [ ] **Accessibility check** — tab through the produce page:
  - Nav "Produce" link is focusable
  - Hero badges don't receive focus (they're `<span>`, correct)
  - Bento CTA "Request Produce ↓" anchor is focusable and navigates to `#bulk-request`
  - Form name + contact inputs are labelled, chips have `sr-only` checkbox labels
  - Submit button is reachable by keyboard

- [ ] **Run final type check and build:**
  ```bash
  npm run astro check && npm run build
  ```
  Expected: no type errors, build succeeds with `/produce` in the output.

- [ ] **Final commit:**
  ```bash
  git add -A
  git commit -m "feat: produce section — bento catalogue, express interest form, homepage teaser"
  ```
