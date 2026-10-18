import { describe, expect, it } from 'vitest';
import { ACTORS, ORDER_STATUSES, canTransition, type Actor, type OrderStatus } from '../../src/lib/store/transitions';

// The complete allow-list from the spec's status diagram. Anything not listed is forbidden.
const ALLOWED: Array<[OrderStatus, OrderStatus, Actor[]]> = [
  ['pending_payment', 'placed', ['razorpay', 'system']],
  ['pending_payment', 'payment_failed', ['razorpay', 'system']],
  ['payment_failed', 'placed', ['razorpay', 'system']],
  ['placed', 'packed', ['admin']],
  ['placed', 'cancelled', ['customer', 'admin']],
  ['packed', 'shipped', ['shiprocket', 'admin']],
  ['packed', 'cancelled', ['admin']],
  ['shipped', 'delivered', ['shiprocket', 'admin']],
  ['shipped', 'rto', ['shiprocket', 'admin']],
  ['delivered', 'returned', ['admin']],
];

const allowed = (from: OrderStatus, to: OrderStatus, actor: Actor) =>
  ALLOWED.some(([f, t, actors]) => f === from && t === to && actors.includes(actor));

describe('canTransition', () => {
  it('matches the allow-list exactly for every status pair and actor', () => {
    for (const from of ORDER_STATUSES)
      for (const to of ORDER_STATUSES)
        for (const actor of ACTORS) expect([from, to, actor, canTransition(from, to, actor)]).toEqual([from, to, actor, allowed(from, to, actor)]);
  });

  it('never revives a customer-cancelled order through a late authorisation', () => {
    expect(canTransition('payment_failed', 'placed', 'razorpay')).toBe(true);
    expect(canTransition('payment_failed', 'placed', 'razorpay', { customerCancelled: true })).toBe(false);
  });

  it('has no self-transitions and nothing leaves a terminal state', () => {
    for (const s of ORDER_STATUSES) for (const a of ACTORS) expect(canTransition(s, s, a)).toBe(false);
    for (const terminal of ['cancelled', 'rto', 'returned'] as const)
      for (const to of ORDER_STATUSES) for (const a of ACTORS) expect(canTransition(terminal, to, a)).toBe(false);
  });
});
