/** Small D1 helpers shared by the store modules. */

export const nowIso = (d: Date = new Date()): string => d.toISOString();

export type ConstraintKind = 'stock' | 'claim' | 'unique' | 'immutable' | 'inactive' | 'other';

/**
 * D1 batches fail as a whole with one error message; this maps it to the
 * invariant that fired so callers can answer "Only N left" vs "already done".
 */
export function classifyD1Error(err: unknown): ConstraintKind {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/CHECK constraint failed: stock_qty >= 0/.test(msg)) return 'stock';
  if (/CHECK constraint failed: ok = 1|NOT NULL constraint failed: ops\.ok|UNIQUE constraint failed: ops\./.test(msg)) return 'claim';
  if (/variant not purchasable/.test(msg)) return 'inactive';
  if (/are immutable|append-only|reservation state is final/.test(msg)) return 'immutable';
  if (/UNIQUE constraint failed/.test(msg)) return 'unique';
  return 'other';
}
