/**
 * Shiprocket tracking statuses → our transitions (research notes: key on
 * `shipment_status_id`, fall back to the status text).
 */
export type CourierAction = 'shipped' | 'delivered' | 'rto' | 'ndr' | 'none';

const BY_ID: Record<number, CourierAction> = {
  6: 'shipped', 17: 'shipped', 18: 'shipped', 19: 'none', 22: 'shipped', 38: 'shipped', 42: 'shipped',
  7: 'delivered',
  9: 'rto', 10: 'rto', 40: 'rto', 41: 'rto', 46: 'rto',
  21: 'ndr',
  8: 'none', 12: 'none', 45: 'none',
};

export function courierAction(statusId: unknown, statusText: unknown): CourierAction {
  const id = Number(statusId);
  if (Number.isInteger(id) && BY_ID[id]) return BY_ID[id];
  const t = String(statusText ?? '').toUpperCase();
  if (/^RTO|RETURN/.test(t)) return 'rto';
  if (/DELIVERED/.test(t) && !/UNDELIVERED/.test(t)) return 'delivered';
  if (/UNDELIVERED|NDR/.test(t)) return 'ndr';
  if (/SHIPPED|PICKED UP|IN TRANSIT|OUT FOR DELIVERY|REACHED/.test(t)) return 'shipped';
  return 'none';
}
