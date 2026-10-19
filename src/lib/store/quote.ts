/**
 * Prices a cart from D1. The browser only ever sends {variantId, qty}; every
 * price, stock level and rule here comes from the database. Used by the cart
 * page, checkout and order creation (which re-quotes inside the request).
 */
import { mapProduct, mapVariant, type ProductRow, type VariantRow } from './catalog';
import { sanitizeLines, type CartLine } from './cart-lines';
import { evaluateCoupon, getCoupon, normalizeCode, phoneHasUsed, type CouponResult } from './coupons';
import { splitTax, type TaxLine } from './gst';
import type { Paise } from './money';
import type { StoreSettings } from './settings';
import { mediaUrl, productPath } from './urls';
import { parseZones } from './zones';

export type LineProblem = 'unavailable' | 'out_of_stock' | 'limited';

export interface QuoteLine {
  variantId: number;
  productId: number;
  sku: string;
  name: string;
  label: string;
  path: string;
  image: { url: string; alt: string } | null;
  categoryId: number;
  requestedQty: number;
  qty: number;
  unitPrice: Paise;
  mrp: Paise;
  /** unitPrice × qty, before any coupon. */
  grossTotal: Paise;
  /** This line's share of the coupon discount (largest-remainder split). */
  discount: Paise;
  /** What the shopper pays for the line: grossTotal − discount. */
  lineTotal: Paise;
  gstRateBp: number;
  hsnCode: string;
  perishable: boolean;
  codAllowed: boolean;
  weightG: number;
  dims: { l: number; b: number; h: number };
  problem: LineProblem | null;
  available: number;
}

export interface Quote {
  lines: QuoteLine[];
  /** Before any discount. */
  subtotal: Paise;
  discount: Paise;
  total: Paise;
  /** The code the shopper applied and whether it worked (null = none applied). */
  coupon: CouponResult | null;
  itemCount: number;
  minOrder: Paise;
  meetsMinimum: boolean;
  cod: { eligible: boolean; reason: string | null; max: Paise };
  /** True when every line can be bought as asked and the minimum is met. */
  ok: boolean;
}

const settingPaise = (v: string, d: number) => (/^\d+$/.test(v) ? Number(v) : d);

export async function quoteCart(
  db: D1Database,
  raw: unknown,
  opts: { today: Date; settings: StoreSettings; coupon?: unknown; phone?: string | null },
): Promise<Quote> {
  const wanted: CartLine[] = sanitizeLines(raw);
  const minOrder = settingPaise(opts.settings.min_order_paise, 0);
  const codMax = settingPaise(opts.settings.cod_max_order_paise, 0);
  const lines: QuoteLine[] = [];
  const zones = parseZones(opts.settings.delivery_zones);

  if (wanted.length) {
    const ids = wanted.map((l) => l.variantId);
    const { results } = await db
      .prepare(
        `SELECT v.*, p.*, v.id AS v_id, v.active AS v_active, c.slug AS category_slug, c.name AS category_name, c.google_product_category AS category_google,
                (SELECT r2_key FROM product_images i WHERE i.product_id = p.id ORDER BY sort, id LIMIT 1) AS image_key,
                (SELECT alt FROM product_images i WHERE i.product_id = p.id ORDER BY sort, id LIMIT 1) AS image_alt
         FROM variants v JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
         WHERE v.id IN (${ids.map(() => '?').join(',')})`,
      )
      .bind(...ids)
      .all<ProductRow & VariantRow & { v_id: number; v_active: number; image_key: string | null; image_alt: string | null }>();
    const byId = new Map(results.map((r) => [r.v_id, r]));

    for (const want of wanted) {
      const r = byId.get(want.variantId);
      if (!r) continue; // unknown variant ids are dropped silently (stale cart)
      const product = mapProduct(r);
      const variantRow: VariantRow = { ...r, id: r.v_id, active: r.v_active };
      const v = mapVariant(variantRow, product, opts.today, zones);
      const buyable = v?.availability === 'buy';
      const available = buyable ? r.stock_qty : 0;
      const qty = Math.min(want.qty, available);
      const problem: LineProblem | null = !v || !buyable ? (v?.availability === 'sold_out' ? 'out_of_stock' : 'unavailable') : qty < want.qty ? 'limited' : null;
      lines.push({
        variantId: r.v_id,
        productId: product.id,
        sku: r.sku,
        name: product.name,
        label: r.label,
        path: productPath(product.category.slug, product.slug),
        image: r.image_key ? { url: mediaUrl(r.image_key), alt: r.image_alt ?? product.name } : null,
        categoryId: product.category.id,
        requestedQty: want.qty,
        qty,
        unitPrice: r.price_paise,
        mrp: r.mrp_paise,
        grossTotal: r.price_paise * qty,
        discount: 0,
        lineTotal: r.price_paise * qty,
        gstRateBp: product.gstRateBp,
        hsnCode: product.hsnCode,
        perishable: product.perishable,
        codAllowed: product.codAllowed,
        weightG: r.weight_g,
        dims: { l: r.length_cm, b: r.breadth_cm, h: r.height_cm },
        problem,
        available,
      });
    }
  }

  const subtotal = lines.reduce((a, l) => a + l.grossTotal, 0);
  const coupon = await applyCoupon(db, lines, opts);
  const discount = coupon?.ok ? coupon.discount : 0;
  const total = subtotal - discount; // no shipping or COD fee
  const itemCount = lines.reduce((a, l) => a + l.qty, 0);
  // The minimum is on the value of the goods before a coupon, so a code never invalidates a cart.
  const meetsMinimum = subtotal >= minOrder;
  const buyable = lines.filter((l) => l.qty > 0);
  const codReason = !buyable.length
    ? 'Your cart is empty'
    : buyable.some((l) => !l.codAllowed)
      ? 'Cash on delivery isn’t available for one or more items'
      : codMax > 0 && total > codMax
        ? `Cash on delivery is available on orders up to ₹${codMax / 100}`
        : null;

  return {
    lines,
    subtotal,
    discount,
    total,
    coupon,
    itemCount,
    minOrder,
    meetsMinimum,
    cod: { eligible: codReason === null, reason: codReason, max: codMax },
    ok: lines.length > 0 && lines.every((l) => l.problem === null) && meetsMinimum,
  };
}

/** Validates the applied code against the priced lines and writes each line's share. */
async function applyCoupon(db: D1Database, lines: QuoteLine[], opts: { today: Date; coupon?: unknown; phone?: string | null }): Promise<CouponResult | null> {
  if (opts.coupon === undefined || opts.coupon === null || opts.coupon === '') return null;
  const code = normalizeCode(opts.coupon);
  if (!code) return { ok: false, code: String(opts.coupon).slice(0, 24).toUpperCase(), reason: 'not_found', message: 'This code isn’t valid.' };
  const c = await getCoupon(db, code);
  const phoneUsed = Boolean(c?.one_per_phone && opts.phone && (await phoneHasUsed(db, code, opts.phone)));
  const result = evaluateCoupon(c, code, lines.map((l) => ({ lineTotal: l.grossTotal, categoryId: l.categoryId })), opts.today, { phoneUsed });
  if (result.ok) {
    lines.forEach((l, i) => {
      l.discount = result.shares[i];
      l.lineTotal = l.grossTotal - l.discount;
    });
  }
  return result;
}

/** Per-line GST for the place of supply (delivery state vs seller state). */
export function taxForQuote(quote: Quote, intraState: boolean): TaxLine[] {
  return splitTax(
    quote.lines.filter((l) => l.qty > 0).map((l) => ({ lineTotal: l.lineTotal, rateBp: l.gstRateBp })),
    intraState,
  );
}

/** Public shape for the cart/checkout pages (no internal fields). */
export function publicQuote(q: Quote) {
  return {
    ok: q.ok,
    subtotal: q.subtotal,
    discount: q.discount,
    total: q.total,
    coupon: q.coupon && (q.coupon.ok ? { ok: true, code: q.coupon.code, discount: q.coupon.discount, label: q.coupon.label } : { ok: false, code: q.coupon.code, reason: q.coupon.reason, message: q.coupon.message }),
    itemCount: q.itemCount,
    minOrder: q.minOrder,
    meetsMinimum: q.meetsMinimum,
    cod: q.cod,
    weightG: q.lines.reduce((g, l) => g + l.weightG * l.qty, 0),
    lines: q.lines.map((l) => ({
      variantId: l.variantId, name: l.name, label: l.label, path: l.path, image: l.image, qty: l.qty, requestedQty: l.requestedQty,
      unitPrice: l.unitPrice, mrp: l.mrp, grossTotal: l.grossTotal, discount: l.discount, lineTotal: l.lineTotal, problem: l.problem, available: l.available, codAllowed: l.codAllowed,
    })),
  };
}
