/**
 * Indian financial year (1 April – 31 March, IST) and GST document numbers.
 *
 * Document numbers must be unique per FY and at most 16 characters
 * (CGST Rule 46(b)). Invoices: HL/2627/000042 (14). Credit notes:
 * HLCN/2627/00003 (15). The sequence itself is assigned by the database
 * (doc_counters) inside the issuing batch, never by application code.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export type DocSeries = 'INV' | 'CN';

export function istParts(at: Date): { year: number; month: number; day: number; hour: number } {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1, day: ist.getUTCDate(), hour: ist.getUTCHours() };
}

/** Today's date in India as YYYY-MM-DD. */
export function istYmd(at: Date): string {
  const { year, month, day } = istParts(at);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "2627" for FY 2026-27. */
export function fyOf(at: Date): string {
  const { year, month } = istParts(at);
  const start = month >= 4 ? year : year - 1;
  const yy = (n: number) => String(n % 100).padStart(2, '0');
  return `${yy(start)}${yy(start + 1)}`;
}

const SERIES = {
  INV: { prefix: 'HL', width: 6 },
  CN: { prefix: 'HLCN', width: 5 },
} as const;

export function docPrefix(series: DocSeries, fy: string): string {
  if (!/^\d{4}$/.test(fy)) throw new RangeError(`bad FY: ${fy}`);
  return `${SERIES[series].prefix}/${fy}/`;
}

export function docWidth(series: DocSeries): number {
  return SERIES[series].width;
}

export function docNo(series: DocSeries, fy: string, seq: number): string {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new RangeError(`bad sequence: ${seq}`);
  const no = docPrefix(series, fy) + String(seq).padStart(SERIES[series].width, '0');
  if (no.length > 16) throw new RangeError(`document number ${no} exceeds 16 characters`);
  return no;
}

/** "HL-2610-0042": IST year-month + per-month sequence (min 4 digits). */
export function orderNo(at: Date, seq: number): string {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new RangeError(`bad sequence: ${seq}`);
  const { year, month } = istParts(at);
  return `HL-${String(year % 100).padStart(2, '0')}${String(month).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
}
