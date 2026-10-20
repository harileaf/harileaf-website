/**
 * Story pages in D1 (spec: Data Model, Claims Compliance, Edge cache and
 * purge, Public Routes): landing-page drafts and publishing, product-story
 * saves, the re-check of published pages when a product's evidence changes,
 * and the view model the public routes and previews render.
 *
 * Every write and its cache purges go in one `db.batch` (one transaction).
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

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

// ── rows ──────────────────────────────────────────────────────────────────

export interface StoryPageRow { slug: StoryPageSlug; draft: StoryPage; published: StoryPage | null; draftSavedAt: string; publishedAt: string | null }

type RawPageRow = { slug: string; draft: string; published: string | null; draft_saved_at: string; published_at: string | null };

const toPageRow = (r: RawPageRow & { slug: StoryPageSlug }): StoryPageRow => ({
  slug: r.slug,
  draft: coerceStoryPage(parse(r.draft)),
  published: r.published ? coerceStoryPage(parse(r.published)) : null,
  draftSavedAt: r.draft_saved_at,
  publishedAt: r.published_at,
});

export async function getStoryPageRow(db: D1Database, slug: string): Promise<StoryPageRow | null> {
  if (!isStoryPageSlug(slug)) return null;
  const r = await db.prepare('SELECT slug, draft, published, draft_saved_at, published_at FROM story_pages WHERE slug = ?').bind(slug).first<RawPageRow>();
  return r ? toPageRow({ ...r, slug }) : null;
}

/** never: no live version · published: live = draft · changed: the draft has unpublished edits. */
export type PageStatus = 'never' | 'published' | 'changed';

export async function listStoryPages(db: D1Database): Promise<Array<{ slug: StoryPageSlug; status: PageStatus; draftSavedAt: string; publishedAt: string | null }>> {
  const { results } = await db.prepare('SELECT slug, draft, published, draft_saved_at, published_at FROM story_pages').all<RawPageRow>();
  const rows = new Map(results.filter((r): r is RawPageRow & { slug: StoryPageSlug } => isStoryPageSlug(r.slug)).map((r) => [r.slug, toPageRow(r)]));
  return STORY_PAGE_SLUGS.flatMap((slug) => {
    const r = rows.get(slug);
    if (!r) return [];
    const status: PageStatus = !r.published ? 'never' : JSON.stringify(r.published) === JSON.stringify(r.draft) ? 'published' : 'changed';
    return [{ slug, status, draftSavedAt: r.draftSavedAt, publishedAt: r.publishedAt }];
  });
}

// ── claims context from D1 ────────────────────────────────────────────────

type ContextRow = {
  id: number; name: string; slug: string; category_slug: string;
  organic_scheme: OrganicScheme; organic_conversion_since: number | null; organic_cert_number: string | null;
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

/** Products by id in any status, with their category and slug (for purge paths). Ids are few (≤ 8 per page, 3 pages). */
async function contextRows(db: D1Database, ids: number[]): Promise<ContextRow[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.slug, c.slug AS category_slug, p.organic_scheme, p.organic_conversion_since, p.organic_cert_number,
              p.process_claims, p.perishable, p.gi_name, p.gi_au_reg_number, p.story
       FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id IN (${placeholders(unique.length)})`,
    )
    .bind(...unique)
    .all<ContextRow>();
  return results;
}

/** Linked products in any status: an inactive one stays in the claims context until the page is republished. */
export async function loadContextProducts(db: D1Database, ids: number[]): Promise<ContextProduct[]> {
  return (await contextRows(db, ids)).map(contextFromRow);
}

/**
 * Published pages linking `changed.id` that would not pass their checks with
 * `changed` in place of the saved product. One message per failing field,
 * naming the page, the field and the wording. Nothing is ever unpublished:
 * the caller blocks the save instead.
 */
export async function publishedPageConflicts(db: D1Database, changed: ContextProduct): Promise<string[]> {
  const { results } = await db.prepare('SELECT slug, published FROM story_pages WHERE published IS NOT NULL ORDER BY slug').all<{ slug: string; published: string }>();
  const pages = results
    .filter((r): r is { slug: StoryPageSlug; published: string } => isStoryPageSlug(r.slug))
    .map((r) => ({ slug: r.slug, page: coerceStoryPage(parse(r.published)) }))
    .filter(({ page }) => page.productIds.includes(changed.id));
  if (!pages.length) return [];
  // One query for every product the affected pages link.
  const saved = await loadContextProducts(db, pages.flatMap(({ page }) => page.productIds));
  const products = saved.map((p) => (p.id === changed.id ? changed : p));
  const names = Object.fromEntries(products.map((p) => [String(p.id), p.name]));
  const out: string[] = [];
  for (const { slug, page } of pages)
    for (const [k, m] of Object.entries(checkStoryPage(slug, page, products, { completeness: false })))
      out.push(`/${slug} would break in ${fieldLabel(k, names)}: ${m.replace(/\.?$/, '.')} Edit and republish the page first.`);
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

/**
 * What a publish changes: the page, the sitemap (its lastmod), for /turmeric
 * the /spices hub (its turmeric card's link target), and the product pages
 * linked before or after (their "The … story →" link appears or goes).
 */
export async function storyPagePurgePaths(db: D1Database, slug: StoryPageSlug, page: StoryPage, previous: StoryPage | null = null): Promise<string[]> {
  const linked = await contextRows(db, [...page.productIds, ...(previous?.productIds ?? [])]);
  return [`/${slug}`, '/sitemap-store.xml', ...(slug === 'turmeric' ? ['/spices'] : []), ...linked.map((r) => productPath(r.category_slug, r.slug))];
}

/**
 * Runs the full checks on the saved draft and, when they pass, makes exactly
 * that draft live and enqueues the purges in the same batch.
 */
export async function publishStoryPage(db: D1Database, slug: string, now = new Date()): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
  const row = await getStoryPageRow(db, slug);
  if (!row) return { ok: false, errors: { _: 'Page not found' } };
  // checkStoryPage's completeness rules require the search title and description (an empty <title> must never go live).
  const errors = {
    ...checkStoryPage(row.slug, row.draft, await loadContextProducts(db, row.draft.productIds), { completeness: true }),
    ...validateStoryPageStructure(row.slug, row.draft),
  };
  if (Object.keys(errors).length) return { ok: false, errors };
  const at = nowIso(now);
  await db.batch([
    // Bind the checked draft rather than copying the column, so a draft saved meanwhile is never published unchecked.
    db.prepare('UPDATE story_pages SET published = ?, published_at = ? WHERE slug = ?').bind(JSON.stringify(row.draft), at, row.slug),
    ...purgeStmts(db, await storyPagePurgePaths(db, row.slug, row.draft, row.published), at),
  ]);
  return { ok: true };
}

// ── product story ─────────────────────────────────────────────────────────

/**
 * Saves (or, with null, removes) a product's story. It is live at once, so
 * every structural and claims error blocks, and so does any published page
 * using the product that would then fail its checks.
 */
export async function saveProductStory(db: D1Database, productId: number, raw: unknown, now = new Date()): Promise<SaveWithWarnings> {
  const [row] = await contextRows(db, [productId]);
  if (!row) return { ok: false, errors: { _: 'Product not found' } };
  const p = contextFromRow(row);
  const story = coerceProductStory(raw);
  if (story) {
    const errors = { ...validateProductStory(story), ...checkProductStory(story, p) };
    if (Object.keys(errors).length) return { ok: false, errors };
  }
  const conflicts = await publishedPageConflicts(db, { ...p, story });
  if (conflicts.length) return { ok: false, errors: { _pages: conflicts.join(' ') } };

  const warnings: FieldErrors = {};
  if (story?.proofLine.some((x) => x.kind === 'lab')) {
    const summary = (await activeLabSummaries(db, [productId])).get(productId) ?? null;
    story.proofLine.forEach((x, i) => {
      if (x.kind === 'lab' && !labValue(summary, x.key)) warnings[`proofLine.${i}`] = `The active batch's lab report has no '${x.key}', so this item is hidden on the page`;
    });
  }
  const at = nowIso(now);
  await db.batch([
    db.prepare('UPDATE products SET story = ?, updated_at = ? WHERE id = ?').bind(story ? JSON.stringify(story) : null, at, productId),
    ...purgeStmts(db, productPurgePaths(row.category_slug, row.slug), at),
  ]);
  return { ok: true, warnings };
}

/** "The turmeric story →" / "The rice story →" for a product linked from a published landing page (the /spices hub has no story link). */
export async function storyLinkFor(db: D1Database, productId: number): Promise<{ path: string; label: string } | null> {
  const { results } = await db
    .prepare("SELECT slug, published FROM story_pages WHERE published IS NOT NULL AND slug IN ('rice', 'turmeric') ORDER BY slug")
    .all<{ slug: string; published: string }>();
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
  /** Active linked products with a sellable variant, in the page's order. */
  cards: ProductCard[];
  storyFrom: { product: Product; story: ProductStory } | null;
  growers: Grower[];
  labTable: { columns: string[]; rows: LabTableRow[] };
  heroProof: string[];
  /** Shown only when every active linked product has the same certification line. */
  certificationLine: string | null;
  giBadge: string | null;
  turmericPublished: boolean;
}

const LAB_TABLE_ROWS = 8;

async function labTableRows(db: D1Database, ids: number[], columns: string[]): Promise<LabTableRow[]> {
  if (!ids.length) return [];
  const { results } = await db
    .prepare(
      `SELECT l.batch_code, l.tested_on, l.summary, l.pdf_r2_key, p.name, p.slug, c.slug AS category_slug
       FROM lab_reports l JOIN products p ON p.id = l.product_id JOIN categories c ON c.id = p.category_id
       WHERE l.visible = 1 AND p.status = 'active' AND l.product_id IN (${placeholders(ids.length)})
       ORDER BY l.tested_on DESC, l.id DESC LIMIT ${LAB_TABLE_ROWS}`,
    )
    .bind(...ids)
    .all<{ batch_code: string; tested_on: string; summary: string; pdf_r2_key: string | null; name: string; slug: string; category_slug: string }>();
  return results.map((r) => {
    const summary = (parse(r.summary) as Record<string, unknown> | null) ?? {};
    return {
      productName: r.name,
      productPath: productPath(r.category_slug, r.slug),
      batchCode: r.batch_code,
      testedOn: r.tested_on,
      values: columns.map((k) => labValue(summary, k)),
      pdfUrl: r.pdf_r2_key ? mediaUrl(r.pdf_r2_key) : null,
    };
  });
}

/**
 * Everything a landing page renders; `draft` is for the admin preview only.
 * A linked product that is no longer active drops out of every section.
 * A fixed number of queries, whatever the number of linked products.
 */
export async function loadStoryPageView(db: D1Database, slug: string, which: 'published' | 'draft', today: Date): Promise<StoryPageViewModel | null> {
  const row = await getStoryPageRow(db, slug);
  const page = row ? (which === 'published' ? row.published : row.draft) : null;
  if (!row || !page) return null;
  const ids = page.productIds;
  const [products, summaries, rows, turmericPublishedAt] = await Promise.all([
    getProductsByIds(db, ids),
    activeLabSummaries(db, ids),
    labTableRows(db, ids, page.labColumns),
    row.slug === 'turmeric'
      ? Promise.resolve(row.publishedAt)
      : db.prepare("SELECT published_at FROM story_pages WHERE slug = 'turmeric'").first<{ published_at: string | null }>().then((r) => r?.published_at ?? null),
  ]);
  // Cards only for the linked (active) products, not the whole catalogue.
  const cardList = await listProducts(db, { keys: products.map((p) => `${p.category.slug}/${p.slug}`), today });
  const byId = new Map(cardList.map((c) => [c.id, c]));
  const cards = ids.map((id) => byId.get(id)).filter((c): c is ProductCard => Boolean(c));
  const active = new Set(products.map((p) => p.id));

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
      const v = active.has(x.productId) ? labValue(summaries.get(x.productId) ?? null, x.key) : null;
      return v ? [`${x.label} ${v}${x.suffix ?? ''}`] : [];
    }),
    certificationLine: lines.length > 0 && lines.every((l) => l && l === lines[0]) ? lines[0] : null,
    giBadge: from?.gi.name && from.gi.auRegNumber ? `GI-tagged ${from.gi.name} · Reg. ${from.gi.auRegNumber}` : null,
    turmericPublished: Boolean(turmericPublishedAt),
  };
}
