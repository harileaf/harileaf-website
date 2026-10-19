/**
 * What the buy box offers for a variant on a given day (spec: "Product
 * Availability Rules"). Season windows are inclusive "MM-DD" pairs in IST and
 * may wrap the year end (e.g. 11-15 → 02-15).
 */
import { istParts } from './fy';

export type Availability = 'buy' | 'sold_out' | 'preorder' | 'notify';

export interface AvailabilityInput {
  status: 'draft' | 'active' | 'discontinued';
  seasonStartMd: string | null;
  seasonEndMd: string | null;
  offSeasonMode: 'notify' | 'preorder' | null;
  preorderDispatchDate: string | null;
  variantActive: boolean;
  stockQty: number;
}

export function inSeason(startMd: string | null, endMd: string | null, today: Date): boolean {
  if (!startMd || !endMd) return true;
  const { month, day } = istParts(today);
  const md = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return startMd <= endMd ? md >= startMd && md <= endMd : md >= startMd || md <= endMd;
}

/** `null` means the variant isn't offered at all (draft, discontinued or inactive). */
export function availability(p: AvailabilityInput, today: Date): Availability | null {
  if (p.status !== 'active' || !p.variantActive) return null;
  if (inSeason(p.seasonStartMd, p.seasonEndMd, today)) return p.stockQty > 0 ? 'buy' : 'sold_out';
  // A dispatch date that has come and gone (season not open yet) is no promise: back to notify-me.
  const { year, month, day } = istParts(today);
  const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (p.offSeasonMode === 'preorder' && p.preorderDispatchDate && p.preorderDispatchDate > ymd && p.stockQty > 0) return 'preorder';
  return 'notify';
}
