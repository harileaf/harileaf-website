import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon } from '../../../../lib/admin-api';
import { json, readJson } from '../../../../lib/store-api';
import { getOrderByNo } from '../../../../lib/store/orders';
import { markPaid } from '../../../../lib/store/payments';
import { fetchPayment, paymentMatches, razorpayConfig, verifyPaymentSignature } from '../../../../lib/store/razorpay';
import { checkViewToken } from '../../../../lib/store/tokens';

export const prerender = false;

/**
 * Browser callback after Razorpay checkout. A valid signature alone never
 * fulfils an order: the payment is fetched from Razorpay and must match the
 * stored order id, amount and currency. The webhook does the same; whichever
 * arrives first places the order (exactly once).
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const b = await readJson(request);
  const s = (k: string) => (typeof b?.[k] === 'string' ? (b[k] as string) : '');
  const rzp = razorpayConfig(env);
  if (!b || !rzp || !env.ORDER_TOKEN_SECRET) return json({ error: 'Invalid request' }, 400);

  const view = await getOrderByNo(env.STORE_DB, s('orderNo'));
  if (!view || !(await checkViewToken(env.ORDER_TOKEN_SECRET, s('token'), view.order.view_token_hash))) return json({ error: 'Order not found' }, 404);
  const o = view.order;
  if (!o.razorpay_order_id || s('razorpay_order_id') !== o.razorpay_order_id) return json({ error: 'Payment does not belong to this order' }, 400);
  if (!(await verifyPaymentSignature(rzp.keySecret, o.razorpay_order_id, s('razorpay_payment_id'), s('razorpay_signature')))) {
    return json({ error: 'Payment could not be verified' }, 400);
  }

  const payment = await fetchPayment(rzp, s('razorpay_payment_id'));
  if (!paymentMatches(payment, { razorpayOrderId: o.razorpay_order_id, amountPaise: o.total_paise })) {
    return json({ error: 'Payment could not be verified', status: o.status }, 400);
  }
  const r = await markPaid(env.STORE_DB, { orderId: o.id, payment, source: 'verify', now: new Date() });
  drainSoon(env, locals);
  const status = (await env.STORE_DB.prepare('SELECT status FROM orders WHERE id = ?').bind(o.id).first<{ status: string }>())?.status;
  return json({ result: r.result, status });
};
