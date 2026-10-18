/**
 * Shiprocket order push / cancel (outbox handlers `shiprocket.create`,
 * `shiprocket.cancel`). Creation is idempotent: before creating, we look the
 * order up by our order number (Shiprocket's channel order id), so a retried
 * row never makes a second shipment.
 */
import { istParts } from './fy';
import type { OutboxHandler } from './outbox';
import type { OrderItemRow, OrderRow } from './orders';
import { getSettings } from './settings';
import { ShiprocketError, shiprocketConfig, srCall, type ShiprocketConfig } from './shiprocket';

interface VariantDims { weight_g: number; length_cm: number; breadth_cm: number; height_cm: number }

/** Parcel size: total weight; footprint of the largest box; stacked height. */
export function parcel(items: Array<{ qty: number } & VariantDims>) {
  const weightKg = Math.max(0.1, items.reduce((g, i) => g + i.weight_g * i.qty, 0) / 1000);
  const length = Math.max(...items.map((i) => i.length_cm), 1);
  const breadth = Math.max(...items.map((i) => i.breadth_cm), 1);
  const height = Math.max(1, items.reduce((h, i) => h + i.height_cm * i.qty, 0));
  return { weight: Number(weightKg.toFixed(2)), length, breadth, height };
}

const srDate = (iso: string) => {
  const d = new Date(Date.parse(iso) + 330 * 60_000);
  const { year, month, day } = istParts(new Date(iso));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

export function shiprocketOrderPayload(o: OrderRow, items: Array<OrderItemRow & VariantDims>, pickupLocation: string) {
  const bill = !o.bill_same_as_ship && o.bill_line1;
  const p = parcel(items);
  const [first, ...rest] = o.customer_name.split(' ');
  const cod = o.payment_method === 'cod' && o.total_paise > 0;
  return {
    order_id: o.order_no,
    order_date: srDate(o.created_at),
    pickup_location: pickupLocation,
    billing_customer_name: bill ? (o.bill_name ?? first) : first,
    billing_last_name: bill ? '' : rest.join(' '),
    billing_address: bill ? o.bill_line1 : o.ship_line1,
    billing_address_2: (bill ? o.bill_line2 : o.ship_line2) ?? '',
    billing_city: ((bill ? o.bill_city : o.ship_city) ?? '').slice(0, 30),
    billing_pincode: bill ? o.bill_pincode : o.ship_pincode,
    billing_state: bill ? o.bill_state : o.ship_state,
    billing_country: 'India',
    billing_email: o.email,
    billing_phone: o.phone,
    shipping_is_billing: !bill,
    ...(bill
      ? {
          shipping_customer_name: first,
          shipping_last_name: rest.join(' '),
          shipping_address: o.ship_line1,
          shipping_address_2: o.ship_line2 ?? '',
          shipping_city: o.ship_city.slice(0, 30),
          shipping_pincode: o.ship_pincode,
          shipping_state: o.ship_state,
          shipping_country: 'India',
          shipping_email: o.email,
          shipping_phone: o.phone,
        }
      : {}),
    order_items: items.map((i) => ({
      name: `${i.product_name} ${i.variant_label}`.slice(0, 100),
      sku: i.sku,
      units: i.qty,
      selling_price: (i.unit_price_paise / 100).toFixed(2),
      discount: (i.discount_paise / 100 / i.qty).toFixed(2),
      tax: (i.gst_rate_bp / 100).toFixed(2),
      hsn: i.hsn_code,
    })),
    payment_method: cod ? 'COD' : 'Prepaid',
    sub_total: (o.total_paise / 100).toFixed(2),
    length: p.length,
    breadth: p.breadth,
    height: p.height,
    weight: p.weight,
  };
}

async function findExisting(cfg: ShiprocketConfig, orderNo: string): Promise<{ id: number; shipmentId: number | null } | null> {
  const { status, data } = await srCall<{ data?: Array<{ id: number; channel_order_id: string; shipments?: Array<{ id: number }> }> }>(
    cfg, 'GET', `/orders?filter_by=channel_order_id&filter=${encodeURIComponent(orderNo)}`,
  );
  if (status >= 500) throw new ShiprocketError(status, `Shiprocket order lookup failed (${status})`);
  const hit = (data.data ?? []).find((o) => o.channel_order_id === orderNo);
  return hit ? { id: hit.id, shipmentId: hit.shipments?.[0]?.id ?? null } : null;
}

export function makeShiprocketHandlers(fetchImpl?: typeof fetch): Record<string, OutboxHandler> {
  return {
    'shiprocket.create': async (_payload, { env, row }) => {
      const cfg = shiprocketConfig(env, fetchImpl);
      if (!cfg) throw new Error('Shiprocket is not configured (SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD)');
      const db = env.STORE_DB;
      const o = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(row.order_id).first<OrderRow>();
      if (!o) throw new Error(`order ${row.order_id} not found`);
      if (o.shiprocket_order_id || o.status === 'cancelled') return;
      const settings = await getSettings(db);
      if (!settings.shiprocket_pickup_location) throw new Error('Set the Shiprocket pickup location name in Store settings');
      const save = (id: number, shipmentId: number | null) =>
        db.batch([
          db.prepare('UPDATE orders SET shiprocket_order_id = ?, shiprocket_shipment_id = ?, updated_at = ? WHERE id = ? AND shiprocket_order_id IS NULL').bind(String(id), shipmentId === null ? null : String(shipmentId), new Date().toISOString(), o.id),
          db.prepare("INSERT INTO order_events (order_id, at, type, actor, note) VALUES (?, ?, 'shiprocket_created', 'system', ?)").bind(o.id, new Date().toISOString(), `Shiprocket order ${id}`),
        ]);

      const existing = await findExisting(cfg, o.order_no);
      if (existing) {
        await save(existing.id, existing.shipmentId);
        return;
      }
      const { results: items } = await db
        .prepare('SELECT i.*, v.weight_g, v.length_cm, v.breadth_cm, v.height_cm FROM order_items i JOIN variants v ON v.id = i.variant_id WHERE i.order_id = ? ORDER BY i.id')
        .bind(o.id)
        .all<OrderItemRow & VariantDims>();
      const { status, data } = await srCall<{ order_id?: number; shipment_id?: number; message?: string; errors?: unknown }>(cfg, 'POST', '/orders/create/adhoc', shiprocketOrderPayload(o, items, settings.shiprocket_pickup_location));
      if (status !== 200 || !data.order_id) throw new ShiprocketError(status, `Shiprocket create failed: ${data.message ?? ''} ${JSON.stringify(data.errors ?? '')}`.slice(0, 400));
      await save(data.order_id, data.shipment_id ?? null);
    },

    'shiprocket.cancel': async (payload: { shiprocketOrderId?: string }, { env }) => {
      const cfg = shiprocketConfig(env, fetchImpl);
      if (!cfg) throw new Error('Shiprocket is not configured');
      if (!payload.shiprocketOrderId) return;
      const { status } = await srCall(cfg, 'POST', '/orders/cancel', { ids: [Number(payload.shiprocketOrderId)] });
      if (status !== 200 && status !== 204) throw new ShiprocketError(status, `Shiprocket cancel failed (${status})`);
    },
  };
}
