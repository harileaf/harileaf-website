import { describe, expect, it } from 'vitest';
import { quoteCart, taxForQuote } from '../../src/lib/store/quote';
import { SETTING_DEFAULTS } from '../../src/lib/store/settings';
import { db, insertProduct, insertVariant } from '../helpers/fixtures';

const TODAY = new Date('2026-10-18T06:30:00Z');
const settings = { ...SETTING_DEFAULTS, min_order_paise: '49900', cod_max_order_paise: '300000' };

describe('quoteCart', () => {
  it('prices from the database and ignores anything else the client sends', async () => {
    const p = await insertProduct({ name: 'Karjat 3' });
    const v = await insertVariant(p, { price_paise: 69900, mrp_paise: 79900, stock_qty: 10, label: '5 kg' });
    const q = await quoteCart(db, [{ variantId: v, qty: 2, price: 1 }], { today: TODAY, settings });
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]).toMatchObject({ variantId: v, qty: 2, unitPrice: 69900, mrp: 79900, lineTotal: 139800, problem: null, label: '5 kg', name: 'Karjat 3' });
    expect(q).toMatchObject({ subtotal: 139800, total: 139800, itemCount: 2, meetsMinimum: true, ok: true, cod: { eligible: true, reason: null } });
  });

  it('limits quantities to stock and flags sold-out or unavailable lines', async () => {
    const p = await insertProduct();
    const few = await insertVariant(p, { stock_qty: 1, price_paise: 50000, mrp_paise: 50000 });
    const none = await insertVariant(p, { stock_qty: 0 });
    const hidden = await insertVariant(p, { active: 0 });
    const draft = await insertVariant(await insertProduct({ status: 'draft' }));
    const q = await quoteCart(db, [{ variantId: few, qty: 3 }, { variantId: none, qty: 1 }, { variantId: hidden, qty: 1 }, { variantId: draft, qty: 1 }, { variantId: 999999, qty: 1 }], { today: TODAY, settings });
    expect(q.lines.map((l) => [l.qty, l.problem])).toEqual([[1, 'limited'], [0, 'out_of_stock'], [0, 'unavailable'], [0, 'unavailable']]);
    expect(q.ok).toBe(false);
    expect(q.total).toBe(50000);
  });

  it('enforces the minimum order', async () => {
    const v = await insertVariant(await insertProduct(), { price_paise: 14900, mrp_paise: 16900 });
    const q = await quoteCart(db, [{ variantId: v, qty: 1 }], { today: TODAY, settings });
    expect(q).toMatchObject({ meetsMinimum: false, ok: false, minOrder: 49900 });
  });

  it('explains when COD is not available', async () => {
    const big = await insertVariant(await insertProduct(), { price_paise: 200000, mrp_paise: 200000 });
    const noCod = await insertVariant(await insertProduct({ cod_allowed: 0 }), { price_paise: 60000, mrp_paise: 60000 });
    expect((await quoteCart(db, [{ variantId: big, qty: 2 }], { today: TODAY, settings })).cod).toEqual({ eligible: false, reason: 'Cash on delivery is available on orders up to ₹3000', max: 300000 });
    expect((await quoteCart(db, [{ variantId: noCod, qty: 1 }], { today: TODAY, settings })).cod.reason).toMatch(/isn’t available/);
    expect((await quoteCart(db, [], { today: TODAY, settings })).cod.reason).toBe('Your cart is empty');
  });

  it('splits tax by place of supply', async () => {
    const v = await insertVariant(await insertProduct({ gst_rate_bp: 500 }), { price_paise: 69900, mrp_paise: 79900 });
    const q = await quoteCart(db, [{ variantId: v, qty: 1 }], { today: TODAY, settings });
    expect(taxForQuote(q, true)[0]).toMatchObject({ taxable: 66571, cgst: 1664, sgst: 1665, igst: 0 });
    expect(taxForQuote(q, false)[0]).toMatchObject({ igst: 3329 });
  });
});
