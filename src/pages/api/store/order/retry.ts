import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json, paymentOptions, readJson } from '../../../../lib/store-api';
import { getOrderByNo } from '../../../../lib/store/orders';
import { razorpayConfig } from '../../../../lib/store/razorpay';
import { checkViewToken } from '../../../../lib/store/tokens';

export const prerender = false;

/** Re-opens payment for an order that is still within its hold window. */
export const POST: APIRoute = async ({ request }) => {
  const b = await readJson(request);
  const s = (k: string) => (typeof b?.[k] === 'string' ? (b[k] as string) : '');
  if (!b || !razorpayConfig(env) || !env.ORDER_TOKEN_SECRET) return json({ error: 'Invalid request' }, 400);
  const view = await getOrderByNo(env.STORE_DB, s('orderNo'));
  if (!view || !(await checkViewToken(env.ORDER_TOKEN_SECRET, s('token'), view.order.view_token_hash))) return json({ error: 'Order not found' }, 404);
  const o = view.order;
  if (o.status !== 'pending_payment' || !o.razorpay_order_id || !view.holdExpiresAt || view.holdExpiresAt < new Date().toISOString()) {
    return json({ error: o.status === 'placed' ? 'This order is already paid' : 'The payment window for this order has closed. Please place a new order.', status: o.status }, 409);
  }
  return json({ payment: paymentOptions(env, { orderNo: o.order_no, razorpayOrderId: o.razorpay_order_id, total: o.total_paise, name: o.customer_name, email: o.email, phone: o.phone }) });
};
