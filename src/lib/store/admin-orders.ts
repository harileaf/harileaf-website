/** Admin order views and the action dispatcher behind /api/admin/orders/[id]. */
import { nowIso } from './db';
import {
  cancelOrder, createReplacement, delayPreorder, markDelivered, markPacked, markReturned, markRto, markShipped, readyToDispatch, receiveReturn, refundOrder,
} from './fulfilment';
import { orderDocs } from './invoice-docs';
import type { OrderItemRow, OrderRow } from './orders';
import { confirmCod } from './cod';
import { retryRefundStmts } from './refunds';
import { eraseOrderPersonalData, marketingOptOut } from './retention';
import { safeHttpsUrl } from './urls';

export const ORDER_STATUSES = ['pending_payment', 'placed', 'packed', 'shipped', 'delivered', 'rto', 'returned', 'cancelled', 'payment_failed'] as const;

export interface OrderListRow {
  id: number; order_no: string; status: string; payment_method: string; payment_status: string; customer_name: string;
  ship_city: string; ship_state: string; total_paise: number; created_at: string; awb: string | null; replacement_for_order_id: number | null;
  /** v2: fresh produce in the order, pre-order, and the day it must leave the farm. */
  perishable: number; is_preorder: number; expected_dispatch_date: string | null;
}

export async function listOrders(db: D1Database, f: { status?: string; q?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (f.status && (ORDER_STATUSES as readonly string[]).includes(f.status)) {
    where.push('status = ?');
    binds.push(f.status);
  } else if (f.status === 'open') {
    where.push("status IN ('placed', 'packed', 'shipped', 'rto')");
  }
  const q = f.q?.trim().slice(0, 80);
  if (q) {
    where.push('(order_no = ? OR email = ? OR phone = ? OR awb = ? OR customer_name LIKE ?)');
    const digits = q.replace(/\D/g, '').slice(-10);
    binds.push(q.toUpperCase(), q.toLowerCase(), digits || q, q, `%${q.replace(/[%_]/g, '')}%`);
  }
  const { results } = await db
    .prepare(
      `SELECT id, order_no, status, payment_method, payment_status, customer_name, ship_city, ship_state, total_paise, created_at, awb, replacement_for_order_id,
              expected_dispatch_date, is_preorder, EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = orders.id AND i.perishable = 1) AS perishable
       FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, Math.min(f.limit ?? 50, 200), f.offset ?? 0)
    .all<OrderListRow>();
  return results;
}

export async function orderDetail(db: D1Database, id: number) {
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow & { replacement_for_order_id: number | null }>();
  if (!order) return null;
  const [items, events, refunds, outbox, replacements, remittances] = await Promise.all([
    db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(id).all<OrderItemRow>(),
    db.prepare('SELECT at, type, actor, actor_email, note FROM order_events WHERE order_id = ? ORDER BY id').bind(id).all<{ at: string; type: string; actor: string; actor_email: string | null; note: string | null }>(),
    db.prepare('SELECT id, amount_paise, status, reason, razorpay_refund_id, created_at FROM refunds WHERE order_id = ? ORDER BY id').bind(id).all<{ id: number; amount_paise: number; status: string; reason: string; razorpay_refund_id: string | null; created_at: string }>(),
    db.prepare('SELECT id, kind, state, attempts, last_error, updated_at FROM outbox WHERE order_id = ? ORDER BY id').bind(id).all<{ id: number; kind: string; state: string; attempts: number; last_error: string | null; updated_at: string }>(),
    db.prepare('SELECT order_no FROM orders WHERE replacement_for_order_id = ?').bind(id).all<{ order_no: string }>(),
    db.prepare('SELECT amount_paise, remitted_on, utr FROM cod_remittances WHERE order_id = ?').bind(id).all<{ amount_paise: number; remitted_on: string | null; utr: string | null }>(),
  ]);
  const original = order.replacement_for_order_id
    ? await db.prepare('SELECT order_no, id FROM orders WHERE id = ?').bind(order.replacement_for_order_id).first<{ order_no: string; id: number }>()
    : null;
  return {
    order, items: items.results, events: events.results, refunds: refunds.results, outbox: outbox.results,
    replacements: replacements.results, remittances: remittances.results, original, docs: await orderDocs(db, id),
  };
}

/** Which buttons the detail page shows for an order (the server re-checks every action). */
export function availableActions(
  o: Pick<OrderRow, 'status' | 'payment_method' | 'payment_status' | 'total_paise' | 'is_preorder'>,
  opts: { awaitingCodConfirmation?: boolean; returnReceived?: boolean } = {},
): string[] {
  const a: string[] = [];
  if (opts.awaitingCodConfirmation) return ['confirm_cod', 'cancel'];
  const prepaidReady = o.payment_method === 'cod' || o.payment_status === 'paid';
  // Pre-orders wait for the harvest: "Ready to dispatch" invoices and sends them to Shiprocket.
  if (o.status === 'placed' && prepaidReady) a.push(o.is_preorder === 1 ? 'ready_to_dispatch' : 'pack');
  if (o.status === 'placed' && o.is_preorder === 1) a.push('delay_preorder');
  if (o.status === 'packed') a.push('ship');
  if (o.status === 'shipped') a.push('deliver', 'rto');
  if (['shipped', 'delivered', 'rto'].includes(o.status)) a.push('update_tracking');
  if (o.status === 'delivered') a.push('returned');
  if (o.status === 'placed' || o.status === 'packed') a.push('cancel');
  if (['shipped', 'delivered', 'returned', 'rto'].includes(o.status) && o.payment_status === 'paid' && o.total_paise > 0) a.push('refund');
  // Receiving doesn't change the status, so a recorded return_received event hides the button.
  if ((o.status === 'rto' || o.status === 'returned') && !opts.returnReceived) a.push('receive_return');
  if (['shipped', 'delivered', 'returned'].includes(o.status)) a.push('replacement');
  return a;
}

type Body = Record<string, unknown>;
const str = (b: Body, k: string, max = 300) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, max) : '');

export async function runAdminAction(
  db: D1Database,
  orderId: number,
  body: Body,
  ctx: { now: Date; actorEmail: string | null; tokenSecret: string },
): Promise<{ ok: true; orderNo?: string } | { ok: false; error: string }> {
  const base = { now: ctx.now, actorEmail: ctx.actorEmail };
  switch (body.action) {
    case 'ready_to_dispatch':
      return readyToDispatch(db, orderId, base);
    case 'delay_preorder':
      return delayPreorder(db, orderId, { date: str(body, 'date', 10), reason: str(body, 'reason') }, base);
    case 'pack':
      return markPacked(db, orderId, base);
    case 'marketing_opt_out': {
      const o = await db.prepare('SELECT email FROM orders WHERE id = ?').bind(orderId).first<{ email: string }>();
      if (!o) return { ok: false, error: 'Order not found' };
      await marketingOptOut(db, o.email, { now: ctx.now, orderId, actorEmail: ctx.actorEmail });
      return { ok: true };
    }
    case 'erase_personal_data':
      return eraseOrderPersonalData(db, orderId, { now: ctx.now, actorEmail: ctx.actorEmail });
    case 'confirm_cod':
      return confirmCod(db, orderId, { now: ctx.now, actor: 'admin', actorEmail: ctx.actorEmail });
    case 'ship': {
      const tracking = str(body, 'trackingUrl', 500);
      if (tracking && !safeHttpsUrl(tracking)) return { ok: false, error: 'Tracking link must start with https://' };
      return markShipped(db, orderId, { awb: str(body, 'awb', 40) || null, courier: str(body, 'courier', 60) || null, trackingUrl: tracking || null }, { ...base, actor: 'admin' });
    }
    case 'update_tracking': {
      // Correct (or clear) the AWB/courier/link of a shipped order — markShipped never overwrites with blanks.
      const tracking = str(body, 'trackingUrl', 500);
      if (tracking && !safeHttpsUrl(tracking)) return { ok: false, error: 'Tracking link must start with https://' };
      const at = nowIso(ctx.now);
      const res = await db.batch([
        db
          .prepare("UPDATE orders SET awb = ?, courier = ?, tracking_url = ?, updated_at = ? WHERE id = ? AND status IN ('shipped', 'delivered', 'rto')")
          .bind(str(body, 'awb', 40) || null, str(body, 'courier', 60) || null, tracking || null, at, orderId),
        db
          .prepare("INSERT INTO order_events (order_id, at, type, actor, actor_email, note) SELECT ?, ?, 'tracking_updated', 'admin', ?, ? WHERE changes() > 0")
          .bind(orderId, at, ctx.actorEmail, [str(body, 'courier', 60), str(body, 'awb', 40)].filter(Boolean).join(' · ') || 'Tracking cleared'),
      ]);
      return (res[0].meta.changes ?? 0) ? { ok: true } : { ok: false, error: 'Tracking can be edited once the order has shipped' };
    }
    case 'deliver':
      return markDelivered(db, orderId, { ...base, actor: 'admin' });
    case 'rto':
      return markRto(db, orderId, { ...base, actor: 'admin', note: str(body, 'note') || undefined });
    case 'returned':
      if (!str(body, 'note')) return { ok: false, error: 'Add a note about the return' };
      return markReturned(db, orderId, { ...base, note: str(body, 'note') });
    case 'cancel':
      if (!str(body, 'reason')) return { ok: false, error: 'Give a reason — it goes on the credit note and the customer email' };
      return cancelOrder(db, orderId, { ...base, actor: 'admin', reason: str(body, 'reason') });
    case 'refund':
      return refundOrder(db, orderId, { ...base, reason: str(body, 'reason'), manualReference: str(body, 'manualReference', 80) || null });
    case 'receive_return':
      return receiveReturn(db, orderId, { ...base, note: str(body, 'note') || undefined });
    case 'replacement': {
      const lines = Array.isArray(body.lines) ? (body.lines as Array<{ itemId?: unknown; qty?: unknown }>).map((l) => ({ itemId: Number(l?.itemId), qty: Number(l?.qty) })) : [];
      if (!str(body, 'note')) return { ok: false, error: 'Say what was wrong (damaged / wrong item)' };
      return createReplacement(db, orderId, { now: ctx.now, lines, note: str(body, 'note'), tokenSecret: ctx.tokenSecret, requestKey: str(body, 'requestKey', 64), actorEmail: ctx.actorEmail });
    }
    case 'note': {
      if (!str(body, 'note', 1000)) return { ok: false, error: 'Empty note' };
      await db.prepare("INSERT INTO order_events (order_id, at, type, actor, actor_email, note) VALUES (?, ?, 'note', 'admin', ?, ?)").bind(orderId, nowIso(ctx.now), ctx.actorEmail, str(body, 'note', 1000)).run();
      return { ok: true };
    }
    case 'retry_task': {
      // Re-run a background task that failed permanently (after fixing its cause).
      const id = Number(body.taskId);
      const at = nowIso(ctx.now);
      const r = await db
        .prepare("UPDATE outbox SET state = 'pending', attempts = 0, next_attempt_at = ?, lease_until = NULL, updated_at = ? WHERE id = ? AND order_id = ? AND state = 'dead'")
        .bind(at, at, id, orderId)
        .run();
      return (r.meta.changes ?? 0) ? { ok: true } : { ok: false, error: 'That task is not failed' };
    }
    case 'retry_refund': {
      const at = nowIso(ctx.now);
      const res = await db.batch(retryRefundStmts(db, orderId, at));
      return (res[1].meta.changes ?? 0) ? { ok: true } : { ok: false, error: 'No failed refund to retry' };
    }
    default:
      return { ok: false, error: 'Unknown action' };
  }
}

/** Numbers and to-do counts for the admin dashboard. */
export async function dashboardMetrics(db: D1Database, now: Date) {
  const since = (days: number) => new Date(now.getTime() - days * 86400_000).toISOString();
  const row = await db
    .prepare(
      `SELECT
         (SELECT count(*) FROM orders WHERE status = 'placed') AS to_pack,
         (SELECT count(*) FROM orders WHERE status = 'packed') AS to_ship,
         (SELECT count(*) FROM orders WHERE status = 'rto') AS rto,
         (SELECT count(*) FROM orders WHERE created_at >= ?1 AND status NOT IN ('pending_payment', 'payment_failed')) AS orders_today,
         (SELECT COALESCE(SUM(total_paise), 0) FROM orders WHERE created_at >= ?2 AND status NOT IN ('pending_payment', 'payment_failed', 'cancelled')) AS revenue_7d,
         (SELECT count(*) FROM orders WHERE created_at >= ?2 AND status NOT IN ('pending_payment', 'payment_failed', 'cancelled')) AS orders_7d,
         (SELECT count(*) FROM refunds WHERE status IN ('pending', 'failed')) AS refunds_open,
         (SELECT count(*) FROM refunds WHERE status = 'failed') AS refunds_failed,
         (SELECT count(DISTINCT order_id) FROM order_events e WHERE type = 'ndr' AND at >= ?2
            AND EXISTS (SELECT 1 FROM orders o WHERE o.id = e.order_id AND o.status = 'shipped')) AS ndr_open,
         (SELECT count(*) FROM orders o WHERE payment_method = 'cod' AND status = 'delivered' AND total_paise > 0 AND updated_at < ?3
            AND NOT EXISTS (SELECT 1 FROM cod_remittances r WHERE r.order_id = o.id)) AS cod_unremitted,
         (SELECT count(*) FROM order_events WHERE type = 'extra_payment' AND at >= ?2) AS extra_payments,
         (SELECT count(DISTINCT order_id) FROM order_events WHERE type IN ('courier_unapplied', 'courier_lost') AND at >= ?2) AS courier_problems,
         (SELECT count(*) FROM orders WHERE payment_method = 'cod' AND status = 'placed' AND cod_confirmed_at IS NULL AND total_paise > 0 AND created_at < ?4) AS cod_unconfirmed_old,
         (SELECT count(*) FROM reviews WHERE status = 'pending') AS reviews_pending`,
    )
    .bind(since(1), since(7), since(14), since(2))
    .first<Record<string, number>>();
  return row ?? {};
}
