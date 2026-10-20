import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon } from '../../../../lib/admin-api';
import { allowed, json, paymentOptions, readJson, tooMany } from '../../../../lib/store-api';
import { getOrderByNo } from '../../../../lib/store/orders';
import { markPaid } from '../../../../lib/store/payments';
import { listOrderPayments, paymentMatches, razorpayConfig } from '../../../../lib/store/razorpay';
import { checkViewToken } from '../../../../lib/store/tokens';

export const prerender = false;

/**
 * Re-opens payment for an order still within its hold window. First asks
 * Razorpay whether a payment already went through (e.g. a UPI collect that
 * completed after the customer closed the window), so they never pay twice.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!(await allowed(env, request, 'retry'))) return tooMany();
  const b = await readJson(request);
  const s = (k: string) => (typeof b?.[k] === 'string' ? (b[k] as string) : '');
  const rzp = razorpayConfig(env);
  if (!b || !rzp || !env.ORDER_TOKEN_SECRET) return json({ error: 'Invalid request' }, 400);
  const view = await getOrderByNo(env.STORE_DB, s('orderNo'));
  if (!view || !(await checkViewToken(env.ORDER_TOKEN_SECRET, s('token'), view.order.view_token_hash))) return json({ error: 'Order not found' }, 404);
  const o = view.order;
  if (o.status !== 'pending_payment' || !o.razorpay_order_id || !view.holdExpiresAt || view.holdExpiresAt < new Date().toISOString()) {
    return json({ error: o.status === 'placed' ? 'This order is already paid' : 'The payment window for this order has closed. Please place a new order.', status: o.status }, 409);
  }
  const paid = (await listOrderPayments(rzp, o.razorpay_order_id)).find((p) => paymentMatches(p, { razorpayOrderId: o.razorpay_order_id!, amountPaise: o.total_paise }));
  if (paid) {
    const r = await markPaid(env.STORE_DB, { orderId: o.id, payment: paid, source: 'reconcile', now: new Date() });
    drainSoon(env, locals);
    return json({ status: 'placed', result: r.result });
  }
  const left = (Date.parse(view.holdExpiresAt) - Date.now()) / 1000;
  return json({ payment: paymentOptions(env, { orderNo: o.order_no, razorpayOrderId: o.razorpay_order_id, total: o.total_paise, name: o.customer_name, email: o.email, phone: o.phone, timeoutSeconds: left }) });
};
