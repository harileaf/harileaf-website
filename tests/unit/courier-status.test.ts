import { expect, it } from 'vitest';
import { courierAction } from '../../src/lib/store/courier-status';

it('maps Shiprocket shipment statuses to order transitions', () => {
  expect(courierAction(42, 'PICKED UP')).toBe('shipped');
  expect(courierAction(18, 'IN TRANSIT')).toBe('shipped');
  expect(courierAction(17, 'OUT FOR DELIVERY')).toBe('shipped');
  expect(courierAction(7, 'DELIVERED')).toBe('delivered');
  expect(courierAction(9, 'RTO INITIATED')).toBe('rto');
  expect(courierAction(21, 'UNDELIVERED')).toBe('ndr');
  expect(courierAction(19, 'OUT FOR PICKUP')).toBe('none');
  expect(courierAction(undefined, 'Delivered')).toBe('delivered');
  expect(courierAction(null, 'UNDELIVERED')).toBe('ndr');
  expect(courierAction('x', 'RTO Delivered')).toBe('rto');
  expect(courierAction(999, 'Something new')).toBe('none');
});
