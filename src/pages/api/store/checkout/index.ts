import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon } from '../../../../lib/admin-api';
import { json, paymentOptions, readJson } from '../../../../lib/store-api';
import { isIdempotencyKey, validateCheckoutInput } from '../../../../lib/store/checkout-input';
import { createOrder } from '../../../../lib/store/orders';
import { abortPendingOrder } from '../../../../lib/store/payments';
import { publicQuote, quoteCart } from '../../../../lib/store/quote';
import { createOrder as createRazorpayOrder, razorpayConfig } from '../../../../lib/store/razorpay';
import { getSettings } from '../../../../lib/store/settings';
import { checkServiceability, shiprocketConfig } from '../../../../lib/store/shiprocket';
import { verifyTurnstile } from '../../../../lib/store/turnstile';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const key = request.headers.get('Idempotency-Key');
  if (!isIdempotencyKey(key)) return json({ error: 'Missing Idempotency-Key' }, 400);
  if (!env.ORDER_TOKEN_SECRET) return json({ error: 'Checkout is not available right now.' }, 503);

  const body = await readJson(request);
  if (!body) return json({ error: 'Invalid request' }, 400);
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, typeof body.turnstileToken === 'string' ? body.turnstileToken : null, request.headers.get('CF-Connecting-IP')))) {
    return json({ error: 'Please complete the security check and try again.' }, 403);
  }

  const input = validateCheckoutInput(body);
  if (!input.ok) return json({ error: 'Please check the highlighted fields', errors: input.errors }, 400);
  const c = input.value;
  const now = new Date();
  const settings = await getSettings(env.STORE_DB);
  const quote = await quoteCart(env.STORE_DB, body.lines, { today: now, settings });
  if (!quote.ok) return json({ error: 'Your cart changed — please review it', quote: publicQuote(quote) }, 409);

  const rzp = razorpayConfig(env);
  if (c.paymentMethod === 'razorpay' && !rzp) return json({ error: 'Online payment is not available right now. Please choose cash on delivery.' }, 503);
  if (c.paymentMethod === 'cod' && !quote.cod.eligible) return json({ error: quote.cod.reason ?? 'Cash on delivery is not available', errors: { paymentMethod: quote.cod.reason ?? '' } }, 422);

  // Courier check (fails open for non-perishables if Shiprocket is unreachable).
  const sr = shiprocketConfig(env);
  if (sr && settings.pickup_pincode) {
    const grams = quote.lines.reduce((g, l) => g + l.weightG * l.qty, 0);
    try {
      const s = await checkServiceability(sr, { pickup: settings.pickup_pincode, delivery: c.ship.pincode, weightKg: grams / 1000, declaredValue: quote.total / 100 });
      if (!s.serviceable) return json({ error: "We can't deliver to this pincode yet", errors: { 'ship.pincode': "We can't deliver to this pincode yet" } }, 422);
      if (c.paymentMethod === 'cod' && !s.cod) return json({ error: 'Cash on delivery is not available for this pincode', errors: { paymentMethod: 'Cash on delivery is not available for this pincode — please pay online' } }, 422);
    } catch (err) {
      if (quote.lines.some((l) => l.perishable)) return json({ error: 'We couldn’t confirm delivery to this pincode. Please try again shortly.' }, 503);
      console.error(JSON.stringify({ msg: 'serviceability check failed at checkout; continuing', error: String(err) }));
    }
  }

  const created = await createOrder(env.STORE_DB, { quote, checkout: c, idempotencyKey: key, sellerStateCode: settings.state_code, tokenSecret: env.ORDER_TOKEN_SECRET, now });
  if (!created.ok) {
    const fresh = await quoteCart(env.STORE_DB, body.lines, { today: new Date(), settings });
    return json({ error: created.message, quote: publicQuote(fresh) }, 409);
  }
  const viewUrl = `/order/${created.orderNo}?t=${created.viewToken}`;
  if (created.existing && created.status === 'payment_failed') {
    // A retried submit for an attempt whose payment window closed: the browser starts a fresh attempt.
    return json({ error: 'Your previous payment attempt expired.', code: 'expired' }, 409);
  }

  if (c.paymentMethod === 'cod' || created.status !== 'pending_payment') {
    drainSoon(env, locals);
    return json({ orderNo: created.orderNo, viewUrl, status: created.status, payment: null }, created.existing ? 200 : 201);
  }

  // Prepaid: attach (or reuse) the Razorpay order.
  const row = await env.STORE_DB.prepare('SELECT razorpay_order_id FROM orders WHERE id = ?').bind(created.orderId).first<{ razorpay_order_id: string | null }>();
  let razorpayOrderId = row?.razorpay_order_id ?? null;
  if (!razorpayOrderId) {
    try {
      const ro = await createRazorpayOrder(rzp!, { amountPaise: created.total, receipt: created.orderNo, notes: { order_no: created.orderNo } });
      await env.STORE_DB.prepare('UPDATE orders SET razorpay_order_id = ?, updated_at = ? WHERE id = ? AND razorpay_order_id IS NULL').bind(ro.id, now.toISOString(), created.orderId).run();
      razorpayOrderId = (await env.STORE_DB.prepare('SELECT razorpay_order_id FROM orders WHERE id = ?').bind(created.orderId).first<{ razorpay_order_id: string }>())?.razorpay_order_id ?? ro.id;
    } catch (err) {
      console.error(JSON.stringify({ msg: 'razorpay order create failed', order: created.orderNo, error: String(err) }));
      await abortPendingOrder(env.STORE_DB, created.orderId, new Date(), 'Payment could not start; stock released');
      return json({ error: 'Payment couldn’t start. Please try again in a moment.' }, 502);
    }
  }
  return json(
    { orderNo: created.orderNo, viewUrl, status: created.status, payment: paymentOptions(env, { orderNo: created.orderNo, razorpayOrderId, total: created.total, name: c.contact.name, email: c.contact.email, phone: c.contact.phone }) },
    created.existing ? 200 : 201,
  );
};
