import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { validateCheckoutInput } from '../../src/lib/store/checkout-input';
import { createOrder } from '../../src/lib/store/orders';
import { expireReservations, makeCaptureHandler, markPaid, reconcilePending } from '../../src/lib/store/payments';
import { quoteCart } from '../../src/lib/store/quote';
import type { RazorpayConfig, RazorpayPayment } from '../../src/lib/store/razorpay';
import { SETTING_DEFAULTS } from '../../src/lib/store/settings';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const T0 = new Date('2026-10-18T06:00:00Z');
const plusMin = (m: number) => new Date(T0.getTime() + m * 60_000);
const settings = { ...SETTING_DEFAULTS, min_order_paise: '10000' };
let n = 0;

async function prepaidOrder(stock = 5, qty = 1) {
  const v = await insertVariant(await insertProduct(), { stock_qty: stock, price_paise: 69900, mrp_paise: 79900 });
  const quote = await quoteCart(db, [{ variantId: v, qty }], { today: T0, settings });
  const co = validateCheckoutInput({
    contact: { name: 'Asha Rao', email: 'asha@example.com', phone: '9820012345' },
    ship: { line1: '12 Lake Road', city: 'Mumbai', stateCode: '27', pincode: '400092' },
    paymentMethod: 'razorpay',
  });
  if (!co.ok) throw new Error('checkout');
  const res = await createOrder(db, { quote, checkout: co.value, idempotencyKey: `pay-test-key-${++n}-xxxxxxxx`, sellerStateCode: '27', tokenSecret: 's', now: T0 });
  if (!res.ok) throw new Error(res.message);
  const rzpOrder = `order_${n}`;
  await db.prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?').bind(rzpOrder, res.orderId).run();
  const payment: RazorpayPayment = { id: `pay_${n}`, amount: 69900 * qty, currency: 'INR', status: 'authorized', order_id: rzpOrder };
  return { orderId: res.orderId, variantId: v, payment, rzpOrder };
}

const status = (id: number) => scalar<string>('SELECT status FROM orders WHERE id = ?', id);

describe('markPaid', () => {
  it('places the order once, consumes the hold and queues capture + confirmation', async () => {
    const o = await prepaidOrder();
    expect(await markPaid(db, { orderId: o.orderId, payment: o.payment, source: 'verify', now: plusMin(2) })).toEqual({ result: 'placed' });
    expect(await status(o.orderId)).toBe('placed');
    expect(await scalar('SELECT payment_status FROM orders WHERE id = ?', o.orderId)).toBe('authorized');
    expect(await scalar("SELECT state FROM stock_reservations WHERE order_id = ?", o.orderId)).toBe('consumed');
    expect(await scalar("SELECT group_concat(kind) FROM (SELECT kind FROM outbox WHERE order_id = ? ORDER BY id)", o.orderId)).toBe('razorpay.capture,email.placed');
    expect(await markPaid(db, { orderId: o.orderId, payment: o.payment, source: 'webhook', webhookEventId: 'evt_dup', now: plusMin(3) })).toEqual({ result: 'already' });
    expect(await scalar("SELECT count(*) FROM webhook_events WHERE event_id = 'evt_dup'")).toBe(1);
  });

  it('lets exactly one of a racing verify and webhook win', async () => {
    const o = await prepaidOrder();
    const results = await Promise.all([
      markPaid(db, { orderId: o.orderId, payment: o.payment, source: 'verify', now: plusMin(1) }),
      markPaid(db, { orderId: o.orderId, payment: o.payment, source: 'webhook', webhookEventId: `evt_race_${o.orderId}`, now: plusMin(1) }),
    ]);
    expect(results.filter((r) => r.result === 'placed')).toHaveLength(1);
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'email.placed'", o.orderId)).toBe(1);
  });

  it('ignores payments for another order or amount', async () => {
    const o = await prepaidOrder();
    expect((await markPaid(db, { orderId: o.orderId, payment: { ...o.payment, amount: 1 }, source: 'verify', now: plusMin(1) })).result).toBe('ignored');
    expect((await markPaid(db, { orderId: o.orderId, payment: { ...o.payment, order_id: 'order_other' }, source: 'verify', now: plusMin(1) })).result).toBe('ignored');
    expect((await markPaid(db, { orderId: o.orderId, payment: { ...o.payment, status: 'failed' }, source: 'verify', now: plusMin(1) })).result).toBe('ignored');
    expect(await status(o.orderId)).toBe('pending_payment');
  });
});

describe('expiry and late payments', () => {
  it('releases held stock after the window and marks the order failed', async () => {
    const o = await prepaidOrder(5, 2);
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', o.variantId)).toBe(3);
    expect(await expireReservations(db, plusMin(29))).toBe(0);
    expect(await expireReservations(db, plusMin(31))).toBeGreaterThanOrEqual(1);
    expect(await status(o.orderId)).toBe('payment_failed');
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', o.variantId)).toBe(5);
    expect(await expireReservations(db, plusMin(40))).toBe(0); // runs twice safely
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', o.variantId)).toBe(5);
  });

  it('accepts a late authorisation when stock is still there', async () => {
    const o = await prepaidOrder(5, 1);
    await expireReservations(db, plusMin(31));
    expect(await markPaid(db, { orderId: o.orderId, payment: o.payment, source: 'webhook', webhookEventId: `evt_late_${o.orderId}`, now: plusMin(35) })).toEqual({ result: 'late_placed' });
    expect(await status(o.orderId)).toBe('placed');
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', o.variantId)).toBe(4);
  });

  it('does not capture a late authorisation once the stock is gone, and tells the customer once', async () => {
    const o = await prepaidOrder(1, 1);
    await expireReservations(db, plusMin(31));
    await db.prepare('UPDATE variants SET stock_qty = 0 WHERE id = ?').bind(o.variantId).run(); // sold to someone else
    expect(await markPaid(db, { orderId: o.orderId, payment: o.payment, source: 'webhook', now: plusMin(35) })).toEqual({ result: 'late_released' });
    expect(await markPaid(db, { orderId: o.orderId, payment: o.payment, source: 'verify', now: plusMin(36) })).toEqual({ result: 'late_released' });
    expect(await status(o.orderId)).toBe('payment_failed');
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'email.payment_released'", o.orderId)).toBe(1);
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'razorpay.capture'", o.orderId)).toBe(0);
  });

  it('never revives a customer-cancelled order', async () => {
    const o = await prepaidOrder();
    await expireReservations(db, plusMin(31));
    await db.prepare("UPDATE orders SET cancelled_by = 'customer' WHERE id = ?").bind(o.orderId).run();
    expect((await markPaid(db, { orderId: o.orderId, payment: o.payment, source: 'webhook', now: plusMin(35) })).result).toBe('ignored');
  });
});

describe('reconciliation and capture', () => {
  const rzp = (handler: (url: string, init: RequestInit) => unknown) => {
    const calls: string[] = [];
    const cfg: RazorpayConfig = {
      keyId: 'rzp_test', keySecret: 'secret',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push(`${init.method} ${url}`);
        return new Response(JSON.stringify(handler(url, init)), { status: 200 });
      }) as unknown as typeof fetch,
    };
    return { cfg, calls };
  };

  it('finds payments whose callbacks were missed', async () => {
    const o = await prepaidOrder();
    const { cfg, calls } = rzp((url) => (url.includes(`/orders/${o.rzpOrder}/payments`) ? { items: [o.payment] } : { items: [] }));
    expect(await reconcilePending(db, cfg, plusMin(5))).toBe(0); // too young
    expect(await reconcilePending(db, cfg, plusMin(15))).toBeGreaterThanOrEqual(1);
    expect(await status(o.orderId)).toBe('placed');
    expect(calls.some((c) => c.includes(o.rzpOrder))).toBe(true);
  });

  it('captures an authorised payment and marks it paid, but never for a cancelled order', async () => {
    const o = await prepaidOrder();
    await markPaid(db, { orderId: o.orderId, payment: o.payment, source: 'verify', now: plusMin(1) });
    const { cfg, calls } = rzp((url, init) => (init.method === 'POST' ? { ...o.payment, status: 'captured' } : o.payment));
    const handler = makeCaptureHandler(cfg.fetch);
    const row = { id: 1, order_id: o.orderId, kind: 'razorpay.capture', payload: {}, attempts: 1 };
    const testEnv = { ...env, RAZORPAY_KEY_ID: 'rzp_test', RAZORPAY_KEY_SECRET: 'secret' } as Env;
    await handler({ paymentId: o.payment.id }, { env: testEnv, row });
    expect(await scalar('SELECT payment_status FROM orders WHERE id = ?', o.orderId)).toBe('paid');
    expect(calls).toEqual([`GET https://api.razorpay.com/v1/payments/${o.payment.id}`, `POST https://api.razorpay.com/v1/payments/${o.payment.id}/capture`]);

    const c = await prepaidOrder();
    await markPaid(db, { orderId: c.orderId, payment: c.payment, source: 'verify', now: plusMin(1) });
    await db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(c.orderId).run();
    const { cfg: cfg2, calls: calls2 } = rzp(() => c.payment);
    await makeCaptureHandler(cfg2.fetch)({ paymentId: c.payment.id }, { env: testEnv, row: { ...row, order_id: c.orderId } });
    expect(calls2).toEqual([]);
    expect(await scalar('SELECT payment_status FROM orders WHERE id = ?', c.orderId)).toBe('authorized');
  });
});
