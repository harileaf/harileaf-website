/**
 * In-admin courier booking (spec: v2 → in-admin courier booking). For a packed
 * order: list the couriers Shiprocket offers for this parcel (rate, ETA, air or
 * surface), assign the AWB with the one the admin picks, request the pickup,
 * then print the label and the manifest. Perishables only see couriers that
 * meet their delivery zone (express, within its transit days), flagged
 * "ship within 24 h".
 *
 * Endpoints (Shiprocket API helpsheet): POST /courier/assign/awb,
 * /courier/generate/pickup, /courier/generate/label, /manifests/generate
 * (falls back to /manifests/print once a manifest exists). Response shapes
 * are re-checked against the live API at launch; errors reach the admin as-is.
 */
import { loadZones } from './catalog';
import { nowIso } from './db';
import type { OrderRow } from './orders';
import { getSettings } from './settings';
import { couriers, shiprocketConfig, srCall, type ShiprocketConfig } from './shiprocket';
import { ensureShiprocketOrder, parcel } from './shiprocket-orders';
import { pickCourier, zoneIdOf, type Zone } from './zones';

export interface CourierOption {
  id: number;
  name: string;
  rate: number | null;
  etaDays: number | null;
  etd: string | null;
  air: boolean;
  /** Perishables: meets the zone (express, within its days). Always true for other goods. */
  meetsZone: boolean;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

async function context(env: Env, orderId: number) {
  const db = env.STORE_DB;
  const o = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<OrderRow>();
  if (!o) return fail('Order not found');
  const cfg = shiprocketConfig(env);
  if (!cfg) return fail('Shiprocket is not configured (SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD)');
  const settings = await getSettings(db);
  if (!settings.pickup_pincode) return fail('Set the pickup pincode in Store settings');
  const { results: items } = await db
    .prepare(
      `SELECT i.qty, i.perishable, v.weight_g, v.length_cm, v.breadth_cm, v.height_cm, p.delivery_zone
       FROM order_items i JOIN variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE i.order_id = ?`,
    )
    .bind(orderId)
    .all<{ qty: number; perishable: number; weight_g: number; length_cm: number; breadth_cm: number; height_cm: number; delivery_zone: string | null }>();
  const zoneIds = new Set(items.filter((i) => i.perishable).map((i) => zoneIdOf(i.delivery_zone)).filter((z): z is string => Boolean(z)));
  const zones: Zone[] = zoneIds.size ? (await loadZones(db)).filter((z) => zoneIds.has(z.id)) : [];
  return { ok: true as const, o, cfg, settings, items, zones, perishable: items.some((i) => i.perishable) };
}

/** Couriers for this order's parcel, cheapest first; perishables only those meeting their zone. */
export async function courierOptions(env: Env, orderId: number): Promise<Result<{ options: CourierOption[]; perishable: boolean }>> {
  const c = await context(env, orderId);
  if (!c.ok) return c;
  const cod = c.o.payment_method === 'cod' && c.o.payment_status !== 'paid';
  let list: Awaited<ReturnType<typeof couriers>>;
  try {
    list = await couriers(c.cfg, { pickup: c.settings.pickup_pincode, delivery: c.o.ship_pincode, weightKg: parcel(c.items).weight, cod, declaredValue: c.o.total_paise / 100 });
  } catch (err) {
    return fail(`Shiprocket didn’t answer: ${String(err)}`);
  }
  const options = (list as Array<Record<string, unknown>>).map((x): CourierOption => {
    // A perishable whose zone is gone (or unreadable) meets nothing: never fall back to any courier.
    const meetsZone = !c.perishable || (c.zones.length > 0 && c.zones.every((z) => pickCourier([x], z) !== null));
    const eta = Number(x.estimated_delivery_days);
    const rate = Number(x.rate ?? x.freight_charge);
    return {
      id: Number(x.courier_company_id),
      name: String(x.courier_name ?? 'Courier'),
      rate: Number.isFinite(rate) ? Math.round(rate * 100) : null,
      etaDays: Number.isFinite(eta) && eta > 0 ? eta : null,
      etd: typeof x.etd === 'string' ? x.etd : null,
      air: x.is_surface === false,
      meetsZone,
    };
  });
  return {
    ok: true,
    value: {
      perishable: c.perishable,
      options: options.filter((x) => Number.isInteger(x.id) && x.id > 0 && x.meetsZone).sort((a, b) => (a.rate ?? Infinity) - (b.rate ?? Infinity)),
    },
  };
}

/**
 * Books the chosen courier: makes sure the Shiprocket order exists, assigns the
 * AWB (Shiprocket refuses a second assignment, and we only fill an empty AWB),
 * then requests the pickup. A pickup failure doesn't undo the AWB: the admin
 * can request it again in Shiprocket.
 */
export async function bookCourier(env: Env, orderId: number, courierId: number, ctx: { now: Date; actorEmail: string | null }): Promise<Result<{ awb: string; courier: string; pickup: string | null }>> {
  const c = await context(env, orderId);
  if (!c.ok) return c;
  const { o, cfg } = c;
  if (o.status !== 'packed') return fail('Mark the order packed (invoice issued) before booking the courier');
  if (o.awb) return fail(`Already booked: AWB ${o.awb} (${o.courier ?? 'courier'})`);
  if (!Number.isInteger(courierId) || courierId <= 0) return fail('Choose a courier');
  const allowed = await courierOptions(env, orderId);
  if (!allowed.ok) return allowed;
  if (!allowed.value.options.some((x) => x.id === courierId)) return fail('That courier can’t take this parcel (or doesn’t meet the fresh-produce delivery limit)');

  const db = env.STORE_DB;
  let sr: { orderId: string; shipmentId: string | null };
  try {
    sr = await ensureShiprocketOrder(db, cfg, o, c.settings.shiprocket_pickup_location);
  } catch (err) {
    return fail(String(err instanceof Error ? err.message : err));
  }
  const { shipmentId } = sr;
  if (!shipmentId) return fail('Shiprocket has no shipment for this order yet — try again in a minute');
  const cancelled = 'The order was cancelled while booking — nothing was booked';
  if ((await db.prepare('SELECT status FROM orders WHERE id = ?').bind(orderId).first<{ status: string }>())?.status !== 'packed') return fail(cancelled);
  const assign = await srCall<{ awb_assign_status?: number; message?: string; response?: { data?: { awb_code?: string; courier_name?: string } } }>(cfg, 'POST', '/courier/assign/awb', {
    shipment_id: Number(shipmentId),
    courier_id: courierId,
  });
  const awb = assign.data.response?.data?.awb_code;
  if (assign.status !== 200 || assign.data.awb_assign_status !== 1 || !awb) return fail(`AWB not assigned: ${assign.data.message ?? assign.status}`);
  const courier = assign.data.response?.data?.courier_name ?? allowed.value.options.find((x) => x.id === courierId)?.name ?? 'Courier';
  const at = nowIso(ctx.now);
  // Only onto a still-packed order: a cancel that landed while Shiprocket answered wins.
  const [saved] = await db.batch([
    db.prepare("UPDATE orders SET awb = ?, courier = ?, tracking_url = COALESCE(tracking_url, ?), updated_at = ? WHERE id = ? AND awb IS NULL AND status = 'packed'").bind(awb, courier, trackingUrlFor(awb), at, orderId),
    db.prepare("INSERT INTO order_events (order_id, at, type, actor, actor_email, note) SELECT ?, ?, 'courier_booked', 'admin', ?, ? WHERE changes() = 1").bind(orderId, at, ctx.actorEmail, `${courier} · AWB ${awb}`),
  ]);
  if (saved.meta.changes !== 1) {
    const now = await db.prepare('SELECT status, awb FROM orders WHERE id = ?').bind(orderId).first<{ status: string; awb: string | null }>();
    if (now?.status !== 'cancelled') return fail(`Not saved: the order is ${now?.status ?? 'missing'}${now?.awb ? ` with AWB ${now.awb}` : ''} — check it in Shiprocket`);
    // The shiprocket.cancel task may have run before the AWB existed: cancel the Shiprocket order again (it drops the AWB).
    await srCall(cfg, 'POST', '/orders/cancel', { ids: [Number(sr.orderId)] });
    return fail(cancelled);
  }
  const pickup = await srCall<{ pickup_status?: number; message?: string; response?: { pickup_scheduled_date?: string } }>(cfg, 'POST', '/courier/generate/pickup', { shipment_id: [Number(shipmentId)] });
  const pickupDate = pickup.data.pickup_status === 1 ? (pickup.data.response?.pickup_scheduled_date ?? 'requested') : null;
  await db
    .prepare("INSERT INTO order_events (order_id, at, type, actor, actor_email, note) VALUES (?, ?, 'pickup_requested', 'admin', ?, ?)")
    .bind(orderId, at, ctx.actorEmail, pickupDate ? `Pickup ${pickupDate}` : `Pickup not scheduled: ${pickup.data.message ?? pickup.status} — request it in Shiprocket`)
    .run();
  return { ok: true, value: { awb, courier, pickup: pickupDate } };
}

/** Shiprocket's public tracking page for an AWB (the customer's "Track" link and shipped email). */
const trackingUrlFor = (awb: string) => `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;

async function shipmentOf(env: Env, orderId: number): Promise<Result<{ cfg: ShiprocketConfig; shipmentId: number; srOrderId: number }>> {
  const o = await env.STORE_DB.prepare('SELECT awb, shiprocket_order_id, shiprocket_shipment_id FROM orders WHERE id = ?').bind(orderId).first<{ awb: string | null; shiprocket_order_id: string | null; shiprocket_shipment_id: string | null }>();
  const cfg = shiprocketConfig(env);
  if (!cfg) return fail('Shiprocket is not configured');
  if (!o?.awb || !o.shiprocket_shipment_id || !o.shiprocket_order_id) return fail('Book the courier first');
  return { ok: true, value: { cfg, shipmentId: Number(o.shiprocket_shipment_id), srOrderId: Number(o.shiprocket_order_id) } };
}

/** The shipping label (PDF URL hosted by Shiprocket). */
export async function labelUrl(env: Env, orderId: number): Promise<Result<string>> {
  const s = await shipmentOf(env, orderId);
  if (!s.ok) return s;
  const r = await srCall<{ label_created?: number; label_url?: string; response?: string }>(s.value.cfg, 'POST', '/courier/generate/label', { shipment_id: [s.value.shipmentId] });
  return r.data.label_url ? { ok: true, value: r.data.label_url } : fail(`No label: ${r.data.response ?? r.status}`);
}

/** The pickup manifest (generated once; later requests print the existing one). */
export async function manifestUrl(env: Env, orderId: number): Promise<Result<string>> {
  const s = await shipmentOf(env, orderId);
  if (!s.ok) return s;
  const gen = await srCall<{ manifest_url?: string; message?: string }>(s.value.cfg, 'POST', '/manifests/generate', { shipment_id: [s.value.shipmentId] });
  if (gen.data.manifest_url) return { ok: true, value: gen.data.manifest_url };
  const print = await srCall<{ manifest_url?: string; message?: string }>(s.value.cfg, 'POST', '/manifests/print', { order_ids: [s.value.srOrderId] });
  return print.data.manifest_url ? { ok: true, value: print.data.manifest_url } : fail(`No manifest: ${print.data.message ?? gen.data.message ?? print.status}`);
}
