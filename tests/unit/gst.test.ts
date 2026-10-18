import { describe, expect, it } from 'vitest';
import { allocateDiscount, backOut, documentType, splitTax } from '../../src/lib/store/gst';
import { prng } from '../helpers/prng';

describe('backOut', () => {
  it('backs GST out of a GST-inclusive amount', () => {
    expect(backOut(69900, 500)).toEqual({ taxable: 66571, tax: 3329 });
    expect(backOut(14900, 500)).toEqual({ taxable: 14190, tax: 710 });
    expect(backOut(118000, 1800)).toEqual({ taxable: 100000, tax: 18000 });
  });
  it('treats 0% as fully taxable value', () => {
    expect(backOut(129900, 0)).toEqual({ taxable: 129900, tax: 0 });
  });
  it('rejects negative amounts and invalid rates', () => {
    expect(() => backOut(-1, 500)).toThrow();
    expect(() => backOut(100, -5)).toThrow();
    expect(() => backOut(100, 4001)).toThrow();
  });
});

describe('splitTax', () => {
  it('splits intra-state tax into CGST + SGST with the odd paisa on SGST', () => {
    expect(splitTax([{ lineTotal: 69900, rateBp: 500 }], true)).toEqual([
      { lineTotal: 69900, rateBp: 500, taxable: 66571, cgst: 1664, sgst: 1665, igst: 0 },
    ]);
  });
  it('puts inter-state tax entirely on IGST', () => {
    expect(splitTax([{ lineTotal: 69900, rateBp: 500 }], false)).toEqual([
      { lineTotal: 69900, rateBp: 500, taxable: 66571, cgst: 0, sgst: 0, igst: 3329 },
    ]);
  });
  it('handles exempt lines', () => {
    expect(splitTax([{ lineTotal: 50000, rateBp: 0 }], true)[0]).toMatchObject({ taxable: 50000, cgst: 0, sgst: 0, igst: 0 });
  });
});

describe('documentType', () => {
  it('chooses the GST document by line rates (CGST Rule 46A for mixed carts)', () => {
    expect(documentType([{ rateBp: 500 }, { rateBp: 1800 }])).toBe('tax_invoice');
    expect(documentType([{ rateBp: 0 }])).toBe('bill_of_supply');
    expect(documentType([{ rateBp: 0 }, { rateBp: 500 }])).toBe('invoice_cum_bill_of_supply');
  });
  it('rejects an empty document', () => {
    expect(() => documentType([])).toThrow();
  });
});

describe('allocateDiscount', () => {
  it('splits proportionally with largest-remainder rounding', () => {
    expect(allocateDiscount([10000, 10000, 10000], 100)).toEqual([34, 33, 33]);
    expect(allocateDiscount([69900, 14900], 5000)).toEqual([4121, 879]);
    expect(allocateDiscount([5000], 5000)).toEqual([5000]);
    expect(allocateDiscount([5000, 7000], 0)).toEqual([0, 0]);
  });
  it('rejects a discount larger than the lines', () => {
    expect(() => allocateDiscount([100, 200], 301)).toThrow();
  });
});

describe('property: totals always reconcile', () => {
  it('Σ(taxable + tax) = Σ lines and Σ allocated = discount for random carts', () => {
    const r = prng(20261018);
    const rates = [0, 500, 1800, 4000] as const;
    for (let run = 0; run < 2000; run++) {
      const n = r.int(1, 8);
      const gross = Array.from({ length: n }, () => r.int(1, 500000) * r.int(1, 20));
      const sum = gross.reduce((a, b) => a + b, 0);
      const discount = r.int(0, sum);
      const alloc = allocateDiscount(gross, discount);
      expect(alloc.reduce((a, b) => a + b, 0)).toBe(discount);
      alloc.forEach((d, i) => {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(gross[i]);
      });
      const lines = gross.map((g, i) => ({ lineTotal: g - alloc[i], rateBp: r.pick(rates) }));
      const intra = r.next() < 0.5;
      const taxed = splitTax(lines, intra);
      const total = lines.reduce((a, l) => a + l.lineTotal, 0);
      expect(taxed.reduce((a, t) => a + t.taxable + t.cgst + t.sgst + t.igst, 0)).toBe(total);
      for (const t of taxed) {
        expect(Number.isInteger(t.taxable) && t.taxable >= 0).toBe(true);
        if (intra) expect(t.igst).toBe(0);
        else expect(t.cgst + t.sgst).toBe(0);
        expect(t.sgst - t.cgst === 0 || t.sgst - t.cgst === 1).toBe(true);
      }
    }
  });
});
