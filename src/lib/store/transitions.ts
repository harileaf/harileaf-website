/**
 * Order status graph (spec: "Orders and Fulfilment → Status transitions").
 * COD orders are created directly in `placed`; everything after that moves
 * only along these edges. Payment status moves separately.
 */

export const ORDER_STATUSES = [
  'pending_payment', 'payment_failed', 'placed', 'packed', 'shipped', 'delivered', 'cancelled', 'rto', 'returned',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ACTORS = ['customer', 'admin', 'razorpay', 'shiprocket', 'system'] as const;
export type Actor = (typeof ACTORS)[number];

const EDGES: Record<OrderStatus, Partial<Record<OrderStatus, readonly Actor[]>>> = {
  pending_payment: { placed: ['razorpay', 'system'], payment_failed: ['razorpay', 'system'] },
  // Late authorisation after the reservation expired (re-reserve, then capture).
  payment_failed: { placed: ['razorpay', 'system'] },
  placed: { packed: ['admin'], cancelled: ['customer', 'admin'] },
  packed: { shipped: ['shiprocket', 'admin'], cancelled: ['admin'] },
  shipped: { delivered: ['shiprocket', 'admin'], rto: ['shiprocket', 'admin'] },
  delivered: { returned: ['admin'] },
  cancelled: {},
  rto: {},
  returned: {},
};

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: Actor,
  opts: { customerCancelled?: boolean } = {},
): boolean {
  if (from === 'payment_failed' && to === 'placed' && opts.customerCancelled) return false;
  return EDGES[from][to]?.includes(actor) ?? false;
}

/** SQL list of statuses that may move to `to` for `actor`, for use in claim `ok` expressions. */
export function sourcesFor(to: OrderStatus, actor: Actor): OrderStatus[] {
  return ORDER_STATUSES.filter((from) => canTransition(from, to, actor));
}
