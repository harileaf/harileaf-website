/**
 * Seeded concurrency stress: many shoppers, payments, expiries, cancels and
 * packs interleaved against real D1. Checks the global invariants rather than
 * individual outcomes: stock is conserved exactly, never negative, nothing is
 * sold twice, and GST document numbers stay gapless and unique.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { validateCheckoutInput } from '../../src/lib/store/checkout-input';
import { cancelOrder, markPacked } from '../../src/lib/store/fulfilment';
import { createOrder } from '../../src/lib/store/orders';
import { expireReservations, markPaid } from '../../src/lib/store/payments';
import { quoteCart } from '../../src/lib/store/quote';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';
import { prng } from '../helpers/prng';

const T0 = new Date('2026-10-18T06:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const settings = { ...SETTING_DEFAULTS, min_order_paise: '100', legal_name: 'HariLeaf Agritech Pvt Ltd', address: 'Mumbai', gstin: '27AAPFU0939F1ZV', state_code: '27' };
beforeAll(async () => putSettings(db, settings));

const co = (method: 'cod' | 'razorpay') => {
  const r = validateCheckoutInput({ contact: { name: 'Load Test', email: 'load@example.com', phone: '9820000000' }, ship: { line1: '1 Test Rd', city: 'Mumbai', stateCode: '27', pincode: '400001' }, paymentMethod: method });
  if (!r.ok) throw new Error('checkout input');
  return r.value;
};

describe.each([1, 2, 3])('stress (seed %i)', (seed) => {
  it('conserves stock and keeps document numbers gapless under interleaved operations', async () => {
    const { next: rand, pick } = prng(seed);
    const INITIAL = [7, 4];
    const variants = await Promise.all(INITIAL.map(async (q) => insertVariant(await insertProduct(), { stock_qty: q, price_paise: 50000, mrp_paise: 60000 })));

    // 30 concurrent checkouts, 1–3 units of a random variant, mixed payment methods.
    const attempts = await Promise.all(
      Array.from({ length: 30 }, async (_, i) => {
        const v = pick(variants);
        const qty = 1 + Math.floor(rand() * 3);
        const method = rand() < 0.5 ? 'cod' : 'razorpay';
        const quote = await quoteCart(db, [{ variantId: v, qty }], { today: T0, settings });
        if (!quote.ok) return null;
        const r = await createOrder(db, { quote, checkout: co(method), idempotencyKey: `stress-${seed}-${i}-${crypto.randomUUID()}`, sellerStateCode: '27', tokenSecret: 's', now: T0 });
        return r.ok ? { id: r.orderId, method, total: r.total } : null;
      }),
    );
    const orders = attempts.filter((x): x is NonNullable<typeof x> => x !== null);
    expect(orders.length).toBeGreaterThan(0);

    // Interleave: some prepaid orders pay (some late, after expiry), expiry runs
    // twice concurrently, customers cancel, and the admin packs.
    await Promise.all(
      orders.flatMap((o) => {
        const ops: Array<Promise<unknown>> = [];
        if (o.method === 'razorpay') {
          const rzp = `order_s${o.id}`;
          ops.push(
            db.prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?').bind(rzp, o.id).run().then(() => {
              if (rand() < 0.7) {
                const late = rand() < 0.3;
                return markPaid(db, { orderId: o.id, payment: { id: `pay_s${o.id}`, amount: o.total, currency: 'INR', status: 'authorized', order_id: rzp }, source: 'webhook', now: at(late ? 40 : 5) });
              }
            }),
          );
        }
        if (rand() < 0.3) ops.push(cancelOrder(db, o.id, { now: at(10), actor: 'customer', reason: 'stress' }));
        if (rand() < 0.5) ops.push(markPacked(db, o.id, { now: at(12) }));
        return ops;
      }).concat([expireReservations(db, at(35)), expireReservations(db, at(35))]),
    );
    await expireReservations(db, at(60));

    for (const [i, v] of variants.entries()) {
      const stock = await scalar<number>('SELECT stock_qty FROM variants WHERE id = ?', v);
      // Units out of stock = units in live orders (placed or later, not cancelled) + units still held.
      const committed = await scalar<number>(
        `SELECT COALESCE(SUM(i.qty), 0) FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE i.variant_id = ? AND o.status NOT IN ('cancelled', 'payment_failed', 'pending_payment')`,
        v,
      );
      const held = await scalar<number>("SELECT COALESCE(SUM(qty), 0) FROM stock_reservations WHERE variant_id = ? AND state = 'held'", v);
      expect(stock).toBeGreaterThanOrEqual(0);
      expect(held).toBe(0); // everything settled after the last expiry run
      expect(stock + committed).toBe(INITIAL[i]);
    }

    // Every order that is placed or beyond has exactly one consumed reservation per line.
    expect(
      await scalar(
        `SELECT count(*) FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.status IN ('placed', 'packed') AND o.id IN (${orders.map((o) => o.id).join(',')})
           AND (SELECT count(*) FROM stock_reservations r WHERE r.order_id = o.id AND r.variant_id = i.variant_id AND r.state = 'consumed') != 1`,
      ),
    ).toBe(0);

    // GST numbering: per series and FY, sequence numbers are 1..n with no gaps or repeats.
    const { results } = await db.prepare('SELECT series, fy, count(*) AS n, MAX(seq) AS mx, count(DISTINCT seq) AS d FROM invoices GROUP BY series, fy').all<{ series: string; n: number; mx: number; d: number }>();
    for (const r of results) expect([r.n, r.d]).toEqual([r.mx, r.mx]);
  });
});
