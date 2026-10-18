import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon } from '../../../lib/admin-api';
import { courierAction } from '../../../lib/store/courier-status';
import { markDelivered, markPacked, markRto, markShipped } from '../../../lib/store/fulfilment';
import { constantTimeEqual } from '../../../lib/store/tokens';

export const prerender = false;

const ok = () => new Response('ok', { status: 200 });

/**
 * Shiprocket tracking webhook (configured in Shiprocket → Settings → API →
 * Webhooks with a security token, sent as `x-api-key`). The path avoids the
 * words Shiprocket disallows in webhook URLs. Always answers 200.
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
  const order = await db
    .prepare('SELECT id, status, awb FROM orders WHERE (shiprocket_order_id IS NOT NULL AND shiprocket_order_id = ?) OR (awb IS NOT NULL AND awb = ?) LIMIT 1')
    .bind(srOrderId, awb)
    .first<{ id: number; status: string; awb: string | null }>();
  if (!order) return ok();

  const statusId = p.shipment_status_id ?? p.current_status_id;
  const statusText = p.shipment_status ?? p.current_status;
  const eventKey = `${awb ?? srOrderId}:${String(statusId)}:${String(p.current_timestamp ?? '')}`;
  const fresh = await db.prepare("INSERT OR IGNORE INTO webhook_events (source, event_id, received_at) VALUES ('courier', ?, ?)").bind(eventKey, new Date().toISOString()).run();
  if ((fresh.meta.changes ?? 0) === 0) return ok(); // duplicate delivery

  const now = new Date();
  const courier = typeof p.courier_name === 'string' ? p.courier_name : null;
  const ship = { awb, courier, trackingUrl: awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : null };
  const action = courierAction(statusId, statusText);
  try {
    if (action === 'shipped' || action === 'delivered') {
      // The invoice must exist before goods leave: pack (and invoice) first if the admin hadn't.
      if (order.status === 'placed') await markPacked(db, order.id, { now, actorEmail: null });
      await markShipped(db, order.id, ship, { now, actor: 'shiprocket' });
      if (action === 'delivered') await markDelivered(db, order.id, { now, actor: 'shiprocket' });
    } else if (action === 'rto') {
      await markRto(db, order.id, { now, actor: 'shiprocket', note: String(statusText ?? 'RTO') });
    } else if (action === 'ndr') {
      await db
        .prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'ndr', 'shiprocket', ?)")
        .bind(order.id, now.toISOString(), `Delivery attempt failed: ${String(statusText ?? '')}`)
        .run();
    }
  } catch (err) {
    console.error(JSON.stringify({ msg: 'courier webhook handling failed', order: order.id, action, error: String(err) }));
  }
  drainSoon(env, locals);
  return ok();
};
