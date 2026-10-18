import { describe, expect, it } from 'vitest';
import { POST as resend, PER_ORDER_PER_DAY } from '../../src/pages/api/store/order/resend';
import { viewTokenFor } from '../../src/lib/store/orders';
import { checkViewToken, hashViewToken } from '../../src/lib/store/tokens';
import { db, insertOrder, scalar } from '../helpers/fixtures';

const SECRET = 'test-order-token-secret'; // tests/wrangler.test.toml
const call = async (body: unknown) => {
  const res = await resend({ request: new Request('https://harileaf.org/api/store/order/resend', { method: 'POST', body: JSON.stringify(body) }), locals: {} } as any);
  return { status: res.status, body: (await res.json()) as { message?: string } };
};
const links = (id: number) => scalar<number>("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'email.order_link'", id);

describe('find your order', () => {
  it('answers the same whether or not the order matches', async () => {
    await insertOrder({ order_no: 'HL-2610-0777', email: 'meera@example.com', idempotency_key: 'k-0777-xxxxxxxxxxxx' });
    const answers = await Promise.all([
      call({ orderNo: 'HL-2610-0777', email: 'someone@else.com' }),
      call({ orderNo: 'HL-2610-9999', email: 'meera@example.com' }),
      call({ orderNo: 'hl-2610-0777', email: ' Meera@Example.com ' }),
    ]);
    expect(new Set(answers.map((r) => JSON.stringify(r))).size).toBe(1);
    expect((await call({ orderNo: '', email: '' })).status).toBe(400);
  });

  it('emails a new link and retires the old one', async () => {
    const key = 'k-0778-xxxxxxxxxxxx';
    const oldToken = await viewTokenFor(SECRET, key);
    const id = await insertOrder({ order_no: 'HL-2610-0778', email: 'ravi@example.com', idempotency_key: key, view_token_hash: await hashViewToken(SECRET, oldToken) });
    await call({ orderNo: 'HL-2610-0778', email: 'ravi@example.com' });
    expect(await links(id)).toBe(1);
    const row = await db.prepare('SELECT view_token_hash, view_token_rev FROM orders WHERE id = ?').bind(id).first<{ view_token_hash: string; view_token_rev: number }>();
    expect(row!.view_token_rev).toBe(1);
    expect(await checkViewToken(SECRET, oldToken, row!.view_token_hash)).toBe(false);
    expect(await checkViewToken(SECRET, await viewTokenFor(SECRET, key, 1), row!.view_token_hash)).toBe(true);
    expect(await scalar("SELECT count(*) FROM order_events WHERE order_id = ? AND type = 'link_rotated'", id)).toBe(1);
  });

  it('caps link emails: none within 10 minutes of the last, and at most 3 a day per order', async () => {
    const id = await insertOrder({ order_no: 'HL-2610-0779', email: 'zubin@example.com', idempotency_key: 'k-0779-xxxxxxxxxxxx' });
    await call({ orderNo: 'HL-2610-0779', email: 'zubin@example.com' });
    await call({ orderNo: 'HL-2610-0779', email: 'zubin@example.com' });
    expect(await links(id)).toBe(1);
    // Pretend earlier sends were 20 minutes ago, repeatedly, until the daily cap.
    for (let i = 0; i < PER_ORDER_PER_DAY + 2; i++) {
      await db.prepare("UPDATE outbox SET created_at = ? WHERE order_id = ? AND kind = 'email.order_link'").bind(new Date(Date.now() - 20 * 60_000).toISOString(), id).run();
      await call({ orderNo: 'HL-2610-0779', email: 'zubin@example.com' });
    }
    expect(await links(id)).toBe(PER_ORDER_PER_DAY);
  });
});
