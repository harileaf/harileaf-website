import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon } from '../../../lib/admin-api';
import { REACHED, courierAction } from '../../../lib/store/courier-status';
import { markDelivered, markPacked, markRto, markShipped, type ActionResult } from '../../../lib/store/fulfilment';
import { constantTimeEqual } from '../../../lib/store/tokens';

export const prerender = false;

const ok = () => new Response('ok', { status: 200 });

/**
 * Shiprocket tracking webhook (Shiprocket → Settings → API → Webhooks, with a
 * security token sent as `x-api-key`; the path avoids words Shiprocket
 * disallows in webhook URLs). An event is recorded as seen only after it was
 * applied; unexpected errors answer 5xx so Shiprocket retries. Events that
 * can't be applied are logged on the order and surface on the dashboard.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const expected = env.SHIPROCKET_WEBHOOK_TOKEN ?? '';
  const got = request.headers.get('x-api-key') ?? '';
  if (!expected || !constantTimeEqual(got, expected)) return new Response('forbidden', { status: 403 });

  let p: Record<string, unknown>;
  try {
    p = (await request.json()) as Record<string, unknown>;
  } catch {
    return ok();
  }
  const db = env.STORE_DB;
  const awb = typeof p.awb === 'string' || typeof p.awb === 'number' ? String(p.awb) : null;
  const srOrderId = p.sr_order_id !== undefined && p.sr_order_id !== null ? String(p.sr_order_id) : null;
  // order_id is our order number (sent as Shiprocket's channel order id), so a scan that arrives
  // before we stored the Shiprocket id or AWB still finds its order.
  const orderNo = typeof p.order_id === 'string' && p.order_id ? p.order_id : null;
  const order = await db
    .prepare('SELECT id, status FROM orders WHERE (shiprocket_order_id IS NOT NULL AND shiprocket_order_id = ?1) OR (awb IS NOT NULL AND awb = ?2) OR order_no = ?3 LIMIT 1')
    .bind(srOrderId, awb, orderNo)
    .first<{ id: number; status: string }>();
  if (!order) return ok();

  const statusId = p.shipment_status_id ?? p.current_status_id;
  const statusText = String(p.shipment_status ?? p.current_status ?? '');
  const eventKey = `${awb ?? srOrderId}:${String(statusId)}:${String(p.current_timestamp ?? '')}`;
  const seen = await db.prepare("SELECT 1 AS s FROM webhook_events WHERE source = 'courier' AND event_id = ?").bind(eventKey).first();
  if (seen) return ok();

  const now = new Date();
  const at = now.toISOString();
  const note = (type: string, text: string) =>
    db.prepare('INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, ?, ?, ?)').bind(order.id, at, type, 'shiprocket', text.slice(0, 300)).run();
  const courier = typeof p.courier_name === 'string' ? p.courier_name.slice(0, 60) : null;
  const ship = { awb, courier, trackingUrl: awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : null };
  const action = courierAction(statusId, statusText);

  // Walks the order forward to `target`, packing/shipping first if those scans were missed
  // (the invoice must exist before goods leave). Throws on unexpected errors.
  const advance = async (target: 'shipped' | 'delivered' | 'rto'): Promise<ActionResult> => {
    const steps: Array<() => Promise<ActionResult>> = [];
    let status = order.status;
    if (REACHED[target].includes(status)) {
      // Late or repeated scan. If the admin marked it shipped without tracking, fill it in now.
      if (ship.awb) {
        await db
          .prepare('UPDATE orders SET awb = ?, courier = COALESCE(courier, ?), tracking_url = COALESCE(tracking_url, ?), updated_at = ? WHERE id = ? AND awb IS NULL')
          .bind(ship.awb, ship.courier, ship.trackingUrl, now.toISOString(), order.id)
          .run();
      }
      return { ok: true };
    }
    if (status === 'placed') {
      steps.push(() => markPacked(db, order.id, { now, actor: 'shiprocket' }));
      status = 'packed';
    }
    if (status === 'packed') {
      steps.push(() => markShipped(db, order.id, ship, { now, actor: 'shiprocket' }));
      status = 'shipped';
    }
    if (status !== 'shipped') return { ok: false, error: `order is ${order.status}` };
    if (target === 'delivered') steps.push(() => markDelivered(db, order.id, { now, actor: 'shiprocket' }));
    if (target === 'rto') steps.push(() => markRto(db, order.id, { now, actor: 'shiprocket', note: statusText || 'RTO' }));
    for (const step of steps) {
      const r = await step();
      if (!r.ok) {
        // Lost a race with another event/admin click? Then it's already where it should be.
        const fresh = await db.prepare('SELECT status FROM orders WHERE id = ?').bind(order.id).first<{ status: string }>();
        return fresh && REACHED[target].includes(fresh.status) ? { ok: true } : r;
      }
    }
    return { ok: true };
  };

  try {
    if (action === 'shipped' || action === 'delivered' || action === 'rto') {
      const r = await advance(action);
      if (!r.ok) await note('courier_unapplied', `Courier says “${statusText}” but it couldn't be applied: ${r.error}`);
    } else if (action === 'ndr') {
      await note('ndr', `Delivery attempt failed: ${statusText}`);
    } else if (action === 'lost') {
      await note('courier_lost', `Courier reports the shipment lost (${statusText}) — raise a claim in Shiprocket`);
    } else if (action === 'courier_cancelled') {
      await note('courier_cancelled', `Shipment cancelled in Shiprocket (${statusText})`);
    }
  } catch (err) {
    console.error(JSON.stringify({ msg: 'courier webhook handling failed', order: order.id, action, error: String(err) }));
    return new Response('retry', { status: 500 });
  }
  await db.prepare("INSERT OR IGNORE INTO webhook_events (source, event_id, received_at) VALUES ('courier', ?, ?)").bind(eventKey, at).run();
  drainSoon(env, locals);
  return ok();
};
