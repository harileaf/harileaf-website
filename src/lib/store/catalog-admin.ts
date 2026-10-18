/**
 * Admin writes for the catalog: validation (claims policy, publish checklist),
 * product + variant saves, images, batches, lab reports and certificates.
 *
 * Every write enqueues a `cache.purge` outbox row in the same batch, and the
 * caller drains it right away (falling back to the cron).
 *
 * Stock is adjusted, never overwritten: the editor sends a delta that is
 * applied as `stock_qty = stock_qty + Δ`, so saving a form that was open while
 * orders came in can't resurrect units that were already sold.
 */
import type { Faq, Nutrition, ProductRow, VariantRow } from './catalog';
import { mapProduct } from './catalog';
import { RAW_PRODUCE_TERMS, findBannedPhrases, organicCopy, validateProcessClaims, type OrganicScheme, type ProcessClaim } from './claims';
import { classifyD1Error, nowIso } from './db';
import { productPurgePaths, purgeUrls } from './edge-cache';
import { enqueueStmt } from './outbox';
import { isCategorySlug } from './urls';

export interface ProductInput {
  categorySlug: string;
  slug: string;
  name: string;
  shortDescription: string;
  descriptionMd: string;
  status: 'draft' | 'active' | 'discontinued';
  replacementProductId: number | null;
  organicScheme: OrganicScheme;
  organicConversionSince: number | null;
  organicCertNumber: string | null;
  processClaims: ProcessClaim[];
  howItsMade: Record<string, string>;
  harvestInfo: Record<string, string>;
  attributes: Record<string, string>;
  faq: Faq[];
  bestBeforeDays: number | null;
  storageInstructions: string;
  countryOfOrigin: string;
  ingredients: string;
  allergenInfo: string | null;
  vegMark: boolean;
  nutrition: Nutrition;
  hsnCode: string;
  gstRateBp: number;
  perishable: boolean;
  codAllowed: boolean;
  seasonStartMd: string | null;
  seasonEndMd: string | null;
  offSeasonMode: 'notify' | 'preorder' | null;
  preorderDispatchDate: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  relatedProductIds: number[];
}

export interface VariantInput {
  id?: number;
  sku: string;
  label: string;
  netQtyLabel: string;
  unitQtyG: number;
  pricePaise: number;
  mrpPaise: number;
  weightG: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  /** Change to apply to available stock (new variants: the opening stock). */
  stockAdjust: number;
  lowStockThreshold: number;
  active: boolean;
  sort: number;
}

export type FieldErrors = Record<string, string>;

const CATEGORY_IDS: Record<string, number> = { rice: 1, spices: 2, produce: 3 };
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MD = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isInt = (n: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
const trimOrNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

/** Every shopper-visible string on the product, labelled for error messages. */
function visibleTexts(p: ProductInput, variants: VariantInput[]): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ['name', p.name], ['shortDescription', p.shortDescription], ['descriptionMd', p.descriptionMd],
    ['seoTitle', p.seoTitle ?? ''], ['seoDescription', p.seoDescription ?? ''], ['ingredients', p.ingredients],
    ['storageInstructions', p.storageInstructions],
  ];
  for (const [k, v] of Object.entries(p.howItsMade)) out.push([`howItsMade.${k}`, `${k} ${v}`]);
  for (const [k, v] of Object.entries(p.harvestInfo)) out.push([`harvestInfo.${k}`, `${k} ${v}`]);
  for (const [k, v] of Object.entries(p.attributes)) out.push([`attributes.${k}`, `${k} ${v}`]);
  p.faq.forEach((f, i) => out.push([`faq.${i}`, `${f.q} ${f.a}`]));
  variants.forEach((v, i) => out.push([`variants.${i}.label`, v.label]));
  return out;
}

export interface PublishContext {
  imageCount: number;
  /** Whether the product already has `published_at` (slug is then frozen). */
  published: boolean;
  currentSlug: string | null;
  currentCategorySlug: string | null;
}

export function validateProduct(p: ProductInput, variants: VariantInput[], ctx: PublishContext): FieldErrors {
  const e: FieldErrors = {};
  const fail = (k: string, m: string) => (e[k] ??= m);

  if (!isCategorySlug(p.categorySlug)) fail('categorySlug', 'Choose a category');
  if (!SLUG.test(p.slug)) fail('slug', 'Use lowercase letters, numbers and hyphens, e.g. karjat-3');
  if (ctx.published && ctx.currentSlug && (p.slug !== ctx.currentSlug || p.categorySlug !== ctx.currentCategorySlug))
    fail('slug', 'The URL of a published product can’t change (it would break links and search rankings). Discontinue it and create a new product instead.');
  if (!p.name.trim()) fail('name', 'Required');
  if (p.name.length > 120) fail('name', 'Keep it under 120 characters');
  if (p.shortDescription.length > 300) fail('shortDescription', 'Keep it under 300 characters');
  if (p.status === 'discontinued' && p.replacementProductId !== null && !isInt(p.replacementProductId, 1)) fail('replacementProductId', 'Pick a product');
  if (p.status !== 'discontinued' && p.replacementProductId !== null) fail('replacementProductId', 'Only discontinued products redirect');

  // Organic certification wording is only possible with a scheme AND a certificate.
  if (p.organicScheme !== 'none' && !trimOrNull(p.organicCertNumber)) fail('organicCertNumber', 'Enter the certificate number for this scheme');
  if (p.organicConversionSince !== null && !isInt(p.organicConversionSince, 2000, 2100)) fail('organicConversionSince', 'Enter a year');
  const mayUseOrganic = organicCopy({ organicScheme: p.organicScheme, conversionSince: p.organicConversionSince, certNumber: p.organicCertNumber }).mayUseOrganic;

  const allowedTerms = p.perishable ? RAW_PRODUCE_TERMS : [];
  const claimErrors = validateProcessClaims(p.processClaims, { organicScheme: p.organicScheme, mayUseOrganic, allowedTerms });
  if (claimErrors.length) fail('processClaims', claimErrors.join('; '));
  for (const [field, text] of visibleTexts(p, variants)) {
    const banned = findBannedPhrases(text, { organicScheme: p.organicScheme, claims: p.processClaims, mayUseOrganic, allowedTerms });
    if (banned.length) fail(field, `Remove or substantiate: ${banned.join(', ')} (see the claims guidance)`);
  }

  p.faq.forEach((f, i) => {
    if (!f.q.trim() || !f.a.trim()) fail(`faq.${i}`, 'Each FAQ needs a question and an answer');
  });
  for (const row of p.nutrition.rows) if (!row.name.trim() || !row.amount.trim()) fail('nutrition', 'Each nutrition row needs a name and an amount with units');

  if (!/^(\d{4}|\d{6}|\d{8})?$/.test(p.hsnCode)) fail('hsnCode', 'HSN codes have 4, 6 or 8 digits');
  if (!isInt(p.gstRateBp, 0, 4000)) fail('gstRateBp', 'Enter the GST rate');
  if (p.bestBeforeDays !== null && !isInt(p.bestBeforeDays, 1, 3650)) fail('bestBeforeDays', 'Enter days');
  if (p.perishable && p.codAllowed) fail('codAllowed', 'Perishable products are prepaid only');

  if ((p.seasonStartMd === null) !== (p.seasonEndMd === null)) fail('seasonStartMd', 'Set both season start and end, or neither');
  if (p.seasonStartMd && !MD.test(p.seasonStartMd)) fail('seasonStartMd', 'Use MM-DD');
  if (p.seasonEndMd && !MD.test(p.seasonEndMd)) fail('seasonEndMd', 'Use MM-DD');
  if (p.preorderDispatchDate && !DATE.test(p.preorderDispatchDate)) fail('preorderDispatchDate', 'Use YYYY-MM-DD');
  if (p.offSeasonMode === 'preorder' && !p.seasonStartMd) fail('offSeasonMode', 'Pre-orders need a season window');

  if (p.seoTitle && p.seoTitle.length > 70) fail('seoTitle', 'Keep it under 70 characters');
  if (p.seoDescription && p.seoDescription.length > 170) fail('seoDescription', 'Keep it under 170 characters');

  const skus = new Set<string>();
  variants.forEach((v, i) => {
    const f = (k: string, m: string) => fail(`variants.${i}.${k}`, m);
    if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(v.sku)) f('sku', 'Use capitals, digits and hyphens, e.g. KJ3-5KG');
    if (skus.has(v.sku)) f('sku', 'Duplicate SKU');
    skus.add(v.sku);
    if (!v.label.trim()) f('label', 'Required');
    if (!v.netQtyLabel.trim()) f('netQtyLabel', 'Required (as printed on the pack)');
    if (!isInt(v.unitQtyG, 1)) f('unitQtyG', 'Grams in the pack');
    if (!isInt(v.pricePaise, 1)) f('pricePaise', 'Enter the selling price');
    if (!isInt(v.mrpPaise, 1)) f('mrpPaise', 'Enter the MRP printed on the pack');
    else if (isInt(v.pricePaise, 1) && v.pricePaise > v.mrpPaise) f('pricePaise', 'Selling price can’t be above MRP');
    if (!isInt(v.weightG, 1)) f('weightG', 'Packed weight in grams');
    for (const k of ['lengthCm', 'breadthCm', 'heightCm'] as const) if (!(typeof v[k] === 'number' && v[k] > 0.5)) f(k, 'Box size in cm (over 0.5)');
    if (!Number.isInteger(v.stockAdjust) || (v.id === undefined && v.stockAdjust < 0)) f('stockAdjust', 'Whole number; opening stock can’t be negative');
    if (!isInt(v.lowStockThreshold, 0)) f('lowStockThreshold', 'Whole number');
  });

  if (p.status === 'active') for (const [k, m] of publishChecklist(p, variants, ctx)) fail(k, m);
  return e;
}

/** What a product needs before it can go live (Legal Metrology Rule 6 / FSSAI listing info). */
export function publishChecklist(p: ProductInput, variants: VariantInput[], ctx: { imageCount: number }): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (!variants.some((v) => v.active)) out.push(['variants', 'Add at least one active pack size']);
  if (ctx.imageCount < 1) out.push(['images', 'Add at least one photo']);
  if (!p.hsnCode) out.push(['hsnCode', 'HSN code is needed for invoices']);
  if (!p.bestBeforeDays) out.push(['bestBeforeDays', 'Best-before period is required on the listing']);
  if (!p.ingredients.trim()) out.push(['ingredients', 'Ingredients are required on the listing (e.g. “Rice (100%)”)']);
  if (!p.storageInstructions.trim()) out.push(['storageInstructions', 'Storage instructions are required']);
  if (!p.shortDescription.trim()) out.push(['shortDescription', 'Add a one-line summary']);
  return out;
}

// ── writes ─────────────────────────────────────────────────────────────────

export type SaveResult = { ok: true; id: number; purgeIds: number[] } | { ok: false; errors: FieldErrors };

function productColumns(p: ProductInput) {
  return {
    category_id: CATEGORY_IDS[p.categorySlug],
    slug: p.slug,
    name: p.name.trim(),
    short_description: p.shortDescription.trim(),
    description_md: p.descriptionMd,
    status: p.status,
    replacement_product_id: p.status === 'discontinued' ? p.replacementProductId : null,
    organic_scheme: p.organicScheme,
    organic_conversion_since: p.organicConversionSince,
    organic_cert_number: trimOrNull(p.organicCertNumber),
    process_claims: JSON.stringify(p.processClaims.map((c) => ({ code: c.code, text: c.text.trim(), evidence_note: c.evidence_note.trim() }))),
    how_its_made: JSON.stringify(p.howItsMade),
    harvest_info: JSON.stringify(p.harvestInfo),
    attributes: JSON.stringify(p.attributes),
    faq: JSON.stringify(p.faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() }))),
    best_before_days: p.bestBeforeDays,
    storage_instructions: p.storageInstructions.trim(),
    country_of_origin: p.countryOfOrigin.trim() || 'India',
    ingredients: p.ingredients.trim(),
    allergen_info: trimOrNull(p.allergenInfo),
    veg_mark: p.vegMark ? 1 : 0,
    nutrition: JSON.stringify(p.nutrition),
    hsn_code: p.hsnCode,
    gst_rate_bp: p.gstRateBp,
    perishable: p.perishable ? 1 : 0,
    cod_allowed: p.perishable ? 0 : p.codAllowed ? 1 : 0,
    season_start_md: p.seasonStartMd,
    season_end_md: p.seasonEndMd,
    off_season_mode: p.offSeasonMode,
    preorder_dispatch_date: p.preorderDispatchDate,
    seo_title: trimOrNull(p.seoTitle),
    seo_description: trimOrNull(p.seoDescription),
    related_product_ids: JSON.stringify(p.relatedProductIds.filter((n) => Number.isInteger(n))),
  };
}

function variantColumns(v: VariantInput) {
  return {
    sku: v.sku,
    label: v.label.trim(),
    net_qty_label: v.netQtyLabel.trim(),
    unit_qty_g: v.unitQtyG,
    price_paise: v.pricePaise,
    mrp_paise: v.mrpPaise,
    weight_g: v.weightG,
    length_cm: v.lengthCm,
    breadth_cm: v.breadthCm,
    height_cm: v.heightCm,
    low_stock_threshold: v.lowStockThreshold,
    active: v.active ? 1 : 0,
    sort: v.sort,
  };
}

async function existing(db: D1Database, id: number) {
  return db
    .prepare('SELECT p.slug, p.published_at, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?')
    .bind(id)
    .first<{ slug: string; published_at: string | null; category_slug: string }>();
}

const imageCount = async (db: D1Database, id: number) =>
  (await db.prepare('SELECT count(*) AS n FROM product_images WHERE product_id = ?').bind(id).first<{ n: number }>())?.n ?? 0;

function purgeStmt(db: D1Database, paths: string[], at: string) {
  return enqueueStmt(db, { kind: 'cache.purge', payload: { urls: purgeUrls(paths) }, at });
}

/**
 * Creates (id = null) or updates a product and its variants in one batch.
 * Variants missing from `variants` are deactivated, never deleted (orders
 * reference them).
 */
export async function saveProduct(
  db: D1Database,
  id: number | null,
  p: ProductInput,
  variants: VariantInput[],
  now: Date = new Date(),
): Promise<SaveResult> {
  const prev = id === null ? null : await existing(db, id);
  if (id !== null && !prev) return { ok: false, errors: { _: 'Product not found' } };
  const errors = validateProduct(p, variants, {
    imageCount: id === null ? 0 : await imageCount(db, id),
    published: Boolean(prev?.published_at),
    currentSlug: prev?.slug ?? null,
    currentCategorySlug: prev?.category_slug ?? null,
  });
  if (Object.keys(errors).length) return { ok: false, errors };

  const at = nowIso(now);
  const cols = productColumns(p);
  const stmts: D1PreparedStatement[] = [];
  let productId = id;

  try {
    if (id === null) {
      const keys = Object.keys(cols);
      const res = await db
        .prepare(
          `INSERT INTO products (${keys.join(', ')}, created_at, updated_at, published_at)
           VALUES (${keys.map(() => '?').join(', ')}, ?, ?, ?)`,
        )
        .bind(...Object.values(cols), at, at, p.status === 'active' ? at : null)
        .run();
      productId = res.meta.last_row_id;
    } else {
      const keys = Object.keys(cols);
      stmts.push(
        db
          .prepare(
            `UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ?,
               published_at = COALESCE(published_at, CASE WHEN ? = 'active' THEN ? END)
             WHERE id = ?`,
          )
          .bind(...Object.values(cols), at, p.status, at, id),
      );
    }

    const pid = productId as number;
    const keep = variants.filter((v) => v.id !== undefined).map((v) => v.id as number);
    stmts.push(
      db
        .prepare(`UPDATE variants SET active = 0 WHERE product_id = ? ${keep.length ? `AND id NOT IN (${keep.map(() => '?').join(',')})` : ''}`)
        .bind(pid, ...keep),
    );
    for (const v of variants) {
      const vc = variantColumns(v);
      const keys = Object.keys(vc);
      if (v.id === undefined) {
        stmts.push(
          db
            .prepare(`INSERT INTO variants (product_id, ${keys.join(', ')}, stock_qty) VALUES (?, ${keys.map(() => '?').join(', ')}, ?)`)
            .bind(pid, ...Object.values(vc), v.stockAdjust),
        );
      } else {
        stmts.push(
          db
            .prepare(`UPDATE variants SET ${keys.map((k) => `${k} = ?`).join(', ')}, stock_qty = stock_qty + ? WHERE id = ? AND product_id = ?`)
            .bind(...Object.values(vc), v.stockAdjust, v.id, pid),
        );
      }
    }

    const paths = productPurgePaths(p.categorySlug, p.slug);
    if (prev && (prev.slug !== p.slug || prev.category_slug !== p.categorySlug)) paths.push(...productPurgePaths(prev.category_slug, prev.slug));
    stmts.push(purgeStmt(db, paths, at));
    await db.batch(stmts);
  } catch (err) {
    if (id === null && productId !== null) await db.prepare('DELETE FROM products WHERE id = ?').bind(productId).run().catch(() => {});
    const kind = classifyD1Error(err);
    const msg = err instanceof Error ? err.message : String(err);
    if (kind === 'unique' && /variants\.sku/.test(msg)) return { ok: false, errors: { variants: 'A SKU is already used by another product' } };
    if (kind === 'unique' && /products\.category_id, products\.slug/.test(msg)) return { ok: false, errors: { slug: 'Another product in this category already uses this URL' } };
    if (kind === 'stock') return { ok: false, errors: { variants: 'A stock adjustment would take stock below zero' } };
    throw err;
  }
  return { ok: true, id: productId as number, purgeIds: [] };
}

// ── images, batches, lab reports, certificates ─────────────────────────────

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

const rand = () => crypto.randomUUID().slice(0, 8);

async function productPaths(db: D1Database, productId: number): Promise<string[] | null> {
  const row = await existing(db, productId);
  return row ? productPurgePaths(row.category_slug, row.slug) : null;
}

export async function addImage(db: D1Database, r2: R2Bucket, productId: number, file: File, alt: string, now = new Date()) {
  const paths = await productPaths(db, productId);
  if (!paths) return { ok: false as const, error: 'Product not found' };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { ok: false as const, error: 'Use a JPEG, PNG, WebP or AVIF image' };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false as const, error: 'Images must be 5 MB or smaller' };
  if (!alt.trim()) return { ok: false as const, error: 'Describe the photo (alt text) for accessibility and search' };
  const key = `products/${productId}/${now.getTime()}-${rand()}.${ext}`;
  await r2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const at = nowIso(now);
  await db.batch([
    db
      .prepare('INSERT INTO product_images (product_id, r2_key, alt, sort) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM product_images WHERE product_id = ?))')
      .bind(productId, key, alt.trim(), productId),
    db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').bind(at, productId),
    purgeStmt(db, paths, at),
  ]);
  return { ok: true as const, key };
}

export async function updateImage(db: D1Database, productId: number, imageId: number, patch: { alt?: string; sort?: number }, now = new Date()) {
  const paths = await productPaths(db, productId);
  if (!paths) return { ok: false as const, error: 'Product not found' };
  if (patch.alt !== undefined && !patch.alt.trim()) return { ok: false as const, error: 'Alt text is required' };
  const at = nowIso(now);
  await db.batch([
    db
      .prepare('UPDATE product_images SET alt = COALESCE(?, alt), sort = COALESCE(?, sort) WHERE id = ? AND product_id = ?')
      .bind(patch.alt?.trim() ?? null, Number.isInteger(patch.sort) ? patch.sort : null, imageId, productId),
    db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').bind(at, productId),
    purgeStmt(db, paths, at),
  ]);
  return { ok: true as const };
}

export async function deleteImage(db: D1Database, r2: R2Bucket, productId: number, imageId: number, now = new Date()) {
  const row = await db
    .prepare(
      `SELECT i.r2_key, p.status, (SELECT count(*) FROM product_images WHERE product_id = p.id) AS n
       FROM product_images i JOIN products p ON p.id = i.product_id WHERE i.id = ? AND i.product_id = ?`,
    )
    .bind(imageId, productId)
    .first<{ r2_key: string; status: string; n: number }>();
  if (!row) return { ok: false as const, error: 'Image not found' };
  if (row.status === 'active' && row.n <= 1) return { ok: false as const, error: 'A live product needs at least one photo' };
  const paths = (await productPaths(db, productId))!;
  const at = nowIso(now);
  await db.batch([
    db.prepare('DELETE FROM product_images WHERE id = ?').bind(imageId),
    db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').bind(at, productId),
    purgeStmt(db, paths, at),
  ]);
  await r2.delete(row.r2_key);
  return { ok: true as const };
}

export interface BatchInput {
  batchCode: string;
  packedOn: string;
  groundOrMilledOn: string | null;
  labReportId: number | null;
  makeActive: boolean;
}

export async function addBatch(db: D1Database, productId: number, b: BatchInput, now = new Date()) {
  const paths = await productPaths(db, productId);
  if (!paths) return { ok: false as const, error: 'Product not found' };
  if (!/^[A-Za-z0-9-]{2,30}$/.test(b.batchCode)) return { ok: false as const, error: 'Batch codes use letters, digits and hyphens' };
  if (!DATE.test(b.packedOn) || (b.groundOrMilledOn && !DATE.test(b.groundOrMilledOn))) return { ok: false as const, error: 'Dates use YYYY-MM-DD' };
  if (b.groundOrMilledOn && b.groundOrMilledOn > b.packedOn) return { ok: false as const, error: 'Grinding/milling can’t be after packing' };
  const at = nowIso(now);
  try {
    await db.batch([
      ...(b.makeActive ? [db.prepare('UPDATE batches SET active = 0 WHERE product_id = ?').bind(productId)] : []),
      db
        .prepare(
          `INSERT INTO batches (product_id, batch_code, packed_on, ground_or_milled_on, lab_report_id, active)
           VALUES (?, ?, ?, ?, (SELECT id FROM lab_reports WHERE id = ? AND product_id = ?), ?)`,
        )
        .bind(productId, b.batchCode, b.packedOn, b.groundOrMilledOn, b.labReportId, productId, b.makeActive ? 1 : 0),
      db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').bind(at, productId),
      purgeStmt(db, paths, at),
    ]);
  } catch (err) {
    if (classifyD1Error(err) === 'unique') return { ok: false as const, error: 'This batch code already exists for the product' };
    throw err;
  }
  return { ok: true as const };
}

export async function activateBatch(db: D1Database, productId: number, batchId: number, now = new Date()) {
  const paths = await productPaths(db, productId);
  if (!paths) return { ok: false as const, error: 'Product not found' };
  const at = nowIso(now);
  const res = await db.batch([
    db.prepare('UPDATE batches SET active = 0 WHERE product_id = ?').bind(productId),
    db.prepare('UPDATE batches SET active = 1 WHERE id = ? AND product_id = ?').bind(batchId, productId),
    db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').bind(at, productId),
    purgeStmt(db, paths, at),
  ]);
  if ((res[1].meta.changes ?? 0) !== 1) return { ok: false as const, error: 'Batch not found' };
  return { ok: true as const };
}

export interface LabReportInput {
  batchCode: string;
  testedOn: string;
  labName: string;
  labAccreditation: string | null;
  testScope: string;
  summary: Record<string, string>;
  visible: boolean;
}

export async function addLabReport(db: D1Database, r2: R2Bucket, productId: number, l: LabReportInput, pdf: File | null, now = new Date()) {
  const paths = await productPaths(db, productId);
  if (!paths) return { ok: false as const, error: 'Product not found' };
  if (!l.batchCode.trim() || !l.labName.trim() || !DATE.test(l.testedOn)) return { ok: false as const, error: 'Batch code, lab name and test date are required' };
  if (pdf && (pdf.type !== 'application/pdf' || pdf.size > MAX_PDF_BYTES)) return { ok: false as const, error: 'Upload the report as a PDF of 10 MB or less' };
  let key: string | null = null;
  if (pdf) {
    key = `lab-reports/${productId}/${now.getTime()}-${rand()}.pdf`;
    await r2.put(key, await pdf.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf', contentDisposition: 'inline' } });
  }
  const at = nowIso(now);
  const res = await db.batch([
    db
      .prepare(
        `INSERT INTO lab_reports (product_id, batch_code, tested_on, lab_name, lab_accreditation, test_scope, summary, pdf_r2_key, visible)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(productId, l.batchCode.trim(), l.testedOn, l.labName.trim(), trimOrNull(l.labAccreditation), l.testScope.trim(), JSON.stringify(l.summary), key, l.visible ? 1 : 0),
    db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').bind(at, productId),
    purgeStmt(db, paths, at),
  ]);
  return { ok: true as const, id: res[0].meta.last_row_id };
}

export async function setLabReportVisible(db: D1Database, productId: number, reportId: number, visible: boolean, now = new Date()) {
  const paths = await productPaths(db, productId);
  if (!paths) return { ok: false as const, error: 'Product not found' };
  const at = nowIso(now);
  const res = await db.batch([
    db.prepare('UPDATE lab_reports SET visible = ? WHERE id = ? AND product_id = ?').bind(visible ? 1 : 0, reportId, productId),
    db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').bind(at, productId),
    purgeStmt(db, paths, at),
  ]);
  return (res[0].meta.changes ?? 0) === 1 ? { ok: true as const } : { ok: false as const, error: 'Report not found' };
}

const CERT_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

export async function setCertificate(db: D1Database, r2: R2Bucket, productId: number, file: File, now = new Date()) {
  const paths = await productPaths(db, productId);
  if (!paths) return { ok: false as const, error: 'Product not found' };
  const ext = CERT_TYPES[file.type];
  if (!ext || file.size > MAX_PDF_BYTES) return { ok: false as const, error: 'Upload a PDF, JPEG or PNG of 10 MB or less' };
  const key = `certificates/${productId}/${now.getTime()}-${rand()}.${ext}`;
  await r2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const at = nowIso(now);
  await db.batch([
    db.prepare('UPDATE products SET organic_cert_r2_key = ?, updated_at = ? WHERE id = ?').bind(key, at, productId),
    purgeStmt(db, paths, at),
  ]);
  return { ok: true as const, key };
}

// ── admin reads ────────────────────────────────────────────────────────────

export async function getProductForAdmin(db: D1Database, id: number) {
  const row = await db
    .prepare(
      `SELECT p.*, c.slug AS category_slug, c.name AS category_name, c.google_product_category AS category_google
       FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?`,
    )
    .bind(id)
    .first<ProductRow>();
  if (!row) return null;
  const [variants, images, batches, labReports] = await Promise.all([
    db.prepare('SELECT * FROM variants WHERE product_id = ? ORDER BY active DESC, sort, id').bind(id).all<VariantRow>(),
    db.prepare('SELECT id, r2_key, alt, sort FROM product_images WHERE product_id = ? ORDER BY sort, id').bind(id).all<{ id: number; r2_key: string; alt: string; sort: number }>(),
    db.prepare('SELECT * FROM batches WHERE product_id = ? ORDER BY packed_on DESC, id DESC').bind(id).all<{ id: number; batch_code: string; packed_on: string; ground_or_milled_on: string | null; lab_report_id: number | null; active: number }>(),
    db.prepare('SELECT * FROM lab_reports WHERE product_id = ? ORDER BY tested_on DESC, id DESC').bind(id).all<{ id: number; batch_code: string; tested_on: string; lab_name: string; lab_accreditation: string | null; test_scope: string; summary: string; pdf_r2_key: string | null; visible: number }>(),
  ]);
  return {
    product: mapProduct(row),
    publishedAt: row.published_at,
    certKey: row.organic_cert_r2_key,
    replacementProductId: row.replacement_product_id,
    variants: variants.results,
    images: images.results,
    batches: batches.results,
    labReports: labReports.results,
  };
}

export interface AdminProductRow {
  id: number;
  name: string;
  slug: string;
  categorySlug: string;
  status: string;
  stock: number;
  activeVariants: number;
  lowStock: number;
  images: number;
  batchCode: string | null;
  packedOn: string | null;
  bestBeforeDays: number | null;
  updatedAt: string;
}

export async function listProductsForAdmin(db: D1Database): Promise<AdminProductRow[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.slug, c.slug AS categorySlug, p.status, p.best_before_days AS bestBeforeDays, p.updated_at AS updatedAt,
              COALESCE((SELECT SUM(stock_qty) FROM variants v WHERE v.product_id = p.id AND v.active = 1), 0) AS stock,
              (SELECT count(*) FROM variants v WHERE v.product_id = p.id AND v.active = 1) AS activeVariants,
              (SELECT count(*) FROM variants v WHERE v.product_id = p.id AND v.active = 1 AND v.stock_qty <= v.low_stock_threshold) AS lowStock,
              (SELECT count(*) FROM product_images i WHERE i.product_id = p.id) AS images,
              b.batch_code AS batchCode, b.packed_on AS packedOn
       FROM products p JOIN categories c ON c.id = p.category_id
       LEFT JOIN batches b ON b.product_id = p.id AND b.active = 1
       ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, c.sort, p.name`,
    )
    .all<AdminProductRow>();
  return results;
}

/**
 * FSSAI e-commerce guidance: at least 30% of shelf life (or 45 days) must remain
 * at delivery. Warn when the active batch is getting close (assumes ~7 days to deliver).
 */
export function shelfLifeWarning(packedOn: string | null, bestBeforeDays: number | null, today: Date): string | null {
  if (!packedOn || !bestBeforeDays) return null;
  const expires = Date.parse(`${packedOn}T00:00:00+05:30`) + bestBeforeDays * 86_400_000;
  const remainingAtDelivery = (expires - (today.getTime() + 7 * 86_400_000)) / 86_400_000;
  const needed = Math.max(bestBeforeDays * 0.3, Math.min(45, bestBeforeDays));
  return remainingAtDelivery < needed ? `Batch packed ${packedOn} may arrive with too little shelf life left — switch to a newer batch` : null;
}

// ── request parsing ────────────────────────────────────────────────────────

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const numOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : num(v, Number.NaN));
const bool = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';
const record = (v: unknown): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => k.trim() && typeof x === 'string' && x.trim()).map(([k, x]) => [k.trim(), (x as string).trim()]))
    : {};
const oneOf = <T extends string>(v: unknown, xs: readonly T[], d: T): T => (xs.includes(v as T) ? (v as T) : d);

/** Coerces an untrusted JSON body into a ProductInput; validation happens in validateProduct. */
export function coerceProductInput(raw: unknown): ProductInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const nutrition = (r.nutrition && typeof r.nutrition === 'object' ? r.nutrition : {}) as Record<string, unknown>;
  return {
    categorySlug: str(r.categorySlug),
    slug: str(r.slug).trim(),
    name: str(r.name),
    shortDescription: str(r.shortDescription),
    descriptionMd: str(r.descriptionMd),
    status: oneOf(r.status, ['draft', 'active', 'discontinued'] as const, 'draft'),
    replacementProductId: numOrNull(r.replacementProductId),
    organicScheme: oneOf(r.organicScheme, ['none', 'pgs_green', 'pgs_organic', 'npop'] as const, 'none'),
    organicConversionSince: numOrNull(r.organicConversionSince),
    organicCertNumber: strOrNull(r.organicCertNumber),
    processClaims: Array.isArray(r.processClaims)
      ? r.processClaims.map((c) => ({ code: str((c as Record<string, unknown>)?.code).trim(), text: str((c as Record<string, unknown>)?.text), evidence_note: str((c as Record<string, unknown>)?.evidence_note) }))
      : [],
    howItsMade: record(r.howItsMade),
    harvestInfo: record(r.harvestInfo),
    attributes: record(r.attributes),
    faq: Array.isArray(r.faq) ? r.faq.map((f) => ({ q: str((f as Record<string, unknown>)?.q), a: str((f as Record<string, unknown>)?.a) })) : [],
    bestBeforeDays: numOrNull(r.bestBeforeDays),
    storageInstructions: str(r.storageInstructions),
    countryOfOrigin: str(r.countryOfOrigin, 'India'),
    ingredients: str(r.ingredients),
    allergenInfo: strOrNull(r.allergenInfo),
    vegMark: r.vegMark === undefined ? true : bool(r.vegMark),
    nutrition: {
      per: str(nutrition.per, '100 g'),
      source: strOrNull(nutrition.source),
      rows: Array.isArray(nutrition.rows)
        ? nutrition.rows.map((x) => ({ name: str((x as Record<string, unknown>)?.name), amount: str((x as Record<string, unknown>)?.amount) }))
        : [],
    },
    hsnCode: str(r.hsnCode).trim(),
    gstRateBp: num(r.gstRateBp, Number.NaN),
    perishable: bool(r.perishable),
    codAllowed: bool(r.codAllowed),
    seasonStartMd: strOrNull(r.seasonStartMd),
    seasonEndMd: strOrNull(r.seasonEndMd),
    offSeasonMode: r.offSeasonMode === 'notify' || r.offSeasonMode === 'preorder' ? r.offSeasonMode : null,
    preorderDispatchDate: strOrNull(r.preorderDispatchDate),
    seoTitle: strOrNull(r.seoTitle),
    seoDescription: strOrNull(r.seoDescription),
    relatedProductIds: Array.isArray(r.relatedProductIds) ? r.relatedProductIds.map((x) => num(x, Number.NaN)).filter(Number.isInteger) : [],
  };
}

export function coerceVariantInputs(raw: unknown): VariantInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x, i) => {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const id = numOrNull(r.id);
    return {
      ...(id !== null && Number.isInteger(id) ? { id } : {}),
      sku: str(r.sku).trim().toUpperCase(),
      label: str(r.label),
      netQtyLabel: str(r.netQtyLabel),
      unitQtyG: num(r.unitQtyG, Number.NaN),
      pricePaise: num(r.pricePaise, Number.NaN),
      mrpPaise: num(r.mrpPaise, Number.NaN),
      weightG: num(r.weightG, Number.NaN),
      lengthCm: num(r.lengthCm, Number.NaN),
      breadthCm: num(r.breadthCm, Number.NaN),
      heightCm: num(r.heightCm, Number.NaN),
      stockAdjust: num(r.stockAdjust, 0),
      lowStockThreshold: num(r.lowStockThreshold, 5),
      active: r.active === undefined ? true : bool(r.active),
      sort: num(r.sort, i),
    };
  });
}
