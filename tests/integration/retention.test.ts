import { describe, expect, it } from 'vitest';
import { runAdminAction } from '../../src/lib/store/admin-orders';
import { anonymiseStaleOrders } from '../../src/lib/store/retention';
import { db, insertOrder, scalar } from '../helpers/fixtures';

const NOW = new Date('2027-06-01T06:00:00Z'); // the fixture orders are from Oct 2026 (> 180 days)
const ctx = { now: NOW, actorEmail: 'admin@harileaf.org', tokenSecret: 's' };
const email = (id: number) => scalar<string>('SELECT email FROM orders WHERE id = ?', id);

describe('retention', () => {
  it('anonymises old checkouts that never became a sale, and never touches tax records', async () => {
    const abandoned = await insertOrder({ status: 'payment_failed', email: 'gone@example.com' });
    const cancelledCod = await insertOrder({ status: 'cancelled', payment_method: 'cod', email: 'gone2@example.com' });
    const sold = await insertOrder({ status: 'delivered', payment_status: 'paid', email: 'keep@example.com' });
    const refunded = await insertOrder({ status: 'cancelled', payment_status: 'refunded', email: 'keep2@example.com' });
    const recent = await insertOrder({ status: 'payment_failed', email: 'recent@example.com', created_at: '2027-05-30T00:00:00.000Z' });
    expect(await anonymiseStaleOrders(db, NOW)).toBeGreaterThanOrEqual(2);
    expect(await email(abandoned)).toBe(`removed-${abandoned}@invalid.harileaf.org`);
    expect(await email(cancelledCod)).toBe(`removed-${cancelledCod}@invalid.harileaf.org`);
    expect(await scalar('SELECT customer_name || phone || ship_line1 FROM orders WHERE id = ?', abandoned)).toBe('Removed0000000000Removed');
    expect([await email(sold), await email(refunded), await email(recent)]).toEqual(['keep@example.com', 'keep2@example.com', 'recent@example.com']);
    expect(await scalar("SELECT count(*) FROM order_events WHERE order_id = ? AND type = 'anonymised'", abandoned)).toBe(1);
    expect(await anonymiseStaleOrders(db, NOW)).toBe(0); // idempotent
  });

  it('erases on request only when the order is not a tax record; opts an email out of marketing everywhere', async () => {
    const tax = await insertOrder({ status: 'delivered', payment_status: 'paid', email: 'asha@example.com', marketing_opt_in: 1 });
    const other = await insertOrder({ status: 'payment_failed', email: 'Asha@Example.com', marketing_opt_in: 1, created_at: '2027-05-31T00:00:00.000Z' });
    expect(await runAdminAction(db, tax, { action: 'erase_personal_data' }, ctx)).toMatchObject({ ok: false, error: /tax record/ });
    expect(await runAdminAction(db, other, { action: 'erase_personal_data' }, ctx)).toEqual({ ok: true });
    expect(await scalar("SELECT count(*) FROM order_events WHERE order_id = ? AND type = 'anonymised'", other)).toBe(1);
    expect(await runAdminAction(db, tax, { action: 'marketing_opt_out' }, ctx)).toEqual({ ok: true });
    expect(await scalar('SELECT marketing_opt_in FROM orders WHERE id = ?', tax)).toBe(0);
  });
});
