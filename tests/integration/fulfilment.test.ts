import { beforeAll, describe, expect, it } from 'vitest';
import { validateCheckoutInput } from '../../src/lib/store/checkout-input';
import { cancelOrder, createReplacement, markDelivered, markPacked, markReturned, markRto, markShipped, receiveReturn, refundOrder } from '../../src/lib/store/fulfilment';
import { createOrder } from '../../src/lib/store/orders';
import { markPaid } from '../../src/lib/store/payments';
import { quoteCart } from '../../src/lib/store/quote';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const NOW = new Date('2026-10-18T06:30:00Z');
const settings = {
  ...SETTING_DEFAULTS, min_order_paise: '100', legal_name: 'HariLeaf Agritech Pvt Ltd', address: 'Borivali, Mumbai 400092', gstin: '27AAPFU0939F1ZV',
  fssai_license: '11524999000123', state_code: '27',
};
beforeAll(async () => putSettings(db, settings));

async function order(method: 'cod' | 'razorpay', opts: { stock?: number; perishable?: boolean } = {}) {
  const v = await insertVariant(await insertProduct(opts.perishable ? { perishable: 1, cod_allowed: 0, category_id: 3 } : {}), { stock_qty: opts.stock ?? 5, price_paise: 69900, mrp_paise: 79900 });
  const quote = await quoteCart(db, [{ variantId: v, qty: 1 }], { today: NOW, settings });
  const co = validateCheckoutInput({ contact: { name: 'Asha Rao', email: 'asha@example.com', phone: '9820012345' }, ship: { line1: '12 Lake Road', city: 'Mumbai', stateCode: '27', pincode: '400092' }, paymentMethod: method });
  if (!co.ok) throw new Error('co');
  const r = await createOrder(db, { quote, checkout: co.value, idempotencyKey: `ful-${crypto.randomUUID()}`, sellerStateCode: '27', tokenSecret: 'sek', now: NOW });
  if (!r.ok) throw new Error(r.message);
  if (method === 'razorpay') {
    await db.prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?').bind(`order_${r.orderId}`, r.orderId).run();
    await markPaid(db, { orderId: r.orderId, payment: { id: `pay_${r.orderId}`, amount: 69900, currency: 'INR', status: 'captured', order_id: `order_${r.orderId}` }, source: 'verify', now: NOW });
  }
  return { id: r.orderId, variantId: v };
}

const st = (id: number) => scalar<string>('SELECT status FROM orders WHERE id = ?', id);
const pay = (id: number) => scalar<string>('SELECT payment_status FROM orders WHERE id = ?', id);
const stock = (v: number) => scalar<number>('SELECT stock_qty FROM variants WHERE id = ?', v);
const ctx = { now: NOW, actorEmail: 'admin@harileaf.org' };

describe('happy path', () => {
  it('packs (issuing the invoice), ships, delivers; COD becomes paid on delivery', async () => {
    const o = await order('cod');
    expect(await markPacked(db, o.id, ctx)).toEqual({ ok: true });
    expect(await st(o.id)).toBe('packed');
    const inv = await db.prepare("SELECT doc_no, doc_type, snapshot FROM invoices WHERE order_id = ? AND series = 'INV'").bind(o.id).first<{ doc_no: string; doc_type: string; snapshot: string }>();
    expect(inv?.doc_no).toMatch(/^HL\/2627\/\d{6}$/);
    expect(inv?.doc_type).toBe('tax_invoice');
    expect(JSON.parse(inv!.snapshot).totals.total).toBe(69900);
    expect(await scalar('SELECT invoice_id IS NOT NULL FROM orders WHERE id = ?', o.id)).toBe(1);
    expect(await markPacked(db, o.id, ctx)).toMatchObject({ ok: false });
    expect(await markShipped(db, o.id, { awb: 'AWB1', courier: 'Delhivery', trackingUrl: 'https://shiprocket.co/tracking/AWB1' }, { ...ctx, actor: 'admin' })).toEqual({ ok: true });
    expect(await markDelivered(db, o.id, { ...ctx, actor: 'shiprocket' })).toEqual({ ok: true });
    expect([await st(o.id), await pay(o.id)]).toEqual(['delivered', 'paid']);
    expect(await scalar("SELECT group_concat(kind) FROM (SELECT kind FROM outbox WHERE order_id = ? AND kind LIKE 'email.%' ORDER BY id)", o.id)).toBe('email.placed,email.owner_new_order,email.shipped,email.delivered');
  });

  it('refuses to invoice without the seller details', async () => {
    const o = await order('cod');
    await putSettings(db, { ...settings, gstin: '' });
    expect(await markPacked(db, o.id, ctx)).toEqual({ ok: false, error: 'Fill in Store settings before issuing invoices: gstin' });
    await putSettings(db, settings);
  });

  it('refuses to pack an unpaid prepaid order', async () => {
    const o = await order('cod');
    await db.prepare("UPDATE orders SET payment_method = 'razorpay', payment_status = 'unpaid' WHERE id = ?").bind(o.id).run();
    expect((await markPacked(db, o.id, ctx)).ok).toBe(false);
  });
});

describe('cancellation', () => {
  it('customer cancels a placed COD order: stock back, no money involved', async () => {
    const o = await order('cod', { stock: 3 });
    expect(await stock(o.variantId)).toBe(2);
    expect(await cancelOrder(db, o.id, { now: NOW, actor: 'customer', reason: '' })).toEqual({ ok: true });
    expect(await st(o.id)).toBe('cancelled');
    expect(await stock(o.variantId)).toBe(3);
    expect(await scalar('SELECT cancelled_by FROM orders WHERE id = ?', o.id)).toBe('customer');
    expect(await cancelOrder(db, o.id, { now: NOW, actor: 'customer', reason: '' })).toMatchObject({ ok: false });
    expect(await stock(o.variantId)).toBe(3);
  });

  it('customers cannot cancel once packed; admins can, with a credit note and a refund', async () => {
    const o = await order('razorpay');
    await markPacked(db, o.id, ctx);
    expect((await cancelOrder(db, o.id, { now: NOW, actor: 'customer', reason: '' })).ok).toBe(false);
    expect(await cancelOrder(db, o.id, { now: NOW, actor: 'admin', reason: 'Out of stock after packing check', actorEmail: 'admin@harileaf.org' })).toEqual({ ok: true });
    expect(await pay(o.id)).toBe('refund_pending');
    const cn = await db.prepare("SELECT doc_no, ref_invoice_id FROM invoices WHERE order_id = ? AND series = 'CN'").bind(o.id).first<{ doc_no: string; ref_invoice_id: number }>();
    expect(cn?.doc_no).toMatch(/^HLCN\/2627\/\d{5}$/);
    expect(await scalar("SELECT count(*) FROM refunds WHERE order_id = ? AND status = 'pending' AND credit_note_id IS NOT NULL", o.id)).toBe(1);
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'razorpay.refund'", o.id)).toBe(1);
  });

  it('cancelling an authorised (uncaptured) order needs no refund', async () => {
    const o = await order('razorpay');
    await db.prepare("UPDATE orders SET payment_status = 'authorized' WHERE id = ?").bind(o.id).run();
    expect(await cancelOrder(db, o.id, { now: NOW, actor: 'customer', reason: 'Changed my mind' })).toEqual({ ok: true });
    expect(await pay(o.id)).toBe('authorized');
    expect(await scalar("SELECT count(*) FROM refunds WHERE order_id = ?", o.id)).toBe(0);
  });

  it('a cancel racing a pack lets exactly one win', async () => {
    const o = await order('cod');
    const [a, b] = await Promise.all([markPacked(db, o.id, ctx), cancelOrder(db, o.id, { now: NOW, actor: 'customer', reason: '' })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });
});

describe('after dispatch', () => {
  it('RTO, receive back (restocking non-perishables only once), then refund a prepaid order', async () => {
    const o = await order('razorpay', { stock: 4 });
    await markPacked(db, o.id, ctx);
    await markShipped(db, o.id, { awb: 'A2', courier: 'X', trackingUrl: null }, { ...ctx, actor: 'shiprocket' });
    expect(await markRto(db, o.id, { ...ctx, actor: 'shiprocket' })).toEqual({ ok: true });
    expect(await receiveReturn(db, o.id, ctx)).toEqual({ ok: true });
    expect(await receiveReturn(db, o.id, ctx)).toMatchObject({ ok: false });
    expect(await stock(o.variantId)).toBe(4);
    expect(await refundOrder(db, o.id, { now: NOW, reason: 'RTO' })).toEqual({ ok: true });
    expect(await refundOrder(db, o.id, { now: NOW, reason: 'again' })).toMatchObject({ ok: false });
    expect(await pay(o.id)).toBe('refund_pending');
  });

  it('records a manual COD refund with its reference', async () => {
    const o = await order('cod');
    await markPacked(db, o.id, ctx);
    await markShipped(db, o.id, { awb: 'A3', courier: 'X', trackingUrl: null }, { ...ctx, actor: 'admin' });
    await markDelivered(db, o.id, { ...ctx, actor: 'admin' });
    expect((await refundOrder(db, o.id, { now: NOW, reason: 'Damaged on arrival' })).ok).toBe(false); // needs a reference
    expect(await refundOrder(db, o.id, { now: NOW, reason: 'Damaged on arrival', manualReference: 'UPI 4321' })).toEqual({ ok: true });
    expect(await pay(o.id)).toBe('refunded');
    expect(await scalar("SELECT status FROM refunds WHERE order_id = ?", o.id)).toBe('processed');
  });

  it('never restocks perishables', async () => {
    const o = await order('razorpay', { perishable: true, stock: 4 });
    await markPacked(db, o.id, ctx);
    await markShipped(db, o.id, { awb: 'A4', courier: 'X', trackingUrl: null }, { ...ctx, actor: 'admin' });
    await markDelivered(db, o.id, { ...ctx, actor: 'admin' });
    await markReturned(db, o.id, { ...ctx, note: 'Customer returned' });
    await receiveReturn(db, o.id, ctx);
    expect(await stock(o.variantId)).toBe(3);
  });

  it('creates a zero-value replacement linked to the original, without an invoice', async () => {
    const o = await order('cod', { stock: 5 });
    await markPacked(db, o.id, ctx);
    await markShipped(db, o.id, { awb: 'A5', courier: 'X', trackingUrl: null }, { ...ctx, actor: 'admin' });
    await markDelivered(db, o.id, { ...ctx, actor: 'admin' });
    const itemId = await scalar<number>('SELECT id FROM order_items WHERE order_id = ?', o.id);
    const requestKey = crypto.randomUUID();
    const [r, again] = await Promise.all([
      createReplacement(db, o.id, { now: NOW, lines: [{ itemId, qty: 1 }], note: 'Pack arrived torn', tokenSecret: 'sek', requestKey }),
      createReplacement(db, o.id, { now: NOW, lines: [{ itemId, qty: 1 }], note: 'Pack arrived torn', tokenSecret: 'sek', requestKey }),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok || !again.ok) throw new Error('replacement failed');
    expect(again.orderNo).toBe(r.orderNo); // double submit → same replacement
    expect(await scalar('SELECT count(*) FROM orders WHERE replacement_for_order_id = ?', o.id)).toBe(1);
    const rep = await db.prepare('SELECT id, total_paise, status, replacement_for_order_id FROM orders WHERE order_no = ?').bind(r.orderNo).first<{ id: number; total_paise: number; status: string; replacement_for_order_id: number }>();
    expect(rep).toMatchObject({ total_paise: 0, status: 'placed', replacement_for_order_id: o.id });
    expect(await stock(o.variantId)).toBe(3);
    expect(await markPacked(db, rep!.id, ctx)).toEqual({ ok: true });
    expect(await scalar("SELECT count(*) FROM invoices WHERE order_id = ?", rep!.id)).toBe(0);
    const dc = await db.prepare('SELECT doc_no, snapshot FROM delivery_challans WHERE order_id = ?').bind(rep!.id).first<{ doc_no: string; snapshot: string }>();
    expect(dc?.doc_no).toMatch(/^HLDC\/2627\/\d{5}$/);
    expect(JSON.parse(dc!.snapshot)).toMatchObject({ docType: 'delivery_challan', totals: { total: 69900, cgst: 0, igst: 0 } });
    // The original had 1 unit, already replaced: no second replacement for it.
    expect(await createReplacement(db, o.id, { now: NOW, lines: [{ itemId, qty: 1 }], note: 'x', tokenSecret: 'sek', requestKey: crypto.randomUUID() })).toMatchObject({ ok: false, error: /already replaced/ });
  });
});
