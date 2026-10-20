import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { acceptsNotify, makeNotifyHandler, purgeNotifyRequests, queueBackInStock, signUp } from '../../src/lib/store/notify';
import type { OutboxRow } from '../../src/lib/store/outbox';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const NOW = new Date('2026-11-01T06:00:00Z');

describe('notify me', () => {
  it('queues each waiting request exactly once when the product becomes buyable, emails it once, then forgets the address', async () => {
    const p = await insertProduct();
    const v = await insertVariant(p, { stock_qty: 0 });
    expect(await acceptsNotify(db, p, NOW)).toBe(true);
    await signUp(db, p, 'a@example.com', NOW);
    await signUp(db, p, 'a@example.com', NOW); // duplicate: same answer, one row
    await signUp(db, p, 'b@example.com', NOW);
    expect(await scalar('SELECT count(*) FROM notify_requests WHERE product_id = ?', p)).toBe(2);

    expect(await queueBackInStock(db, NOW)).toBe(0); // still sold out
    await db.prepare('UPDATE variants SET stock_qty = 5 WHERE id = ?').bind(v).run();
    expect(await acceptsNotify(db, p, NOW)).toBe(false);
    const runs = await Promise.all([queueBackInStock(db, NOW), queueBackInStock(db, NOW), queueBackInStock(db, NOW)]);
    expect(runs.reduce((a, b) => a + b, 0)).toBe(2);
    let rows = (await db.prepare("SELECT * FROM outbox WHERE kind = 'email.notify' ORDER BY id").all<OutboxRow>()).results;
    expect(rows.map((r) => JSON.parse(r.payload).requestId)).toHaveLength(2);

    // Sold out again before the emails went: nothing is sent and both go back to waiting.
    await db.prepare('UPDATE variants SET stock_qty = 0 WHERE id = ?').bind(v).run();
    for (const row of rows) await makeNotifyHandler()(JSON.parse(row.payload), { env, row });
    expect(await scalar('SELECT count(*) FROM notify_requests WHERE product_id = ? AND queued_at IS NULL AND notified_at IS NULL', p)).toBe(2);
    await db.prepare('UPDATE variants SET stock_qty = 5 WHERE id = ?').bind(v).run();
    expect(await queueBackInStock(db, NOW)).toBe(2);
    rows = (await db.prepare("SELECT * FROM outbox WHERE kind = 'email.notify' ORDER BY id").all<OutboxRow>()).results.slice(-2);

    // The handler sends once per request (no RESEND_API_KEY in tests: logged and skipped) and marks it notified.
    const handler = makeNotifyHandler();
    for (const row of [...rows, rows[0]]) await handler(JSON.parse(row.payload), { env, row });
    expect(await scalar('SELECT count(*) FROM notify_requests WHERE product_id = ? AND notified_at IS NOT NULL', p)).toBe(2);
    expect(await queueBackInStock(db, NOW)).toBe(0);

    // Retention removes notified addresses; signing up again later starts afresh.
    expect(await purgeNotifyRequests(db, NOW)).toBeGreaterThanOrEqual(2);
    expect(await scalar('SELECT count(*) FROM notify_requests WHERE product_id = ?', p)).toBe(0);
  });

  it('drops requests after 12 months even if never notified, but not one whose email is queued', async () => {
    const p = await insertProduct();
    await insertVariant(p, { stock_qty: 0 });
    await signUp(db, p, 'old@example.com', new Date('2025-10-01T00:00:00Z'));
    await signUp(db, p, 'queued@example.com', new Date('2025-10-01T00:00:00Z'));
    await signUp(db, p, 'new@example.com', NOW);
    await db.prepare("UPDATE notify_requests SET queued_at = ? WHERE email = 'queued@example.com'").bind(NOW.toISOString()).run();
    await purgeNotifyRequests(db, NOW);
    expect((await db.prepare('SELECT email FROM notify_requests WHERE product_id = ? ORDER BY email').bind(p).all<{ email: string }>()).results.map((r) => r.email)).toEqual(['new@example.com', 'queued@example.com']);
  });

  it('treats a pre-order opening as available', async () => {
    const p = await insertProduct({ season_start_md: '04-01', season_end_md: '06-15', off_season_mode: 'preorder' });
    await insertVariant(p, { stock_qty: 20 });
    await signUp(db, p, 'mango@example.com', NOW);
    expect(await queueBackInStock(db, NOW)).toBe(0); // out of season, no dispatch date yet → notify
    await db.prepare("UPDATE products SET preorder_dispatch_date = '2027-04-05' WHERE id = ?").bind(p).run();
    expect(await queueBackInStock(db, NOW)).toBe(1);
  });
});
