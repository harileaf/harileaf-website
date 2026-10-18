import { describe, expect, it } from 'vitest';
import { docNo, docPrefix, fyOf, istParts, orderNo } from '../../src/lib/store/fy';

describe('fyOf (IST)', () => {
  it('rolls over at 1 April 00:00 IST, i.e. 31 March 18:30 UTC', () => {
    expect(fyOf(new Date('2027-03-31T18:29:59.999Z'))).toBe('2627');
    expect(fyOf(new Date('2027-03-31T18:30:00.000Z'))).toBe('2728');
    expect(fyOf(new Date('2026-04-01T00:00:00.000Z'))).toBe('2627');
    expect(fyOf(new Date('2026-03-31T18:29:59.000Z'))).toBe('2526');
    expect(fyOf(new Date('2099-12-31T00:00:00.000Z'))).toBe('9900');
  });
});

describe('istParts', () => {
  it('shifts UTC to IST (+05:30)', () => {
    expect(istParts(new Date('2026-10-31T18:30:00.000Z'))).toEqual({ year: 2026, month: 11, day: 1 });
    expect(istParts(new Date('2026-10-31T18:29:59.000Z'))).toEqual({ year: 2026, month: 10, day: 31 });
  });
});

describe('docNo', () => {
  it('formats invoices and credit notes', () => {
    expect(docNo('INV', '2627', 42)).toBe('HL/2627/000042');
    expect(docNo('CN', '2627', 3)).toBe('HLCN/2627/00003');
    expect(docPrefix('INV', '2627')).toBe('HL/2627/');
  });
  it('never exceeds 16 characters (CGST Rule 46)', () => {
    expect(docNo('INV', '2627', 999999)).toHaveLength(14);
    expect(docNo('CN', '2627', 99999)).toHaveLength(15);
    expect(docNo('INV', '2627', 9999999)).toHaveLength(15);
    expect(() => docNo('CN', '2627', 9999999999)).toThrow(/16/);
  });
  it('rejects bad inputs', () => {
    expect(() => docNo('INV', '26-27', 1)).toThrow();
    expect(() => docNo('INV', '2627', 0)).toThrow();
    expect(() => docNo('INV', '2627', 1.5)).toThrow();
  });
});

describe('orderNo', () => {
  it('uses the IST year-month and a zero-padded sequence', () => {
    expect(orderNo(new Date('2026-10-18T06:00:00Z'), 42)).toBe('HL-2610-0042');
    expect(orderNo(new Date('2026-10-31T18:30:00Z'), 7)).toBe('HL-2611-0007');
    expect(orderNo(new Date('2026-10-18T06:00:00Z'), 123456)).toBe('HL-2610-123456');
  });
});
