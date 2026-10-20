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
