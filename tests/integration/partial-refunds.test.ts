import { beforeAll, describe, expect, it } from 'vitest';
import { validateCheckoutInput } from '../../src/lib/store/checkout-input';
import { markDelivered, markPacked, markShipped, refundOrder } from '../../src/lib/store/fulfilment';
import { createOrder } from '../../src/lib/store/orders';
import { markPaid } from '../../src/lib/store/payments';
import { quoteCart } from '../../src/lib/store/quote';
import { applyRefundStatus, retryRefundStmts } from '../../src/lib/store/refunds';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const NOW = new Date('2026-12-05T06:30:00Z');
const settings = {
  ...SETTING_DEFAULTS, cod_confirmation: 'off', min_order_paise: '100', legal_name: 'HariLeaf Agritech Pvt Ltd', address: 'Borivali, Mumbai 400092', gstin: '27AAPFU0939F1ZV',
  fssai_license: '11524999000123', state_code: '27',
};
beforeAll(() => putSettings(db, settings));
const ctx = { now: NOW, actorEmail: 'owner@harileaf.org' };
let n = 0;

/** A delivered order: rice ₹699 × 2 (5% GST) + turmeric ₹301 × 1 (0%), prepaid (captured) or COD. */
async function delivered(method: 'razorpay' | 'cod' = 'razorpay') {
  const rice = await insertVariant(await insertProduct(), { price_paise: 69900, mrp_paise: 69900, stock_qty: 10 });
  const tur = await insertVariant(await insertProduct({ gst_rate_bp: 0 }), { price_paise: 30100, mrp_paise: 30100, stock_qty: 10 });
  const quote = await quoteCart(db, [{ variantId: rice, qty: 2 }, { variantId: tur, qty: 1 }], { today: NOW, settings });
  const co = validateCheckoutInput({ contact: { name: 'Asha Rao', email: 'asha@example.com', phone: '9820012345' }, ship: { line1: '12 Lake Road', city: 'Mumbai', stateCode: '27', pincode: '400092' }, paymentMethod: method });
  if (!co.ok) throw new Error('co');
  const r = await createOrder(db, { quote, checkout: co.value, idempotencyKey: `pr-${++n}-xxxxxxxxxxxx`, sellerStateCode: '27', tokenSecret: 's', now: NOW });
  if (!r.ok) throw new Error(r.message);
  if (method === 'razorpay') {
    await db.prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?').bind(`order_r${n}`, r.orderId).run();
    await markPaid(db, { orderId: r.orderId, payment: { id: `pay_r${n}`, amount: 169900, currency: 'INR', status: 'captured', order_id: `order_r${n}` }, source: 'verify', now: NOW });
  }
  await markPacked(db, r.orderId, ctx);
  await markShipped(db, r.orderId, { awb: `A${n}`, courier: 'X', trackingUrl: null }, { ...ctx, actor: 'admin' });
  await markDelivered(db, r.orderId, { ...ctx, actor: 'admin' });
  if (method === 'cod') await db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(r.orderId).run(); // cash collected
  const items = (await db.prepare('SELECT id FROM order_items WHERE order_id = ? ORDER BY id').bind(r.orderId).all<{ id: number }>()).results.map((i) => i.id);
  return { id: r.orderId, items };
}
const status = (id: number) => scalar<string>('SELECT payment_status FROM orders WHERE id = ?', id);
const settleLatest = async (id: number, s: 'processed' | 'failed') => {
  const rid = await scalar<number>("SELECT MAX(id) FROM refunds WHERE order_id = ? AND status = 'pending'", id);
  await applyRefundStatus(db, rid, { id: `rfnd_${rid}`, status: s }, NOW);
};

describe('partial refunds', () => {
  it('refund by line, by amount, then the rest: credit notes cover exactly what was refunded and add up to the invoice', async () => {
    const o = await delivered();
    expect(await refundOrder(db, o.id, { ...ctx, reason: 'One pack damaged', lines: [{ itemId: o.items[0], qty: 1 }] })).toEqual({ ok: true });
    expect(await status(o.id)).toBe('refund_pending');
    await settleLatest(o.id, 'processed');
    expect(await status(o.id)).toBe('partially_refunded');

    expect(await refundOrder(db, o.id, { ...ctx, reason: 'Goodwill', amount: 10000 })).toEqual({ ok: true });
    await settleLatest(o.id, 'failed'); // the bank refused: still partially refunded, and the ₹100 is still owed
    expect(await status(o.id)).toBe('partially_refunded');
    expect(await refundOrder(db, o.id, { ...ctx, reason: 'More than is left', amount: 90001 })).toMatchObject({ ok: false });
    await db.batch(retryRefundStmts(db, o.id, NOW.toISOString())); // same amount, lines and credit note
    expect(await status(o.id)).toBe('refund_pending');
    await settleLatest(o.id, 'processed');

    expect(await refundOrder(db, o.id, { ...ctx, reason: 'Customer returned the rest' })).toEqual({ ok: true });
    await settleLatest(o.id, 'processed');
    expect(await status(o.id)).toBe('refunded');
    expect(await refundOrder(db, o.id, { ...ctx, reason: 'again' })).toMatchObject({ ok: false });

    expect(await scalar("SELECT SUM(amount_paise) FROM refunds WHERE order_id = ? AND status = 'processed'", o.id)).toBe(169900);
    const notes = (await db.prepare("SELECT snapshot FROM invoices WHERE order_id = ? AND series = 'CN' ORDER BY id").bind(o.id).all<{ snapshot: string }>()).results.map((r) => JSON.parse(r.snapshot));
    expect(notes.map((c) => c.totals.total)).toEqual([69900, 10000, 90000]); // the retry reused the failed refund's credit note
    expect(notes[0].lines).toHaveLength(1);
    for (const c of notes) {
      expect(c.lines.reduce((a: number, l: { total: number }) => a + l.total, 0)).toBe(c.totals.total);
      for (const l of c.lines) expect(l.taxable + l.cgst + l.sgst + l.igst).toBe(l.total);
    }
  });

  it('never refunds more than was paid, even when two refunds race', async () => {
    const o = await delivered();
    const results = await Promise.all([refundOrder(db, o.id, { ...ctx, reason: 'A', amount: 100000 }), refundOrder(db, o.id, { ...ctx, reason: 'B', amount: 100000 })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await scalar("SELECT SUM(amount_paise) FROM refunds WHERE order_id = ? AND status <> 'failed'", o.id)).toBe(100000);
    expect(await refundOrder(db, o.id, { ...ctx, reason: 'C', amount: 69901 })).toMatchObject({ ok: false });
    expect(await refundOrder(db, o.id, { ...ctx, reason: 'D', lines: [{ itemId: o.items[1], qty: 2 }] })).toMatchObject({ ok: false });
  });

  it('COD refunds are recorded with the transfer reference and settle at once', async () => {
    const o = await delivered('cod');
    expect(await refundOrder(db, o.id, { ...ctx, reason: 'Turmeric pack torn', lines: [{ itemId: o.items[1], qty: 1 }], manualReference: 'UPI 123456' })).toEqual({ ok: true });
    expect(await status(o.id)).toBe('partially_refunded');
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'email.refunded'", o.id)).toBe(1);
  });
});
