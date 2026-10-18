import { describe, expect, it } from 'vitest';
import { classifyD1Error } from '../../src/lib/store/db';
import { claimStmt, runClaim } from '../../src/lib/store/ops';
import { AT, db, insertOrder, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const MARK_PAID_OK = "SELECT status = 'pending_payment' AND total_paise = ? FROM orders WHERE id = ?";

function markPaid(orderId: number, total = 69900) {
  const claim = claimStmt(db, orderId, 'mark_paid', MARK_PAID_OK, [total, orderId], AT);
  const rest = [
    db.prepare("UPDATE orders SET status = 'placed', payment_status = 'authorized', updated_at = ? WHERE id = ?").bind(AT, orderId),
    db.prepare("INSERT INTO order_events (order_id, at, type, actor) VALUES (?, ?, 'paid', 'razorpay')").bind(orderId, AT),
  ];
  return runClaim(db, claim, rest);
}

describe('runClaim', () => {
  it('runs the batch once when the claim holds', async () => {
    const o = await insertOrder();
    expect(await markPaid(o)).toEqual({ ok: true });
    expect(await scalar('SELECT status FROM orders WHERE id = ?', o)).toBe('placed');
    expect(await scalar('SELECT count(*) FROM order_events WHERE order_id = ?', o)).toBe(1);
  });

  it('lets exactly one of two concurrent claims win', async () => {
    const o = await insertOrder();
    const results = await Promise.all([markPaid(o), markPaid(o), markPaid(o)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === 'claim')).toBe(true);
    expect(await scalar('SELECT count(*) FROM order_events WHERE order_id = ?', o)).toBe(1);
    expect(await scalar("SELECT count(*) FROM ops WHERE order_id = ? AND kind = 'mark_paid'", o)).toBe(1);
  });

  it('fails as a claim when the order is missing or in the wrong state, with no side effects', async () => {
    const missing = await markPaid(999_999);
    expect(missing).toMatchObject({ ok: false, reason: 'claim' });

    const placed = await insertOrder({ status: 'placed' });
    expect(await markPaid(placed)).toMatchObject({ ok: false, reason: 'claim' });
    expect(await scalar('SELECT count(*) FROM order_events WHERE order_id = ?', placed)).toBe(0);
    expect(await scalar('SELECT count(*) FROM ops WHERE order_id = ?', placed)).toBe(0);
  });

  it('fails as a claim when the amount does not match', async () => {
    const o = await insertOrder();
    expect(await markPaid(o, 100)).toMatchObject({ ok: false, reason: 'claim' });
    expect(await scalar('SELECT status FROM orders WHERE id = ?', o)).toBe('pending_payment');
  });

  it('reports stock shortfalls and rolls back the claim row too', async () => {
    const o = await insertOrder();
    const v = await insertVariant(await insertProduct(), { stock_qty: 1 });
    const claim = claimStmt(db, o, 'reserve', "SELECT status = 'pending_payment' FROM orders WHERE id = ?", [o], AT);
    const res = await runClaim(db, claim, [
      db.prepare('UPDATE variants SET stock_qty = stock_qty - 2 WHERE id = ?').bind(v),
    ]);
    expect(res).toMatchObject({ ok: false, reason: 'stock' });
    expect(await scalar('SELECT count(*) FROM ops WHERE order_id = ?', o)).toBe(0);
    // The claim is still available afterwards.
    expect(await runClaim(db, claim, [])).toEqual({ ok: true });
  });
});

it('reports a reservation on an unpurchasable variant as inactive', async () => {
  const o = await insertOrder();
  const v = await insertVariant(await insertProduct(), { active: 0 });
  const claim = claimStmt(db, o, 'reserve_inactive', "SELECT status = 'pending_payment' FROM orders WHERE id = ?", [o], AT);
  const res = await runClaim(db, claim, [
    db.prepare('UPDATE variants SET stock_qty = stock_qty - 1 WHERE id = ?').bind(v),
    db.prepare("INSERT INTO stock_reservations (variant_id, order_id, qty, expires_at, state) VALUES (?, ?, 1, ?, 'held')").bind(v, o, AT),
  ]);
  expect(res).toMatchObject({ ok: false, reason: 'inactive' });
});

describe('classifyD1Error', () => {
  it.each([
    ['D1_ERROR: CHECK constraint failed: stock_qty >= 0: SQLITE_CONSTRAINT', 'stock'],
    ['D1_ERROR: CHECK constraint failed: ok = 1: SQLITE_CONSTRAINT', 'claim'],
    ['D1_ERROR: NOT NULL constraint failed: ops.ok: SQLITE_CONSTRAINT', 'claim'],
    ['D1_ERROR: UNIQUE constraint failed: ops.order_id, ops.kind: SQLITE_CONSTRAINT', 'claim'],
    ['D1_ERROR: UNIQUE constraint failed: orders.idempotency_key: SQLITE_CONSTRAINT', 'unique'],
    ['D1_ERROR: invoices are immutable: SQLITE_CONSTRAINT', 'immutable'],
    ['D1_ERROR: order_events are append-only: SQLITE_CONSTRAINT', 'immutable'],
    ['D1_ERROR: variant not purchasable: SQLITE_CONSTRAINT', 'inactive'],
    ['D1_ERROR: no such table: nope', 'other'],
  ])('%s → %s', (message, kind) => {
    expect(classifyD1Error(new Error(message))).toBe(kind);
  });
  it('handles non-errors', () => {
    expect(classifyD1Error('weird')).toBe('other');
    expect(classifyD1Error(undefined)).toBe('other');
  });
});
