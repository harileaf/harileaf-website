import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as checkout } from '../../src/pages/api/store/checkout/index';
import { POST as verify } from '../../src/pages/api/store/checkout/verify';
import { POST as webhook } from '../../src/pages/api/webhooks/razorpay';
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

// A fresh shopper per checkout: unconfirmed COD orders are capped per email/phone.
let shopper = 0;
const form = (lines: unknown, paymentMethod: 'cod' | 'razorpay', who = ++shopper) => ({
  lines,
  contact: { name: 'Asha Rao', email: `asha${who}@example.com`, phone: `98${String(20000000 + who).slice(-8)}`, marketingOptIn: false },
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

  it('requires an idempotency key and a valid form', async () => {
    expect((await call(checkout, post('/api/store/checkout', form([], 'cod')))).status).toBe(400);
    const bad = await call(checkout, post('/api/store/checkout', { ...form([], 'cod'), contact: { name: '' } }, { 'Idempotency-Key': crypto.randomUUID() }));
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toHaveProperty('contact.name');
  });

  it('places a COD order with a private link; a retry returns it even after the last unit is gone', async () => {
    await putSettings(db, { ...SETTING_DEFAULTS, min_order_paise: '10000' });
    const v = await insertVariant(await insertProduct(), { stock_qty: 1, price_paise: 69900, mrp_paise: 79900 });
    const key = crypto.randomUUID();
    const r = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'cod'), { 'Idempotency-Key': key }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'placed', payment: null });
    expect(r.body.viewUrl).toMatch(new RegExp(`^/order/${r.body.orderNo}\\?t=[0-9a-f]{32}$`));
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', v)).toBe(0);
    const again = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'cod', shopper), { 'Idempotency-Key': key }));
    expect(again).toMatchObject({ status: 200, body: { orderNo: r.body.orderNo, viewUrl: r.body.viewUrl } });
  });


  it('asks a duplicate submit to retry while the first is still starting the Razorpay order', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 5 });
    const key = crypto.randomUUID();
    stubRazorpay(() => ({}));
    const first = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'razorpay'), { 'Idempotency-Key': key }));
    expect(first.status).toBe(201);
    // Simulate the window before the Razorpay order id is stored.
    await db.prepare('UPDATE orders SET razorpay_order_id = NULL WHERE order_no = ?').bind(first.body.orderNo).run();
    const dup = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'razorpay', shopper), { 'Idempotency-Key': key }));
    expect(dup).toMatchObject({ status: 409, body: { code: 'in_progress' } });
  });

  it('refuses to reuse a key for a different cart or email', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 5 });
    const key = crypto.randomUUID();
    await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'cod'), { 'Idempotency-Key': key }));
    const other = await call(checkout, post('/api/store/checkout', { ...form([{ variantId: v, qty: 2 }], 'cod', shopper) }, { 'Idempotency-Key': key }));
    expect(other).toMatchObject({ status: 409, body: { code: 'key_reused' } });
  });

  it('refuses a third unconfirmed COD order from the same shopper, but not paying online', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 10 });
    const me = ++shopper;
    for (let i = 0; i < 2; i++) expect((await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'cod', me), { 'Idempotency-Key': crypto.randomUUID() }))).status).toBe(201);
    const third = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'cod', me), { 'Idempotency-Key': crypto.randomUUID() }));
    expect(third.status).toBe(422);
    expect(third.body.errors.paymentMethod).toMatch(/Confirm your earlier COD orders/);
    expect((await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'razorpay', me), { 'Idempotency-Key': crypto.randomUUID() }))).status).not.toBe(422);
  });

  it('answers 409 with a fresh quote when the price or the cart changed', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 5, price_paise: 69900, mrp_paise: 79900 });
    const r = await call(checkout, post('/api/store/checkout', { ...form([{ variantId: v, qty: 1 }], 'cod'), expectedTotal: 59900 }, { 'Idempotency-Key': crypto.randomUUID() }));
    expect(r).toMatchObject({ status: 409, body: { code: 'price_changed', quote: { total: 69900 } } });
    const short = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 9 }], 'cod'), { 'Idempotency-Key': crypto.randomUUID() }));
    expect(short.status).toBe(409);
    expect(short.body.quote.lines[0]).toMatchObject({ qty: 5, problem: 'limited' });
  });

  it('requires a buyer GSTIN to match the billing state', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 5 });
    const r = await call(checkout, post('/api/store/checkout', { ...form([{ variantId: v, qty: 1 }], 'cod'), buyerGstin: '07AAGFF2194N1Z1', buyerLegalName: 'Rao Foods' }, { 'Idempotency-Key': crypto.randomUUID() }));
    expect(r.status).toBe(400);
    expect(r.body.errors.buyerGstin).toMatch(/another state/);
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
    const again = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'razorpay', shopper), { 'Idempotency-Key': key }));
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


  it('tells the browser to start over when a retried attempt already expired', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 2 });
    stubRazorpay(() => ({}));
    const key = crypto.randomUUID();
    const first = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'razorpay'), { 'Idempotency-Key': key }));
    await db.prepare("UPDATE orders SET status = 'payment_failed' WHERE order_no = ?").bind(first.body.orderNo).run();
    const again = await call(checkout, post('/api/store/checkout', form([{ variantId: v, qty: 1 }], 'razorpay', shopper), { 'Idempotency-Key': key }));
    expect(again).toMatchObject({ status: 409, body: { code: 'expired' } });
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

  it('rejects bad signatures, places the order on payment.authorized once, and acknowledges unknown orders and events', async () => {
    const o = await pendingOrder();
    const event = { event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_W1', amount: 69900, currency: 'INR', status: 'authorized', order_id: o.payment.order_id } } } };
    expect(await hook(event, 'evt_1', 'wrong')).toBe(401);
    expect(await hook(event, 'evt_1')).toBe(200);
    expect(await hook(event, 'evt_1')).toBe(200);
    expect(await scalar('SELECT status FROM orders WHERE order_no = ?', o.orderNo)).toBe('placed');
    expect(await scalar("SELECT count(*) FROM outbox o JOIN orders r ON r.id = o.order_id WHERE r.order_no = ? AND o.kind = 'email.placed'", o.orderNo)).toBe(1);
    expect(await hook({ event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_X', amount: 1, currency: 'INR', status: 'authorized', order_id: 'order_unknown' } } } }, 'evt_x')).toBe(200);
    expect(await hook({ event: 'refund.processed', payload: {} }, 'evt_r')).toBe(200);
  });
});
