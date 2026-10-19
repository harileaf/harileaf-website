/**
 * Order creation and reads (spec: Cart and Checkout, Data Model → orders).
 *
 * `createOrder` is one D1 batch: order number from the per-month counter,
 * order row, GST-snapshotted items, stock decrement + reservation per line,
 * the "created" event and any outbox rows. A short line raises the stock CHECK
 * and the whole batch rolls back; the API then re-quotes and answers 409.
 *
 * Retries are idempotent: the idempotency key is unique, and the view token
 * is derived from it (HMAC with ORDER_TOKEN_SECRET), so a retried submit gets
 * the same order and link without the server ever storing the token.
 */
import { placeOfSupplyCode, type CheckoutInput } from './checkout-input';
import { classifyD1Error, nowIso } from './db';
import { istParts } from './fy';
import { enqueueStmt } from './outbox';
import { taxForQuote, type Quote } from './quote';
import { hashViewToken, hmacHex } from './tokens';

export const RESERVATION_MINUTES = 30;

export type CreateOrderResult =
  | { ok: true; orderId: number; orderNo: string; viewToken: string; total: number; existing: boolean; status: string }
  | { ok: false; reason: 'stock' | 'inactive' | 'coupon' | 'invalid'; message: string };

/** Rev 0 is the link from the order email; each "find your order" request bumps it (migration 0004). */
export async function viewTokenFor(secret: string, idempotencyKey: string, rev = 0): Promise<string> {
  return (await hmacHex(secret, rev > 0 ? `view-token:${idempotencyKey}:${rev}` : `view-token:${idempotencyKey}`)).slice(0, 32);
}

const yymm = (at: Date) => {
  const { year, month } = istParts(at);
  return `${String(year % 100).padStart(2, '0')}${String(month).padStart(2, '0')}`;
};

export async function findByIdempotencyKey(db: D1Database, key: string) {
  return db
    .prepare('SELECT id, order_no, total_paise, status, checkout_fingerprint, razorpay_order_id, customer_name, email, phone, view_token_rev FROM orders WHERE idempotency_key = ?')
    .bind(key)
    .first<{ id: number; order_no: string; total_paise: number; status: string; checkout_fingerprint: string | null; razorpay_order_id: string | null; customer_name: string; email: string; phone: string; view_token_rev: number }>();
}

export async function createOrder(
  db: D1Database,
  input: {
    quote: Quote;
    checkout: CheckoutInput;
    idempotencyKey: string;
    sellerStateCode: string;
    tokenSecret: string;
    now: Date;
    /** checkoutFingerprint(lines, email) of this request. */
    fingerprint?: string;
    /** COD only: the order waits for the customer/admin to confirm it (setting `cod_confirmation`). */
    codConfirmationRequired?: boolean;
    /** Perishables (and V2-4 pre-orders): the day the order is due to leave the farm (YYYY-MM-DD, IST). */
    expectedDispatchDate?: string | null;
  },
): Promise<CreateOrderResult> {
  const { quote, checkout: c, idempotencyKey: key, now } = input;
  const viewToken = await viewTokenFor(input.tokenSecret, key);

  const existing = await findByIdempotencyKey(db, key);
  if (existing) {
    if (input.fingerprint && existing.checkout_fingerprint && existing.checkout_fingerprint !== input.fingerprint) return { ok: false, reason: 'invalid', message: 'Idempotency key reused for a different order' };
    return { ok: true, orderId: existing.id, orderNo: existing.order_no, viewToken: await viewTokenFor(input.tokenSecret, key, existing.view_token_rev ?? 0), total: existing.total_paise, existing: true, status: existing.status };
  }

  const lines = quote.lines.filter((l) => l.qty > 0);
  if (!quote.ok || !lines.length) return { ok: false, reason: 'invalid', message: 'Cart has changed' };
  if (quote.coupon && !quote.coupon.ok) return { ok: false, reason: 'coupon', message: quote.coupon.message };
  const couponCode = quote.coupon?.ok ? quote.coupon.code : null;
  // A pre-order cart dispatches when its latest product does.
  const preorderDate = lines.map((l) => l.preorderDate).filter((d): d is string => Boolean(d)).sort().pop() ?? null;
  if (preorderDate && c.paymentMethod === 'cod') return { ok: false, reason: 'invalid', message: 'Pre-orders are prepaid' };

  const at = nowIso(now);
  const intra = placeOfSupplyCode(c) === input.sellerStateCode;
  const taxes = taxForQuote(quote, intra);
  const gst = taxes.reduce((a, t) => a + t.cgst + t.sgst + t.igst, 0);
  const cod = c.paymentMethod === 'cod';
  const ym = yymm(now);
  const expires = new Date(now.getTime() + RESERVATION_MINUTES * 60_000).toISOString();
  const idQ = '(SELECT id FROM orders WHERE idempotency_key = ?)';
  const b = c.bill;

  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT OR IGNORE INTO order_counters (yymm, last_no) VALUES (?, 0)').bind(ym),
    db.prepare('UPDATE order_counters SET last_no = last_no + 1 WHERE yymm = ?').bind(ym),
    db
      .prepare(
        `INSERT INTO orders (
           order_no, view_token_hash, idempotency_key, status, payment_method, payment_status,
           customer_name, email, phone, marketing_opt_in,
           ship_line1, ship_line2, ship_city, ship_state, ship_state_code, ship_pincode,
           bill_same_as_ship, bill_name, bill_line1, bill_line2, bill_city, bill_state, bill_state_code, bill_pincode,
           buyer_gstin, buyer_legal_name, subtotal_paise, discount_paise, gst_paise, total_paise, created_at, updated_at, checkout_fingerprint, cod_confirmed_at, coupon_code, expected_dispatch_date, is_preorder)
         VALUES ('HL-' || ?1 || '-' || printf('%04d', (SELECT last_no FROM order_counters WHERE yymm = ?1)),
           ?2, ?3, ?4, ?5, 'unpaid', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
           ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?30, ?31, ?32, ?33, ?34, ?35)`,
      )
      .bind(
        ym, await hashViewToken(input.tokenSecret, viewToken), key, cod ? 'placed' : 'pending_payment', c.paymentMethod,
        c.contact.name, c.contact.email, c.contact.phone, c.contact.marketingOptIn ? 1 : 0,
        c.ship.line1, c.ship.line2, c.ship.city, c.ship.state, c.ship.stateCode, c.ship.pincode,
        b ? 0 : 1, b?.name ?? null, b?.line1 ?? null, b?.line2 ?? null, b?.city ?? null, b?.state ?? null, b?.stateCode ?? null, b?.pincode ?? null,
        c.buyerGstin, c.buyerLegalName, quote.subtotal, quote.discount, gst, quote.total, at, input.fingerprint ?? null,
        cod && !input.codConfirmationRequired ? at : null, couponCode, preorderDate ?? input.expectedDispatchDate ?? null, preorderDate ? 1 : 0,
      ),
  ];
  if (couponCode) {
    // Counted by trigger; the usage CHECK / one-per-phone UNIQUE abort the whole order if the code ran out.
    const perPhone = await db.prepare('SELECT one_per_phone FROM coupons WHERE code = ?').bind(couponCode).first<{ one_per_phone: number }>();
    stmts.push(
      db
        .prepare(`INSERT INTO coupon_redemptions (coupon_code, order_id, phone, created_at) VALUES (?, ${idQ}, ?, ?)`)
        .bind(couponCode, key, perPhone?.one_per_phone ? c.contact.phone : null, at),
    );
  }

  lines.forEach((l, i) => {
    const t = taxes[i];
    stmts.push(
      db
        .prepare(
          `INSERT INTO order_items (order_id, variant_id, product_name, variant_label, sku, hsn_code, gst_rate_bp, unit_price_paise, mrp_paise,
             qty, discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, line_total_paise, perishable)
           VALUES (${idQ}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(key, l.variantId, l.name, l.label, l.sku, l.hsnCode, l.gstRateBp, l.unitPrice, l.mrp, l.qty, l.discount, t.taxable, t.cgst, t.sgst, t.igst, l.lineTotal, l.perishable ? 1 : 0),
      db.prepare('UPDATE variants SET stock_qty = stock_qty - ? WHERE id = ?').bind(l.qty, l.variantId),
      db
        .prepare(`INSERT INTO stock_reservations (variant_id, order_id, qty, expires_at, state) VALUES (?, ${idQ}, ?, ?, ?)`)
        .bind(l.variantId, key, l.qty, expires, cod ? 'consumed' : 'held'),
    );
  });

  stmts.push(
    db
      .prepare(`INSERT INTO order_events (order_id, at, type, actor, note) VALUES (${idQ}, ?, ?, 'customer', ?)`)
      .bind(key, at, cod ? 'placed' : 'created', cod ? 'Cash on delivery' : 'Awaiting online payment'),
  );
  if (cod) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at)
           VALUES (${idQ.replace('?', '?1')}, 'email.placed', '{}', 'pending', 0, ?2, ?2, ?2), (${idQ.replace('?', '?1')}, 'email.owner_new_order', '{}', 'pending', 0, ?2, ?2, ?2),
                  (${idQ.replace('?', '?1')}, 'shiprocket.create', '{}', 'pending', 0, ?2, ?2, ?2)`,
        )
        .bind(key, at),
    );
  }
  stmts.push(db.prepare('SELECT id, order_no FROM orders WHERE idempotency_key = ?').bind(key));

  try {
    const res = await db.batch<{ id: number; order_no: string }>(stmts);
    const row = res[res.length - 1].results[0];
    return { ok: true, orderId: row.id, orderNo: row.order_no, viewToken, total: quote.total, existing: false, status: cod ? 'placed' : 'pending_payment' };
  } catch (err) {
    const kind = classifyD1Error(err);
    if (kind === 'unique' && /idempotency_key/.test(String(err))) {
      // A concurrent identical submit won the race — return its order.
      const won = await findByIdempotencyKey(db, key);
      if (won) return { ok: true, orderId: won.id, orderNo: won.order_no, viewToken, total: won.total_paise, existing: true, status: won.status };
    }
    if (kind === 'stock') return { ok: false, reason: 'stock', message: 'Some items sold out while you were checking out' };
    if (kind === 'inactive') return { ok: false, reason: 'inactive', message: 'An item is no longer available' };
    if (kind === 'coupon') return { ok: false, reason: 'coupon', message: 'Your discount code can no longer be used' };
    throw err;
  }
}

// ── reads ─────────────────────────────────────────────────────────────────

export interface OrderRow {
  id: number; order_no: string; view_token_hash: string; idempotency_key: string | null; status: string; payment_method: 'razorpay' | 'cod'; payment_status: string;
  customer_name: string; email: string; phone: string; marketing_opt_in: number;
  ship_line1: string; ship_line2: string | null; ship_city: string; ship_state: string; ship_state_code: string; ship_pincode: string;
  bill_same_as_ship: number; bill_name: string | null; bill_line1: string | null; bill_line2: string | null; bill_city: string | null;
  bill_state: string | null; bill_state_code: string | null; bill_pincode: string | null; buyer_gstin: string | null; buyer_legal_name: string | null;
  subtotal_paise: number; discount_paise: number; gst_paise: number; total_paise: number; coupon_code?: string | null;
  razorpay_order_id: string | null; razorpay_payment_id: string | null; paid_at: string | null;
  shiprocket_order_id: string | null; shiprocket_shipment_id: string | null; awb: string | null; courier: string | null; tracking_url: string | null;
  invoice_id: number | null; cancel_reason: string | null; cancelled_by: string | null; created_at: string; updated_at: string;
  /** v2: perishables / pre-orders. */
  expected_dispatch_date?: string | null; is_preorder?: number;
  /** Migration 0004: when a COD order was confirmed (customer or admin). */
  cod_confirmed_at?: string | null;
  /** Migration 0004: order-link revision (see viewTokenFor). */
  view_token_rev?: number;
}

export interface OrderItemRow {
  id: number; variant_id: number; product_name: string; variant_label: string; sku: string; hsn_code: string; gst_rate_bp: number;
  unit_price_paise: number; mrp_paise: number; qty: number; discount_paise: number; taxable_paise: number;
  cgst_paise: number; sgst_paise: number; igst_paise: number; line_total_paise: number; perishable: number;
}

export async function getOrderByNo(db: D1Database, orderNo: string) {
  if (!/^HL-\d{4}-\d{4,}$/.test(orderNo)) return null;
  const order = await db.prepare('SELECT * FROM orders WHERE order_no = ?').bind(orderNo).first<OrderRow>();
  if (!order) return null;
  const [items, events, reservation] = await Promise.all([
    db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(order.id).all<OrderItemRow>(),
    db.prepare('SELECT at, type, actor, note FROM order_events WHERE order_id = ? ORDER BY at, id').bind(order.id).all<{ at: string; type: string; actor: string; note: string | null }>(),
    db.prepare("SELECT MIN(expires_at) AS expires_at FROM stock_reservations WHERE order_id = ? AND state = 'held'").bind(order.id).first<{ expires_at: string | null }>(),
  ]);
  return { order, items: items.results, events: events.results, holdExpiresAt: reservation?.expires_at ?? null };
}

/** Outbox statement helper re-exported for callers building order batches. */
export { enqueueStmt };
