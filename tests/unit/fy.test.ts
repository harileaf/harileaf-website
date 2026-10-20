import { expect, it } from 'vitest';
import { docNo, fyOf, orderNo } from '../../src/lib/store/fy';

it('rolls the financial year over at 1 April 00:00 IST', () => {
  expect(fyOf(new Date('2027-03-31T18:29:59.999Z'))).toBe('2627');
  expect(fyOf(new Date('2027-03-31T18:30:00.000Z'))).toBe('2728');
});

it('formats document numbers within 16 characters (CGST Rule 46)', () => {
  expect(docNo('INV', '2627', 42)).toBe('HL/2627/000042');
  expect(docNo('CN', '2627', 3)).toBe('HLCN/2627/00003');
  expect(docNo('INV', '2627', 9999999)).toHaveLength(15);
  expect(() => docNo('CN', '2627', 9999999999)).toThrow(/16/);
  for (const [fy, seq] of [['26-27', 1], ['2627', 0], ['2627', 1.5]] as const) expect(() => docNo('INV', fy, seq)).toThrow();
});

it('numbers orders by IST year-month', () => {
  expect(orderNo(new Date('2026-10-31T18:30:00Z'), 7)).toBe('HL-2611-0007');
  expect(orderNo(new Date('2026-10-18T06:00:00Z'), 123456)).toBe('HL-2610-123456');
});
