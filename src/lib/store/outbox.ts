/**
 * Transactional outbox (spec: "Side effects: the outbox").
 *
 * State changes never call external services directly: the batch that changes
 * an order also inserts outbox rows (`enqueueStmt`). After the batch commits,
 * the request drains its own rows (`ids`), and the cron drains the rest.
 *
 * Each row is claimed with a guarded UPDATE (pending/due, or running with an
 * expired lease) and acted on only if that UPDATE changed exactly one row, so
 * overlapping drains never run a row twice within its lease. The claim bumps
 * `attempts`, and completion updates require that same value, so a drain whose
 * lease was taken over can't overwrite the newer run's result. A handler that
 * outlives its lease may run again, so handlers must be idempotent (e.g. look
 * up the Shiprocket order before creating it). A row whose final attempt
 * crashed the isolate is swept to `dead` once its lease expires.
 */

export const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 6 * 3600_000;
const DEFAULT_LEASE_MS = 120_000;

export interface OutboxRow {
  id: number;
  order_id: number | null;
  kind: string;
  payload: unknown;
  attempts: number;
}

export type OutboxHandler = (payload: any, ctx: { env: Env; row: OutboxRow }) => Promise<void>;

export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

export function enqueueStmt(
  db: D1Database,
  e: { orderId?: number | null; kind: string; payload: unknown; at: string },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)`,
    )
    .bind(e.orderId ?? null, e.kind, JSON.stringify(e.payload ?? {}), e.at, e.at, e.at);
}

const CLAIMABLE = `((state = 'pending' AND next_attempt_at <= ?1) OR (state = 'running' AND lease_until < ?1 AND attempts < ${MAX_ATTEMPTS}))`;

export async function drainOutbox(
  db: D1Database,
  handlers: Record<string, OutboxHandler>,
  opts: { env: Env; now: Date; limit?: number; ids?: number[]; leaseMs?: number },
): Promise<{ done: number; failed: number; dead: number }> {
  // Long drains must not hand out leases that are already expired: each row
  // gets its own "now", advanced by the time spent so far.
  const started = Date.now();
  const clock = () => new Date(opts.now.getTime() + (Date.now() - started));
  const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
  const tally = { done: 0, failed: 0, dead: 0 };

  // Numbered placeholders throughout: ?1 is "now", ids follow from ?2 (SQLite gives a bare ? the next
  // number after the highest used so far, which is easy to break when editing these queries).
  const ids = opts.ids ?? [];
  const idFilter = opts.ids ? ` AND id IN (${ids.map((_, i) => `?${i + 2}`).join(', ') || 'NULL'})` : '';

  // Final attempts that never reported back (isolate crash / timeout).
  const swept = await db
    .prepare(
      `UPDATE outbox SET state = 'dead', lease_until = NULL, updated_at = ?1,
              last_error = COALESCE(last_error || ' — ', '') || 'final attempt did not finish'
       WHERE state = 'running' AND lease_until < ?1 AND attempts >= ${MAX_ATTEMPTS}${idFilter}`,
    )
    .bind(opts.now.toISOString(), ...ids)
    .run();
  tally.dead += swept.meta.changes ?? 0;

  const { results: due } = await db
    .prepare(`SELECT id FROM outbox WHERE ${CLAIMABLE}${idFilter} ORDER BY id LIMIT ?${ids.length + 2}`)
    .bind(opts.now.toISOString(), ...ids, opts.limit ?? 25)
    .all<{ id: number }>();

  for (const { id } of due) {
    const at = clock();
    const now = at.toISOString();
    const lease = new Date(at.getTime() + leaseMs).toISOString();
    const claimed = await db
      .prepare(
        `UPDATE outbox SET state = 'running', lease_until = ?2, attempts = attempts + 1, updated_at = ?1
         WHERE id = ?3 AND ${CLAIMABLE}`,
      )
      .bind(now, lease, id)
      .run();
    if (claimed.meta.changes !== 1) continue; // another drain has it

    const r = await db
      .prepare('SELECT id, order_id, kind, payload, attempts FROM outbox WHERE id = ?')
      .bind(id)
      .first<{ id: number; order_id: number | null; kind: string; payload: string; attempts: number }>();
    if (!r) continue;
    const row: OutboxRow = { ...r, payload: JSON.parse(r.payload) };

    const handler = handlers[row.kind];
    if (!handler) {
      await finish(db, row, 'dead', now, `no handler for ${row.kind}`);
      tally.dead += 1;
      continue;
    }

    try {
      await handler(row.payload, { env: opts.env, row });
      await finish(db, row, 'done', clock().toISOString(), null);
      tally.done += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (row.attempts >= MAX_ATTEMPTS) {
        await finish(db, row, 'dead', clock().toISOString(), message);
        tally.dead += 1;
      } else {
        const next = new Date(at.getTime() + backoffMs(row.attempts)).toISOString();
        await db
          .prepare(
            `UPDATE outbox SET state = 'pending', lease_until = NULL, next_attempt_at = ?, last_error = ?, updated_at = ?
             WHERE id = ? AND state = 'running' AND attempts = ?`,
          )
          .bind(next, message.slice(0, 1000), clock().toISOString(), id, row.attempts)
          .run();
        tally.failed += 1;
      }
      console.error(JSON.stringify({ msg: 'outbox handler failed', id, kind: row.kind, attempts: row.attempts, error: message }));
    }
  }
  return tally;
}

/** Completes a row only if this drain still owns it (same attempt number). A done row clears the error of an earlier failed attempt. */
async function finish(db: D1Database, row: OutboxRow, state: 'done' | 'dead', now: string, error: string | null) {
  await db
    .prepare(
      `UPDATE outbox SET state = ?, lease_until = NULL, last_error = ?, updated_at = ?
       WHERE id = ? AND state = 'running' AND attempts = ?`,
    )
    .bind(state, error?.slice(0, 1000) ?? null, now, row.id, row.attempts)
    .run();
}
