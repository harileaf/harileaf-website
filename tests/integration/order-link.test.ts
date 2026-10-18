import { describe, expect, it } from 'vitest';
import { POST as resend } from '../../src/pages/api/store/order/resend';
import { db, insertOrder, scalar } from '../helpers/fixtures';

const call = async (body: unknown) => {
  const res = await resend({ request: new Request('https://harileaf.org/api/store/order/resend', { method: 'POST', body: JSON.stringify(body) }), locals: {} } as any);
  return { status: res.status, body: (await res.json()) as { message?: string } };
};

describe('resend order link', () => {
  it('emails a matching order at most once per 10 minutes, and answers the same either way', async () => {
    const id = await insertOrder({ order_no: 'HL-2610-0777', email: 'meera@example.com' });
    const hit = await call({ orderNo: 'hl-2610-0777', email: ' Meera@Example.com ' });
    const again = await call({ orderNo: 'HL-2610-0777', email: 'meera@example.com' });
    const wrongEmail = await call({ orderNo: 'HL-2610-0777', email: 'someone@else.com' });
    const noOrder = await call({ orderNo: 'HL-2610-9999', email: 'meera@example.com' });
    expect(new Set([hit, again, wrongEmail, noOrder].map((r) => JSON.stringify(r)))).toEqual(new Set([JSON.stringify(hit)]));
    expect(await scalar("SELECT count(*) FROM outbox WHERE order_id = ? AND kind = 'email.order_link'", id)).toBe(1);
    expect((await call({ orderNo: '', email: '' })).status).toBe(400);
  });
});
