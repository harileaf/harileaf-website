import { expect, it } from 'vitest';
import { availability, inSeason, type AvailabilityInput } from '../../src/lib/store/availability';

// Noon IST on the given calendar day.
const ist = (ymd: string) => new Date(`${ymd}T06:30:00.000Z`);

const base: AvailabilityInput = {
  status: 'active', seasonStartMd: null, seasonEndMd: null, offSeasonMode: null, preorderDispatchDate: null, variantActive: true, stockQty: 5,
};
const mango: AvailabilityInput = { ...base, seasonStartMd: '04-01', seasonEndMd: '06-30' };

it('season windows include both ends, wrap the year end and use the IST date', () => {
  expect([inSeason('04-01', '06-30', ist('2026-04-01')), inSeason('04-01', '06-30', ist('2026-06-30')), inSeason('04-01', '06-30', ist('2026-07-01'))]).toEqual([true, true, false]);
  expect([inSeason('11-15', '02-15', ist('2027-01-10')), inSeason('11-15', '02-15', ist('2027-02-16'))]).toEqual([true, false]);
  expect(inSeason('04-01', '06-30', new Date('2026-03-31T19:00:00Z'))).toBe(true); // already 1 Apr in India
});

it('sells only active, in-season stock', () => {
  expect(availability(base, ist('2026-10-18'))).toBe('buy');
  expect(availability({ ...base, stockQty: 0 }, ist('2026-10-18'))).toBe('sold_out');
  for (const hidden of [{ status: 'draft' as const }, { status: 'discontinued' as const }, { variantActive: false }]) expect(availability({ ...base, ...hidden }, ist('2026-10-18'))).toBeNull();
  expect(availability(mango, ist('2026-10-18'))).toBe('notify');
});

it('offers pre-order out of season only with a dispatch date and stock', () => {
  const pre = { ...mango, offSeasonMode: 'preorder' as const, preorderDispatchDate: '2027-04-05' };
  expect(availability(pre, ist('2027-02-01'))).toBe('preorder');
  expect(availability({ ...pre, preorderDispatchDate: null }, ist('2027-02-01'))).toBe('notify');
  expect(availability({ ...pre, stockQty: 0 }, ist('2027-02-01'))).toBe('notify');
});
