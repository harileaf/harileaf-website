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
