import { beforeAll, describe, expect, it } from 'vitest';
import { availableActions, dashboardMetrics, listOrders, orderDetail, runAdminAction } from '../../src/lib/store/admin-orders';
import { validateCheckoutInput } from '../../src/lib/store/checkout-input';
import { createOrder } from '../../src/lib/store/orders';
import { quoteCart } from '../../src/lib/store/quote';
import { importRemittances } from '../../src/lib/store/remittance';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const NOW = new Date('2026-10-18T06:30:00Z');
const settings = { ...SETTING_DEFAULTS, min_order_paise: '100', legal_name: 'HariLeaf Agritech Pvt Ltd', address: 'Borivali, Mumbai 400092', gstin: '27AAPFU0939F1ZV', state_code: '27' };
beforeAll(async () => putSettings(db, settings));
const ctx = { now: NOW, actorEmail: 'admin@harileaf.org', tokenSecret: 'sek' };

async function codOrder(name = 'Meera Iyer') {
  const v = await insertVariant(await insertProduct(), { stock_qty: 5, price_paise: 69900, mrp_paise: 79900 });
  const quote = await quoteCart(db, [{ variantId: v, qty: 1 }], { today: NOW, settings });
  const co = validateCheckoutInput({ contact: { name, email: 'meera@example.com', phone: '9820099999' }, ship: { line1: '4 Hill Rd', city: 'Pune', stateCode: '27', pincode: '411001' }, paymentMethod: 'cod' });
  if (!co.ok) throw new Error('co');
  const r = await createOrder(db, { quote, checkout: co.value, idempotencyKey: `adm-${crypto.randomUUID()}`, sellerStateCode: '27', tokenSecret: 'sek', now: NOW });
  if (!r.ok) throw new Error(r.message);
  return r;
}

describe('admin order actions', () => {
  it('walks an order through the actions the detail page offers', async () => {
    const o = await codOrder();
    const detail = async () => (await orderDetail(db, o.orderId))!;
    expect(availableActions((await detail()).order)).toEqual(['pack', 'cancel']);
    expect(await runAdminAction(db, o.orderId, { action: 'pack' }, ctx)).toEqual({ ok: true });
    expect(await runAdminAction(db, o.orderId, { action: 'ship', awb: 'A1', trackingUrl: 'javascript:alert(1)' }, ctx)).toMatchObject({ ok: false });
    expect(await runAdminAction(db, o.orderId, { action: 'ship', awb: 'A1', courier: 'Delhivery', trackingUrl: 'https://track.example/A1' }, ctx)).toEqual({ ok: true });
    expect(await runAdminAction(db, o.orderId, { action: 'deliver' }, ctx)).toEqual({ ok: true });
    expect(availableActions((await detail()).order)).toEqual(['update_tracking', 'returned', 'refund', 'replacement']);
    expect(await runAdminAction(db, o.orderId, { action: 'note', note: 'Called customer' }, ctx)).toEqual({ ok: true });
    // Correct a mistyped AWB (markShipped never overwrites with blanks; this action can clear too).
    expect(await runAdminAction(db, o.orderId, { action: 'update_tracking', awb: 'A1-FIXED', courier: '', trackingUrl: '' }, ctx)).toEqual({ ok: true });
    expect(await scalar("SELECT awb || '|' || COALESCE(courier, '-') || '|' || COALESCE(tracking_url, '-') FROM orders WHERE id = ?", o.orderId)).toBe('A1-FIXED|-|-');
    const d = await detail();
    expect(d.docs.map((x) => x.series)).toEqual(['INV']);
    expect(d.events.map((e) => e.type)).toEqual(['placed', 'packed', 'shipped', 'delivered', 'note', 'tracking_updated']);
    expect(d.events[1].actor_email).toBe('admin@harileaf.org');
    expect(await runAdminAction(db, o.orderId, { action: 'cancel', reason: 'x' }, ctx)).toMatchObject({ ok: false });
    expect(await runAdminAction(db, o.orderId, { action: 'nope' }, ctx)).toEqual({ ok: false, error: 'Unknown action' });
  });

  it('requires a reason to cancel and retries dead tasks', async () => {
    const o = await codOrder();
    expect(await runAdminAction(db, o.orderId, { action: 'cancel', reason: ' ' }, ctx)).toMatchObject({ ok: false });
    const task = await scalar<number>("SELECT id FROM outbox WHERE order_id = ? AND kind = 'shiprocket.create'", o.orderId);
    expect((await runAdminAction(db, o.orderId, { action: 'retry_task', taskId: task }, ctx)).ok).toBe(false);
    await db.prepare("UPDATE outbox SET state = 'dead', attempts = 8 WHERE id = ?").bind(task).run();
    expect(await runAdminAction(db, o.orderId, { action: 'retry_task', taskId: task }, ctx)).toEqual({ ok: true });
    expect(await scalar('SELECT state || attempts FROM outbox WHERE id = ?', task)).toBe('pending0');
  });

  it('lists and searches orders', async () => {
    const o = await codOrder('Zubin Mehta');
    expect((await listOrders(db, { q: o.orderNo.toLowerCase() })).map((r) => r.id)).toEqual([o.orderId]);
    expect((await listOrders(db, { q: 'zubin' })).map((r) => r.id)).toContain(o.orderId);
    expect((await listOrders(db, { status: 'placed' })).every((r) => r.status === 'placed')).toBe(true);
  });

  it('computes dashboard to-dos', async () => {
    const m = await dashboardMetrics(db, NOW);
    expect(m.to_pack).toBeGreaterThan(0);
    expect(typeof m.revenue_7d).toBe('number');
  });
});

describe('COD remittance import', () => {
  it('matches by AWB, flags amount mismatches and unknown AWBs, and ignores re-imports', async () => {
    const a = await codOrder();
    const b = await codOrder();
    await db.prepare('UPDATE orders SET awb = ? WHERE id = ?').bind(`RA${a.orderId}`, a.orderId).run();
    await db.prepare('UPDATE orders SET awb = ? WHERE id = ?').bind(`RB${b.orderId}`, b.orderId).run();
    const csv = `AWB,COD Amount,UTR,Remittance Date\nRA${a.orderId},699,U1,2026-10-25\nRB${b.orderId},650,U1,2026-10-25\nNOPE1,100,U1,2026-10-25\n`;
    const r = await importRemittances(db, csv, NOW);
    expect(r).toMatchObject({ imported: 3, duplicates: 0, unmatched: ['NOPE1'], mismatched: [{ expected: 69900, got: 65000 }] });
    expect(await importRemittances(db, csv, NOW)).toMatchObject({ imported: 0, duplicates: 3 });
    expect((await orderDetail(db, a.orderId))!.remittances).toHaveLength(1);
  });
});
