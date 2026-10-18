/**
 * Razorpay refunds (outbox `razorpay.refund`, refund webhooks). Refund
 * creation isn't idempotent at Razorpay, so every refund carries our receipt
 * (`rf-<refund id>`) and we look for it before creating — a crash between
 * Razorpay accepting the refund and our DB write can't refund twice.
 */
import { nowIso } from './db';
import { enqueueStmt, type OutboxHandler } from './outbox';
import { listPaymentRefunds, razorpayConfig, refundPayment, type RazorpayRefund } from './razorpay';

export async function applyRefundStatus(db: D1Database, refundId: number, r: Pick<RazorpayRefund, 'id' | 'status'>, now: Date): Promise<void> {
  const at = nowIso(now);
  const row = await db.prepare('SELECT order_id, status FROM refunds WHERE id = ?').bind(refundId).first<{ order_id: number; status: string }>();
  if (!row || row.status === 'processed') return;
  const stmts: D1PreparedStatement[] = [
    db.prepare('UPDATE refunds SET razorpay_refund_id = COALESCE(razorpay_refund_id, ?), status = ?, updated_at = ? WHERE id = ?').bind(r.id, r.status === 'processed' ? 'processed' : r.status === 'failed' ? 'failed' : 'pending', at, refundId),
  ];
  if (r.status === 'processed') {
    stmts.push(
      db.prepare("UPDATE orders SET payment_status = 'refunded', updated_at = ? WHERE id = ? AND payment_status = 'refund_pending'").bind(at, row.order_id),
      db.prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'refunded', 'razorpay', ?)").bind(row.order_id, at, `Refund ${r.id} processed`),
      enqueueStmt(db, { orderId: row.order_id, kind: 'email.refunded', payload: {}, at }),
    );
  } else if (r.status === 'failed') {
    stmts.push(db.prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'refund_failed', 'razorpay', ?)").bind(row.order_id, at, `Refund ${r.id} failed — retry from admin`));
  }
  await db.batch(stmts);
}

export function makeRefundHandler(fetchImpl?: typeof fetch): OutboxHandler {
  return async (_payload, { env, row }) => {
    const cfg = razorpayConfig(env, fetchImpl);
    if (!cfg) throw new Error('Razorpay keys are not configured');
    const db = env.STORE_DB;
    const r = await db
      .prepare(
        `SELECT r.id, r.amount_paise, r.razorpay_refund_id, o.razorpay_payment_id, o.order_no FROM refunds r JOIN orders o ON o.id = r.order_id
         WHERE r.order_id = ? AND r.status = 'pending' ORDER BY r.id DESC LIMIT 1`,
      )
      .bind(row.order_id)
      .first<{ id: number; amount_paise: number; razorpay_refund_id: string | null; razorpay_payment_id: string | null; order_no: string }>();
    if (!r || r.razorpay_refund_id) return; // nothing pending, or already sent (webhook will settle it)
    if (!r.razorpay_payment_id) throw new Error('refund without a Razorpay payment id');
    const receipt = `rf-${r.id}`;
    const existing = (await listPaymentRefunds(cfg, r.razorpay_payment_id)).find((x) => x.receipt === receipt);
    const refund = existing ?? (await refundPayment(cfg, r.razorpay_payment_id, { amountPaise: r.amount_paise, receipt, notes: { order_no: r.order_no } }));
    await applyRefundStatus(db, r.id, refund, new Date());
  };
}
