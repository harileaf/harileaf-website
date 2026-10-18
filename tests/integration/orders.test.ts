import { describe, expect, it } from 'vitest';
import { validateCheckoutInput, type CheckoutInput } from '../../src/lib/store/checkout-input';
import { createOrder, getOrderByNo } from '../../src/lib/store/orders';
import { quoteCart } from '../../src/lib/store/quote';
import { SETTING_DEFAULTS } from '../../src/lib/store/settings';
import { checkViewToken } from '../../src/lib/store/tokens';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const NOW = new Date('2026-10-18T06:30:00Z');
const settings = { ...SETTING_DEFAULTS, min_order_paise: '10000' };
const SECRET = 'test-order-token-secret';

function checkout(over: Record<string, unknown> = {}): CheckoutInput {
  const res = validateCheckoutInput({
    contact: { name: 'Asha Rao', email: 'asha@example.com', phone: '+91 98200 12345', marketingOptIn: false },
    ship: { line1: '12 Lake Road, Borivali West', city: 'Mumbai', stateCode: '27', pincode: '400092' },
    billSameAsShip: true,
    paymentMethod: 'cod',
    ...over,
  });
  if (!res.ok) throw new Error(JSON.stringify(res.errors));
  return res.value;
}

let keyN = 0;
const key = () => `test-idem-key-${++keyN}-${'x'.repeat(8)}`;

async function place(variantId: number, qty: number, over: Record<string, unknown> = {}, idempotencyKey = key()) {
  const quote = await quoteCart(db, [{ variantId, qty }], { today: NOW, settings });
  return createOrder(db, { quote, checkout: checkout(over), idempotencyKey, sellerStateCode: '27', tokenSecret: SECRET, now: NOW });
}

describe('validateCheckoutInput', () => {
  it('normalises phone and email and requires a valid address', () => {
    expect(checkout().contact).toEqual({ name: 'Asha Rao', email: 'asha@example.com', phone: '9820012345', marketingOptIn: false });
    const bad = validateCheckoutInput({ contact: { name: 'A', email: 'x', phone: '12345' }, ship: { pincode: '012345', stateCode: '28' }, paymentMethod: 'card' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['contact.email', 'contact.name', 'contact.phone', 'paymentMethod', 'ship.city', 'ship.line1', 'ship.name', 'ship.pincode', 'ship.stateCode'].sort());
  });
  it('validates an optional buyer GSTIN', () => {
    const r = validateCheckoutInput({ ...checkout(), contact: checkout().contact, ship: { line1: '12 Lake Road', city: 'Mumbai', stateCode: '27', pincode: '400092' }, paymentMethod: 'cod', buyerGstin: '27AAPFU0939F1ZW' });
    expect(r.ok).toBe(false);
  });
});

describe('createOrder', () => {
  it('places a COD order: stock taken, reservation consumed, confirmation queued', async () => {
    const v = await insertVariant(await insertProduct({ name: 'Karjat 3' }), { stock_qty: 5, price_paise: 69900, mrp_paise: 79900 });
    const res = await place(v, 2);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.orderNo).toMatch(/^HL-2610-\d{4}$/);
    expect(res.status).toBe('placed');
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', v)).toBe(3);
    const view = await getOrderByNo(db, res.orderNo);
    expect(view?.order).toMatchObject({ status: 'placed', payment_method: 'cod', payment_status: 'unpaid', total_paise: 139800, ship_state_code: '27', phone: '9820012345' });
    expect(view?.items[0]).toMatchObject({ qty: 2, unit_price_paise: 69900, line_total_paise: 139800, cgst_paise: 3328, sgst_paise: 3329, igst_paise: 0 });
    expect(await scalar("SELECT state FROM stock_reservations WHERE order_id = ?", res.orderId)).toBe('consumed');
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'email.placed'", res.orderId)).toBe(1);
    expect(await checkViewToken(SECRET, res.viewToken, view!.order.view_token_hash)).toBe(true);
  });

  it('holds stock for a prepaid order and charges IGST outside Maharashtra', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 5, price_paise: 69900, mrp_paise: 79900 });
    const res = await place(v, 1, { paymentMethod: 'razorpay', ship: { line1: '4 MG Road', city: 'Bengaluru', stateCode: '29', pincode: '560001' } });
    if (!res.ok) throw new Error(res.message);
    const view = await getOrderByNo(db, res.orderNo);
    expect(view?.order).toMatchObject({ status: 'pending_payment', payment_method: 'razorpay', gst_paise: 3329 });
    expect(view?.items[0]).toMatchObject({ cgst_paise: 0, sgst_paise: 0, igst_paise: 3329 });
    expect(view?.holdExpiresAt).toBe('2026-10-18T07:00:00.000Z');
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ?", res.orderId)).toBe(0);
  });

  it('returns the same order (and link) for a retried submit', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 5 });
    const k = key();
    const a = await place(v, 1, {}, k);
    const b = await place(v, 1, {}, k);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b).toMatchObject({ existing: true, orderNo: a.orderNo, viewToken: a.viewToken });
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', v)).toBe(4);
  });

  it('creates exactly one order when identical submits race', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 5 });
    const k = key();
    const results = await Promise.all([place(v, 1, {}, k), place(v, 1, {}, k), place(v, 1, {}, k)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(results.map((r) => (r.ok ? r.orderNo : '')))).toHaveProperty('size', 1);
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', v)).toBe(4);
  });

  it('sells the last unit exactly once', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 1 });
    const results = await Promise.all([place(v, 1), place(v, 1)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, reason: 'stock' });
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', v)).toBe(0);
  });

  it('numbers orders consecutively within the month', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 10 });
    const a = await place(v, 1);
    const b = await place(v, 1);
    if (!a.ok || !b.ok) throw new Error('setup');
    expect(Number(b.orderNo.slice(-4))).toBe(Number(a.orderNo.slice(-4)) + 1);
  });

  it('refuses a cart that changed', async () => {
    const v = await insertVariant(await insertProduct(), { stock_qty: 1 });
    const quote = await quoteCart(db, [{ variantId: v, qty: 3 }], { today: NOW, settings }); // limited → not ok
    const res = await createOrder(db, { quote, checkout: checkout(), idempotencyKey: key(), sellerStateCode: '27', tokenSecret: SECRET, now: NOW });
    expect(res).toMatchObject({ ok: false, reason: 'invalid' });
  });
});
