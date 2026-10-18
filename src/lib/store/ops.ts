/**
 * Exactly-once state changes (spec: "Exactly-once transitions").
 *
 * D1 batches can't branch, so a change that must happen once starts with an
 * INSERT into `ops` whose `ok` value is computed in SQL from the current order
 * row. If the order is missing (`ok` NULL), in the wrong state (`ok` 0) or the
 * claim was already taken (primary key), that first statement errors and the
 * whole batch — including every side-effect row — rolls back.
 */
import { classifyD1Error } from './db';

/**
 * @param okSql scalar SELECT over `orders` that is 1 when the change is allowed,
 *   e.g. "SELECT status = 'pending_payment' AND total_paise = ? FROM orders WHERE id = ?".
 *   Its `?` placeholders are bound from `okBinds`.
 */
export function claimStmt(
  db: D1Database,
  orderId: number,
  kind: string,
  okSql: string,
  okBinds: unknown[],
  at: string,
): D1PreparedStatement {
  // ?1..?3 must appear before okSql: SQLite numbers a bare `?` as one more than
  // the largest ?N seen so far in the text, so okSql's placeholders become ?4, ?5…
  return db
    .prepare(`INSERT INTO ops (order_id, kind, created_at, ok) SELECT ?1, ?2, ?3, (${okSql})`)
    .bind(orderId, kind, at, ...okBinds);
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'claim' | 'stock' | 'other'; error: unknown };

export async function runClaim(
  db: D1Database,
  claim: D1PreparedStatement,
  rest: D1PreparedStatement[],
): Promise<ClaimResult> {
  try {
    await db.batch([claim, ...rest]);
    return { ok: true };
  } catch (error) {
    const kind = classifyD1Error(error);
    return { ok: false, reason: kind === 'claim' || kind === 'stock' ? kind : 'other', error };
  }
}
