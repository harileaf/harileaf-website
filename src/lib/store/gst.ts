/**
 * GST maths for GST-inclusive prices. Rates are basis points (500 = 5%).
 *
 * Order of operations for a line: allocate any order discount first (a discount
 * known at the time of supply reduces the value, CGST s.15(3)(a)), then back
 * the tax out of the discounted, GST-inclusive line total, then split it.
 */
import { assertPaise, type Paise } from './money';

export interface TaxLineInput {
  /** GST-inclusive line amount after discount. */
  lineTotal: Paise;
  rateBp: number;
}

export interface TaxLine extends TaxLineInput {
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
}

export type DocumentType = 'tax_invoice' | 'bill_of_supply' | 'invoice_cum_bill_of_supply';

function assertRate(rateBp: number): void {
  if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > 4000) throw new RangeError(`bad GST rate: ${rateBp}`);
}

/** taxable = round(line × 10000 / (10000 + rate)); tax = line − taxable. */
export function backOut(lineTotal: Paise, rateBp: number): { taxable: Paise; tax: Paise } {
  assertPaise(lineTotal);
  assertRate(rateBp);
  const taxable = Math.round((lineTotal * 10000) / (10000 + rateBp));
  return { taxable, tax: lineTotal - taxable };
}

/** Intra-state → CGST + SGST halves (odd paisa to SGST); inter-state → IGST. */
export function splitTax(lines: TaxLineInput[], intraState: boolean): TaxLine[] {
  return lines.map((line) => {
    const { taxable, tax } = backOut(line.lineTotal, line.rateBp);
    if (!intraState) return { ...line, taxable, cgst: 0, sgst: 0, igst: tax };
    const cgst = Math.floor(tax / 2);
    return { ...line, taxable, cgst, sgst: tax - cgst, igst: 0 };
  });
}

/** CGST Rule 46A: taxable + exempt lines on one document → invoice-cum-bill of supply. */
export function documentType(lines: { rateBp: number }[]): DocumentType {
  if (lines.length === 0) throw new RangeError('document has no lines');
  const taxable = lines.some((l) => l.rateBp > 0);
  const exempt = lines.some((l) => l.rateBp === 0);
  if (taxable && exempt) return 'invoice_cum_bill_of_supply';
  return taxable ? 'tax_invoice' : 'bill_of_supply';
}

/**
 * Split an order-level discount across lines in proportion to their value,
 * using largest-remainder rounding so the parts add up exactly. Ties go to the
 * larger line, then the earlier one.
 */
export function allocateDiscount(lineTotals: Paise[], discount: Paise): Paise[] {
  lineTotals.forEach(assertPaise);
  assertPaise(discount);
  const sum = lineTotals.reduce((a, b) => a + b, 0);
  if (discount > sum) throw new RangeError(`discount ${discount} exceeds lines ${sum}`);
  if (discount === 0 || sum === 0) return lineTotals.map(() => 0);

  const shares = lineTotals.map((line, i) => {
    const exact = (discount * line) / sum;
    return { i, line, base: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let remainder = discount - shares.reduce((a, s) => a + s.base, 0);
  const order = [...shares].sort((a, b) => b.frac - a.frac || b.line - a.line || a.i - b.i);
  const out = shares.map((s) => s.base);
  for (const s of order) {
    if (remainder === 0) break;
    if (out[s.i] < s.line) {
      out[s.i] += 1;
      remainder -= 1;
    }
  }
  return out;
}
