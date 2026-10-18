import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as confirmRoute } from '../../src/pages/api/store/order/confirm-cod';
import { availableActions, dashboardMetrics, runAdminAction } from '../../src/lib/store/admin-orders';
import { validateCheckoutInput } from '../../src/lib/store/checkout-input';
import { remindUnconfirmedCod } from '../../src/lib/store/cod';
import { makeFulfilmentEmailHandlers } from '../../src/lib/store/email-fulfilment';
import { cancelOrder, markPacked } from '../../src/lib/store/fulfilment';
import { createOrder } from '../../src/lib/store/orders';
import { quoteCart } from '../../src/lib/store/quote';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { makeShiprocketHandlers } from '../../src/lib/store/shiprocket-orders';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const T0 = new Date('2026-10-18T06:30:00Z');
const hours = (h: number) => new Date(T0.getTime() + h * 3600_000);
const settings = { ...SETTING_DEFAULTS, min_order_paise: '100', legal_name: 'HariLeaf Agritech Pvt Ltd', address: 'Mumbai', gstin: '27AAPFU0939F1ZV', state_code: '27', shiprocket_pickup_location: 'Borivali' };
const SECRET = 'test-order-token-secret'; // tests/wrangler.test.toml
beforeAll(async () => {
  await putSettings(db, settings); // cod_confirmation defaults to 'on'
  await env.HARILEAF_CMS.put('shiprocket:token', 'tok');
});

async function codOrder(required = true) {
  const v = await insertVariant(await insertProduct(), { stock_qty: 5, price_paise: 69900, mrp_paise: 79900 });
  const co = validateCheckoutInput({ contact: { name: 'Asha Rao', email: 'asha@example.com', phone: '9820012345' }, ship: { line1: '12 Lake Road', city: 'Mumbai', stateCode: '27', pincode: '400092' }, paymentMethod: 'cod' });
  if (!co.ok) throw new Error('co');
  const quote = await quoteCart(db, [{ variantId: v, qty: 1 }], { today: T0, settings });
  const r = await createOrder(db, { quote, checkout: co.value, idempotencyKey: `cod-${crypto.randomUUID()}`, sellerStateCode: '27', tokenSecret: SECRET, now: T0, codConfirmationRequired: required });
  if (!r.ok) throw new Error(r.message);
  return r;
}
const confirm = (orderNo: string, token: string) =>
  confirmRoute({ request: new Request('https://harileaf.org/api/store/order/confirm-cod', { method: 'POST', body: JSON.stringify({ orderNo, token }) }), locals: {} } as any);
const row = (orderId: number, kind: string) => ({ env, row: { id: 1, order_id: orderId, kind, payload: {}, attempts: 1 } });

describe('COD confirmation', () => {
  it('is decided per order at placement, so toggling the setting never strands or re-blocks orders', async () => {
    const off = await codOrder(false); // placed while the setting was off
    expect(await scalar('SELECT cod_confirmed_at IS NOT NULL FROM orders WHERE id = ?', off.orderId)).toBe(1);
    expect(await markPacked(db, off.orderId, { now: T0 })).toEqual({ ok: true });
    const on = await codOrder(true);
    await db.prepare('UPDATE orders SET shiprocket_order_id = ? WHERE id = ?').bind('SR1', on.orderId).run(); // already with the courier
    expect(await markPacked(db, on.orderId, { now: T0 })).toEqual({ ok: true }); // courier scans are never blocked
  });

  it('holds an unconfirmed COD order back from Shiprocket and packing', async () => {
    const o = await codOrder();
    let calls = 0;
    const fake = (async () => {
      calls += 1;
      return new Response('{}', { status: 500 });
    }) as unknown as typeof fetch;
    await makeShiprocketHandlers(fake)['shiprocket.create']({}, row(o.orderId, 'shiprocket.create'));
    expect(calls).toBe(0);
    expect(await markPacked(db, o.orderId, { now: T0 })).toMatchObject({ ok: false, error: /Confirm/ });
    expect(availableActions({ status: 'placed', payment_method: 'cod', payment_status: 'unpaid', total_paise: 69900 }, { awaitingCodConfirmation: true })).toEqual(['confirm_cod', 'cancel']);
  });

  it('the customer confirms with their order token (once), which queues the shipment', async () => {
    const o = await codOrder();
    expect((await confirm(o.orderNo, 'wrong')).status).toBe(404);
    expect((await confirm(o.orderNo, o.viewToken)).status).toBe(200);
    expect((await confirm(o.orderNo, o.viewToken)).status).toBe(200); // double click
    expect(await scalar('SELECT cod_confirmed_at IS NOT NULL FROM orders WHERE id = ?', o.orderId)).toBe(1);
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'shiprocket.create'", o.orderId)).toBe(2); // placement (skipped) + after confirm
    expect(await scalar("SELECT count(*) FROM order_events WHERE order_id = ? AND type = 'cod_confirmed'", o.orderId)).toBe(1);
    expect(await markPacked(db, o.orderId, { now: T0 })).toEqual({ ok: true });
  });

  it('an admin can confirm after a call; a cancelled order cannot be confirmed', async () => {
    const a = await codOrder();
    expect(await runAdminAction(db, a.orderId, { action: 'confirm_cod' }, { now: T0, actorEmail: 'admin@harileaf.org', tokenSecret: SECRET })).toEqual({ ok: true });
    const b = await codOrder();
    await cancelOrder(db, b.orderId, { now: T0, actor: 'customer', reason: '' });
    expect((await confirm(b.orderNo, b.viewToken)).status).toBe(409);
  });

  it('sends one reminder after 24 hours, only while still unconfirmed', async () => {
    const o = await codOrder();
    const done = await codOrder();
    await confirm(done.orderNo, done.viewToken);
    expect(await remindUnconfirmedCod(db, hours(23))).toBe(0);
    expect(await remindUnconfirmedCod(db, hours(39))).toBe(0); // 03:00 IST: wait for daytime
    await remindUnconfirmedCod(db, hours(25)); // 13:00 IST
    await remindUnconfirmedCod(db, hours(30));
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'email.cod_reminder'", o.orderId)).toBe(1);
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'email.cod_reminder'", done.orderId)).toBe(0);

    const sent: string[] = [];
    const fake = (async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string).subject);
      return new Response('{"id":"e"}', { status: 200 });
    }) as unknown as typeof fetch;
    const testEnv = { ...env, RESEND_API_KEY: 're_test' } as Env;
    await makeFulfilmentEmailHandlers(fake)['email.cod_reminder']({}, { env: testEnv, row: { id: 1, order_id: o.orderId, kind: 'email.cod_reminder', payload: {}, attempts: 1 } });
    await makeFulfilmentEmailHandlers(fake)['email.cod_reminder']({}, { env: testEnv, row: { id: 2, order_id: done.orderId, kind: 'email.cod_reminder', payload: {}, attempts: 1 } });
    expect(sent).toEqual([`Reminder: confirm your order ${o.orderNo} — HariLeaf`]);
    expect((await dashboardMetrics(db, hours(50))).cod_unconfirmed_old).toBeGreaterThan(0);
  });
});
