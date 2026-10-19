import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dashboardMetrics } from '../../src/lib/store/admin-orders';
import { validateCheckoutInput } from '../../src/lib/store/checkout-input';
import { cancelOrder, delayPreorder, markPacked, readyToDispatch } from '../../src/lib/store/fulfilment';
import { createOrder } from '../../src/lib/store/orders';
import type { OutboxRow } from '../../src/lib/store/outbox';
import { markPaid } from '../../src/lib/store/payments';
import { quoteCart } from '../../src/lib/store/quote';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { makeShiprocketHandlers } from '../../src/lib/store/shiprocket-orders';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const NOW = new Date('2026-12-01T06:30:00Z'); // December: outside an April–June season
const settings = {
  ...SETTING_DEFAULTS, min_order_paise: '10000', legal_name: 'HariLeaf Agritech Pvt Ltd', address: 'Borivali, Mumbai 400092', gstin: '27AAPFU0939F1ZV',
  fssai_license: '11524999000123', state_code: '27', shiprocket_pickup_location: 'Farm',
};
beforeAll(() => putSettings(db, settings));
afterEach(() => vi.unstubAllGlobals());
const ctx = { now: NOW, actorEmail: 'owner@harileaf.org' };

const preorderVariant = async (stock = 5, date = '2027-04-10') =>
  insertVariant(await insertProduct({ season_start_md: '04-01', season_end_md: '06-30', off_season_mode: 'preorder', preorder_dispatch_date: date }), { stock_qty: stock, price_paise: 90000, mrp_paise: 90000 });

let n = 0;
async function preorder(variantId: number) {
  const quote = await quoteCart(db, [{ variantId, qty: 1 }], { today: NOW, settings });
  const co = validateCheckoutInput({ contact: { name: 'Asha Rao', email: 'asha@example.com', phone: '9820012345' }, ship: { line1: '12 Lake Road', city: 'Mumbai', stateCode: '27', pincode: '400092' }, paymentMethod: 'razorpay' });
  if (!co.ok) throw new Error('co');
  const r = await createOrder(db, { quote, checkout: co.value, idempotencyKey: `pre-${++n}-xxxxxxxxxxxx`, sellerStateCode: '27', tokenSecret: 's', now: NOW });
  if (!r.ok) throw new Error(r.message);
  await db.prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?').bind(`order_p${n}`, r.orderId).run();
  await markPaid(db, { orderId: r.orderId, payment: { id: `pay_p${n}`, amount: 90000, currency: 'INR', status: 'captured', order_id: `order_p${n}` }, source: 'verify', now: NOW });
  return r.orderId;
}
const kinds = async (orderId: number) => (await db.prepare('SELECT kind FROM outbox WHERE order_id = ? ORDER BY id').bind(orderId).all<{ kind: string }>()).results.map((r) => r.kind);

describe('pre-orders', () => {
  it('check out on their own, prepaid only, taking stock from the allocation and recording the dispatch date', async () => {
    const pre = await preorderVariant(5);
    const rice = await insertVariant(await insertProduct(), { price_paise: 69900, mrp_paise: 79900 });
    const q = await quoteCart(db, [{ variantId: pre, qty: 1 }], { today: NOW, settings });
    expect(q).toMatchObject({ ok: true, groups: ['preorder'], cod: { eligible: false, reason: 'Pre-orders are prepaid' } });
    expect(await quoteCart(db, [{ variantId: pre, qty: 1 }, { variantId: rice, qty: 1 }], { today: NOW, settings })).toMatchObject({ ok: false, mixed: true });
    const later = await preorderVariant(5, '2027-05-15'); // one order is one parcel: different dispatch dates split too
    expect(await quoteCart(db, [{ variantId: pre, qty: 1 }, { variantId: later, qty: 1 }], { today: NOW, settings })).toMatchObject({ ok: false, mixed: true, groups: ['preorder'] });
    const before = await dashboardMetrics(db, NOW);
    const id = await preorder(pre);
    const after = await dashboardMetrics(db, NOW);
    expect([after.to_pack - before.to_pack, after.preorders_open - before.preorders_open]).toEqual([0, 1]); // waiting for harvest isn't "to pack"
    expect(await db.prepare('SELECT is_preorder, expected_dispatch_date, status, payment_status FROM orders WHERE id = ?').bind(id).first()).toEqual({ is_preorder: 1, expected_dispatch_date: '2027-04-10', status: 'placed', payment_status: 'paid' });
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', pre)).toBe(4);
  });

  it('reach Shiprocket only through Ready to dispatch, which invoices, pushes and emails exactly once', async () => {
    const id = await preorder(await preorderVariant());
    // The captured payment queued a push; the handler must not send a pre-order that isn't ready.
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return new Response('{}', { status: 500 });
    });
    const create = makeShiprocketHandlers()['shiprocket.create'];
    const row = (await db.prepare("SELECT * FROM outbox WHERE order_id = ? AND kind = 'shiprocket.create'").bind(id).first<OutboxRow>())!;
    await create({}, { env, row });
    expect(calls).toEqual([]);

    expect(await markPacked(db, id, ctx)).toMatchObject({ ok: false });
    const results = await Promise.all([readyToDispatch(db, id, ctx), readyToDispatch(db, id, ctx)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.prepare('SELECT status, ready_to_dispatch FROM orders WHERE id = ?').bind(id).first()).toEqual({ status: 'packed', ready_to_dispatch: 1 });
    expect(await scalar("SELECT count(*) FROM invoices WHERE order_id = ? AND series = 'INV'", id)).toBe(1);
    expect((await kinds(id)).filter((k) => k === 'email.ready_to_dispatch')).toHaveLength(1);
    expect((await kinds(id)).filter((k) => k === 'shiprocket.create')).toHaveLength(2); // the skipped one + the real push
  });

  it('can be pushed back (never brought forward) with an email, and cancelled by the customer for a full refund', async () => {
    const id = await preorder(await preorderVariant());
    expect(await delayPreorder(db, id, { date: '2027-04-01', reason: 'x' }, ctx)).toMatchObject({ ok: false });
    expect(await delayPreorder(db, id, { date: '2027-04-24', reason: 'Late flowering after unseasonal rain' }, ctx)).toEqual({ ok: true });
    expect(await delayPreorder(db, id, { date: '2027-04-24', reason: 'again' }, ctx)).toMatchObject({ ok: false });
    expect(await scalar('SELECT expected_dispatch_date FROM orders WHERE id = ?', id)).toBe('2027-04-24');
    expect((await kinds(id)).filter((k) => k === 'email.preorder_delayed')).toHaveLength(1);
    expect(await cancelOrder(db, id, { now: NOW, actor: 'customer', reason: 'Dispatch pushed back' })).toMatchObject({ ok: true });
    expect(await db.prepare('SELECT status, payment_status FROM orders WHERE id = ?').bind(id).first()).toEqual({ status: 'cancelled', payment_status: 'refund_pending' });
    expect(await scalar('SELECT amount_paise FROM refunds WHERE order_id = ?', id)).toBe(90000);
  });
});
