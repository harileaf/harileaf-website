import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon } from '../../../lib/admin-api';
import { markPaid } from '../../../lib/store/payments';
import { verifyWebhookSignature, type RazorpayPayment } from '../../../lib/store/razorpay';

export const prerender = false;

const ok = () => new Response('ok', { status: 200 });

/**
 * Razorpay webhook. The signature is checked over the raw body before parsing;
 * the event id (x-razorpay-event-id) is recorded in the same batch as the state
 * change, so duplicates are no-ops and a failed run is retried by Razorpay.
 * Must answer 2xx within 5 s.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const raw = await request.text();
  if (!(await verifyWebhookSignature(env.RAZORPAY_WEBHOOK_SECRET ?? '', raw, request.headers.get('X-Razorpay-Signature')))) {
    return new Response('invalid signature', { status: 401 });
  }
  let event: { event?: string; payload?: { payment?: { entity?: RazorpayPayment } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const eventId = request.headers.get('x-razorpay-event-id') ?? `${event.event}:${event.payload?.payment?.entity?.id ?? crypto.randomUUID()}`;
  const db = env.STORE_DB;
  const at = new Date().toISOString();
  const payment = event.payload?.payment?.entity;

  if ((event.event === 'payment.authorized' || event.event === 'payment.captured' || event.event === 'order.paid') && payment?.order_id) {
    const order = await db.prepare('SELECT id FROM orders WHERE razorpay_order_id = ?').bind(payment.order_id).first<{ id: number }>();
    if (!order) {
      await db.prepare("INSERT OR IGNORE INTO webhook_events (source, event_id, received_at) VALUES ('razorpay', ?, ?)").bind(eventId, at).run();
      return ok();
    }
    const dup = await db.prepare("SELECT 1 AS d FROM webhook_events WHERE source = 'razorpay' AND event_id = ?").bind(eventId).first();
    if (dup) return ok();
    const r = await markPaid(db, { orderId: order.id, payment, source: 'webhook', webhookEventId: eventId, now: new Date() });
    console.log(JSON.stringify({ msg: 'razorpay webhook', event: event.event, eventId, result: r.result }));
    drainSoon(env, locals);
    return ok();
  }

  if (event.event === 'payment.failed' && payment?.order_id) {
    const order = await db.prepare('SELECT id FROM orders WHERE razorpay_order_id = ?').bind(payment.order_id).first<{ id: number }>();
    const fresh = await db.prepare("INSERT OR IGNORE INTO webhook_events (source, event_id, received_at) VALUES ('razorpay', ?, ?)").bind(eventId, at).run();
    if (order && (fresh.meta.changes ?? 0) === 1) {
      await db
        .prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'payment_attempt_failed', 'razorpay', ?)")
        .bind(order.id, at, `${payment.id}: ${payment.error_description ?? 'failed'}`)
        .run();
    }
    return ok();
  }

  // Refund events are handled in M4; acknowledge everything else.
  await db.prepare("INSERT OR IGNORE INTO webhook_events (source, event_id, received_at) VALUES ('razorpay', ?, ?)").bind(eventId, at).run();
  return ok();
};
