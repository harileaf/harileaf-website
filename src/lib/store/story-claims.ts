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
  CONDITIONAL_TERMS, findBannedPhrases, findCertificationWords, findComparisonProblems, findGiProblems, GI_MESSAGE, HEALTH_LABEL_PREFIX, organicCopy, RAW_PRODUCE_TERMS,
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

/** Deeply frozen so a caller can't loosen the strictest context by mutating it. */
export const STRICTEST: ClaimContext = Object.freeze({
  organicScheme: 'none',
  claims: Object.freeze([]) as unknown as ProcessClaim[],
  mayUseOrganic: false,
  allowedTerms: Object.freeze([]) as readonly string[],
  giRegistered: false,
  certs: Object.freeze([]) as unknown as CertContext[],
});

const evidenced = (c: ProcessClaim) => c.text.trim() !== '' && c.evidence_note.trim() !== '';

export function productContext(p: ContextProduct): ClaimContext {
  const organic = p.organic ?? { scheme: 'none' as OrganicScheme, conversionSince: null, certNumber: null };
  const oc = organicCopy({ organicScheme: organic.scheme, conversionSince: organic.conversionSince, certNumber: organic.certNumber });
  // An uncertified scheme (no certificate number) counts as no scheme at all.
  const scheme: OrganicScheme = oc.badge ?? 'none';
  return {
    organicScheme: scheme,
    claims: (p.claims ?? []).filter(evidenced),
    mayUseOrganic: oc.mayUseOrganic,
    allowedTerms: p.perishable ? RAW_PRODUCE_TERMS : [],
    giRegistered: Boolean(p.gi?.name?.trim() && p.gi?.auRegNumber?.trim()),
    certs: [{ scheme, certified: oc.badge !== null }],
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

export type ProblemKind = 'gi' | 'comparison' | 'health' | 'cert' | 'term' | 'organic' | 'banned';
export interface Problem { kind: ProblemKind; label: string }

const CONDITIONAL = new Set<string>(CONDITIONAL_TERMS);

function bannedProblem(label: string): Problem {
  if (label.startsWith(HEALTH_LABEL_PREFIX)) return { kind: 'health', label: label.slice(HEALTH_LABEL_PREFIX.length) };
  if (label === 'organic') return { kind: 'organic', label };
  if (CONDITIONAL.has(label)) return { kind: 'term', label };
  return { kind: 'banned', label };
}

/** Every problem in one text for a context, classified by the check that found it. */
export function textProblems(text: string, ctx: ClaimContext, opts: { comparison?: boolean } = {}): Problem[] {
  return [
    ...findBannedPhrases(text, ctx).map(bannedProblem),
    ...findGiProblems(text, ctx).map((label): Problem => ({ kind: 'gi', label })),
    ...findCertificationWords(text, ctx.certs).map((label): Problem => ({ kind: 'cert', label: label.replace(/^certification wording: /, '') })),
    ...(opts.comparison ? findComparisonProblems(text).map((label): Problem => ({ kind: 'comparison', label })) : []),
  ];
}

const quoted = (labels: string[]) => [...new Set(labels)].map((l) => `'${l}'`).join(', ');

function certMessage(label: string): string {
  // "PGS (only when every product here holds PGS-India)" → "'PGS' can only appear when every product here holds PGS-India."
  const m = label.match(/^(.*?) \(only (when|with) (.*)\)$/);
  return m ? `'${m[1]}' can only appear ${m[2]} ${m[3]}.` : `'${label}' isn't allowed here.`;
}

/** A next-step message for the admin, grouped by kind; never internal codes. */
export function problemMessage(problems: Problem[]): string {
  const of = (kind: ProblemKind) => problems.filter((p) => p.kind === kind).map((p) => p.label);
  const parts: string[] = [];
  if (of('gi').length) parts.push(GI_MESSAGE);
  const cmp = of('comparison');
  if (cmp.length) parts.push(`Describe the other process, not a competitor (${quoted(cmp)} isn't allowed).`);
  const health = of('health');
  if (health.length) parts.push(`Health claims aren't allowed: remove ${quoted(health)}.`);
  for (const label of new Set(of('cert'))) parts.push(certMessage(label));
  if (of('organic').length) parts.push("'organic' can only appear when every product here has an organic scheme and certificate number (Products → Organic certification).");
  const terms = of('term');
  if (terms.length) parts.push(`${quoted(terms)} ${terms.length > 1 ? 'need' : 'needs'} a matching process claim with an evidence note on every product here (Products → Claims).`);
  const banned = of('banned');
  if (banned.length) parts.push(`Remove ${quoted(banned)}.`);
  return parts.join(' ');
}

/** The words a problem is about, as the owner typed them: 'organic', 'immunity', 'Wada Kolam', 'PGS'. */
export function problemWording(p: Problem): string {
  if (p.kind === 'gi') return p.label === 'GI wording' ? 'GI' : p.label.replace(/^GI name: /, '');
  if (p.kind === 'cert') return p.label.replace(/ \(only (?:when|with) .*\)$/, '');
  return p.label;
}

type FieldProblems = Record<string, Problem[]>;

const messages = (fp: FieldProblems): FieldErrors => Object.fromEntries(Object.entries(fp).map(([k, ps]) => [k, problemMessage(ps)]));

/** Claims problems per story field, in the product's own context. */
export function productStoryProblems(story: ProductStory, p: ContextProduct): FieldProblems {
  const ctx = productContext(p);
  const out: FieldProblems = {};
  for (const [field, text] of storyTexts(story)) {
    const problems = textProblems(text, ctx, { comparison: field.startsWith('comparison.') });
    if (problems.length) out[field] = problems;
  }
  return out;
}

export function checkProductStory(story: ProductStory, p: ContextProduct): FieldErrors {
  return messages(productStoryProblems(story, p));
}

/**
 * Claims problems per text field of a landing page: page-wide copy, card
 * blurbs and (rice, turmeric) the Story-from product's story under `storyFrom.`.
 */
export function storyPageProblems(slug: StoryPageSlug, page: StoryPage, products: ContextProduct[]): FieldProblems {
  const out: FieldProblems = {};
  const linked = page.productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is ContextProduct => Boolean(p));
  const dangling = linked.length < page.productIds.length;
  // Hub copy, and any page with a missing product, is checked as strictly as possible (never loosened).
  const pageCtx = slug === 'spices' || dangling ? STRICTEST : intersectContexts(linked);
  for (const [field, text] of pageWideTexts(page)) {
    const problems = textProblems(text, pageCtx);
    if (problems.length) out[field] = problems;
  }
  for (const [id, text] of Object.entries(page.cardBlurbs)) {
    const p = linked.find((x) => String(x.id) === id);
    const problems = textProblems(text, slug === 'spices' || !p ? STRICTEST : productContext(p));
    if (problems.length) out[`cardBlurbs.${id}`] = problems;
  }
  const from = linked.find((p) => p.id === page.storyFromProductId);
  if (from?.story && slug !== 'spices') for (const [k, ps] of Object.entries(productStoryProblems(from.story, from))) out[`storyFrom.${k}`] = ps;
  return out;
}

/**
 * Full check of a landing page. `completeness` adds the publish-only
 * requirements (title, headline, linked products).
 */
export function checkStoryPage(slug: StoryPageSlug, page: StoryPage, products: ContextProduct[], opts: { completeness: boolean }): FieldErrors {
  const e: FieldErrors = {};
  const linked = page.productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is ContextProduct => Boolean(p));
  if (linked.length < page.productIds.length) e.productIds = 'A linked product no longer exists. Remove it from Products';
  Object.assign(e, messages(storyPageProblems(slug, page, products)));
  const from = linked.find((p) => p.id === page.storyFromProductId);

  if (opts.completeness) {
    if (!page.seo.title) e['seo.title'] ??= 'Add a search title';
    if (!page.seo.description) e['seo.description'] ??= 'Add a search description';
    if (!page.hero.line1) e['hero.line1'] ??= 'Add the headline';
    if (slug !== 'spices' && page.productIds.length === 0) e.productIds = 'Link at least one product (Products section)';
    if (slug !== 'spices' && page.productIds.length > 0 && !from) e.storyFromProductId = "Choose the 'Story from' product";
  }
  return e;
}

const NAMED: Record<string, string> = {
  'seo.title': 'Search title', 'seo.description': 'Search description', 'hero.eyebrow': 'Hero eyebrow', 'hero.line1': 'Hero line 1',
  'hero.line2': 'Hero line 2', 'hero.subtitle': 'Hero subtitle', 'hero.ctaLabel': 'Hero button', 'hero.photoAlt': 'Hero photo description',
  note: 'Note', closing: 'Closing line', productIds: 'Products', storyFromProductId: 'Story from',
  'originStory.heading': 'Origin heading', 'originStory.bodyMd': 'Origin story', 'comparison.heading': 'Comparison heading',
  'comparison.note': 'Comparison note', grower: 'Grower', 'use.heading': 'How to cook/use heading',
  'originStory.photoAlt': 'Origin photo description', 'comparison.oursLabel': 'Comparison: our column', 'comparison.theirsLabel': 'Comparison: other column',
  'comparison.imageAlt': 'Comparison photo description',
};
const INDEXED: Record<string, string> = {
  facts: 'Fact', faq: 'Question', processSteps: 'Step', proofLine: 'Proof item', icons: 'Icon', 'comparison.rows': 'Comparison row',
  'use.steps': 'How to cook/use step', 'hero.proof': 'Hero proof item',
};

/** "hero.line2" → "Hero line 2", "faq.0" → "Question 1", "storyFrom.processSteps.3" → "Story from product → Step 4". */
export function fieldLabel(key: string, productNames: Record<string, string> = {}): string {
  if (key.startsWith('storyFrom.')) return `Story from product → ${fieldLabel(key.slice(10), productNames)}`;
  if (key.startsWith('cardBlurbs.')) {
    const id = key.slice(11);
    return `Card blurb (${productNames[id] ?? `product ${id}`})`;
  }
  if (NAMED[key]) return NAMED[key];
  const m = key.match(/^(.*)\.(\d+)$/);
  if (m && INDEXED[m[1]]) return `${INDEXED[m[1]]} ${Number(m[2]) + 1}`;
  return key;
}
