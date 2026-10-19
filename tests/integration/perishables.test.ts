import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { POST as checkout } from '../../src/pages/api/store/checkout/index';
import { GET as pincode } from '../../src/pages/api/store/pincode';
import { listProducts } from '../../src/lib/store/catalog';
import { quoteCart } from '../../src/lib/store/quote';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const NOW = new Date('2026-11-18T06:30:00Z');
const zones = (enabled: boolean) => JSON.stringify([{ id: 'mmr', name: 'Mumbai MMR', pincodes: ['400', '401'], expressOnly: true, maxTransitDays: 2, enabled }]);
const settings = { ...SETTING_DEFAULTS, min_order_paise: '10000', pickup_pincode: '401404', delivery_zones: zones(true) };
beforeAll(() => putSettings(db, settings));
afterEach(() => vi.unstubAllGlobals());

const mango = async (stock = 10) =>
  insertVariant(await insertProduct({ perishable: 1, cod_allowed: 0, category_id: 3, gst_rate_bp: 0, hsn_code: '0804', delivery_zone: '{"zone":"mmr"}' }), { stock_qty: stock, price_paise: 120000, mrp_paise: 120000 });

/** Shiprocket answers serviceability with these couriers (or a 500); Razorpay creates orders. */
function stubCouriers(couriers: unknown[] | 'down') {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ token: 't' }), { status: 200 });
    if (url.includes('/courier/serviceability/')) {
      if (couriers === 'down') return new Response('{}', { status: 500 });
      return new Response(JSON.stringify({ status: 200, data: { available_courier_companies: couriers } }), { status: 200 });
    }
    if (url === 'https://api.razorpay.com/v1/orders' && init.method === 'POST') {
      const b = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ id: `order_${crypto.randomUUID().slice(0, 8)}`, amount: b.amount, currency: 'INR', status: 'created', receipt: b.receipt }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
}
const air = { courier_name: 'Air Express', estimated_delivery_days: '1', is_surface: false, city: 'Mumbai', state: 'Maharashtra', cod: 0 };
const surface = { ...air, courier_name: 'Surface', is_surface: true };

let n = 0;
const submit = (lines: unknown, pincode: string, paymentMethod: 'razorpay' | 'cod' = 'razorpay') =>
  Promise.resolve(checkout({
    request: new Request('https://harileaf.org/api/store/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        lines, paymentMethod, billSameAsShip: true,
        contact: { name: 'Asha Rao', email: `mango${++n}@example.com`, phone: `98${String(30000000 + n).slice(-8)}` },
        ship: { line1: '12 Lake Road', city: 'Mumbai', stateCode: '27', pincode },
      }),
    }),
    locals: {}, params: {}, cookies: {}, url: new URL('https://harileaf.org/api/store/checkout'),
  } as never)).then(async (r: Response) => ({ status: r.status, body: (await r.json()) as any }));

describe('perishables', () => {
  it('sell only while their zone is enabled, and never in the same cart as other goods', async () => {
    const m = await mango();
    const rice = await insertVariant(await insertProduct(), { price_paise: 69900, mrp_paise: 79900 });
    const closed = await quoteCart(db, [{ variantId: m, qty: 1 }], { today: NOW, settings: { ...settings, delivery_zones: zones(false) } });
    expect(closed.lines[0].problem).toBe('unavailable');
    // In season but the zone isn't selling: the card says so rather than "out of season".
    await putSettings(db, { ...settings, delivery_zones: zones(false) });
    const pid = await scalar('SELECT product_id FROM variants WHERE id = ?', m);
    expect((await listProducts(db, { categorySlug: 'produce', today: NOW })).find((c) => c.id === pid)).toMatchObject({ availability: 'notify', zoneClosed: true });
    await putSettings(db, settings);
    const open = await quoteCart(db, [{ variantId: m, qty: 1 }], { today: NOW, settings });
    expect(open).toMatchObject({ ok: true, mixed: false, groups: ['perishable'], cod: { eligible: false } });
    const both = await quoteCart(db, [{ variantId: m, qty: 1 }, { variantId: rice, qty: 1 }], { today: NOW, settings });
    expect(both).toMatchObject({ ok: false, mixed: true, groups: ['perishable', 'regular'] });
    expect((await submit([{ variantId: m, qty: 1 }, { variantId: rice, qty: 1 }], '400092')).status).toBe(409);
    // Fresh produce for two zones: no pincode is in both, so the cart splits by zone.
    const twoZones = JSON.stringify([...JSON.parse(zones(true)), { id: 'pune', name: 'Pune', pincodes: ['411'], expressOnly: true, maxTransitDays: 2, enabled: true }]);
    const fig = await insertVariant(await insertProduct({ perishable: 1, cod_allowed: 0, category_id: 3, gst_rate_bp: 0, hsn_code: '0804', delivery_zone: '{"zone":"pune"}' }), { stock_qty: 5, price_paise: 50000, mrp_paise: 50000 });
    const split = await quoteCart(db, [{ variantId: m, qty: 1 }, { variantId: fig, qty: 1 }], { today: NOW, settings: { ...settings, delivery_zones: twoZones } });
    expect(split).toMatchObject({ ok: false, mixed: true, groups: ['perishable'] });
    expect(split.lines.map((l) => l.zone?.id)).toEqual(['mmr', 'pune']);
  });

  it('checkout needs a pincode in the zone, an express courier within the limit, prepaid only, and fails closed', async () => {
    const m = await mango();
    const lines = [{ variantId: m, qty: 1 }];
    stubCouriers([air]);
    expect(await submit(lines, '411001')).toMatchObject({ status: 422, body: { errors: { 'ship.pincode': expect.stringMatching(/Mumbai MMR/) } } });
    expect((await submit(lines, '400092', 'cod')).status).toBe(422);
    stubCouriers([surface]);
    expect(await submit(lines, '400092')).toMatchObject({ status: 422, body: { errors: { 'ship.pincode': expect.stringMatching(/within 2 days/) } } });
    stubCouriers('down');
    expect((await submit(lines, '400092')).status).toBe(503);
    stubCouriers([surface, air]);
    const ok = await submit(lines, '400092');
    expect(ok.status).toBe(201);
    expect(ok.body.payment).toMatchObject({ amount: 120000 });
  });

  it('the zone pincode check asks Shiprocket once per pincode and parcel size, not on every check', async () => {
    let asked = 0;
    stubCouriers([air]);
    const stubbed = globalThis.fetch;
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => (url.includes('/courier/serviceability/') && ++asked, stubbed(url, init)));
    const check = async (pin: string) => {
      const u = new URL(`https://harileaf.org/api/store/pincode?pin=${pin}&zone=mmr&grams=1200&value=120000`);
      const r = (await pincode({ url: u, request: new Request(u) } as never)) as Response;
      return ((await r.json()) as any).zone;
    };
    expect(await check('400093')).toMatchObject({ inZone: true, courier: true, etaDays: 1, city: 'Mumbai', stateCode: '27' });
    expect(await check('400093')).toMatchObject({ courier: true, etaDays: 1 });
    expect(asked).toBe(1);
    await check('400094');
    expect(asked).toBe(2);
  });
});
