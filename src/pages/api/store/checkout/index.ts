import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon } from '../../../../lib/admin-api';
import { allowed, json, paymentOptions, readJson, tooMany } from '../../../../lib/store-api';
import { checkoutFingerprint, isIdempotencyKey, validateCheckoutInput } from '../../../../lib/store/checkout-input';
import { stateCodeFor, stateName } from '../../../../lib/store/india-states';
import { createOrder, findByIdempotencyKey, viewTokenFor } from '../../../../lib/store/orders';
import { abortPendingOrder } from '../../../../lib/store/payments';
import { MAX_OPEN_UNCONFIRMED, openUnconfirmedCod } from '../../../../lib/store/cod';
import { publicQuote, quoteCart } from '../../../../lib/store/quote';
import { createOrder as createRazorpayOrder, razorpayConfig } from '../../../../lib/store/razorpay';
import { getSettings } from '../../../../lib/store/settings';
import { checkServiceability, couriers, shiprocketConfig } from '../../../../lib/store/shiprocket';
import { nextDispatch, parseCalendar, pickCourier, pincodeInZone } from '../../../../lib/store/zones';
import { verifyTurnstile } from '../../../../lib/store/turnstile';

export const prerender = false;

const HOLD_SECONDS = 30 * 60;

/** Answer for a key that already created an order (a retry): no Turnstile, quote or courier calls. */
async function existingResponse(existing: NonNullable<Awaited<ReturnType<typeof findByIdempotencyKey>>>, key: string, secret: string) {
  const viewUrl = `/order/${existing.order_no}?t=${await viewTokenFor(secret, key, existing.view_token_rev ?? 0)}`;
  if (existing.status === 'payment_failed') return json({ error: 'Your previous payment attempt expired.', code: 'expired' }, 409);
  if (existing.status === 'pending_payment' && existing.razorpay_order_id) {
    const hold = await env.STORE_DB.prepare("SELECT MIN(expires_at) AS e FROM stock_reservations WHERE order_id = ? AND state = 'held'").bind(existing.id).first<{ e: string | null }>();
    const left = hold?.e ? (Date.parse(hold.e) - Date.now()) / 1000 : HOLD_SECONDS;
    return json({
      orderNo: existing.order_no, viewUrl, status: existing.status,
      payment: paymentOptions(env, { orderNo: existing.order_no, razorpayOrderId: existing.razorpay_order_id, total: existing.total_paise, name: existing.customer_name, email: existing.email, phone: existing.phone, timeoutSeconds: left }),
    });
  }
  // The first request is still creating the Razorpay order: ask the browser to retry shortly.
  if (existing.status === 'pending_payment') return json({ error: 'Starting payment…', code: 'in_progress' }, 409);
  return json({ orderNo: existing.order_no, viewUrl, status: existing.status, payment: null });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const key = request.headers.get('Idempotency-Key');
  if (!isIdempotencyKey(key)) return json({ error: 'Missing Idempotency-Key' }, 400);
  if (!env.ORDER_TOKEN_SECRET) return json({ error: 'Checkout is not available right now.' }, 503);
  if (!(await allowed(env, request, 'checkout'))) return tooMany();

  const body = await readJson(request);
  if (!body) return json({ error: 'Invalid request' }, 400);
  const contact = (body.contact && typeof body.contact === 'object' ? body.contact : {}) as Record<string, unknown>;
  const fingerprint = await checkoutFingerprint(body.lines, contact.email, body.coupon);

  // Idempotency first: a retried submit returns the order it already created.
  const existing = await findByIdempotencyKey(env.STORE_DB, key);
  if (existing) {
    if (existing.checkout_fingerprint && existing.checkout_fingerprint !== fingerprint) return json({ error: 'Please try again.', code: 'key_reused' }, 409);
    return existingResponse(existing, key, env.ORDER_TOKEN_SECRET);
  }

  if (!(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, typeof body.turnstileToken === 'string' ? body.turnstileToken : null, request.headers.get('CF-Connecting-IP')))) {
    return json({ error: 'Please complete the security check and try again.', code: 'turnstile' }, 403);
  }

  const input = validateCheckoutInput(body);
  if (!input.ok) return json({ error: 'Please check the highlighted fields', errors: input.errors }, 400);
  const c = input.value;
  const now = new Date();
  const settings = await getSettings(env.STORE_DB);
  const quoteOpts = { today: now, settings, coupon: body.coupon, phone: c.contact.phone };
  const quote = await quoteCart(env.STORE_DB, body.lines, quoteOpts);
  if (!quote.ok) return json({ error: 'Your cart changed — please review it', quote: publicQuote(quote) }, 409);
  // Never place an order without the discount the shopper expects: they remove the code or fix the cart.
  if (quote.coupon && !quote.coupon.ok) return json({ error: quote.coupon.message, code: 'coupon', errors: { coupon: quote.coupon.message }, quote: publicQuote(quote) }, 422);
  // The shopper must have seen this exact total (prices can change between page load and submit).
  if (typeof body.expectedTotal === 'number' && body.expectedTotal !== quote.total) {
    return json({ error: 'A price changed since you opened checkout — please check the new total.', code: 'price_changed', quote: publicQuote(quote) }, 409);
  }

  const rzp = razorpayConfig(env);
  if (c.paymentMethod === 'razorpay' && !rzp) return json({ error: 'Online payment is not available right now. Please choose cash on delivery.' }, 503);
  if (c.paymentMethod === 'cod' && settings.cod_confirmation !== 'off' && (await openUnconfirmedCod(env.STORE_DB, c.contact.email, c.contact.phone)) >= MAX_OPEN_UNCONFIRMED) {
    return json({ error: 'You have cash-on-delivery orders waiting for confirmation. Please confirm them (see your email) or pay online.', errors: { paymentMethod: 'Confirm your earlier COD orders first, or pay online' } }, 422);
  }
  if (c.paymentMethod === 'cod' && !quote.cod.eligible) return json({ error: quote.cod.reason ?? 'Cash on delivery is not available', errors: { paymentMethod: quote.cod.reason ?? '' } }, 422);

  // Perishables: only inside their zone, only with an express courier within its transit limit.
  // Fails closed: if we can't ask the courier, a perishable order is not taken.
  const sr = shiprocketConfig(env);
  const perishableZones = [...new Map(quote.lines.filter((l) => l.qty > 0 && l.zone).map((l) => [l.zone!.id, { zone: l.zone!, name: l.name }])).values()];
  for (const { zone, name } of perishableZones) {
    if (!pincodeInZone(c.ship.pincode, zone)) {
      const msg = `We deliver ${name} only within ${zone.name} for now`;
      return json({ error: msg, errors: { 'ship.pincode': msg } }, 422);
    }
  }
  if (perishableZones.length) {
    if (!sr || !settings.pickup_pincode) return json({ error: 'We couldn’t confirm delivery to this pincode. Please try again shortly.' }, 503);
    const grams = quote.lines.reduce((g, l) => g + l.weightG * l.qty, 0);
    let list: Awaited<ReturnType<typeof couriers>>;
    try {
      list = await couriers(sr, { pickup: settings.pickup_pincode, delivery: c.ship.pincode, weightKg: grams / 1000, cod: false, declaredValue: quote.total / 100 });
    } catch (err) {
      console.error(JSON.stringify({ msg: 'perishable courier check failed', error: String(err) }));
      return json({ error: 'We couldn’t confirm delivery to this pincode. Please try again shortly.' }, 503);
    }
    for (const { zone, name } of perishableZones) {
      if (!pickCourier(list, zone)) {
        const msg = `No ${zone.expressOnly ? 'express ' : ''}courier can bring ${name} to ${c.ship.pincode} within ${zone.maxTransitDays} day${zone.maxTransitDays === 1 ? '' : 's'}, so we can’t send it there`;
        return json({ error: msg, errors: { 'ship.pincode': msg } }, 422);
      }
    }
  }

  // Courier check (fails open for non-perishables if Shiprocket is unreachable).
  if (sr && settings.pickup_pincode) {
    const grams = quote.lines.reduce((g, l) => g + l.weightG * l.qty, 0);
    try {
      const s = await checkServiceability(sr, { pickup: settings.pickup_pincode, delivery: c.ship.pincode, weightKg: grams / 1000, declaredValue: quote.total / 100 });
      if (!s.serviceable) return json({ error: "We can't deliver to this pincode yet", errors: { 'ship.pincode': "We can't deliver to this pincode yet" } }, 422);
      const pinState = s.state ? stateCodeFor(s.state) : null;
      if (pinState && pinState !== c.ship.stateCode) {
        return json({ error: 'The state doesn’t match the pincode', errors: { 'ship.stateCode': `Pincode ${c.ship.pincode} is in ${stateName(pinState) ?? s.state}` } }, 422);
      }
      if (c.paymentMethod === 'cod' && !s.cod) return json({ error: 'Cash on delivery is not available for this pincode', errors: { paymentMethod: 'Cash on delivery is not available for this pincode — please pay online' } }, 422);
    } catch (err) {
      if (quote.lines.some((l) => l.perishable)) return json({ error: 'We couldn’t confirm delivery to this pincode. Please try again shortly.' }, 503);
      console.error(JSON.stringify({ msg: 'serviceability check failed at checkout; continuing', error: String(err) }));
    }
  }

  const created = await createOrder(env.STORE_DB, { quote, checkout: c, idempotencyKey: key, sellerStateCode: settings.state_code, tokenSecret: env.ORDER_TOKEN_SECRET, now, fingerprint, codConfirmationRequired: settings.cod_confirmation !== 'off', expectedDispatchDate: perishableZones.length ? nextDispatch(now, parseCalendar(settings)) : null });
  if (!created.ok) {
    const fresh = await quoteCart(env.STORE_DB, body.lines, { ...quoteOpts, today: new Date() });
    return json({ error: created.message, quote: publicQuote(fresh) }, 409);
  }
  const viewUrl = `/order/${created.orderNo}?t=${created.viewToken}`;

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
      return json({ error: 'Payment couldn’t start. Please try again in a moment.', code: 'payment_start_failed' }, 502);
    }
  }
  return json(
    { orderNo: created.orderNo, viewUrl, status: created.status, payment: paymentOptions(env, { orderNo: created.orderNo, razorpayOrderId, total: created.total, name: c.contact.name, email: c.contact.email, phone: c.contact.phone, timeoutSeconds: HOLD_SECONDS }) },
    created.existing ? 200 : 201,
  );
};
