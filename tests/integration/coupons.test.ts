import { describe, expect, it } from 'vitest';
import { validateCheckoutInput } from '../../src/lib/store/checkout-input';
import { cancelOrder } from '../../src/lib/store/fulfilment';
import { createOrder } from '../../src/lib/store/orders';
import { abortPendingOrder, expireReservations, markPaid } from '../../src/lib/store/payments';
import { quoteCart } from '../../src/lib/store/quote';
import { SETTING_DEFAULTS } from '../../src/lib/store/settings';
import { AT, db, insertOrder, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

let n = 0;
async function insertCoupon(over: Partial<Record<string, unknown>> = {}): Promise<string> {
  const row = { code: `TEST${++n}X`, kind: 'percent', value: 10, created_at: AT, updated_at: AT, ...over };
  const cols = Object.keys(row);
  await db.prepare(`INSERT INTO coupons (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...Object.values(row)).run();
  return row.code as string;
}
const redeem = (code: string, orderId: number, phone: string | null = null, at = AT) =>
  db.prepare('INSERT INTO coupon_redemptions (coupon_code, order_id, phone, created_at) VALUES (?, ?, ?, ?)').bind(code, orderId, phone, at).run();

describe('coupon schema', () => {
  it('counts uses in the database: limit, one per phone, paused/out-of-date codes, release, frozen terms', async () => {
    const code = await insertCoupon({ usage_limit: 1 });
    await redeem(code, await insertOrder());
    await expect(redeem(code, await insertOrder())).rejects.toThrow(/coupon_usage_limit/);
    expect(await scalar('SELECT used_count FROM coupons WHERE code = ?', code)).toBe(1);

    const perPhone = await insertCoupon({ one_per_phone: 1 });
    await redeem(perPhone, await insertOrder(), '9820000000');
    await expect(redeem(perPhone, await insertOrder(), '9820000000')).rejects.toThrow(/UNIQUE/);
    await expect(redeem(perPhone, await insertOrder(), null)).rejects.toThrow(/not redeemable/);

    const later = await insertCoupon({ starts_at: '2026-11-01T00:00:00.000Z' });
    await expect(redeem(later, await insertOrder())).rejects.toThrow(/not redeemable/);
    const paused = await insertCoupon({ active: 0 });
    await expect(redeem(paused, await insertOrder())).rejects.toThrow(/not redeemable/);

    // Releasing a use (payment failed) gives it back; the terms stay frozen.
    await db.prepare('DELETE FROM coupon_redemptions WHERE coupon_code = ?').bind(code).run();
    expect(await scalar('SELECT used_count FROM coupons WHERE code = ?', code)).toBe(0);
    await expect(db.prepare('UPDATE coupons SET value = 20 WHERE code = ?').bind(code).run()).rejects.toThrow(/frozen/);
    await db.prepare('UPDATE coupons SET active = 0 WHERE code = ?').bind(code).run();

    // Flat codes can't cover a whole order; a discount needs a coupon.
    await expect(insertCoupon({ kind: 'flat', value: 10000, min_order_paise: 10000 })).rejects.toThrow(/CHECK/);
    await expect(insertOrder({ discount_paise: 100, total_paise: 69800 })).rejects.toThrow(/discount without a coupon/);
  });
});

const NOW = new Date('2026-11-18T06:30:00Z'); // not October: fixture orders use HL-2610-*
const settings = { ...SETTING_DEFAULTS, min_order_paise: '10000' };
let k = 0;

async function place(lines: { variantId: number; qty: number }[], o: { coupon?: string; phone?: string; paymentMethod?: 'cod' | 'razorpay'; now?: Date } = {}) {
  const phone = o.phone ?? `98200${String(++k).padStart(5, '0')}`;
  const now = o.now ?? NOW;
  const quote = await quoteCart(db, lines, { today: now, settings, coupon: o.coupon ?? null, phone });
  const co = validateCheckoutInput({
    contact: { name: 'Asha Rao', email: 'asha@example.com', phone },
    ship: { line1: '12 Lake Road', city: 'Mumbai', stateCode: '27', pincode: '400092' },
    paymentMethod: o.paymentMethod ?? 'cod',
  });
  if (!co.ok) throw new Error('checkout');
  const res = await createOrder(db, { quote, checkout: co.value, idempotencyKey: `coupon-key-${++k}-xxxxxxxx`, sellerStateCode: '27', tokenSecret: 's', now });
  return { quote, res };
}

describe('coupons at checkout', () => {
  it('discounts eligible lines before GST, stores the split on the order, and counts the use', async () => {
    const code = await insertCoupon({ value: 10, category_ids: '[1]' });
    const rice = await insertVariant(await insertProduct({ category_id: 1 }), { price_paise: 69900, mrp_paise: 79900 });
    const spice = await insertVariant(await insertProduct({ category_id: 2, gst_rate_bp: 0 }), { price_paise: 30100, mrp_paise: 30100 });
    const { quote, res } = await place([{ variantId: rice, qty: 2 }, { variantId: spice, qty: 1 }], { coupon: code.toLowerCase() });
    expect(quote.coupon).toMatchObject({ ok: true, code, discount: 13980 });
    expect(quote).toMatchObject({ subtotal: 169900, discount: 13980, total: 155920 });
    if (!res.ok) throw new Error(res.message);
    const order = await db.prepare('SELECT coupon_code, discount_paise, total_paise, gst_paise FROM orders WHERE id = ?').bind(res.orderId).first();
    expect(order).toMatchObject({ coupon_code: code, discount_paise: 13980, total_paise: 155920 });
    const items = (await db.prepare('SELECT discount_paise, line_total_paise, taxable_paise + cgst_paise + sgst_paise + igst_paise AS parts FROM order_items WHERE order_id = ? ORDER BY id').bind(res.orderId).all<{ discount_paise: number; line_total_paise: number; parts: number }>()).results;
    expect(items.map((i) => i.discount_paise)).toEqual([13980, 0]);
    expect(items.reduce((a, i) => a + i.line_total_paise, 0)).toBe(155920);
    items.forEach((i) => expect(i.parts).toBe(i.line_total_paise));
    expect(await scalar('SELECT used_count FROM coupons WHERE code = ?', code)).toBe(1);
  });

  it('lets exactly one of two orders racing for the last use win; the loser is told why', async () => {
    const code = await insertCoupon({ usage_limit: 1 });
    const v = await insertVariant(await insertProduct(), { stock_qty: 10 });
    const [a, b] = await Promise.all([place([{ variantId: v, qty: 1 }], { coupon: code }), place([{ variantId: v, qty: 1 }], { coupon: code })]);
    expect([a.res, b.res].filter((r) => r.ok)).toHaveLength(1);
    expect([a.res, b.res].find((r) => !r.ok)).toMatchObject({ ok: false, reason: 'coupon' });
    expect(await scalar('SELECT used_count FROM coupons WHERE code = ?', code)).toBe(1);
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', v)).toBe(9);
    expect((await place([{ variantId: v, qty: 1 }], { coupon: code })).quote.coupon).toMatchObject({ ok: false, reason: 'limit_reached' });
    expect((await quoteCart(db, [{ variantId: v, qty: 1 }], { today: NOW, settings, coupon: { code } })).coupon).toEqual({ ok: false, code: '', reason: 'not_found', message: 'This code isn’t valid.' });
  });

  it('lets one phone use a one-per-phone code once, even when its orders race', async () => {
    const code = await insertCoupon({ one_per_phone: 1 });
    const v = await insertVariant(await insertProduct(), { stock_qty: 10 });
    const phone = '9876543210';
    const results = await Promise.all([1, 2, 3].map(() => place([{ variantId: v, qty: 1 }], { coupon: code, phone })));
    expect(results.filter((r) => r.res.ok)).toHaveLength(1);
    expect((await place([{ variantId: v, qty: 1 }], { coupon: code, phone })).quote.coupon).toMatchObject({ ok: false, reason: 'phone_used' });
    expect((await place([{ variantId: v, qty: 1 }], { coupon: code })).res.ok).toBe(true);
  });

  it('gives the use back exactly once when the payment fails, never on cancel, and retakes it for a late payment', async () => {
    const code = await insertCoupon({ usage_limit: 5 });
    const v = await insertVariant(await insertProduct(), { stock_qty: 10 });
    const prepaid = await place([{ variantId: v, qty: 1 }], { coupon: code, paymentMethod: 'razorpay' });
    if (!prepaid.res.ok) throw new Error(prepaid.res.message);
    const id = prepaid.res.orderId;
    await db.prepare("UPDATE orders SET razorpay_order_id = 'order_cpn' WHERE id = ?").bind(id).run();
    const later = new Date(NOW.getTime() + 31 * 60_000);
    await Promise.all([expireReservations(db, later), expireReservations(db, later), abortPendingOrder(db, id, later, 'x')]);
    expect(await scalar('SELECT used_count FROM coupons WHERE code = ?', code)).toBe(0);
    expect(await scalar("SELECT status FROM orders WHERE id = ?", id)).toBe('payment_failed');

    // The authorisation arrives late: the order revives and takes its use back.
    const payment = { id: 'pay_cpn', amount: prepaid.res.total, currency: 'INR', status: 'authorized', order_id: 'order_cpn' } as const;
    expect(await markPaid(db, { orderId: id, payment, source: 'webhook', now: later })).toEqual({ result: 'late_placed' });
    expect(await scalar('SELECT used_count FROM coupons WHERE code = ?', code)).toBe(1);

    const cod = await place([{ variantId: v, qty: 1 }], { coupon: code });
    if (!cod.res.ok) throw new Error(cod.res.message);
    await cancelOrder(db, cod.res.orderId, { now: later, actor: 'customer', reason: 'changed my mind' });
    expect(await scalar('SELECT used_count FROM coupons WHERE code = ?', code)).toBe(2);
  });
});
