/**
 * Transactional outbox (spec: "Side effects: the outbox").
 *
 * State changes never call external services directly: the batch that changes
 * an order also inserts outbox rows (`enqueueStmt`). After the batch commits,
 * the request drains its own rows (`ids`), and the cron drains the rest.
 *
 * Each row is claimed with a guarded UPDATE (pending/due, or running with an
 * expired lease) and acted on only if that UPDATE changed exactly one row, so
 * overlapping drains never run a row twice within its lease. A handler that
 * outlives its lease may be retried, so handlers must be idempotent (e.g. look
 * up the Shiprocket order before creating it).
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

const CLAIMABLE = `((state = 'pending' AND next_attempt_at <= ?1) OR (state = 'running' AND lease_until < ?1))`;

export async function drainOutbox(
  db: D1Database,
  handlers: Record<string, OutboxHandler>,
  opts: { env: Env; now: Date; limit?: number; ids?: number[]; leaseMs?: number },
): Promise<{ done: number; failed: number; dead: number }> {
  const now = opts.now.toISOString();
  const lease = new Date(opts.now.getTime() + (opts.leaseMs ?? DEFAULT_LEASE_MS)).toISOString();
  const tally = { done: 0, failed: 0, dead: 0 };

  const idFilter = opts.ids ? ` AND id IN (${opts.ids.map(() => '?').join(', ') || 'NULL'})` : '';
  const { results: due } = await db
    .prepare(`SELECT id FROM outbox WHERE ${CLAIMABLE}${idFilter} ORDER BY id LIMIT ?`)
    .bind(now, ...(opts.ids ?? []), opts.limit ?? 25)
    .all<{ id: number }>();

  for (const { id } of due) {
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
      await finish(db, id, 'dead', now, `no handler for ${row.kind}`);
      tally.dead += 1;
      continue;
    }

    try {
      await handler(row.payload, { env: opts.env, row });
      await finish(db, id, 'done', now, null);
      tally.done += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (row.attempts >= MAX_ATTEMPTS) {
        await finish(db, id, 'dead', now, message);
        tally.dead += 1;
      } else {
        const next = new Date(opts.now.getTime() + backoffMs(row.attempts)).toISOString();
        await db
          .prepare(
            `UPDATE outbox SET state = 'pending', lease_until = NULL, next_attempt_at = ?, last_error = ?, updated_at = ?
             WHERE id = ? AND state = 'running'`,
          )
          .bind(next, message.slice(0, 1000), now, id)
          .run();
        tally.failed += 1;
      }
      console.error(JSON.stringify({ msg: 'outbox handler failed', id, kind: row.kind, attempts: row.attempts, error: message }));
    }
  }
  return tally;
}

async function finish(db: D1Database, id: number, state: 'done' | 'dead', now: string, error: string | null) {
  await db
    .prepare(
      `UPDATE outbox SET state = ?, lease_until = NULL, last_error = COALESCE(?, last_error), updated_at = ?
       WHERE id = ? AND state = 'running'`,
    )
    .bind(state, error?.slice(0, 1000) ?? null, now, id)
    .run();
}
