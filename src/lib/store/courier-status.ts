/**
 * Shiprocket tracking statuses → our transitions (research notes: key on
 * `shipment_status_id`, fall back to the status text).
 */
export type CourierAction = 'shipped' | 'delivered' | 'rto' | 'ndr' | 'lost' | 'courier_cancelled' | 'none';

const BY_ID: Record<number, CourierAction> = {
  6: 'shipped', 17: 'shipped', 18: 'shipped', 19: 'none', 22: 'shipped', 38: 'shipped', 42: 'shipped',
  7: 'delivered',
  9: 'rto', 10: 'rto', 40: 'rto', 41: 'rto', 46: 'rto',
  21: 'ndr',
  12: 'lost',
  8: 'courier_cancelled', 45: 'courier_cancelled',
};

export function courierAction(statusId: unknown, statusText: unknown): CourierAction {
  const id = Number(statusId);
  if (Number.isInteger(id) && BY_ID[id]) return BY_ID[id];
  const t = String(statusText ?? '').toUpperCase();
  if (/^RTO|RETURN/.test(t)) return 'rto';
  if (/\bLOST\b/.test(t)) return 'lost';
  if (/^CANCEL/.test(t)) return 'courier_cancelled';
  if (/DELIVERED/.test(t) && !/UNDELIVERED/.test(t)) return 'delivered';
  if (/UNDELIVERED|NDR/.test(t)) return 'ndr';
  if (/SHIPPED|PICKED UP|IN TRANSIT|OUT FOR DELIVERY|REACHED/.test(t)) return 'shipped';
  return 'none';
}

/** Order statuses at or past the point a courier action moves an order to. */
export const REACHED: Record<'shipped' | 'delivered' | 'rto', string[]> = {
  shipped: ['shipped', 'delivered', 'rto', 'returned'],
  delivered: ['delivered', 'returned'],
  rto: ['rto', 'returned'],
};
