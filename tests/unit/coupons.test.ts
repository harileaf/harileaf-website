import { describe, expect, it } from 'vitest';
import { evaluateCoupon, validateCouponInput, type CouponRow } from '../../src/lib/store/coupons';

const NOW = new Date('2026-11-10T06:00:00Z');
const base: CouponRow = {
  code: 'MANGO10', kind: 'percent', value: 10, max_discount_paise: null, min_order_paise: 0, starts_at: null, ends_at: null,
  usage_limit: null, used_count: 0, one_per_phone: 0, category_ids: null, active: 1, note: null, first_used_at: null, created_at: '', updated_at: '',
};
const rice = { lineTotal: 69900, categoryId: 1 };
const spice = { lineTotal: 30100, categoryId: 2 };

describe('evaluateCoupon', () => {
  it('gives one clear reason per failure', () => {
    const reason = (c: Partial<CouponRow> | null, lines = [rice], phoneUsed = false) => {
      const r = evaluateCoupon(c && { ...base, ...c }, 'MANGO10', lines, NOW, { phoneUsed });
      return r.ok ? 'ok' : r.reason;
    };
    expect(reason(null)).toBe('not_found');
    expect(reason({ active: 0 })).toBe('paused');
    expect(reason({ starts_at: '2026-11-11T18:30:00.000Z' })).toBe('not_started');
    expect(reason({ ends_at: '2026-11-09T18:30:00.000Z' })).toBe('expired');
    expect(reason({ usage_limit: 5, used_count: 5 })).toBe('limit_reached');
    expect(reason({ one_per_phone: 1 }, [rice], true)).toBe('phone_used');
    expect(reason({ category_ids: '[3]' })).toBe('no_eligible_items');
    expect(reason({ min_order_paise: 100000 })).toBe('below_minimum');
    const r = evaluateCoupon({ ...base, min_order_paise: 100000 }, 'MANGO10', [rice], NOW, {});
    expect(!r.ok && r.message).toBe('Add ₹301 more to use this code (minimum order ₹1,000).');
    // A category code's minimum counts only its own items: ₹301 of spice + ₹699 of rice doesn't unlock a ₹1,000 spice code.
    const spiceOnly = evaluateCoupon({ ...base, category_ids: '[2]', min_order_paise: 100000 }, 'X', [rice, spice], NOW, {});
    expect(!spiceOnly.ok && spiceOnly.message).toBe('Add ₹699 more of the items this code covers to use it (minimum ₹1,000 on those items).');
    expect(evaluateCoupon({ ...base, category_ids: '[1]', min_order_paise: 69900 }, 'X', [rice, spice], NOW, {}).ok).toBe(true);
  });

  it('caps percent and flat discounts and splits them over eligible lines only', () => {
    expect(evaluateCoupon({ ...base, category_ids: '[2]' }, 'X', [rice, spice], NOW, {})).toMatchObject({ ok: true, discount: 3010, shares: [0, 3010] });
    expect(evaluateCoupon({ ...base, value: 50, max_discount_paise: 20000 }, 'X', [rice, spice], NOW, {})).toMatchObject({ ok: true, discount: 20000, label: '50% off (up to ₹200)' });
    const flat = evaluateCoupon({ ...base, kind: 'flat', value: 10000, min_order_paise: 50000 }, 'X', [rice, spice], NOW, {});
    expect(flat).toMatchObject({ ok: true, discount: 10000, shares: [6990, 3010], label: '₹100 off' });
  });
});

describe('validateCouponInput', () => {
  it('normalises the form and converts IST dates and rupees', () => {
    const ok = validateCouponInput({ code: ' mango 10 ', kind: 'flat', value: '100', minOrder: '499', startsOn: '2026-11-01', endsOn: '2026-11-30', usageLimit: '50', onePerPhone: true, categoryIds: [3] }, [1, 2, 3]);
    expect(ok).toEqual({
      ok: true,
      value: { code: 'MANGO10', kind: 'flat', value: 10000, max_discount_paise: null, min_order_paise: 49900, starts_at: '2026-10-31T18:30:00.000Z', ends_at: '2026-11-30T18:30:00.000Z', usage_limit: 50, one_per_phone: 1, category_ids: '[3]', note: null },
    });
    const bad = validateCouponInput({ code: 'AB', kind: 'percent', value: '95', endsOn: '2026-10-01', startsOn: '2026-11-01', categoryIds: [9] }, [1, 2, 3]);
    expect(bad.ok ? [] : Object.keys(bad.errors).sort()).toEqual(['categoryIds', 'code', 'endsOn', 'value']);
    expect(validateCouponInput({ code: 'FLAT100', kind: 'flat', value: '100', minOrder: '100' }, [])).toMatchObject({ ok: false, errors: { minOrder: expect.any(String) } });
  });
});
