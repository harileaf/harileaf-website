import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as checkout } from '../../src/pages/api/store/checkout/index';
import { POST as verify } from '../../src/pages/api/store/checkout/verify';
import { POST as webhook } from '../../src/pages/api/webhooks/razorpay';
import { POST as quoteRoute } from '../../src/pages/api/store/cart/quote';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { hmacHex } from '../../src/lib/store/tokens';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

type Route = (ctx: any) => Promise<Response> | Response;
const call = async (route: Route, request: Request) => {
  const res = await route({ request, locals: {}, url: new URL(request.url), params: {}, cookies: {} });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://harileaf.org${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

const form = (lines: unknown, paymentMethod: 'cod' | 'razorpay') => ({
  lines,
  contact: { name: 'Asha Rao', email: 'asha@example.com', phone: '9820012345', marketingOptIn: false },
  ship: { line1: '12 Lake Road', city: 'Mumbai', stateCode: '27', pincode: '400092' },
  billSameAsShip: true,
  paymentMethod,
});

let rzpOrders = 0;
function stubRazorpay(paymentFor: (orderId: string) => unknown) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (url === 'https://api.razorpay.com/v1/orders' && init.method === 'POST') {
      const b = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ id: `order_T${++rzpOrders}`, amount: b.amount, currency: 'INR', status: 'created', receipt: b.receipt }), { status: 200 });
    }
    const m = url.match(/\/payments\/(pay_[A-Za-z0-9]+)$/);
    if (m) return new Response(JSON.stringify(paymentFor(m[1])), { status: 200 });
    return new Response('{}', { status: 404 });
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('checkout API', () => {
  it('quotes from the database', async () => {
    await putSettings(db, { ...SETTING_DEFAULTS, min_order_paise: '10000' });
    const v = await insertVariant(await insertProduct(), { price_paise: 69900, mrp_paise: 79900 });
    const r = await call(quoteRoute, post('/api/store/cart/quote', { lines: [{ variantId: v, qty: 2, price: 1 }] }));
    expect(r.body).toMatchObject({ ok: true, total: 139800, lines: [{ variantId: v, qty: 2, unitPrice: 69900 }] });
  });

  it('requires an idempotency key and a valid form', async () => {
    expect((await call(checkout, post('/api/store/checkout', form([], 'cod')))).status).toBe(400);
    const bad = await call(checkout, post('/api/store/checkout', { ...form([], 'cod'), contact: { name: '' } }, { 'Idempotency-Key': crypto.randomUUID() }));
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toHaveProperty('contact.name');
  });

  it('places a COD order and returns its private link', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 3, price_paise: 69900, mrp_paise: 79900 });
    const r = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'cod'), { 'Idempotency-Key': crypto.randomUUID() }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'placed', payment: null });
    expect(r.body.viewUrl).toMatch(new RegExp(`^/order/${r.body.orderNo}\\?t=[0-9a-f]{32}$`));
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', v)).toBe(2);
  });

  it('answers 409 with a fresh quote when the cart changed', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 1 });
    const r = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 2 }], 'cod'), { 'Idempotency-Key': crypto.randomUUID() }));
    expect(r.status).toBe(409);
    expect(r.body.quote.lines[0]).toMatchObject({ qty: 1, problem: 'limited' });
  });

  it('prepaid: creates a Razorpay order, then verify places it once', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 3, price_paise: 69900, mrp_paise: 79900 });
    let orderId = '';
    stubRazorpay(() => ({ id: 'pay_A1', amount: 69900, currency: 'INR', status: 'authorized', order_id: orderId }));
    const key = crypto.randomUUID();
    const r = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'razorpay'), { 'Idempotency-Key': key }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'pending_payment', payment: { key: 'rzp_test_key', amount: 69900, currency: 'INR' } });
    orderId = r.body.payment.order_id;

    // A retried submit returns the same order and Razorpay order.
    const again = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'razorpay'), { 'Idempotency-Key': key }));
    expect(again.body).toMatchObject({ orderNo: r.body.orderNo, payment: { order_id: orderId } });

    const token = new URL(`https://x${r.body.viewUrl}`).searchParams.get('t')!;
    const sig = await hmacHex('rzp_test_secret', `${orderId}|pay_A1`);
    const forged = await call(verify, post('/api/store/checkout/verify', { orderNo: r.body.orderNo, token, razorpay_order_id: orderId, razorpay_payment_id: 'pay_A1', razorpay_signature: 'f'.repeat(64) }));
    expect(forged.status).toBe(400);
    const ok = await call(verify, post('/api/store/checkout/verify', { orderNo: r.body.orderNo, token, razorpay_order_id: orderId, razorpay_payment_id: 'pay_A1', razorpay_signature: sig }));
    expect(ok.body).toEqual({ result: 'placed', status: 'placed' });
    const again2 = await call(verify, post('/api/store/checkout/verify', { orderNo: r.body.orderNo, token, razorpay_order_id: orderId, razorpay_payment_id: 'pay_A1', razorpay_signature: sig }));
    expect(again2.body.result).toBe('already');
  });

  it('verify refuses a payment whose amount does not match', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 3, price_paise: 69900, mrp_paise: 79900 });
    let orderId = '';
    stubRazorpay(() => ({ id: 'pay_B1', amount: 100, currency: 'INR', status: 'authorized', order_id: orderId }));
    const r = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'razorpay'), { 'Idempotency-Key': crypto.randomUUID() }));
    orderId = r.body.payment.order_id;
    const token = new URL(`https://x${r.body.viewUrl}`).searchParams.get('t')!;
    const sig = await hmacHex('rzp_test_secret', `${orderId}|pay_B1`);
    const res = await call(verify, post('/api/store/checkout/verify', { orderNo: r.body.orderNo, token, razorpay_order_id: orderId, razorpay_payment_id: 'pay_B1', razorpay_signature: sig }));
    expect(res.status).toBe(400);
    expect(await scalar('SELECT status FROM orders WHERE order_no = ?', r.body.orderNo)).toBe('pending_payment');
  });

  it('releases the hold if Razorpay is down', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 2 });
    vi.stubGlobal('fetch', async () => new Response('{"error":{"description":"down"}}', { status: 503 }));
    const r = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'razorpay'), { 'Idempotency-Key': crypto.randomUUID() }));
    expect(r.status).toBe(502);
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', v)).toBe(2);
  });
});

describe('Razorpay webhook', () => {
  async function pendingOrder() {
    const v = await insertVariant(await insertProduct(), { stock_qty: 3, price_paise: 69900, mrp_paise: 79900 });
    stubRazorpay(() => ({}));
    const r = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'razorpay'), { 'Idempotency-Key': crypto.randomUUID() }));
    vi.unstubAllGlobals();
    return r.body as { orderNo: string; payment: { order_id: string } };
  }
  const hook = async (body: unknown, eventId: string, secret = 'rzp_test_webhook_secret') => {
    const raw = JSON.stringify(body);
    const req = new Request('https://harileaf.org/api/webhooks/razorpay', {
      method: 'POST',
      headers: { 'X-Razorpay-Signature': await hmacHex(secret, raw), 'x-razorpay-event-id': eventId },
      body: raw,
    });
    const res = await webhook({ request: req, locals: {} } as any);
    return res.status;
  };

  it('rejects bad signatures and places the order on payment.authorized, once', async () => {
    const o = await pendingOrder();
    const event = { event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_W1', amount: 69900, currency: 'INR', status: 'authorized', order_id: o.payment.order_id } } } };
    expect(await hook(event, 'evt_1', 'wrong')).toBe(401);
    expect(await hook(event, 'evt_1')).toBe(200);
    expect(await hook(event, 'evt_1')).toBe(200);
    expect(await scalar('SELECT status FROM orders WHERE order_no = ?', o.orderNo)).toBe('placed');
    expect(await scalar("SELECT count(*) FROM outbox o JOIN orders r ON r.id = o.order_id WHERE r.order_no = ? AND o.kind = 'email.placed'", o.orderNo)).toBe(1);
  });

  it('acknowledges unknown orders and other events', async () => {
    expect(await hook({ event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_X', amount: 1, currency: 'INR', status: 'authorized', order_id: 'order_unknown' } } } }, 'evt_x')).toBe(200);
    expect(await hook({ event: 'refund.processed', payload: {} }, 'evt_r')).toBe(200);
  });
});
