import { describe, expect, it } from 'vitest';
import { deliveryWindow, nextDispatch, parseCalendar, parseZones, pickCourier, pincodeInZone, sellableZone, validateZones, type Zone } from '../../src/lib/store/zones';

const mmr: Zone = { id: 'mmr', name: 'Mumbai MMR', pincodes: ['400', '401', '4102'], expressOnly: true, maxTransitDays: 2, enabled: true };

describe('delivery zones', () => {
  it('validates zone settings and matches pincodes by prefix', () => {
    const ok = validateZones(JSON.stringify([{ id: 'MMR', name: ' Mumbai MMR ', pincodes: '400, 401\n4102', expressOnly: true, maxTransitDays: 2, enabled: true }]));
    expect(ok).toEqual({ ok: true, value: [mmr] });
    expect(validateZones('[{"id":"x","name":"X","pincodes":["40a"],"maxTransitDays":0}]')).toMatchObject({ ok: false });
    // Each entry becomes a Merchant Center shipping entry, and an item takes at most 100.
    const many = Array.from({ length: 101 }, (_, i) => String(400001 + i));
    expect(validateZones(JSON.stringify([{ id: 'big', name: 'Big', pincodes: many, maxTransitDays: 2 }]))).toMatchObject({ ok: false, error: expect.stringContaining('at most 100') });
    expect(validateZones(JSON.stringify([{ id: 'big', name: 'Big', pincodes: many.slice(0, 100), maxTransitDays: 2 }]))).toMatchObject({ ok: true });
    expect(validateZones('not json')).toMatchObject({ ok: false });
    expect(parseZones('garbage')).toEqual([]);
    expect(pincodeInZone('400092', mmr)).toBe(true);
    expect(pincodeInZone('410206', mmr)).toBe(true);
    expect(pincodeInZone('411001', mmr)).toBe(false);
  });

  it('sells a perishable only through an enabled zone; non-perishables ship everywhere', () => {
    expect(sellableZone({ perishable: true, deliveryZoneId: 'mmr' }, [mmr])).toEqual({ sellable: true, zone: mmr });
    expect(sellableZone({ perishable: true, deliveryZoneId: 'mmr' }, [{ ...mmr, enabled: false }])).toEqual({ sellable: false, zone: null });
    expect(sellableZone({ perishable: true, deliveryZoneId: null }, [mmr])).toEqual({ sellable: false, zone: null });
    expect(sellableZone({ perishable: false, deliveryZoneId: null }, [])).toEqual({ sellable: true, zone: null });
  });

  it('picks the fastest courier that meets the zone (air when express-only, within the transit limit)', () => {
    const list = [
      { courier_name: 'Surface Co', estimated_delivery_days: '1', is_surface: true },
      { courier_name: 'Air Slow', estimated_delivery_days: '3', is_surface: false },
      { courier_name: 'Air Fast', estimated_delivery_days: '2', is_surface: false },
    ];
    expect(pickCourier(list, mmr)).toEqual({ name: 'Air Fast', etaDays: 2 });
    expect(pickCourier(list, { ...mmr, expressOnly: false })).toEqual({ name: 'Surface Co', etaDays: 1 });
    expect(pickCourier([{ courier_name: 'Air Slow', estimated_delivery_days: '3', is_surface: false }], mmr)).toBeNull();
  });
});

describe('dispatch calendar', () => {
  // Mon–Thu, before 11:00 IST, no 14 Apr.
  const cal = parseCalendar({ dispatch_days: '1,2,3,4', dispatch_blackouts: '2027-04-14', dispatch_cutoff_hour: '11' });
  it('dispatches on the next working dispatch day before the cutoff, skipping blackouts', () => {
    expect(nextDispatch(new Date('2027-04-12T04:00:00Z'), cal)).toBe('2027-04-12'); // Mon 09:30 IST
    expect(nextDispatch(new Date('2027-04-12T06:00:00Z'), cal)).toBe('2027-04-13'); // Mon 11:30 IST → Tue
    expect(nextDispatch(new Date('2027-04-13T06:00:00Z'), cal)).toBe('2027-04-15'); // Tue late → Wed is a blackout → Thu
    expect(nextDispatch(new Date('2027-04-15T08:00:00Z'), cal)).toBe('2027-04-19'); // Thu late → Mon
    expect(deliveryWindow('2027-04-15', 2)).toEqual({ from: '2027-04-16', to: '2027-04-17' });
    expect(nextDispatch(new Date('2027-04-12T04:00:00Z'), parseCalendar({ dispatch_days: '', dispatch_blackouts: '', dispatch_cutoff_hour: '11' }))).toBeNull();
  });
});
