/**
 * Post-placement order changes (spec: Orders and Fulfilment). Each one is an
 * exactly-once `ops` claim batch whose `ok` checks the current status in SQL,
 * so admin clicks, courier webhooks and customer actions can race safely.
 * Side effects (Shiprocket, Razorpay refunds, emails) go through the outbox.
 */
import { nowIso } from './db';
import { issueDocStmts } from './docnumbers';
import { fyOf } from './fy';
import type { DocumentType } from './gst';
import { challanSnapshot, creditNoteSnapshot, invoiceSnapshot, type DocSnapshot } from './invoices';
import { claimStmt, runClaim, type ClaimResult } from './ops';
import { enqueueStmt } from './outbox';
import { findByIdempotencyKey, viewTokenFor, type OrderItemRow, type OrderRow } from './orders';
import { needsCodConfirmation } from './cod';
import { getSettings } from './settings';
import { hashViewToken } from './tokens';
import { istParts, istYmd } from './fy';

export type Actor = 'customer' | 'admin' | 'shiprocket' | 'system';
export type ActionResult = { ok: true } | { ok: false; error: string };

const FAIL = (error: string): ActionResult => ({ ok: false, error });

/**
 * A claim that lost (wrong state / already done) is an ordinary failure; any
 * other D1 error is thrown so webhooks answer 5xx and get retried.
 */
function settle(res: ClaimResult, failure: string): ActionResult {
  if (res.ok) return { ok: true };
  if (res.reason === 'other') throw res.error;
  return FAIL(failure);
}

/** Prepaid orders move only once the money is captured (an authorisation can still lapse). */
const PAID_SQL = "(payment_method = 'cod' OR payment_status = 'paid')";

async function load(db: D1Database, orderId: number) {
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<OrderRow & { replacement_for_order_id: number | null }>();
  if (!order) return null;
  const { results: items } = await db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(orderId).all<OrderItemRow>();
  return { order, items };
}

const event = (db: D1Database, orderId: number, at: string, type: string, actor: Actor, note: string | null, actorEmail?: string | null) =>
  db
    .prepare('INSERT INTO order_events (order_id, at, type, actor, actor_email, note) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(orderId, at, type, actor, actorEmail ?? null, note);

const restockStmts = (db: D1Database, items: OrderItemRow[], onlyNonPerishable: boolean) =>
  items
    .filter((i) => !onlyNonPerishable || !i.perishable)
    .map((i) => db.prepare('UPDATE variants SET stock_qty = stock_qty + ? WHERE id = ?').bind(i.qty, i.variant_id));

async function latestInvoice(db: D1Database, orderId: number) {
  return db
    .prepare("SELECT id, doc_no, issued_at, snapshot FROM invoices WHERE order_id = ? AND series = 'INV'")
    .bind(orderId)
    .first<{ id: number; doc_no: string; issued_at: string; snapshot: string }>();
}

async function creditNoteStmts(db: D1Database, orderId: number, now: Date, reason: string): Promise<D1PreparedStatement[]> {
  const inv = await latestInvoice(db, orderId);
  if (!inv) return [];
  const snap = creditNoteSnapshot(JSON.parse(inv.snapshot) as DocSnapshot, { docNo: inv.doc_no, issuedAt: inv.issued_at }, reason);
  return issueDocStmts(db, { series: 'CN', fy: fyOf(now), docType: 'credit_note', orderId, refInvoiceId: inv.id, issuedAt: nowIso(now), snapshot: snap, reason });
}

/** Seller details an invoice must carry (CGST Rule 46). */
function invoiceSettingsMissing(s: Awaited<ReturnType<typeof getSettings>>): string[] {
  return (['legal_name', 'address', 'gstin'] as const).filter((k) => !s[k].trim());
}

// ── transitions ──────────────────────────────────────────────────────────

/** Packed and ready to dispatch: issues the GST invoice in the same batch (CGST s.31(1)(a)). */
export async function markPacked(db: D1Database, orderId: number, ctx: { now: Date; actor?: Actor; actorEmail?: string | null }): Promise<ActionResult> {
  return pack(db, orderId, ctx, false);
}

/**
 * Pre-orders (v2): "Ready to dispatch" is their pack — the invoice is issued and,
 * in the same batch, the order goes to Shiprocket and the customer is emailed.
 * Nothing reaches Shiprocket before this (the create handler skips pre-orders
 * that aren't ready), and plain "pack" is refused for pre-orders.
 */
export async function readyToDispatch(db: D1Database, orderId: number, ctx: { now: Date; actorEmail?: string | null }): Promise<ActionResult> {
  return pack(db, orderId, { ...ctx, actor: 'admin' }, true);
}

async function pack(db: D1Database, orderId: number, ctx: { now: Date; actor?: Actor; actorEmail?: string | null }, ready: boolean): Promise<ActionResult> {
  const data = await load(db, orderId);
  if (!data) return FAIL('Order not found');
  const { order, items } = data;
  if (order.status !== 'placed') return FAIL(`Order is ${order.status}`);
  const isPreorder = order.is_preorder === 1;
  if (isPreorder !== ready) return FAIL(isPreorder ? 'This is a pre-order: use “Ready to dispatch”' : 'Only pre-orders are marked ready to dispatch');
  if (order.payment_method !== 'cod' && order.payment_status !== 'paid') return FAIL('Wait for the payment to be captured before packing');
  const at = nowIso(ctx.now);
  const settings = await getSettings(db);
  const isReplacement = order.replacement_for_order_id !== null;
  if (needsCodConfirmation(order)) return FAIL('Confirm this COD order with the customer first');
  const missing = invoiceSettingsMissing(settings);
  if (missing.length) return FAIL(`Fill in Store settings before issuing invoices: ${missing.join(', ')}`);
  let invoice: D1PreparedStatement[] = [];
  if (isReplacement) {
    // No consideration, so no invoice: the goods travel under a delivery challan (Rule 55).
    const original = await db.prepare('SELECT order_no FROM orders WHERE id = ?').bind(order.replacement_for_order_id).first<{ order_no: string }>();
    invoice = [
      db
        .prepare(
          `INSERT INTO delivery_challans (order_id, fy, seq, doc_no, issued_at, snapshot)
           SELECT ?1, ?2, n, 'HLDC/' || ?2 || '/' || printf('%05d', n), ?3, ?4
           FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM delivery_challans WHERE fy = ?2)`,
        )
        .bind(orderId, fyOf(ctx.now), at, JSON.stringify(challanSnapshot(order, items, settings, original?.order_no ?? ''))),
    ];
  } else {
    invoice = [
      ...(() => {
        const snapshot = invoiceSnapshot(order, items, settings);
        return issueDocStmts(db, { series: 'INV', fy: fyOf(ctx.now), docType: snapshot.docType as DocumentType, orderId, issuedAt: at, snapshot });
      })(),
      db.prepare("UPDATE orders SET invoice_id = (SELECT id FROM invoices WHERE order_id = ? AND series = 'INV') WHERE id = ?").bind(orderId, orderId),
    ];
  }
  const claim = claimStmt(
    db,
    orderId,
    'pack',
    `SELECT status = 'placed' AND ${PAID_SQL} AND is_preorder = ${ready ? 1 : 0} FROM orders WHERE id = ?`,
    [orderId],
    at,
  );
  const res = await runClaim(db, claim, [
    db.prepare(`UPDATE orders SET status = 'packed', ${ready ? 'ready_to_dispatch = 1, ' : ''}updated_at = ? WHERE id = ?`).bind(at, orderId),
    ...invoice,
    event(db, orderId, at, 'packed', ctx.actor ?? 'admin', ready ? 'Ready to dispatch; invoice issued' : isReplacement ? 'Replacement packed; delivery challan issued' : 'Packed; invoice issued', ctx.actorEmail),
    ...(ready
      ? [enqueueStmt(db, { orderId, kind: 'shiprocket.create', payload: {}, at }), enqueueStmt(db, { orderId, kind: 'email.ready_to_dispatch', payload: {}, at })]
      : []),
  ]);
  return settle(res, 'Order can no longer be packed');
}

/**
 * Harvest late: push a pre-order's dispatch date back (never forward). The
 * customer is emailed the new date with a one-click cancel (full refund) on
 * the order page. One claim per new date, so a double click sends one email.
 */
export async function delayPreorder(
  db: D1Database,
  orderId: number,
  d: { date: string; reason: string },
  ctx: { now: Date; actorEmail?: string | null },
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(d.date))) return FAIL('Pick the new dispatch date');
  const reason = d.reason.trim().slice(0, 300);
  if (reason.length < 3) return FAIL('Say why (it goes in the email to the customer)');
  if (d.date <= istYmd(ctx.now)) return FAIL('The new dispatch date must be after today');
  const at = nowIso(ctx.now);
  const before = await db.prepare('SELECT expected_dispatch_date FROM orders WHERE id = ?').bind(orderId).first<{ expected_dispatch_date: string | null }>();
  if (before?.expected_dispatch_date && d.date <= before.expected_dispatch_date) return FAIL(`Pick a date after the current one (${before.expected_dispatch_date}) — a pre-order can only be pushed back`);
  const claim = claimStmt(
    db,
    orderId,
    `delay:${d.date}`,
    "SELECT status = 'placed' AND is_preorder = 1 AND ready_to_dispatch = 0 AND (expected_dispatch_date IS NULL OR expected_dispatch_date < ?) FROM orders WHERE id = ?",
    [d.date, orderId],
    at,
  );
  const res = await runClaim(db, claim, [
    db.prepare('UPDATE orders SET expected_dispatch_date = ?, updated_at = ? WHERE id = ?').bind(d.date, at, orderId),
    event(db, orderId, at, 'preorder_delayed', 'admin', `Dispatch moved from ${before?.expected_dispatch_date ?? '—'} to ${d.date}: ${reason}`, ctx.actorEmail),
    enqueueStmt(db, { orderId, kind: 'email.preorder_delayed', payload: { from: before?.expected_dispatch_date ?? null, to: d.date, reason }, at }),
  ]);
  return settle(res, 'Only a pre-order that hasn’t been dispatched can be pushed back, and only to a later date');
}

export async function markShipped(
  db: D1Database,
  orderId: number,
  ship: { awb: string | null; courier: string | null; trackingUrl: string | null },
  ctx: { now: Date; actor: Actor; actorEmail?: string | null },
): Promise<ActionResult> {
  const at = nowIso(ctx.now);
  const claim = claimStmt(db, orderId, 'ship', `SELECT status = 'packed' AND ${PAID_SQL} FROM orders WHERE id = ?`, [orderId], at);
  const res = await runClaim(db, claim, [
    db
      .prepare("UPDATE orders SET status = 'shipped', awb = COALESCE(?, awb), courier = COALESCE(?, courier), tracking_url = COALESCE(?, tracking_url), updated_at = ? WHERE id = ?")
      .bind(ship.awb, ship.courier, ship.trackingUrl, at, orderId),
    event(db, orderId, at, 'shipped', ctx.actor, [ship.courier, ship.awb].filter(Boolean).join(' · ') || null, ctx.actorEmail),
    enqueueStmt(db, { orderId, kind: 'email.shipped', payload: {}, at }),
  ]);
  return settle(res, 'Order is not packed (or its payment is not captured)');
}

export async function markDelivered(db: D1Database, orderId: number, ctx: { now: Date; actor: Actor; actorEmail?: string | null }): Promise<ActionResult> {
  const at = nowIso(ctx.now);
  const claim = claimStmt(db, orderId, 'deliver', "SELECT status = 'shipped' FROM orders WHERE id = ?", [orderId], at);
  const res = await runClaim(db, claim, [
    // COD: the courier collected the cash at the door.
    db
      .prepare("UPDATE orders SET status = 'delivered', payment_status = CASE WHEN payment_method = 'cod' AND total_paise > 0 THEN 'paid' ELSE payment_status END, updated_at = ? WHERE id = ?")
      .bind(at, orderId),
    event(db, orderId, at, 'delivered', ctx.actor, null, ctx.actorEmail),
    enqueueStmt(db, { orderId, kind: 'email.delivered', payload: {}, at }),
  ]);
  return settle(res, 'Order is not shipped');
}

export async function markRto(db: D1Database, orderId: number, ctx: { now: Date; actor: Actor; actorEmail?: string | null; note?: string }): Promise<ActionResult> {
  const at = nowIso(ctx.now);
  const claim = claimStmt(db, orderId, 'rto', "SELECT status = 'shipped' FROM orders WHERE id = ?", [orderId], at);
  const res = await runClaim(db, claim, [
    db.prepare("UPDATE orders SET status = 'rto', updated_at = ? WHERE id = ?").bind(at, orderId),
    event(db, orderId, at, 'rto', ctx.actor, ctx.note ?? 'Returning to origin', ctx.actorEmail),
  ]);
  return settle(res, 'Order is not shipped');
}

export async function markReturned(db: D1Database, orderId: number, ctx: { now: Date; actorEmail?: string | null; note: string }): Promise<ActionResult> {
  const at = nowIso(ctx.now);
  const claim = claimStmt(db, orderId, 'return', "SELECT status = 'delivered' FROM orders WHERE id = ?", [orderId], at);
  const res = await runClaim(db, claim, [
    db.prepare("UPDATE orders SET status = 'returned', updated_at = ? WHERE id = ?").bind(at, orderId),
    event(db, orderId, at, 'returned', 'admin', ctx.note, ctx.actorEmail),
  ]);
  return settle(res, 'Only delivered orders can be marked returned');
}

/**
 * Cancels before dispatch. Customers may cancel while `placed`; admins also
 * while `packed`. Stock goes back; an issued invoice gets a credit note; a
 * captured payment is refunded and an authorised one is simply not captured.
 */
export async function cancelOrder(
  db: D1Database,
  orderId: number,
  ctx: { now: Date; actor: 'customer' | 'admin' | 'system'; reason: string; actorEmail?: string | null },
): Promise<ActionResult> {
  // The batch below is built from what we read; the claim re-checks those exact
  // values, so a capture or pack landing in between makes us re-read and retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await cancelOnce(db, orderId, ctx);
    if (r !== 'changed') return r;
  }
  return FAIL('The order changed while cancelling — please try again');
}

async function cancelOnce(
  db: D1Database,
  orderId: number,
  ctx: { now: Date; actor: 'customer' | 'admin' | 'system'; reason: string; actorEmail?: string | null },
): Promise<ActionResult | 'changed'> {
  const data = await load(db, orderId);
  if (!data) return FAIL('Order not found');
  const { order, items } = data;
  const allowed = ctx.actor === 'admin' ? ['placed', 'packed'] : ['placed'];
  if (!allowed.includes(order.status)) return FAIL(ctx.actor === 'customer' ? 'This order can no longer be cancelled online — it is already packed. Please contact customer care.' : `Order is ${order.status}`);
  const reason = ctx.reason.trim().slice(0, 300) || (ctx.actor === 'customer' ? 'Cancelled by customer' : 'Cancelled by HariLeaf');
  const at = nowIso(ctx.now);
  const refundNeeded = order.payment_method === 'razorpay' && order.payment_status === 'paid' && order.total_paise > 0;
  const claim = claimStmt(db, orderId, 'cancel', 'SELECT status = ? AND payment_status = ? FROM orders WHERE id = ?', [order.status, order.payment_status, orderId], at);
  const res = await runClaim(db, claim, [
    db
      .prepare(`UPDATE orders SET status = 'cancelled', cancelled_by = ?, cancel_reason = ?, payment_status = ?, updated_at = ? WHERE id = ?`)
      .bind(ctx.actor, reason, refundNeeded ? 'refund_pending' : order.payment_status, at, orderId),
    ...restockStmts(db, items, false), // the goods never left
    ...(await creditNoteStmts(db, orderId, ctx.now, reason)),
    ...(refundNeeded
      ? [
          db.prepare("INSERT INTO refunds (order_id, amount_paise, status, reason, created_at, updated_at, credit_note_id) VALUES (?, ?, 'pending', ?, ?, ?, (SELECT MAX(id) FROM invoices WHERE order_id = ? AND series = 'CN'))").bind(orderId, order.total_paise, reason, at, at, orderId),
          enqueueStmt(db, { orderId, kind: 'razorpay.refund', payload: {}, at }),
        ]
      : []),
    // Always: the Shiprocket order may be created concurrently; the handler looks it up when it runs.
    enqueueStmt(db, { orderId, kind: 'shiprocket.cancel', payload: {}, at }),
    event(db, orderId, at, 'cancelled', ctx.actor, reason, ctx.actorEmail),
    enqueueStmt(db, { orderId, kind: 'email.cancelled', payload: {}, at }),
  ]);
  if (res.ok) return { ok: true };
  if (res.reason === 'other') throw res.error;
  // Lost the claim: already cancelled, or the status/payment changed under us.
  const now = await db.prepare('SELECT status FROM orders WHERE id = ?').bind(orderId).first<{ status: string }>();
  return now && now.status !== 'cancelled' && allowed.includes(now.status) ? 'changed' : FAIL('Order can no longer be cancelled');
}

/**
 * Full refund after dispatch (damaged/wrong item, return, RTO). Razorpay
 * payments are refunded through the API; COD money is returned by bank/UPI
 * and recorded here with its reference.
 */
export async function refundOrder(
  db: D1Database,
  orderId: number,
  ctx: { now: Date; reason: string; manualReference?: string | null; actorEmail?: string | null },
): Promise<ActionResult> {
  const data = await load(db, orderId);
  if (!data) return FAIL('Order not found');
  const { order } = data;
  const reason = ctx.reason.trim().slice(0, 300);
  if (!reason) return FAIL('Give a reason for the refund');
  if (!['shipped', 'delivered', 'returned', 'rto'].includes(order.status)) return FAIL('Refund dispatched orders here; cancel orders that have not shipped');
  if (order.total_paise <= 0) return FAIL('Nothing to refund on a replacement order');
  const online = order.payment_method === 'razorpay';
  if (online && order.payment_status !== 'paid') return FAIL(`Payment is ${order.payment_status}`);
  if (!online && !ctx.manualReference?.trim()) return FAIL('Enter the UPI / bank transfer reference for the COD refund');
  if (!online && order.payment_status !== 'paid') return FAIL('COD payment has not been collected');
  const at = nowIso(ctx.now);
  const claim = claimStmt(
    db,
    orderId,
    'refund',
    "SELECT status IN ('shipped', 'delivered', 'returned', 'rto') AND payment_status = 'paid' FROM orders WHERE id = ?",
    [orderId],
    at,
  );
  const res = await runClaim(db, claim, [
    db.prepare('UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?').bind(online ? 'refund_pending' : 'refunded', at, orderId),
    ...(await creditNoteStmts(db, orderId, ctx.now, reason)),
    db
      .prepare(
        `INSERT INTO refunds (order_id, amount_paise, status, reason, razorpay_refund_id, created_at, updated_at, credit_note_id)
         VALUES (?, ?, ?, ?, NULL, ?, ?, (SELECT MAX(id) FROM invoices WHERE order_id = ? AND series = 'CN'))`,
      )
      .bind(orderId, order.total_paise, online ? 'pending' : 'processed', online ? reason : `${reason} (ref ${ctx.manualReference!.trim()})`, at, at, orderId),
    ...(online ? [enqueueStmt(db, { orderId, kind: 'razorpay.refund', payload: {}, at })] : [enqueueStmt(db, { orderId, kind: 'email.refunded', payload: {}, at })]),
    event(db, orderId, at, 'refund', 'admin', online ? reason : `${reason} · manual ref ${ctx.manualReference!.trim()}`, ctx.actorEmail),
  ]);
  return settle(res, 'This order was already refunded');
}

/** The parcel is back and inspected: restock what can be resold (never perishables). */
export async function receiveReturn(db: D1Database, orderId: number, ctx: { now: Date; actorEmail?: string | null; note?: string }): Promise<ActionResult> {
  const data = await load(db, orderId);
  if (!data) return FAIL('Order not found');
  if (!['rto', 'returned'].includes(data.order.status)) return FAIL('Only RTO or returned orders can be received back');
  const at = nowIso(ctx.now);
  const perishables = data.items.filter((i) => i.perishable).length;
  const claim = claimStmt(db, orderId, 'receive_return', "SELECT status IN ('rto', 'returned') FROM orders WHERE id = ?", [orderId], at);
  const res = await runClaim(db, claim, [
    ...restockStmts(db, data.items, true),
    event(db, orderId, at, 'return_received', 'admin', [ctx.note, perishables ? `${perishables} perishable line(s) written off` : null].filter(Boolean).join(' · ') || 'Restocked', ctx.actorEmail),
  ]);
  return settle(res, 'This return was already received');
}

/**
 * Free replacement for a damaged or wrong delivery: a new zero-value order to
 * the same address, linked to the original. No invoice is issued for it (no
 * consideration) — confirm the document treatment with your CA.
 */
export async function createReplacement(
  db: D1Database,
  originalId: number,
  ctx: { now: Date; lines: Array<{ itemId: number; qty: number }>; note: string; tokenSecret: string; requestKey: string; actorEmail?: string | null },
): Promise<{ ok: true; orderNo: string } | { ok: false; error: string }> {
  if (!/^[A-Za-z0-9-]{16,64}$/.test(ctx.requestKey)) return { ok: false, error: 'Missing request key' };
  const key = `replacement-${ctx.requestKey}`;
  const again = await findByIdempotencyKey(db, key);
  if (again) return { ok: true, orderNo: again.order_no }; // double submit
  const data = await load(db, originalId);
  if (!data) return FAIL('Order not found') as { ok: false; error: string };
  const { order: o, items } = data;
  if (!['delivered', 'shipped', 'returned'].includes(o.status)) return { ok: false, error: 'Replacements are for dispatched orders' };
  const chosen = ctx.lines
    .map((l) => ({ item: items.find((i) => i.id === l.itemId), qty: Math.trunc(l.qty) }))
    .filter((x): x is { item: OrderItemRow; qty: number } => Boolean(x.item) && x.qty > 0);
  if (!chosen.length || chosen.some((c) => c.qty > c.item.qty)) return { ok: false, error: 'Choose which items (and how many) to replace' };
  // Across all replacements, never more than was originally ordered.
  const { results: already } = await db
    .prepare(
      `SELECT i.variant_id, SUM(i.qty) AS qty FROM order_items i JOIN orders r ON r.id = i.order_id
       WHERE r.replacement_for_order_id = ? AND r.status <> 'cancelled' GROUP BY i.variant_id`,
    )
    .bind(originalId)
    .all<{ variant_id: number; qty: number }>();
  const over = chosen.find((c) => c.qty + (already.find((a) => a.variant_id === c.item.variant_id)?.qty ?? 0) > c.item.qty);
  if (over) return { ok: false, error: `${over.item.product_name} ${over.item.variant_label} was already replaced` };

  const at = nowIso(ctx.now);
  const { year, month } = istParts(ctx.now);
  const ym = `${String(year % 100).padStart(2, '0')}${String(month).padStart(2, '0')}`;
  const tokenHash = await hashViewToken(ctx.tokenSecret, await viewTokenFor(ctx.tokenSecret, key));
  const idQ = '(SELECT id FROM orders WHERE idempotency_key = ?)';
  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT OR IGNORE INTO order_counters (yymm, last_no) VALUES (?, 0)').bind(ym),
    db.prepare('UPDATE order_counters SET last_no = last_no + 1 WHERE yymm = ?').bind(ym),
    db
      .prepare(
        `INSERT INTO orders (order_no, view_token_hash, idempotency_key, status, payment_method, payment_status, customer_name, email, phone,
           ship_line1, ship_line2, ship_city, ship_state, ship_state_code, ship_pincode, bill_same_as_ship, subtotal_paise, discount_paise,
           gst_paise, total_paise, replacement_for_order_id, created_at, updated_at)
         VALUES ('HL-' || ?1 || '-' || printf('%04d', (SELECT last_no FROM order_counters WHERE yymm = ?1)), ?2, ?3, 'placed', 'cod', 'unpaid', ?4, ?5, ?6,
           ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13, ?13, 0, 0, ?14, ?15, ?15)`,
      )
      .bind(ym, tokenHash, key, o.customer_name, o.email, o.phone, o.ship_line1, o.ship_line2, o.ship_city, o.ship_state, o.ship_state_code, o.ship_pincode,
        chosen.reduce((a, c) => a + c.item.unit_price_paise * c.qty, 0), originalId, at),
  ];
  for (const { item, qty } of chosen) {
    const gross = item.unit_price_paise * qty;
    stmts.push(
      db
        .prepare(
          `INSERT INTO order_items (order_id, variant_id, product_name, variant_label, sku, hsn_code, gst_rate_bp, unit_price_paise, mrp_paise, qty,
             discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, line_total_paise, perishable)
           VALUES (${idQ}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)`,
        )
        .bind(key, item.variant_id, item.product_name, item.variant_label, item.sku, item.hsn_code, item.gst_rate_bp, item.unit_price_paise, item.mrp_paise, qty, gross, item.perishable),
      db.prepare('UPDATE variants SET stock_qty = stock_qty - ? WHERE id = ?').bind(qty, item.variant_id),
      db.prepare(`INSERT INTO stock_reservations (variant_id, order_id, qty, expires_at, state) VALUES (?, ${idQ}, ?, ?, 'consumed')`).bind(item.variant_id, key, qty, at),
    );
  }
  stmts.push(
    db.prepare(`INSERT INTO order_events (order_id, at, type, actor, actor_email, note) VALUES (${idQ}, ?, 'placed', 'admin', ?, ?)`).bind(key, at, ctx.actorEmail ?? null, `Replacement for ${o.order_no}: ${ctx.note}`),
    event(db, originalId, at, 'replacement', 'admin', ctx.note, ctx.actorEmail),
    db.prepare(`INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at) VALUES (${idQ}, 'shiprocket.create', '{}', 'pending', 0, ?, ?, ?)`).bind(key, at, at, at),
    db.prepare(`INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at) VALUES (${idQ}, 'email.replacement_placed', '{}', 'pending', 0, ?, ?, ?)`).bind(key, at, at, at),
    db.prepare('SELECT order_no FROM orders WHERE idempotency_key = ?').bind(key),
  );
  try {
    const res = await db.batch<{ order_no: string }>(stmts);
    return { ok: true, orderNo: res[res.length - 1].results[0].order_no };
  } catch (err) {
    if (/stock_qty >= 0/.test(String(err))) return { ok: false, error: 'Not enough stock for the replacement' };
    if (/UNIQUE.*idempotency_key/.test(String(err))) {
      const won = await findByIdempotencyKey(db, key);
      if (won) return { ok: true, orderNo: won.order_no };
    }
    if (/not purchasable/.test(String(err))) return { ok: false, error: 'A replacement item is no longer on sale' };
    throw err;
  }
}
