/**
 * Catalog read layer: D1 rows → typed products for pages, SEO, feed and admin.
 * Only `active` products with `active` variants are ever shown to shoppers.
 */
import { availability, inSeason, type Availability } from './availability';
import type { OrganicScheme, ProcessClaim } from './claims';
import { formatUnitPrice, type Paise } from './money';
import { publishedReviews, reviewSummary, type PublicReview, type ReviewSummary } from './reviews';
import { mediaUrl, productPath } from './urls';
import { parseZones, sellableZone, zoneIdOf, type Zone } from './zones';

export type ProductStatus = 'draft' | 'active' | 'discontinued';

export interface Faq { q: string; a: string }
export interface Nutrient { name: string; amount: string }
/** Measured nutrition, e.g. { per: '100 g', source: 'Lab report WK-2610', rows: [{ name: 'Dietary fibre', amount: '3.2 g' }] }. */
export interface Nutrition { per: string; source: string | null; rows: Nutrient[] }

export interface ProductRow {
  id: number;
  category_id: number;
  category_slug: string;
  category_name: string;
  category_google: string | null;
  slug: string;
  name: string;
  short_description: string;
  description_md: string;
  status: ProductStatus;
  replacement_product_id: number | null;
  organic_scheme: OrganicScheme;
  organic_conversion_since: number | null;
  organic_cert_number: string | null;
  organic_cert_r2_key: string | null;
  process_claims: string;
  how_its_made: string;
  harvest_info: string;
  attributes: string;
  faq: string;
  best_before_days: number | null;
  storage_instructions: string;
  country_of_origin: string;
  ingredients: string;
  allergen_info: string | null;
  veg_mark: number;
  nutrition: string;
  hsn_code: string;
  gst_rate_bp: number;
  perishable: number;
  delivery_zone: string | null;
  cod_allowed: number;
  season_start_md: string | null;
  season_end_md: string | null;
  off_season_mode: 'notify' | 'preorder' | null;
  preorder_dispatch_date: string | null;
  seo_title: string | null;
  seo_description: string | null;
  related_product_ids: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface VariantRow {
  id: number;
  product_id: number;
  sku: string;
  label: string;
  net_qty_label: string;
  unit_qty_g: number;
  price_paise: number;
  mrp_paise: number;
  currency: string;
  weight_g: number;
  length_cm: number;
  breadth_cm: number;
  height_cm: number;
  stock_qty: number;
  low_stock_threshold: number;
  active: number;
  sort: number;
}

export interface Variant {
  id: number;
  sku: string;
  label: string;
  netQtyLabel: string;
  unitQtyG: number;
  price: Paise;
  mrp: Paise;
  /** Legal Metrology unit sale price, e.g. "₹1.20/g" (under 1 kg) or "₹139.80/kg". */
  unitPrice: string;
  stockQty: number;
  availability: Availability;
}

export interface Image { key: string; url: string; alt: string }

export interface LabReport {
  id: number;
  batchCode: string;
  testedOn: string;
  labName: string;
  labAccreditation: string | null;
  testScope: string;
  summary: Record<string, unknown>;
  pdfUrl: string | null;
}

export interface Batch {
  batchCode: string;
  packedOn: string;
  groundOrMilledOn: string | null;
  labReport: LabReport | null;
}

export interface Product {
  id: number;
  slug: string;
  category: { id: number; slug: string; name: string; googleCategory: string | null };
  path: string;
  name: string;
  shortDescription: string;
  descriptionMd: string;
  status: ProductStatus;
  organic: { scheme: OrganicScheme; conversionSince: number | null; certNumber: string | null; certUrl: string | null };
  claims: ProcessClaim[];
  howItsMade: Record<string, string>;
  harvestInfo: Record<string, string>;
  attributes: Record<string, string>;
  faq: Faq[];
  listing: {
    bestBeforeDays: number | null;
    storage: string;
    countryOfOrigin: string;
    ingredients: string;
    allergens: string | null;
    veg: boolean;
  };
  nutrition: Nutrition;
  hsnCode: string;
  gstRateBp: number;
  perishable: boolean;
  /** v2: the delivery zone a perishable is sold in (`products.delivery_zone`). */
  deliveryZoneId: string | null;
  codAllowed: boolean;
  season: { startMd: string | null; endMd: string | null; offSeasonMode: 'notify' | 'preorder' | null; preorderDispatchDate: string | null };
  seoTitle: string | null;
  seoDescription: string | null;
  relatedIds: number[];
  updatedAt: string;
}

export interface ProductCard {
  id: number;
  slug: string;
  categorySlug: string;
  path: string;
  name: string;
  shortDescription: string;
  claims: ProcessClaim[];
  image: Image | null;
  fromPrice: Paise | null;
  fromMrp: Paise | null;
  fromUnitPrice: string | null;
  availability: Availability;
  variantCount: number;
  /** A perishable in season whose delivery zone isn't selling: "not delivering yet", not "out of season". */
  zoneClosed: boolean;
}

// ── mapping ────────────────────────────────────────────────────────────────

function json<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

const strRecord = (raw: string): Record<string, string> => {
  const o = json<Record<string, unknown>>(raw, {});
  return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string' && v.trim() !== '')) as Record<string, string>;
};

export function mapProduct(r: ProductRow): Product {
  const n = json<{ per?: unknown; source?: unknown; rows?: unknown }>(r.nutrition, {});
  const nutrition: Nutrition = {
    per: typeof n.per === 'string' && n.per.trim() ? n.per : '100 g',
    source: typeof n.source === 'string' && n.source.trim() ? n.source : null,
    rows: Array.isArray(n.rows)
      ? (n.rows as Nutrient[]).filter((x) => x && typeof x.name === 'string' && typeof x.amount === 'string' && x.name.trim() && x.amount.trim())
      : [],
  };
  return {
    id: r.id,
    slug: r.slug,
    category: { id: r.category_id, slug: r.category_slug, name: r.category_name, googleCategory: r.category_google },
    path: productPath(r.category_slug, r.slug),
    name: r.name,
    shortDescription: r.short_description,
    descriptionMd: r.description_md,
    status: r.status,
    organic: {
      scheme: r.organic_scheme,
      conversionSince: r.organic_conversion_since,
      certNumber: r.organic_cert_number,
      certUrl: r.organic_cert_r2_key ? mediaUrl(r.organic_cert_r2_key) : null,
    },
    claims: json<ProcessClaim[]>(r.process_claims, []).filter((c) => c && typeof c.code === 'string'),
    howItsMade: strRecord(r.how_its_made),
    harvestInfo: strRecord(r.harvest_info),
    attributes: strRecord(r.attributes),
    faq: json<Faq[]>(r.faq, []).filter((f) => f && typeof f.q === 'string' && typeof f.a === 'string' && f.q.trim() && f.a.trim()),
    listing: {
      bestBeforeDays: r.best_before_days,
      storage: r.storage_instructions,
      countryOfOrigin: r.country_of_origin,
      ingredients: r.ingredients,
      allergens: r.allergen_info,
      veg: r.veg_mark === 1,
    },
    nutrition,
    hsnCode: r.hsn_code,
    gstRateBp: r.gst_rate_bp,
    perishable: r.perishable === 1,
    deliveryZoneId: zoneIdOf(r.delivery_zone),
    codAllowed: r.cod_allowed === 1,
    season: {
      startMd: r.season_start_md,
      endMd: r.season_end_md,
      offSeasonMode: r.off_season_mode,
      preorderDispatchDate: r.preorder_dispatch_date,
    },
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    relatedIds: json<unknown[]>(r.related_product_ids, []).filter((n): n is number => Number.isInteger(n)),
    updatedAt: r.updated_at,
  };
}

/**
 * `zones` (setting `delivery_zones`): a perishable is buyable only while its
 * zone is enabled; otherwise it reads as "notify" everywhere (buy box, JSON-LD,
 * feed), and its URL keeps answering 200.
 */
export function mapVariant(v: VariantRow, p: Product, today: Date, zones: Zone[]): Variant | null {
  const a0 = availability(
    {
      status: p.status,
      seasonStartMd: p.season.startMd,
      seasonEndMd: p.season.endMd,
      offSeasonMode: p.season.offSeasonMode,
      preorderDispatchDate: p.season.preorderDispatchDate,
      variantActive: v.active === 1,
      stockQty: v.stock_qty,
    },
    today,
  );
  if (!a0) return null;
  const a = a0 !== 'notify' && !sellableZone(p, zones).sellable ? 'notify' : a0;
  return {
    id: v.id,
    sku: v.sku,
    label: v.label,
    netQtyLabel: v.net_qty_label,
    unitQtyG: v.unit_qty_g,
    price: v.price_paise,
    mrp: v.mrp_paise,
    unitPrice: formatUnitPrice(v.price_paise, v.unit_qty_g),
    stockQty: v.stock_qty,
    // v1 doesn't sell pre-orders yet (v2: separate prepaid cart), so they
    // behave as "notify" everywhere — buy box, JSON-LD and feed agree.
    availability: a === 'preorder' ? 'notify' : a,
  };
}

const RANK: Record<Availability, number> = { buy: 0, preorder: 1, sold_out: 2, notify: 3 };

/** The best state any variant offers (a card shows "Buy" if any pack can be bought). */
export function bestAvailability(vs: Variant[]): Availability {
  return vs.reduce<Availability>((best, v) => (RANK[v.availability] < RANK[best] ? v.availability : best), 'notify');
}

/** Cheapest buyable variant, else cheapest of any. */
export function fromVariant(vs: Variant[]): Variant | null {
  const pool = vs.some((v) => v.availability === 'buy') ? vs.filter((v) => v.availability === 'buy') : vs;
  return pool.reduce<Variant | null>((min, v) => (!min || v.price < min.price ? v : min), null);
}

// ── queries ────────────────────────────────────────────────────────────────

/** Delivery zones from settings ([] when unset: then no perishable is buyable). */
export async function loadZones(db: D1Database): Promise<Zone[]> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'delivery_zones'").first<{ value: string }>();
  return row ? parseZones(row.value) : [];
}

const PRODUCT_SELECT = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name, c.google_product_category AS category_google
  FROM products p JOIN categories c ON c.id = p.category_id`;

function chunks<T>(xs: T[], n = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function variantsFor(db: D1Database, ids: number[]): Promise<Map<number, VariantRow[]>> {
  const out = new Map<number, VariantRow[]>();
  for (const part of chunks(ids)) {
    if (!part.length) continue;
    const { results } = await db
      .prepare(`SELECT * FROM variants WHERE product_id IN (${part.map(() => '?').join(',')}) ORDER BY sort, price_paise, id`)
      .bind(...part)
      .all<VariantRow>();
    for (const v of results) out.set(v.product_id, [...(out.get(v.product_id) ?? []), v]);
  }
  return out;
}

async function imagesFor(db: D1Database, ids: number[]): Promise<Map<number, Image[]>> {
  const out = new Map<number, Image[]>();
  for (const part of chunks(ids)) {
    if (!part.length) continue;
    const { results } = await db
      .prepare(`SELECT product_id, r2_key, alt FROM product_images WHERE product_id IN (${part.map(() => '?').join(',')}) ORDER BY sort, id`)
      .bind(...part)
      .all<{ product_id: number; r2_key: string; alt: string }>();
    for (const i of results)
      out.set(i.product_id, [...(out.get(i.product_id) ?? []), { key: i.r2_key, url: mediaUrl(i.r2_key), alt: i.alt }]);
  }
  return out;
}

function toCard(p: Product, vs: Variant[], images: Image[], zoneClosed = false): ProductCard {
  const from = fromVariant(vs);
  return {
    id: p.id,
    slug: p.slug,
    categorySlug: p.category.slug,
    path: p.path,
    name: p.name,
    shortDescription: p.shortDescription,
    claims: p.claims,
    image: images[0] ?? null,
    fromPrice: from?.price ?? null,
    fromMrp: from?.mrp ?? null,
    fromUnitPrice: from?.unitPrice ?? null,
    availability: vs.length ? bestAvailability(vs) : 'notify',
    variantCount: vs.length,
    zoneClosed,
  };
}

/** Active products (optionally one category) that have at least one active variant. */
export async function listProducts(db: D1Database, opts: { categorySlug?: string; today: Date }): Promise<ProductCard[]> {
  const where = opts.categorySlug ? `WHERE p.status = 'active' AND c.slug = ?` : `WHERE p.status = 'active'`;
  const stmt = db.prepare(`${PRODUCT_SELECT} ${where} ORDER BY c.sort, p.name`);
  const { results } = await (opts.categorySlug ? stmt.bind(opts.categorySlug) : stmt).all<ProductRow>();
  const products = results.map(mapProduct);
  const ids = products.map((p) => p.id);
  const [variants, images, zones] = await Promise.all([variantsFor(db, ids), imagesFor(db, ids), loadZones(db)]);
  return products
    .map((p) => {
      const vs = (variants.get(p.id) ?? []).map((v) => mapVariant(v, p, opts.today, zones)).filter((v): v is Variant => v !== null);
      return { p, vs };
    })
    .filter(({ vs }) => vs.length > 0)
    .map(({ p, vs }) => toCard(p, vs, images.get(p.id) ?? [], p.perishable && !sellableZone(p, zones).sellable && inSeason(p.season.startMd, p.season.endMd, opts.today)));
}

/** Active products with their active variants — for the feed and sitemap, or just the products in `only`. */
export async function listActiveProductsWithVariants(
  db: D1Database,
  today: Date,
  only?: number[],
): Promise<Array<{ product: Product; variants: Variant[]; images: Image[]; shippingZone: Zone | null }>> {
  const rows: ProductRow[] = [];
  if (!only) rows.push(...(await db.prepare(`${PRODUCT_SELECT} WHERE p.status = 'active' ORDER BY c.sort, p.name`).all<ProductRow>()).results);
  else
    for (const part of chunks(only))
      rows.push(...(await db.prepare(`${PRODUCT_SELECT} WHERE p.status = 'active' AND p.id IN (${part.map(() => '?').join(',')}) ORDER BY c.sort, p.name`).bind(...part).all<ProductRow>()).results);
  const products = rows.map(mapProduct);
  const ids = products.map((p) => p.id);
  const [variants, images, zones] = await Promise.all([variantsFor(db, ids), imagesFor(db, ids), loadZones(db)]);
  return products
    .map((product) => ({
      product,
      variants: (variants.get(product.id) ?? []).map((v) => mapVariant(v, product, today, zones)).filter((v): v is Variant => v !== null),
      images: images.get(product.id) ?? [],
      // The zone a perishable ships to, enabled or not (the feed must never offer it elsewhere).
      shippingZone: product.perishable ? (zones.find((z) => z.id === product.deliveryZoneId) ?? null) : null,
    }))
    .filter((x) => x.variants.length > 0);
}

export type ProductPageResult =
  | {
      kind: 'ok'; product: Product; variants: Variant[]; images: Image[]; batch: Batch | null; labReports: LabReport[]; related: ProductCard[];
      /** Approved reviews only; `summary` is null (and nothing renders) until the first one. */
      reviews: { summary: ReviewSummary | null; items: PublicReview[] };
      /** The enabled zone a perishable is sold in (null: not perishable, or not on sale). */
      zone: Zone | null;
    }
  | { kind: 'redirect'; to: string }
  | { kind: 'gone' }
  | { kind: 'not_found' };

type LabRow = {
  id: number; batch_code: string; tested_on: string; lab_name: string; lab_accreditation: string | null;
  test_scope: string; summary: string; pdf_r2_key: string | null;
};

const mapLab = (r: LabRow): LabReport => ({
  id: r.id,
  batchCode: r.batch_code,
  testedOn: r.tested_on,
  labName: r.lab_name,
  labAccreditation: r.lab_accreditation,
  testScope: r.test_scope,
  summary: json<Record<string, unknown>>(r.summary, {}),
  pdfUrl: r.pdf_r2_key ? mediaUrl(r.pdf_r2_key) : null,
});

export async function getProductPage(db: D1Database, categorySlug: string, slug: string, today: Date): Promise<ProductPageResult> {
  const row = await db
    .prepare(`${PRODUCT_SELECT} WHERE c.slug = ? AND p.slug = ?`)
    .bind(categorySlug, slug)
    .first<ProductRow>();
  if (!row || row.status === 'draft') return { kind: 'not_found' };

  if (row.status === 'discontinued') {
    if (row.replacement_product_id) {
      const rep = await db
        .prepare(`${PRODUCT_SELECT} WHERE p.id = ? AND p.status = 'active'`)
        .bind(row.replacement_product_id)
        .first<ProductRow>();
      if (rep) return { kind: 'redirect', to: productPath(rep.category_slug, rep.slug) };
    }
    return { kind: 'gone' };
  }

  const product = mapProduct(row);
  const [variantRows, images, batchRow, labRows, summary, reviewItems, zones] = await Promise.all([
    variantsFor(db, [product.id]).then((m) => m.get(product.id) ?? []),
    imagesFor(db, [product.id]).then((m) => m.get(product.id) ?? []),
    db
      .prepare(
        `SELECT b.batch_code, b.packed_on, b.ground_or_milled_on, l.id AS lab_id, l.batch_code AS lab_batch, l.tested_on, l.lab_name,
                l.lab_accreditation, l.test_scope, l.summary, l.pdf_r2_key, l.visible
         FROM batches b LEFT JOIN lab_reports l ON l.id = b.lab_report_id
         WHERE b.product_id = ? AND b.active = 1`,
      )
      .bind(product.id)
      .first<{
        batch_code: string; packed_on: string; ground_or_milled_on: string | null; lab_id: number | null; lab_batch: string | null;
        tested_on: string | null; lab_name: string | null; lab_accreditation: string | null; test_scope: string | null;
        summary: string | null; pdf_r2_key: string | null; visible: number | null;
      }>(),
    db
      .prepare('SELECT * FROM lab_reports WHERE product_id = ? AND visible = 1 ORDER BY tested_on DESC, id DESC')
      .bind(product.id)
      .all<LabRow>()
      .then((r) => r.results),
    reviewSummary(db, product.id),
    publishedReviews(db, product.id),
    loadZones(db),
  ]);

  const variants = variantRows.map((v) => mapVariant(v, product, today, zones)).filter((v): v is Variant => v !== null);
  if (variants.length === 0) return { kind: 'not_found' };

  const batch: Batch | null = batchRow
    ? {
        batchCode: batchRow.batch_code,
        packedOn: batchRow.packed_on,
        groundOrMilledOn: batchRow.ground_or_milled_on,
        labReport:
          batchRow.lab_id && batchRow.visible === 1
            ? mapLab({
                id: batchRow.lab_id,
                batch_code: batchRow.lab_batch ?? batchRow.batch_code,
                tested_on: batchRow.tested_on ?? '',
                lab_name: batchRow.lab_name ?? '',
                lab_accreditation: batchRow.lab_accreditation,
                test_scope: batchRow.test_scope ?? '',
                summary: batchRow.summary ?? '{}',
                pdf_r2_key: batchRow.pdf_r2_key,
              })
            : null,
      }
    : null;

  const all = await listProducts(db, { today });
  const others = all.filter((c) => c.id !== product.id);
  const picked = product.relatedIds.map((id) => others.find((c) => c.id === id)).filter((c): c is ProductCard => Boolean(c));
  const related = [...picked, ...others.filter((c) => c.categorySlug === product.category.slug && !picked.includes(c)), ...others.filter((c) => c.categorySlug !== product.category.slug && !picked.includes(c))].slice(0, 4);

  return { kind: 'ok', product, variants, images, batch, labReports: labRows.map(mapLab), related, reviews: { summary, items: summary ? reviewItems : [] }, zone: sellableZone(product, zones).zone };
}
