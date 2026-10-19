import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OutboxRow } from '../../src/lib/store/outbox';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { bookCourier, courierOptions } from '../../src/lib/store/shiprocket-booking';
import { makeShiprocketHandlers } from '../../src/lib/store/shiprocket-orders';
import { db, insertOrder, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const settings = {
  ...SETTING_DEFAULTS, pickup_pincode: '401404', shiprocket_pickup_location: 'Farm',
  delivery_zones: JSON.stringify([{ id: 'mmr', name: 'Mumbai MMR', pincodes: ['400'], expressOnly: true, maxTransitDays: 2, enabled: true }]),
};
beforeAll(async () => {
  await putSettings(db, settings);
  await env.HARILEAF_CMS.put('shiprocket:token', 'tok'); // skip login
});
afterEach(() => vi.unstubAllGlobals());
const ctx = { now: new Date('2026-12-05T06:00:00Z'), actorEmail: 'owner@harileaf.org' };

const COURIERS = [
  { courier_company_id: 10, courier_name: 'Surface Saver', rate: 60, estimated_delivery_days: '1', is_surface: true },
  { courier_company_id: 20, courier_name: 'Air Express', rate: 140, estimated_delivery_days: '1', is_surface: false },
  { courier_company_id: 30, courier_name: 'Air Slow', rate: 90, estimated_delivery_days: '4', is_surface: false },
];
function stubShiprocket(calls: string[]) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push(`${init.method ?? 'GET'} ${url.replace(/^.*\/v1\/external/, '').split('?')[0]}`);
    if (url.includes('/courier/serviceability/')) return Response.json({ status: 200, data: { available_courier_companies: COURIERS } });
    if (url.includes('/orders?filter_by=channel_order_id')) return Response.json({ data: url.includes('HL-LATE') ? [{ id: 5002, channel_order_id: 'HL-LATE', shipments: [{ id: 6002 }] }] : [] });
    if (url.endsWith('/orders/create/adhoc')) return Response.json({ order_id: 5001, shipment_id: 6001 });
    if (url.endsWith('/courier/assign/awb')) return Response.json({ awb_assign_status: 1, response: { data: { awb_code: 'AWB777', courier_name: 'Air Express' } } });
    if (url.endsWith('/courier/generate/pickup')) return Response.json({ pickup_status: 1, response: { pickup_scheduled_date: '2026-12-06 10:00:00' } });
    return new Response('{}', { status: 404 });
  });
}

async function packedOrder(perishable: boolean) {
  const p = await insertProduct(perishable ? { perishable: 1, cod_allowed: 0, category_id: 3, gst_rate_bp: 0, delivery_zone: '{"zone":"mmr"}' } : {});
  const v = await insertVariant(p, { price_paise: 69900, mrp_paise: 69900 });
  const id = await insertOrder({ status: 'packed', payment_status: 'paid', total_paise: 69900, subtotal_paise: 69900, gst_paise: 0 });
  await db
    .prepare(`INSERT INTO order_items (order_id, variant_id, product_name, variant_label, sku, hsn_code, gst_rate_bp, unit_price_paise, mrp_paise, qty, taxable_paise, line_total_paise, perishable)
              VALUES (?, ?, 'P', '1 kg', 'S', '0804', 0, 69900, 69900, 1, 69900, 69900, ?)`)
    .bind(id, v, perishable ? 1 : 0)
    .run();
  return id;
}

describe('courier booking', () => {
  it('lists couriers cheapest first; fresh produce only gets express couriers within its zone limit', async () => {
    stubShiprocket([]);
    const rice = await courierOptions(env, await packedOrder(false));
    expect(rice.ok && rice.value.options.map((o) => o.name)).toEqual(['Surface Saver', 'Air Slow', 'Air Express']);
    const mango = await courierOptions(env, await packedOrder(true));
    expect(mango.ok && mango.value.options.map((o) => o.name)).toEqual(['Air Express']);
    const lost = await packedOrder(true);
    await db.prepare(`UPDATE products SET delivery_zone = '{"zone":"gone"}' WHERE id = (SELECT v.product_id FROM order_items i JOIN variants v ON v.id = i.variant_id WHERE i.order_id = ?)`).bind(lost).run();
    const none = await courierOptions(env, lost); // its zone was removed: no courier qualifies, rather than every courier
    expect(none.ok && none.value.options).toEqual([]);
  });

  it('books once: creates the Shiprocket order, assigns the AWB and requests the pickup', async () => {
    const calls: string[] = [];
    stubShiprocket(calls);
    const id = await packedOrder(true);
    expect(await bookCourier(env, id, 10, ctx)).toMatchObject({ ok: false }); // surface: not allowed for fresh produce
    expect(await bookCourier(env, id, 20, ctx)).toEqual({ ok: true, value: { awb: 'AWB777', courier: 'Air Express', pickup: '2026-12-06 10:00:00' } });
    expect(await db.prepare('SELECT awb, courier, shiprocket_shipment_id FROM orders WHERE id = ?').bind(id).first()).toEqual({ awb: 'AWB777', courier: 'Air Express', shiprocket_shipment_id: '6001' });
    expect(calls.filter((c) => c.startsWith('POST'))).toEqual(['POST /orders/create/adhoc', 'POST /courier/assign/awb', 'POST /courier/generate/pickup']);
    expect(await bookCourier(env, id, 20, ctx)).toMatchObject({ ok: false, error: expect.stringMatching(/Already booked/) });
  });

  it('finds the shipment of an order Shiprocket created without one, then books it', async () => {
    const calls: string[] = [];
    stubShiprocket(calls);
    const id = await packedOrder(false);
    await db.prepare("UPDATE orders SET order_no = 'HL-LATE', shiprocket_order_id = '5002' WHERE id = ?").bind(id).run();
    expect(await bookCourier(env, id, 10, ctx)).toMatchObject({ ok: true, value: { awb: 'AWB777' } });
    expect(await scalar('SELECT shiprocket_shipment_id FROM orders WHERE id = ?', id)).toBe('6002');
    expect(calls).not.toContain('POST /orders/create/adhoc');
  });

  it('with auto-push off, the outbox never creates Shiprocket orders (the admin books instead)', async () => {
    await putSettings(db, { ...settings, shiprocket_auto_push: 'off' });
    const calls: string[] = [];
    stubShiprocket(calls);
    const id = await packedOrder(false);
    const row = { id: 1, order_id: id, kind: 'shiprocket.create', payload: '{}', state: 'running', attempts: 1 } as unknown as OutboxRow;
    await makeShiprocketHandlers()['shiprocket.create']({}, { env, row });
    expect(calls).toEqual([]);
    expect(await scalar('SELECT shiprocket_order_id IS NULL FROM orders WHERE id = ?', id)).toBe(1);
    await putSettings(db, settings);
  });
});
