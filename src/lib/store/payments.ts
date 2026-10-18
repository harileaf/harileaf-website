/**
 * Payment state changes (spec: Online payment flow, Late authorisation,
 * Reconciliation). Every change is an exactly-once `ops` claim batch, so the
 * browser verify call, the webhook and the reconciliation cron can all race
 * without double-fulfilling an order.
 */
import { claimStmt, runClaim } from './ops';
import { nowIso } from './db';
import { enqueueStmt, type OutboxHandler } from './outbox';
import { capturePayment, fetchPayment, listOrderPayments, paymentMatches, razorpayConfig, type RazorpayConfig, type RazorpayPayment } from './razorpay';

export type PaidSource = 'verify' | 'webhook' | 'reconcile';

export type MarkPaidResult =
  | { result: 'placed' }
  | { result: 'late_placed' }
  | { result: 'late_released' }
  | { result: 'already' }
  | { result: 'ignored'; why: string };

interface PayableOrder {
  id: number;
  order_no: string;
  status: string;
  total_paise: number;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  cancelled_by: string | null;
}

const loadOrder = (db: D1Database, orderId: number) =>
  db
    .prepare('SELECT id, order_no, status, total_paise, razorpay_order_id, razorpay_payment_id, cancelled_by FROM orders WHERE id = ?')
    .bind(orderId)
    .first<PayableOrder>();

const webhookEventStmt = (db: D1Database, eventId: string, at: string) =>
  db.prepare("INSERT INTO webhook_events (source, event_id, received_at) VALUES ('razorpay', ?, ?)").bind(eventId, at);

/**
 * Fulfils an order with a verified Razorpay payment. The caller must already
 * have checked the payment with `paymentMatches` (status, order id, amount).
 */
export async function markPaid(
  db: D1Database,
  input: { orderId: number; payment: RazorpayPayment; source: PaidSource; webhookEventId?: string; now: Date },
): Promise<MarkPaidResult> {
  const order = await loadOrder(db, input.orderId);
  if (!order || !order.razorpay_order_id) return { result: 'ignored', why: 'order not found' };
  if (!paymentMatches(input.payment, { razorpayOrderId: order.razorpay_order_id, amountPaise: order.total_paise })) {
    return { result: 'ignored', why: 'payment does not match order' };
  }
  const at = nowIso(input.now);
  const captured = input.payment.status === 'captured';
  const extra = input.webhookEventId ? [webhookEventStmt(db, input.webhookEventId, at)] : [];

  const claim = claimStmt(
    db,
    order.id,
    'mark_paid',
    "SELECT status = 'pending_payment' AND total_paise = ? AND razorpay_order_id = ? FROM orders WHERE id = ?",
    [order.total_paise, order.razorpay_order_id, order.id],
    at,
  );
  const res = await runClaim(db, claim, [
    db
      .prepare(`UPDATE orders SET status = 'placed', payment_status = ?, razorpay_payment_id = ?, paid_at = ?, updated_at = ? WHERE id = ?`)
      .bind(captured ? 'paid' : 'authorized', input.payment.id, at, at, order.id),
    db.prepare("UPDATE stock_reservations SET state = 'consumed' WHERE order_id = ? AND state = 'held'").bind(order.id),
    db
      .prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'paid', 'razorpay', ?)")
      .bind(order.id, at, `${captured ? 'Captured' : 'Authorised'} ${input.payment.id} via ${input.source}`),
    ...(captured ? [] : [enqueueStmt(db, { orderId: order.id, kind: 'razorpay.capture', payload: { paymentId: input.payment.id }, at })]),
    enqueueStmt(db, { orderId: order.id, kind: 'email.placed', payload: {}, at }),
    enqueueStmt(db, { orderId: order.id, kind: 'email.owner_new_order', payload: {}, at }),
    ...extra,
  ]);
  if (res.ok) return { result: 'placed' };
  // A transient D1 error must not be swallowed: throw so a webhook answers 5xx and is retried.
  if (res.reason === 'other') throw res.error;

  // Someone else already handled this payment, or the reservation had expired.
  if (input.webhookEventId) await db.prepare("INSERT OR IGNORE INTO webhook_events (source, event_id, received_at) VALUES ('razorpay', ?, ?)").bind(input.webhookEventId, at).run();
  const now = await loadOrder(db, order.id);
  if (now?.status === 'payment_failed') return lateCapture(db, now, input.payment, input.now);
  if (now?.razorpay_payment_id === input.payment.id) return { result: 'already' };
  if (now && now.razorpay_payment_id && now.razorpay_payment_id !== input.payment.id) {
    // A second authorisation on the same order (e.g. a UPI collect still in flight when the
    // customer retried). It is never captured, so the bank releases it; record it for admin.
    await db
      .prepare(
        `INSERT INTO order_events (order_id, at, type, actor, note)
         SELECT ?1, ?2, 'extra_payment', 'razorpay', ?3
         WHERE NOT EXISTS (SELECT 1 FROM order_events WHERE order_id = ?1 AND type = 'extra_payment' AND note = ?3)`,
      )
      .bind(order.id, at, `Extra authorisation ${input.payment.id} not captured (auto-releases)`)
      .run();
  }
  return { result: 'ignored', why: `order is ${now?.status ?? 'missing'}` };
}

/**
 * A valid authorisation arrived after the reservation expired. Re-reserve and
 * capture if stock allows and the customer never cancelled; otherwise leave the
 * payment uncaptured (Razorpay releases it) and tell the customer.
 */
export async function lateCapture(db: D1Database, order: PayableOrder, payment: RazorpayPayment, now: Date): Promise<MarkPaidResult> {
  const at = nowIso(now);
  const { results: items } = await db
    .prepare('SELECT variant_id, qty FROM order_items WHERE order_id = ?')
    .bind(order.id)
    .all<{ variant_id: number; qty: number }>();
  const captured = payment.status === 'captured';
  const claim = claimStmt(
    db,
    order.id,
    'late_capture',
    `SELECT status = 'payment_failed' AND cancelled_by IS NULL AND total_paise = ? AND razorpay_order_id = ?
            AND NOT EXISTS (SELECT 1 FROM ops WHERE order_id = orders.id AND kind = 'late_release')
     FROM orders WHERE id = ?`,
    [order.total_paise, order.razorpay_order_id, order.id],
    at,
  );
  const res = await runClaim(db, claim, [
    ...items.flatMap((it) => [
      db.prepare('UPDATE variants SET stock_qty = stock_qty - ? WHERE id = ?').bind(it.qty, it.variant_id),
      db
        .prepare("INSERT INTO stock_reservations (variant_id, order_id, qty, expires_at, state) VALUES (?, ?, ?, ?, 'consumed')")
        .bind(it.variant_id, order.id, it.qty, at),
    ]),
    db
      .prepare(`UPDATE orders SET status = 'placed', payment_status = ?, razorpay_payment_id = ?, paid_at = ?, updated_at = ? WHERE id = ?`)
      .bind(captured ? 'paid' : 'authorized', payment.id, at, at, order.id),
    db
      .prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'paid', 'razorpay', ?)")
      .bind(order.id, at, `Late payment ${payment.id} accepted; stock re-reserved`),
    ...(captured ? [] : [enqueueStmt(db, { orderId: order.id, kind: 'razorpay.capture', payload: { paymentId: payment.id }, at })]),
    enqueueStmt(db, { orderId: order.id, kind: 'email.placed', payload: {}, at }),
    enqueueStmt(db, { orderId: order.id, kind: 'email.owner_new_order', payload: {}, at }),
  ]);
  if (res.ok) return { result: 'late_placed' };
  if (res.reason === 'other') throw res.error;
  if (res.reason === 'stock' || res.reason === 'inactive') {
    // Don't capture: the authorisation lapses on its own. Tell the customer once.
    const once = claimStmt(db, order.id, 'late_release', "SELECT status = 'payment_failed' FROM orders WHERE id = ?", [order.id], at);
    await runClaim(db, once, [
      db
        .prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'payment_released', 'system', ?)")
        .bind(order.id, at, `Late payment ${payment.id} not captured: items no longer in stock`),
      enqueueStmt(db, { orderId: order.id, kind: 'email.payment_released', payload: { paymentId: payment.id }, at }),
    ]);
    return { result: 'late_released' };
  }
  // Claim failed: already released (customer told they weren't charged) or cancelled.
  const released = await db.prepare("SELECT 1 AS r FROM ops WHERE order_id = ? AND kind = 'late_release'").bind(order.id).first();
  return released ? { result: 'late_released' } : { result: 'ignored', why: 'late capture not allowed' };
}

/** Statements that release an order's held stock and mark it failed (shared by expiry and checkout aborts). */
async function releaseStatements(db: D1Database, orderId: number, at: string, note: string): Promise<D1PreparedStatement[]> {
  const { results: held } = await db
    .prepare("SELECT id, variant_id, qty FROM stock_reservations WHERE order_id = ? AND state = 'held'")
    .bind(orderId)
    .all<{ id: number; variant_id: number; qty: number }>();
  return [
    // Give stock back only for reservations still held at this moment.
    ...held.map((r) =>
      db
        .prepare("UPDATE variants SET stock_qty = stock_qty + ? WHERE id = ? AND EXISTS (SELECT 1 FROM stock_reservations WHERE id = ? AND state = 'held')")
        .bind(r.qty, r.variant_id, r.id),
    ),
    db.prepare("UPDATE stock_reservations SET state = 'released' WHERE order_id = ? AND state = 'held'").bind(orderId),
    db.prepare("UPDATE orders SET status = 'payment_failed', updated_at = ? WHERE id = ?").bind(at, orderId),
    db.prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'payment_failed', 'system', ?)").bind(orderId, at, note),
  ];
}

/** Checkout couldn't start payment (Razorpay down): release the hold right away. */
export async function abortPendingOrder(db: D1Database, orderId: number, now: Date, note: string): Promise<boolean> {
  const at = nowIso(now);
  const claim = claimStmt(db, orderId, 'expire', "SELECT status = 'pending_payment' FROM orders WHERE id = ?", [orderId], at);
  return (await runClaim(db, claim, await releaseStatements(db, orderId, at, note))).ok;
}

/** Releases held stock of prepaid orders whose payment window passed. */
export async function expireReservations(db: D1Database, now: Date, limit = 50): Promise<number> {
  const at = nowIso(now);
  const { results: orders } = await db
    .prepare(
      `SELECT o.id FROM orders o
       WHERE o.status = 'pending_payment'
         AND EXISTS (SELECT 1 FROM stock_reservations r WHERE r.order_id = o.id AND r.state = 'held')
         AND NOT EXISTS (SELECT 1 FROM stock_reservations r WHERE r.order_id = o.id AND r.state = 'held' AND r.expires_at >= ?)
       ORDER BY o.created_at LIMIT ?`,
    )
    .bind(at, limit)
    .all<{ id: number }>();
  let expired = 0;
  for (const { id } of orders) {
    const claim = claimStmt(db, id, 'expire', "SELECT status = 'pending_payment' FROM orders WHERE id = ?", [id], at);
    const res = await runClaim(db, claim, await releaseStatements(db, id, at, 'Payment window expired; stock released'));
    if (res.ok) expired += 1;
  }
  return expired;
}

/**
 * Catches payments whose browser callback and webhook were both missed: for
 * prepaid orders still pending after `olderThanMinutes`, ask Razorpay.
 */
export async function reconcilePending(db: D1Database, cfg: RazorpayConfig, now: Date, opts: { olderThanMinutes?: number; limit?: number } = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - (opts.olderThanMinutes ?? 10) * 60_000).toISOString();
  // Also orders that expired in the last 3 days (an authorisation can arrive late and its
  // callbacks can be missed); skip ones already released to the customer.
  const failedSince = new Date(now.getTime() - 3 * 24 * 3600_000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT id, razorpay_order_id, total_paise FROM orders o
       WHERE razorpay_order_id IS NOT NULL AND created_at <= ?1
         AND (status = 'pending_payment'
              OR (status = 'payment_failed' AND created_at >= ?2 AND cancelled_by IS NULL
                  AND NOT EXISTS (SELECT 1 FROM ops WHERE order_id = o.id AND kind IN ('late_release', 'late_capture'))))
       ORDER BY created_at DESC LIMIT ?3`,
    )
    .bind(cutoff, failedSince, opts.limit ?? 20)
    .all<{ id: number; razorpay_order_id: string; total_paise: number }>();
  let placed = 0;
  for (const o of results) {
    try {
      const payments = await listOrderPayments(cfg, o.razorpay_order_id);
      const good = payments.find((p) => paymentMatches(p, { razorpayOrderId: o.razorpay_order_id, amountPaise: o.total_paise }));
      if (!good) continue;
      const r = await markPaid(db, { orderId: o.id, payment: good, source: 'reconcile', now });
      if (r.result === 'placed' || r.result === 'late_placed') placed += 1;
    } catch (err) {
      // One bad order (e.g. a test-mode id after switching to live keys) mustn't stall the rest.
      console.error(JSON.stringify({ msg: 'reconcile failed for order', orderId: o.id, error: String(err) }));
    }
  }
  return placed;
}

/** Outbox handler `razorpay.capture` ({ paymentId }). Never captures for a cancelled order. */
export function makeCaptureHandler(fetchImpl?: typeof fetch): OutboxHandler {
  return async (payload: { paymentId?: string }, { env, row }) => {
    const cfg = razorpayConfig(env, fetchImpl);
    if (!cfg) throw new Error('Razorpay keys are not configured');
    if (!row.order_id || !payload.paymentId) throw new Error('capture row without order/payment');
    const db = env.STORE_DB;
    const order = await db
      .prepare('SELECT id, status, payment_status, total_paise, razorpay_payment_id FROM orders WHERE id = ?')
      .bind(row.order_id)
      .first<{ id: number; status: string; payment_status: string; total_paise: number; razorpay_payment_id: string | null }>();
    if (!order || order.payment_status !== 'authorized' || order.razorpay_payment_id !== payload.paymentId) return;
    if (order.status === 'cancelled') return; // not capturing voids the payment

    let p = await fetchPayment(cfg, payload.paymentId);
    if (p.status === 'authorized') p = await capturePayment(cfg, p.id, order.total_paise);
    if (p.status !== 'captured') throw new Error(`payment ${p.id} is ${p.status}, not capturable`);
    const at = nowIso(new Date());
    // A cancel can land between our status check and the capture: then the
    // captured money is refunded instead of the order going to Shiprocket.
    await db.batch([
      db.prepare(
        `INSERT INTO refunds (order_id, amount_paise, status, reason, created_at, updated_at, credit_note_id)
         SELECT id, total_paise, 'pending', 'Cancelled while the payment was being captured', ?1, ?1,
                (SELECT MAX(id) FROM invoices WHERE order_id = orders.id AND series = 'CN')
         FROM orders WHERE id = ?2 AND status = 'cancelled' AND payment_status = 'authorized'`,
      ).bind(at, order.id),
      db.prepare(
        `INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at)
         SELECT id, CASE WHEN status = 'cancelled' THEN 'razorpay.refund' ELSE 'shiprocket.create' END, '{}', 'pending', 0, ?1, ?1, ?1
         FROM orders WHERE id = ?2 AND payment_status = 'authorized'`,
      ).bind(at, order.id),
      db
        .prepare("UPDATE orders SET payment_status = CASE WHEN status = 'cancelled' THEN 'refund_pending' ELSE 'paid' END, updated_at = ? WHERE id = ? AND payment_status = 'authorized'")
        .bind(at, order.id),
      db.prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'captured', 'razorpay', ?)").bind(order.id, at, `Captured ${p.id}`),
    ]);
  };
}

/**
 * A capture row gives up after ~1 h of retries, but the authorisation lasts
 * 3 days. Re-queue capture (hourly at most) for authorised orders whose
 * capture rows are all dead, so a long Razorpay outage doesn't let the
 * payment lapse while the order ships.
 */
export async function requeueStuckCaptures(db: D1Database, now: Date): Promise<number> {
  const at = nowIso(now);
  const since = new Date(now.getTime() - 3 * 24 * 3600_000).toISOString();
  const hourAgo = new Date(now.getTime() - 3600_000).toISOString();
  const res = await db
    .prepare(
      `INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at)
       SELECT o.id, 'razorpay.capture', json_object('paymentId', o.razorpay_payment_id), 'pending', 0, ?1, ?1, ?1 FROM orders o
       WHERE o.payment_method = 'razorpay' AND o.payment_status = 'authorized' AND o.razorpay_payment_id IS NOT NULL AND o.created_at >= ?2
         AND EXISTS (SELECT 1 FROM outbox x WHERE x.order_id = o.id AND x.kind = 'razorpay.capture')
         AND NOT EXISTS (SELECT 1 FROM outbox x WHERE x.order_id = o.id AND x.kind = 'razorpay.capture' AND (x.state IN ('pending', 'running') OR x.updated_at > ?3))
       LIMIT 20`,
    )
    .bind(at, since, hourAgo)
    .run();
  return res.meta.changes ?? 0;
}
