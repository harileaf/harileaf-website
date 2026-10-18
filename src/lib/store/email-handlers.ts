/** Outbox handlers that send order emails (`email.*`). */
import { orderPlacedEmail, ownerNewOrderEmail, paymentReleasedEmail, sendEmail } from './email';
import type { OutboxHandler } from './outbox';
import { viewTokenFor, type OrderItemRow, type OrderRow } from './orders';
import { getSettings } from './settings';
import { absolute } from './urls';

async function load(env: Env, orderId: number | null) {
  if (!orderId) throw new Error('email row without order');
  const order = await env.STORE_DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<OrderRow>();
  if (!order) throw new Error(`order ${orderId} not found`);
  const { results: items } = await env.STORE_DB.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(orderId).all<OrderItemRow>();
  return { order, items, settings: await getSettings(env.STORE_DB) };
}

export async function orderViewUrl(env: Env, order: Pick<OrderRow, 'order_no' | 'idempotency_key' | 'view_token_rev'>): Promise<string> {
  if (!env.ORDER_TOKEN_SECRET || !order.idempotency_key) throw new Error('cannot build order link (ORDER_TOKEN_SECRET / idempotency key missing)');
  const token = await viewTokenFor(env.ORDER_TOKEN_SECRET, order.idempotency_key, order.view_token_rev ?? 0);
  return absolute(`/order/${order.order_no}?t=${token}`);
}

export function makeEmailHandlers(fetchImpl?: typeof fetch): Record<string, OutboxHandler> {
  return {
    'email.placed': async (_payload, { env, row }) => {
      const { order, items, settings } = await load(env, row.order_id);
      await sendEmail(env, orderPlacedEmail(order, items, await orderViewUrl(env, order), settings), fetchImpl);
    },
    // Separate row: an owner-email failure never re-sends (or blocks) the customer's.
    'email.owner_new_order': async (_payload, { env, row }) => {
      const { order, items, settings } = await load(env, row.order_id);
      const owner = ownerNewOrderEmail(order, items, settings);
      if (owner) await sendEmail(env, owner, fetchImpl);
    },
    'email.payment_released': async (_payload, { env, row }) => {
      const { order, settings } = await load(env, row.order_id);
      await sendEmail(env, paymentReleasedEmail(order, settings), fetchImpl);
    },
  };
}
