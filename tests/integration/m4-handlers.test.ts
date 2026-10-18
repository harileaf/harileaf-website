import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { POST as courier } from '../../src/pages/api/webhooks/courier';
import { POST as rzpWebhook } from '../../src/pages/api/webhooks/razorpay';
import { validateCheckoutInput } from '../../src/lib/store/checkout-input';
import { cancelOrder, markPacked } from '../../src/lib/store/fulfilment';
import { createOrder } from '../../src/lib/store/orders';
import { makeCaptureHandler, markPaid } from '../../src/lib/store/payments';
import { quoteCart } from '../../src/lib/store/quote';
import { makeRefundHandler } from '../../src/lib/store/refunds';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { makeShiprocketHandlers, parcel } from '../../src/lib/store/shiprocket-orders';
import { hmacHex } from '../../src/lib/store/tokens';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const NOW = new Date('2026-10-18T06:30:00Z');
const settings = { ...SETTING_DEFAULTS, cod_confirmation: 'off', min_order_paise: '100', legal_name: 'HariLeaf Agritech Pvt Ltd', address: 'Borivali, Mumbai 400092', gstin: '27AAPFU0939F1ZV', state_code: '27', shiprocket_pickup_location: 'Borivali', pickup_pincode: '400092' };
beforeAll(async () => {
  await putSettings(db, settings);
  await env.HARILEAF_CMS.put('shiprocket:token', 'tok'); // skip login
});
afterEach(() => vi.unstubAllGlobals());

async function order(method: 'cod' | 'razorpay') {
  const v = await insertVariant(await insertProduct(), { stock_qty: 5, price_paise: 69900, mrp_paise: 79900 });
  const quote = await quoteCart(db, [{ variantId: v, qty: 1 }], { today: NOW, settings });
  const co = validateCheckoutInput({ contact: { name: 'Asha Rao', email: 'asha@example.com', phone: '9820012345' }, ship: { line1: '12 Lake Road', city: 'Mumbai', stateCode: '27', pincode: '400092' }, paymentMethod: method });
  if (!co.ok) throw new Error('co');
  const r = await createOrder(db, { quote, checkout: co.value, idempotencyKey: `m4-${crypto.randomUUID()}`, sellerStateCode: '27', tokenSecret: 'sek', now: NOW });
  if (!r.ok) throw new Error(r.message);
  const rzpOrder = `order_${r.orderId}`;
  const payment = { id: `pay_${r.orderId}`, amount: 69900, currency: 'INR', status: 'authorized', order_id: rzpOrder };
  if (method === 'razorpay') {
    await db.prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?').bind(rzpOrder, r.orderId).run();
    await markPaid(db, { orderId: r.orderId, payment, source: 'verify', now: NOW });
  }
  return { id: r.orderId, orderNo: r.orderNo, payment };
}
const row = (orderId: number, kind: string) => ({ row: { id: 1, order_id: orderId, kind, payload: {}, attempts: 1 }, env });
const kinds = async (id: number) => (await db.prepare('SELECT kind FROM outbox WHERE order_id = ? ORDER BY id').bind(id).all<{ kind: string }>()).results.map((r) => r.kind);

describe('Shiprocket push', () => {
  it('COD orders are queued for Shiprocket at placement; prepaid only after capture', async () => {
    const cod = await order('cod');
    expect(await kinds(cod.id)).toContain('shiprocket.create');
    const pre = await order('razorpay');
    expect(await kinds(pre.id)).not.toContain('shiprocket.create');
    const fetches: string[] = [];
    const fake = (async (url: string) => {
      fetches.push(url);
      if (url.endsWith(`/payments/${pre.payment.id}`)) return new Response(JSON.stringify(pre.payment), { status: 200 });
      return new Response(JSON.stringify({ ...pre.payment, status: 'captured' }), { status: 200 });
    }) as unknown as typeof fetch;
    await makeCaptureHandler(fake)({ paymentId: pre.payment.id }, row(pre.id, 'razorpay.capture'));
    expect(await scalar('SELECT payment_status FROM orders WHERE id = ?', pre.id)).toBe('paid');
    expect(await kinds(pre.id)).toContain('shiprocket.create');
  });

  it('a cancel that lands mid-capture turns into a refund, not a shipment', async () => {
    const pre = await order('razorpay');
    const fake = (async (url: string) => {
      if (url.endsWith(`/payments/${pre.payment.id}`)) {
        await cancelOrder(db, pre.id, { now: NOW, actor: 'customer', reason: 'Changed my mind' }); // lands here
        return new Response(JSON.stringify(pre.payment), { status: 200 });
      }
      return new Response(JSON.stringify({ ...pre.payment, status: 'captured' }), { status: 200 });
    }) as unknown as typeof fetch;
    await makeCaptureHandler(fake)({ paymentId: pre.payment.id }, row(pre.id, 'razorpay.capture'));
    expect(await scalar('SELECT payment_status FROM orders WHERE id = ?', pre.id)).toBe('refund_pending');
    expect(await kinds(pre.id)).toContain('razorpay.refund');
    expect(await kinds(pre.id)).not.toContain('shiprocket.create');
    expect(await scalar("SELECT count(*) FROM refunds WHERE order_id = ? AND status = 'pending'", pre.id)).toBe(1);
  });

  it('creates the Shiprocket order once, reusing an existing one found by order number', async () => {
    const o = await order('cod');
    const calls: Array<{ url: string; body?: any }> = [];
    let exists = false;
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body ? JSON.parse(init.body as string) : undefined });
      if (url.includes('/orders?filter_by=channel_order_id')) return new Response(JSON.stringify({ data: exists ? [{ id: 777, channel_order_id: o.orderNo, shipments: [{ id: 888 }] }] : [] }), { status: 200 });
      if (url.endsWith('/orders/create/adhoc')) return new Response(JSON.stringify({ order_id: 777, shipment_id: 888 }), { status: 200 });
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    const h = makeShiprocketHandlers(fake);
    await h['shiprocket.create']({}, row(o.id, 'shiprocket.create'));
    const create = calls.find((c) => c.url.endsWith('/orders/create/adhoc'))!;
    expect(create.body).toMatchObject({ order_id: o.orderNo, pickup_location: 'Borivali', payment_method: 'COD', sub_total: '699.00', billing_pincode: '400092', shipping_is_billing: true });
    expect(await scalar('SELECT shiprocket_order_id FROM orders WHERE id = ?', o.id)).toBe('777');
    // A retry after the DB write was lost: lookup finds it, no second create.
    await db.prepare('UPDATE orders SET shiprocket_order_id = NULL WHERE id = ?').bind(o.id).run();
    exists = true;
    calls.length = 0;
    await h['shiprocket.create']({}, row(o.id, 'shiprocket.create'));
    expect(calls.some((c) => c.url.endsWith('/orders/create/adhoc'))).toBe(false);
    expect(await scalar('SELECT shiprocket_shipment_id FROM orders WHERE id = ?', o.id)).toBe('888');
  });

  it('sizes the parcel from the variants', () => {
    expect(parcel([{ qty: 2, weight_g: 1000, length_cm: 20, breadth_cm: 12, height_cm: 6 }, { qty: 1, weight_g: 250, length_cm: 15, breadth_cm: 10, height_cm: 4 }])).toEqual({ weight: 2.25, length: 20, breadth: 12, height: 16 });
  });
});

describe('Razorpay refunds', () => {
  it('reuses a refund Razorpay already has for our receipt, then settles on refund.processed', async () => {
    const pre = await order('razorpay');
    await db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(pre.id).run();
    await markPacked(db, pre.id, { now: NOW });
    await cancelOrder(db, pre.id, { now: NOW, actor: 'admin', reason: 'Damaged in packing' });
    const refundId = await scalar<number>('SELECT id FROM refunds WHERE order_id = ?', pre.id);
    let created = 0;
    const fake = (async (url: string, init: RequestInit) => {
      if (url.endsWith('/refunds') && init.method === 'GET') return new Response(JSON.stringify({ items: [{ id: 'rfnd_X', receipt: `rf-${refundId}`, status: 'pending', amount: 69900, payment_id: pre.payment.id }] }), { status: 200 });
      created += 1;
      return new Response('{}', { status: 500 });
    }) as unknown as typeof fetch;
    await makeRefundHandler(fake)({}, row(pre.id, 'razorpay.refund'));
    expect(created).toBe(0);
    expect(await scalar('SELECT razorpay_refund_id FROM refunds WHERE id = ?', refundId)).toBe('rfnd_X');

    const body = JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_X', status: 'processed', receipt: `rf-${refundId}`, payment_id: pre.payment.id, amount: 69900 } } } });
    const sig = await hmacHex('rzp_test_webhook_secret', body);
    const req = () => new Request('https://harileaf.org/api/webhooks/razorpay', { method: 'POST', headers: { 'X-Razorpay-Signature': sig, 'x-razorpay-event-id': `evt_rf_${pre.id}` }, body });
    expect((await rzpWebhook({ request: req(), locals: {} } as any)).status).toBe(200);
    expect((await rzpWebhook({ request: req(), locals: {} } as any)).status).toBe(200);
    expect(await scalar('SELECT payment_status FROM orders WHERE id = ?', pre.id)).toBe('refunded');
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'email.refunded'", pre.id)).toBe(1);
  });
});

describe('courier webhook', () => {
  const hook = (body: unknown, token = 'test-courier-token') =>
    courier({ request: new Request('https://harileaf.org/api/webhooks/courier', { method: 'POST', headers: { 'x-api-key': token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), locals: {} } as any);

  it('rejects a wrong token', async () => {
    expect((await hook({}, 'nope')).status).toBe(403);
  });

  it('packs (with invoice) and ships on pickup, delivers on delivery, ignores duplicates', async () => {
    const o = await order('cod');
    await db.prepare("UPDATE orders SET shiprocket_order_id = ? WHERE id = ?").bind(`sr${o.id}`, o.id).run();
    const base = { sr_order_id: `sr${o.id}`, awb: `AWB${o.id}`, courier_name: 'Delhivery' };
    expect((await hook({ ...base, shipment_status_id: 42, shipment_status: 'PICKED UP', current_timestamp: '18 10 2026 12:00:00' })).status).toBe(200);
    expect(await scalar('SELECT status FROM orders WHERE id = ?', o.id)).toBe('shipped');
    expect(await scalar("SELECT count(*) FROM invoices WHERE order_id = ? AND series = 'INV'", o.id)).toBe(1);
    expect(await scalar('SELECT tracking_url FROM orders WHERE id = ?', o.id)).toBe(`https://shiprocket.co/tracking/AWB${o.id}`);
    await hook({ ...base, shipment_status_id: 7, shipment_status: 'DELIVERED', current_timestamp: '19 10 2026 12:00:00' });
    await hook({ ...base, shipment_status_id: 7, shipment_status: 'DELIVERED', current_timestamp: '19 10 2026 12:00:00' });
    expect(await scalar('SELECT status || payment_status FROM orders WHERE id = ?', o.id)).toBe('deliveredpaid');
    expect(await scalar("SELECT count(*) FROM order_events WHERE order_id = ? AND type = 'delivered'", o.id)).toBe(1);
  });

  it('records failed delivery attempts and RTO', async () => {
    const o = await order('cod');
    await db.prepare("UPDATE orders SET awb = ? WHERE id = ?").bind(`AWBR${o.id}`, o.id).run();
    const base = { awb: `AWBR${o.id}` };
    await hook({ ...base, shipment_status_id: 6, shipment_status: 'SHIPPED', current_timestamp: '1' });
    await hook({ ...base, shipment_status_id: 21, shipment_status: 'UNDELIVERED', current_timestamp: '2' });
    await hook({ ...base, shipment_status_id: 9, shipment_status: 'RTO INITIATED', current_timestamp: '3' });
    expect(await scalar('SELECT status FROM orders WHERE id = ?', o.id)).toBe('rto');
    expect(await scalar("SELECT count(*) FROM order_events WHERE order_id = ? AND type = 'ndr'", o.id)).toBe(1);
  });
});

describe('PR #4 review', () => {
  it('splits names for Shiprocket so the last name is never empty', async () => {
    const { splitName } = await import('../../src/lib/store/shiprocket-orders');
    expect(splitName('Meenakshi')).toEqual({ first: 'Meenakshi', last: '.' });
    expect(splitName('  Asha   Rao  Kumar ')).toEqual({ first: 'Asha', last: 'Rao Kumar' });
  });

  it('fills in the AWB from a late courier scan when the admin shipped it without one', async () => {
    const o = await order('cod');
    await db.prepare("UPDATE orders SET shiprocket_order_id = ? WHERE id = ?").bind(`srL${o.id}`, o.id).run();
    await markPacked(db, o.id, { now: NOW });
    const { markShipped } = await import('../../src/lib/store/fulfilment');
    await markShipped(db, o.id, { awb: null, courier: null, trackingUrl: null }, { now: NOW, actor: 'admin' });
    const res = await courier({ request: new Request('https://harileaf.org/api/webhooks/courier', { method: 'POST', headers: { 'x-api-key': 'test-courier-token' }, body: JSON.stringify({ sr_order_id: `srL${o.id}`, awb: `LATE${o.id}`, courier_name: 'Delhivery', shipment_status_id: 18, shipment_status: 'IN TRANSIT', current_timestamp: 't' }) }), locals: {} } as any);
    expect(res.status).toBe(200);
    expect(await scalar('SELECT awb || courier FROM orders WHERE id = ?', o.id)).toBe(`LATE${o.id}Delhivery`);
  });
});
