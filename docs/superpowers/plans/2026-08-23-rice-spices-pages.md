# Rice & Spices Product Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/rice` and `/spices` product pages plus produce-page additions, with an admin-driven photo gallery, an online-ordering waitlist, and a Produce dropdown nav.

**Architecture:** Static Astro pages (`prerender = true`) using the existing `SiteLayout`, `SEO`, and `FadeIn` components and Tailwind design tokens. Two new reusable components (`WaitlistForm`, `PhotoGallery`) are shared across pages. Photo galleries reuse the existing Cloudflare KV+R2 photo store, extended with an optional `category` field so photos can be filtered per variety/spice. The waitlist reuses Web3Forms (no new backend). Nav gains dropdown support via `children` in `navigation.json` + rendering in `Header.astro`.

**Tech Stack:** Astro 6, Tailwind 3, Cloudflare Workers (KV `HARILEAF_CMS` + R2 `HARILEAF_MEDIA`), Web3Forms.

**Testing note:** This project has **no unit-test framework**. Verification per task = `npx astro check` (type check) passes + `npm run build` succeeds + targeted visual check on `npm run dev` (http://localhost:4321). Each task ends with a commit.

**Design source of truth:** Approved spec at `docs/superpowers/specs/2026-08-23-rice-spices-pages-design.md`. Honest-claims guardrails in that spec are load-bearing — do not strengthen any nutrition/health claim.

**Branch:** `feat/rice-spices-pages` (already created).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/cms-types.ts` | Add optional `category` to `Photo` |
| `src/lib/cms.ts` | Persist/return `category` in photo index + `addPhoto` |
| `src/pages/api/photos/index.ts` | Read `category` from upload form |
| `src/pages/admin.astro` | Category selector in photo upload UI + show category badge |
| `src/components/produce/WaitlistForm.astro` | Reusable "coming soon" notify-me form (Web3Forms) |
| `src/components/produce/PhotoGallery.astro` | Reusable full-screen filterable gallery modal |
| `src/pages/rice.astro` | Rice page |
| `src/pages/spices.astro` | Spices page |
| `src/pages/produce.astro` | Add "Our Ranges" section + ordering hint on CTA |
| `src/content/navigation.json` | Produce dropdown with Rice/Spices/Fresh Produce children |
| `src/components/layout/Header.astro` | Render dropdown for nav items with children |

---

## Task 1: Extend photo store with `category`

**Files:**
- Modify: `src/lib/cms-types.ts`
- Modify: `src/lib/cms.ts`
- Modify: `src/pages/api/photos/index.ts`

- [ ] **Step 1: Add `category` to the `Photo` type**

In `src/lib/cms-types.ts`, replace the `Photo` interface:

```ts
export interface Photo {
  key: string;
  label: string;
  url: string;
  category?: string;
}
```

- [ ] **Step 2: Persist and return `category` in `cms.ts`**

In `src/lib/cms.ts`, replace `listPhotos` and `addPhoto`:

```ts
export async function listPhotos(kv: KVNamespace): Promise<Photo[]> {
  const raw = await kv.get('photos:index');
  if (!raw) return [];
  const keys: Array<{ key: string; label: string; category?: string }> = JSON.parse(raw);
  return keys.map(({ key, label, category }) => ({
    key,
    label,
    category,
    url: `/api/photos/${encodeURIComponent(key)}/image`,
  }));
}

export async function addPhoto(kv: KVNamespace, r2: R2Bucket, file: File, label: string, category?: string): Promise<Photo> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const key = `photos/${Date.now()}-${safeLabel}.${ext}`;
  await r2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const existing = await listPhotos(kv);
  const updated = [
    ...existing.map(({ key: k, label: l, category: c }) => ({ key: k, label: l, category: c })),
    { key, label, category },
  ];
  await kv.put('photos:index', JSON.stringify(updated));
  return { key, label, category, url: `/api/photos/${encodeURIComponent(key)}/image` };
}
```

Also update `deletePhoto` to preserve `category` when rewriting the index:

```ts
export async function deletePhoto(kv: KVNamespace, r2: R2Bucket, key: string): Promise<void> {
  await r2.delete(key);
  const existing = await listPhotos(kv);
  const updated = existing
    .filter((p) => p.key !== key)
    .map(({ key: k, label: l, category: c }) => ({ key: k, label: l, category: c }));
  await kv.put('photos:index', JSON.stringify(updated));
}
```

- [ ] **Step 3: Read `category` from the upload form**

In `src/pages/api/photos/index.ts`, inside `POST`, after the `label` line add a `category` read and pass it to `addPhoto`:

```ts
  const form = await request.formData();
  const file = form.get('file');
  const label = (form.get('label') as string | null) ?? '';
  const category = ((form.get('category') as string | null) ?? '').trim() || undefined;
  if (!(file instanceof File) || !label.trim()) {
    return new Response(JSON.stringify({ error: 'file and label are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (file.size > 8 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'File exceeds 8 MB limit' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }
  const photo = await addPhoto(env.HARILEAF_CMS, env.HARILEAF_MEDIA, file, label.trim(), category);
```

- [ ] **Step 4: Type-check**

Run: `npx astro check`
Expected: 0 errors (warnings unrelated to these files are acceptable).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cms-types.ts src/lib/cms.ts src/pages/api/photos/index.ts
git commit -m "feat: add optional category to photo store"
```

---

## Task 2: Admin — category selector for photo uploads

**Files:**
- Modify: `src/pages/admin.astro`

The photos tab is rendered by a client script inside `admin.astro`. It builds an upload form (`#photo-label` input, `#upload-btn`), and a `#photo-grid`. We add a category `<select>`, include it in the upload `FormData`, and show the category on each photo card.

- [ ] **Step 1: Add a category select to the upload row**

In `src/pages/admin.astro`, find the upload row containing `<input type="text" id="photo-label" ... />` (around line 146). Immediately after that input, add a select:

```html
            <select id="photo-category" style="min-width:200px;padding:0.5rem;border-radius:8px;border:1px solid #ccc;">
              <option value="">Farm (uncategorised)</option>
              <option value="rice:karjat">Rice — Karjat 3</option>
              <option value="rice:wada">Rice — Wada Kolam</option>
              <option value="rice:red">Rice — Red Rice</option>
              <option value="spice:turmeric">Spice — Turmeric</option>
              <option value="spice:chili">Spice — Red Chili</option>
            </select>
```

- [ ] **Step 2: Send category in the upload FormData**

In the same file, find the upload click handler (around line 259) where it does `form.append('label', label);`. Replace the FormData construction block so it includes category:

```ts
      const label = (document.getElementById('photo-label') as HTMLInputElement).value.trim();
      const category = (document.getElementById('photo-category') as HTMLSelectElement).value;
      const errEl = document.getElementById('upload-error')!;
      if (!selectedFile || !label) {
        errEl.textContent = 'Please choose a file and enter a label.';
        errEl.style.display = 'block';
        return;
      }
      const form = new FormData();
      form.append('file', selectedFile);
      form.append('label', label);
      form.append('category', category);
```

> Note: keep the existing `form.append('file', selectedFile)` line intact — the block above shows the complete replacement including it. Do not duplicate the `file` append.

- [ ] **Step 3: Reset the select after successful upload**

In the upload success handler (near where it clears `#photo-label`), after the line that resets the label input value, add:

```ts
          (document.getElementById('photo-category') as HTMLSelectElement).value = '';
```

- [ ] **Step 4: Show category on each photo card**

In `loadPhotos()`, the `photos` fetch type and card markup are around lines 171–184. Update the fetched type to include category:

```ts
      const photos: Array<{ key: string; label: string; url: string; category?: string }> = res.ok ? await res.json() : [];
```

Then in the `grid.innerHTML = photos.map((p) => ...)` template, add a category line under the label paragraph (inside `.photo-actions`):

```html
              <p style="color:#fff;font-size:0.75rem;font-weight:700;margin-bottom:0.5rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.label}</p>
              <p style="color:rgba(255,255,255,0.7);font-size:0.65rem;margin-bottom:0.5rem;">${p.category ? p.category : 'Farm'}</p>
```

- [ ] **Step 5: Type-check and build**

Run: `npx astro check && npm run build`
Expected: check passes; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin.astro
git commit -m "feat: admin photo upload category selector"
```

---

## Task 3: Reusable `WaitlistForm` component

**Files:**
- Create: `src/components/produce/WaitlistForm.astro`

A "coming soon" notify-me form that posts to Web3Forms (same provider as the produce interest form). Web3Forms key comes from `src/content/contact-page.json` → `form.web3formsKey`.

- [ ] **Step 1: Create the component**

Create `src/components/produce/WaitlistForm.astro`:

```astro
---
import contactJson from '../../content/contact-page.json';

interface Props {
  subject: string;
  heading: string;
  subtext: string;
  accent?: 'teal' | 'gold';
  whatsappLabel?: string;
}

const {
  subject,
  heading,
  subtext,
  accent = 'teal',
  whatsappLabel = 'Talk to us on WhatsApp →',
} = Astro.props;

const web3formsKey = contactJson.form.web3formsKey;
const canonicalURL = new URL(Astro.url.pathname, Astro.site ?? 'https://harileaf.org');
const redirect = `${String(canonicalURL)}?waitlist=success`;

const shell = accent === 'gold'
  ? 'background:linear-gradient(135deg,rgba(224,165,58,.16),rgba(192,57,43,.12));border:1px solid rgba(224,165,58,.28);'
  : 'background:linear-gradient(135deg,rgba(25,106,94,.28),rgba(84,100,55,.16));border:1px solid rgba(127,200,186,.2);';
const btn = accent === 'gold'
  ? 'background:linear-gradient(90deg,#e0a53a,#d05656);color:#1a0a08;'
  : 'background:linear-gradient(90deg,#196a5e,#7fc8ba);color:#00201b;';
const linkColor = accent === 'gold' ? '#e8b84a' : '#8bd4c6';
---

<section class="max-w-7xl mx-auto px-6 py-16">
  <div class="rounded-3xl p-11 text-center" style={shell}>
    <span
      class="inline-block text-[11px] font-extrabold uppercase tracking-widest mb-4 px-3.5 py-1.5 rounded-full"
      style="color:#ffc878;background:rgba(255,180,80,.14);border:1px solid rgba(255,180,80,.3);"
    >🛒 Online ordering — coming soon</span>
    <h2 class="text-3xl font-extrabold tracking-tight mb-2.5 text-white">{heading}</h2>
    <p class="mx-auto mb-6 max-w-lg" style="color:rgba(240,240,238,.6);">{subtext}</p>

    <form method="POST" action="https://api.web3forms.com/submit" class="flex flex-col sm:flex-row gap-2.5 max-w-md mx-auto">
      <input type="hidden" name="access_key" value={web3formsKey} />
      <input type="hidden" name="subject" value={subject} />
      <input type="hidden" name="redirect" value={redirect} />
      <input type="checkbox" name="botcheck" class="hidden" style="display:none" />
      <input
        name="contact"
        type="text"
        required
        placeholder="WhatsApp number or email"
        class="flex-1 rounded-full px-5 py-3.5 text-white text-[15px]"
        style="background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.16);"
      />
      <button type="submit" class="rounded-full px-7 py-3.5 font-extrabold text-[15px] whitespace-nowrap" style={btn}>Notify me →</button>
    </form>

    <p class="text-[13px] mt-4" style="color:rgba(240,240,238,.45);">
      Looking for a bulk order right now? <a href="/produce#bulk-request" style={`color:${linkColor};`}>{whatsappLabel}</a>
    </p>
  </div>
</section>
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/produce/WaitlistForm.astro
git commit -m "feat: reusable waitlist form component"
```

---

## Task 4: Reusable `PhotoGallery` modal component

**Files:**
- Create: `src/components/produce/PhotoGallery.astro`

A full-screen overlay that fetches `/api/photos`, filters by a category prefix (`rice` or `spice`), and renders a filterable grid. Exposes a global `openHariGallery(filter)` used by page cards. Filter tabs are passed in as props. If no photos exist for a filter, shows dashed placeholders so the gallery is never empty during rollout.

- [ ] **Step 1: Create the component**

Create `src/components/produce/PhotoGallery.astro`:

```astro
---
interface Filter { key: string; label: string; }
interface Props {
  groupTitle: string;        // e.g. "HariLeaf Rice"
  categoryPrefix: string;    // "rice" or "spice"
  filters: Filter[];         // [{key:'all',label:'All'}, {key:'rice:red',label:'Red Rice'}, ...]
  accent?: 'teal' | 'gold';
}
const { groupTitle, categoryPrefix, filters, accent = 'teal' } = Astro.props;
const activeColor = accent === 'gold' ? '#e8b84a' : '#8bd4c6';
const filtersJson = JSON.stringify(filters);
---

<div
  id="hari-gallery"
  data-prefix={categoryPrefix}
  data-filters={filtersJson}
  data-active={activeColor}
  class="fixed inset-0 z-[100] hidden items-start justify-center overflow-auto"
  style="background:rgba(6,10,6,.93);backdrop-filter:blur(6px);padding:60px 24px;"
  aria-hidden="true"
>
  <div class="w-full max-w-5xl">
    <div class="flex items-end justify-between mb-2">
      <div>
        <div class="text-[12px] font-extrabold uppercase tracking-widest" style={`color:${activeColor};`}>{groupTitle}</div>
        <h2 id="hg-title" class="text-3xl font-extrabold text-white">Gallery</h2>
      </div>
      <button id="hg-close" aria-label="Close gallery" class="w-11 h-11 rounded-full text-white text-xl" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);">✕</button>
    </div>
    <p class="text-sm mb-6" style="color:rgba(240,240,238,.5);">From field to plate. Managed through the admin panel.</p>
    <div id="hg-filters" class="flex flex-wrap gap-2 mb-5"></div>
    <div id="hg-grid" class="grid grid-cols-2 md:grid-cols-3 gap-3"></div>
  </div>
</div>

<script>
  interface Photo { key: string; label: string; url: string; category?: string; }
  const root = document.getElementById('hari-gallery');
  if (root) {
    const prefix = root.dataset.prefix!;
    const activeColor = root.dataset.active!;
    const filters: Array<{ key: string; label: string }> = JSON.parse(root.dataset.filters!);
    const titleEl = document.getElementById('hg-title')!;
    const filtersEl = document.getElementById('hg-filters')!;
    const gridEl = document.getElementById('hg-grid')!;
    let photos: Photo[] = [];
    let loaded = false;
    let current = 'all';

    async function ensurePhotos() {
      if (loaded) return;
      try {
        const res = await fetch('/api/photos');
        const all: Photo[] = res.ok ? await res.json() : [];
        photos = all.filter((p) => (p.category ?? '').startsWith(prefix + ':'));
      } catch { photos = []; }
      loaded = true;
    }

    function render() {
      const list = current === 'all' ? photos : photos.filter((p) => p.category === current);
      titleEl.textContent = (filters.find((f) => f.key === current)?.label) ?? 'Gallery';
      if (list.length) {
        gridEl.innerHTML = list.map((p) => `
          <div class="rounded-xl overflow-hidden" style="height:200px;">
            <img src="${p.url}" alt="${p.label}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" />
          </div>`).join('');
      } else {
        gridEl.innerHTML = Array.from({ length: 6 }).map(() => `
          <div class="rounded-xl flex items-center justify-center text-xs font-bold"
               style="height:200px;border:1.5px dashed rgba(139,212,198,.35);color:rgba(139,212,198,.7);
                      background:repeating-linear-gradient(45deg,rgba(255,255,255,.02),rgba(255,255,255,.02) 10px,rgba(255,255,255,.04) 10px,rgba(255,255,255,.04) 20px);">
            📷 Photos coming soon
          </div>`).join('');
      }
    }

    function paintFilters() {
      filtersEl.innerHTML = filters.map((f) => {
        const on = f.key === current;
        return `<button data-f="${f.key}" class="rounded-full px-4 py-2 text-[13px] font-bold"
          style="${on ? `background:${activeColor}22;border:1px solid ${activeColor}80;color:#fff;` : 'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.8);'}">${f.label}</button>`;
      }).join('');
      filtersEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.addEventListener('click', () => { current = b.dataset.f!; paintFilters(); render(); });
      });
    }

    async function open(filter: string) {
      current = filters.some((f) => f.key === filter) ? filter : 'all';
      await ensurePhotos();
      paintFilters();
      render();
      root!.classList.remove('hidden');
      root!.classList.add('flex');
      root!.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      root!.classList.add('hidden');
      root!.classList.remove('flex');
      root!.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    (window as any).openHariGallery = open;
    document.getElementById('hg-close')!.addEventListener('click', close);
    root.addEventListener('click', (e) => { if (e.target === root) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }
</script>
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/produce/PhotoGallery.astro
git commit -m "feat: reusable filterable photo gallery modal"
```

---

## Task 5: `/rice` page

**Files:**
- Create: `src/pages/rice.astro`
- Reference (visual source): approved mock `rice-page-v3.html` (structure/content already validated) + honest-claims guardrails in the spec.

The page uses `SiteLayout`, `SEO`, `FadeIn`, `WaitlistForm`, and `PhotoGallery`. Variety cards and the "open full gallery" link call `openHariGallery(...)`. Community CTA scrolls to the waitlist (`href="#rice-waitlist"`). Nutrition numbers are concrete + "approximate."

- [ ] **Step 1: Create the page**

Create `src/pages/rice.astro`. Use this exact file (styles/markup ported from the approved mock, wired to components):

```astro
---
export const prerender = true;
import SiteLayout from '../layouts/SiteLayout.astro';
import SEO from '../components/seo/SEO.astro';
import FadeIn from '../components/animations/FadeIn.astro';
import WaitlistForm from '../components/produce/WaitlistForm.astro';
import PhotoGallery from '../components/produce/PhotoGallery.astro';

const canonicalURL = new URL(Astro.url.pathname, Astro.site ?? 'https://harileaf.org');
const pageTitle = 'Organic Rice | HariLeaf Farm — Karjat 3, Wada Kolam & Red Rice';
const pageDesc  = 'HariLeaf now grows three heritage rice varieties — Karjat 3, Wada Kolam and antioxidant-rich Red Rice — organically grown and minimally milled to keep fiber, minerals and nutrition in the grain.';

const galleryFilters = [
  { key: 'all', label: 'All' },
  { key: 'rice:karjat', label: 'Karjat 3' },
  { key: 'rice:wada', label: 'Wada Kolam' },
  { key: 'rice:red', label: 'Red Rice' },
];
---

<SiteLayout title={pageTitle} description={pageDesc}>
  <slot name="head" slot="head">
    <SEO title={pageTitle} description={pageDesc} canonicalUrl={canonicalURL} />
  </slot>

  <style>
    .r-photoslot { border:1.5px dashed rgba(139,212,198,.35); background:repeating-linear-gradient(45deg,rgba(255,255,255,.02),rgba(255,255,255,.02) 10px,rgba(255,255,255,.04) 10px,rgba(255,255,255,.04) 20px); display:flex; align-items:center; justify-content:center; color:rgba(139,212,198,.7); font-size:12px; font-weight:700; text-align:center; }
    .vcard { transition:transform .2s, box-shadow .2s, border-color .2s; cursor:pointer; }
    .vcard:hover { transform:translateY(-4px); box-shadow:0 14px 34px rgba(0,0,0,.4); border-color:rgba(139,212,198,.3); }
    .r-grad { background:linear-gradient(90deg,#8bd4c6,#9fb17d); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
    .bar > span { display:block; height:100%; border-radius:4px; }
    .b-teal > span { background:linear-gradient(90deg,#196a5e,#8bd4c6); }
    .b-red > span { background:linear-gradient(90deg,#8a2a2a,#d05656); }
    .mbar > span { display:block; height:100%; border-radius:5px; }
    .c-carb > span { background:linear-gradient(90deg,#7a6a3a,#bbcd97); }
    .c-fiber > span { background:linear-gradient(90deg,#196a5e,#8bd4c6); }
    .c-prot > span { background:linear-gradient(90deg,#546437,#9fb17d); }
    .c-fat > span { background:linear-gradient(90deg,#8a5a2a,#d8a15a); }
  </style>

  <!-- HERO -->
  <section class="relative overflow-hidden" style="background:linear-gradient(135deg,#0e1a0e 0%,#1a2a1a 100%);padding:8rem 0 4.5rem;">
    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div style="position:absolute;top:0;right:0;width:45%;height:100%;background:radial-gradient(ellipse at 90% 30%, rgba(140,40,40,.2) 0%, transparent 55%);"></div>
      <div style="position:absolute;bottom:0;left:0;width:45%;height:100%;background:radial-gradient(ellipse at 10% 80%, rgba(127,200,186,.12) 0%, transparent 50%);"></div>
    </div>
    <div class="absolute right-10 top-1/2 -translate-y-1/2 text-[9rem] opacity-[0.12] select-none pointer-events-none" aria-hidden="true">🌾</div>
    <div class="relative z-10 max-w-7xl mx-auto px-6">
      <FadeIn><span class="text-xs uppercase tracking-widest font-extrabold" style="color:rgba(159,177,125,.9);">HariLeaf Farm · Now Growing Rice</span></FadeIn>
      <FadeIn delay={100}><h1 class="text-5xl md:text-6xl font-extrabold tracking-tighter leading-[1.05] mt-4 text-white">Rice with the goodness<br /><span class="r-grad">left in.</span></h1></FadeIn>
      <FadeIn delay={200}><p class="mt-5 text-lg max-w-xl leading-relaxed" style="color:rgba(255,255,255,.55);">Three heritage varieties, grown organically and milled gently — so the fiber, minerals and living nutrition stay in the grain, instead of being polished away.</p></FadeIn>
      <FadeIn delay={300}>
        <div class="mt-7 flex flex-wrap gap-3">
          {['🌱 100% Organic','🌾 3 Varieties','🙌 Hand-Harvested','✨ Minimally Milled'].map((b) => (
            <span class="text-xs font-extrabold uppercase tracking-wider px-4 py-2 rounded-full" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.75);">{b}</span>
          ))}
          <span class="text-xs font-extrabold uppercase tracking-wider px-4 py-2 rounded-full" style="background:rgba(255,180,80,.14);border:1px solid rgba(255,180,80,.3);color:rgba(255,200,120,.95);">🛒 Online Ordering — Coming Soon</span>
        </div>
      </FadeIn>
    </div>
  </section>

  <!-- VARIETIES -->
  <section style="background:#0c110c;" class="py-16 px-6">
    <div class="max-w-7xl mx-auto">
      <FadeIn>
        <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:rgba(159,177,125,.7);">What we grow</p>
        <h2 class="text-3xl font-extrabold tracking-tight mb-2 text-white">Three varieties, three characters</h2>
        <p class="mb-8" style="color:rgba(240,240,238,.55);">Tap any variety to see it in our fields and on the plate.</p>
      </FadeIn>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FadeIn>
          <div class="vcard rounded-2xl overflow-hidden border h-full" style="border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.04);" onclick="openHariGallery('rice:karjat')">
            <div class="r-photoslot" style="height:150px;border:none;border-bottom:1.5px dashed rgba(139,212,198,.35);">📷 Photo — added via admin</div>
            <div class="p-6">
              <h3 class="text-xl font-extrabold text-white">Karjat 3</h3>
              <p class="text-xs font-bold uppercase tracking-wide mb-3.5" style="color:#9fb17d;">Everyday · Bold Grain</p>
              <p class="text-sm mb-3.5" style="color:rgba(240,240,238,.6);">A dependable, hearty short-grain rice bred at a respected rice research station. Versatile and satisfying — built for everyday cooking.</p>
              <div class="flex flex-wrap gap-1.5 mb-4">
                {['Bold grain','Everyday','Wholesome'].map((c) => (<span class="text-[11px] font-bold px-2.5 py-1 rounded-full" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.82);">{c}</span>))}
              </div>
              <span class="text-xs font-extrabold" style="color:#8bd4c6;">View photos →</span>
            </div>
          </div>
        </FadeIn>
        <FadeIn delay={80}>
          <div class="vcard rounded-2xl overflow-hidden border h-full" style="border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.04);" onclick="openHariGallery('rice:wada')">
            <div class="r-photoslot" style="height:150px;border:none;border-bottom:1.5px dashed rgba(139,212,198,.35);">📷 Photo — added via admin</div>
            <div class="p-6">
              <h3 class="text-xl font-extrabold text-white">Wada Kolam</h3>
              <p class="text-xs font-bold uppercase tracking-wide mb-3.5" style="color:#9fb17d;">Aromatic · GI-Tagged</p>
              <p class="text-sm mb-3.5" style="color:rgba(240,240,238,.6);">The fine, fragrant "Basmati of Maharashtra." Slender grains that cook light, fluffy and separate. GI-tagged in 2021 for its protected heritage.</p>
              <div class="flex flex-wrap gap-1.5 mb-4">
                {['GI-tagged','Aromatic','Fine grain'].map((c) => (<span class="text-[11px] font-bold px-2.5 py-1 rounded-full" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.82);">{c}</span>))}
              </div>
              <span class="text-xs font-extrabold" style="color:#8bd4c6;">View photos →</span>
            </div>
          </div>
        </FadeIn>
        <FadeIn delay={160}>
          <div class="vcard rounded-2xl overflow-hidden border h-full relative" style="border-color:rgba(180,60,60,.25);background:radial-gradient(ellipse at 80% 10%, rgba(150,40,40,.22), transparent 60%), rgba(255,255,255,.04);" onclick="openHariGallery('rice:red')">
            <span class="absolute top-3.5 left-3.5 z-10 text-[10px] font-extrabold text-white px-2.5 py-1 rounded-full tracking-wide" style="background:rgba(180,50,50,.85);">★ NUTRITION HERO</span>
            <div class="r-photoslot" style="height:150px;border:none;border-bottom:1.5px dashed rgba(139,212,198,.35);">📷 Photo — added via admin</div>
            <div class="p-6">
              <h3 class="text-xl font-extrabold text-white">Red Rice</h3>
              <p class="text-xs font-bold uppercase tracking-wide mb-3.5" style="color:#9fb17d;">Unpolished · Antioxidant-Rich</p>
              <p class="text-sm mb-3.5" style="color:rgba(240,240,238,.6);">Kept unpolished so the bran stays on — that's where the fiber, minerals and natural red pigments live. Nutty, wholesome, deeply satisfying.</p>
              <div class="flex flex-wrap gap-1.5 mb-4">
                {['Whole grain','Higher fiber','Lower GI'].map((c) => (<span class="text-[11px] font-bold px-2.5 py-1 rounded-full" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.82);">{c}</span>))}
              </div>
              <span class="text-xs font-extrabold" style="color:#8bd4c6;">View photos →</span>
            </div>
          </div>
        </FadeIn>
      </div>
      <p class="text-center mt-5 text-sm" style="color:rgba(240,240,238,.45);">Every photo lives in one place — <button class="font-bold" style="color:#8bd4c6;" onclick="openHariGallery('all')">open the full rice gallery →</button></p>
    </div>
  </section>

  <!-- WHY UNPOLISHED -->
  <section style="background:#0c110c;" class="pb-16 px-6">
    <div class="max-w-7xl mx-auto">
      <FadeIn>
        <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:rgba(159,177,125,.7);">The most important thing to understand</p>
        <h2 class="text-3xl font-extrabold tracking-tight mb-2 text-white">Why <em class="not-italic" style="color:#d05656;">unpolished</em> rice is better for you</h2>
        <p class="mb-8 max-w-2xl" style="color:rgba(240,240,238,.55);">Every grain has three parts. Polishing — done to make rice white and shelf-stable — grinds two of them away, and with them, most of the nutrition.</p>
      </FadeIn>
      <div class="rounded-3xl p-8 md:p-12" style="background:linear-gradient(135deg,#141a12 0%,#0e150e 100%);">
        <div class="grid md:grid-cols-2 gap-10 items-center">
          <div class="flex flex-col gap-2.5">
            <div class="rounded-xl p-4 border" style="background:rgba(150,60,40,.18);border-color:rgba(180,90,60,.35);"><span class="float-right text-[10px] font-extrabold" style="color:#8bd4c6;">WE KEEP IT</span><div class="font-extrabold text-white">Bran</div><div class="text-[13px]" style="color:rgba(240,240,238,.55);">Fiber, magnesium, and the antioxidant pigments that colour red rice.</div></div>
            <div class="rounded-xl p-4 border" style="background:rgba(159,177,125,.16);border-color:rgba(159,177,125,.35);"><span class="float-right text-[10px] font-extrabold" style="color:#8bd4c6;">WE KEEP IT</span><div class="font-extrabold text-white">Germ</div><div class="text-[13px]" style="color:rgba(240,240,238,.55);">The living heart of the seed — healthy fats, B vitamins, vitamin E, minerals.</div></div>
            <div class="rounded-xl p-4 border" style="background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);"><div class="font-extrabold text-white">Endosperm</div><div class="text-[13px]" style="color:rgba(240,240,238,.55);">The starchy centre. This is all that's left in white rice.</div></div>
          </div>
          <div>
            <div class="flex gap-3.5">
              <div class="flex-1 rounded-2xl p-5 border" style="background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);"><h4 class="font-bold text-white mb-2">⚪ Polished (white)</h4><ul class="text-[13px] space-y-1" style="color:rgba(240,240,238,.6);"><li>✗ Bran removed</li><li>✗ Germ removed</li><li>✗ Most fiber gone</li><li>✗ Minerals stripped</li><li>• Spikes blood sugar faster</li></ul></div>
              <div class="flex-1 rounded-2xl p-5 border" style="background:radial-gradient(ellipse at 50% 0%,rgba(150,40,40,.2),transparent 70%),rgba(255,255,255,.04);border-color:rgba(180,60,60,.3);"><h4 class="font-bold text-white mb-2">🔴 Unpolished (ours)</h4><ul class="text-[13px] space-y-1" style="color:rgba(240,240,238,.6);"><li>✓ Bran intact</li><li>✓ Germ intact</li><li>✓ Fiber &amp; minerals kept</li><li>✓ Antioxidant pigments kept</li><li>• Gentler on blood sugar</li></ul></div>
            </div>
            <p class="text-xs italic mt-5" style="color:rgba(240,240,238,.4);">Polishing trades nutrition for shelf-life and colour. We choose the grain over the shelf.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- MACRO + MICRO + COMPARISON -->
  <section style="background:#0c110c;" class="pb-16 px-6">
    <div class="max-w-7xl mx-auto">
      <FadeIn>
        <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:rgba(159,177,125,.7);">What's actually inside</p>
        <h2 class="text-3xl font-extrabold tracking-tight mb-2 text-white">The full nutrition picture</h2>
        <p class="mb-8 max-w-2xl" style="color:rgba(240,240,238,.55);">Because we keep the whole grain, our red rice delivers balanced macros and the micronutrients that polishing strips away.</p>
      </FadeIn>
      <div class="grid md:grid-cols-2 gap-4 mb-4">
        <div class="rounded-2xl p-8 border" style="background:linear-gradient(135deg,#161a16 0%,#0e150e 100%);border-color:rgba(255,255,255,.08);">
          <h3 class="text-lg font-bold text-white">Macronutrients</h3>
          <p class="text-xs uppercase tracking-wider mb-5" style="color:rgba(240,240,238,.4);">Per 100g uncooked · approximate</p>
          {[['Complex carbohydrates','~73 g','c-carb',92],['Dietary fiber','~5 g','c-fiber',55],['Protein','~7 g','c-prot',45],['Healthy fats (from germ)','~2.5 g','c-fat',25]].map(([n,v,c,w]) => (
            <div class="mb-4">
              <div class="flex justify-between text-sm mb-1.5 text-white"><span>{n}</span><b>{v}</b></div>
              <div class={`mbar ${c} h-2.5 rounded-md`} style="background:rgba(255,255,255,.07);overflow:hidden;"><span style={`width:${w}%`}></span></div>
            </div>
          ))}
          <p class="text-xs italic mt-3.5" style="color:rgba(240,240,238,.4);">Slow-release complex carbs, more fiber and protein than polished white rice, and the good fats that live in the germ.</p>
        </div>
        <div class="rounded-2xl p-8 border" style="background:linear-gradient(135deg,#161a16 0%,#0e150e 100%);border-color:rgba(255,255,255,.08);">
          <h3 class="text-lg font-bold text-white">Micronutrients &amp; bioactives</h3>
          <p class="text-xs uppercase tracking-wider mb-5" style="color:rgba(240,240,238,.4);">What the bran &amp; germ deliver</p>
          <div class="flex flex-wrap gap-2">
            {[['Magnesium','muscle & nerve'],['Iron','oxygen transport'],['Zinc','immunity'],['B-complex','energy metabolism'],['Vitamin E','antioxidant'],['Manganese','bone & metabolism'],['Proanthocyanidins','the red pigment'],['Anthocyanins','plant antioxidant']].map(([k,d]) => (
              <div class="rounded-xl px-3.5 py-2.5" style="background:rgba(255,255,255,.05);border:1px solid rgba(159,177,125,.25);"><b class="block text-[13px]" style="color:#cfe0b5;">{k}</b><span class="text-[11px]" style="color:rgba(240,240,238,.5);">{d}</span></div>
            ))}
          </div>
          <p class="text-xs italic mt-4" style="color:rgba(240,240,238,.4);">These concentrate in the bran and germ — the exact layers white rice throws away.</p>
        </div>
      </div>
      <div class="rounded-3xl p-8 md:p-11" style="background:linear-gradient(135deg,#1a0e0e 0%,#0e1a0e 100%);">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {[
            {t:'⚪ White Rice',cls:'b-teal',bd:'rgba(255,255,255,.08)',bg:'rgba(255,255,255,.03)',m:[['Fiber',12],['Antioxidant pigments',4],['Minerals',18],['Gentle on blood sugar',15]]},
            {t:'🟤 Brown Rice',cls:'b-teal',bd:'rgba(255,255,255,.08)',bg:'rgba(255,255,255,.03)',m:[['Fiber',60],['Antioxidant pigments',35],['Minerals',75],['Gentle on blood sugar',60]]},
            {t:'🔴 Red Rice',cls:'b-red',bd:'rgba(180,60,60,.4)',bg:'radial-gradient(ellipse at 50% 0%, rgba(150,40,40,.18), transparent 70%), rgba(255,255,255,.04)',m:[['Fiber',85],['Antioxidant pigments',100],['Minerals',80],['Gentle on blood sugar',70]]},
          ].map((col) => (
            <div class="rounded-2xl p-5 border" style={`border-color:${col.bd};background:${col.bg};`}>
              <h4 class="font-bold text-white mb-3">{col.t}</h4>
              {col.m.map(([lbl,w]) => (
                <div class="mb-3">
                  <div class="text-[11px] uppercase tracking-wide" style="color:rgba(240,240,238,.45);">{lbl}</div>
                  <div class={`bar ${col.cls} h-[7px] rounded mt-1.5`} style="background:rgba(255,255,255,.08);overflow:hidden;"><span style={`width:${w}%`}></span></div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p class="text-xs italic mt-5" style="color:rgba(240,240,238,.4);">Relative comparison for illustration. Values vary by harvest — we're lab-testing our own grain to publish verified figures. Red rice keeps the bran &amp; germ white rice loses, plus antioxidant pigments, and generally has a lower glycemic index than white rice.</p>
      </div>
    </div>
  </section>

  <!-- COMMUNITY -->
  <section style="background:#0c110c;" class="pb-16 px-6">
    <div class="max-w-7xl mx-auto">
      <div class="relative overflow-hidden rounded-3xl p-10 md:p-14 text-center" style="background:linear-gradient(135deg,#1b2a1b 0%,#12200f 100%);">
        <div class="absolute right-8 -bottom-5 text-[11rem] opacity-[0.08] select-none pointer-events-none" aria-hidden="true">🌿</div>
        <div class="relative z-10">
          <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:rgba(159,177,125,.7);">The bigger idea</p>
          <h2 class="text-3xl font-extrabold tracking-tight mb-3.5 max-w-2xl mx-auto text-white">Good food is grown, not manufactured.</h2>
          <p class="max-w-xl mx-auto mb-7" style="color:rgba(240,240,238,.6);">HariLeaf isn't just selling rice — we're building a community of people who believe food should be organic, whole, and as close to the earth as possible. The less it's processed, the more it gives back to you.</p>
          <div class="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-8">
            {[['🌱','Grown organically','No synthetic chemicals or pesticides — ever. Just soil, sun and care.'],['🌾','Minimally processed','We mill gently and keep the grain whole, so nutrition stays where it belongs.'],['🤝','Grown for a community','Farmer-direct, transparent, built on trust — not middlemen and markups.']].map(([e,t,d]) => (
              <div class="rounded-2xl p-6" style="background:rgba(255,255,255,.05);border:1px solid rgba(159,177,125,.2);"><div class="text-3xl mb-2">{e}</div><div class="font-extrabold text-white mb-1">{t}</div><div class="text-[13px]" style="color:rgba(240,240,238,.55);">{d}</div></div>
            ))}
          </div>
          <a href="#rice-waitlist" class="inline-block rounded-full px-9 py-4 font-extrabold text-[15px]" style="background:linear-gradient(90deg,#196a5e,#7fc8ba);color:#00201b;">Join the HariLeaf community →</a>
        </div>
      </div>
    </div>
  </section>

  <!-- WAITLIST -->
  <div id="rice-waitlist" style="background:#0c110c;">
    <WaitlistForm
      subject="Rice Waitlist — HariLeaf Farm"
      heading="Be first to get our rice at home"
      subtext="We're building online ordering so you can get farm-fresh, unpolished rice delivered to your door. Leave your number and we'll message you the moment it's live."
      accent="teal"
    />
  </div>

  <PhotoGallery groupTitle="HariLeaf Rice" categoryPrefix="rice" filters={galleryFilters} accent="teal" />
</SiteLayout>
```

- [ ] **Step 2: Type-check and build**

Run: `npx astro check && npm run build`
Expected: check passes; build succeeds; `/rice` appears in build output.

- [ ] **Step 3: Visual check**

Run: `npm run dev`, open http://localhost:4321/rice
Expected: hero, three clickable variety cards (clicking opens the gallery modal with placeholders + correct filter), why-unpolished diagram, macro/micro panels + comparison bars, community section with a button that scrolls to the waitlist, and the waitlist form. Press Escape / click backdrop closes the gallery.

- [ ] **Step 4: Commit**

```bash
git add src/pages/rice.astro
git commit -m "feat: rice product page with nutrition education and gallery"
```

---

## Task 6: `/spices` page

**Files:**
- Create: `src/pages/spices.astro`
- Reference (visual source): approved mock `spices-page-v2.html` + honest-claims guardrails.

Same component wiring as rice, with gold/red accents, the temperature-education centerpiece, repeatable per-spice modules, the "why it costs more" section, the honesty disclaimer, and a scalable product grid with a "more spices coming" ghost card.

- [ ] **Step 1: Create the page**

Create `src/pages/spices.astro`:

```astro
---
export const prerender = true;
import SiteLayout from '../layouts/SiteLayout.astro';
import SEO from '../components/seo/SEO.astro';
import FadeIn from '../components/animations/FadeIn.astro';
import WaitlistForm from '../components/produce/WaitlistForm.astro';
import PhotoGallery from '../components/produce/PhotoGallery.astro';

const canonicalURL = new URL(Astro.url.pathname, Astro.site ?? 'https://harileaf.org');
const pageTitle = 'Stone-Ground Organic Turmeric & Red Chili | HariLeaf Farm';
const pageDesc  = 'HariLeaf turmeric and red chili powder, stone-ground the traditional way so the aromatic oils and vivid colour survive — instead of being burned off by high-speed industrial mills.';

const galleryFilters = [
  { key: 'all', label: 'All' },
  { key: 'spice:turmeric', label: 'Turmeric' },
  { key: 'spice:chili', label: 'Red Chili' },
];
---

<SiteLayout title={pageTitle} description={pageDesc}>
  <slot name="head" slot="head">
    <SEO title={pageTitle} description={pageDesc} canonicalUrl={canonicalURL} />
  </slot>

  <style>
    .s-photoslot { border:1.5px dashed rgba(224,165,58,.4); background:repeating-linear-gradient(45deg,rgba(255,255,255,.02),rgba(255,255,255,.02) 10px,rgba(255,255,255,.04) 10px,rgba(255,255,255,.04) 20px); display:flex; align-items:center; justify-content:center; color:rgba(224,165,58,.75); font-size:12px; font-weight:700; text-align:center; }
    .pcard { transition:transform .2s, box-shadow .2s, border-color .2s; cursor:pointer; }
    .pcard:hover { transform:translateY(-4px); box-shadow:0 16px 38px rgba(0,0,0,.45); }
    .s-grad { background:linear-gradient(90deg,#e8b84a,#d05656); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
    .gauge > span { display:block; height:100%; }
    .g-hot > span { width:95%; background:linear-gradient(90deg,#e0a53a,#c0392b); }
    .g-cold > span { width:28%; background:linear-gradient(90deg,#196a5e,#8bd4c6); }
  </style>

  <!-- HERO -->
  <section class="relative overflow-hidden" style="background:linear-gradient(135deg,#1a0f06 0%,#1a0a08 100%);padding:8rem 0 4.5rem;">
    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div style="position:absolute;top:0;right:0;width:50%;height:100%;background:radial-gradient(ellipse at 88% 25%, rgba(224,165,58,.22) 0%, transparent 55%);"></div>
      <div style="position:absolute;bottom:0;left:0;width:45%;height:100%;background:radial-gradient(ellipse at 10% 80%, rgba(192,57,43,.2) 0%, transparent 55%);"></div>
    </div>
    <div class="absolute right-10 top-1/2 -translate-y-1/2 text-[9rem] opacity-[0.14] select-none pointer-events-none" aria-hidden="true">🌶️</div>
    <div class="relative z-10 max-w-7xl mx-auto px-6">
      <FadeIn><span class="text-xs uppercase tracking-widest font-extrabold" style="color:rgba(224,165,58,.9);">HariLeaf Farm · Stone-Ground Spices</span></FadeIn>
      <FadeIn delay={100}><h1 class="text-5xl md:text-6xl font-extrabold tracking-tighter leading-[1.05] mt-4 text-white">You can <span class="s-grad">smell</span><br />the difference.</h1></FadeIn>
      <FadeIn delay={200}><p class="mt-5 text-lg max-w-xl leading-relaxed" style="color:rgba(255,255,255,.55);">Turmeric and red chili, ground slowly on stone the traditional way — so the aromatic oils and vivid colour survive, instead of being burned off by high-speed industrial mills.</p></FadeIn>
      <FadeIn delay={300}>
        <div class="mt-7 flex flex-wrap gap-3">
          {['🪨 Stone-Ground','🌱 Organic','☀️ Sun-Dried','📦 Small-Batch'].map((b) => (
            <span class="text-xs font-extrabold uppercase tracking-wider px-4 py-2 rounded-full" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.75);">{b}</span>
          ))}
          <span class="text-xs font-extrabold uppercase tracking-wider px-4 py-2 rounded-full" style="background:rgba(255,180,80,.14);border:1px solid rgba(255,180,80,.35);color:rgba(255,200,120,.95);">🛒 Online Ordering — Coming Soon</span>
        </div>
      </FadeIn>
    </div>
  </section>

  <!-- PRODUCTS (scalable grid) -->
  <section style="background:#0c0a08;" class="py-16 px-6">
    <div class="max-w-7xl mx-auto">
      <FadeIn>
        <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:rgba(224,165,58,.75);">Our spices</p>
        <h2 class="text-3xl font-extrabold tracking-tight mb-2 text-white">Ground for aroma, not for speed</h2>
        <p class="mb-8" style="color:rgba(240,240,238,.55);">Tap a spice to see how it's grown, dried and stone-ground.</p>
      </FadeIn>
      <div class="grid gap-4" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr));">
        <FadeIn>
          <div class="pcard rounded-2xl overflow-hidden border h-full" style="border-color:rgba(224,165,58,.28);background:radial-gradient(ellipse at 80% 8%, rgba(224,165,58,.22), transparent 60%), rgba(255,255,255,.04);" onclick="openHariGallery('spice:turmeric')">
            <div class="s-photoslot" style="height:180px;border:none;border-bottom:1.5px dashed rgba(224,165,58,.4);">📷 Photo — added via admin</div>
            <div class="p-7">
              <h3 class="text-2xl font-extrabold text-white">Turmeric Powder</h3>
              <p class="text-xs font-bold uppercase tracking-wide mb-3.5" style="color:#e8b84a;">Haldi · Stone-Ground</p>
              <p class="text-sm mb-4" style="color:rgba(240,240,238,.62);">Sun-dried whole rhizomes, stone-ground slowly so the golden colour and earthy aroma stay locked in.</p>
              <div class="flex flex-wrap gap-1.5 mb-4">{['Sun-dried','No additives'].map((c) => (<span class="text-[11px] font-bold px-2.5 py-1 rounded-full" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.82);">{c}</span>))}</div>
              <span class="text-xs font-extrabold" style="color:#e8b84a;">View photos →</span>
            </div>
          </div>
        </FadeIn>
        <FadeIn delay={80}>
          <div class="pcard rounded-2xl overflow-hidden border h-full" style="border-color:rgba(192,57,43,.3);background:radial-gradient(ellipse at 80% 8%, rgba(192,57,43,.22), transparent 60%), rgba(255,255,255,.04);" onclick="openHariGallery('spice:chili')">
            <div class="s-photoslot" style="height:180px;border:none;border-bottom:1.5px dashed rgba(224,165,58,.4);">📷 Photo — added via admin</div>
            <div class="p-7">
              <h3 class="text-2xl font-extrabold text-white">Red Chili Powder</h3>
              <p class="text-xs font-bold uppercase tracking-wide mb-3.5" style="color:#e88;">Lal Mirchi · Stone-Ground</p>
              <p class="text-sm mb-4" style="color:rgba(240,240,238,.62);">Whole sun-dried chilies, stone-ground to protect the deep red colour and fragrant oils that hot mills dull.</p>
              <div class="flex flex-wrap gap-1.5 mb-4">{['Sun-dried','No colour added'].map((c) => (<span class="text-[11px] font-bold px-2.5 py-1 rounded-full" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.82);">{c}</span>))}</div>
              <span class="text-xs font-extrabold" style="color:#e88;">View photos →</span>
            </div>
          </div>
        </FadeIn>
        <FadeIn delay={160}>
          <div class="rounded-2xl flex flex-col items-center justify-center text-center h-full p-10" style="border:1.5px dashed rgba(224,165,58,.3);color:rgba(224,165,58,.7);min-height:340px;">
            <div class="text-4xl mb-3 opacity-60">➕</div>
            <div class="font-extrabold text-[15px] mb-1">More spices coming</div>
            <div class="text-[13px]" style="color:rgba(240,240,238,.45);max-width:200px;">Coriander, cumin &amp; more — same slow stone grinding.</div>
          </div>
        </FadeIn>
      </div>
    </div>
  </section>

  <!-- TEMPERATURE EDUCATION -->
  <section style="background:#0c0a08;" class="pb-16 px-6">
    <div class="max-w-7xl mx-auto">
      <FadeIn>
        <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:rgba(224,165,58,.75);">The thing nobody tells you</p>
        <h2 class="text-3xl font-extrabold tracking-tight mb-2 text-white">Why grinding <em class="not-italic" style="color:#d05656;">temperature</em> changes everything</h2>
        <p class="mb-8 max-w-2xl" style="color:rgba(240,240,238,.55);">A spice's soul — its aroma and colour — lives in delicate volatile oils. High-speed industrial mills spin so fast they heat the powder to 90–120°C, and that heat quietly burns those oils away. Traditional stone grinding stays slow and cool.</p>
      </FadeIn>
      <div class="rounded-3xl p-8 md:p-12" style="background:linear-gradient(135deg,#15100a 0%,#0e0a08 100%);">
        <div class="grid md:grid-cols-2 gap-4.5" style="gap:1.125rem;">
          <div class="rounded-2xl p-7 border" style="background:radial-gradient(ellipse at 50% 0%, rgba(192,57,43,.14), transparent 70%), rgba(255,255,255,.03);border-color:rgba(255,255,255,.1);">
            <div class="text-xs font-extrabold uppercase tracking-widest mb-1.5" style="color:#e07a6a;">🏭 High-speed industrial mill</div>
            <h4 class="text-xl font-bold text-white mb-4">Hot &amp; fast</h4>
            <div class="gauge g-hot h-3 rounded-lg mb-1.5" style="background:rgba(255,255,255,.08);overflow:hidden;"><span></span></div>
            <div class="text-2xl font-extrabold mb-4" style="color:#e07a6a;">90–120°C</div>
            <ul class="text-sm space-y-1.5" style="color:rgba(240,240,238,.65);"><li>✗ Friction heat drives off aromatic oils</li><li>✗ Vivid colour dulls and browns</li><li>✗ Aroma flattens — smells faint</li><li>✓ Cheap, fast, long shelf-life</li></ul>
          </div>
          <div class="rounded-2xl p-7 border" style="background:radial-gradient(ellipse at 50% 0%, rgba(25,106,94,.16), transparent 70%), rgba(255,255,255,.03);border-color:rgba(139,212,198,.3);">
            <div class="text-xs font-extrabold uppercase tracking-widest mb-1.5" style="color:#8bd4c6;">🪨 Our slow stone grinding</div>
            <h4 class="text-xl font-bold text-white mb-4">Cool &amp; slow</h4>
            <div class="gauge g-cold h-3 rounded-lg mb-1.5" style="background:rgba(255,255,255,.08);overflow:hidden;"><span></span></div>
            <div class="text-2xl font-extrabold mb-4" style="color:#8bd4c6;">Low heat</div>
            <ul class="text-sm space-y-1.5" style="color:rgba(240,240,238,.65);"><li>✓ Aromatic oils stay in the powder</li><li>✓ Colour stays deep and vivid</li><li>✓ Aroma is strong — you smell it instantly</li><li>• Slower &amp; costlier — worth it</li></ul>
          </div>
        </div>
        <div class="text-center mt-7 p-6 rounded-2xl" style="background:rgba(192,57,43,.1);border:1px solid rgba(192,57,43,.25);">
          <b class="text-4xl font-extrabold block" style="color:#e8b84a;">15–43%</b>
          <span class="text-sm" style="color:rgba(240,240,238,.6);">of a spice's volatile aromatic oils can be lost to heat in conventional high-speed grinding. Studies on cold &amp; low-temperature grinding show 15–25% higher retention of volatile oils, oleoresin and curcumin.</span>
        </div>
      </div>
    </div>
  </section>

  <!-- PER-SPICE MODULES -->
  <section style="background:#0c0a08;" class="pb-16 px-6">
    <div class="max-w-7xl mx-auto">
      <FadeIn>
        <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:rgba(224,165,58,.75);">Get to know each spice</p>
        <h2 class="text-3xl font-extrabold tracking-tight mb-2 text-white">What's inside — and why it's good for you</h2>
        <p class="mb-8 max-w-2xl" style="color:rgba(240,240,238,.55);">Each spice, its protected compounds and its benefits.</p>
      </FadeIn>

      <div class="rounded-3xl p-8 md:p-11 border mb-5" style="background:radial-gradient(ellipse at 90% 0%, rgba(224,165,58,.12), transparent 60%), #12100b;border-color:rgba(255,255,255,.08);">
        <div class="flex items-center gap-3.5 mb-1"><span class="text-3xl">🟡</span><div><h3 class="text-2xl font-extrabold text-white">Turmeric (Haldi)</h3><div class="text-xs font-bold uppercase tracking-wide" style="color:#e8b84a;">Golden · Earthy · Warming</div></div></div>
        <p class="my-4 max-w-3xl" style="color:rgba(240,240,238,.6);">India's most revered spice, valued in kitchens and Ayurveda alike for thousands of years. Its power lives in curcumin and its aromatic oils — the exact things we grind gently to protect.</p>
        <div class="grid md:grid-cols-2 gap-7">
          <div>
            <h5 class="text-[13px] uppercase tracking-wide font-extrabold mb-3.5" style="color:rgba(240,240,238,.5);">What stone grinding protects</h5>
            {[['🌿','Aromatic oils (turmerone)','The warm, earthy smell — the first thing heat destroys.'],['✨','Golden colour (curcumin)','The pigment and antioxidant — kept bright, not browned.'],['🫙','Oleoresin richness','The resinous compounds that carry flavour and body.']].map(([e,k,v]) => (
              <div class="flex items-start gap-3 py-2.5 border-t" style="border-color:rgba(255,255,255,.07);"><span class="text-base">{e}</span><div><div class="font-extrabold text-sm text-white">{k}</div><div class="text-[13px]" style="color:rgba(240,240,238,.55);">{v}</div></div></div>
            ))}
          </div>
          <div>
            <h5 class="text-[13px] uppercase tracking-wide font-extrabold mb-3.5" style="color:rgba(240,240,238,.5);">Why people love it</h5>
            {[['🧡','Natural antioxidant','Curcumin is one of the most-studied plant antioxidants.'],['🌿','Ayurvedic heritage','Traditionally valued for supporting the body\'s natural balance.'],['🍵','The soul of golden milk','Haldi doodh, curries, rice — warmth and colour in everything.']].map(([e,k,v]) => (
              <div class="flex items-start gap-3 py-2.5 border-t" style="border-color:rgba(255,255,255,.07);"><span class="text-base">{e}</span><div><div class="font-extrabold text-sm text-white">{k}</div><div class="text-[13px]" style="color:rgba(240,240,238,.55);">{v}</div></div></div>
            ))}
          </div>
        </div>
      </div>

      <div class="rounded-3xl p-8 md:p-11 border mb-5" style="background:radial-gradient(ellipse at 90% 0%, rgba(192,57,43,.12), transparent 60%), #120c0b;border-color:rgba(255,255,255,.08);">
        <div class="flex items-center gap-3.5 mb-1"><span class="text-3xl">🔴</span><div><h3 class="text-2xl font-extrabold text-white">Red Chili (Lal Mirchi)</h3><div class="text-xs font-bold uppercase tracking-wide" style="color:#e88;">Vivid · Fragrant · Bold</div></div></div>
        <p class="my-4 max-w-3xl" style="color:rgba(240,240,238,.6);">More than just heat — good chili powder brings colour, aroma and depth. The colour comes from carotenoid pigments and the aroma from volatile oils, both of which fade under high-heat grinding.</p>
        <div class="grid md:grid-cols-2 gap-7">
          <div>
            <h5 class="text-[13px] uppercase tracking-wide font-extrabold mb-3.5" style="color:rgba(240,240,238,.5);">What stone grinding protects</h5>
            {[['🎨','Deep red colour (carotenoids)','Heat- and oxidation-sensitive — kept vivid, with no added colour.'],['🌿','Fragrant volatile oils','The aroma that tells you it\'s fresh chili, not just heat.'],['🌶️','Honest pungency (capsaicin)','The heat is naturally robust — what you pay for is colour & aroma.']].map(([e,k,v]) => (
              <div class="flex items-start gap-3 py-2.5 border-t" style="border-color:rgba(255,255,255,.07);"><span class="text-base">{e}</span><div><div class="font-extrabold text-sm text-white">{k}</div><div class="text-[13px]" style="color:rgba(240,240,238,.55);">{v}</div></div></div>
            ))}
          </div>
          <div>
            <h5 class="text-[13px] uppercase tracking-wide font-extrabold mb-3.5" style="color:rgba(240,240,238,.5);">Why people love it</h5>
            {[['🔥','Capsaicin warmth','The natural compound behind chili\'s heat, long valued as warming.'],['🧡','Carotenoid antioxidants','The same pigments that make it red are natural antioxidants.'],['🍲','Colour, heat & aroma','Transforms curries, masalas and roasts in one spoon.']].map(([e,k,v]) => (
              <div class="flex items-start gap-3 py-2.5 border-t" style="border-color:rgba(255,255,255,.07);"><span class="text-base">{e}</span><div><div class="font-extrabold text-sm text-white">{k}</div><div class="text-[13px]" style="color:rgba(240,240,238,.55);">{v}</div></div></div>
            ))}
          </div>
        </div>
      </div>

      <div class="rounded-2xl p-5 text-[13px]" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:rgba(240,240,238,.55);">
        <b style="color:#cfe0b5;">An honest note on health.</b> We share these benefits for general education, not as medical advice or a cure for any condition. What we can promise is what's in the jar: organically grown, sun-dried, stone-ground spices with their aroma and colour intact.
      </div>
    </div>
  </section>

  <!-- WHY IT COSTS MORE -->
  <section style="background:#0c0a08;" class="pb-16 px-6">
    <div class="max-w-7xl mx-auto">
      <div class="rounded-3xl p-9 md:p-12" style="background:linear-gradient(135deg,#1a140b 0%,#120c0a 100%);">
        <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:rgba(224,165,58,.75);">Yes, it costs more</p>
        <h2 class="text-3xl font-extrabold tracking-tight mb-2 text-white">And here's exactly why it's worth it</h2>
        <p class="max-w-2xl" style="color:rgba(240,240,238,.55);">Traditional processing is slower, yields less, and takes more hands. You taste every bit of that difference.</p>
        <div class="grid md:grid-cols-3 gap-4 mt-7">
          {[['🐢','Slow by design','Stone grinding takes far longer than a hammer mill — but stays cool, so nothing burns off.'],['☀️','Sun-dried whole','Whole rhizomes and chilies dried in the sun, never rushed with industrial heat.'],['🤏','Small batches','Ground fresh in small lots so aroma reaches you at its peak, not after months on a shelf.']].map(([e,t,d]) => (
            <div class="rounded-2xl p-6" style="background:rgba(255,255,255,.04);border:1px solid rgba(224,165,58,.18);"><div class="text-3xl mb-2.5">{e}</div><div class="font-extrabold text-white mb-1.5">{t}</div><div class="text-[13px]" style="color:rgba(240,240,238,.58);">{d}</div></div>
          ))}
        </div>
      </div>
    </div>
  </section>

  <!-- WAITLIST -->
  <div style="background:#0c0a08;">
    <WaitlistForm
      subject="Spices Waitlist — HariLeaf Farm"
      heading="Get first access to our spices"
      subtext="We're setting up online ordering for our stone-ground turmeric and red chili. Leave your number and we'll message you the moment they're available."
      accent="gold"
    />
  </div>

  <PhotoGallery groupTitle="HariLeaf Spices" categoryPrefix="spice" filters={galleryFilters} accent="gold" />
</SiteLayout>
```

- [ ] **Step 2: Type-check and build**

Run: `npx astro check && npm run build`
Expected: check passes; build succeeds; `/spices` in output.

- [ ] **Step 3: Visual check**

Run `npm run dev`, open http://localhost:4321/spices
Expected: hero (note "smell" gradient), scalable product grid + ghost card, hot-vs-cold temperature panels with gauges + 15–43% stat, two per-spice modules, honesty box, "why it costs more" cards, waitlist. Clicking a product card opens the gallery with the correct filter.

- [ ] **Step 4: Commit**

```bash
git add src/pages/spices.astro
git commit -m "feat: spices page with traditional grinding education"
```

---

## Task 7: Produce page — "Our Ranges" section + ordering hint

**Files:**
- Modify: `src/pages/produce.astro`

Add a navigable "Our Ranges" section and an online-ordering hint on the existing inline CTA strip. The existing CTA strip lives in the bento grid as the last `FadeIn` (the "Bento inline CTA strip", around lines 267–284 with `href="#bulk-request"`).

- [ ] **Step 1: Add the "Our Ranges" section**

In `src/pages/produce.astro`, immediately after the closing `</section>` of the BENTO CATALOGUE section (the one that ends right before `<PhotoStrip />`, around line 288), insert:

```astro
  <!-- OUR RANGES -->
  <section style="background:#0c110c;" class="pb-16 px-6">
    <div class="max-w-7xl mx-auto">
      <FadeIn>
        <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:rgba(159,177,125,.7);">Explore more of the farm</p>
        <h2 class="text-3xl font-extrabold tracking-tight mb-2 text-white">Our ranges</h2>
        <p class="mb-8 max-w-xl" style="color:rgba(240,240,238,.55);">Beyond fresh produce, HariLeaf now grows and makes two more ranges — each with its own story, nutrition and (soon) online ordering.</p>
      </FadeIn>
      <div class="grid md:grid-cols-2 gap-4">
        <FadeIn>
          <a href="/rice" class="block relative overflow-hidden rounded-3xl p-9 border transition-transform duration-200 hover:-translate-y-1" style="background:linear-gradient(145deg,#1a2a1a 0%,#0e1a0e 100%);border-color:rgba(139,212,198,.22);min-height:210px;">
            <div class="absolute top-3.5 right-4 text-[5.5rem] opacity-[0.14] pointer-events-none leading-none" aria-hidden="true">🌾</div>
            <div class="relative z-10 flex flex-col justify-end h-full" style="min-height:150px;">
              <h3 class="text-2xl font-extrabold text-white mb-2">HariLeaf Rice</h3>
              <p class="text-sm mb-4 max-w-sm" style="color:rgba(240,240,238,.6);">Three heritage varieties — Karjat 3, Wada Kolam and antioxidant-rich Red Rice. Grown organically, milled gently.</p>
              <span class="text-[13px] font-extrabold" style="color:#8bd4c6;">Explore our rice →</span>
            </div>
          </a>
        </FadeIn>
        <FadeIn delay={80}>
          <a href="/spices" class="block relative overflow-hidden rounded-3xl p-9 border transition-transform duration-200 hover:-translate-y-1" style="background:linear-gradient(145deg,#1a140b 0%,#1a0a08 100%);border-color:rgba(224,165,58,.24);min-height:210px;">
            <div class="absolute top-3.5 right-4 text-[5.5rem] opacity-[0.14] pointer-events-none leading-none" aria-hidden="true">🌶️</div>
            <div class="relative z-10 flex flex-col justify-end h-full" style="min-height:150px;">
              <h3 class="text-2xl font-extrabold text-white mb-2">Stone-Ground Spices</h3>
              <p class="text-sm mb-4 max-w-sm" style="color:rgba(240,240,238,.6);">Turmeric &amp; red chili, stone-ground the traditional way so aroma and colour survive. Benefits &amp; nutrition inside.</p>
              <span class="text-[13px] font-extrabold" style="color:#e8b84a;">Explore our spices →</span>
            </div>
          </a>
        </FadeIn>
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Add the ordering hint to the existing CTA strip**

In the "Bento inline CTA strip" block, replace the inner `<div>` (the text side, containing the two `<p>` tags) so it leads with the coming-soon badge. Find:

```astro
            <div>
              <p class="text-xs font-bold uppercase tracking-wider mb-1" style="color:#9fb17d;">All produce organically grown · No chemicals · No pesticides</p>
              <p class="text-base font-bold" style="color:#f0f0ee;">Interested in placing a bulk order?</p>
            </div>
```

Replace with:

```astro
            <div>
              <span class="inline-block text-[10px] font-extrabold uppercase tracking-widest mb-2 px-3 py-1 rounded-full" style="color:#ffc878;background:rgba(255,180,80,.14);border:1px solid rgba(255,180,80,.3);">🛒 Online ordering — coming soon</span>
              <p class="text-xs font-bold uppercase tracking-wider mb-1" style="color:#9fb17d;">All produce organically grown · No chemicals · No pesticides</p>
              <p class="text-base font-bold" style="color:#f0f0ee;">Interested in placing a bulk order?</p>
            </div>
```

- [ ] **Step 3: Type-check and build**

Run: `npx astro check && npm run build`
Expected: passes.

- [ ] **Step 4: Visual check**

Run `npm run dev`, open http://localhost:4321/produce
Expected: existing catalogue unchanged; new "Our Ranges" section with two cards linking to `/rice` and `/spices`; the inline CTA strip now shows the "coming soon" badge. No "NEW" badge on the range cards.

- [ ] **Step 5: Commit**

```bash
git add src/pages/produce.astro
git commit -m "feat: produce page ranges section and ordering hint"
```

---

## Task 8: Produce ▾ dropdown navigation

**Files:**
- Modify: `src/content/navigation.json`
- Modify: `src/components/layout/Header.astro`

Group Fresh Produce, Rice, and Spices under a "Produce ▾" parent using the existing `children` array, and add dropdown rendering to the header (desktop hover/focus dropdown + mobile nested links).

- [ ] **Step 1: Update navigation.json**

Replace the Produce entry in `src/content/navigation.json` so `items` reads:

```json
{
  "items": [
    { "label": "Technology",        "url": "/technology", "children": [] },
    { "label": "Solutions & Farms", "url": "/solutions",  "children": [] },
    {
      "label": "Produce",
      "url": "/produce",
      "children": [
        { "label": "Fresh Produce", "url": "/produce" },
        { "label": "Rice",          "url": "/rice" },
        { "label": "Spices",        "url": "/spices" }
      ]
    },
    { "label": "About",             "url": "/about",      "children": [] },
    { "label": "Contact",           "url": "/contact",    "children": [] }
  ],
  "ctaButton": {
    "label": "Get Started",
    "url": "/contact"
  }
}
```

- [ ] **Step 2: Render the desktop dropdown**

In `src/components/layout/Header.astro`, replace the desktop nav links block (the `<div class="hidden md:flex items-center gap-8">{items.map(...)}</div>`) with a version that renders a dropdown when `item.children.length > 0`:

```astro
    <!-- Desktop nav links -->
    <div class="hidden md:flex items-center gap-8">
      {items.map((item) => (
        item.children && item.children.length > 0 ? (
          <div class="relative group">
            <a
              href={item.url}
              class:list={[
                'font-manrope font-medium tracking-tight transition-colors duration-200 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded-sm',
                isActive(item.url)
                  ? 'text-[#196A5E] border-b-2 border-[#196A5E] pb-1'
                  : 'text-[#3F4946] hover:text-[#196A5E]',
              ]}
              aria-current={isActive(item.url) ? 'page' : undefined}
            >
              {item.label}
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="mt-0.5 opacity-70"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
            <div class="absolute left-0 top-full pt-3 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 transition-all duration-200">
              <div class="min-w-[190px] rounded-2xl bg-[#F7FAF4]/95 backdrop-blur-md shadow-lg border border-outline-variant/20 p-2">
                {item.children.map((child) => (
                  <a
                    href={child.url}
                    class:list={[
                      'block rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                      isActive(child.url) ? 'bg-[#196A5E]/10 text-[#196A5E]' : 'text-[#3F4946] hover:bg-surface-container-low hover:text-[#196A5E]',
                    ]}
                    aria-current={isActive(child.url) ? 'page' : undefined}
                  >
                    {child.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <a
            href={item.url}
            class:list={[
              'font-manrope font-medium tracking-tight transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded-sm',
              isActive(item.url)
                ? 'text-[#196A5E] border-b-2 border-[#196A5E] pb-1'
                : 'text-[#3F4946] hover:text-[#196A5E] nav-link-animated',
            ]}
            aria-current={isActive(item.url) ? 'page' : undefined}
          >
            {item.label}
          </a>
        )
      ))}
    </div>
```

- [ ] **Step 3: Render children in the mobile menu**

In the mobile menu `<ul>` (`items.map((item) => (<li>...`), replace the `<li>` mapping to also render children as an indented sub-list:

```astro
      {items.map((item) => (
        <li>
          <a
            href={item.url}
            class:list={[
              'flex items-center justify-between rounded-xl px-4 py-4 text-lg font-semibold tracking-tight transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              isActive(item.url)
                ? 'bg-[#196A5E]/10 text-[#196A5E]'
                : 'text-on-surface hover:bg-surface-container-low hover:text-[#196A5E]',
            ]}
            aria-current={isActive(item.url) ? 'page' : undefined}
          >
            {item.label}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" class="opacity-40" aria-hidden="true">
              <path d="M6 3L11 8L6 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>
          {item.children && item.children.length > 0 && (
            <ul class="ml-4 mt-1 mb-1 space-y-1 border-l border-outline-variant/30 pl-3" role="list">
              {item.children.map((child) => (
                <li>
                  <a
                    href={child.url}
                    class:list={[
                      'block rounded-lg px-4 py-3 text-base font-medium transition-colors',
                      isActive(child.url) ? 'text-[#196A5E]' : 'text-on-surface-variant hover:text-[#196A5E]',
                    ]}
                    aria-current={isActive(child.url) ? 'page' : undefined}
                  >
                    {child.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
```

- [ ] **Step 4: Type-check and build**

Run: `npx astro check && npm run build`
Expected: passes. (If `astro check` complains about `item.children`/`child` types from the JSON import, that's acceptable only if it's a warning; if it's an error, add a local interface at the top of the frontmatter: `interface NavChild { label: string; url: string } interface NavItem { label: string; url: string; children: NavChild[] }` and cast `const items = (navJson.items ?? [...]) as NavItem[];`.)

- [ ] **Step 5: Visual check**

Run `npm run dev`. On desktop (≥768px), hovering "Produce" shows a dropdown with Fresh Produce / Rice / Spices; each navigates correctly and the parent shows active on any of those routes. On mobile, the hamburger menu shows Produce with the three indented sub-links.

- [ ] **Step 6: Commit**

```bash
git add src/content/navigation.json src/components/layout/Header.astro
git commit -m "feat: Produce dropdown nav grouping rice and spices"
```

---

## Task 9: Full verification pass

**Files:** none (verification + sitemap check)

- [ ] **Step 1: Clean type-check + build**

Run: `npx astro check && npm run build`
Expected: check passes with 0 errors; build succeeds. Confirm `/rice`, `/spices`, `/produce` are all in the build output and present in `dist/`.

- [ ] **Step 2: Sitemap includes new pages**

Run: `grep -o '<loc>[^<]*</loc>' dist/sitemap-0.xml | grep -E 'rice|spices'`
Expected: both `/rice` and `/spices` URLs appear (the `@astrojs/sitemap` integration picks up prerendered pages automatically).

- [ ] **Step 3: Manual smoke test on preview**

Run: `npm run preview`, then click through: Produce dropdown → each page loads; gallery modals open/filter/close; waitlist forms render with the Web3Forms hidden fields; community CTA scrolls to waitlist; produce "Our Ranges" links work.

- [ ] **Step 4: Final commit (if any docs/notes changed)**

```bash
git add -A
git commit -m "chore: verify rice & spices pages build and sitemap" --allow-empty
```

---

## Self-Review Notes

- **Spec coverage:** `/rice` (Task 5), `/spices` (Task 6), produce additions (Task 7), waitlist (Task 3, used in 5/6), gallery modal (Task 4, used in 5/6), CMS category (Tasks 1–2), nav dropdown (Task 8), SEO titles/descriptions (in page frontmatter), honest-claims copy (embedded verbatim from guardrails). All four resolved open questions are reflected: scroll-to-waitlist CTA (Task 5), concrete+approximate numbers (Task 5), Produce dropdown (Task 8), modal gallery (Task 4).
- **Type consistency:** `Photo.category?: string` defined in Task 1 and consumed in Tasks 2 & 4; `openHariGallery(filter)` defined in Task 4 and called in Tasks 5 & 6; category values (`rice:karjat|wada|red`, `spice:turmeric|chili`) consistent across admin selector (Task 2), page cards (Tasks 5/6), and gallery filters.
- **No placeholders:** every code step contains full content.
- **Photos-are-only-dynamic-content** decision honored: variety/spice/nutrition copy is hardcoded in the pages (matches how produce catalogue text started).
