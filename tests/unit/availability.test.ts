import { describe, expect, it } from 'vitest';
import { availability, inSeason, type AvailabilityInput } from '../../src/lib/store/availability';

// Noon IST on the given calendar day.
const ist = (ymd: string) => new Date(`${ymd}T06:30:00.000Z`);

const base: AvailabilityInput = {
  status: 'active',
  seasonStartMd: null,
  seasonEndMd: null,
  offSeasonMode: null,
  preorderDispatchDate: null,
  variantActive: true,
  stockQty: 5,
};

describe('inSeason', () => {
  it('is always in season without a window', () => {
    expect(inSeason(null, null, ist('2026-01-01'))).toBe(true);
  });
  it('includes both boundary days', () => {
    expect(inSeason('04-01', '06-30', ist('2026-04-01'))).toBe(true);
    expect(inSeason('04-01', '06-30', ist('2026-06-30'))).toBe(true);
    expect(inSeason('04-01', '06-30', ist('2026-03-31'))).toBe(false);
    expect(inSeason('04-01', '06-30', ist('2026-07-01'))).toBe(false);
  });
  it('wraps the year end', () => {
    expect(inSeason('11-15', '02-15', ist('2026-12-31'))).toBe(true);
    expect(inSeason('11-15', '02-15', ist('2027-01-10'))).toBe(true);
    expect(inSeason('11-15', '02-15', ist('2027-02-16'))).toBe(false);
    expect(inSeason('11-15', '02-15', ist('2026-11-14'))).toBe(false);
  });
  it('uses the IST date, not the UTC date', () => {
    // 31 Mar 19:00 UTC is already 1 Apr in India.
    expect(inSeason('04-01', '06-30', new Date('2026-03-31T19:00:00Z'))).toBe(true);
  });
});

describe('availability', () => {
  it('is buyable with stock and sold out without', () => {
    expect(availability(base, ist('2026-10-18'))).toBe('buy');
    expect(availability({ ...base, stockQty: 0 }, ist('2026-10-18'))).toBe('sold_out');
  });

  it('is not listed for draft or discontinued products or inactive variants', () => {
    expect(availability({ ...base, status: 'draft' }, ist('2026-10-18'))).toBeNull();
    expect(availability({ ...base, status: 'discontinued' }, ist('2026-10-18'))).toBeNull();
    expect(availability({ ...base, variantActive: false }, ist('2026-10-18'))).toBeNull();
  });

  const mango: AvailabilityInput = { ...base, seasonStartMd: '04-01', seasonEndMd: '06-30' };

  it('respects the season window', () => {
    expect(availability(mango, ist('2026-05-10'))).toBe('buy');
    expect(availability({ ...mango, stockQty: 0 }, ist('2026-05-10'))).toBe('sold_out');
    expect(availability(mango, ist('2026-10-18'))).toBe('notify');
  });

  it('offers pre-order out of season only with a dispatch date and stock', () => {
    const pre = { ...mango, offSeasonMode: 'preorder' as const, preorderDispatchDate: '2027-04-05' };
    expect(availability(pre, ist('2027-02-01'))).toBe('preorder');
    expect(availability({ ...pre, preorderDispatchDate: null }, ist('2027-02-01'))).toBe('notify');
    expect(availability({ ...pre, stockQty: 0 }, ist('2027-02-01'))).toBe('notify');
    expect(availability({ ...mango, offSeasonMode: 'notify' }, ist('2027-02-01'))).toBe('notify');
  });
});
