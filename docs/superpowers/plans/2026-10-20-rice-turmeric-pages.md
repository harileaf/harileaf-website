# Rice & Turmeric Story Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Story-led rice and turmeric product pages, a new `/turmeric` landing page, a reworked `/rice` page and a `/spices` hub. All their words, photos, steps and rows are edited in `/admin`, stored in D1, and claims-checked.

**Architecture:** A product's story is one JSON column (`products.story`), checked on save. Landing pages are rows in a new `story_pages` table, each holding a `draft` and a `published` JSON object. Pages use fixed templates (`PAGE_LAYOUTS`) and get their story sections from one linked "Story from" product. Astro components in `src/components/store/story/` render both product and landing pages. Admin editing uses two new React islands. Claims rules live in `claims.ts` (word lists) and `story-claims.ts` (contexts and checks). Every write enqueues cache purges through the existing outbox.

**Tech Stack:** Astro 5 SSR on Cloudflare Workers, D1 (SQLite), R2, React islands for admin, Vitest with `@cloudflare/vitest-pool-workers`, Playwright, Lighthouse CI.

**Spec:** `docs/superpowers/specs/2026-10-20-rice-turmeric-pages-design.md` (approved, commit `e803626`).

**Out of scope:**
- Rollout step 0 (GI clean-up of the live `/rice`): already merged to `main` as PR #13 (`1c07d01`).
- Infographic artwork.
- Deleting the legacy components (rollout step 4, a later PR).

---

## Conventions for every task

- Work in the worktree `/Users/nishit/harileaf/.claude/worktrees/agent-a729bf1812bc8d64e` on branch `feat/rice-turmeric-pages`. Never edit `/Users/nishit/harileaf` (another session uses that checkout).
- Stage files by name. **Never `git commit -a`.**
- End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP
  ```
- Test commands:
  - Unit and integration tests run in the Workers pool: `npx vitest run <file>`. The whole suite: `npm test`.
  - Types: `npx astro check`. Expect `0 errors`.
  - Build: `npm run build`. Expect it to end with `Complete!`.
  - E2E: `npm run test:e2e`. First warm the dev server: `node e2e/setup-db.mjs && E2E=1 npm run dev`, then curl `/`, `/cart/`, `/checkout/`, `/turmeric/` and `/admin/` before running Playwright.
- Admin routes follow `src/pages/api/admin/products/[id]/index.ts`:
  - `isAdmin` → `unauthorised()`
  - `idParam`, `readJson`, `json`
  - `drainSoon(env, locals)` after writes
- Library writes follow `catalog-admin.ts`: one `db.batch([...])`, which includes `purgeStmts(...)`.

## File map

**Create**

| File | Responsibility |
|---|---|
| `migrations/0008_story_pages.sql` | `products.story`, GI columns, `product_images.kind`, `story_pages` table and seed rows |
| `src/lib/store/story.ts` | Story/page types, `PAGE_LAYOUTS`, coercion, structural validation, text walkers, lab-value lookup, proof resolution |
| `src/lib/store/story-claims.ts` | Claims contexts (product, page-wide intersection, strictest), `checkProductStory`, `checkStoryPage`, field labels |
| `src/lib/store/story-pages.ts` | D1 reads/writes: draft save, publish, product-story save, published-page conflicts, view-model loader, story links |
| `src/pages/api/admin/products/[id]/story.ts` | `PUT` product story |
| `src/pages/api/admin/pages/index.ts` | `GET` page list |
| `src/pages/api/admin/pages/[slug]/index.ts` | `GET` page, `PUT` draft |
| `src/pages/api/admin/pages/[slug]/publish.ts` | `POST` publish |
| `src/pages/admin/pages/index.astro` | Pages list |
| `src/pages/admin/pages/[slug].astro` | Page editor shell |
| `src/pages/admin/preview/product.astro` | `POST` product preview (unsaved story) |
| `src/pages/admin/preview/page/[slug].astro` | `GET` draft preview |
| `src/components/admin/story-ui.tsx` | Shared admin bits: `Field`, styles, `send`, `MoveButtons`, `ImagePicker` |
| `src/components/admin/ProductStoryEditor.tsx` | Product story island |
| `src/components/admin/StoryPageEditor.tsx` | Landing-page island |
| `src/components/store/story/*.astro` | Section kit (16 small components, Task 11) |
| `src/lib/store/purge.ts` | `purgeStmts` (moved from `catalog-admin.ts`; shared with `story-pages.ts`) |
| `src/components/store/StoryPageView.astro` | Renders a landing page from a view model |
| `src/components/store/legacy/RiceLegacy.astro`, `SpicesLegacy.astro` | Today's `/rice` and `/spices` markup (rollout guard) |
| `src/pages/turmeric.astro` | New landing route |
| `tests/unit/story.test.ts`, `tests/unit/story-claims.test.ts`, `tests/integration/story-pages.test.ts` | Tests |

**Modify**

| File | Change |
|---|---|
| `src/lib/store/urls.ts` | `STORY_PAGE_SLUGS`, `isStoryPageSlug` |
| `src/lib/store/claims.ts` | GI rule, comparison terms, certification words |
| `src/lib/store/catalog.ts` | `ProductRow` new columns; `Product.story`, `Product.gi`; `Image.kind`; `getProductsByIds`, `activeLabSummaries`; `siblings` and `includeDraft` on the product page |
| `src/lib/store/catalog-admin.ts` | GI fields and rule; image `kind`; `purgeStmts` moved to `purge.ts`; story and published-page re-check in `saveProduct`; `/turmeric` in storefront purge |
| `src/lib/store/edge-cache.ts` | `/turmeric` cacheable and purged with spices |
| `src/lib/store/feed.ts` | A duplicate `extra` raises `lastmod` |
| `src/lib/store/editor-media.ts` | Image `kind` |
| `src/pages/media/[...key].ts` | Serve `photos/` |
| `src/pages/sitemap-store.xml.ts` | Story-page extras |
| `src/pages/api/admin/products/[id]/images.ts` | Accept `kind` |
| `src/pages/rice.astro`, `src/pages/spices.astro` | Story page or legacy |
| `src/pages/rice/[slug].astro`, `src/pages/spices/[slug].astro` | Pass `storyLink` |
| `src/components/store/ProductPageView.astro`, `BuyBox.astro` | Story sections, `under-title` slot |
| `src/components/admin/ProductEditor.tsx`, `src/pages/admin/products/[id].astro` | GI fields, photo/infographic toggle, claim-code picker, labelled lab rows, story island |
| `src/layouts/AdminLayout.astro` | "Pages" nav item |
| `tests/helpers/product-fixture.ts` | `story`, `gi` defaults |
| `tests/unit/claims.test.ts`, `edge-cache.test.ts`, `feed.test.ts`, `tests/integration/schema.test.ts`, `catalog-admin.test.ts`, `catalog.test.ts` | New cases |
| `.github/workflows/ci.yml` | Lighthouse seed runs `seed-dev-story.sql` |
| `e2e/setup-db.mjs`, `e2e/storefront.spec.ts`, `scripts/seed-dev-story.sql` (new), `lighthouserc.json` | E2E and Lighthouse |

---
## Task 0: Bring in the GI clean-up from `main`

PR #13 removed the GI wording and the name "Wada Kolam" from the live `/rice` (merged as `1c07d01`); `main` has moved on since (PR #14, `ff0cc31`). Merge `origin/main` in first, so that the legacy components are later moved from the cleaned copy.

**Files:** none edited by hand.

- [ ] **Step 1: Merge**

```bash
cd /Users/nishit/harileaf/.claude/worktrees/agent-a729bf1812bc8d64e
git fetch origin
git merge --no-ff origin/main -m "Merge origin/main (GI clean-up of /rice, PR #13) into feat/rice-turmeric-pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

Expected: a clean merge (this branch only adds docs).

- [ ] **Step 2: Verify that the clean-up is present**

Run: `grep -c -i -E "GI-tagged|Wada Kolam" src/pages/rice.astro`
Expected: `0`

Run: `grep -c "Kolam from Wada" src/pages/rice.astro`
Expected: a number ≥ 1

- [ ] **Step 3: Baseline**

Run: `npm test 2>&1 | grep -E "Test Files|Tests "`
Expected: all passing (e.g. `Test Files  53 passed`). Record the counts: later tasks only add tests.

---

## Task 1: Migration 0008

**Files:**
- Create: `migrations/0008_story_pages.sql`
- Test: `tests/integration/schema.test.ts` (append)

- [ ] **Step 1: Write the failing schema test**

Append to `tests/integration/schema.test.ts`:

```ts
describe('story pages (0008)', () => {
  it('stores a product story only as a JSON object, and GI fields as text', async () => {
    await expect(insertProduct({ story: '[]' })).rejects.toThrow(/CHECK/);
    await expect(insertProduct({ story: 'not json' })).rejects.toThrow(/CHECK/);
    await expect(insertProduct({ story: '{"processSteps":[]}', gi_name: 'Wada Kolam', gi_au_reg_number: 'AU-1' })).resolves.toBeTypeOf('number');
    await expect(insertProduct({ story: null })).resolves.toBeTypeOf('number');
  });

  it('marks images as photo by default and allows only photo or infographic', async () => {
    const pid = await insertProduct();
    await db.prepare("INSERT INTO product_images (product_id, r2_key, alt, sort) VALUES (?, 'products/x/a.jpg', 'a', 0)").bind(pid).run();
    expect(await scalar(`SELECT kind FROM product_images WHERE product_id = ${pid}`)).toBe('photo');
    await expect(db.prepare("INSERT INTO product_images (product_id, r2_key, alt, sort, kind) VALUES (?, 'products/x/b.jpg', 'b', 1, 'banner')").bind(pid).run()).rejects.toThrow(/CHECK/);
  });

  it('seeds the three landing pages as unpublished drafts', async () => {
    const { results } = await db.prepare('SELECT slug, published, json_type(draft) AS t FROM story_pages ORDER BY slug').all<{ slug: string; published: string | null; t: string }>();
    expect(results).toEqual([
      { slug: 'rice', published: null, t: 'object' },
      { slug: 'spices', published: null, t: 'object' },
      { slug: 'turmeric', published: null, t: 'object' },
    ]);
    const rice = await scalar("SELECT draft FROM story_pages WHERE slug = 'rice'");
    expect(String(rice)).not.toMatch(/GI-tagged|Wada Kolam/i);
  });

  it('rejects a draft that is not a JSON object', async () => {
    await expect(db.prepare("INSERT INTO story_pages (slug, draft, draft_saved_at) VALUES ('x', '[]', ?)").bind(AT).run()).rejects.toThrow(/CHECK/);
  });
});
```

Make sure that `scalar` is imported at the top: change the import line to `import { AT, db, insertOrder, insertProduct, insertVariant, scalar } from '../helpers/fixtures';`. It already imports these, so keep it unchanged if they're all present.

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `npx vitest run tests/integration/schema.test.ts`
Expected: FAIL, with `no such column: story` / `no such table: story_pages`

- [ ] **Step 3: Write the migration**

Create `migrations/0008_story_pages.sql`:

```sql
-- Story pages (spec 2026-10-20-rice-turmeric-pages-design.md).

-- Product story sections (null = no story; the product page keeps the classic bento).
ALTER TABLE products ADD COLUMN story TEXT CHECK (story IS NULL OR (json_valid(story) AND json_type(story) = 'object'));
-- Geographical Indication: the badge and the registered name only with both values (enforced in code).
ALTER TABLE products ADD COLUMN gi_name TEXT;
ALTER TABLE products ADD COLUMN gi_au_reg_number TEXT;
-- Gallery images: photos vs designed infographics.
ALTER TABLE product_images ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'infographic'));

-- Landing pages: slug validated in code (isStoryPageSlug), draft always present, published once published.
CREATE TABLE story_pages (
  slug            TEXT PRIMARY KEY,
  draft           TEXT NOT NULL CHECK (json_valid(draft) AND json_type(draft) = 'object'),
  published       TEXT CHECK (published IS NULL OR (json_valid(published) AND json_type(published) = 'object')),
  draft_saved_at  TEXT NOT NULL,
  published_at    TEXT
);

-- Seed drafts. /rice carries today's copy without GI wording or the registered name.
INSERT INTO story_pages (slug, draft, published, draft_saved_at, published_at) VALUES
('rice', json('{"seo":{"title":"Heritage Rice Online: Karjat 3, Kolam from Wada & Red Rice | HariLeaf","description":"Buy HariLeaf heritage rice, grown on our farm and milled just enough to remove the husk, so the bran and germ stay on the grain."},"hero":{"eyebrow":"HariLeaf rice","line1":"Rice with the bran","line2":"left on.","subtitle":"Three heritage varieties, transplanted by hand, cut with sickles, sun-dried and milled just once.","ctaLabel":"Choose your rice","photoKey":null,"photoAlt":"","proof":[]},"productIds":[],"storyFromProductId":null,"cardBlurbs":{},"labColumns":["Moisture","Broken grains","Pesticide residues"],"facts":[{"title":"Grown on our farm","text":"Grown and harvested by us, with the batch and packed-on date on every pack."},{"title":"Minimally processed","text":"We mill just enough to remove the husk and keep the grain whole."},{"title":"Farmer-direct","text":"Sold by the people who grow it."}],"faq":[],"note":"","closing":"Good food is grown, not manufactured.","hidden":[]}'), NULL, '2026-10-20T00:00:00.000Z', NULL),
('turmeric', json('{"seo":{"title":"","description":""},"hero":{"eyebrow":"HariLeaf turmeric","line1":"Haldi the slow way.","line2":"Boiled, sun-cured, stone-ground.","subtitle":"","ctaLabel":"Buy turmeric","photoKey":null,"photoAlt":"","proof":[]},"productIds":[],"storyFromProductId":null,"cardBlurbs":{},"labColumns":["Curcumin","Volatile oil","Moisture"],"facts":[],"faq":[],"note":"","closing":"","hidden":[]}'), NULL, '2026-10-20T00:00:00.000Z', NULL),
('spices', json('{"seo":{"title":"Stone-Ground Spices | HariLeaf","description":""},"hero":{"eyebrow":"HariLeaf spices","line1":"Spices ground slowly, on stone.","line2":"","subtitle":"","ctaLabel":"","photoKey":null,"photoAlt":"","proof":[]},"productIds":[],"storyFromProductId":null,"cardBlurbs":{},"labColumns":[],"facts":[],"faq":[],"note":"","closing":"","hidden":[]}'), NULL, '2026-10-20T00:00:00.000Z', NULL);
```

- [ ] **Step 4: Run the test and confirm that it passes**

Run: `npx vitest run tests/integration/schema.test.ts`
Expected: PASS. The vitest setup applies every migration via `readD1Migrations`.

- [ ] **Step 5: Commit**

```bash
git add migrations/0008_story_pages.sql tests/integration/schema.test.ts
git commit -m "feat(store): migration 0008 — product story, GI fields, image kind, story_pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---

## Task 2: Story types, layouts, coercion and structural validation

**Files:**
- Modify: `src/lib/store/urls.ts`
- Create: `src/lib/store/story.ts`
- Test: `tests/unit/story.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/story.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  EMPTY_STORY, PAGE_LAYOUTS, coerceProductStory, coerceStoryPage, emptyStoryPage, labValue, pageWideTexts, resolveProof,
  storyTexts, validateProductStory, validateStoryPageStructure, type ProductStory,
} from '../../src/lib/store/story';
import { STORY_PAGE_SLUGS, isStoryPageSlug } from '../../src/lib/store/urls';

const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Step ${i + 1}`, text: 'Done by hand.', photoKey: null, photoAlt: '' }));
const story = (over: Partial<ProductStory> = {}): ProductStory => ({ ...EMPTY_STORY, ...over });

describe('story pages', () => {
  it('knows its three slugs and their fixed layouts', () => {
    expect(STORY_PAGE_SLUGS).toEqual(['rice', 'turmeric', 'spices']);
    expect(isStoryPageSlug('turmeric')).toBe(true);
    expect(isStoryPageSlug('produce')).toBe(false);
    expect(PAGE_LAYOUTS.turmeric).toEqual(['hero', 'cards', 'photo_strip', 'comparison', 'lab_table', 'growers', 'facts', 'use', 'faq', 'closing']);
    expect(PAGE_LAYOUTS.rice).toEqual(['hero', 'cards', 'origin', 'photo_strip', 'comparison', 'lab_table', 'growers', 'use', 'faq', 'closing']);
    expect(PAGE_LAYOUTS.spices).toEqual(['hero', 'cards', 'note', 'closing']);
  });

  it('coerces untrusted page JSON into the full shape, dropping junk', () => {
    const p = coerceStoryPage({ hero: { line1: ' Haldi ', proof: [{ productId: '3', key: 'Curcumin', label: 'Curcumin' }, 'x'] }, productIds: [3, 'a', 4, 3], cardBlurbs: { 3: 'Fine powder', x: 'no' }, hidden: ['faq', 'hero'], facts: [{ title: 'A', text: 'B' }] });
    expect(p.hero.line1).toBe('Haldi');
    expect(p.hero.proof).toEqual([{ productId: 3, key: 'Curcumin', label: 'Curcumin' }]);
    expect(p.productIds).toEqual([3, 4]);
    expect(p.cardBlurbs).toEqual({ '3': 'Fine powder' });
    expect(p.hidden).toEqual(['faq']);
    expect(p.facts).toEqual([{ title: 'A', text: 'B' }]);
    expect(coerceStoryPage(null)).toEqual(emptyStoryPage());
  });

  it('checks page structure: limits and lengths', () => {
    const p = emptyStoryPage();
    p.seo.title = 'x'.repeat(71);
    p.facts = Array.from({ length: 7 }, () => ({ title: 't', text: 'x' }));
    p.hero.proof = [1, 2, 3].map((n) => ({ productId: n, key: 'Curcumin', label: 'C' }));
    const e = validateStoryPageStructure('turmeric', p);
    expect(e['seo.title']).toMatch(/70/);
    expect(e.facts).toMatch(/6/);
    expect(e['hero.proof']).toMatch(/2/);
  });
});

describe('product story', () => {
  it('coerces to null when absent and keeps valid parts', () => {
    expect(coerceProductStory(null)).toBeNull();
    const s = coerceProductStory({ icons: [{ icon: 'sun', label: 'Sun-cured' }, { icon: 'rocket', label: 'x' }], proofLine: [{ kind: 'lab', key: 'Curcumin', label: 'Curcumin' }, { kind: 'text', text: 'Lab-tested every batch' }] });
    expect(s?.icons).toEqual([{ icon: 'sun', label: 'Sun-cured' }]);
    expect(s?.proofLine).toHaveLength(2);
    expect(s?.processSteps).toEqual([]);
  });

  it('requires 3–8 steps when there are any, alt text for photos, and sources for numbers', () => {
    expect(validateProductStory(story({ processSteps: steps(2) })).processSteps).toMatch(/3/);
    expect(validateProductStory(story({ processSteps: steps(9) })).processSteps).toMatch(/8/);
    expect(validateProductStory(story({ processSteps: [...steps(2), { title: 'Dug', text: 'By hand', photoKey: 'photos/a.jpg', photoAlt: '' }] }))['processSteps.2']).toMatch(/Describe the photo/);
    const comparison = { heading: 'Stone vs mill', oursLabel: 'Ours', theirsLabel: 'High-speed mill', note: '', imageKey: null, imageAlt: '', rows: [
      { aspect: 'Heat', ours: 'Stays cool', theirs: 'Friction heat', source: '' },
      { aspect: 'Fibre', ours: '3.2 g', theirs: '0.6 g', source: '' },
    ] };
    expect(validateProductStory(story({ comparison }))['comparison.rows.1']).toMatch(/numbers need a source/);
    comparison.rows[1].source = 'IFCT 2017';
    expect(validateProductStory(story({ comparison }))).toEqual({});
  });

  it('rejects image keys outside the photo library and product images', () => {
    const e = validateProductStory(story({ originStory: { heading: 'Wada', bodyMd: 'Kolam rice', photoKey: '../invoices/x.pdf', photoAlt: 'x' } }));
    expect(e['originStory.photoKey']).toMatch(/Choose a photo/);
  });

  it('walks every visible text with its field key', () => {
    const t = storyTexts(story({ icons: [{ icon: 'sun', label: 'Sun-cured' }], use: { kind: 'cook', heading: 'How to cook', steps: ['Soak 30 min'] } }));
    expect(t).toEqual(expect.arrayContaining([['icons.0', 'Sun-cured'], ['use.heading', 'How to cook'], ['use.steps.0', 'Soak 30 min']]));
    const p = emptyStoryPage();
    p.hero.line2 = 'Boiled';
    expect(pageWideTexts(p)).toEqual(expect.arrayContaining([['hero.line2', 'Boiled']]));
  });
});

describe('lab values', () => {
  it('matches keys case-insensitively and hides missing values', () => {
    const summary = { curcumin: '5.1 %', 'Volatile oil': '4.2 %', Moisture: 9 };
    expect(labValue(summary, 'Curcumin')).toBe('5.1 %');
    expect(labValue(summary, 'moisture')).toBeNull(); // non-string values are ignored
    expect(resolveProof([{ kind: 'lab', key: 'Curcumin', label: 'Curcumin' }, { kind: 'lab', key: 'Ash', label: 'Ash' }, { kind: 'text', text: 'Lab-tested every batch' }], summary))
      .toEqual(['Curcumin 5.1 %', 'Lab-tested every batch']);
    expect(resolveProof([{ kind: 'lab', key: 'Curcumin', label: 'Curcumin' }], null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `npx vitest run tests/unit/story.test.ts`
Expected: FAIL, with `Failed to resolve import "../../src/lib/store/story"`

- [ ] **Step 3: Add the slugs to `urls.ts`**

In `src/lib/store/urls.ts`, after the `isCategorySlug` line (line 8), add:

```ts
/** Landing pages edited in /admin/pages (fixed templates; a new one is a code change). */
export const STORY_PAGE_SLUGS = ['rice', 'turmeric', 'spices'] as const;
export type StoryPageSlug = (typeof STORY_PAGE_SLUGS)[number];

export const isStoryPageSlug = (s: string): s is StoryPageSlug => (STORY_PAGE_SLUGS as readonly string[]).includes(s);
```

- [ ] **Step 4: Write `story.ts`**

Create `src/lib/store/story.ts`:

```ts
/**
 * Story sections (spec 2026-10-20-rice-turmeric-pages-design.md): the
 * product story stored in `products.story`, the landing pages in
 * `story_pages`, their fixed layouts, coercion of untrusted JSON and the
 * structural checks. Claims checks live in story-claims.ts.
 */
import type { StoryPageSlug } from './urls';

type FieldErrors = Record<string, string>;

export const STORY_ICONS = ['stone_mill', 'sun', 'lab', 'hand', 'grain', 'leaf', 'water', 'gi'] as const;
export type StoryIcon = (typeof STORY_ICONS)[number];

export type ProofItem = { kind: 'text'; text: string } | { kind: 'lab'; key: string; label: string; suffix?: string };

export interface ProcessStep { title: string; text: string; photoKey: string | null; photoAlt: string }
export interface ComparisonRow { aspect: string; ours: string; theirs: string; source: string }
export interface Comparison { heading: string; oursLabel: string; theirsLabel: string; rows: ComparisonRow[]; note: string; imageKey: string | null; imageAlt: string }
export interface Grower { names: string; place: string; since: string; bodyMd: string; photoKey: string | null; photoAlt: string }
export interface OriginStory { heading: string; bodyMd: string; photoKey: string | null; photoAlt: string }
export interface UseBlock { kind: 'cook' | 'use'; heading: string; steps: string[] }

export interface ProductStory {
  proofLine: ProofItem[];
  icons: Array<{ icon: StoryIcon; label: string }>;
  showCategorySwitcher: boolean;
  originStory: OriginStory | null;
  processSteps: ProcessStep[];
  comparison: Comparison | null;
  grower: Grower | null;
  use: UseBlock | null;
}

export const EMPTY_STORY: ProductStory = {
  proofLine: [], icons: [], showCategorySwitcher: false, originStory: null, processSteps: [], comparison: null, grower: null, use: null,
};

export const HIDEABLE_SECTIONS = ['origin', 'photo_strip', 'comparison', 'lab_table', 'growers', 'facts', 'use', 'faq'] as const;
export type HideableSection = (typeof HIDEABLE_SECTIONS)[number];
export type SectionKey = 'hero' | 'cards' | HideableSection | 'note' | 'closing';

export interface HeroProof { productId: number; key: string; label: string; suffix?: string }

export interface StoryPage {
  seo: { title: string; description: string };
  hero: { eyebrow: string; line1: string; line2: string; subtitle: string; ctaLabel: string; photoKey: string | null; photoAlt: string; proof: HeroProof[] };
  /** Card order; also the claims context and the lab-table source. */
  productIds: number[];
  /** Supplies origin, photo strip, comparison and use (rice, turmeric); on /spices, the turmeric card's product. */
  storyFromProductId: number | null;
  cardBlurbs: Record<string, string>;
  labColumns: string[];
  facts: Array<{ title: string; text: string }>;
  faq: Array<{ q: string; a: string }>;
  note: string;
  closing: string;
  hidden: HideableSection[];
}

/** Section order per page. The owner can hide sections but never add or reorder them. */
export const PAGE_LAYOUTS: Record<StoryPageSlug, SectionKey[]> = {
  turmeric: ['hero', 'cards', 'photo_strip', 'comparison', 'lab_table', 'growers', 'facts', 'use', 'faq', 'closing'],
  rice: ['hero', 'cards', 'origin', 'photo_strip', 'comparison', 'lab_table', 'growers', 'use', 'faq', 'closing'],
  spices: ['hero', 'cards', 'note', 'closing'],
};

/** Standard lab summary keys suggested per category (matching is case-insensitive). */
export const LAB_KEYS: Record<string, string[]> = {
  spices: ['Curcumin', 'Volatile oil', 'Moisture', 'Added colour'],
  rice: ['Moisture', 'Broken grains', 'Pesticide residues'],
  produce: ['Pesticide residues'],
};

export const emptyStoryPage = (): StoryPage => ({
  seo: { title: '', description: '' },
  hero: { eyebrow: '', line1: '', line2: '', subtitle: '', ctaLabel: '', photoKey: null, photoAlt: '', proof: [] },
  productIds: [], storyFromProductId: null, cardBlurbs: {}, labColumns: [], facts: [], faq: [], note: '', closing: '', hidden: [],
});

// ── coercion ──────────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const keyOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

const step = (v: unknown): ProcessStep => {
  const o = obj(v);
  return { title: s(o.title), text: s(o.text), photoKey: keyOrNull(o.photoKey), photoAlt: s(o.photoAlt) };
};
const photoPart = (o: Record<string, unknown>) => ({ photoKey: keyOrNull(o.photoKey), photoAlt: s(o.photoAlt) });

export function coerceProductStory(raw: unknown): ProductStory | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const proofLine = arr(r.proofLine).flatMap((x): ProofItem[] => {
    const o = obj(x);
    if (o.kind === 'text' && s(o.text)) return [{ kind: 'text', text: s(o.text) }];
    if (o.kind === 'lab' && s(o.key)) return [{ kind: 'lab', key: s(o.key), label: s(o.label) || s(o.key), ...(s(o.suffix) ? { suffix: s(o.suffix) } : {}) }];
    return [];
  });
  const icons = arr(r.icons).flatMap((x) => {
    const o = obj(x);
    return (STORY_ICONS as readonly string[]).includes(o.icon as string) && s(o.label) ? [{ icon: o.icon as StoryIcon, label: s(o.label) }] : [];
  });
  const origin = obj(r.originStory);
  const cmp = obj(r.comparison);
  const grower = obj(r.grower);
  const use = obj(r.use);
  return {
    proofLine,
    icons,
    showCategorySwitcher: r.showCategorySwitcher === true,
    originStory: r.originStory ? { heading: s(origin.heading), bodyMd: s(origin.bodyMd), ...photoPart(origin) } : null,
    processSteps: arr(r.processSteps).map(step),
    comparison: r.comparison
      ? {
          heading: s(cmp.heading), oursLabel: s(cmp.oursLabel), theirsLabel: s(cmp.theirsLabel), note: s(cmp.note),
          imageKey: keyOrNull(cmp.imageKey), imageAlt: s(cmp.imageAlt),
          rows: arr(cmp.rows).map((x) => { const o = obj(x); return { aspect: s(o.aspect), ours: s(o.ours), theirs: s(o.theirs), source: s(o.source) }; }),
        }
      : null,
    grower: r.grower ? { names: s(grower.names), place: s(grower.place), since: s(grower.since), bodyMd: s(grower.bodyMd), ...photoPart(grower) } : null,
    use: r.use ? { kind: use.kind === 'cook' ? 'cook' : 'use', heading: s(use.heading), steps: arr(use.steps).map(s).filter(Boolean) } : null,
  };
}

export function coerceStoryPage(raw: unknown): StoryPage {
  const r = obj(raw);
  const seo = obj(r.seo);
  const hero = obj(r.hero);
  const ids = arr(r.productIds).map(int).filter((n): n is number => n !== null);
  const blurbs = obj(r.cardBlurbs);
  return {
    seo: { title: s(seo.title), description: s(seo.description) },
    hero: {
      eyebrow: s(hero.eyebrow), line1: s(hero.line1), line2: s(hero.line2), subtitle: s(hero.subtitle), ctaLabel: s(hero.ctaLabel),
      ...photoPart(hero),
      proof: arr(hero.proof).flatMap((x) => {
        const o = obj(x);
        const productId = int(o.productId);
        return productId && s(o.key) ? [{ productId, key: s(o.key), label: s(o.label) || s(o.key), ...(s(o.suffix) ? { suffix: s(o.suffix) } : {}) }] : [];
      }),
    },
    productIds: [...new Set(ids)],
    storyFromProductId: int(r.storyFromProductId),
    cardBlurbs: Object.fromEntries(Object.entries(blurbs).filter(([k, v]) => int(k) !== null && s(v)).map(([k, v]) => [String(int(k)), s(v)])),
    labColumns: arr(r.labColumns).map(s).filter(Boolean),
    facts: arr(r.facts).map((x) => { const o = obj(x); return { title: s(o.title), text: s(o.text) }; }).filter((f) => f.title || f.text),
    faq: arr(r.faq).map((x) => { const o = obj(x); return { q: s(o.q), a: s(o.a) }; }).filter((f) => f.q || f.a),
    note: s(r.note),
    closing: s(r.closing),
    hidden: arr(r.hidden).filter((h): h is HideableSection => (HIDEABLE_SECTIONS as readonly string[]).includes(h as string)),
  };
}

// ── structure ─────────────────────────────────────────────────────────────

/** Story images come from the photo library or the product's own images. */
const IMAGE_KEY = /^(photos|products)\/[A-Za-z0-9._\-/]+$/;
const DIGIT = /\d/;

function checkPhoto(e: FieldErrors, field: string, key: string | null, alt: string) {
  if (!key) return;
  if (!IMAGE_KEY.test(key) || key.includes('..') || key.includes('//')) e[`${field}.photoKey`] ??= 'Choose a photo from the photo library';
  else if (!alt) e[field] ??= 'Describe the photo (alt text) for accessibility and search';
}

export function validateProductStory(st: ProductStory): FieldErrors {
  const e: FieldErrors = {};
  if (st.proofLine.length > 4) e.proofLine = 'Keep the proof line to 4 items';
  if (st.icons.length > 3) e.icons = 'Keep to 3 icons';
  if (st.processSteps.length > 0 && st.processSteps.length < 3) e.processSteps = 'A timeline needs at least 3 steps (or none)';
  if (st.processSteps.length > 8) e.processSteps = 'Keep the timeline to 8 steps';
  st.processSteps.forEach((x, i) => {
    if (!x.title || !x.text) e[`processSteps.${i}`] = 'Each step needs a title and a line of text';
    checkPhoto(e, `processSteps.${i}`, x.photoKey, x.photoAlt);
  });
  if (st.originStory) {
    if (!st.originStory.heading || !st.originStory.bodyMd) e.originStory = 'Add a heading and the story, or remove the section';
    checkPhoto(e, 'originStory', st.originStory.photoKey, st.originStory.photoAlt);
  }
  if (st.comparison) {
    const c = st.comparison;
    if (!c.heading || !c.oursLabel || !c.theirsLabel) e.comparison = 'Add a heading and both column labels';
    if (c.rows.length < 2 || c.rows.length > 8) e['comparison.rows'] = 'Use 2 to 8 rows';
    c.rows.forEach((r, i) => {
      if (!r.aspect || !r.ours || !r.theirs) e[`comparison.rows.${i}`] = `Row ${i + 1}: fill in what is compared and both sides`;
      else if ((DIGIT.test(r.ours) || DIGIT.test(r.theirs)) && !r.source) e[`comparison.rows.${i}`] = `Row ${i + 1}: numbers need a source, e.g. 'IFCT 2017' or 'Lab report T-01'`;
    });
    if (c.imageKey && (!IMAGE_KEY.test(c.imageKey) || c.imageKey.includes('..'))) e['comparison.imageKey'] = 'Choose an image from this product or the photo library';
    else if (c.imageKey && !c.imageAlt) e['comparison.imageAlt'] = 'Describe the image (alt text)';
  }
  if (st.grower) {
    if (!st.grower.names || !st.grower.place) e.grower = 'Add the grower names and the place';
    checkPhoto(e, 'grower', st.grower.photoKey, st.grower.photoAlt);
  }
  if (st.use) {
    if (!st.use.heading || !st.use.steps.length) e.use = 'Add a heading and at least one step, or remove the section';
    if (st.use.steps.length > 8) e.use = 'Keep to 8 steps';
  }
  return e;
}

export function validateStoryPageStructure(slug: StoryPageSlug, p: StoryPage): FieldErrors {
  const e: FieldErrors = {};
  if (p.seo.title.length > 70) e['seo.title'] = 'Keep it under 70 characters';
  if (p.seo.description.length > 170) e['seo.description'] = 'Keep it under 170 characters';
  if (p.hero.proof.length > 2) e['hero.proof'] = 'Use at most 2 lab proof items in the hero';
  if (p.facts.length > 6) e.facts = 'Keep to 6 facts';
  if (p.faq.length > 12) e.faq = 'Keep to 12 questions';
  if (p.labColumns.length > 4) e.labColumns = 'Use at most 4 lab columns';
  if (p.productIds.length > 8) e.productIds = 'Link at most 8 products';
  if (p.storyFromProductId !== null && !p.productIds.includes(p.storyFromProductId)) e.storyFromProductId = "'Story from' must be one of the linked products";
  p.faq.forEach((f, i) => { if (!f.q || !f.a) e[`faq.${i}`] = 'Each question needs an answer'; });
  checkPhoto(e, 'hero', p.hero.photoKey, p.hero.photoAlt);
  return e;
}

// ── text walkers (for claims checks) ──────────────────────────────────────

export function storyTexts(st: ProductStory): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  st.proofLine.forEach((x, i) => out.push([`proofLine.${i}`, x.kind === 'text' ? x.text : `${x.label} ${x.suffix ?? ''}`]));
  st.icons.forEach((x, i) => out.push([`icons.${i}`, x.label]));
  if (st.originStory) out.push(['originStory.heading', st.originStory.heading], ['originStory.bodyMd', st.originStory.bodyMd], ['originStory.photoAlt', st.originStory.photoAlt]);
  st.processSteps.forEach((x, i) => out.push([`processSteps.${i}`, `${x.title} ${x.text} ${x.photoAlt}`]));
  if (st.comparison) {
    const c = st.comparison;
    out.push(['comparison.heading', c.heading], ['comparison.oursLabel', c.oursLabel], ['comparison.theirsLabel', c.theirsLabel], ['comparison.note', c.note], ['comparison.imageAlt', c.imageAlt]);
    c.rows.forEach((r, i) => out.push([`comparison.rows.${i}`, `${r.aspect} ${r.ours} ${r.theirs} ${r.source}`]));
  }
  if (st.grower) out.push(['grower', `${st.grower.names} ${st.grower.place} ${st.grower.since} ${st.grower.bodyMd} ${st.grower.photoAlt}`]);
  if (st.use) {
    out.push(['use.heading', st.use.heading]);
    st.use.steps.forEach((x, i) => out.push([`use.steps.${i}`, x]));
  }
  return out.filter(([, t]) => t.trim() !== '');
}

/** Page-owned copy that speaks for the whole page (checked in the page-wide context). */
export function pageWideTexts(p: StoryPage): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ['seo.title', p.seo.title], ['seo.description', p.seo.description],
    ['hero.eyebrow', p.hero.eyebrow], ['hero.line1', p.hero.line1], ['hero.line2', p.hero.line2], ['hero.subtitle', p.hero.subtitle],
    ['hero.ctaLabel', p.hero.ctaLabel], ['hero.photoAlt', p.hero.photoAlt], ['note', p.note], ['closing', p.closing],
  ];
  p.hero.proof.forEach((x, i) => out.push([`hero.proof.${i}`, `${x.label} ${x.suffix ?? ''}`]));
  p.facts.forEach((f, i) => out.push([`facts.${i}`, `${f.title} ${f.text}`]));
  p.faq.forEach((f, i) => out.push([`faq.${i}`, `${f.q} ${f.a}`]));
  return out.filter(([, t]) => t.trim() !== '');
}

// ── lab values ────────────────────────────────────────────────────────────

/** A lab summary value by key, case-insensitive; only string values count. */
export function labValue(summary: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!summary) return null;
  const k = key.trim().toLowerCase();
  for (const [name, v] of Object.entries(summary)) if (name.trim().toLowerCase() === k && typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

/**
 * The proof line as display strings. Lab items come only from the given
 * (active batch's) summary; a missing value hides the item — never a fallback
 * to an older report.
 */
export function resolveProof(items: ProofItem[], summary: Record<string, unknown> | null): string[] {
  return items.flatMap((x) => {
    if (x.kind === 'text') return [x.text];
    const v = labValue(summary, x.key);
    return v ? [`${x.label} ${v}${x.suffix ?? ''}`] : [];
  });
}
```

- [ ] **Step 5: Run the test and confirm that it passes**

Run: `npx vitest run tests/unit/story.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/story.ts src/lib/store/urls.ts tests/unit/story.test.ts
git commit -m "feat(store): story types, fixed page layouts, coercion and structural checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---
## Task 3: Claims word lists: GI, comparison terms, certification words

**Files:**
- Modify: `src/lib/store/claims.ts` (append after `validateProcessClaims`)
- Test: `tests/unit/claims.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/claims.test.ts`. Add `findCertificationWords, findComparisonProblems, findGiProblems, GI_MESSAGE` to the existing import from `../../src/lib/store/claims`:

```ts
describe('GI wording', () => {
  it('needs an authorised-user registration for GI words and registered GI names', () => {
    for (const t of ['GI-tagged rice', 'A geographical indication', 'Wada Kolam rice', 'wada-kolam', 'WADA  KOLAM', 'gi tagged']) {
      expect([t, findGiProblems(t, { giRegistered: false }).length > 0]).toEqual([t, true]);
      expect([t, findGiProblems(t, { giRegistered: true })]).toEqual([t, []]);
    }
  });

  it("matches 'GI' only as an uppercase whole word", () => {
    for (const t of ['Ginger and gin', 'gigantic grains', 'Kolam rice from Wada, Palghar']) expect(findGiProblems(t, { giRegistered: false })).toEqual([]);
    expect(GI_MESSAGE).toMatch(/authorised-user registration number/);
  });
});

describe('comparison wording', () => {
  it('rejects disparaging words in comparisons', () => {
    expect(findComparisonProblems('Fake, adulterated and toxic powder')).toEqual(['fake', 'adulterated', 'toxic']);
    expect(findComparisonProblems('Cheap blends; harmful, dangerous, poisonous')).toEqual(['harmful', 'dangerous', 'poison', 'cheap']);
    expect(findComparisonProblems('High-speed mill; friction heats the powder')).toEqual([]);
  });
});

describe('certification words', () => {
  const pgs = { scheme: 'pgs_organic' as const, certified: true };
  const none = { scheme: 'none' as const, certified: false };
  it('allows certification words only when every product in context holds that certification', () => {
    expect(findCertificationWords('PGS-India Organic certified organic turmeric', [pgs, pgs])).toEqual([]);
    expect(findCertificationWords('PGS-India Organic', [pgs, none])).toEqual(['certification wording: PGS']);
    expect(findCertificationWords('NPOP India Organic', [pgs])).toEqual(['certification wording: NPOP / India Organic']);
    expect(findCertificationWords('Jaivik Bharat logo', [])).toEqual(['certification wording: Jaivik Bharat']);
    expect(findCertificationWords('Tested by a NABL-accredited lab', [none])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `npx vitest run tests/unit/claims.test.ts`
Expected: FAIL, with `findGiProblems is not a function` or a similar import error.

- [ ] **Step 3: Implement**

Append to `src/lib/store/claims.ts`:

```ts
// ── Geographical Indication (spec: GI) ───────────────────────────────────

/** Registered GI names we must not use without authorised-user registration. */
export const REGISTERED_GI_NAMES = ['Wada Kolam'] as const;

export const GI_MESSAGE =
  "GI wording and the name 'Wada Kolam' need the authorised-user registration number (Products → Geographical Indication)";

const giNameRe = (name: string) => new RegExp(name.trim().split(/\s+/).join('[\\s-]*'), 'i');

/** GI words ("GI" as an uppercase word, "GI-tagged", "geographical indication") and registered GI names. */
export function findGiProblems(text: string, ctx: { giRegistered: boolean }): string[] {
  if (ctx.giRegistered) return [];
  const found: string[] = [];
  if (/\bGI\b/.test(text) || /\bgi[\s-]*tagged\b/i.test(text) || /geographical\s+indication/i.test(text)) found.push('GI wording');
  for (const name of REGISTERED_GI_NAMES) if (giNameRe(name).test(text)) found.push(`GI name: ${name}`);
  return found;
}

// ── comparisons (spec: Claims 7) ─────────────────────────────────────────

const COMPARISON_BANNED: Array<{ re: RegExp; label: string }> = [
  { re: /\bfake\b/i, label: 'fake' },
  { re: /\badulterat\w*/i, label: 'adulterated' },
  { re: /\btoxic\b/i, label: 'toxic' },
  { re: /\bharmful\b/i, label: 'harmful' },
  { re: /\bdangerous\b/i, label: 'dangerous' },
  { re: /\bpoison\w*/i, label: 'poison' },
  { re: /\bcheap\b/i, label: 'cheap' },
];

/** Words a comparison with another process may not use (describe the process, not a competitor). */
export function findComparisonProblems(text: string): string[] {
  return COMPARISON_BANNED.filter(({ re }) => re.test(text)).map(({ label }) => label);
}

// ── certification words (spec: Claims 5) ─────────────────────────────────

export interface CertContext { scheme: OrganicScheme; certified: boolean }

const CERT_WORDS: Array<{ re: RegExp; label: string; ok: (c: CertContext) => boolean }> = [
  { re: /\bPGS\b/i, label: 'PGS', ok: (c) => c.certified && (c.scheme === 'pgs_green' || c.scheme === 'pgs_organic') },
  // "PGS-India Organic" is the PGS scheme's own name, not NPOP's "India Organic".
  { re: /\bNPOP\b|(?<!PGS[\s-])\bindia\s+organic\b/i, label: 'NPOP / India Organic', ok: (c) => c.certified && c.scheme === 'npop' },
  { re: /\bjaivik\s+bharat\b/i, label: 'Jaivik Bharat', ok: (c) => c.certified && (c.scheme === 'pgs_organic' || c.scheme === 'npop') },
  { re: /\bcertified\s+organic\b/i, label: 'certified organic', ok: (c) => c.certified && (c.scheme === 'pgs_organic' || c.scheme === 'npop') },
];

/**
 * Certification words typed into copy are allowed only when every product in
 * the text's context holds that certification (badges themselves always come
 * from organicCopy()).
 */
export function findCertificationWords(text: string, certs: CertContext[]): string[] {
  return CERT_WORDS.filter((w) => w.re.test(text) && !(certs.length > 0 && certs.every(w.ok))).map((w) => `certification wording: ${w.label}`);
}
```

- [ ] **Step 4: Run the test and confirm that it passes**

Run: `npx vitest run tests/unit/claims.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/claims.ts tests/unit/claims.test.ts
git commit -m "feat(store): claims rules for GI wording, comparison terms and typed certification words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---

## Task 4: Story claims contexts and checks

**Files:**
- Create: `src/lib/store/story-claims.ts`
- Test: `tests/unit/story-claims.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/story-claims.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_STORY, emptyStoryPage, type ProductStory } from '../../src/lib/store/story';
import { checkProductStory, checkStoryPage, fieldLabel, intersectContexts, productContext, STRICTEST, type ContextProduct } from '../../src/lib/store/story-claims';

const traditional = { code: 'traditional', text: 'Boiled and sun-cured the traditional way', evidence_note: 'Village records, 40 years' };
const cp = (over: Partial<ContextProduct> = {}): ContextProduct => ({
  id: 1, name: 'Turmeric powder', organic: { scheme: 'pgs_organic', conversionSince: null, certNumber: 'PGS-123' }, claims: [traditional], perishable: false,
  gi: { name: null, auRegNumber: null }, story: null, ...over,
});
const story = (over: Partial<ProductStory> = {}): ProductStory => ({ ...EMPTY_STORY, ...over });
const steps = (text: string) => [1, 2, 3].map((n) => ({ title: `Step ${n}`, text, photoKey: null, photoAlt: '' }));

describe('contexts', () => {
  it('a page context allows a word only when every linked product supports it', () => {
    const rice = cp({ id: 2, organic: { scheme: 'none', conversionSince: null, certNumber: null }, claims: [] });
    expect(intersectContexts([cp(), cp({ id: 3 })]).mayUseOrganic).toBe(true);
    expect(intersectContexts([cp(), rice]).mayUseOrganic).toBe(false);
    expect(intersectContexts([cp(), rice]).claims).toEqual([]);
    expect(intersectContexts([])).toEqual(STRICTEST);
    expect(productContext(cp({ gi: { name: 'Wada Kolam', auRegNumber: 'AU-9' } })).giRegistered).toBe(true);
  });
});

describe('checkProductStory', () => {
  it('allows evidenced and certified wording, and blocks the rest with a next step', () => {
    expect(checkProductStory(story({ processSteps: steps('Certified organic, boiled the traditional way') }), cp())).toEqual({});
    const rice = cp({ organic: { scheme: 'none', conversionSince: null, certNumber: null }, claims: [] });
    const e = checkProductStory(story({ processSteps: steps('Organic, boiled the traditional way') }), rice);
    expect(e['processSteps.0']).toMatch(/organic/);
    expect(e['processSteps.0']).toMatch(/traditional/);
  });

  it('rejects health claims, disparaging comparisons and GI wording', () => {
    const cmp = { heading: 'Stone vs mill', oursLabel: 'Ours', theirsLabel: 'High-speed mill', note: '', imageKey: null, imageAlt: '', rows: [
      { aspect: 'Powder', ours: 'Keeps its oils', theirs: 'Fake, toxic colour', source: '' },
      { aspect: 'Use', ours: 'Boosts immunity', theirs: 'Flat', source: '' },
    ] };
    const e = checkProductStory(story({ comparison: cmp, originStory: { heading: 'Wada Kolam', bodyMd: 'GI-tagged', photoKey: null, photoAlt: '' } }), cp());
    expect(e['comparison.rows.0']).toMatch(/describe the other process, not a competitor/i);
    expect(e['comparison.rows.1']).toMatch(/immunity/);
    expect(e['originStory.heading']).toMatch(/authorised-user registration number/);
  });
});

describe('checkStoryPage', () => {
  const kolam = cp({ id: 10, name: 'Kolam rice from Wada', organic: { scheme: 'none', conversionSince: null, certNumber: null }, claims: [traditional], story: story({ processSteps: steps('Transplanted by hand, the traditional way') }) });
  const karjat = cp({ id: 11, name: 'Karjat 3', organic: { scheme: 'none', conversionSince: null, certNumber: null }, claims: [] });

  it("lets 'traditional' appear in the Story-from product's sections but not in the page-wide hero", () => {
    const page = { ...emptyStoryPage(), productIds: [10, 11], storyFromProductId: 10 };
    expect(checkStoryPage('rice', page, [kolam, karjat], { completeness: false })).toEqual({});
    page.hero = { ...page.hero, line1: 'Traditional rice' };
    expect(checkStoryPage('rice', page, [kolam, karjat], { completeness: false })['hero.line1']).toMatch(/traditional/);
  });

  it('checks a card blurb against its own product', () => {
    const page = { ...emptyStoryPage(), productIds: [10, 11], storyFromProductId: 10, cardBlurbs: { '10': 'Grown the traditional way', '11': 'Grown the traditional way' } };
    const e = checkStoryPage('rice', page, [kolam, karjat], { completeness: false });
    expect(e['cardBlurbs.10']).toBeUndefined();
    expect(e['cardBlurbs.11']).toMatch(/traditional/);
  });

  it('/turmeric may say organic when every linked product is certified; /spices never', () => {
    const turmeric = { ...emptyStoryPage(), productIds: [1, 2], storyFromProductId: 1, hero: { ...emptyStoryPage().hero, line2: 'Certified organic, stone-ground' } };
    expect(checkStoryPage('turmeric', turmeric, [cp(), cp({ id: 2 })], { completeness: false })).toEqual({});
    const hub = { ...turmeric, slug: 'spices' };
    expect(checkStoryPage('spices', hub, [cp(), cp({ id: 2 })], { completeness: false })['hero.line2']).toMatch(/organic/);
  });

  it('on publish, needs a title, a headline and (rice, turmeric) linked products with a Story-from', () => {
    const e = checkStoryPage('turmeric', emptyStoryPage(), [], { completeness: true });
    expect(Object.keys(e)).toEqual(expect.arrayContaining(['seo.title', 'seo.description', 'hero.line1', 'productIds']));
    expect(checkStoryPage('spices', { ...emptyStoryPage(), seo: { title: 'Spices', description: 'Stone-ground spices.' }, hero: { ...emptyStoryPage().hero, line1: 'Spices' } }, [], { completeness: true })).toEqual({});
  });

  it('labels fields for people', () => {
    expect(fieldLabel('hero.line2')).toBe('Hero line 2');
    expect(fieldLabel('faq.0')).toBe('Question 1');
    expect(fieldLabel('storyFrom.processSteps.3')).toBe('Story from product → Step 4');
  });
});
```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `npx vitest run tests/unit/story-claims.test.ts`
Expected: FAIL, with `Failed to resolve import "../../src/lib/store/story-claims"`

- [ ] **Step 3: Implement `story-claims.ts`**

Create `src/lib/store/story-claims.ts`:

```ts
/**
 * Claims checks for product stories and landing pages (spec: Claims
 * Compliance). Word lists live in claims.ts; this module decides the context
 * a text is checked in:
 * - product story and a card blurb: that product's own context;
 * - page-wide copy (SEO, hero, facts, FAQ, note, closing): the intersection over
 *   the linked products (a word is allowed only if every product supports it);
 * - /spices and pages without products: the strictest context.
 */
import {
  findBannedPhrases, findCertificationWords, findComparisonProblems, findGiProblems, GI_MESSAGE, organicCopy, RAW_PRODUCE_TERMS,
  type CertContext, type OrganicScheme, type ProcessClaim,
} from './claims';
import { pageWideTexts, storyTexts, type ProductStory, type StoryPage } from './story';
import type { StoryPageSlug } from './urls';

type FieldErrors = Record<string, string>;

/** What the checks need to know about a product. */
export interface ContextProduct {
  id: number;
  name: string;
  organic: { scheme: OrganicScheme; conversionSince: number | null; certNumber: string | null };
  claims: ProcessClaim[];
  perishable: boolean;
  gi: { name: string | null; auRegNumber: string | null };
  story: ProductStory | null;
}

export interface ClaimContext {
  organicScheme: OrganicScheme;
  claims: ProcessClaim[];
  mayUseOrganic: boolean;
  allowedTerms: readonly string[];
  giRegistered: boolean;
  certs: CertContext[];
}

export const STRICTEST: ClaimContext = { organicScheme: 'none', claims: [], mayUseOrganic: false, allowedTerms: [], giRegistered: false, certs: [] };

const evidenced = (c: ProcessClaim) => c.text.trim() !== '' && c.evidence_note.trim() !== '';

export function productContext(p: ContextProduct): ClaimContext {
  const oc = organicCopy({ organicScheme: p.organic.scheme, conversionSince: p.organic.conversionSince, certNumber: p.organic.certNumber });
  return {
    organicScheme: p.organic.scheme,
    claims: p.claims.filter(evidenced),
    mayUseOrganic: oc.mayUseOrganic,
    allowedTerms: p.perishable ? RAW_PRODUCE_TERMS : [],
    giRegistered: Boolean(p.gi.name?.trim() && p.gi.auRegNumber?.trim()),
    certs: [{ scheme: p.organic.scheme, certified: oc.badge !== null }],
  };
}

/** A word is allowed page-wide only if every linked product allows it. */
export function intersectContexts(products: ContextProduct[]): ClaimContext {
  if (!products.length) return STRICTEST;
  const cs = products.map(productContext);
  const codes = (c: ClaimContext) => new Set(c.claims.map((x) => x.code));
  const shared = cs.slice(1).reduce((acc, c) => new Set([...acc].filter((code) => codes(c).has(code))), codes(cs[0]));
  return {
    organicScheme: cs.every((c) => c.organicScheme === cs[0].organicScheme) ? cs[0].organicScheme : 'none',
    claims: cs[0].claims.filter((c) => shared.has(c.code)),
    mayUseOrganic: cs.every((c) => c.mayUseOrganic),
    allowedTerms: cs[0].allowedTerms.filter((t) => cs.every((c) => c.allowedTerms.includes(t))),
    giRegistered: cs.every((c) => c.giRegistered),
    certs: cs.flatMap((c) => c.certs),
  };
}

/** Every problem in one text for a context. */
export function textProblems(text: string, ctx: ClaimContext, opts: { comparison?: boolean } = {}): string[] {
  return [
    ...findBannedPhrases(text, ctx),
    ...findGiProblems(text, ctx),
    ...findCertificationWords(text, ctx.certs),
    ...(opts.comparison ? findComparisonProblems(text).map((w) => `comparison: ${w}`) : []),
  ];
}

/** A next-step message for the admin, never internal codes. */
export function problemMessage(problems: string[]): string {
  const parts: string[] = [];
  if (problems.some((p) => p.startsWith('GI '))) parts.push(GI_MESSAGE);
  const cmp = problems.filter((p) => p.startsWith('comparison: ')).map((p) => p.slice(12));
  if (cmp.length) parts.push(`Describe the other process, not a competitor ('${cmp.join("', '")}' isn't allowed)`);
  const rest = problems.filter((p) => !p.startsWith('GI ') && !p.startsWith('comparison: '));
  if (rest.length) parts.push(`Remove or substantiate: ${rest.join(', ')} (see the claims guidance)`);
  return parts.join('. ');
}

export function checkProductStory(story: ProductStory, p: ContextProduct): FieldErrors {
  const ctx = productContext(p);
  const e: FieldErrors = {};
  for (const [field, text] of storyTexts(story)) {
    const problems = textProblems(text, ctx, { comparison: field.startsWith('comparison.') });
    if (problems.length) e[field] = problemMessage(problems);
  }
  return e;
}

/**
 * Full check of a landing page. `completeness` adds the publish-only
 * requirements (title, headline, linked products).
 */
export function checkStoryPage(slug: StoryPageSlug, page: StoryPage, products: ContextProduct[], opts: { completeness: boolean }): FieldErrors {
  const e: FieldErrors = {};
  const linked = page.productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is ContextProduct => Boolean(p));
  const pageCtx = slug === 'spices' ? STRICTEST : intersectContexts(linked);
  for (const [field, text] of pageWideTexts(page)) {
    const problems = textProblems(text, pageCtx);
    if (problems.length) e[field] = problemMessage(problems);
  }
  for (const [id, text] of Object.entries(page.cardBlurbs)) {
    const p = linked.find((x) => String(x.id) === id);
    const problems = textProblems(text, p ? productContext(p) : STRICTEST);
    if (problems.length) e[`cardBlurbs.${id}`] = problemMessage(problems);
  }
  const from = linked.find((p) => p.id === page.storyFromProductId);
  if (from?.story && slug !== 'spices') for (const [k, m] of Object.entries(checkProductStory(from.story, from))) e[`storyFrom.${k}`] = m;

  if (opts.completeness) {
    if (!page.seo.title) e['seo.title'] ??= 'Add a search title';
    if (!page.seo.description) e['seo.description'] ??= 'Add a search description';
    if (!page.hero.line1) e['hero.line1'] ??= 'Add the headline';
    if (slug !== 'spices' && linked.length === 0) e.productIds = 'Link at least one product (Products section)';
    if (slug !== 'spices' && linked.length > 0 && !from) e.storyFromProductId = "Choose the 'Story from' product";
  }
  return e;
}

const NAMED: Record<string, string> = {
  'seo.title': 'Search title', 'seo.description': 'Search description', 'hero.eyebrow': 'Hero eyebrow', 'hero.line1': 'Hero line 1',
  'hero.line2': 'Hero line 2', 'hero.subtitle': 'Hero subtitle', 'hero.ctaLabel': 'Hero button', 'hero.photoAlt': 'Hero photo description',
  note: 'Note', closing: 'Closing line', productIds: 'Products', storyFromProductId: 'Story from',
  'originStory.heading': 'Origin heading', 'originStory.bodyMd': 'Origin story', 'comparison.heading': 'Comparison heading',
  'comparison.note': 'Comparison note', grower: 'Grower', 'use.heading': 'How to cook/use heading',
};
const INDEXED: Record<string, string> = {
  facts: 'Fact', faq: 'Question', processSteps: 'Step', proofLine: 'Proof item', icons: 'Icon', 'comparison.rows': 'Comparison row',
  'use.steps': 'How to cook/use step', 'hero.proof': 'Hero proof item',
};

/** "hero.line2" → "Hero line 2", "faq.0" → "Question 1", "storyFrom.processSteps.3" → "Story from product → Step 4". */
export function fieldLabel(key: string): string {
  if (key.startsWith('storyFrom.')) return `Story from product → ${fieldLabel(key.slice(10))}`;
  if (key.startsWith('cardBlurbs.')) return 'Card blurb';
  if (NAMED[key]) return NAMED[key];
  const m = key.match(/^(.*)\.(\d+)$/);
  if (m && INDEXED[m[1]]) return `${INDEXED[m[1]]} ${Number(m[2]) + 1}`;
  return key;
}
```

- [ ] **Step 4: Run the test and confirm that it passes**

Run: `npx vitest run tests/unit/story-claims.test.ts tests/unit/claims.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/story-claims.ts tests/unit/story-claims.test.ts
git commit -m "feat(store): story claims contexts — product, page-wide intersection, strictest — and page checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---
## Task 5: Catalog read layer — story, GI, image kind, lookups

**Files:**
- Modify: `src/lib/store/catalog.ts`
- Modify: `tests/helpers/product-fixture.ts`
- Test: `tests/integration/catalog.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/integration/catalog.test.ts` (add `activeLabSummaries, getProductsByIds` to the catalog import):

```ts
describe('story fields', () => {
  it('maps story, GI and image kind; ignores a story that is not an object', async () => {
    const id = await insertProduct({
      category_id: 2, slug: 'turmeric-story', gi_name: null, gi_au_reg_number: null,
      story: JSON.stringify({ icons: [{ icon: 'sun', label: 'Sun-cured' }], processSteps: [] }),
    });
    await insertVariant(id);
    await db.prepare("INSERT INTO product_images (product_id, r2_key, alt, sort, kind) VALUES (?, 'products/t/info.webp', 'Comparison: stone mill vs high-speed mill', 0, 'infographic')").bind(id).run();
    const res = await getProductPage(db, 'spices', 'turmeric-story', TODAY);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.product.story?.icons).toEqual([{ icon: 'sun', label: 'Sun-cured' }]);
    expect(res.product.gi).toEqual({ name: null, auRegNumber: null });
    expect(res.images[0].kind).toBe('infographic');
    expect(res.siblings.every((c) => c.categorySlug === 'spices' && c.id !== id)).toBe(true);
    const [p] = await getProductsByIds(db, [id]);
    expect(p.story?.icons[0].label).toBe('Sun-cured');
  });

  it("reads lab values only from the active batch's visible report", async () => {
    const id = await insertProduct({ category_id: 2, slug: 'turmeric-lab' });
    const old = await db.prepare("INSERT INTO lab_reports (product_id, batch_code, tested_on, lab_name, test_scope, summary, visible) VALUES (?, 'T-00', '2026-01-01', 'Lab', 'x', '{\"Curcumin\":\"3.0 %\"}', 1)").bind(id).run();
    const cur = await db.prepare("INSERT INTO lab_reports (product_id, batch_code, tested_on, lab_name, test_scope, summary, visible) VALUES (?, 'T-01', '2026-09-01', 'Lab', 'x', '{\"Curcumin\":\"5.1 %\"}', 0)").bind(id).run();
    await db.prepare("INSERT INTO batches (product_id, batch_code, packed_on, lab_report_id, active) VALUES (?, 'T-01', '2026-09-02', ?, 1)").bind(id, cur.meta.last_row_id).run();
    expect((await activeLabSummaries(db, [id])).get(id)).toBeUndefined(); // the active batch's report is hidden; no fallback to T-00
    await db.prepare('UPDATE lab_reports SET visible = 1 WHERE id = ?').bind(cur.meta.last_row_id).run();
    expect((await activeLabSummaries(db, [id])).get(id)).toEqual({ Curcumin: '5.1 %' });
    expect(old.meta.last_row_id).toBeTypeOf('number');
  });
});
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npx vitest run tests/integration/catalog.test.ts`
Expected: FAIL — `activeLabSummaries` / `getProductsByIds` not exported, `story` undefined.

- [ ] **Step 3: Implement in `catalog.ts`**

1. Imports at the top: `import { coerceProductStory, type ProductStory } from './story';`
2. In `ProductRow` (after `published_at: string | null;`), add:
   ```ts
     story: string | null;
     gi_name: string | null;
     gi_au_reg_number: string | null;
   ```
3. Change `export interface Image { key: string; url: string; alt: string }` to:
   ```ts
   export interface Image { key: string; url: string; alt: string; kind: 'photo' | 'infographic' }
   ```
4. In `Product` (after `updatedAt: string;`), add:
   ```ts
     /** Story sections (null: classic bento only). */
     story: ProductStory | null;
     /** Geographical Indication: the badge needs both values. */
     gi: { name: string | null; auRegNumber: string | null };
   ```
5. In `mapProduct`'s returned object (after `updatedAt: r.updated_at,`), add:
   ```ts
       story: coerceProductStory(json<unknown>(r.story, null)),
       gi: { name: r.gi_name?.trim() || null, auRegNumber: r.gi_au_reg_number?.trim() || null },
   ```
6. In `imagesFor`, select and map `kind`:
   ```ts
         .prepare(`SELECT product_id, r2_key, alt, kind FROM product_images WHERE product_id IN (${part.map(() => '?').join(',')}) ORDER BY sort, id`)
         .bind(...part)
         .all<{ product_id: number; r2_key: string; alt: string; kind: 'photo' | 'infographic' }>();
       for (const i of results)
         out.set(i.product_id, [...(out.get(i.product_id) ?? []), { key: i.r2_key, url: mediaUrl(i.r2_key), alt: i.alt, kind: i.kind }]);
   ```
7. Add `siblings` to the `ok` variant of `ProductPageResult` (after `related: ProductCard[];`):
   ```ts
         /** Other active products in the same category (rice variety switcher). */
         siblings: ProductCard[];
   ```
   and in `getProductPage`'s return add `siblings: others.filter((c) => c.categorySlug === product.category.slug),`.
8. Append the lookups at the end of the file:
   ```ts
   /** Active products by id (story pages: Story-from product, growers), in the given order. */
   export async function getProductsByIds(db: D1Database, ids: number[]): Promise<Product[]> {
     const rows: ProductRow[] = [];
     for (const part of chunks(ids))
       if (part.length)
         rows.push(...(await db.prepare(`${PRODUCT_SELECT} WHERE p.status = 'active' AND p.id IN (${part.map(() => '?').join(',')})`).bind(...part).all<ProductRow>()).results);
     const byId = new Map(rows.map((r) => [r.id, mapProduct(r)]));
     return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
   }

   /** Lab summaries of each product's active batch, only when that batch links a visible report (no fallback to older reports). */
   export async function activeLabSummaries(db: D1Database, ids: number[]): Promise<Map<number, Record<string, unknown>>> {
     const out = new Map<number, Record<string, unknown>>();
     for (const part of chunks(ids)) {
       if (!part.length) continue;
       const { results } = await db
         .prepare(
           `SELECT b.product_id, l.summary FROM batches b JOIN lab_reports l ON l.id = b.lab_report_id
            WHERE b.active = 1 AND l.visible = 1 AND b.product_id IN (${part.map(() => '?').join(',')})`,
         )
         .bind(...part)
         .all<{ product_id: number; summary: string }>();
       for (const r of results) out.set(r.product_id, json<Record<string, unknown>>(r.summary, {}));
     }
     return out;
   }
   ```

- [ ] **Step 4: Update the product fixture**

In `tests/helpers/product-fixture.ts`, inside `product()`, add before `...over,`:

```ts
    story: null,
    gi: { name: null, auRegNumber: null },
```

Then change the `images` export to include `kind`:

```ts
export const images: Image[] = [
  { key: 'products/7/a.jpg', url: '/media/products/7/a.jpg', alt: 'Karjat 3 rice grains', kind: 'photo' },
  { key: 'products/7/b.jpg', url: '/media/products/7/b.jpg', alt: 'Paddy field', kind: 'photo' },
];
```

- [ ] **Step 5: Run the tests and type check**

Run: `npx vitest run tests/integration/catalog.test.ts tests/unit/feed.test.ts tests/unit/seo.test.ts`
Expected: PASS

Run: `npx astro check`
Expected: `0 errors`. If any file builds `Image` objects by hand, add `kind: 'photo'` there; `grep -rn "alt: " src --include=*.ts | grep "url:"` lists the candidates.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/catalog.ts tests/helpers/product-fixture.ts tests/integration/catalog.test.ts
git commit -m "feat(store): catalog reads product story, GI, image kind; active-batch lab lookup; category siblings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---

## Task 6: Catalog admin — GI fields and rule, image kind, shared purge module

**Files:**
- Create: `src/lib/store/purge.ts` (move `purgeStmts` out of `catalog-admin.ts` so `story-pages.ts` can use it without a circular import)
- Modify: `src/lib/store/catalog-admin.ts`, `src/lib/store/editor-media.ts`, `src/pages/api/admin/products/[id]/images.ts`
- Test: `tests/integration/catalog-admin.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/integration/catalog-admin.test.ts` (add `updateImage` to the import list):

```ts
describe('Geographical Indication', () => {
  it('blocks GI wording and the registered name without an authorised-user number', async () => {
    const res = await saveProduct(db, null, input({ name: 'Wada Kolam Rice', slug: 'wada-kolam' }), [v()], NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.name).toMatch(/authorised-user registration number/);
    expect(res.errors.slug).toMatch(/authorised-user registration number/);
    const gi = await saveProduct(db, null, input({ name: 'Rice', giName: 'Wada Kolam', giAuRegNumber: null }), [v()], NOW);
    expect(!gi.ok && gi.errors.giAuRegNumber).toMatch(/registration number, or clear the GI name/);
  });

  it('allows the name and stores GI fields once registered', async () => {
    const res = await saveProduct(db, null, input({ name: 'Wada Kolam Rice', slug: 'wada-kolam-registered', giName: 'Wada Kolam', giAuRegNumber: 'AU-77' }), [v()], NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await scalar(`SELECT gi_au_reg_number FROM products WHERE id = ${res.id}`)).toBe('AU-77');
  });

  it('rejects GI wording in image alt text', async () => {
    const res = await saveProduct(db, null, input({ slug: 'kolam-alt' }), [v()], NOW);
    if (!res.ok) throw new Error('setup');
    const up = await addImage(db, r2, res.id, png(), 'GI-tagged rice in a bowl', NOW);
    expect(!up.ok && up.error).toMatch(/authorised-user registration number/);
  });
});

describe('image kind', () => {
  it('marks an image as an infographic', async () => {
    const res = await saveProduct(db, null, input({ slug: 'turmeric-kind', categorySlug: 'spices' }), [v()], NOW);
    if (!res.ok) throw new Error('setup');
    const up = await addImage(db, r2, res.id, png(), 'Turmeric powder in a brass bowl', NOW);
    if (!up.ok) throw new Error('setup');
    const imageId = Number(await scalar(`SELECT id FROM product_images WHERE product_id = ${res.id}`));
    expect(await updateImage(db, res.id, imageId, { kind: 'infographic' }, NOW)).toEqual({ ok: true });
    expect(await scalar(`SELECT kind FROM product_images WHERE id = ${imageId}`)).toBe('infographic');
  });
});
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npx vitest run tests/integration/catalog-admin.test.ts`
Expected: FAIL. The GI fields aren't part of `ProductInput`, so the TS check flags them and the name passes validation. `updateImage` ignores `kind`.

- [ ] **Step 3: Create `purge.ts`**

Create `src/lib/store/purge.ts`, moving the body of `purgeStmts` from `catalog-admin.ts` (lines 292–305):

```ts
/** Cache-purge outbox statements shared by catalog and story-page writes. */
import { purgeUrls } from './edge-cache';
import { enqueueStmt } from './outbox';

/**
 * Purge rows for a change: the given paths plus any extra product pages, now
 * and again 30 s later — the second purge clears pages that were mid-render
 * during the write.
 */
export function purgeStmts(db: D1Database, paths: string[], at: string, allProductPaths: string[] = []): D1PreparedStatement[] {
  const urls = purgeUrls([...paths, ...allProductPaths]);
  const later = new Date(Date.parse(at) + 30_000).toISOString();
  return [
    enqueueStmt(db, { kind: 'cache.purge', payload: { urls }, at }),
    enqueueStmt(db, { kind: 'cache.purge', payload: { urls }, at, notBefore: later }),
  ];
}
```

In `catalog-admin.ts`, delete the local `purgeStmts` function and its doc comment. Replace the `edge-cache` and `outbox` imports with:

```ts
import { productPurgePaths } from './edge-cache';
import { purgeStmts } from './purge';
```

Remove `enqueueStmt` from the imports if nothing else in the file uses it. Check with `grep -n enqueueStmt src/lib/store/catalog-admin.ts`.

- [ ] **Step 4: Add GI to `ProductInput`, validation, columns and coercion**

In `catalog-admin.ts`:

1. Add `findGiProblems, GI_MESSAGE` to the `./claims` import.
2. In `ProductInput`, after `organicCertNumber: string | null;`, add:
   ```ts
     /** Registered GI name (e.g. "Wada Kolam"); needs giAuRegNumber. */
     giName: string | null;
     giAuRegNumber: string | null;
   ```
3. In `validateProduct`, after the `mayUseOrganic` line, add:
   ```ts
     if (trimOrNull(p.giName) && !trimOrNull(p.giAuRegNumber)) fail('giAuRegNumber', 'Add the authorised-user registration number, or clear the GI name');
     const giRegistered = Boolean(trimOrNull(p.giName) && trimOrNull(p.giAuRegNumber));
     // A published slug is frozen; a product being discontinued may keep it (its replacement gets a clean slug).
     const slugFrozenForDiscontinue = ctx.published && p.slug === ctx.currentSlug && p.status === 'discontinued';
     if (!slugFrozenForDiscontinue && findGiProblems(p.slug.replace(/-/g, ' '), { giRegistered }).length) fail('slug', GI_MESSAGE);
     p.processClaims.forEach((c, i) => { if (findGiProblems(c.text, { giRegistered }).length) fail('processClaims', `Claim ${i + 1}: ${GI_MESSAGE}`); });
   ```
   and inside the existing `for (const [field, text] of visibleTexts(p, variants))` loop, before its `banned` line:
   ```ts
       if (findGiProblems(text, { giRegistered }).length) fail(field, GI_MESSAGE);
   ```
4. In `productColumns`, after `organic_cert_number: …`, add:
   ```ts
       gi_name: trimOrNull(p.giName),
       gi_au_reg_number: trimOrNull(p.giAuRegNumber),
   ```
5. In `coerceProductInput`, after `organicCertNumber: strOrNull(r.organicCertNumber),`, add:
   ```ts
       giName: strOrNull(r.giName),
       giAuRegNumber: strOrNull(r.giAuRegNumber),
   ```
6. In the private `textProblems` (image alt and lab text), select the GI columns and check them:
   ```ts
     const row = await db
       .prepare('SELECT organic_scheme, organic_conversion_since, organic_cert_number, process_claims, perishable, gi_name, gi_au_reg_number FROM products WHERE id = ?')
       .bind(productId)
       .first<{ organic_scheme: OrganicScheme; organic_conversion_since: number | null; organic_cert_number: string | null; process_claims: string; perishable: number; gi_name: string | null; gi_au_reg_number: string | null }>();
   ```
   and before `return banned.length ? …`:
   ```ts
     if (findGiProblems(text, { giRegistered: Boolean(row.gi_name && row.gi_au_reg_number) }).length) return GI_MESSAGE;
   ```
   `addImage` and `updateImage` prefix this result with "Alt text: remove or substantiate". Change both call sites so that a GI message is shown as is:
   ```ts
     if (altProblems) return { ok: false as const, error: altProblems === GI_MESSAGE ? `Alt text: ${GI_MESSAGE}` : `Alt text: remove or substantiate ${altProblems}` };
   ```

- [ ] **Step 5: Image `kind` in `updateImage`, admin reads, editor media and API**

In `catalog-admin.ts`, change `updateImage`'s patch type and SQL:

```ts
export async function updateImage(db: D1Database, productId: number, imageId: number, patch: { alt?: string; sort?: number; kind?: 'photo' | 'infographic' }, now = new Date()) {
  // …existing checks unchanged…
  const kind = patch.kind === 'photo' || patch.kind === 'infographic' ? patch.kind : null;
  const at = nowIso(now);
  await db.batch([
    db
      .prepare('UPDATE product_images SET alt = COALESCE(?, alt), sort = COALESCE(?, sort), kind = COALESCE(?, kind) WHERE id = ? AND product_id = ?')
      .bind(patch.alt?.trim() ?? null, Number.isInteger(patch.sort) ? patch.sort : null, kind, imageId, productId),
    db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').bind(at, productId),
    purgeStmt(db, paths, at),
  ]);
  return { ok: true as const };
}
```

In `getProductForAdmin`, select `kind` with the images:

```ts
    db.prepare('SELECT id, r2_key, alt, sort, kind FROM product_images WHERE product_id = ? ORDER BY sort, id').bind(id).all<{ id: number; r2_key: string; alt: string; sort: number; kind: 'photo' | 'infographic' }>(),
```

and add `story: row.story, giName: row.gi_name, giAuRegNumber: row.gi_au_reg_number,` to its returned object. `product` already carries `story`/`gi` through `mapProduct`; these raw values are for the editor.

In `src/lib/store/editor-media.ts`:
- Change the images row type to `{ id: number; r2_key: string; alt: string; sort: number; kind?: 'photo' | 'infographic' }`.
- Change the mapping to `images: a.images.map((i) => ({ id: i.id, url: mediaUrl(i.r2_key), key: i.r2_key, alt: i.alt, sort: i.sort, kind: i.kind ?? 'photo' })),`.

In `src/pages/api/admin/products/[id]/images.ts` `PATCH`, accept `kind`:

```ts
  const body = (await readJson(request)) as { imageId?: number; alt?: string; sort?: number; kind?: 'photo' | 'infographic' } | undefined;
  // …
  const res = await updateImage(env.STORE_DB, id, body.imageId as number, { alt: body.alt, sort: body.sort, kind: body.kind });
```

In `src/components/admin/ProductEditor.tsx`, extend `EditorImage` to `{ id: number; url: string; key: string; alt: string; sort: number; kind: 'photo' | 'infographic' }`. Task 15 uses `key` and `kind`.

Finally, add GI to the editor's types so the build still type-checks:
- In `EditorProduct`, after `organicCertNumber: string | null;`, add `giName: string | null; giAuRegNumber: string | null;`.
- In `src/pages/admin/products/[id].astro`:
  - add `giName: null, giAuRegNumber: null,` to `blank`
  - add `giName: p.gi.name, giAuRegNumber: p.gi.auRegNumber,` to `initial`

- [ ] **Step 6: Run the tests and type check**

Run: `npx vitest run tests/integration/catalog-admin.test.ts tests/integration/catalog.test.ts`
Expected: PASS

The existing `input()` helper doesn't set the GI fields. Add `giName: null, giAuRegNumber: null,` to its object literal (after `organicCertNumber: null,`), or TypeScript reports missing properties.

Run: `npx astro check`
Expected: `0 errors`

- [ ] **Step 7: Commit**

```bash
git add src/lib/store/purge.ts src/lib/store/catalog-admin.ts src/lib/store/editor-media.ts src/pages/api/admin/products/[id]/images.ts src/components/admin/ProductEditor.tsx src/pages/admin/products/[id].astro tests/integration/catalog-admin.test.ts
git commit -m "feat(store): GI fields and rule on products and alt text; image kind; shared purge statements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---

## Task 7: Edge cache, storefront purge and story photos on `/media`

**Files:**
- Modify: `src/lib/store/edge-cache.ts:24,97-105`, `src/lib/store/catalog-admin.ts` (`purgeStorefrontStmts`), `src/pages/media/[...key].ts:12`
- Test: `tests/unit/edge-cache.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/edge-cache.test.ts`:

```ts
describe('story pages', () => {
  it('caches /turmeric and purges it with every spices product', () => {
    expect(isEdgeCacheable('/turmeric')).toBe(true);
    expect(isEdgeCacheable('/turmeric/')).toBe(true);
    expect(isEdgeCacheable('/turmeric/extra')).toBe(false);
    expect(productPurgePaths('spices', 'turmeric-powder')).toContain('/turmeric');
    expect(productPurgePaths('rice', 'karjat-3')).not.toContain('/turmeric');
    expect(productPurgePaths('rice', 'karjat-3')).toContain('/rice');
  });
});
```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `npx vitest run tests/unit/edge-cache.test.ts`
Expected: FAIL. `isEdgeCacheable('/turmeric')` returns `false`.

- [ ] **Step 3: Implement**

In `edge-cache.ts`, line 24:

```ts
const CACHED_EXACT = new Set(['/shop', '/our-process', '/sitemap-store.xml', '/feeds/google.xml', '/recipes', '/turmeric']);
```

and `productPurgePaths`:

```ts
export function productPurgePaths(categorySlug: string, productSlug: string | null): string[] {
  return [
    ...(productSlug ? [`/${categorySlug}/${productSlug}`] : []),
    `/${categorySlug}`,
    // The /turmeric landing page shows spices products' cards, lab values and badges.
    ...(categorySlug === 'spices' ? ['/turmeric'] : []),
    '/shop',
    '/sitemap-store.xml',
    '/feeds/google.xml',
  ];
}
```

In `catalog-admin.ts` `purgeStorefrontStmts`, add `/turmeric`:

```ts
  return purgeStmts(db, ['/shop', '/rice', '/spices', '/turmeric', '/produce', '/sitemap-store.xml', '/feeds/google.xml'], at, products);
```

In `src/pages/media/[...key].ts`:
- Line 12: `const PUBLIC_PREFIXES = ['products/', 'lab-reports/', 'certificates/', 'photos/'];`
- Update the doc comment to add "photo-library photos (already public via /api/photos/image)".

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npx vitest run tests/unit/edge-cache.test.ts tests/integration/catalog-admin.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/edge-cache.ts src/lib/store/catalog-admin.ts src/pages/media/[...key].ts tests/unit/edge-cache.test.ts
git commit -m "feat(store): /turmeric edge-cached and purged with spices; serve photo-library images from /media

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---
## Task 8: Story pages in D1 — drafts, publish, product story, view model

**Files:**
- Create: `src/lib/store/story-pages.ts`
- Test: `tests/integration/story-pages.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/story-pages.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyStoryPage } from '../../src/lib/store/story';
import { listStoryPages, loadStoryPageView, publishStoryPage, saveProductStory, saveStoryPageDraft, storyLinkFor } from '../../src/lib/store/story-pages';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const NOW = new Date('2026-10-20T06:00:00Z');
const organic = {
  category_id: 2, organic_scheme: 'pgs_organic', organic_cert_number: 'PGS-1',
  process_claims: JSON.stringify([{ code: 'traditional', text: 'Boiled the traditional way', evidence_note: 'Village records, 40 years' }]),
};
async function turmericProducts(): Promise<[number, number]> {
  const a = await insertProduct({ ...organic, name: 'Turmeric powder' });
  const b = await insertProduct({ ...organic, name: 'Turmeric fingers' });
  await insertVariant(a);
  await insertVariant(b);
  return [a, b];
}
const hero = (over: Partial<ReturnType<typeof emptyStoryPage>['hero']>) => ({ ...emptyStoryPage().hero, ...over });

beforeEach(async () => {
  await db.prepare('UPDATE story_pages SET published = NULL, published_at = NULL').run();
});

describe('landing-page drafts and publish', () => {
  it('saves a draft with unsupported wording as warnings, and refuses to publish it', async () => {
    const [a] = await turmericProducts();
    const rice = await insertProduct({ category_id: 1 });
    await insertVariant(rice);
    const draft = { ...emptyStoryPage(), seo: { title: 'Turmeric', description: 'Stone-ground turmeric.' }, hero: hero({ line1: 'Haldi', line2: 'Organic and immunity-boosting' }), productIds: [a, rice], storyFromProductId: a };
    const saved = await saveStoryPageDraft(db, 'turmeric', draft, NOW);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.warnings['hero.line2']).toMatch(/organic/);
    expect(saved.warnings['hero.line2']).toMatch(/immunity/);
    const pub = await publishStoryPage(db, 'turmeric', NOW);
    expect(pub.ok).toBe(false);
    expect(await scalar("SELECT published FROM story_pages WHERE slug = 'turmeric'")).toBeNull();
  });

  it('rejects a draft for an unknown page and a structurally invalid draft', async () => {
    expect(await saveStoryPageDraft(db, 'produce', emptyStoryPage(), NOW)).toEqual({ ok: false, errors: { _: 'Page not found' } });
    const bad = await saveStoryPageDraft(db, 'turmeric', { ...emptyStoryPage(), seo: { title: 'x'.repeat(80), description: '' } }, NOW);
    expect(!bad.ok && bad.errors['seo.title']).toMatch(/70/);
  });

  it('publishes a valid draft and purges the page, the hub, the sitemap and the linked product pages', async () => {
    const [a, b] = await turmericProducts();
    const draft = {
      ...emptyStoryPage(), seo: { title: 'Stone-Ground Turmeric Powder (Haldi) | HariLeaf', description: 'Boiled, sun-cured, stone-ground turmeric.' },
      hero: hero({ line1: 'Haldi the slow way.', line2: 'Certified organic, stone-ground.' }), productIds: [a, b], storyFromProductId: a, labColumns: ['Curcumin'],
    };
    expect((await saveStoryPageDraft(db, 'turmeric', draft, NOW)).ok).toBe(true);
    const before = Number(await scalar("SELECT count(*) FROM outbox WHERE kind = 'cache.purge'"));
    expect(await publishStoryPage(db, 'turmeric', NOW)).toEqual({ ok: true });
    expect(Number(await scalar("SELECT count(*) FROM outbox WHERE kind = 'cache.purge'"))).toBe(before + 2);
    const urls: string[] = JSON.parse(String(await scalar("SELECT payload FROM outbox WHERE kind = 'cache.purge' ORDER BY id DESC LIMIT 1"))).urls;
    for (const u of ['https://harileaf.org/turmeric', 'https://harileaf.org/spices', 'https://harileaf.org/sitemap-store.xml']) expect(urls).toContain(u);
    expect(urls.some((u) => /^https:\/\/harileaf\.org\/spices\/product-\d+$/.test(u))).toBe(true);
    expect((await listStoryPages(db)).find((p) => p.slug === 'turmeric')?.status).toBe('published');
    expect(await storyLinkFor(db, a)).toEqual({ path: '/turmeric/', label: 'The turmeric story →' });
  });
});

describe('product story', () => {
  it('saves after claims checks, warns about missing lab values, and can be removed', async () => {
    const [a] = await turmericProducts();
    const bad = await saveProductStory(db, a, {
      comparison: { heading: 'Stone vs mill', oursLabel: 'Ours', theirsLabel: 'High-speed mill', rows: [{ aspect: 'Powder', ours: 'Keeps oils', theirs: 'Fake colour', source: '' }, { aspect: 'Heat', ours: 'Cool', theirs: 'Hot', source: '' }] },
    }, NOW);
    expect(!bad.ok && bad.errors['comparison.rows.0']).toMatch(/competitor/);
    const ok = await saveProductStory(db, a, { proofLine: [{ kind: 'lab', key: 'Curcumin', label: 'Curcumin' }], icons: [{ icon: 'sun', label: 'Sun-cured' }] }, NOW);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.warnings['proofLine.0']).toMatch(/no 'Curcumin'/);
    expect(JSON.parse(String(await scalar(`SELECT story FROM products WHERE id = ${a}`))).icons).toEqual([{ icon: 'sun', label: 'Sun-cured' }]);
    expect((await saveProductStory(db, a, null, NOW)).ok).toBe(true);
    expect(await scalar(`SELECT story FROM products WHERE id = ${a}`)).toBeNull();
  });
});

describe('view model', () => {
  it('builds cards in order, hero proof from the active batch, the lab table and the shared certification line', async () => {
    const [a, b] = await turmericProducts();
    const rep = await db
      .prepare("INSERT INTO lab_reports (product_id, batch_code, tested_on, lab_name, test_scope, summary, visible) VALUES (?, 'T-01', '2026-09-01', 'Lab', 'x', ?, 1)")
      .bind(a, JSON.stringify({ Curcumin: '5.1 %', Moisture: '8 %' }))
      .run();
    await db.prepare("INSERT INTO batches (product_id, batch_code, packed_on, lab_report_id, active) VALUES (?, 'T-01', '2026-09-02', ?, 1)").bind(a, rep.meta.last_row_id).run();
    expect((await saveProductStory(db, a, { grower: { names: 'Patil family', place: 'Wada, Palghar' } }, NOW)).ok).toBe(true);
    const draft = { ...emptyStoryPage(), productIds: [b, a], storyFromProductId: a, labColumns: ['Curcumin', 'Moisture'], hero: hero({ line1: 'Haldi', proof: [{ productId: a, key: 'Curcumin', label: 'Curcumin' }] }) };
    expect((await saveStoryPageDraft(db, 'turmeric', draft, NOW)).ok).toBe(true);
    const v = await loadStoryPageView(db, 'turmeric', 'draft', NOW);
    expect(v?.cards.map((c) => c.id)).toEqual([b, a]);
    expect(v?.heroProof).toEqual(['Curcumin 5.1 %']);
    expect(v?.labTable.rows[0]).toMatchObject({ batchCode: 'T-01', values: ['5.1 %', '8 %'] });
    expect(v?.certificationLine).toBe('Certified organic (PGS-India Organic) · Certificate PGS-1');
    expect(v?.growers.map((g) => g.names)).toEqual(['Patil family']);
    expect(await loadStoryPageView(db, 'turmeric', 'published', NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npx vitest run tests/integration/story-pages.test.ts`
Expected: FAIL, with `Failed to resolve import "../../src/lib/store/story-pages"`

- [ ] **Step 3: Implement `story-pages.ts`**

Create `src/lib/store/story-pages.ts`:

```ts
/**
 * Story pages in D1 (spec: Data Model, Admin UX, Edge cache): landing-page
 * drafts and publishing, product-story saves, the re-check of published pages
 * when a product's evidence changes, and the view model the public routes and
 * previews render.
 */
import { activeLabSummaries, getProductsByIds, listProducts, type Product, type ProductCard } from './catalog';
import { organicCopy, type OrganicScheme, type ProcessClaim } from './claims';
import { nowIso } from './db';
import { productPurgePaths } from './edge-cache';
import { purgeStmts } from './purge';
import {
  coerceProductStory, coerceStoryPage, labValue, validateProductStory, validateStoryPageStructure,
  type Grower, type ProductStory, type StoryPage,
} from './story';
import { checkProductStory, checkStoryPage, fieldLabel, type ContextProduct } from './story-claims';
import { STORY_PAGE_SLUGS, isStoryPageSlug, mediaUrl, productPath, type StoryPageSlug } from './urls';

type FieldErrors = Record<string, string>;
export type SaveWithWarnings = { ok: true; warnings: FieldErrors } | { ok: false; errors: FieldErrors };

const parse = (raw: string | null | undefined): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// ── rows ──────────────────────────────────────────────────────────────────

export interface StoryPageRow { slug: StoryPageSlug; draft: StoryPage; published: StoryPage | null; draftSavedAt: string; publishedAt: string | null }

export async function getStoryPageRow(db: D1Database, slug: string): Promise<StoryPageRow | null> {
  if (!isStoryPageSlug(slug)) return null;
  const r = await db
    .prepare('SELECT draft, published, draft_saved_at, published_at FROM story_pages WHERE slug = ?')
    .bind(slug)
    .first<{ draft: string; published: string | null; draft_saved_at: string; published_at: string | null }>();
  if (!r) return null;
  return { slug, draft: coerceStoryPage(parse(r.draft)), published: r.published ? coerceStoryPage(parse(r.published)) : null, draftSavedAt: r.draft_saved_at, publishedAt: r.published_at };
}

export type PageStatus = 'never' | 'published' | 'changed';

export async function listStoryPages(db: D1Database): Promise<Array<{ slug: StoryPageSlug; status: PageStatus; draftSavedAt: string; publishedAt: string | null }>> {
  const rows = await Promise.all(STORY_PAGE_SLUGS.map((s) => getStoryPageRow(db, s)));
  return rows
    .filter((r): r is StoryPageRow => r !== null)
    .map((r) => ({
      slug: r.slug,
      status: !r.published ? 'never' : JSON.stringify(r.published) === JSON.stringify(r.draft) ? 'published' : 'changed',
      draftSavedAt: r.draftSavedAt,
      publishedAt: r.publishedAt,
    }));
}

// ── claims context from D1 ────────────────────────────────────────────────

type ContextRow = {
  id: number; name: string; organic_scheme: OrganicScheme; organic_conversion_since: number | null; organic_cert_number: string | null;
  process_claims: string; perishable: number; gi_name: string | null; gi_au_reg_number: string | null; story: string | null;
};

const contextFromRow = (r: ContextRow): ContextProduct => ({
  id: r.id,
  name: r.name,
  organic: { scheme: r.organic_scheme, conversionSince: r.organic_conversion_since, certNumber: r.organic_cert_number },
  claims: ((parse(r.process_claims) as ProcessClaim[] | null) ?? []).filter((c) => c && typeof c.code === 'string'),
  perishable: r.perishable === 1,
  gi: { name: r.gi_name, auRegNumber: r.gi_au_reg_number },
  story: coerceProductStory(parse(r.story)),
});

/** Linked products in any status: an inactive one stays in the claims context until the page is republished. */
export async function loadContextProducts(db: D1Database, ids: number[]): Promise<ContextProduct[]> {
  if (!ids.length) return [];
  const { results } = await db
    .prepare(
      `SELECT id, name, organic_scheme, organic_conversion_since, organic_cert_number, process_claims, perishable, gi_name, gi_au_reg_number, story
       FROM products WHERE id IN (${ids.map(() => '?').join(',')})`,
    )
    .bind(...ids)
    .all<ContextRow>();
  return results.map(contextFromRow);
}

/**
 * Published pages that would no longer pass if `changed` were saved. One
 * message per broken field, naming the page and the field.
 */
export async function publishedPageConflicts(db: D1Database, changed: ContextProduct): Promise<string[]> {
  const { results } = await db.prepare('SELECT slug, published FROM story_pages WHERE published IS NOT NULL').all<{ slug: string; published: string }>();
  const out: string[] = [];
  for (const r of results) {
    if (!isStoryPageSlug(r.slug)) continue;
    const page = coerceStoryPage(parse(r.published));
    if (!page.productIds.includes(changed.id)) continue;
    const products = (await loadContextProducts(db, page.productIds)).map((p) => (p.id === changed.id ? changed : p));
    for (const [k, m] of Object.entries(checkStoryPage(r.slug, page, products, { completeness: false })))
      out.push(`/${r.slug} would break in ${fieldLabel(k)}: ${m}. Edit and republish the page first.`);
  }
  return out;
}

// ── landing pages ─────────────────────────────────────────────────────────

/** Saves the draft when its structure is valid; claims and completeness problems come back as warnings. */
export async function saveStoryPageDraft(db: D1Database, slug: string, raw: unknown, now = new Date()): Promise<SaveWithWarnings> {
  if (!isStoryPageSlug(slug)) return { ok: false, errors: { _: 'Page not found' } };
  const page = coerceStoryPage(raw);
  const errors = validateStoryPageStructure(slug, page);
  if (Object.keys(errors).length) return { ok: false, errors };
  const warnings = checkStoryPage(slug, page, await loadContextProducts(db, page.productIds), { completeness: true });
  await db.prepare('UPDATE story_pages SET draft = ?, draft_saved_at = ? WHERE slug = ?').bind(JSON.stringify(page), nowIso(now), slug).run();
  return { ok: true, warnings };
}

async function linkedProductPaths(db: D1Database, ids: number[]): Promise<string[]> {
  if (!ids.length) return [];
  const { results } = await db
    .prepare(`SELECT c.slug AS c, p.slug AS s FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids)
    .all<{ c: string; s: string }>();
  return results.map((r) => `/${r.c}/${r.s}`);
}

/** The page, the sitemap, its linked product pages (their "story" link changes) and, for /turmeric, the /spices hub. */
export async function storyPagePurgePaths(db: D1Database, slug: StoryPageSlug, page: StoryPage): Promise<string[]> {
  return [`/${slug}`, '/sitemap-store.xml', ...(slug === 'turmeric' ? ['/spices'] : []), ...(await linkedProductPaths(db, page.productIds))];
}

export async function publishStoryPage(db: D1Database, slug: string, now = new Date()): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
  const row = await getStoryPageRow(db, slug);
  if (!row) return { ok: false, errors: { _: 'Page not found' } };
  const errors = {
    ...validateStoryPageStructure(row.slug, row.draft),
    ...checkStoryPage(row.slug, row.draft, await loadContextProducts(db, row.draft.productIds), { completeness: true }),
  };
  if (Object.keys(errors).length) return { ok: false, errors };
  const at = nowIso(now);
  await db.batch([
    db.prepare('UPDATE story_pages SET published = draft, published_at = ? WHERE slug = ?').bind(at, row.slug),
    ...purgeStmts(db, await storyPagePurgePaths(db, row.slug, row.draft), at),
  ]);
  return { ok: true };
}

// ── product story ─────────────────────────────────────────────────────────

/** Saves (or, with null, removes) a product's story. Live at once, so every claims error blocks. */
export async function saveProductStory(db: D1Database, productId: number, raw: unknown, now = new Date()): Promise<SaveWithWarnings> {
  const [p] = await loadContextProducts(db, [productId]);
  if (!p) return { ok: false, errors: { _: 'Product not found' } };
  const story = coerceProductStory(raw);
  if (story) {
    const errors = { ...validateProductStory(story), ...checkProductStory(story, p) };
    if (Object.keys(errors).length) return { ok: false, errors };
  }
  const conflicts = await publishedPageConflicts(db, { ...p, story });
  if (conflicts.length) return { ok: false, errors: { _pages: conflicts.join(' ') } };

  const warnings: FieldErrors = {};
  if (story) {
    const summary = (await activeLabSummaries(db, [productId])).get(productId) ?? null;
    story.proofLine.forEach((x, i) => {
      if (x.kind === 'lab' && !labValue(summary, x.key)) warnings[`proofLine.${i}`] = `The active batch's lab report has no '${x.key}', so this item is hidden on the page`;
    });
  }
  const loc = await db
    .prepare('SELECT c.slug AS c, p.slug AS s FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?')
    .bind(productId)
    .first<{ c: string; s: string }>();
  const at = nowIso(now);
  await db.batch([
    db.prepare('UPDATE products SET story = ?, updated_at = ? WHERE id = ?').bind(story ? JSON.stringify(story) : null, at, productId),
    ...purgeStmts(db, productPurgePaths(loc!.c, loc!.s), at),
  ]);
  return { ok: true, warnings };
}

/** "The turmeric story →" / "The rice story →" for a product linked from a published landing page. */
export async function storyLinkFor(db: D1Database, productId: number): Promise<{ path: string; label: string } | null> {
  const { results } = await db.prepare("SELECT slug, published FROM story_pages WHERE published IS NOT NULL AND slug != 'spices'").all<{ slug: string; published: string }>();
  for (const r of results)
    if (coerceStoryPage(parse(r.published)).productIds.includes(productId))
      return { path: `/${r.slug}/`, label: r.slug === 'turmeric' ? 'The turmeric story →' : 'The rice story →' };
  return null;
}

// ── view model ────────────────────────────────────────────────────────────

export interface LabTableRow { productName: string; productPath: string; batchCode: string; testedOn: string; values: Array<string | null>; pdfUrl: string | null }

export interface StoryPageViewModel {
  slug: StoryPageSlug;
  page: StoryPage;
  cards: ProductCard[];
  storyFrom: { product: Product; story: ProductStory } | null;
  growers: Grower[];
  labTable: { columns: string[]; rows: LabTableRow[] };
  heroProof: string[];
  /** Shown only when every linked product has the same certification line. */
  certificationLine: string | null;
  giBadge: string | null;
  turmericPublished: boolean;
}

async function labTableRows(db: D1Database, ids: number[], columns: string[]): Promise<LabTableRow[]> {
  if (!ids.length) return [];
  const { results } = await db
    .prepare(
      `SELECT l.batch_code, l.tested_on, l.summary, l.pdf_r2_key, p.name, p.slug, c.slug AS category_slug
       FROM lab_reports l JOIN products p ON p.id = l.product_id JOIN categories c ON c.id = p.category_id
       WHERE l.visible = 1 AND p.status = 'active' AND l.product_id IN (${ids.map(() => '?').join(',')})
       ORDER BY l.tested_on DESC, l.id DESC LIMIT 8`,
    )
    .bind(...ids)
    .all<{ batch_code: string; tested_on: string; summary: string; pdf_r2_key: string | null; name: string; slug: string; category_slug: string }>();
  return results.map((r) => {
    const summary = (parse(r.summary) as Record<string, unknown> | null) ?? {};
    return {
      productName: r.name, productPath: productPath(r.category_slug, r.slug), batchCode: r.batch_code, testedOn: r.tested_on,
      values: columns.map((k) => labValue(summary, k)), pdfUrl: r.pdf_r2_key ? mediaUrl(r.pdf_r2_key) : null,
    };
  });
}

/** Everything a landing page renders. `draft` is for the admin preview only. */
export async function loadStoryPageView(db: D1Database, slug: string, which: 'published' | 'draft', today: Date): Promise<StoryPageViewModel | null> {
  const row = await getStoryPageRow(db, slug);
  const page = row ? (which === 'published' ? row.published : row.draft) : null;
  if (!row || !page) return null;
  const ids = page.productIds;
  const [allCards, products, summaries, rows, turmeric] = await Promise.all([
    listProducts(db, { today }),
    getProductsByIds(db, ids),
    activeLabSummaries(db, ids),
    labTableRows(db, ids, page.labColumns),
    db.prepare("SELECT published_at FROM story_pages WHERE slug = 'turmeric'").first<{ published_at: string | null }>(),
  ]);
  const cards = ids.map((id) => allCards.find((c) => c.id === id)).filter((c): c is ProductCard => Boolean(c));
  const from = products.find((p) => p.id === page.storyFromProductId) ?? null;
  const ordered = from ? [from, ...products.filter((p) => p !== from)] : products;
  const growers: Grower[] = [];
  for (const g of ordered.map((p) => p.story?.grower).filter((g): g is Grower => Boolean(g)))
    if (!growers.some((x) => x.names.toLowerCase() === g.names.toLowerCase())) growers.push(g);
  const lines = products.map((p) => organicCopy({ organicScheme: p.organic.scheme, conversionSince: p.organic.conversionSince, certNumber: p.organic.certNumber }).certificationLine);
  return {
    slug: row.slug,
    page,
    cards,
    storyFrom: from?.story ? { product: from, story: from.story } : null,
    growers: growers.slice(0, 3),
    labTable: { columns: page.labColumns, rows },
    heroProof: page.hero.proof.flatMap((x) => {
      const v = labValue(summaries.get(x.productId) ?? null, x.key);
      return v ? [`${x.label} ${v}${x.suffix ?? ''}`] : [];
    }),
    certificationLine: lines.length > 0 && lines.every((l) => l && l === lines[0]) ? lines[0] : null,
    giBadge: from?.gi.name && from.gi.auRegNumber ? `GI-tagged ${from.gi.name} · Reg. ${from.gi.auRegNumber}` : null,
    turmericPublished: Boolean(turmeric?.published_at),
  };
}
```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npx vitest run tests/integration/story-pages.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/story-pages.ts tests/integration/story-pages.test.ts
git commit -m "feat(store): story pages in D1 — draft with warnings, checked publish with purges, product story save, view model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---

## Task 9: Product saves re-check the product's story and published pages

**Files:**
- Modify: `src/lib/store/catalog-admin.ts` (`saveProduct`)
- Test: `tests/integration/catalog-admin.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/integration/catalog-admin.test.ts`:

```ts
import { emptyStoryPage } from '../../src/lib/store/story';
import { saveProductStory } from '../../src/lib/store/story-pages';

describe('published story pages and product stories', () => {
  it('blocks a product save that would leave a published page unsupported, naming the page and field', async () => {
    const res = await saveProduct(db, null, input({ categorySlug: 'spices', slug: 'turmeric-cert', organicScheme: 'pgs_organic', organicCertNumber: 'PGS-9' }), [v()], NOW);
    if (!res.ok) throw new Error('setup');
    const page = { ...emptyStoryPage(), productIds: [res.id], storyFromProductId: res.id, hero: { ...emptyStoryPage().hero, line1: 'Haldi', line2: 'Certified organic' } };
    await db.prepare("UPDATE story_pages SET published = json(?), published_at = ? WHERE slug = 'turmeric'").bind(JSON.stringify(page), NOW.toISOString()).run();
    const drop = input({ categorySlug: 'spices', slug: 'turmeric-cert', organicScheme: 'none', organicCertNumber: null });
    const blocked = await saveProduct(db, res.id, drop, [], NOW);
    expect(!blocked.ok && blocked.errors._pages).toMatch(/\/turmeric would break in Hero line 2/);
    await db.prepare("UPDATE story_pages SET published = NULL, published_at = NULL WHERE slug = 'turmeric'").run();
    expect((await saveProduct(db, res.id, drop, [], NOW)).ok).toBe(true);
  });

  it("blocks removing the evidence a product's own story relies on", async () => {
    const traditional = { code: 'traditional', text: 'Transplanted by hand, the traditional way', evidence_note: 'Village records, 35 years' };
    const res = await saveProduct(db, null, input({ slug: 'kolam-story', processClaims: [traditional] }), [v()], NOW);
    if (!res.ok) throw new Error('setup');
    const steps = [1, 2, 3].map((n) => ({ title: `Step ${n}`, text: 'Done the traditional way', photoKey: null, photoAlt: '' }));
    expect((await saveProductStory(db, res.id, { processSteps: steps }, NOW)).ok).toBe(true);
    const blocked = await saveProduct(db, res.id, input({ slug: 'kolam-story', processClaims: [] }), [], NOW);
    expect(!blocked.ok && blocked.errors.story).toMatch(/Step 1/);
  });
});
```

Move the two new imports to the top of the file, next to the existing imports.

- [ ] **Step 2: Run the tests and confirm that they fail**

Run: `npx vitest run tests/integration/catalog-admin.test.ts`
Expected: FAIL. Both saves currently succeed.

- [ ] **Step 3: Implement in `saveProduct`**

In `catalog-admin.ts`, add the imports:

```ts
import { coerceProductStory } from './story';
import { checkProductStory, fieldLabel, type ContextProduct } from './story-claims';
import { publishedPageConflicts } from './story-pages';
```

In `saveProduct`, right after `if (Object.keys(errors).length) return { ok: false, errors };`, add:

```ts
  // Evidence can't be removed from under live copy: the product's own story, then published landing pages.
  if (id !== null) {
    const storyRow = await db.prepare('SELECT story FROM products WHERE id = ?').bind(id).first<{ story: string | null }>();
    let storyJson: unknown = null;
    try {
      storyJson = storyRow?.story ? JSON.parse(storyRow.story) : null;
    } catch {
      storyJson = null;
    }
    const changed: ContextProduct = {
      id,
      name: p.name,
      organic: { scheme: p.organicScheme, conversionSince: p.organicConversionSince, certNumber: trimOrNull(p.organicCertNumber) },
      claims: p.processClaims,
      perishable: p.perishable,
      gi: { name: trimOrNull(p.giName), auRegNumber: trimOrNull(p.giAuRegNumber) },
      story: coerceProductStory(storyJson),
    };
    if (changed.story) {
      const se = checkProductStory(changed.story, changed);
      if (Object.keys(se).length)
        return { ok: false, errors: { story: `This change would break the product's story — ${Object.entries(se).map(([k, m]) => `${fieldLabel(k)}: ${m}`).join('; ')}. Edit the story first.` } };
    }
    const conflicts = await publishedPageConflicts(db, changed);
    if (conflicts.length) return { ok: false, errors: { _pages: conflicts.join(' ') } };
  }
```

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npx vitest run tests/integration/catalog-admin.test.ts tests/integration/story-pages.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/catalog-admin.ts tests/integration/catalog-admin.test.ts
git commit -m "feat(store): product saves can't remove evidence used by its story or a published page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---

## Task 10: Admin API routes for stories and pages

**Files:**
- Create: `src/pages/api/admin/products/[id]/story.ts`, `src/pages/api/admin/pages/index.ts`, `src/pages/api/admin/pages/[slug]/index.ts`, `src/pages/api/admin/pages/[slug]/publish.ts`

The logic is already covered by Task 8 and Task 9 tests. These handlers are thin: auth, parse, call, drain. They match the existing `products/[id]/index.ts`.

- [ ] **Step 1: Product story route**

Create `src/pages/api/admin/products/[id]/story.ts`:

```ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, idParam, isAdmin, json, readJson, unauthorised } from '../../../../../lib/admin-api';
import { saveProductStory } from '../../../../../lib/store/story-pages';

export const prerender = false;

/** Body: { story: ProductStory | null } (null removes the story). */
export const PUT: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  if (!id) return json({ error: 'Not found' }, 404);
  const body = (await readJson(request)) as { story?: unknown } | undefined;
  if (!body) return json({ error: 'Invalid JSON' }, 400);
  const res = await saveProductStory(env.STORE_DB, id, body.story ?? null);
  if (!res.ok) return json({ error: 'Not saved', errors: res.errors }, res.errors._ === 'Product not found' ? 404 : 400);
  drainSoon(env, locals);
  return json({ ok: true, warnings: res.warnings });
};
```

- [ ] **Step 2: Page routes**

Create `src/pages/api/admin/pages/index.ts`:

```ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin, json, unauthorised } from '../../../../lib/admin-api';
import { listStoryPages } from '../../../../lib/store/story-pages';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  return json({ pages: await listStoryPages(env.STORE_DB) });
};
```

Create `src/pages/api/admin/pages/[slug]/index.ts`:

```ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin, json, readJson, unauthorised } from '../../../../../lib/admin-api';
import { getStoryPageRow, saveStoryPageDraft } from '../../../../../lib/store/story-pages';

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const row = await getStoryPageRow(env.STORE_DB, params.slug ?? '');
  return row ? json(row) : json({ error: 'Not found' }, 404);
};

/** Save draft: structure only; claims and completeness come back as warnings. Not live, so no purge. */
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const body = (await readJson(request)) as { draft?: unknown } | undefined;
  if (!body) return json({ error: 'Invalid JSON' }, 400);
  const res = await saveStoryPageDraft(env.STORE_DB, params.slug ?? '', body.draft);
  if (!res.ok) return json({ error: 'Not saved', errors: res.errors }, res.errors._ === 'Page not found' ? 404 : 400);
  return json({ ok: true, warnings: res.warnings });
};
```

Create `src/pages/api/admin/pages/[slug]/publish.ts`:

```ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, isAdmin, json, unauthorised } from '../../../../../lib/admin-api';
import { publishStoryPage } from '../../../../../lib/store/story-pages';

export const prerender = false;

export const POST: APIRoute = async ({ params, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const res = await publishStoryPage(env.STORE_DB, params.slug ?? '');
  if (!res.ok) return json({ error: 'Not published', errors: res.errors }, res.errors._ === 'Page not found' ? 404 : 400);
  drainSoon(env, locals);
  return json({ ok: true });
};
```

- [ ] **Step 3: Type check and build**

Run: `npx astro check`
Expected: `0 errors`

Run: `npm run build`
Expected: ends with `Complete!`

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/products/[id]/story.ts src/pages/api/admin/pages
git commit -m "feat(admin): API routes for product stories and landing pages (draft, publish)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---
## Task 11: Public section kit

**Files (all new, in `src/components/store/story/`):**
`StoryIcon.astro`, `ProofLine.astro`, `IconRow.astro`, `CategorySwitcher.astro`, `ProcessTimeline.astro`, `ComparisonBlock.astro`, `BatchLabTable.astro`, `LabReportCard.astro`, `OriginStory.astro`, `GrowerCard.astro`, `UseBlock.astro`, `FactsBlock.astro`, `StoryHero.astro`, `CardsSection.astro`, `Attribution.astro`, `FaqList.astro`

These components hold no logic, only markup. They are verified by `astro check` here, and by the E2E specs in Task 17 once routes render them. Every component takes already-resolved data: none of them fetch.

The visual language follows the dark "Organic Bento" shell: `#0c110c`, `border-white/10`, `bg-white/[0.04]`. Each page sets an accent with the CSS variable `--accent`: gold `#e0a53a` for turmeric, wheat `#c9a86a` for rice.

- [ ] **Step 1: Icons and buy-box pieces**

`StoryIcon.astro`:

```astro
---
/** Inline SVG for the fixed story icon presets (no emoji: icons carry no meaning alone; labels sit beside them). */
import type { StoryIcon } from '../../../lib/store/story';
interface Props { icon: StoryIcon; size?: number }
const { icon, size = 18 } = Astro.props;
const paths: Record<StoryIcon, string> = {
  stone_mill: 'M4 14h16v4H4zM6 10h12v4H6zM11 4h2v6h-2z',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  lab: 'M9 2h6M10 2v6l-5 10a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-10V2',
  hand: 'M7 11V5a1.5 1.5 0 0 1 3 0v5M10 10V3.5a1.5 1.5 0 0 1 3 0V10M13 10V5a1.5 1.5 0 0 1 3 0v7M16 12V8.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-12 4l-3-4a1.5 1.5 0 0 1 2.4-1.8L7 14',
  grain: 'M12 22V8M12 8c-3-1-4-4-4-6 2 0 4 2 4 6zM12 8c3-1 4-4 4-6-2 0-4 2-4 6zM12 14c-3-1-4-4-4-6 2 0 4 2 4 6zM12 14c3-1 4-4 4-6-2 0-4 2-4 6z',
  leaf: 'M5 19C5 9 12 4 20 4c0 8-5 15-15 15zM5 19l7-7',
  water: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  gi: 'M12 2l3 6 6 1-4.5 4.5 1 6.5L12 17l-5.5 3 1-6.5L3 9l6-1z',
};
---
<svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={paths[icon]} /></svg>
```

`ProofLine.astro`:

```astro
---
/** Under-title proof: resolved lab values and text, then the certification and GI badges. */
interface Props { items: string[]; certificationLine?: string | null; certUrl?: string | null; giBadge?: string | null }
const { items, certificationLine = null, certUrl = null, giBadge = null } = Astro.props;
---
{(items.length > 0 || certificationLine || giBadge) && (
  <div class="mt-3 flex flex-col gap-2" data-proof-line>
    {items.length > 0 && <p class="text-sm font-bold text-on-surface">{items.join(' · ')}</p>}
    <div class="flex flex-wrap gap-2">
      {certificationLine && (
        <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold" style="background:rgba(120,170,90,.16);color:#2f5a1f;border:1px solid rgba(120,170,90,.45);">
          ✓ {certificationLine}{certUrl && <> · <a href={certUrl} class="underline" target="_blank" rel="noopener">certificate</a></>}
        </span>
      )}
      {giBadge && <span class="inline-flex rounded-full px-3 py-1 text-xs font-extrabold" style="background:rgba(139,212,198,.16);color:#14524a;border:1px solid rgba(139,212,198,.5);">{giBadge}</span>}
    </div>
  </div>
)}
```

`IconRow.astro`:

```astro
---
import StoryIconSvg from './StoryIcon.astro';
import type { StoryIcon } from '../../../lib/store/story';
interface Props { icons: Array<{ icon: StoryIcon; label: string }> }
const { icons } = Astro.props;
---
{icons.length > 0 && (
  <ul class="mt-3 flex flex-wrap gap-2" aria-label="How it's made">
    {icons.map((i) => (
      <li class="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-3 py-1.5 text-xs font-bold text-on-surface"><StoryIconSvg icon={i.icon} size={16} />{i.label}</li>
    ))}
  </ul>
)}
```

`CategorySwitcher.astro`:

```astro
---
/** Rice variety switcher: links to the other active products of the category. */
interface Props { current: { name: string; path: string }; others: Array<{ name: string; path: string }> }
const { current, others } = Astro.props;
---
{others.length > 0 && (
  <nav aria-label="Other varieties" class="mt-3 flex flex-wrap gap-2 text-xs">
    <span aria-current="page" class="rounded-full border-2 border-primary px-3 py-1 font-extrabold">{current.name}</span>
    {others.map((o) => <a href={o.path} class="rounded-full border border-black/15 px-3 py-1 font-bold hover:border-primary">{o.name}</a>)}
  </nav>
)}
```

- [ ] **Step 2: Story sections**

`Attribution.astro`:

```astro
---
interface Props { product: { name: string; path: string } | null }
const { product } = Astro.props;
---
{product && <p class="mt-4 text-sm"><a href={product.path} class="font-bold" style="color:var(--accent,#8bd4c6);">From our {product.name} →</a></p>}
```

`ProcessTimeline.astro`:

```astro
---
import Attribution from './Attribution.astro';
import type { ProcessStep } from '../../../lib/store/story';
import { mediaUrl } from '../../../lib/store/urls';
interface Props { eyebrow: string; heading: string; steps: ProcessStep[]; variant?: 'list' | 'photos'; attribution?: { name: string; path: string } | null }
const { eyebrow, heading, steps, variant = 'list', attribution = null } = Astro.props;
const id = `timeline-${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
---
{steps.length > 0 && (
  <section class="py-12 px-6 text-white" style="background:#0c110c;" aria-labelledby={id}>
    <div class="max-w-7xl mx-auto">
      <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:var(--accent,#9fb17d);">{eyebrow}</p>
      <h2 id={id} class="text-3xl font-extrabold tracking-tight mb-8">{heading}</h2>
      {variant === 'photos' ? (
        <ol class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {steps.map((s, i) => (
            <li class="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.04]">
              {s.photoKey && <img src={mediaUrl(s.photoKey)} alt={s.photoAlt} width="400" height="300" loading="lazy" class="w-full aspect-[4/3] object-cover" />}
              <div class="p-4"><p class="text-xs font-extrabold" style="color:var(--accent,#9fb17d);">{i + 1}</p><h3 class="font-extrabold">{s.title}</h3><p class="text-sm" style="color:rgba(240,240,238,.7);">{s.text}</p></div>
            </li>
          ))}
        </ol>
      ) : (
        <ol class="relative border-l-2 pl-6 flex flex-col gap-5" style="border-color:var(--accent,#9fb17d);">
          {steps.map((s) => (
            <li class="relative">
              <span aria-hidden="true" class="absolute -left-[33px] top-1.5 w-3.5 h-3.5 rounded-full" style="background:var(--accent,#9fb17d);"></span>
              <h3 class="font-extrabold">{s.title}</h3>
              <p class="text-sm" style="color:rgba(240,240,238,.7);">{s.text}</p>
            </li>
          ))}
        </ol>
      )}
      <Attribution product={attribution} />
    </div>
  </section>
)}
```

`ComparisonBlock.astro`:

```astro
---
import Attribution from './Attribution.astro';
import type { Comparison } from '../../../lib/store/story';
import { mediaUrl } from '../../../lib/store/urls';
interface Props { eyebrow: string; comparison: Comparison | null; attribution?: { name: string; path: string } | null }
const { eyebrow, comparison: c, attribution = null } = Astro.props;
---
{c && (
  <section class="py-12 px-6 text-white" style="background:#0c110c;" aria-labelledby="comparison-heading">
    <div class="max-w-5xl mx-auto">
      <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:var(--accent,#9fb17d);">{eyebrow}</p>
      <h2 id="comparison-heading" class="text-3xl font-extrabold tracking-tight mb-6">{c.heading}</h2>
      {c.imageKey && <img src={mediaUrl(c.imageKey)} alt={c.imageAlt || `Comparison: ${c.oursLabel} vs ${c.theirsLabel}; details in the table below`} width="1200" height="900" loading="lazy" class="w-full rounded-2xl mb-6" />}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <caption class="sr-only">{c.heading}: {c.oursLabel} compared with {c.theirsLabel}</caption>
          <thead><tr class="text-left"><th scope="col" class="py-2 pr-4"><span class="sr-only">Aspect</span></th><th scope="col" class="py-2 pr-4" style="color:var(--accent,#9fb17d);">{c.oursLabel}</th><th scope="col" class="py-2 pr-4" style="color:rgba(240,240,238,.6);">{c.theirsLabel}</th></tr></thead>
          <tbody>
            {c.rows.map((r) => (
              <tr class="border-t border-white/10 align-top">
                <th scope="row" class="py-2.5 pr-4 font-normal" style="color:rgba(240,240,238,.6);">{r.aspect}</th>
                <td class="py-2.5 pr-4 font-bold">{r.ours}</td>
                <td class="py-2.5 pr-4" style="color:rgba(240,240,238,.72);">{r.theirs}{r.source && <span class="block text-xs" style="color:rgba(240,240,238,.45);">Source: {r.source}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.note && <p class="mt-4 text-sm" style="color:rgba(240,240,238,.6);">{c.note}</p>}
      <Attribution product={attribution} />
    </div>
  </section>
)}
```

`BatchLabTable.astro`:

```astro
---
import type { LabTableRow } from '../../../lib/store/story-pages';
interface Props { columns: string[]; rows: LabTableRow[] }
const { columns, rows } = Astro.props;
const fmt = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
---
{rows.length > 0 && (
  <section class="py-12 px-6 text-white" style="background:#0c110c;" aria-labelledby="lab-table-heading">
    <div class="max-w-5xl mx-auto">
      <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:var(--accent,#9fb17d);">Nothing to hide</p>
      <h2 id="lab-table-heading" class="text-3xl font-extrabold tracking-tight mb-6">Every batch, tested</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <caption class="sr-only">Lab results per batch</caption>
          <thead><tr class="text-left"><th scope="col" class="py-2 pr-4">Batch</th>{columns.map((c) => <th scope="col" class="py-2 pr-4">{c}</th>)}<th scope="col" class="py-2">Report</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr class="border-t border-white/10">
                <th scope="row" class="py-2.5 pr-4 font-normal"><a href={r.productPath} class="font-bold">{r.productName}</a><span class="block text-xs" style="color:rgba(240,240,238,.55);">{r.batchCode} · tested {fmt(r.testedOn)}</span></th>
                {r.values.map((v) => <td class="py-2.5 pr-4 font-bold">{v ?? '—'}</td>)}
                <td class="py-2.5">{r.pdfUrl ? <a href={r.pdfUrl} target="_blank" rel="noopener" class="font-bold" style="color:#8bd4c6;">Download PDF</a> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </section>
)}
```

`LabReportCard.astro`: move the existing `{lab && (<div id="lab-report" …>…</div>)}` block from `ProductPageView.astro` (lines 168–177 at the time of writing) into this component, unchanged. Give it `interface Props { lab: LabReport }` and a local `fmtDate` identical to `ProductPageView`'s:

```astro
---
import type { LabReport } from '../../../lib/store/catalog';
interface Props { lab: LabReport }
const { lab } = Astro.props;
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
---
<div id="lab-report" class="rounded-3xl p-7 border bg-white/[0.04]" style="border-color:rgba(139,212,198,.3);">
  <h3 class="font-extrabold text-lg mb-1 text-white">Lab report · Batch {lab.batchCode}</h3>
  <p class="text-xs mb-3" style="color:rgba(240,240,238,.55);">Tested {fmtDate(lab.testedOn)} by {lab.labName}{lab.labAccreditation ? ` (${lab.labAccreditation})` : ''}{lab.testScope ? ` · ${lab.testScope}` : ''}</p>
  <dl class="text-sm flex flex-col gap-1.5" style="color:rgba(240,240,238,.78);">
    {Object.entries(lab.summary).filter(([, v]) => typeof v === 'string').map(([k, v]) => (<div class="flex justify-between gap-3"><dt>{k}</dt><dd class="font-bold text-white text-right">{v as string}</dd></div>))}
  </dl>
  {lab.pdfUrl && <a href={lab.pdfUrl} class="inline-block mt-4 font-extrabold" style="color:#8bd4c6;" target="_blank" rel="noopener">Download the report (PDF) →</a>}
</div>
```

`OriginStory.astro`:

```astro
---
import Attribution from './Attribution.astro';
import type { OriginStory } from '../../../lib/store/story';
import { renderBasicMarkdown } from '../../../lib/store/markdown';
import { mediaUrl } from '../../../lib/store/urls';
interface Props { origin: OriginStory | null; eyebrow?: string; attribution?: { name: string; path: string } | null }
const { origin, eyebrow = 'The variety', attribution = null } = Astro.props;
---
{origin && (
  <section class="py-12 px-6 text-white" style="background:#0c110c;" aria-labelledby="origin-heading">
    <div class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-8 items-center">
      <div>
        <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:var(--accent,#9fb17d);">{eyebrow}</p>
        <h2 id="origin-heading" class="text-3xl font-extrabold tracking-tight mb-4">{origin.heading}</h2>
        <div class="leading-relaxed [&_p]:mb-3" style="color:rgba(240,240,238,.72);" set:html={renderBasicMarkdown(origin.bodyMd)} />
        <Attribution product={attribution} />
      </div>
      {origin.photoKey && <img src={mediaUrl(origin.photoKey)} alt={origin.photoAlt} width="800" height="600" loading="lazy" class="w-full rounded-3xl object-cover aspect-[4/3]" />}
    </div>
  </section>
)}
```

`GrowerCard.astro`:

```astro
---
import type { Grower } from '../../../lib/store/story';
import { renderBasicMarkdown } from '../../../lib/store/markdown';
import { mediaUrl } from '../../../lib/store/urls';
interface Props { grower: Grower }
const { grower: g } = Astro.props;
---
<div class="rounded-3xl p-7 border border-white/10 bg-white/[0.04] text-white">
  {g.photoKey && <img src={mediaUrl(g.photoKey)} alt={g.photoAlt} width="480" height="320" loading="lazy" class="w-full rounded-2xl object-cover aspect-[3/2] mb-4" />}
  <p class="text-xs uppercase tracking-widest font-extrabold" style="color:var(--accent,#9fb17d);">Grown by</p>
  <h3 class="font-extrabold text-lg">{g.names}</h3>
  <p class="text-sm" style="color:rgba(240,240,238,.6);">{g.place}{g.since ? ` · on this land since ${g.since}` : ''}</p>
  {g.bodyMd && <div class="mt-2 text-sm leading-relaxed" style="color:rgba(240,240,238,.72);" set:html={renderBasicMarkdown(g.bodyMd)} />}
</div>
```

`UseBlock.astro` (light band):

```astro
---
import type { UseBlock } from '../../../lib/store/story';
interface Props { use: UseBlock | null; recipes: Array<{ slug: string; title: string }> }
const { use, recipes } = Astro.props;
---
{use && (
  <section aria-labelledby="use-heading" class="rounded-3xl bg-white border border-black/5 p-7">
    <h2 id="use-heading" class="text-2xl font-extrabold tracking-tight mb-3">{use.heading}</h2>
    <ol class="list-decimal pl-5 flex flex-col gap-1.5 text-on-surface-variant">{use.steps.map((s) => <li>{s}</li>)}</ol>
    {recipes.length > 0 && <p class="mt-4 text-sm">{recipes.map((r, i) => <>{i > 0 && ' · '}<a href={`/recipes/${r.slug}/`} class="font-bold text-primary">{r.title}</a></>)}</p>}
  </section>
)}
```

`FactsBlock.astro`:

```astro
---
interface Props { heading: string; facts: Array<{ title: string; text: string }> }
const { heading, facts } = Astro.props;
---
{facts.length > 0 && (
  <section aria-labelledby="facts-heading">
    <h2 id="facts-heading" class="text-2xl font-extrabold tracking-tight mb-5">{heading}</h2>
    <dl class="grid grid-cols-1 md:grid-cols-3 gap-4">{facts.map((f) => <div class="rounded-2xl bg-white border border-black/5 p-5"><dt class="font-extrabold">{f.title}</dt><dd class="mt-1 text-sm text-on-surface-variant">{f.text}</dd></div>)}</dl>
  </section>
)}
```

`FaqList.astro`: extract the FAQ `<section>` from `ProductPageView.astro` lines 222–236 as is, with `interface Props { faq: Array<{ q: string; a: string }> }`:

```astro
---
interface Props { faq: Array<{ q: string; a: string }> }
const { faq } = Astro.props;
---
{faq.length > 0 && (
  <section aria-labelledby="faq-heading">
    <p class="text-xs uppercase tracking-widest font-extrabold mb-2 text-secondary">Questions</p>
    <h2 id="faq-heading" class="text-2xl font-extrabold tracking-tight mb-5">Frequently asked</h2>
    <div class="flex flex-col gap-2 max-w-3xl">
      {faq.map((f, i) => (
        <details class="rounded-2xl bg-white px-5 py-4 border border-black/5" open={i === 0}>
          <summary class="font-extrabold cursor-pointer">{f.q}</summary>
          <p class="mt-2 text-on-surface-variant leading-relaxed">{f.a}</p>
        </details>
      ))}
    </div>
  </section>
)}
```

`StoryHero.astro`:

```astro
---
import FadeIn from '../../animations/FadeIn.astro';
import { mediaUrl } from '../../../lib/store/urls';
interface Props {
  hero: { eyebrow: string; line1: string; line2: string; subtitle: string; ctaLabel: string; photoKey: string | null; photoAlt: string };
  badges: string[];
  ctaHref: string;
}
const { hero, badges, ctaHref } = Astro.props;
---
<section class="relative overflow-hidden text-white" style="background:radial-gradient(ellipse at 80% 0%, color-mix(in srgb, var(--accent,#9fb17d) 30%, transparent), transparent 60%), linear-gradient(135deg,#0e1a0e 0%,#0c110c 100%);padding:8rem 0 4.5rem;">
  <div class="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-10 items-center">
    <div>
      {hero.eyebrow && <FadeIn><p class="text-xs uppercase tracking-widest font-extrabold" style="color:var(--accent,#9fb17d);">{hero.eyebrow}</p></FadeIn>}
      <FadeIn delay={100}><h1 class="text-5xl md:text-6xl font-extrabold tracking-tighter leading-[1.05] mt-4">{hero.line1}{hero.line2 && <><br /><span style="color:var(--accent,#9fb17d);">{hero.line2}</span></>}</h1></FadeIn>
      {hero.subtitle && <FadeIn delay={200}><p class="mt-5 text-lg max-w-xl leading-relaxed" style="color:rgba(255,255,255,.6);">{hero.subtitle}</p></FadeIn>}
      {badges.length > 0 && <ul class="mt-6 flex flex-wrap gap-2" aria-label="Highlights">{badges.map((b) => <li class="rounded-full border border-white/20 bg-white/[0.06] px-3.5 py-1.5 text-xs font-bold">{b}</li>)}</ul>}
      {hero.ctaLabel && <a href={ctaHref} class="mt-7 inline-block rounded-full px-6 py-3 font-extrabold text-[#1a1205]" style="background:var(--accent,#9fb17d);">{hero.ctaLabel} ↓</a>}
    </div>
    {hero.photoKey && <img src={mediaUrl(hero.photoKey)} alt={hero.photoAlt} width="900" height="700" fetchpriority="high" class="w-full rounded-3xl object-cover aspect-[9/7]" />}
  </div>
</section>
```

`CardsSection.astro`:

```astro
---
import ProductGrid from '../ProductGrid.astro';
import type { ProductCard } from '../../../lib/store/catalog';
interface Props { id: string; eyebrow: string; heading: string; cards: ProductCard[]; blurbs: Record<string, string> }
const { id, eyebrow, heading, cards, blurbs } = Astro.props;
// The card blurb (a page-owned one-liner) replaces the product's short description on this page.
const shown = cards.map((c) => (blurbs[String(c.id)] ? { ...c, shortDescription: blurbs[String(c.id)] } : c));
---
{shown.length > 0 && (
  <section id={id} class="pt-16 pb-4 px-6 scroll-mt-24" style="background:#0c110c;" aria-labelledby={`${id}-heading`}>
    <div class="max-w-7xl mx-auto">
      <p class="text-xs uppercase tracking-widest font-extrabold mb-2" style="color:var(--accent,#9fb17d);">{eyebrow}</p>
      <h2 id={`${id}-heading`} class="text-3xl font-extrabold tracking-tight mb-8 text-white">{heading}</h2>
      <ProductGrid cards={shown} tone="dark" />
    </div>
  </section>
)}
```

- [ ] **Step 3: Type check**

Run: `npx astro check`
Expected: `0 errors` (the components aren't used yet; Astro still type-checks them)

- [ ] **Step 4: Commit**

```bash
git add src/components/store/story
git commit -m "feat(store): story section kit — proof line, icons, timeline, comparison, lab table, origin, grower, use, facts, hero, cards, FAQ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---
## Task 12: Product pages render the story; product preview

**Files:**
- Modify: `src/components/store/BuyBox.astro`, `src/components/store/ProductPageView.astro`, `src/lib/store/catalog.ts` (`getProductPage` option), `src/pages/rice/[slug].astro`, `src/pages/spices/[slug].astro`
- Create: `src/pages/admin/preview/product.astro`
- Test: `tests/integration/catalog.test.ts` (append)

- [ ] **Step 1: Write the failing test for draft preview loading**

Append to `tests/integration/catalog.test.ts`:

```ts
it('loads a draft product page only when asked (admin preview), even without pack sizes', async () => {
  const id = await insertProduct({ category_id: 2, slug: 'turmeric-draft', status: 'draft' });
  expect((await getProductPage(db, 'spices', 'turmeric-draft', TODAY)).kind).toBe('not_found');
  const res = await getProductPage(db, 'spices', 'turmeric-draft', TODAY, { includeDraft: true });
  expect(res.kind).toBe('ok');
  if (res.kind === 'ok') expect([res.product.id, res.variants]).toEqual([id, []]);
});
```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `npx vitest run tests/integration/catalog.test.ts`
Expected: FAIL. The option doesn't exist yet, and the draft returns `not_found`.

- [ ] **Step 3: Add `includeDraft` to `getProductPage`**

In `catalog.ts`, change the signature and the two early exits:

```ts
export async function getProductPage(db: D1Database, categorySlug: string, slug: string, today: Date, opts: { includeDraft?: boolean } = {}): Promise<ProductPageResult> {
  // …
  if (!row || (row.status === 'draft' && !opts.includeDraft)) return { kind: 'not_found' };
  // …
  if (variants.length === 0 && !opts.includeDraft) return { kind: 'not_found' };
```

Run: `npx vitest run tests/integration/catalog.test.ts`
Expected: PASS

- [ ] **Step 4: `BuyBox.astro` — an `under-title` slot and an optional certification line**

- In `Props`, add `/** The story's proof line shows the certification itself. */ hideCertLine?: boolean;`.
- Destructure it: `const { product: p, variants, batch, minOrderPaise, codMaxPaise, rating, zone, settings, hideCertLine = false } = Astro.props;`
- Right after `{p.shortDescription && <p …>{p.shortDescription}</p>}` (line 49), add `<slot name="under-title" />`.
- Change `{cert.certificationLine && (` (line 164) to `{cert.certificationLine && !hideCertLine && (`.

- [ ] **Step 5: `ProductPageView.astro` — story sections**

Add to the imports:

```ts
import CategorySwitcher from './story/CategorySwitcher.astro';
import ComparisonBlock from './story/ComparisonBlock.astro';
import FaqList from './story/FaqList.astro';
import GrowerCard from './story/GrowerCard.astro';
import IconRow from './story/IconRow.astro';
import LabReportCard from './story/LabReportCard.astro';
import OriginStory from './story/OriginStory.astro';
import ProcessTimeline from './story/ProcessTimeline.astro';
import ProofLine from './story/ProofLine.astro';
import UseBlock from './story/UseBlock.astro';
import { resolveProof } from '../../lib/store/story';
```

Extend `Props`:

```ts
  /** Other active products of the category (variety switcher). */
  siblings?: ProductCard[];
  /** Link to the published landing page that features this product. */
  storyLink?: { path: string; label: string } | null;
  /** Admin preview of an unsaved story: banner with its validation messages. */
  preview?: { messages: string[] } | null;
```

Replace the frontmatter lines from `const { product: p, …} = Astro.props;` through `const hasBand = …;` with:

```ts
const { product: p, variants, images, batch, labReports, related, reviews, zone, settings, siblings = [], storyLink = null, preview = null } = Astro.props;
const initial = variants.find((v) => v.availability === 'buy') ?? variants.find((v) => v.availability === 'preorder') ?? variants[0];
const cert = organicCopy({ organicScheme: p.organic.scheme, conversionSince: p.organic.conversionSince, certNumber: p.organic.certNumber });
const mayUseOrganic = cert.mayUseOrganic;
const title = initial ? productTitle(p, initial, { mayUseOrganic }) : `${p.name} | HariLeaf`;
const description = productDescription(p);
const canonical = absolute(productPath(p.category.slug, p.slug));
const crumbs = [
  { name: 'Home', path: '/' },
  { name: p.category.name, path: categoryPath(p.category.slug) },
  { name: p.name, path: productPath(p.category.slug, p.slug) },
];
const schemas = initial
  ? [productGroupJsonLd({ product: p, variants, images, reviews }), breadcrumbJsonLd(crumbs), faqJsonLd(p.faq)].filter((s): s is Record<string, unknown> => s !== null)
  : [];
const lab = batch?.labReport ?? labReports[0] ?? null;
const description_html = renderBasicMarkdown(p.descriptionMd);
const minOrder = /^\d+$/.test(settings.min_order_paise) ? Number(settings.min_order_paise) : null;
const codMax = /^\d+$/.test(settings.cod_max_order_paise) ? Number(settings.cod_max_order_paise) : null;
const story = p.story;
// The proof line reads only the active batch's report (never the older-report fallback the lab card uses).
const proof = story ? resolveProof(story.proofLine, batch?.labReport?.summary ?? null) : [];
const giBadge = p.gi.name && p.gi.auRegNumber ? `GI-tagged ${p.gi.name} · Reg. ${p.gi.auRegNumber}` : null;
const storyLabRow = Boolean(story && (lab || story.grower));
const howEntries = story?.processSteps.length ? [] : Object.entries(p.howItsMade);
const harvestEntries = Object.entries(p.harvestInfo);
const attrEntries = Object.entries(p.attributes);
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
// Internal links (SEO §3.4): recipes that use this product, and the category's guide.
const cookIt = recipesUsing(p.category.slug, p.slug);
const readMore = articlesFor(p.category.slug);
const bentoLab = lab && !storyLabRow ? lab : null;
const hasBand = howEntries.length || harvestEntries.length || p.nutrition.rows.length || bentoLab || description_html || attrEntries.length;
const accent = p.category.slug === 'spices' ? '#e0a53a' : p.category.slug === 'rice' ? '#c9a86a' : '#9fb17d';
const others = siblings.filter((s) => s.id !== p.id).map((s) => ({ name: s.name, path: s.path }));
```

In the markup:

1. Pass `noIndex={Boolean(preview)}` to `<SiteLayout …>`, and wrap everything inside `SiteLayout` (after the head slot) in `<div style={`--accent:${accent}`}>` … `</div>`.
2. As the first child of that wrapper, add the preview banner:
   ```astro
   {preview && (
     <div class="fixed top-0 inset-x-0 z-50 bg-[#8a6d1d] text-white text-sm px-6 py-2" role="status">
       <strong>Preview — not live.</strong>{preview.messages.length ? ` Fix before saving: ${preview.messages.join(' · ')}` : ' Looks good — save the story to publish it.'}
     </div>
   )}
   ```
3. Replace `<BuyBox …>` … `</BuyBox>` with the guarded version. The children are unchanged, except the slot content added at the top:
   ```astro
   {initial ? (
     <BuyBox product={p} variants={variants} batch={batch} minOrderPaise={minOrder} codMaxPaise={codMax} rating={reviews.summary} zone={zone} settings={settings} hideCertLine={Boolean(story)}>
       {story && (
         <Fragment slot="under-title">
           <ProofLine items={proof} certificationLine={cert.certificationLine} certUrl={p.organic.certUrl} giBadge={giBadge} />
           <IconRow icons={story.icons} />
           {story.showCategorySwitcher && <CategorySwitcher current={{ name: p.name, path: p.path }} others={others} />}
         </Fragment>
       )}
       <details class="rounded-2xl bg-surface-container-low px-5 py-4"> …unchanged… </details>
     </BuyBox>
   ) : (
     <div class="rounded-2xl bg-surface-container-low p-6"><h1 class="text-3xl font-extrabold">{p.name}</h1><p class="mt-2 text-on-surface-variant">No pack sizes yet.</p></div>
   )}
   ```
4. Between the closing `</div>` of the buy-box container and `{hasBand && (`, add:
   ```astro
   {story && (
     <>
       <OriginStory origin={story.originStory} />
       <ProcessTimeline eyebrow="From field to pack" heading={`How our ${p.name} is made`} steps={story.processSteps} variant={story.processSteps.some((s) => s.photoKey) ? 'photos' : 'list'} />
       <ComparisonBlock eyebrow="Why it matters" comparison={story.comparison} />
       {storyLabRow && (
         <section class="pb-12 px-6" style="background:#0c110c;" aria-label="Lab report and grower">
           <div class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
             {lab && <LabReportCard lab={lab} />}
             {story.grower && <GrowerCard grower={story.grower} />}
           </div>
         </section>
       )}
     </>
   )}
   ```
5. In the bento, replace the inline `{lab && (<div id="lab-report" …>…</div>)}` block with `{bentoLab && <LabReportCard lab={bentoLab} />}`.
6. Replace the bento's closing link `<p class="mt-6 text-sm"><a href="/our-process/" …>How we grow, mill and grind →</a></p>` with:
   ```astro
   <p class="mt-6 text-sm"><a href={storyLink?.path ?? '/our-process/'} class="font-bold" style="color:#8bd4c6;">{storyLink?.label ?? 'How we grow, mill and grind →'}</a></p>
   ```
   If there's no bento (`hasBand` false) but there is a `storyLink`, render the same `<p>` at the end of the story sections fragment from item 4.
7. In the light band, before the recipes/guides section, add `{story?.use && <UseBlock use={story.use} recipes={cookIt} />}`. Replace the FAQ `<section>` (lines 222–236) with `<FaqList faq={p.faq} />`.

- [ ] **Step 6: Product routes pass the story link**

In `src/pages/rice/[slug].astro` and `src/pages/spices/[slug].astro`:
- Add the import `import { storyLinkFor } from '../../lib/store/story-pages';`.
- After `const settings = …`, add:
  ```ts
  // A missing story link must never break the product page.
  const storyLink = await storyLinkFor(env.STORE_DB, res.product.id).catch(() => null);
  ```
- Render `<ProductPageView {...res} settings={settings} storyLink={storyLink} />`.

`res` already carries `siblings` (Task 5).

- [ ] **Step 7: Product preview route**

Create `src/pages/admin/preview/product.astro`:

```astro
---
/**
 * Preview of a product page with the story editor's unsaved state (spec: API
 * Routes). Same-origin form POST only (Astro's origin check) behind the admin
 * gate; never writes, never cached, never indexed.
 */
export const prerender = false;
import { env } from 'cloudflare:workers';
import ProductPageView from '../../../components/store/ProductPageView.astro';
import { idParam } from '../../../lib/admin-api';
import { validateSession } from '../../../lib/auth';
import { getProductPage } from '../../../lib/store/catalog';
import { getProductForAdmin } from '../../../lib/store/catalog-admin';
import { loadPolicySettings } from '../../../lib/store/policy-settings';
import { coerceProductStory, validateProductStory } from '../../../lib/store/story';
import { checkProductStory, fieldLabel } from '../../../lib/store/story-claims';
import { loadContextProducts } from '../../../lib/store/story-pages';

Astro.response.headers.set('Cache-Control', 'no-store');
Astro.response.headers.set('X-Robots-Tag', 'noindex');
if (!(await validateSession(env.HARILEAF_CMS, Astro.cookies))) return new Response('Unauthorised', { status: 401 });
if (Astro.request.method !== 'POST') return new Response('Open the preview from the story editor.', { status: 405 });

let payload: { productId?: unknown; story?: unknown } = {};
try {
  payload = JSON.parse(String((await Astro.request.formData()).get('payload') ?? '{}'));
} catch {
  return new Response('Invalid preview', { status: 400 });
}
const id = idParam(String(payload.productId ?? ''));
const admin = id ? await getProductForAdmin(env.STORE_DB, id) : null;
if (!id || !admin) return new Response('Product not found', { status: 404 });
const res = await getProductPage(env.STORE_DB, admin.product.category.slug, admin.product.slug, new Date(), { includeDraft: true });
if (res.kind !== 'ok') return new Response('This product has no page to preview (discontinued?)', { status: 404 });
const story = coerceProductStory(payload.story);
const [ctx] = await loadContextProducts(env.STORE_DB, [id]);
const messages = story ? Object.entries({ ...validateProductStory(story), ...checkProductStory(story, ctx) }).map(([k, m]) => `${fieldLabel(k)}: ${m}`) : [];
const settings = await loadPolicySettings(env.STORE_DB);
---
<ProductPageView {...res} product={{ ...res.product, story }} settings={settings} preview={{ messages }} />
```

- [ ] **Step 8: Check**

Run: `npx astro check`
Expected: `0 errors`

Run: `npm test 2>&1 | grep -E "Test Files|Tests "`
Expected: all passing

Run: `npm run build`
Expected: `Complete!`

- [ ] **Step 9: Commit**

```bash
git add src/components/store/BuyBox.astro src/components/store/ProductPageView.astro src/lib/store/catalog.ts src/pages/rice/[slug].astro src/pages/spices/[slug].astro src/pages/admin/preview/product.astro tests/integration/catalog.test.ts
git commit -m "feat(store): product pages render story sections; admin preview of an unsaved story

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---

## Task 13: Landing pages — `StoryPageView`, legacy guard, routes, draft preview

**Files:**
- Create: `src/components/store/StoryPageView.astro`, `src/components/store/legacy/RiceLegacy.astro`, `src/components/store/legacy/SpicesLegacy.astro`, `src/pages/turmeric.astro`, `src/pages/admin/preview/page/[slug].astro`
- Modify: `src/pages/rice.astro`, `src/pages/spices.astro`

Task 0 merged `origin/main` into this branch, so `rice.astro` already has the GI clean-up from PR #13. Run `grep -c -i -E "GI-tagged|Wada Kolam" src/pages/rice.astro` and expect `0` before moving anything.

- [ ] **Step 1: Move today's pages into legacy components**

```bash
mkdir -p src/components/store/legacy
git mv src/pages/rice.astro src/components/store/legacy/RiceLegacy.astro
git mv src/pages/spices.astro src/components/store/legacy/SpicesLegacy.astro
```

In `RiceLegacy.astro`, replace everything from the first `---` up to and including the closing `---` of the frontmatter with the block below. The `pageTitle`, `pageDesc` and `galleryFilters` values are copied from PR #13's cleaned `rice.astro`; check them with `git show origin/main:src/pages/rice.astro | sed -n 14,24p`. The markup below the frontmatter is unchanged.

```astro
---
/**
 * Today's /rice (GI clean-up from PR #13 included), served until the rice
 * story page is first published, and on D1 failure. Delete in rollout step 4.
 */
import { articlesFor } from '../../../content/store/articles';
import ProductGrid from '../ProductGrid.astro';
import type { ProductCard } from '../../../lib/store/catalog';
import { absolute, categoryPath } from '../../../lib/store/urls';
import SiteLayout from '../../../layouts/SiteLayout.astro';
import SEO from '../../seo/SEO.astro';
import FadeIn from '../../animations/FadeIn.astro';
import WaitlistForm from '../../produce/WaitlistForm.astro';
import PhotoGallery from '../../produce/PhotoGallery.astro';

interface Props { cards: ProductCard[] }
const { cards } = Astro.props;

// Stable canonical: the edge cache serves /rice and /rice/ from one entry.
const canonicalURL = absolute(categoryPath('rice'));
const pageTitle = 'Heritage Rice Online — Karjat 3, Kolam from Wada & Red Rice | HariLeaf';
const pageDesc  = 'Buy HariLeaf heritage rice — Karjat 3, Kolam from Wada and Red Rice — grown on our farm and milled just enough to remove the husk, so the bran and germ stay on the grain.';

const galleryFilters = [
  { key: 'all', label: 'All' },
  { key: 'rice:karjat', label: 'Karjat 3' },
  { key: 'rice:wada', label: 'Kolam from Wada' },
  { key: 'rice:red', label: 'Red Rice' },
];
const selling = cards.length > 0;
---
```

In `SpicesLegacy.astro`, replace the whole frontmatter with:

```astro
---
/** Today's /spices, served until the spices hub is first published, and on D1 failure. Delete in rollout step 4. */
import { articlesFor } from '../../../content/store/articles';
import ProductGrid from '../ProductGrid.astro';
import type { ProductCard } from '../../../lib/store/catalog';
import { absolute, categoryPath } from '../../../lib/store/urls';
import SiteLayout from '../../../layouts/SiteLayout.astro';
import SEO from '../../seo/SEO.astro';
import FadeIn from '../../animations/FadeIn.astro';
import WaitlistForm from '../../produce/WaitlistForm.astro';
import PhotoGallery from '../../produce/PhotoGallery.astro';

interface Props { cards: ProductCard[] }
const { cards } = Astro.props;

// Stable canonical: the edge cache serves /spices and /spices/ from one entry.
const canonicalURL = absolute(categoryPath('spices'));
const pageTitle = 'Stone-Ground Turmeric & Red Chili Powder | HariLeaf';
const pageDesc  = 'Buy HariLeaf turmeric and red chili powder — sun-dried and slowly stone-ground at low temperature so more of the aroma and colour stays in the powder.';

const galleryFilters = [
  { key: 'all', label: 'All' },
  { key: 'spice:turmeric', label: 'Turmeric' },
  { key: 'spice:chili', label: 'Red Chili' },
];
const selling = cards.length > 0;
---
```

If an import is no longer used after the move (`astro check` reports it), remove it.

- [ ] **Step 2: `StoryPageView.astro`**

Create `src/components/store/StoryPageView.astro`:

```astro
---
/** A landing page (/rice, /turmeric, /spices) from its fixed layout (PAGE_LAYOUTS) and view model. */
import SiteLayout from '../../layouts/SiteLayout.astro';
import SEO from '../seo/SEO.astro';
import BatchLabTable from './story/BatchLabTable.astro';
import CardsSection from './story/CardsSection.astro';
import ComparisonBlock from './story/ComparisonBlock.astro';
import FactsBlock from './story/FactsBlock.astro';
import FaqList from './story/FaqList.astro';
import GrowerCard from './story/GrowerCard.astro';
import OriginStory from './story/OriginStory.astro';
import ProcessTimeline from './story/ProcessTimeline.astro';
import StoryHero from './story/StoryHero.astro';
import UseBlock from './story/UseBlock.astro';
import { recipesUsing } from '../../content/store/recipes';
import { breadcrumbJsonLd, faqJsonLd, jsonLdString } from '../../lib/store/seo';
import { PAGE_LAYOUTS, type SectionKey } from '../../lib/store/story';
import type { StoryPageViewModel } from '../../lib/store/story-pages';
import { absolute } from '../../lib/store/urls';

interface Props { view: StoryPageViewModel; preview?: { messages: string[] } | null }
const { view: v, preview = null } = Astro.props;
const page = v.page;
const COPY = {
  turmeric: { name: 'Turmeric', accent: '#e0a53a', cards: ['Buy', 'Stone-ground turmeric'], strip: ['From field to jar', 'A year in the field'], comparison: 'Why the grinding matters', facts: "What's in turmeric" },
  rice: { name: 'Rice', accent: '#c9a86a', cards: ['Choose your rice', 'Three varieties, three characters'], strip: ['A season in the paddy', 'Monsoon to milling'], comparison: 'What polishing takes away', facts: 'Why we grow it this way' },
  spices: { name: 'Spices', accent: '#e0a53a', cards: ['Our spices', 'Ground slowly, on stone'], strip: ['', ''], comparison: '', facts: '' },
} as const;
const c = COPY[v.slug];
const shown = (k: SectionKey) => PAGE_LAYOUTS[v.slug].includes(k) && !(page.hidden as string[]).includes(k);
const from = v.storyFrom;
const attribution = from ? { name: from.product.name, path: from.product.path } : null;
const badges = [v.certificationLine, v.giBadge, ...v.heroProof].filter((b): b is string => Boolean(b));
const crumbs = [{ name: 'Home', path: '/' }, { name: c.name, path: `/${v.slug}/` }];
const schemas = [breadcrumbJsonLd(crumbs), faqJsonLd(page.faq)].filter((s): s is Record<string, unknown> => s !== null);
const recipes = from ? recipesUsing(from.product.category.slug, from.product.slug) : [];
// /spices hub: the turmeric card goes to /turmeric once it's published; other linked products are chilli.
const turmericCard = v.slug === 'spices' ? v.cards.find((x) => x.id === page.storyFromProductId) ?? null : null;
const otherCards = v.slug === 'spices' ? v.cards.filter((x) => x.id !== page.storyFromProductId) : [];
const lightKeys: SectionKey[] = ['facts', 'use', 'faq', 'note', 'closing'];
---

<SiteLayout title={page.seo.title || `${c.name} | HariLeaf`} description={page.seo.description} noIndex={Boolean(preview)}>
  <slot name="head" slot="head">
    <SEO title={page.seo.title || `${c.name} | HariLeaf`} description={page.seo.description} canonicalUrl={absolute(`/${v.slug}/`)} />
    {schemas.map((s) => <script type="application/ld+json" is:inline set:html={jsonLdString(s)} />)}
  </slot>

  <div style={`--accent:${c.accent}`}>
    {preview && (
      <div class="fixed top-0 inset-x-0 z-50 bg-[#8a6d1d] text-white text-sm px-6 py-2" role="status">
        <strong>Preview of the draft — not live.</strong>{preview.messages.length ? ` Fix before publishing: ${preview.messages.join(' · ')}` : ' Ready to publish.'}
      </div>
    )}

    <StoryHero hero={page.hero} badges={badges} ctaHref="#cards" />

    {v.slug === 'spices' ? (
      <section id="cards" class="py-16 px-6 text-white scroll-mt-24" style="background:#0c110c;" aria-label="Our spices">
        <div class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
          {turmericCard && (
            <a href={v.turmericPublished ? '/turmeric/' : turmericCard.path} class="rounded-3xl p-7 border border-white/10 bg-white/[0.04] hover:border-white/30">
              <h2 class="text-2xl font-extrabold">Turmeric</h2>
              <p class="mt-1" style="color:rgba(240,240,238,.65);">{page.cardBlurbs[String(turmericCard.id)] ?? turmericCard.shortDescription}</p>
              {v.certificationLine && <p class="mt-3 text-xs font-bold" style="color:#cfe7b7;">✓ {v.certificationLine}</p>}
              <span class="mt-4 inline-block font-extrabold" style="color:var(--accent);">{v.turmericPublished ? 'The turmeric story →' : 'Buy turmeric →'}</span>
            </a>
          )}
          {otherCards.length > 0 ? otherCards.map((x) => (
            <a href={x.path} class="rounded-3xl p-7 border border-white/10 bg-white/[0.04] hover:border-white/30">
              <h2 class="text-2xl font-extrabold">{x.name}</h2>
              <p class="mt-1" style="color:rgba(240,240,238,.65);">{page.cardBlurbs[String(x.id)] ?? x.shortDescription}</p>
            </a>
          )) : (
            <div class="rounded-3xl p-7 border border-white/10 bg-white/[0.04]"><h2 class="text-2xl font-extrabold">Red chilli</h2><p class="mt-1" style="color:rgba(240,240,238,.65);">Coming soon.</p></div>
          )}
        </div>
      </section>
    ) : (
      <CardsSection id="cards" eyebrow={c.cards[0]} heading={c.cards[1]} cards={v.cards} blurbs={page.cardBlurbs} />
    )}

    {shown('origin') && <OriginStory origin={from?.story.originStory ?? null} attribution={attribution} />}
    {shown('photo_strip') && from && <ProcessTimeline eyebrow={c.strip[0]} heading={c.strip[1]} steps={from.story.processSteps} variant={from.story.processSteps.some((s) => s.photoKey) ? 'photos' : 'list'} attribution={attribution} />}
    {shown('comparison') && <ComparisonBlock eyebrow={c.comparison} comparison={from?.story.comparison ?? null} attribution={attribution} />}
    {shown('lab_table') && <BatchLabTable columns={v.labTable.columns} rows={v.labTable.rows} />}
    {shown('growers') && v.growers.length > 0 && (
      <section class="py-12 px-6 text-white" style="background:#0c110c;" aria-labelledby="growers-heading">
        <div class="max-w-5xl mx-auto">
          <h2 id="growers-heading" class="text-3xl font-extrabold tracking-tight mb-6">Who grows it</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">{v.growers.map((g) => <GrowerCard grower={g} />)}</div>
        </div>
      </section>
    )}

    {lightKeys.some((k) => shown(k)) && (
      <div class="max-w-7xl mx-auto px-6 py-16 flex flex-col gap-12">
        {shown('facts') && <FactsBlock heading={c.facts} facts={page.facts} />}
        {shown('use') && <UseBlock use={from?.story.use ?? null} recipes={recipes} />}
        {shown('note') && page.note && <p class="max-w-3xl text-lg text-on-surface-variant">{page.note} <a href="/our-process/" class="font-bold text-primary">How we grow, mill and grind →</a></p>}
        {shown('faq') && <FaqList faq={page.faq} />}
        {shown('closing') && page.closing && <p class="text-3xl font-extrabold tracking-tight text-center">{page.closing}</p>}
      </div>
    )}
  </div>
</SiteLayout>
```

- [ ] **Step 3: Routes**

Create `src/pages/turmeric.astro`:

```astro
---
export const prerender = false;
import { env } from 'cloudflare:workers';
import StoryPageView from '../components/store/StoryPageView.astro';
import { PAGE_CACHE_CONTROL } from '../lib/store/edge-cache';
import { loadStoryPageView, type StoryPageViewModel } from '../lib/store/story-pages';

let view: StoryPageViewModel | null;
try {
  view = await loadStoryPageView(env.STORE_DB, 'turmeric', 'published', new Date());
} catch (err) {
  console.error(JSON.stringify({ msg: 'turmeric page failed', error: String(err) }));
  Astro.response.headers.set('Cache-Control', 'no-store');
  return Astro.rewrite('/store-unavailable');
}
// Until the first publish, /turmeric doesn't exist (404s are never edge-cached).
if (!view) return Astro.rewrite('/404');
Astro.response.headers.set('Cache-Control', PAGE_CACHE_CONTROL);
---
<StoryPageView view={view} />
```

Create the new `src/pages/rice.astro`:

```astro
---
export const prerender = false;
import { env } from 'cloudflare:workers';
import RiceLegacy from '../components/store/legacy/RiceLegacy.astro';
import StoryPageView from '../components/store/StoryPageView.astro';
import { listProducts, type ProductCard } from '../lib/store/catalog';
import { PAGE_CACHE_CONTROL } from '../lib/store/edge-cache';
import { loadStoryPageView, type StoryPageViewModel } from '../lib/store/story-pages';

// Rollout guard: the story page once published, today's page until then (and on D1 failure).
let view: StoryPageViewModel | null = null;
let cards: ProductCard[] = [];
let failed = false;
try {
  view = await loadStoryPageView(env.STORE_DB, 'rice', 'published', new Date());
  if (!view) cards = await listProducts(env.STORE_DB, { categorySlug: 'rice', today: new Date() });
} catch (err) {
  failed = true;
  console.error(JSON.stringify({ msg: 'rice page failed', error: String(err) }));
}
// Don't let a transient D1 error be cached as a "coming soon" page.
Astro.response.headers.set('Cache-Control', failed ? 'no-store' : PAGE_CACHE_CONTROL);
---
{view ? <StoryPageView view={view} /> : <RiceLegacy cards={cards} />}
```

Create the new `src/pages/spices.astro` with the same content. Replace `RiceLegacy`/`rice` with `SpicesLegacy`/`spices`, and use the message `'spices page failed'`.

- [ ] **Step 4: Draft preview route**

Create `src/pages/admin/preview/page/[slug].astro`:

```astro
---
export const prerender = false;
import { env } from 'cloudflare:workers';
import StoryPageView from '../../../../components/store/StoryPageView.astro';
import { validateSession } from '../../../../lib/auth';
import { checkStoryPage, fieldLabel } from '../../../../lib/store/story-claims';
import { getStoryPageRow, loadContextProducts, loadStoryPageView } from '../../../../lib/store/story-pages';

Astro.response.headers.set('Cache-Control', 'no-store');
Astro.response.headers.set('X-Robots-Tag', 'noindex');
if (!(await validateSession(env.HARILEAF_CMS, Astro.cookies))) return new Response('Unauthorised', { status: 401 });
const slug = Astro.params.slug ?? '';
const row = await getStoryPageRow(env.STORE_DB, slug);
const view = row ? await loadStoryPageView(env.STORE_DB, slug, 'draft', new Date()) : null;
if (!row || !view) return new Response('Page not found', { status: 404 });
const errors = checkStoryPage(row.slug, row.draft, await loadContextProducts(env.STORE_DB, row.draft.productIds), { completeness: true });
const messages = Object.entries(errors).map(([k, m]) => `${fieldLabel(k)}: ${m}`);
---
<StoryPageView view={view} preview={{ messages }} />
```

- [ ] **Step 5: Check**

Run: `npx astro check`
Expected: `0 errors`

Run: `npm run build`
Expected: `Complete!`

Run: `npm test 2>&1 | grep -E "Test Files|Tests "`
Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add src/components/store/StoryPageView.astro src/components/store/legacy src/pages/rice.astro src/pages/spices.astro src/pages/turmeric.astro src/pages/admin/preview/page
git commit -m "feat(store): landing pages from fixed templates; /turmeric; legacy /rice and /spices until first publish; draft preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---

## Task 14: Sitemap — story pages and lastmod

**Files:**
- Modify: `src/lib/store/feed.ts:105-122`, `src/pages/sitemap-store.xml.ts`
- Test: `tests/unit/feed.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/feed.test.ts`:

```ts
it('a duplicate extra raises the lastmod of an already-listed URL; a new extra keeps its own', () => {
  const xml = storeSitemapXml([{ product: product(), variants: [variant()], images }], [{ path: '/rice/', lastmod: '2026-10-25' }, { path: '/turmeric/', lastmod: '2026-10-21' }]);
  expect(xml.match(/<loc>https:\/\/harileaf.org\/rice\/<\/loc>/g)).toHaveLength(1);
  expect(xml).toContain('<url><loc>https://harileaf.org/rice/</loc><lastmod>2026-10-25</lastmod></url>');
  expect(xml).toContain('<url><loc>https://harileaf.org/turmeric/</loc><lastmod>2026-10-21</lastmod></url>');
  const older = storeSitemapXml([{ product: product(), variants: [variant()], images }], [{ path: '/rice/', lastmod: '2026-01-01' }]);
  expect(older).toContain('<url><loc>https://harileaf.org/rice/</loc><lastmod>2026-10-18</lastmod></url>');
});
```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `npx vitest run tests/unit/feed.test.ts`
Expected: FAIL. `/rice/` keeps `2026-10-18`.

- [ ] **Step 3: Implement**

In `feed.ts` `storeSitemapXml`, replace the line `for (const e of extra) if (!urls.some(…)) urls.push(…);` and its comment with:

```ts
  // An extra page can also be a category with products (e.g. /rice/): list it once, with the newer lastmod.
  for (const e of extra) {
    const loc = absolute(e.path);
    const hit = urls.find((u) => u.loc === loc);
    if (!hit) urls.push({ loc, lastmod: e.lastmod });
    else if (e.lastmod && (!hit.lastmod || e.lastmod > hit.lastmod)) hit.lastmod = e.lastmod;
  }
```

In `src/pages/sitemap-store.xml.ts`, load the publish dates and pass the story-page extras:

```ts
  const { results: pages } = await env.STORE_DB.prepare('SELECT slug, published_at FROM story_pages').all<{ slug: string; published_at: string | null }>();
  const published = (slug: string) => pages.find((p) => p.slug === slug)?.published_at?.slice(0, 10);
  const storyExtras = [
    // /rice and /spices always render (story page or legacy); /turmeric only once published.
    { path: '/rice/', lastmod: published('rice') },
    { path: '/spices/', lastmod: published('spices') },
    ...(published('turmeric') ? [{ path: '/turmeric/', lastmod: published('turmeric') }] : []),
  ];
```

and add `...storyExtras,` as the first items of the extras array passed to `storeSitemapXml`.

- [ ] **Step 4: Run the tests and confirm that they pass**

Run: `npx vitest run tests/unit/feed.test.ts`
Expected: PASS

Run: `npx astro check`
Expected: `0 errors`

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/feed.ts src/pages/sitemap-store.xml.ts tests/unit/feed.test.ts
git commit -m "feat(seo): sitemap lists story pages with their publish date as lastmod

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---
## Task 15: Admin — product story editor and product editor additions

**Files:**
- Create: `src/components/admin/story-ui.tsx`, `src/components/admin/ProductStoryEditor.tsx`
- Modify: `src/components/admin/ProductEditor.tsx`, `src/pages/admin/products/[id].astro`

The islands send to the API routes from Task 10, which Tasks 8–9 cover with tests. This task is verified with `astro check`, a build, and the manual check in Step 6. Task 17 adds an E2E smoke test of the story editor.

- [ ] **Step 1: Shared admin UI (`story-ui.tsx`)**

Create `src/components/admin/story-ui.tsx`:

```tsx
/** Shared bits for the story editors: field wrapper, styles, fetch helper, row reordering and the image picker. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { mediaUrl } from '../../lib/store/urls';

export const box: CSSProperties = { background: '#ebebea', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' };
export const row: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' };
export const small: CSSProperties = { fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' };
export const errStyle: CSSProperties = { color: '#c00', fontSize: '0.8rem', marginTop: '0.25rem' };
export const warnStyle: CSSProperties = { color: '#8a6d1d', fontSize: '0.8rem', marginTop: '0.25rem' };
export const btn: CSSProperties = { background: 'none', border: '1px solid rgba(0,0,0,0.2)', borderRadius: 999, padding: '0.4rem 0.9rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' };
export const h2: CSSProperties = { fontSize: '1rem', fontWeight: 800 };

export async function send(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

/** Label wraps its control (implicit association); error and warning are announced. */
export function Field(props: { label: string; error?: string; warning?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem' }}>{props.label}</span>
        {props.children}
      </label>
      {props.hint && <p style={small}>{props.hint}</p>}
      {props.error && <p style={errStyle} role="alert">{props.error}</p>}
      {props.warning && <p style={warnStyle} role="status">{props.warning}</p>}
    </div>
  );
}

/** ↑ / ↓ / ✕ for a row; keeps keyboard focus on the moved row's button. */
export function MoveButtons(props: { idPrefix: string; index: number; count: number; noun: string; onMove: (from: number, to: number) => void; onRemove: () => void }) {
  const { idPrefix, index, count, noun } = props;
  const move = (dir: -1 | 1, which: 'up' | 'down') => {
    const to = index + dir;
    if (to < 0 || to >= count) return;
    props.onMove(index, to);
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-${to}-${which}`)?.focus());
  };
  return (
    <span style={{ display: 'inline-flex', gap: '0.25rem' }}>
      <button type="button" id={`${idPrefix}-${index}-up`} style={btn} aria-label={`Move ${noun} ${index + 1} up`} disabled={index === 0} onClick={() => move(-1, 'up')}>↑</button>
      <button type="button" id={`${idPrefix}-${index}-down`} style={btn} aria-label={`Move ${noun} ${index + 1} down`} disabled={index === count - 1} onClick={() => move(1, 'down')}>↓</button>
      <button type="button" style={{ ...btn, color: '#c00' }} aria-label={`Remove ${noun} ${index + 1}`} onClick={props.onRemove}>✕</button>
    </span>
  );
}

export const moved = <T,>(xs: T[], from: number, to: number): T[] => {
  const next = [...xs];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

type LibraryPhoto = { key: string; label: string; category?: string };

/**
 * Picks an image for a story section: the photo library (R2 photos/…, served
 * from /media) or this product's own images. Uploads go to the photo library
 * with category "story". Stores the key; alt text is edited beside it.
 */
export function ImagePicker(props: {
  label: string; value: string | null; alt: string; onChange: (key: string | null, alt: string) => void;
  productImages?: Array<{ key: string; url: string; alt: string; kind: 'photo' | 'infographic' }>; error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<LibraryPhoto[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!open) return;
    fetch('/api/photos').then((r) => r.json()).then((p: LibraryPhoto[]) => setPhotos(p)).catch(() => setMsg('Could not load the photo library'));
  }, [open]);
  async function upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', props.alt || file.name);
    fd.append('category', 'story');
    setMsg('Uploading…');
    const res = await send('/api/photos', { method: 'POST', body: fd });
    if (res.ok) {
      props.onChange(String(res.data.key), props.alt);
      setOpen(false);
      setMsg('');
    } else setMsg(String(res.data.error ?? 'Upload failed'));
  }
  return (
    <div>
      <span style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem' }}>{props.label}</span>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {props.value && <img src={mediaUrl(props.value)} alt="" width={96} height={72} style={{ objectFit: 'cover', borderRadius: 8 }} />}
        <button type="button" style={btn} onClick={() => setOpen(true)}>{props.value ? 'Change photo' : 'Choose photo'}</button>
        {props.value && <button type="button" style={btn} onClick={() => props.onChange(null, '')}>Remove</button>}
      </div>
      {props.value && (
        <Field label="Describe the photo (alt text)" hint="Say what it shows, e.g. “Turmeric drying on mats in the sun”.">
          <input type="text" value={props.alt} onChange={(e) => props.onChange(props.value, e.target.value)} />
        </Field>
      )}
      {props.error && <p style={errStyle} role="alert">{props.error}</p>}
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Choose a photo" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...box, background: '#fff', width: 'min(900px, 92vw)', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>Choose a photo</strong><button type="button" style={btn} onClick={() => setOpen(false)} autoFocus>Close</button></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
              {[...(props.productImages ?? []).map((i) => ({ key: i.key, label: `${i.kind === 'infographic' ? 'Infographic · ' : ''}${i.alt}` })), ...photos].map((p) => (
                <button type="button" key={p.key} style={{ ...btn, borderRadius: 10, padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }} onClick={() => { props.onChange(p.key, props.alt || p.label); setOpen(false); }}>
                  <img src={mediaUrl(p.key)} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                  <span style={{ fontSize: '0.7rem' }}>{p.label}</span>
                </button>
              ))}
            </div>
            <Field label="Or upload a new photo (up to 8 MB)"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></Field>
            <p className="muted" aria-live="polite">{msg}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `ProductStoryEditor.tsx`**

Create `src/components/admin/ProductStoryEditor.tsx`:

```tsx
/**
 * Product story editor (spec: Admin UX → Products → Story editor). Saves to
 * PUT /api/admin/products/[id]/story. The story is live once saved, so
 * claims errors block; warnings (e.g. a proof item without a lab value) don't.
 */
import { useState } from 'react';
import { EMPTY_STORY, STORY_ICONS, labValue, type Comparison, type ProductStory, type StoryIcon } from '../../lib/store/story';
import { Field, ImagePicker, MoveButtons, box, btn, h2, moved, row, send, small } from './story-ui';

interface Props {
  productId: number;
  productName: string;
  initial: ProductStory | null;
  labKeys: string[];
  activeLab: { batchCode: string; summary: Record<string, string> } | null;
  productImages: Array<{ key: string; url: string; alt: string; kind: 'photo' | 'infographic' }>;
  howItsMade: Record<string, string>;
}

const ICON_LABELS: Record<StoryIcon, string> = { stone_mill: 'Stone mill', sun: 'Sun', lab: 'Lab', hand: 'Hand', grain: 'Grain', leaf: 'Leaf', water: 'Water', gi: 'GI star' };
const emptyComparison = (): Comparison => ({ heading: '', oursLabel: 'Ours', theirsLabel: '', rows: [{ aspect: '', ours: '', theirs: '', source: '' }, { aspect: '', ours: '', theirs: '', source: '' }], note: '', imageKey: null, imageAlt: '' });

export default function ProductStoryEditor(props: Props) {
  const [enabled, setEnabled] = useState(props.initial !== null);
  const [s, setS] = useState<ProductStory>(props.initial ?? EMPTY_STORY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const set = <K extends keyof ProductStory>(k: K, v: ProductStory[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const err = (k: string) => errors[k];

  async function save() {
    setStatus('Saving…');
    setErrors({});
    const res = await send(`/api/admin/products/${props.productId}/story`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story: enabled ? s : null }) });
    if (res.ok) {
      setWarnings((res.data.warnings as Record<string, string>) ?? {});
      setStatus('✓ Saved. Live pages refresh within a minute.');
    } else {
      setErrors((res.data.errors as Record<string, string>) ?? { _: String(res.data.error ?? 'Save failed') });
      setStatus('Not saved — check the highlighted fields');
      requestAnimationFrame(() => (document.querySelector('#story [role="alert"]') as HTMLElement | null)?.focus?.());
    }
  }

  return (
    <div id="story" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2.5rem' }}>
      <section style={box}>
        <h2 style={h2}>Story sections</h2>
        <p className="muted">Proof line, timeline, comparison, origin, grower and how to cook/use. Shown on the product page and, for the "Story from" product, on its landing page. Checked against the claims policy when you save.</p>
        <label><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> This product has story sections</label>
        {errors._ && <p className="warn" role="alert">{errors._}</p>}
        {errors._pages && <p className="warn" role="alert">{errors._pages}</p>}
      </section>

      {enabled && (
        <>
          <section style={box}>
            <h2 style={h2}>Buy box</h2>
            <p style={small}>Proof line (up to 4). Lab values are read from the active batch's lab report{props.activeLab ? ` (batch ${props.activeLab.batchCode})` : ' — no active batch with a visible report yet'}.</p>
            {s.proofLine.map((x, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '8rem 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                <Field label="Kind">
                  <select value={x.kind} onChange={(e) => set('proofLine', s.proofLine.map((y, j) => (j === i ? (e.target.value === 'lab' ? { kind: 'lab', key: props.labKeys[0] ?? '', label: props.labKeys[0] ?? '' } : { kind: 'text', text: '' }) : y)))}>
                    <option value="lab">Lab value</option><option value="text">Text</option>
                  </select>
                </Field>
                {x.kind === 'text' ? (
                  <Field label="Text" error={err(`proofLine.${i}`)}><input type="text" value={x.text} onChange={(e) => set('proofLine', s.proofLine.map((y, j) => (j === i ? { kind: 'text', text: e.target.value } : y)))} /></Field>
                ) : (
                  <Field label="Lab value" warning={warnings[`proofLine.${i}`]} hint={`Now: ${labValue(props.activeLab?.summary, x.key) ?? 'no value'}`}>
                    <select value={x.key} onChange={(e) => set('proofLine', s.proofLine.map((y, j) => (j === i ? { kind: 'lab', key: e.target.value, label: e.target.value } : y)))}>
                      {props.labKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </Field>
                )}
                {x.kind === 'lab' ? <Field label="Shown as"><input type="text" value={x.label} onChange={(e) => set('proofLine', s.proofLine.map((y, j) => (j === i && y.kind === 'lab' ? { ...y, label: e.target.value } : y)))} /></Field> : <span />}
                <MoveButtons idPrefix="proof" index={i} count={s.proofLine.length} noun="proof item" onMove={(a, b) => set('proofLine', moved(s.proofLine, a, b))} onRemove={() => set('proofLine', s.proofLine.filter((_, j) => j !== i))} />
              </div>
            ))}
            {s.proofLine.length < 4 && <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('proofLine', [...s.proofLine, { kind: 'text', text: '' }])}>+ Add proof item</button>}

            <p style={small}>Icon row (up to 3)</p>
            {s.icons.map((x, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '10rem 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                <Field label="Icon"><select value={x.icon} onChange={(e) => set('icons', s.icons.map((y, j) => (j === i ? { ...y, icon: e.target.value as StoryIcon } : y)))}>{STORY_ICONS.map((k) => <option key={k} value={k}>{ICON_LABELS[k]}</option>)}</select></Field>
                <Field label="Label" error={err(`icons.${i}`)}><input type="text" value={x.label} onChange={(e) => set('icons', s.icons.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} /></Field>
                <MoveButtons idPrefix="icon" index={i} count={s.icons.length} noun="icon" onMove={(a, b) => set('icons', moved(s.icons, a, b))} onRemove={() => set('icons', s.icons.filter((_, j) => j !== i))} />
              </div>
            ))}
            {s.icons.length < 3 && <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('icons', [...s.icons, { icon: 'leaf', label: '' }])}>+ Add icon</button>}
            <label><input type="checkbox" checked={s.showCategorySwitcher} onChange={(e) => set('showCategorySwitcher', e.target.checked)} /> Show the variety switcher (other products in this category)</label>
          </section>

          <section style={box}>
            <h2 style={h2}>Timeline</h2>
            {err('processSteps') && <p className="warn" role="alert">{err('processSteps')}</p>}
            {s.processSteps.length === 0 && Object.keys(props.howItsMade).length > 0 && (
              <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('processSteps', Object.entries(props.howItsMade).map(([title, text]) => ({ title, text, photoKey: null, photoAlt: '' })))}>Convert from “How it's made”</button>
            )}
            {s.processSteps.map((x, i) => (
              <div key={i} style={{ ...box, background: '#f6f6f3' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>Step {i + 1}</strong><MoveButtons idPrefix="step" index={i} count={s.processSteps.length} noun="step" onMove={(a, b) => set('processSteps', moved(s.processSteps, a, b))} onRemove={() => set('processSteps', s.processSteps.filter((_, j) => j !== i))} /></div>
                <div style={row}>
                  <Field label="Title" error={err(`processSteps.${i}`)}><input type="text" value={x.title} onChange={(e) => set('processSteps', s.processSteps.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} /></Field>
                  <Field label="Text"><input type="text" value={x.text} onChange={(e) => set('processSteps', s.processSteps.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} /></Field>
                </div>
                <ImagePicker label="Photo (optional)" value={x.photoKey} alt={x.photoAlt} productImages={props.productImages} error={err(`processSteps.${i}.photoKey`)} onChange={(k, a) => set('processSteps', s.processSteps.map((y, j) => (j === i ? { ...y, photoKey: k, photoAlt: a } : y)))} />
              </div>
            ))}
            {s.processSteps.length < 8 && <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('processSteps', [...s.processSteps, { title: '', text: '', photoKey: null, photoAlt: '' }])}>+ Add step</button>}
          </section>

          <section style={box}>
            <h2 style={h2}>Comparison</h2>
            <p style={small}>Describe the other process, not a competitor. Use numbers only with a source (e.g. “IFCT 2017”, “Lab report T-01”).</p>
            {!s.comparison ? (
              <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('comparison', emptyComparison())}>+ Add a comparison</button>
            ) : (
              <>
                <div style={row}>
                  <Field label="Heading" error={err('comparison') ?? err('comparison.heading')}><input type="text" value={s.comparison.heading} onChange={(e) => set('comparison', { ...s.comparison!, heading: e.target.value })} /></Field>
                  <Field label="Our column" error={err('comparison.oursLabel')}><input type="text" value={s.comparison.oursLabel} onChange={(e) => set('comparison', { ...s.comparison!, oursLabel: e.target.value })} /></Field>
                  <Field label="Their column (a process)" error={err('comparison.theirsLabel')}><input type="text" value={s.comparison.theirsLabel} onChange={(e) => set('comparison', { ...s.comparison!, theirsLabel: e.target.value })} /></Field>
                </div>
                {err('comparison.rows') && <p className="warn" role="alert">{err('comparison.rows')}</p>}
                {s.comparison.rows.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                    {(['aspect', 'ours', 'theirs', 'source'] as const).map((k) => (
                      <Field key={k} label={{ aspect: 'What', ours: 'Ours', theirs: 'Theirs', source: 'Source' }[k]} error={k === 'aspect' ? err(`comparison.rows.${i}`) : undefined}>
                        <input type="text" value={r[k]} onChange={(e) => set('comparison', { ...s.comparison!, rows: s.comparison!.rows.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)) })} />
                      </Field>
                    ))}
                    <MoveButtons idPrefix="crow" index={i} count={s.comparison!.rows.length} noun="comparison row" onMove={(a, b) => set('comparison', { ...s.comparison!, rows: moved(s.comparison!.rows, a, b) })} onRemove={() => set('comparison', { ...s.comparison!, rows: s.comparison!.rows.filter((_, j) => j !== i) })} />
                  </div>
                ))}
                {s.comparison.rows.length < 8 && <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('comparison', { ...s.comparison!, rows: [...s.comparison!.rows, { aspect: '', ours: '', theirs: '', source: '' }] })}>+ Add row</button>}
                <Field label="Note under the table" error={err('comparison.note')}><input type="text" value={s.comparison.note} onChange={(e) => set('comparison', { ...s.comparison!, note: e.target.value })} /></Field>
                <ImagePicker label="Comparison image (optional; e.g. the comparison infographic)" value={s.comparison.imageKey} alt={s.comparison.imageAlt} productImages={props.productImages} error={err('comparison.imageKey') ?? err('comparison.imageAlt')} onChange={(k, a) => set('comparison', { ...s.comparison!, imageKey: k, imageAlt: a })} />
                <button type="button" style={{ ...btn, alignSelf: 'flex-start', color: '#c00' }} onClick={() => set('comparison', null)}>Remove comparison</button>
              </>
            )}
          </section>

          <section style={box}>
            <h2 style={h2}>Origin &amp; grower</h2>
            {!s.originStory ? <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('originStory', { heading: '', bodyMd: '', photoKey: null, photoAlt: '' })}>+ Add an origin story</button> : (
              <>
                <Field label="Origin heading" error={err('originStory') ?? err('originStory.heading')}><input type="text" value={s.originStory.heading} onChange={(e) => set('originStory', { ...s.originStory!, heading: e.target.value })} /></Field>
                <Field label="Origin story (basic markdown)" error={err('originStory.bodyMd')}><textarea rows={4} value={s.originStory.bodyMd} onChange={(e) => set('originStory', { ...s.originStory!, bodyMd: e.target.value })} /></Field>
                <ImagePicker label="Origin photo" value={s.originStory.photoKey} alt={s.originStory.photoAlt} productImages={props.productImages} onChange={(k, a) => set('originStory', { ...s.originStory!, photoKey: k, photoAlt: a })} />
                <button type="button" style={{ ...btn, alignSelf: 'flex-start', color: '#c00' }} onClick={() => set('originStory', null)}>Remove origin story</button>
              </>
            )}
            {!s.grower ? <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('grower', { names: '', place: '', since: '', bodyMd: '', photoKey: null, photoAlt: '' })}>+ Add the grower</button> : (
              <>
                <p style={small}>Only with the grower's OK to be named and pictured.</p>
                <div style={row}>
                  <Field label="Names" error={err('grower')}><input type="text" value={s.grower.names} onChange={(e) => set('grower', { ...s.grower!, names: e.target.value })} /></Field>
                  <Field label="Place"><input type="text" value={s.grower.place} onChange={(e) => set('grower', { ...s.grower!, place: e.target.value })} /></Field>
                  <Field label="On this land since"><input type="text" value={s.grower.since} onChange={(e) => set('grower', { ...s.grower!, since: e.target.value })} /></Field>
                </div>
                <Field label="A few lines (basic markdown)"><textarea rows={3} value={s.grower.bodyMd} onChange={(e) => set('grower', { ...s.grower!, bodyMd: e.target.value })} /></Field>
                <ImagePicker label="Grower photo" value={s.grower.photoKey} alt={s.grower.photoAlt} productImages={props.productImages} onChange={(k, a) => set('grower', { ...s.grower!, photoKey: k, photoAlt: a })} />
                <button type="button" style={{ ...btn, alignSelf: 'flex-start', color: '#c00' }} onClick={() => set('grower', null)}>Remove grower</button>
              </>
            )}
          </section>

          <section style={box}>
            <h2 style={h2}>How to cook / use</h2>
            {!s.use ? <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('use', { kind: 'use', heading: '', steps: [''] })}>+ Add how to cook/use</button> : (
              <>
                <div style={row}>
                  <Field label="Kind"><select value={s.use.kind} onChange={(e) => set('use', { ...s.use!, kind: e.target.value === 'cook' ? 'cook' : 'use' })}><option value="cook">How to cook</option><option value="use">How to use</option></select></Field>
                  <Field label="Heading" error={err('use') ?? err('use.heading')}><input type="text" value={s.use.heading} onChange={(e) => set('use', { ...s.use!, heading: e.target.value })} /></Field>
                </div>
                {s.use.steps.map((x, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                    <Field label={`Step ${i + 1}`} error={err(`use.steps.${i}`)}><input type="text" value={x} onChange={(e) => set('use', { ...s.use!, steps: s.use!.steps.map((y, j) => (j === i ? e.target.value : y)) })} /></Field>
                    <MoveButtons idPrefix="use" index={i} count={s.use!.steps.length} noun="step" onMove={(a, b) => set('use', { ...s.use!, steps: moved(s.use!.steps, a, b) })} onRemove={() => set('use', { ...s.use!, steps: s.use!.steps.filter((_, j) => j !== i) })} />
                  </div>
                ))}
                {s.use.steps.length < 8 && <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('use', { ...s.use!, steps: [...s.use!.steps, ''] })}>+ Add step</button>}
                <button type="button" style={{ ...btn, alignSelf: 'flex-start', color: '#c00' }} onClick={() => set('use', null)}>Remove</button>
              </>
            )}
          </section>
        </>
      )}

      <div style={{ position: 'sticky', bottom: 0, background: '#f6f6f3', padding: '0.75rem 0', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button type="button" className="brand-btn" style={{ padding: '0.7rem 1.5rem' }} onClick={save}>Save story</button>
        <form method="post" action="/admin/preview/product" target="_blank">
          <input type="hidden" name="payload" value={JSON.stringify({ productId: props.productId, story: enabled ? s : null })} />
          <button type="submit" style={btn}>Preview</button>
        </form>
        <span className="muted" aria-live="polite">{status}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `ProductEditor.tsx` additions**

1. **GI section.** After the "Organic certification" `</section>`, add:
   ```tsx
      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Geographical Indication</h2>
        <p className="muted">Only if you are a registered authorised user of the GI. Without the registration number, GI wording and the registered name (e.g. “Wada Kolam”) can't be used anywhere on the product.</p>
        <div style={row}>
          <Field label="GI name" error={err('giName')}><input type="text" value={p.giName ?? ''} onChange={(e) => set('giName', e.target.value || null)} /></Field>
          <Field label="Authorised-user registration number" error={err('giAuRegNumber')}><input type="text" value={p.giAuRegNumber ?? ''} onChange={(e) => set('giAuRegNumber', e.target.value || null)} /></Field>
        </div>
      </section>
   ```
2. **Claim picker.** In the process-claims rows (line ~235), change the code input to use a datalist, and add the datalist once after the rows:
   ```tsx
                <input type="text" list="claim-codes" aria-label="Claim type" placeholder="claim type (traditional, stone_ground…)" value={c.code} onChange={(e) => set('processClaims', p.processClaims.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} />
   ```
   ```tsx
            <datalist id="claim-codes">
              {['traditional', 'natural', 'pure', 'authentic', 'unpolished', 'stone_ground', 'sun_cured', 'hand_harvested', 'sun_dried', 'no_synthetic_inputs', 'single_pass_milled'].map((c) => <option key={c} value={c} />)}
            </datalist>
            <p style={small}>“traditional”, “natural”, “pure”… may appear in copy only with a claim of that type and an evidence note (e.g. “Village records: used for 35+ years”).</p>
   ```
3. **Photo / Infographic toggle.** In `Images`, inside each `figcaption`, before the buttons row, add:
   ```tsx
              <select aria-label="Image type" defaultValue={img.kind} onChange={(e) => send(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId: img.id, kind: e.target.value }) })}>
                <option value="photo">Photo</option><option value="infographic">Infographic</option>
              </select>
              {img.kind === 'infographic' && <p style={small}>Describe what the image says in a full sentence. Every fact in this image must also appear in the page's sections.</p>}
   ```
4. **Labelled lab rows.** In `Batches`:
   - Add `categorySlug: string` to its props, and pass `categorySlug={p.categorySlug}` where `<Batches …>` is rendered.
   - Replace the `summary` state default and the "Results (JSON…)" `<Field>` with labelled rows. `LAB_KEYS` comes from `../../lib/store/story`.
   ```tsx
     const [results, setResults] = useState<Array<[string, string]>>(() => (LAB_KEYS[props.categorySlug] ?? []).map((k) => [k, '']));
   ```
   ```tsx
        <fieldset style={{ border: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <legend style={{ fontWeight: 700, fontSize: '0.85rem' }}>Results (name → value with units)</legend>
          {results.map(([k, val], i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
              <input type="text" list="lab-keys" aria-label={`Result ${i + 1} name`} value={k} onChange={(e) => setResults(results.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
              <input type="text" aria-label={`Result ${i + 1} value`} placeholder="e.g. 5.1 %" value={val} onChange={(e) => setResults(results.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
              <button type="button" style={btn} aria-label={`Remove result ${i + 1}`} onClick={() => setResults(results.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <datalist id="lab-keys">{(LAB_KEYS[props.categorySlug] ?? []).map((k) => <option key={k} value={k} />)}</datalist>
          <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => setResults([...results, ['', '']])}>+ Add result</button>
          <input type="hidden" name="summary" value={JSON.stringify(Object.fromEntries(results.filter(([k, val]) => k.trim() && val.trim()).map(([k, val]) => [k.trim(), val.trim()])))} />
        </fieldset>
   ```
   - Remove `summary` from the `lab` state object.

   The stored shape is unchanged: the form still posts a JSON `summary` field.

- [ ] **Step 4: Mount the story editor**

In `src/pages/admin/products/[id].astro`:
- Add the imports:
  ```ts
  import ProductStoryEditor from '../../../components/admin/ProductStoryEditor';
  import { LAB_KEYS } from '../../../lib/store/story';
  ```
- Declare `let storyProps: Parameters<typeof ProductStoryEditor>[0] | null = null;` next to `props`.
- In the `else` branch where `props` is built, add:
  ```ts
      const activeReport = activeBatch?.lab_report_id ? a.labReports.find((l) => l.id === activeBatch.lab_report_id && l.visible === 1) : undefined;
      let summary: Record<string, string> = {};
      try { summary = activeReport ? JSON.parse(activeReport.summary) : {}; } catch { summary = {}; }
      storyProps = {
        productId: p.id,
        productName: p.name,
        initial: p.story,
        labKeys: LAB_KEYS[p.category.slug] ?? [],
        activeLab: activeReport && activeBatch ? { batchCode: activeBatch.batch_code, summary } : null,
        productImages: a.images.map((i) => ({ key: i.r2_key, url: mediaUrl(i.r2_key), alt: i.alt, kind: i.kind })),
        howItsMade: p.howItsMade,
      };
  ```
- Render it after the product editor: `{storyProps && <ProductStoryEditor client:load {...storyProps} />}`.

`a.labReports` rows carry `visible`, and `a.batches` carry `lab_report_id`, as selected in `getProductForAdmin`.

- [ ] **Step 5: Check**

Run: `npx astro check`
Expected: `0 errors`

Run: `npm run build`
Expected: `Complete!`

- [ ] **Step 6: Manual check**

1. Run `node e2e/setup-db.mjs && E2E=1 npm run dev`, then open `http://localhost:4321/admin/products/2` and sign in with `ADMIN_PASSPHRASE` from `.dev.vars`. Locally Access isn't configured, so the passphrase session is enough.
2. Tick "This product has story sections" and add three timeline steps. Use "Traditionally boiled" in one of them.
3. Save. Expect the step error "Remove or substantiate: traditional…".
4. Change it to "Boiled", save, and expect "✓ Saved".
5. Click Preview. Expect a new tab with the timeline and the yellow "Preview — not live" banner.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/story-ui.tsx src/components/admin/ProductStoryEditor.tsx src/components/admin/ProductEditor.tsx src/pages/admin/products/[id].astro
git commit -m "feat(admin): product story editor; GI fields, claim-type picker, photo/infographic toggle, labelled lab results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---

## Task 16: Admin — Pages section

**Files:**
- Modify: `src/layouts/AdminLayout.astro`
- Create: `src/pages/admin/pages/index.astro`, `src/pages/admin/pages/[slug].astro`, `src/components/admin/StoryPageEditor.tsx`

- [ ] **Step 1: Nav item**

In `AdminLayout.astro`:
- Add `'pages'` to `AdminSection`, after `'products'`.
- In `nav`, after the Products entry, add `{ key: 'pages', label: 'Pages', href: '/admin/pages' },`.

- [ ] **Step 2: Pages list**

Create `src/pages/admin/pages/index.astro`:

```astro
---
export const prerender = false;
import { env } from 'cloudflare:workers';
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { validateSession } from '../../../lib/auth';
import { listStoryPages, type PageStatus } from '../../../lib/store/story-pages';

const authenticated = await validateSession(env.HARILEAF_CMS, Astro.cookies);
const pages = authenticated ? await listStoryPages(env.STORE_DB) : [];
const NAMES = { rice: 'Rice', turmeric: 'Turmeric', spices: 'Spices hub' } as const;
const STATUS: Record<PageStatus, [string, string]> = { never: ['Never published', '#8a6d1d'], published: ['Published', '#196a5e'], changed: ['Unpublished changes', '#b35a00'] };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '—');
---
<AdminLayout title="Pages" active="pages">
  <p class="muted" style="margin-bottom:1.25rem;">Landing pages with fixed layouts. Edit the words and photos, preview the draft, then publish. Story sections (timeline, comparison, origin, grower, how to cook/use) are edited on the "Story from" product.</p>
  <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
    <thead><tr style="text-align:left;"><th>Page</th><th>Status</th><th>Last saved</th><th>Last published</th><th></th></tr></thead>
    <tbody>
      {pages.map((p) => (
        <tr style="border-top:1px solid rgba(0,0,0,0.08);">
          <td style="padding:0.6rem 0;font-weight:700;">{NAMES[p.slug]}</td>
          <td><span style={`color:${STATUS[p.status][1]};font-weight:700;`}>{STATUS[p.status][0]}</span></td>
          <td>{fmt(p.draftSavedAt)}</td>
          <td>{fmt(p.publishedAt)}</td>
          <td style="text-align:right;"><a href={`/admin/pages/${p.slug}`} style="color:#196a5e;font-weight:700;">Edit</a>{p.publishedAt && <> · <a href={`/${p.slug}/`} target="_blank" style="color:#196a5e;font-weight:700;">View live</a></>}</td>
        </tr>
      ))}
    </tbody>
  </table>
</AdminLayout>
```

- [ ] **Step 3: Page editor shell**

Create `src/pages/admin/pages/[slug].astro`:

```astro
---
export const prerender = false;
import { env } from 'cloudflare:workers';
import StoryPageEditor from '../../../components/admin/StoryPageEditor';
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { validateSession } from '../../../lib/auth';
import { activeLabSummaries } from '../../../lib/store/catalog';
import { listProductsForAdmin } from '../../../lib/store/catalog-admin';
import { LAB_KEYS, PAGE_LAYOUTS } from '../../../lib/store/story';
import { getStoryPageRow, listStoryPages, loadContextProducts } from '../../../lib/store/story-pages';

const authenticated = await validateSession(env.HARILEAF_CMS, Astro.cookies);
const slug = Astro.params.slug ?? '';
let props: Parameters<typeof StoryPageEditor>[0] | null = null;
if (authenticated) {
  const row = await getStoryPageRow(env.STORE_DB, slug);
  if (row) {
    const category = row.slug === 'rice' ? 'rice' : 'spices';
    const all = (await listProductsForAdmin(env.STORE_DB)).filter((p) => p.categorySlug === category && p.status !== 'discontinued');
    const ctx = await loadContextProducts(env.STORE_DB, all.map((p) => p.id));
    const labs = await activeLabSummaries(env.STORE_DB, all.map((p) => p.id));
    const status = (await listStoryPages(env.STORE_DB)).find((p) => p.slug === row.slug)?.status ?? 'never';
    props = {
      slug: row.slug,
      draft: row.draft,
      status,
      layout: PAGE_LAYOUTS[row.slug],
      products: all.map((p) => ({ id: p.id, name: p.name, status: p.status, hasStory: Boolean(ctx.find((c) => c.id === p.id)?.story) })),
      labByProduct: Object.fromEntries([...labs].map(([id, s]) => [String(id), Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'string')) as Record<string, string>])),
      labKeys: LAB_KEYS[category] ?? [],
    };
  } else Astro.response.status = 404;
}
---
<AdminLayout title={props ? `Page: /${props.slug}` : 'Page'} active="pages">
  <p style="margin-bottom:1rem;"><a href="/admin/pages" style="color:#196a5e;font-weight:700;">← All pages</a></p>
  {!props && authenticated && <p class="warn">Page not found.</p>}
  {props && <StoryPageEditor client:load {...props} />}
</AdminLayout>
```

- [ ] **Step 4: `StoryPageEditor.tsx`**

Create `src/components/admin/StoryPageEditor.tsx`:

```tsx
/**
 * Landing-page editor (spec: Admin UX → Pages). Fixed layout: only the fields
 * this page's layout uses are shown; sections can be hidden, not added or
 * reordered. Save draft (structure only; warnings), Preview (saves, then opens
 * the draft), Publish (full checks).
 */
import { useState } from 'react';
import type { PageStatus } from '../../lib/store/story-pages';
import { HIDEABLE_SECTIONS, type HideableSection, type SectionKey, type StoryPage } from '../../lib/store/story';
import { Field, ImagePicker, MoveButtons, box, btn, h2, moved, row, send, small } from './story-ui';

interface Props {
  slug: 'rice' | 'turmeric' | 'spices';
  draft: StoryPage;
  status: PageStatus;
  layout: SectionKey[];
  products: Array<{ id: number; name: string; status: string; hasStory: boolean }>;
  labByProduct: Record<string, Record<string, string>>;
  labKeys: string[];
}

const SECTION_NAMES: Record<SectionKey, string> = {
  hero: 'Hero', cards: 'Product cards', origin: 'Origin story', photo_strip: 'Photo strip (timeline)', comparison: 'Comparison', lab_table: 'Batch lab table',
  growers: 'Who grows it', facts: 'Facts', use: 'How to cook / use', faq: 'FAQ', note: 'Stone-grinding note', closing: 'Closing line',
};
const FROM_PRODUCT: SectionKey[] = ['origin', 'photo_strip', 'comparison', 'use', 'growers'];
const STATUS_TEXT: Record<PageStatus, string> = { never: 'Never published', published: 'Published', changed: 'Unpublished changes' };

export default function StoryPageEditor(props: Props) {
  const [d, setD] = useState<StoryPage>(props.draft);
  const [status, setStatus] = useState<PageStatus>(props.status);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const set = <K extends keyof StoryPage>(k: K, v: StoryPage[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const hero = <K extends keyof StoryPage['hero']>(k: K, v: StoryPage['hero'][K]) => setD((prev) => ({ ...prev, hero: { ...prev.hero, [k]: v } }));
  const uses = (k: SectionKey) => props.layout.includes(k);
  const name = (id: number | null) => props.products.find((p) => p.id === id)?.name ?? '—';
  const note = (k: string) => ({ error: errors[k], warning: warnings[k] });

  async function saveDraft(): Promise<boolean> {
    setMsg('Saving…');
    setErrors({});
    const res = await send(`/api/admin/pages/${props.slug}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: d }) });
    if (!res.ok) {
      setErrors((res.data.errors as Record<string, string>) ?? { _: String(res.data.error ?? 'Save failed') });
      setMsg('Not saved — check the highlighted fields');
      return false;
    }
    const w = (res.data.warnings as Record<string, string>) ?? {};
    setWarnings(w);
    if (status === 'published') setStatus('changed');
    const n = Object.keys(w).length;
    setMsg(n ? `Saved — ${n} thing${n === 1 ? '' : 's'} to fix before publishing.` : 'Saved — ready to publish.');
    return true;
  }
  async function preview() {
    if (await saveDraft()) window.open(`/admin/preview/page/${props.slug}`, '_blank');
  }
  async function publish() {
    if (!(await saveDraft())) return;
    const res = await send(`/api/admin/pages/${props.slug}/publish`, { method: 'POST' });
    if (res.ok) {
      setStatus('published');
      setErrors({});
      setMsg('✓ Published. The live page refreshes within a minute.');
    } else {
      setErrors((res.data.errors as Record<string, string>) ?? { _: String(res.data.error ?? 'Not published') });
      setMsg('Not published — fix the highlighted fields');
    }
  }

  const linked = d.productIds;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '5rem' }}>
      <p><strong>{STATUS_TEXT[status]}</strong> · <a href={`/${props.slug}/`} target="_blank" style={{ color: '#196a5e', fontWeight: 700 }}>/{props.slug}</a></p>
      {(errors._ || Object.keys(errors).length > 0) && (
        <div className="warn" role="alert"><strong>Please fix:</strong><ul style={{ margin: '0.5rem 0 0 1.25rem' }}>{Object.entries(errors).map(([k, m]) => <li key={k}>{m}</li>)}</ul></div>
      )}

      <section style={box}>
        <h2 style={h2}>Search appearance</h2>
        <Field label={`Title (${d.seo.title.length}/70)`} {...note('seo.title')}><input type="text" value={d.seo.title} onChange={(e) => set('seo', { ...d.seo, title: e.target.value })} /></Field>
        <Field label={`Description (${d.seo.description.length}/170)`} {...note('seo.description')}><textarea rows={2} value={d.seo.description} onChange={(e) => set('seo', { ...d.seo, description: e.target.value })} /></Field>
      </section>

      <section style={box}>
        <h2 style={h2}>Hero</h2>
        <div style={row}>
          <Field label="Eyebrow" {...note('hero.eyebrow')}><input type="text" value={d.hero.eyebrow} onChange={(e) => hero('eyebrow', e.target.value)} /></Field>
          <Field label="Headline line 1" {...note('hero.line1')}><input type="text" value={d.hero.line1} onChange={(e) => hero('line1', e.target.value)} /></Field>
          <Field label="Headline line 2" {...note('hero.line2')}><input type="text" value={d.hero.line2} onChange={(e) => hero('line2', e.target.value)} /></Field>
        </div>
        <Field label="Subtitle" {...note('hero.subtitle')}><textarea rows={2} value={d.hero.subtitle} onChange={(e) => hero('subtitle', e.target.value)} /></Field>
        <Field label="Button label" {...note('hero.ctaLabel')}><input type="text" value={d.hero.ctaLabel} onChange={(e) => hero('ctaLabel', e.target.value)} /></Field>
        <ImagePicker label="Hero photo (optional)" value={d.hero.photoKey} alt={d.hero.photoAlt} error={errors['hero.photoKey'] ?? errors.hero} onChange={(k, a) => setD((prev) => ({ ...prev, hero: { ...prev.hero, photoKey: k, photoAlt: a } }))} />
        {props.slug !== 'spices' && (
          <>
            <p style={small}>Lab proof in the hero (up to 2), read from a product's active batch.</p>
            {d.hero.proof.map((x, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                <Field label="Product"><select value={x.productId} onChange={(e) => hero('proof', d.hero.proof.map((y, j) => (j === i ? { ...y, productId: Number(e.target.value) } : y)))}>{linked.map((id) => <option key={id} value={id}>{name(id)}</option>)}</select></Field>
                <Field label="Lab value" hint={`Now: ${props.labByProduct[String(x.productId)]?.[x.key] ?? 'no value'}`}><select value={x.key} onChange={(e) => hero('proof', d.hero.proof.map((y, j) => (j === i ? { ...y, key: e.target.value, label: e.target.value } : y)))}>{props.labKeys.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
                <Field label="Shown as" {...note(`hero.proof.${i}`)}><input type="text" value={x.label} onChange={(e) => hero('proof', d.hero.proof.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} /></Field>
                <MoveButtons idPrefix="hproof" index={i} count={d.hero.proof.length} noun="hero proof item" onMove={(a, b) => hero('proof', moved(d.hero.proof, a, b))} onRemove={() => hero('proof', d.hero.proof.filter((_, j) => j !== i))} />
              </div>
            ))}
            {d.hero.proof.length < 2 && linked.length > 0 && <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => hero('proof', [...d.hero.proof, { productId: linked[0], key: props.labKeys[0] ?? '', label: props.labKeys[0] ?? '' }])}>+ Add lab proof</button>}
          </>
        )}
      </section>

      <section style={box}>
        <h2 style={h2}>Products</h2>
        <p style={small}>These products decide what wording is allowed on this page. Sections from the “Story from” product are edited on that product.</p>
        {errors.productIds && <p className="warn" role="alert">{errors.productIds}</p>}
        {warnings.productIds && <p style={small} role="status">{warnings.productIds}</p>}
        {linked.map((id, i) => (
          <div key={id} style={{ ...box, background: '#f6f6f3' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
              <strong>{name(id)}</strong>
              <label><input type="radio" name="story-from" checked={d.storyFromProductId === id} onChange={() => set('storyFromProductId', id)} /> {props.slug === 'spices' ? 'Turmeric card' : 'Story from'}</label>
              <MoveButtons idPrefix="prod" index={i} count={linked.length} noun="product" onMove={(a, b) => set('productIds', moved(linked, a, b))} onRemove={() => setD((prev) => ({ ...prev, productIds: prev.productIds.filter((x) => x !== id), storyFromProductId: prev.storyFromProductId === id ? null : prev.storyFromProductId }))} />
            </div>
            <Field label="Card blurb (one line)" {...note(`cardBlurbs.${id}`)}><input type="text" value={d.cardBlurbs[String(id)] ?? ''} onChange={(e) => set('cardBlurbs', { ...d.cardBlurbs, [String(id)]: e.target.value })} /></Field>
          </div>
        ))}
        {(errors.storyFromProductId || warnings.storyFromProductId) && <p className="warn" role="alert">{errors.storyFromProductId ?? warnings.storyFromProductId}</p>}
        <Field label="Add a product">
          <select value="" onChange={(e) => e.target.value && set('productIds', [...linked, Number(e.target.value)])}>
            <option value="">Choose…</option>
            {props.products.filter((p) => !linked.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.status !== 'active' ? ` (${p.status})` : ''}</option>)}
          </select>
        </Field>
      </section>

      <section style={box}>
        <h2 style={h2}>Page sections</h2>
        {props.layout.filter((k) => k !== 'hero' && k !== 'cards').map((k) => (
          <div key={k} style={{ ...box, background: '#f6f6f3' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{SECTION_NAMES[k]}</strong>
              {(HIDEABLE_SECTIONS as readonly string[]).includes(k) && (
                <label><input type="checkbox" checked={d.hidden.includes(k as HideableSection)} onChange={(e) => set('hidden', e.target.checked ? [...d.hidden, k as HideableSection] : d.hidden.filter((h) => h !== k))} /> Hide</label>
              )}
            </div>
            {FROM_PRODUCT.includes(k) && (
              <p style={small}>
                {d.storyFromProductId
                  ? <>Comes from <strong>{name(d.storyFromProductId)}</strong>{props.products.find((p) => p.id === d.storyFromProductId)?.hasStory ? '' : ' (no story yet)'} — <a href={`/admin/products/${d.storyFromProductId}#story`} style={{ color: '#196a5e', fontWeight: 700 }}>Edit on the product →</a></>
                  : 'Choose the “Story from” product above.'}
              </p>
            )}
            {k === 'lab_table' && (
              <Field label="Columns (lab result names, comma-separated)" {...note('labColumns')} hint={`Suggested: ${props.labKeys.join(', ')}`}>
                <input type="text" value={d.labColumns.join(', ')} onChange={(e) => set('labColumns', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
              </Field>
            )}
            {k === 'facts' && (
              <>
                {d.facts.map((f, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.5rem', alignItems: 'end' }}>
                    <Field label={`Fact ${i + 1} title`} {...note(`facts.${i}`)}><input type="text" value={f.title} onChange={(e) => set('facts', d.facts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></Field>
                    <Field label="Text"><input type="text" value={f.text} onChange={(e) => set('facts', d.facts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} /></Field>
                    <MoveButtons idPrefix="fact" index={i} count={d.facts.length} noun="fact" onMove={(a, b) => set('facts', moved(d.facts, a, b))} onRemove={() => set('facts', d.facts.filter((_, j) => j !== i))} />
                  </div>
                ))}
                {d.facts.length < 6 && <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('facts', [...d.facts, { title: '', text: '' }])}>+ Add fact</button>}
              </>
            )}
            {k === 'faq' && (
              <>
                {d.faq.map((f, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.5rem', alignItems: 'end' }}>
                    <Field label={`Question ${i + 1}`} {...note(`faq.${i}`)}><input type="text" value={f.q} onChange={(e) => set('faq', d.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} /></Field>
                    <Field label="Answer"><input type="text" value={f.a} onChange={(e) => set('faq', d.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} /></Field>
                    <MoveButtons idPrefix="faq" index={i} count={d.faq.length} noun="question" onMove={(a, b) => set('faq', moved(d.faq, a, b))} onRemove={() => set('faq', d.faq.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('faq', [...d.faq, { q: '', a: '' }])}>+ Add question</button>
              </>
            )}
            {k === 'note' && <Field label="Note" {...note('note')}><textarea rows={2} value={d.note} onChange={(e) => set('note', e.target.value)} /></Field>}
            {k === 'closing' && <Field label="Closing line" {...note('closing')}><input type="text" value={d.closing} onChange={(e) => set('closing', e.target.value)} /></Field>}
          </div>
        ))}
      </section>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#f6f6f3', borderTop: '1px solid rgba(0,0,0,0.1)', padding: '0.75rem 1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center', zIndex: 40 }}>
        <button type="button" style={btn} onClick={saveDraft}>Save draft</button>
        <button type="button" style={btn} onClick={preview}>Preview</button>
        <button type="button" className="brand-btn" style={{ padding: '0.6rem 1.4rem' }} onClick={publish}>Publish</button>
        <span className="muted" aria-live="polite">{msg}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Check**

Run: `npx astro check`
Expected: `0 errors`

Run: `npm run build`
Expected: `Complete!`

- [ ] **Step 6: Manual check (dev server as in Task 15)**

1. Open `/admin/pages`. Expect three rows marked "Never published".
2. Open Turmeric. Add "Stone-Ground Turmeric Powder", choose it as Story from, and type "Boosts immunity" in Subtitle.
3. Click Save draft. Expect "Saved — … to fix before publishing" and a warning under Subtitle.
4. Click Publish. Expect "Not published" with the immunity message.
5. Clear the subtitle and fill in the SEO title and description. Publish again and expect "✓ Published".
6. Open `/turmeric/` and expect the page to render.

- [ ] **Step 7: Commit**

```bash
git add src/layouts/AdminLayout.astro src/pages/admin/pages src/components/admin/StoryPageEditor.tsx
git commit -m "feat(admin): Pages section — list, fixed-layout editor with save draft, preview and publish

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---
## Task 17: E2E seed, specs and Lighthouse

**Files:**
- Create: `scripts/seed-dev-story.sql`
- Modify: `e2e/setup-db.mjs`, `e2e/storefront.spec.ts`, `lighthouserc.json`, `.github/workflows/ci.yml` (Lighthouse seed step)

- [ ] **Step 1: Write the failing E2E specs**

Append to `e2e/storefront.spec.ts`:

```ts
test('the turmeric story page shows the proof, the comparison and the batch lab table; the hub links to it', async ({ page }) => {
  await page.goto('/turmeric/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Haldi the slow way.');
  await expect(page.getByText('Certified organic (PGS-India Organic)').first()).toBeVisible();
  await expect(page.getByText('Curcumin 5.1 %').first()).toBeVisible();
  await expect(page.getByRole('table', { name: /compared with High-speed mill/ })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Lab results per batch' })).toContainText('5.1 %');
  await page.goto('/spices/');
  await page.getByRole('link', { name: /The turmeric story/ }).first().click();
  await expect(page).toHaveURL(/\/turmeric\/$/);
});

test('the turmeric product page shows the proof line, the timeline and the comparison, and links to the story', async ({ page }) => {
  await page.goto('/spices/turmeric-powder');
  await expect(page.locator('[data-proof-line]')).toContainText('Curcumin 5.1 %');
  await expect(page.getByRole('heading', { name: 'How our Stone-Ground Turmeric Powder is made' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How our Stone-Ground Turmeric Powder is made' }).locator('xpath=following-sibling::ol[1]/li')).toHaveCount(3);
  await expect(page.getByRole('table', { name: /compared with High-speed mill/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'The turmeric story →' })).toHaveAttribute('href', '/turmeric/');
});

test('legacy /rice renders until its story page is published, without GI wording', async ({ page }) => {
  await page.goto('/rice/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Rice with the bran');
  await expect(page.locator('body')).not.toContainText(/GI-tagged|Wada Kolam/i);
});
```

- [ ] **Step 2: Run them and confirm that they fail**

Warm the server first (see Conventions), then run `npx playwright test e2e/storefront.spec.ts -g "turmeric|legacy /rice"`.
Expected:
- The two turmeric specs FAIL: `/turmeric/` is a 404, and the product has no story.
- The legacy `/rice` spec passes already.

- [ ] **Step 3: Seed a story and published pages for dev and E2E**

Create `scripts/seed-dev-story.sql`. Every statement in it is safe to re-run.

```sql
-- Story sections for the dev turmeric product (id 2) and published /turmeric and /spices pages.
-- Made-up values. Never run with --remote.
UPDATE products SET
  organic_scheme = 'pgs_organic', organic_cert_number = 'PGS-DEV-1',
  process_claims = json('[{"code":"stone_ground","text":"Stone-ground slowly","evidence_note":"Mill log (dev)"}]'),
  story = json('{"proofLine":[{"kind":"lab","key":"Curcumin","label":"Curcumin"},{"kind":"text","text":"Lab-tested every batch"}],"icons":[{"icon":"stone_mill","label":"Stone-ground cool"},{"icon":"sun","label":"Boiled and sun-cured"},{"icon":"lab","label":"Batch lab report"}],"showCategorySwitcher":false,"originStory":null,"processSteps":[{"title":"Dug by hand","text":"After about nine months, when the leaves dry.","photoKey":null,"photoAlt":""},{"title":"Boiled and sun-cured","text":"Then dried in the sun for about three weeks.","photoKey":null,"photoAlt":""},{"title":"Stone-ground slowly","text":"So the powder stays cool and keeps its oils.","photoKey":null,"photoAlt":""}],"comparison":{"heading":"Stone-ground vs industrial","oursLabel":"Ours · stone mill","theirsLabel":"High-speed mill","rows":[{"aspect":"Heat","ours":"Slow, stays cool","theirs":"Friction heats the powder","source":""},{"aspect":"Aroma","ours":"Earthy, warm","theirs":"Mostly colour","source":""}],"note":"","imageKey":null,"imageAlt":""},"grower":{"names":"HariLeaf farm team","place":"Maharashtra","since":"","bodyMd":"","photoKey":null,"photoAlt":""},"use":{"kind":"use","heading":"How to use","steps":["A pinch in dal or sabzi","Warm milk with a spoon of haldi"]}}')
WHERE id = 2;

INSERT OR IGNORE INTO lab_reports (id, product_id, batch_code, tested_on, lab_name, lab_accreditation, test_scope, summary, visible) VALUES
 (2, 2, 'TP-2610', '2026-10-14', 'Sample Lab (dev)', 'NABL TC-0000', 'Curcumin, volatile oil, moisture', '{"Curcumin":"5.1 %","Volatile oil":"4.2 %","Moisture":"8 %"}', 1);
-- UNIQUE (product_id, batch_code) makes the insert idempotent; batches_one_active allows one active batch, so switch in two steps.
INSERT OR IGNORE INTO batches (product_id, batch_code, packed_on, ground_or_milled_on, lab_report_id, active) VALUES (2, 'TP-2610', '2026-10-12', '2026-10-10', 2, 0);
UPDATE batches SET active = 0 WHERE product_id = 2;
UPDATE batches SET active = 1 WHERE product_id = 2 AND batch_code = 'TP-2610';

UPDATE story_pages SET
  draft = json('{"seo":{"title":"Stone-Ground Turmeric Powder (Haldi), Sun-Cured | HariLeaf","description":"Turmeric boiled, sun-cured and ground slowly on stone, every batch lab-tested."},"hero":{"eyebrow":"HariLeaf turmeric","line1":"Haldi the slow way.","line2":"Boiled, sun-cured, stone-ground.","subtitle":"Certified organic turmeric from our farm.","ctaLabel":"Buy turmeric","photoKey":null,"photoAlt":"","proof":[{"productId":2,"key":"Curcumin","label":"Curcumin"}]},"productIds":[2],"storyFromProductId":2,"cardBlurbs":{},"labColumns":["Curcumin","Volatile oil","Moisture"],"facts":[{"title":"Curcumin","text":"The pigment that gives haldi its colour."}],"faq":[{"q":"Why is it less bright than store turmeric?","a":"It is ground slowly from whole cured rhizomes."}],"note":"","closing":"","hidden":[]}'),
  draft_saved_at = '2026-10-20T00:00:00.000Z'
WHERE slug = 'turmeric';
UPDATE story_pages SET published = draft, published_at = '2026-10-20T00:00:00.000Z' WHERE slug = 'turmeric';

UPDATE story_pages SET
  draft = json('{"seo":{"title":"Stone-Ground Spices | HariLeaf","description":"Turmeric and red chilli, ground slowly on stone."},"hero":{"eyebrow":"HariLeaf spices","line1":"Spices ground slowly, on stone.","line2":"","subtitle":"","ctaLabel":"","photoKey":null,"photoAlt":"","proof":[]},"productIds":[2],"storyFromProductId":2,"cardBlurbs":{},"labColumns":[],"facts":[],"faq":[],"note":"Both are ground slowly so they keep their aroma.","closing":"","hidden":[]}'),
  draft_saved_at = '2026-10-20T00:00:00.000Z'
WHERE slug = 'spices';
UPDATE story_pages SET published = draft, published_at = '2026-10-20T00:00:00.000Z' WHERE slug = 'spices';
```

In `e2e/setup-db.mjs`, after the `seed-dev-produce.sql` line, add:

```js
// Story sections for the turmeric product and published /turmeric and /spices pages (safe to re-run).
run('execute harileaf-store --local --file scripts/seed-dev-story.sql');
```

In `.github/workflows/ci.yml`, in the Lighthouse "Seed local D1 for the built Worker" step, add this line after the `seed-dev-produce.sql` one:

```yaml
          npx wrangler d1 execute harileaf-store --local --persist-to .wrangler/lhci --file scripts/seed-dev-story.sql
```

- [ ] **Step 4: Lighthouse covers `/turmeric/`**

In `lighthouserc.json`:
- Add `"http://localhost:8787/turmeric/"` to `ci.collect.url`.
- Change the second matrix pattern to `"/(shop/|rice/karjat-3|produce/kesar-mango|recipes/konkan-masoor-khichdi/|turmeric/)$"`.

- [ ] **Step 5: Run the E2E suite**

Run: `node e2e/setup-db.mjs`, then warm the dev server (Conventions), then `npm run test:e2e`.
Expected: every spec passes (the existing 17, plus 3 new; 3 skipped as before). The CSP-violation `afterEach` stays green.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-dev-story.sql e2e/setup-db.mjs e2e/storefront.spec.ts lighthouserc.json .github/workflows/ci.yml
git commit -m "test(e2e): turmeric story page, product story sections, legacy /rice; Lighthouse covers /turmeric

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP"
```

---

## Task 18: Final verification, push and pull request

- [ ] **Step 1: Run every check**

```bash
npx astro check            # expect: 0 errors
npm test                   # expect: all test files pass (baseline from Task 0 plus story, story-claims, story-pages and the new cases)
npm run build              # expect: Complete!
npm run check:e2e          # expect: no output (type-checks e2e)
npm run test:e2e           # expect: all pass (warm the server first)
```

- [ ] **Step 2: Spec checks by hand**

Run: `grep -rn -i "wada kolam\|GI-tagged" src --include=*.astro --include=*.ts --include=*.tsx | grep -v -E "claims.ts|GI_MESSAGE|story-claims|test"`
Expected: no shopper-visible hits. Only the claims word list and admin hint text may name them.

Run: `git diff origin/main --stat -- src/lib/store/seo.ts`
Expected: no changes (product JSON-LD unchanged, a spec non-goal).

- [ ] **Step 3: Push and open the PR**

```bash
git push origin feat/rice-turmeric-pages
gh pr create --base main --head feat/rice-turmeric-pages --draft \
  --title "Store: rice & turmeric story pages, /turmeric, admin Pages" \
  --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-10-20-rice-turmeric-pages-design.md (plan: docs/superpowers/plans/2026-10-20-rice-turmeric-pages.md).

- Product story sections (proof line, icons, timeline, comparison, origin, grower, how to cook/use) edited in a new story editor on each product; claims-checked on save
- New /turmeric landing page, reworked /rice and /spices hub from fixed templates, edited in a new admin **Pages** section (save draft → preview → publish)
- GI rule: GI wording and "Wada Kolam" only with an authorised-user registration number; photo/infographic image kind; /turmeric edge-cached and purged with spices; sitemap lastmod from publish dates
- Migration 0008 (products.story, gi_name, gi_au_reg_number, product_images.kind, story_pages)
- Rollout guard: /rice and /spices keep today's pages until first publish; /turmeric is 404 until published

Owner inputs still needed before publishing: lab report values, PGS certificate number, grower details, sources for rice nutrient numbers, lawyer's OK on "Kolam rice from Wada".

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01KafsfrEtW3LuJG93YcHNVP
EOF
)"
```

Expected: the PR URL is printed and CI starts: Type-check & Build, Storefront end-to-end, Lighthouse.

- [ ] **Step 4: Wait for CI**

Run: `gh pr checks --watch`
Expected: all checks pass. If Lighthouse flags `/turmeric/` (e.g. contrast), fix the colours in the story components and push again.

---

## Self-review notes (for the executor)

- **Deviation from the spec:**
  - The seeded `/rice` draft has no linked products, so publishing it is blocked by "Link at least one product" rather than by missing nutrient sources. In the fixed-template design, the rice comparison numbers live on the Story-from product, where the numbers-need-a-source rule applies.
  - The owner links the rice products and fills in the Kolam story (with sources) before publishing `/rice`. The outcome is the same: `/rice` can't go live without sourced numbers.
- **Product page link:**
  - "The turmeric story →" appears on any product linked from a published `/turmeric` (and "The rice story →" for `/rice`), via `storyLinkFor`.
  - `/spices` is skipped on purpose: it is a hub.
- **`purgeStmts` moved** to `src/lib/store/purge.ts` (Task 6), so that `story-pages.ts` can use it without a `catalog-admin` ↔ `story-pages` import cycle. `catalog-admin.ts` imports `story-pages.ts` (Task 9), never the other way round.
- **Known gaps against the spec, left on purpose:**
  - **Decorative images.** The spec allows a "decorative" image with no alt text. The plan always requires alt text for story images, which is stricter.
  - **Cross-origin preview test.** The spec's integration test "a form post from another origin is rejected" isn't automated: Astro pages can't be rendered in the Workers vitest pool. Astro's default `security.checkOrigin` protects the preview route. Check it by hand: `curl -X POST -H 'Origin: https://evil.example' …/admin/preview/product` should return 403.
  - **Focus after a failed save.** The editors focus the first error alert only on a failed story save. The page editor shows a summary alert at the top instead.
