import { describe, expect, it } from 'vitest';
import { AT, db, insertOrder, scalar } from '../helpers/fixtures';

let n = 0;
async function insertCoupon(over: Partial<Record<string, unknown>> = {}): Promise<string> {
  const row = { code: `TEST${++n}X`, kind: 'percent', value: 10, created_at: AT, updated_at: AT, ...over };
  const cols = Object.keys(row);
  await db.prepare(`INSERT INTO coupons (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...Object.values(row)).run();
  return row.code as string;
}
const redeem = (code: string, orderId: number, phone: string | null = null, at = AT) =>
  db.prepare('INSERT INTO coupon_redemptions (coupon_code, order_id, phone, created_at) VALUES (?, ?, ?, ?)').bind(code, orderId, phone, at).run();

describe('coupon schema', () => {
  it('counts uses in the database: limit, one per phone, paused/out-of-date codes, release, frozen terms', async () => {
    const code = await insertCoupon({ usage_limit: 1 });
    await redeem(code, await insertOrder());
    await expect(redeem(code, await insertOrder())).rejects.toThrow(/coupon_usage_limit/);
    expect(await scalar('SELECT used_count FROM coupons WHERE code = ?', code)).toBe(1);

    const perPhone = await insertCoupon({ one_per_phone: 1 });
    await redeem(perPhone, await insertOrder(), '9820000000');
    await expect(redeem(perPhone, await insertOrder(), '9820000000')).rejects.toThrow(/UNIQUE/);
    await expect(redeem(perPhone, await insertOrder(), null)).rejects.toThrow(/not redeemable/);

    const later = await insertCoupon({ starts_at: '2026-11-01T00:00:00.000Z' });
    await expect(redeem(later, await insertOrder())).rejects.toThrow(/not redeemable/);
    const paused = await insertCoupon({ active: 0 });
    await expect(redeem(paused, await insertOrder())).rejects.toThrow(/not redeemable/);

    // Releasing a use (payment failed) gives it back; the terms stay frozen.
    await db.prepare('DELETE FROM coupon_redemptions WHERE coupon_code = ?').bind(code).run();
    expect(await scalar('SELECT used_count FROM coupons WHERE code = ?', code)).toBe(0);
    await expect(db.prepare('UPDATE coupons SET value = 20 WHERE code = ?').bind(code).run()).rejects.toThrow(/frozen/);
    await db.prepare('UPDATE coupons SET active = 0 WHERE code = ?').bind(code).run();

    // Flat codes can't cover a whole order; a discount needs a coupon.
    await expect(insertCoupon({ kind: 'flat', value: 10000, min_order_paise: 10000 })).rejects.toThrow(/CHECK/);
    await expect(insertOrder({ discount_paise: 100, total_paise: 69800 })).rejects.toThrow(/discount without a coupon/);
  });
});
