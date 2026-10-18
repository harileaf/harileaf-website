import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, backoffMs, drainOutbox, enqueueStmt, type OutboxHandler } from '../../src/lib/store/outbox';
import { db, scalar } from '../helpers/fixtures';

const T0 = new Date('2026-10-18T06:00:00.000Z');
const plus = (ms: number) => new Date(T0.getTime() + ms);

async function enqueue(kind: string, payload: unknown = {}, at = T0) {
  const res = await enqueueStmt(db, { kind, payload, at: at.toISOString() }).run();
  return res.meta.last_row_id;
}

const row = (id: number) =>
  db.prepare('SELECT state, attempts, next_attempt_at, last_error, lease_until FROM outbox WHERE id = ?').bind(id).first<{
    state: string; attempts: number; next_attempt_at: string; last_error: string | null; lease_until: string | null;
  }>();

describe('backoffMs', () => {
  it('doubles from 30 s and caps at 6 h', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(5)).toBe(480_000);
    expect(backoffMs(20)).toBe(6 * 3600_000);
  });
});

describe('drainOutbox', () => {
  it('runs a handler once and marks the row done', async () => {
    const id = await enqueue('test.ok', { n: 1 });
    const seen: unknown[] = [];
    const handlers: Record<string, OutboxHandler> = { 'test.ok': async (p) => void seen.push(p) };
    const res = await drainOutbox(db, handlers, { env, now: T0, ids: [id] });
    expect(res).toEqual({ done: 1, failed: 0, dead: 0 });
    expect(seen).toEqual([{ n: 1 }]);
    expect(await row(id)).toMatchObject({ state: 'done', attempts: 1, lease_until: null });
    // Draining again does nothing.
    expect(await drainOutbox(db, handlers, { env, now: plus(1000), ids: [id] })).toEqual({ done: 0, failed: 0, dead: 0 });
  });

  it('backs off after a failure and retries when due', async () => {
    const id = await enqueue('test.flaky');
    let calls = 0;
    const handlers: Record<string, OutboxHandler> = {
      'test.flaky': async () => {
        calls += 1;
        if (calls === 1) throw new Error('courier API down');
      },
    };
    expect(await drainOutbox(db, handlers, { env, now: T0, ids: [id] })).toEqual({ done: 0, failed: 1, dead: 0 });
    expect(await row(id)).toMatchObject({ state: 'pending', attempts: 1, last_error: 'courier API down', next_attempt_at: plus(30_000).toISOString() });
    // Not due yet.
    expect(await drainOutbox(db, handlers, { env, now: plus(29_000), ids: [id] })).toEqual({ done: 0, failed: 0, dead: 0 });
    expect(await drainOutbox(db, handlers, { env, now: plus(30_000), ids: [id] })).toEqual({ done: 1, failed: 0, dead: 0 });
    expect(calls).toBe(2);
  });

  it('marks a row dead after the maximum number of attempts', async () => {
    const id = await enqueue('test.broken');
    const handlers: Record<string, OutboxHandler> = { 'test.broken': async () => { throw new Error('nope'); } };
    let now = T0;
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      expect((await drainOutbox(db, handlers, { env, now, ids: [id] })).failed).toBe(1);
      now = new Date((await row(id))!.next_attempt_at);
    }
    expect(await drainOutbox(db, handlers, { env, now, ids: [id] })).toEqual({ done: 0, failed: 0, dead: 1 });
    expect(await row(id)).toMatchObject({ state: 'dead', attempts: MAX_ATTEMPTS, last_error: 'nope' });
  });

  it('marks unknown kinds dead immediately', async () => {
    const id = await enqueue('test.unknown');
    expect(await drainOutbox(db, {}, { env, now: T0, ids: [id] })).toEqual({ done: 0, failed: 0, dead: 1 });
    expect(await row(id)).toMatchObject({ state: 'dead', last_error: 'no handler for test.unknown' });
  });

  it('never runs a row twice when drains overlap', async () => {
    const ids = [await enqueue('test.slow'), await enqueue('test.slow'), await enqueue('test.slow')];
    const calls = new Map<number, number>();
    const handlers: Record<string, OutboxHandler> = {
      'test.slow': async (_p, { row }) => {
        calls.set(row.id, (calls.get(row.id) ?? 0) + 1);
        await new Promise((r) => setTimeout(r, 20));
      },
    };
    const [a, b] = await Promise.all([
      drainOutbox(db, handlers, { env, now: T0, ids }),
      drainOutbox(db, handlers, { env, now: T0, ids }),
    ]);
    expect(a.done + b.done).toBe(3);
    expect([...calls.values()]).toEqual([1, 1, 1]);
  });

  it('reclaims a row whose lease expired (crashed run) but not one still leased', async () => {
    const id = await enqueue('test.ok');
    await db
      .prepare("UPDATE outbox SET state = 'running', attempts = 1, lease_until = ? WHERE id = ?")
      .bind(plus(60_000).toISOString(), id)
      .run();
    const handlers: Record<string, OutboxHandler> = { 'test.ok': async () => {} };
    expect(await drainOutbox(db, handlers, { env, now: plus(30_000), ids: [id] })).toEqual({ done: 0, failed: 0, dead: 0 });
    expect(await drainOutbox(db, handlers, { env, now: plus(61_000), ids: [id] })).toEqual({ done: 1, failed: 0, dead: 0 });
    expect(await row(id)).toMatchObject({ state: 'done', attempts: 2 });
  });

  it('drains only the given ids when asked (request drains its own rows)', async () => {
    const mine = await enqueue('test.ok');
    const other = await enqueue('test.ok');
    const handlers: Record<string, OutboxHandler> = { 'test.ok': async () => {} };
    await drainOutbox(db, handlers, { env, now: T0, ids: [mine] });
    expect((await row(mine))?.state).toBe('done');
    expect((await row(other))?.state).toBe('pending');
  });

  it('drains due rows oldest first up to the limit', async () => {
    await db.prepare("UPDATE outbox SET state = 'done' WHERE state = 'pending'").run();
    const first = await enqueue('test.ok');
    const second = await enqueue('test.ok');
    const order: number[] = [];
    const handlers: Record<string, OutboxHandler> = { 'test.ok': async (_p, { row }) => void order.push(row.id) };
    expect(await drainOutbox(db, handlers, { env, now: T0, limit: 1 })).toEqual({ done: 1, failed: 0, dead: 0 });
    expect(order).toEqual([first]);
    expect(await scalar('SELECT state FROM outbox WHERE id = ?', second)).toBe('pending');
  });
});
