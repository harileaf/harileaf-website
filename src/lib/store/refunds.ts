/**
 * Razorpay refunds (outbox `razorpay.refund`, refund webhooks, cron re-check).
 * Refund creation isn't idempotent at Razorpay, so every refund row carries
 * its own receipt (`rf-<refund id>`, also in notes) and we look for it before
 * creating — a crash between Razorpay accepting the refund and our DB write
 * can't refund twice. A retry after a failure makes a new row (new receipt).
 */
import { nowIso } from './db';
import { paymentStatusAfterRefundsStmt } from './fulfilment';
import { claimStmt, runClaim } from './ops';
import { enqueueStmt, type OutboxHandler } from './outbox';
import { fetchRefund, listPaymentRefunds, razorpayConfig, refundPayment, type RazorpayConfig, type RazorpayRefund } from './razorpay';

const receiptFor = (refundId: number) => `rf-${refundId}`;

/** Our refunds row for a Razorpay refund entity (by id, receipt or notes). */
export function refundRowIdFrom(r: { receipt?: string | null; notes?: unknown }): number | null {
  const fromReceipt = /^rf-(\d+)$/.exec(r.receipt ?? '')?.[1];
  const notes = r.notes && typeof r.notes === 'object' && !Array.isArray(r.notes) ? (r.notes as Record<string, unknown>) : {};
  const n = Number(fromReceipt ?? notes.refund_row_id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Records Razorpay's view of a refund. Settling (processed/failed) happens exactly once per row. */
export async function applyRefundStatus(db: D1Database, refundId: number, r: Pick<RazorpayRefund, 'id' | 'status'>, now: Date): Promise<void> {
  const at = nowIso(now);
  const row = await db.prepare('SELECT order_id, status FROM refunds WHERE id = ?').bind(refundId).first<{ order_id: number; status: string }>();
  if (!row || row.status !== 'pending') return;
  const link = db.prepare('UPDATE refunds SET razorpay_refund_id = COALESCE(razorpay_refund_id, ?), updated_at = ? WHERE id = ?').bind(r.id, at, refundId);
  if (r.status !== 'processed' && r.status !== 'failed') {
    await link.run();
    return;
  }
  const claim = claimStmt(db, row.order_id, `refund_settled:${refundId}`, "SELECT status = 'pending' FROM refunds WHERE id = ?", [refundId], at);
  const rest =
    r.status === 'processed'
      ? [
          db.prepare("UPDATE refunds SET status = 'processed', updated_at = ? WHERE id = ?").bind(at, refundId),
          // refunded, or partially_refunded after a partial refund (v2)
          paymentStatusAfterRefundsStmt(db, row.order_id, at),
          db.prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'refunded', 'razorpay', ?)").bind(row.order_id, at, `Refund ${r.id} processed`),
          enqueueStmt(db, { orderId: row.order_id, kind: 'email.refunded', payload: { refundId }, at }),
        ]
      : [
          db.prepare("UPDATE refunds SET status = 'failed', updated_at = ? WHERE id = ?").bind(at, refundId),
          // Back to paid (or partially refunded): the money is still with us; the admin retries (dashboard to-do).
          paymentStatusAfterRefundsStmt(db, row.order_id, at),
          db.prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'refund_failed', 'razorpay', ?)").bind(row.order_id, at, `Refund ${r.id} failed — retry from the order page`),
        ];
  const res = await runClaim(db, claim, [link, ...rest]);
  if (!res.ok && res.reason === 'other') throw res.error;
}

/**
 * Admin retry after a failure: a fresh refunds row (new receipt) replacing the
 * latest failed refund that hasn't been retried, with its amount, lines and
 * credit note (no second credit note is issued).
 */
export function retryRefundStmts(db: D1Database, orderId: number, at: string): D1PreparedStatement[] {
  const failedId = `(SELECT MAX(id) FROM refunds f WHERE f.order_id = ?1 AND f.status = 'failed' AND NOT EXISTS (SELECT 1 FROM refunds x WHERE x.retry_of = f.id))`;
  const retryId = `(SELECT MAX(id) FROM refunds WHERE order_id = ?1 AND retry_of IS NOT NULL AND status = 'pending')`;
  return [
    db.prepare(`SELECT ${failedId} AS failed`).bind(orderId),
    db
      .prepare(
        `INSERT INTO refunds (order_id, credit_note_id, amount_paise, status, reason, retry_of, created_at, updated_at)
         SELECT ?1, f.credit_note_id, f.amount_paise, 'pending', f.reason || ' (retry)', f.id, ?2, ?2 FROM refunds f WHERE f.id = ${failedId}`,
      )
      .bind(orderId, at),
    db.prepare(`INSERT INTO refund_lines (refund_id, order_item_id, qty, amount_paise) SELECT ${retryId}, l.order_item_id, l.qty, l.amount_paise FROM refund_lines l JOIN refunds r ON r.id = ${retryId} WHERE l.refund_id = r.retry_of`).bind(orderId),
    db.prepare(`INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at) SELECT ?1, 'razorpay.refund', json_object('refundId', ${retryId}), 'pending', 0, ?2, ?2, ?2 WHERE EXISTS (SELECT 1 FROM refunds WHERE id = ${retryId} AND created_at = ?2)`).bind(orderId, at),
    paymentStatusAfterRefundsStmt(db, orderId, at),
  ];
}

export function makeRefundHandler(fetchImpl?: typeof fetch): OutboxHandler {
  return async (payload: { refundId?: number }, { env, row }) => {
    const cfg = razorpayConfig(env, fetchImpl);
    if (!cfg) throw new Error('Razorpay keys are not configured');
    const db = env.STORE_DB;
    // v2 rows name their refund (an order can have several partial refunds); older rows take the latest pending.
    const r = await db
      .prepare(
        `SELECT r.id, r.amount_paise, r.razorpay_refund_id, o.razorpay_payment_id, o.order_no FROM refunds r JOIN orders o ON o.id = r.order_id
         WHERE r.order_id = ?1 AND r.status = 'pending' AND (?2 IS NULL OR r.id = ?2) ORDER BY r.id DESC LIMIT 1`,
      )
      .bind(row.order_id, Number.isInteger(payload?.refundId) ? payload.refundId : null)
      .first<{ id: number; amount_paise: number; razorpay_refund_id: string | null; razorpay_payment_id: string | null; order_no: string }>();
    if (!r || r.razorpay_refund_id) return; // nothing pending, or already sent (webhook / cron settles it)
    if (!r.razorpay_payment_id) throw new Error('refund without a Razorpay payment id');
    const existing = (await listPaymentRefunds(cfg, r.razorpay_payment_id)).find((x) => refundRowIdFrom(x) === r.id);
    const refund = existing ?? (await refundPayment(cfg, r.razorpay_payment_id, { amountPaise: r.amount_paise, receipt: receiptFor(r.id), notes: { order_no: r.order_no, refund_row_id: String(r.id) } }));
    await applyRefundStatus(db, r.id, refund, new Date());
  };
}

/** Cron: settle refunds still pending a day after Razorpay accepted them (missed webhooks). */
export async function reconcileRefunds(db: D1Database, cfg: RazorpayConfig, now: Date, limit = 20): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT r.id, r.razorpay_refund_id, o.razorpay_payment_id FROM refunds r JOIN orders o ON o.id = r.order_id
       WHERE r.status = 'pending' AND r.razorpay_refund_id IS NOT NULL AND r.updated_at < ? ORDER BY r.updated_at LIMIT ?`,
    )
    .bind(cutoff, limit)
    .all<{ id: number; razorpay_refund_id: string; razorpay_payment_id: string }>();
  let settled = 0;
  for (const r of results) {
    try {
      const rf = await fetchRefund(cfg, r.razorpay_payment_id, r.razorpay_refund_id);
      await applyRefundStatus(db, r.id, rf, now);
      if (rf.status !== 'pending') settled += 1;
      else await db.prepare('UPDATE refunds SET updated_at = ? WHERE id = ?').bind(nowIso(now), r.id).run();
    } catch (err) {
      console.error(JSON.stringify({ msg: 'refund re-check failed', refund: r.id, error: String(err) }));
    }
  }
  return settled;
}
