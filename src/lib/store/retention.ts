/**
 * Personal-data retention (privacy policy: "Data Retention"). Orders that are
 * tax records (an invoice/credit note exists, or money was taken) are kept as
 * CGST s.36 requires. Orders that never became a supply — checkouts never
 * paid, and orders cancelled before any money moved — are anonymised after
 * 180 days, or at once on an erasure request.
 */
import { nowIso } from './db';

export const ANONYMISE_AFTER_DAYS = 180;

/** Same rule as ERASABLE below, for the admin page (which already has the order's documents and refunds). */
export function isErasable(o: { status: string; payment_status: string; email: string }, docs: number, refunds: number): boolean {
  return ['payment_failed', 'cancelled'].includes(o.status) && ['unpaid', 'authorized', 'failed'].includes(o.payment_status) && docs === 0 && refunds === 0 && !o.email.startsWith('removed-');
}

/** SQL predicate over `orders o`: no tax document and no money ever held. */
const ERASABLE = `o.status IN ('payment_failed', 'cancelled')
  AND o.payment_status IN ('unpaid', 'authorized', 'failed')
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = o.id)
  AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.order_id = o.id)
  AND o.email NOT LIKE 'removed-%@invalid.harileaf.org'`;

const ANONYMISE_SET = `customer_name = 'Removed', email = 'removed-' || id || '@invalid.harileaf.org', phone = '0000000000',
  marketing_opt_in = 0, ship_line1 = 'Removed', ship_line2 = NULL, ship_city = 'Removed', ship_pincode = '000000',
  bill_name = NULL, bill_line1 = NULL, bill_line2 = NULL, bill_city = NULL, bill_state = NULL, bill_state_code = NULL, bill_pincode = NULL,
  buyer_gstin = NULL, buyer_legal_name = NULL, updated_at = ?1`;

/** Cron: anonymise erasable orders older than 180 days (in small batches). */
export async function anonymiseStaleOrders(db: D1Database, now: Date, limit = 100): Promise<number> {
  const at = nowIso(now);
  const before = new Date(now.getTime() - ANONYMISE_AFTER_DAYS * 86400_000).toISOString();
  const ids = `SELECT o.id FROM orders o WHERE ${ERASABLE} AND o.created_at < ?2 LIMIT ${Math.trunc(limit)}`;
  const res = await db.batch([
    db.prepare(`INSERT INTO order_events (order_id, at, type, actor, note) SELECT id, ?1, 'anonymised', 'system', 'Personal data removed after ${ANONYMISE_AFTER_DAYS} days (never paid / cancelled before payment)' FROM (${ids})`).bind(at, before),
    db.prepare(`UPDATE orders SET ${ANONYMISE_SET} WHERE id IN (${ids})`).bind(at, before),
  ]);
  return res[1].meta.changes ?? 0;
}

/** Erasure request for one order (admin). Refused for tax records, which the law requires us to keep. */
export async function eraseOrderPersonalData(db: D1Database, orderId: number, ctx: { now: Date; actorEmail: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const at = nowIso(ctx.now);
  const res = await db.batch([
    db.prepare(`UPDATE orders SET ${ANONYMISE_SET} WHERE id = ?2 AND id IN (SELECT o.id FROM orders o WHERE ${ERASABLE})`).bind(at, orderId),
    db.prepare("INSERT INTO order_events (order_id, at, type, actor, actor_email, note) SELECT ?1, ?2, 'anonymised', 'admin', ?3, 'Personal data erased on request' WHERE changes() > 0").bind(orderId, at, ctx.actorEmail),
  ]);
  return (res[0].meta.changes ?? 0) > 0
    ? { ok: true }
    : { ok: false, error: 'This order is a tax record (invoice issued or money taken) — it must be kept; you can still stop marketing emails.' };
}

/** Withdrawal of marketing consent: every order with this email. */
export async function marketingOptOut(db: D1Database, email: string, ctx: { now: Date; orderId: number; actorEmail: string | null }): Promise<number> {
  const at = nowIso(ctx.now);
  const res = await db.batch([
    db.prepare('UPDATE orders SET marketing_opt_in = 0, updated_at = ? WHERE lower(email) = lower(?) AND marketing_opt_in = 1').bind(at, email),
    db.prepare("INSERT INTO order_events (order_id, at, type, actor, actor_email, note) VALUES (?, ?, 'marketing_opt_out', 'admin', ?, 'Marketing consent withdrawn for this email')").bind(ctx.orderId, at, ctx.actorEmail),
  ]);
  return res[0].meta.changes ?? 0;
}
