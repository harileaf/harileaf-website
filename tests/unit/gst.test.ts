import { describe, expect, it } from 'vitest';
import { backOut, documentType, splitTax } from '../../src/lib/store/gst';
import { prng } from '../helpers/prng';

describe('gst', () => {
  it('backs GST out of an inclusive price and splits it CGST+SGST (odd paisa on SGST) or IGST', () => {
    expect(backOut(118000, 1800)).toEqual({ taxable: 100000, tax: 18000 });
    expect(splitTax([{ lineTotal: 69900, rateBp: 500 }], true)).toEqual([{ lineTotal: 69900, rateBp: 500, taxable: 66571, cgst: 1664, sgst: 1665, igst: 0 }]);
    expect(splitTax([{ lineTotal: 69900, rateBp: 500 }], false)[0]).toMatchObject({ cgst: 0, sgst: 0, igst: 3329 });
  });

  it('chooses the document by line rates (CGST Rule 46A for mixed carts)', () => {
    expect(documentType([{ rateBp: 500 }, { rateBp: 1800 }])).toBe('tax_invoice');
    expect(documentType([{ rateBp: 0 }])).toBe('bill_of_supply');
    expect(documentType([{ rateBp: 0 }, { rateBp: 500 }])).toBe('invoice_cum_bill_of_supply');
  });

  it('property: taxable + tax always reconciles to the line totals', () => {
    const r = prng(20261018);
    for (let run = 0; run < 2000; run++) {
      const lines = Array.from({ length: r.int(1, 8) }, () => ({ lineTotal: r.int(1, 500000) * r.int(1, 20), rateBp: r.pick([0, 500, 1800, 4000] as const) }));
      const intra = r.next() < 0.5;
      const taxed = splitTax(lines, intra);
      expect(taxed.reduce((a, t) => a + t.taxable + t.cgst + t.sgst + t.igst, 0)).toBe(lines.reduce((a, l) => a + l.lineTotal, 0));
      for (const t of taxed) {
        expect(Number.isInteger(t.taxable) && t.taxable >= 0).toBe(true);
        expect(intra ? t.igst : t.cgst + t.sgst).toBe(0);
        expect([0, 1]).toContain(t.sgst - t.cgst);
      }
    }
  });
});
