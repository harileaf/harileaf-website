/** Order edge cases: cancel/capture races, Shiprocket cancel, refund retry, B2B place of supply, courier oddities. */
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as courier } from '../../src/pages/api/webhooks/courier';
import { POST as rzpWebhook } from '../../src/pages/api/webhooks/razorpay';
import { dashboardMetrics, runAdminAction } from '../../src/lib/store/admin-orders';
import { validateCheckoutInput } from '../../src/lib/store/checkout-input';
import { cancelOrder, markPacked, markShipped } from '../../src/lib/store/fulfilment';
import { invoiceSnapshot } from '../../src/lib/store/invoices';
import { createOrder, getOrderByNo } from '../../src/lib/store/orders';
import { markPaid } from '../../src/lib/store/payments';
import { quoteCart } from '../../src/lib/store/quote';
import { makeRefundHandler } from '../../src/lib/store/refunds';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { makeShiprocketHandlers } from '../../src/lib/store/shiprocket-orders';
import { hmacHex } from '../../src/lib/store/tokens';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const NOW = new Date('2026-10-18T06:30:00Z');
const settings = { ...SETTING_DEFAULTS, cod_confirmation: 'off', min_order_paise: '100', legal_name: 'HariLeaf Agritech Pvt Ltd', address: 'Borivali, Mumbai 400092', gstin: '27AAPFU0939F1ZV', state_code: '27', shiprocket_pickup_location: 'Borivali' };
beforeAll(async () => {
  await putSettings(db, settings);
  await env.HARILEAF_CMS.put('shiprocket:token', 'tok');
});
const ctx = { now: NOW, actorEmail: 'admin@harileaf.org', tokenSecret: 'sek' };

async function order(method: 'cod' | 'razorpay', extra: Record<string, unknown> = {}, opts: { paid?: 'authorized' | 'captured' } = {}) {
  const v = await insertVariant(await insertProduct({ gst_rate_bp: 500 }), { stock_qty: 5, price_paise: 69900, mrp_paise: 79900 });
  const co = validateCheckoutInput({ contact: { name: 'Asha Rao', email: 'asha@example.com', phone: '9820012345' }, ship: { line1: '12 Lake Road', city: 'Pune', stateCode: '27', pincode: '411001' }, paymentMethod: method, ...extra });
  if (!co.ok) throw new Error(JSON.stringify(co.errors));
  const quote = await quoteCart(db, [{ variantId: v, qty: 1 }], { today: NOW, settings });
  const r = await createOrder(db, { quote, checkout: co.value, idempotencyKey: `rv-${crypto.randomUUID()}`, sellerStateCode: '27', tokenSecret: 'sek', now: NOW });
  if (!r.ok) throw new Error(r.message);
  const payment = { id: `pay_rv${r.orderId}`, amount: r.total, currency: 'INR', status: opts.paid ?? 'authorized', order_id: `order_rv${r.orderId}` };
  if (method === 'razorpay') {
    await db.prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?').bind(payment.order_id, r.orderId).run();
    await markPaid(db, { orderId: r.orderId, payment, source: 'verify', now: NOW });
  }
  return { id: r.orderId, orderNo: r.orderNo, variantId: v, payment };
}
const status = (id: number) => scalar<string>('SELECT status || \'/\' || payment_status FROM orders WHERE id = ?', id);

/** A D1 wrapper that runs `hook` right after the first read of the order row — i.e. between cancel's read and its write. */
function interleaved(hook: () => Promise<unknown>): D1Database {
  let fired = false;
  const wrap = <T extends object>(target: T, onFirst?: (k: PropertyKey) => unknown): T =>
    new Proxy(target, {
      get(t, k) {
        const extra = onFirst?.(k);
        if (extra) return extra;
        const v = (t as Record<PropertyKey, unknown>)[k];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
    });
  return wrap(db, (k) =>
    k === 'prepare'
      ? (sql: string) => {
          const st = db.prepare(sql);
          if (fired || !sql.startsWith('SELECT * FROM orders WHERE id')) return st;
          return wrap(st, (k2) =>
            k2 === 'bind'
              ? (...args: unknown[]) =>
                  wrap(st.bind(...args), (k3) =>
                    k3 === 'first'
                      ? async () => {
                          const row = await st.bind(...args).first();
                          if (!fired) {
                            fired = true;
                            await hook();
                          }
                          return row;
                        }
                      : undefined,
                  )
              : undefined,
          );
        }
      : undefined,
  );
}

describe('cancel vs capture race (C1)', () => {
  it('a capture committing between cancel’s read and write still ends in a refund', async () => {
    const o = await order('razorpay');
    const capture = () =>
      db.batch([
        db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ? AND payment_status = 'authorized'").bind(o.id),
        db.prepare("INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at) VALUES (?, 'shiprocket.create', '{}', 'pending', 0, ?, ?, ?)").bind(o.id, NOW.toISOString(), NOW.toISOString(), NOW.toISOString()),
      ]);
    expect(await cancelOrder(interleaved(capture), o.id, { now: NOW, actor: 'customer', reason: 'Changed my mind' })).toEqual({ ok: true });
    expect(await status(o.id)).toBe('cancelled/refund_pending');
    expect(await scalar("SELECT count(*) FROM refunds WHERE order_id = ? AND status = 'pending'", o.id)).toBe(1);
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'razorpay.refund'", o.id)).toBe(1);
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'shiprocket.cancel'", o.id)).toBe(1);
  });

  it('packing and shipping need a captured payment', async () => {
    const o = await order('razorpay');
    expect(await markPacked(db, o.id, { now: NOW })).toMatchObject({ ok: false, error: /captured/ });
    await db.prepare("UPDATE orders SET status = 'packed' WHERE id = ?").bind(o.id).run();
    expect((await markShipped(db, o.id, { awb: 'X', courier: null, trackingUrl: null }, { now: NOW, actor: 'admin' })).ok).toBe(false);
  });
});

describe('Shiprocket cancel (I1)', () => {
  it('finds a Shiprocket order created after the cancel was queued', async () => {
    const o = await order('cod');
    await cancelOrder(db, o.id, { now: NOW, actor: 'customer', reason: '' });
    const calls: Array<{ url: string; body?: unknown }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body ? JSON.parse(init.body as string) : undefined });
      if (url.includes('filter_by=channel_order_id')) return new Response(JSON.stringify({ data: [{ id: 4242, channel_order_id: o.orderNo }] }), { status: 200 });
      if (url.endsWith('/orders/cancel')) return new Response('{}', { status: 200 });
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    await makeShiprocketHandlers(fake)['shiprocket.cancel']({}, { env, row: { id: 1, order_id: o.id, kind: 'shiprocket.cancel', payload: {}, attempts: 1 } });
    expect(calls.find((c) => c.url.endsWith('/orders/cancel'))?.body).toEqual({ ids: [4242] });
  });
});

describe('refund retry (I2)', () => {
  it('a failed refund returns the order to paid; retry makes a new refund with a new receipt', async () => {
    const o = await order('razorpay', {}, { paid: 'captured' });
    await markPacked(db, o.id, ctx);
    await cancelOrder(db, o.id, { now: NOW, actor: 'admin', reason: 'Damaged in packing' });
    const first = await scalar<number>('SELECT id FROM refunds WHERE order_id = ?', o.id);
    const created: string[] = [];
    let listed: unknown[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      if (init.method === 'GET') return new Response(JSON.stringify({ items: listed }), { status: 200 });
      const b = JSON.parse(init.body as string);
      created.push(b.receipt);
      return new Response(JSON.stringify({ id: `rfnd_${b.receipt}`, status: 'pending', amount: b.amount, payment_id: o.payment.id, receipt: b.receipt }), { status: 200 });
    }) as unknown as typeof fetch;
    const handler = makeRefundHandler(fake);
    const run = () => handler({}, { env: { ...env, RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's' } as Env, row: { id: 1, order_id: o.id, kind: 'razorpay.refund', payload: {}, attempts: 1 } });
    await run();
    expect(created).toEqual([`rf-${first}`]);

    const hook = async (refund: Record<string, unknown>, ev: string, id: string) => {
      const body = JSON.stringify({ event: ev, payload: { refund: { entity: refund } } });
      return rzpWebhook({ request: new Request('https://harileaf.org/api/webhooks/razorpay', { method: 'POST', headers: { 'X-Razorpay-Signature': await hmacHex('rzp_test_webhook_secret', body), 'x-razorpay-event-id': id }, body }), locals: {} } as any);
    };
    await hook({ id: `rfnd_rf-${first}`, status: 'failed', receipt: `rf-${first}` }, 'refund.failed', `evt_f_${o.id}`);
    expect(await status(o.id)).toBe('cancelled/paid');
    expect((await dashboardMetrics(db, NOW)).refunds_failed).toBeGreaterThan(0);

    expect(await runAdminAction(db, o.id, { action: 'retry_refund' }, ctx)).toEqual({ ok: true });
    expect(await runAdminAction(db, o.id, { action: 'retry_refund' }, ctx)).toMatchObject({ ok: false }); // nothing failed now
    expect(await status(o.id)).toBe('cancelled/refund_pending');
    const second = await scalar<number>("SELECT id FROM refunds WHERE order_id = ? AND status = 'pending'", o.id);
    listed = [{ id: `rfnd_rf-${first}`, status: 'failed', receipt: `rf-${first}` }];
    await run();
    expect(created).toEqual([`rf-${first}`, `rf-${second}`]);

    // Two concurrent "processed" deliveries settle once.
    const done = { id: `rfnd_rf-${second}`, status: 'processed', receipt: `rf-${second}` };
    await Promise.all([hook(done, 'refund.processed', `evt_p1_${o.id}`), hook(done, 'refund.processed', `evt_p2_${o.id}`)]);
    expect(await status(o.id)).toBe('cancelled/refunded');
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'email.refunded'", o.id)).toBe(1);
  });
});

describe('B2B place of supply (I5)', () => {
  it('bills a Karnataka GSTIN shipped to Pune with IGST, and the invoice says so', async () => {
    const o = await order('cod', { buyerGstin: '29AAACR5055K1Z3', buyerLegalName: 'Rao Foods Pvt Ltd', billSameAsShip: false, bill: { name: 'Rao Foods', line1: '7 MG Road', city: 'Bengaluru', stateCode: '29', pincode: '560001' } });
    const view = (await getOrderByNo(db, o.orderNo))!;
    expect(view.items[0].igst_paise).toBeGreaterThan(0);
    const snap = invoiceSnapshot(view.order, view.items, settings);
    expect(snap.placeOfSupply.stateCode).toBe('29');
    expect(snap.intraState).toBe(false);
    expect(snap.totals.igst).toBe(view.items[0].igst_paise);
  });
});

describe('courier edge cases (I3/I4)', () => {
  const hook = (body: unknown) =>
    courier({ request: new Request('https://harileaf.org/api/webhooks/courier', { method: 'POST', headers: { 'x-api-key': 'test-courier-token' }, body: JSON.stringify(body) }), locals: {} } as any);

  it('logs a pickup of a cancelled order as needing attention', async () => {
    const o = await order('cod');
    await db.prepare('UPDATE orders SET awb = ? WHERE id = ?').bind(`CX${o.id}`, o.id).run();
    await cancelOrder(db, o.id, { now: NOW, actor: 'customer', reason: '' });
    expect((await hook({ awb: `CX${o.id}`, shipment_status_id: 42, shipment_status: 'PICKED UP', current_timestamp: 't1' })).status).toBe(200);
    expect(await scalar("SELECT count(*) FROM order_events WHERE order_id = ? AND type = 'courier_unapplied'", o.id)).toBe(1);
    expect((await dashboardMetrics(db, NOW)).courier_problems).toBeGreaterThan(0);
  });

  it('finds the order by our order number when neither the Shiprocket id nor the AWB is stored yet', async () => {
    const o = await order('cod');
    await markPacked(db, o.id, ctx);
    const orderNo = await scalar('SELECT order_no FROM orders WHERE id = ?', o.id);
    await hook({ order_id: orderNo, awb: `ON${o.id}`, shipment_status_id: 9, shipment_status: 'RTO INITIATED', current_timestamp: 't1' });
    expect(await status(o.id)).toBe('rto/unpaid');
  });

  it('applies an RTO whose pickup scans were missed, and records lost parcels', async () => {
    const o = await order('cod');
    await db.prepare('UPDATE orders SET awb = ? WHERE id = ?').bind(`RT${o.id}`, o.id).run();
    await markPacked(db, o.id, ctx);
    await hook({ awb: `RT${o.id}`, shipment_status_id: 9, shipment_status: 'RTO INITIATED', current_timestamp: 't1' });
    expect(await status(o.id)).toBe('rto/unpaid');
    await hook({ awb: `RT${o.id}`, shipment_status_id: 12, shipment_status: 'LOST', current_timestamp: 't2' });
    expect(await scalar("SELECT count(*) FROM order_events WHERE order_id = ? AND type = 'courier_lost'", o.id)).toBe(1);
  });
});
