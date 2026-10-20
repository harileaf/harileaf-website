/**
 * Delivery zones and the dispatch calendar for perishables (spec: v2 Features
 * → Perishables and delivery zones).
 *
 * A zone (setting `delivery_zones`, JSON) is a named list of pincodes or
 * pincode prefixes with a transit limit and an express requirement. A
 * perishable product names its zone (`products.delivery_zone = {"zone": id}`)
 * and can be bought only while that zone is enabled, only by pincodes inside
 * it, and only when the courier offers an express service within the limit.
 * Perishables leave the farm only on dispatch days (setting `dispatch_days`,
 * ISO weekdays 1 = Mon … 7 = Sun), before the daily cutoff, never on blackout
 * dates.
 */

export interface Zone {
  id: string;
  name: string;
  /** Full 6-digit pincodes or prefixes (1–5 digits). */
  pincodes: string[];
  /** Only air ("express") couriers, never surface. */
  expressOnly: boolean;
  maxTransitDays: number;
  enabled: boolean;
}

const ZONE_ID = /^[a-z0-9-]{2,24}$/;

/** Validates the admin's zone list; returns the normalised zones. */
export function validateZones(raw: string): { ok: true; value: Zone[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    return { ok: false, error: 'Zones must be valid JSON' };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'Zones must be a list' };
  const out: Zone[] = [];
  for (const [i, z] of parsed.entries()) {
    const r = (z && typeof z === 'object' ? z : {}) as Record<string, unknown>;
    const id = String(r.id ?? '').trim().toLowerCase();
    const name = String(r.name ?? '').trim();
    const pins = (Array.isArray(r.pincodes) ? r.pincodes.map(String) : String(r.pincodes ?? '').split(/[\s,]+/)).map((p) => p.trim()).filter(Boolean);
    const days = Number(r.maxTransitDays);
    const where = `Zone ${i + 1}`;
    if (!ZONE_ID.test(id)) return { ok: false, error: `${where}: id must be 2–24 lowercase letters, digits or dashes` };
    if (out.some((x) => x.id === id)) return { ok: false, error: `${where}: id "${id}" is used twice` };
    if (name.length < 2 || name.length > 60) return { ok: false, error: `${where}: name it (2–60 characters)` };
    if (!pins.length || pins.some((p) => !/^[1-9]\d{0,5}$/.test(p))) return { ok: false, error: `${where}: pincodes must be 6-digit pincodes or 1–5 digit prefixes` };
    if (new Set(pins).size > MAX_ZONE_PINCODES) return { ok: false, error: `${where}: at most ${MAX_ZONE_PINCODES} pincodes or prefixes (Google lists each as a shipping entry) — use prefixes such as 400 to cover a range` };
    if (!Number.isInteger(days) || days < 1 || days > 7) return { ok: false, error: `${where}: max transit days must be 1 to 7` };
    out.push({ id, name, pincodes: [...new Set(pins)], expressOnly: r.expressOnly !== false, maxTransitDays: days, enabled: r.enabled === true });
  }
  return { ok: true, value: out };
}

/** Merchant Center takes at most 100 `g:shipping` entries per item, and the feed writes one per pincode or prefix. */
export const MAX_ZONE_PINCODES = 100;

/** Zones from the stored setting (already validated on save); [] if unreadable. */
export function parseZones(raw: string): Zone[] {
  const v = validateZones(raw);
  return v.ok ? v.value : [];
}

export const pincodeInZone = (pin: string, z: Zone) => z.pincodes.some((p) => pin.startsWith(p));

/** `{"zone":"mmr"}` → "mmr". */
export function zoneIdOf(deliveryZone: string | null): string | null {
  if (!deliveryZone) return null;
  try {
    const v = JSON.parse(deliveryZone) as { zone?: unknown };
    return typeof v?.zone === 'string' ? v.zone : null;
  } catch {
    return null;
  }
}

/** Non-perishables ship everywhere; a perishable needs its zone to exist and be enabled. */
export function sellableZone(p: { perishable: boolean; deliveryZoneId: string | null }, zones: Zone[]): { sellable: boolean; zone: Zone | null } {
  if (!p.perishable) return { sellable: true, zone: null };
  const zone = zones.find((z) => z.id === p.deliveryZoneId && z.enabled) ?? null;
  return { sellable: zone !== null, zone };
}

export interface CourierQuote {
  courier_name?: string;
  estimated_delivery_days?: string | number;
  is_surface?: boolean;
}

/** Fastest courier that meets the zone: air when express-only, ETA within the limit. */
export function pickCourier(list: CourierQuote[], z: Zone): { name: string; etaDays: number } | null {
  const ok = list
    .map((c) => ({ name: c.courier_name ?? 'Courier', etaDays: Number(c.estimated_delivery_days), surface: c.is_surface }))
    .filter((c) => Number.isFinite(c.etaDays) && c.etaDays > 0 && c.etaDays <= z.maxTransitDays && (!z.expressOnly || c.surface === false))
    .sort((a, b) => a.etaDays - b.etaDays);
  return ok[0] ? { name: ok[0].name, etaDays: ok[0].etaDays } : null;
}

// ── dispatch calendar ─────────────────────────────────────────────────────

export interface DispatchCalendar {
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  days: number[];
  /** YYYY-MM-DD (IST). */
  blackouts: string[];
  /** Orders after this hour (IST) dispatch on the next dispatch day. */
  cutoffHour: number;
}

export function parseCalendar(s: { dispatch_days: string; dispatch_blackouts: string; dispatch_cutoff_hour: string }): DispatchCalendar {
  const days = s.dispatch_days.split(/[\s,]+/).map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const blackouts = s.dispatch_blackouts.split(/[\s,]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const cutoff = Number(s.dispatch_cutoff_hour);
  return { days: [...new Set(days)].sort(), blackouts, cutoffHour: Number.isInteger(cutoff) && cutoff >= 0 && cutoff <= 23 ? cutoff : 11 };
}

const IST_MS = 330 * 60_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const isoWeekday = (ymd: string) => ((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** The first dispatch day at or after `now` (IST), honouring the cutoff; null if the calendar has no dispatch days. */
export function nextDispatch(now: Date, cal: DispatchCalendar): string | null {
  if (!cal.days.length) return null;
  const ist = new Date(now.getTime() + IST_MS);
  let day = ist.toISOString().slice(0, 10);
  if (ist.getUTCHours() >= cal.cutoffHour) day = addDays(day, 1);
  for (let i = 0; i < 120; i++, day = addDays(day, 1)) {
    if (cal.days.includes(isoWeekday(day)) && !cal.blackouts.includes(day)) return day;
  }
  return null;
}

/** Delivery between the day after dispatch and dispatch + transit days. */
export function deliveryWindow(dispatchDay: string, transitDays: number): { from: string; to: string } {
  return { from: addDays(dispatchDay, 1), to: addDays(dispatchDay, Math.max(1, transitDays)) };
}

/** "Tue 15 Apr" */
export const shortDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
