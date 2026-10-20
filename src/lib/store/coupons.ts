/**
 * Discount codes (spec: v2 Features → Coupons). Evaluation is pure and runs
 * only on the server, in every quote and again at checkout. The database
 * enforces the limits when the order batch inserts the redemption (migration
 * 0005), so a quote that said "ok" can still lose a race for the last use;
 * checkout then re-quotes and shows the reason.
 */
import { allocateDiscount } from './gst';
import { formatINR, type Paise } from './money';

export interface CouponRow {
  code: string;
  kind: 'percent' | 'flat';
  value: number;
  max_discount_paise: number | null;
  min_order_paise: number;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  used_count: number;
  one_per_phone: number;
  category_ids: string | null;
  active: number;
  note: string | null;
  first_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CouponFailure = 'not_found' | 'paused' | 'not_started' | 'expired' | 'limit_reached' | 'phone_used' | 'no_eligible_items' | 'below_minimum';

/** A cart line as coupons see it: its value before any discount, and its category. */
export interface CouponLine {
  lineTotal: Paise;
  categoryId: number;
}

export type CouponResult =
  | { ok: true; code: string; discount: Paise; shares: Paise[]; label: string }
  | { ok: false; code: string; reason: CouponFailure; message: string };

const CODE_RE = /^[A-Z0-9]{4,20}$/;

/** "mango 10" → "MANGO10"; null when it can't be a code. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/[\s-]/g, '').toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

const IST_MS = (5 * 60 + 30) * 60_000;
/** Calendar day in IST of an instant ("10 Nov 2026"). */
const istDay = (iso: string) =>
  new Date(Date.parse(iso)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function couponLabel(c: Pick<CouponRow, 'kind' | 'value' | 'max_discount_paise'>): string {
  if (c.kind === 'flat') return `${formatINR(c.value)} off`;
  return `${c.value}% off${c.max_discount_paise ? ` (up to ${formatINR(c.max_discount_paise)})` : ''}`;
}

function categoriesOf(c: CouponRow): number[] | null {
  if (!c.category_ids) return null;
  try {
    const ids = JSON.parse(c.category_ids) as unknown;
    return Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : null;
  } catch {
    return null;
  }
}

export function evaluateCoupon(c: CouponRow | null, code: string, lines: CouponLine[], now: Date, opts: { phoneUsed?: boolean }): CouponResult {
  const fail = (reason: CouponFailure, message: string): CouponResult => ({ ok: false, code, reason, message });
  if (!c) return fail('not_found', 'This code isn’t valid.');
  if (!c.active) return fail('paused', 'This code is no longer active.');
  const at = now.toISOString();
  if (c.starts_at && at < c.starts_at) return fail('not_started', `This code can be used from ${istDay(c.starts_at)}.`);
  // ends_at is exclusive (midnight IST after the last valid day).
  if (c.ends_at && at >= c.ends_at) return fail('expired', `This code expired on ${istDay(new Date(Date.parse(c.ends_at) - 1).toISOString())}.`);
  if (c.usage_limit !== null && c.used_count >= c.usage_limit) return fail('limit_reached', 'This code has been fully used.');
  if (c.one_per_phone && opts.phoneUsed) return fail('phone_used', 'This code has already been used with this mobile number.');

  const cats = categoriesOf(c);
  const eligible = lines.map((l) => l.lineTotal > 0 && (cats === null || cats.includes(l.categoryId)));
  const eligibleTotal = lines.reduce((a, l, i) => a + (eligible[i] ? l.lineTotal : 0), 0);
  if (eligibleTotal === 0) return fail('no_eligible_items', 'This code doesn’t apply to the items in your cart.');
  // The minimum counts only the items the code covers: a rice-only code for ₹2,000 needs ₹2,000 of rice.
  if (eligibleTotal < c.min_order_paise) {
    const short = formatINR(c.min_order_paise - eligibleTotal);
    return fail('below_minimum', cats === null
      ? `Add ${short} more to use this code (minimum order ${formatINR(c.min_order_paise)}).`
      : `Add ${short} more of the items this code covers to use it (minimum ${formatINR(c.min_order_paise)} on those items).`);
  }

  let discount = c.kind === 'percent' ? Math.floor((eligibleTotal * c.value) / 100) : c.value;
  if (c.max_discount_paise !== null) discount = Math.min(discount, c.max_discount_paise);
  discount = Math.min(discount, eligibleTotal);
  const eligibleShares = allocateDiscount(lines.filter((_, i) => eligible[i]).map((l) => l.lineTotal), discount);
  let k = 0;
  const shares = lines.map((_, i) => (eligible[i] ? eligibleShares[k++] : 0));
  return { ok: true, code: c.code, discount, shares, label: couponLabel(c) };
}

// ── admin input ───────────────────────────────────────────────────────────

export interface CouponInput {
  code: string;
  kind: 'percent' | 'flat';
  value: number;
  max_discount_paise: number | null;
  min_order_paise: number;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  one_per_phone: number;
  category_ids: string | null;
  note: string | null;
}

const rupeesToPaise = (v: unknown): number | null => {
  const s = String(v ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
};
const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Midnight IST at the start of a calendar day, as UTC ISO. */
const istMidnight = (day: string, plusDays = 0) => new Date(Date.parse(`${day}T00:00:00Z`) - IST_MS + plusDays * 86400_000).toISOString();
/** The IST calendar day of an instant ("2026-11-01"); for showing stored dates in the admin form. */
export const istDate = (iso: string, minusMs = 0) => new Date(Date.parse(iso) + IST_MS - minusMs).toISOString().slice(0, 10);

/**
 * The admin form: rupees for money, IST calendar days for dates ("valid
 * until" is inclusive, stored as the following midnight).
 */
export function validateCouponInput(raw: Record<string, unknown>, categoryIds: number[]): { ok: true; value: CouponInput } | { ok: false; errors: Record<string, string> } {
  const e: Record<string, string> = {};
  const code = normalizeCode(raw.code);
  if (!code) e.code = 'Use 4–20 letters and digits';
  const kind = raw.kind === 'flat' ? 'flat' : raw.kind === 'percent' ? 'percent' : null;
  if (!kind) e.kind = 'Choose percent or flat';

  let value = 0;
  if (kind === 'percent') {
    value = Number(String(raw.value ?? '').trim());
    if (!Number.isInteger(value) || value < 1 || value > 90) e.value = 'Enter a whole percent from 1 to 90';
  } else if (kind === 'flat') {
    value = rupeesToPaise(raw.value) ?? 0;
    if (value <= 0) e.value = 'Enter the discount in rupees';
  }
  const maxDiscount = kind === 'percent' && !blank(raw.maxDiscount) ? rupeesToPaise(raw.maxDiscount) : null;
  if (kind === 'percent' && !blank(raw.maxDiscount) && !maxDiscount) e.maxDiscount = 'Enter a cap in rupees, or leave it empty';
  const minOrder = blank(raw.minOrder) ? 0 : rupeesToPaise(raw.minOrder);
  if (minOrder === null) e.minOrder = 'Enter an amount in rupees, or leave it empty';
  else if (kind === 'flat' && value > 0 && minOrder <= value) e.minOrder = 'For a flat discount the minimum order must be more than the discount';

  const startsOn = blank(raw.startsOn) ? null : String(raw.startsOn);
  const endsOn = blank(raw.endsOn) ? null : String(raw.endsOn);
  if (startsOn && !DAY_RE.test(startsOn)) e.startsOn = 'Pick a date';
  if (endsOn && !DAY_RE.test(endsOn)) e.endsOn = 'Pick a date';
  if (startsOn && endsOn && !e.startsOn && !e.endsOn && endsOn < startsOn) e.endsOn = 'Must be on or after the start date';

  const usageLimit = blank(raw.usageLimit) ? null : Number(raw.usageLimit);
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) e.usageLimit = 'Enter a whole number, or leave it empty for no limit';

  const cats = Array.isArray(raw.categoryIds) ? raw.categoryIds.map(Number) : [];
  if (cats.some((c) => !categoryIds.includes(c))) e.categoryIds = 'Unknown category';
  const note = blank(raw.note) ? null : String(raw.note).trim().slice(0, 200);

  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    value: {
      code: code!,
      kind: kind!,
      value,
      max_discount_paise: maxDiscount,
      min_order_paise: minOrder!,
      starts_at: startsOn ? istMidnight(startsOn) : null,
      ends_at: endsOn ? istMidnight(endsOn, 1) : null,
      usage_limit: usageLimit,
      one_per_phone: raw.onePerPhone === true ? 1 : 0,
      category_ids: cats.length ? JSON.stringify([...new Set(cats)].sort((a, b) => a - b)) : null,
      note,
    },
  };
}

// ── reads and writes ──────────────────────────────────────────────────────

export const getCoupon = (db: D1Database, code: string) => db.prepare('SELECT * FROM coupons WHERE code = ?').bind(code).first<CouponRow>();

export async function phoneHasUsed(db: D1Database, code: string, phone: string): Promise<boolean> {
  return Boolean(await db.prepare('SELECT 1 AS u FROM coupon_redemptions WHERE coupon_code = ? AND phone = ?').bind(code, phone).first());
}

export async function listCoupons(db: D1Database): Promise<CouponRow[]> {
  return (await db.prepare('SELECT * FROM coupons ORDER BY active DESC, created_at DESC LIMIT 500').all<CouponRow>()).results;
}

export type CouponWrite = { ok: true } | { ok: false; error: string };

export async function createCoupon(db: D1Database, c: CouponInput, now: Date): Promise<CouponWrite> {
  const at = now.toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO coupons (code, kind, value, max_discount_paise, min_order_paise, starts_at, ends_at, usage_limit, one_per_phone, category_ids, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(c.code, c.kind, c.value, c.max_discount_paise, c.min_order_paise, c.starts_at, c.ends_at, c.usage_limit, c.one_per_phone, c.category_ids, c.note, at, at)
      .run();
    return { ok: true };
  } catch (err) {
    if (/UNIQUE|PRIMARY KEY/.test(String(err))) return { ok: false, error: 'A code with this name already exists' };
    throw err;
  }
}

/** Edits the terms of a code that has never been used (the database refuses otherwise). */
export async function updateCoupon(db: D1Database, code: string, c: Omit<CouponInput, 'code'>, now: Date): Promise<CouponWrite> {
  try {
    const res = await db
      .prepare(
        `UPDATE coupons SET kind = ?, value = ?, max_discount_paise = ?, min_order_paise = ?, starts_at = ?, ends_at = ?, usage_limit = ?, one_per_phone = ?,
           category_ids = ?, note = ?, updated_at = ? WHERE code = ?`,
      )
      .bind(c.kind, c.value, c.max_discount_paise, c.min_order_paise, c.starts_at, c.ends_at, c.usage_limit, c.one_per_phone, c.category_ids, c.note, now.toISOString(), code)
      .run();
    return (res.meta.changes ?? 0) > 0 ? { ok: true } : { ok: false, error: 'No such code' };
  } catch (err) {
    if (/frozen/.test(String(err))) return { ok: false, error: 'This code has been used, so its terms can’t change. Pause it and create a new code instead.' };
    throw err;
  }
}

export async function setCouponActive(db: D1Database, code: string, active: boolean, now: Date): Promise<CouponWrite> {
  const res = await db.prepare('UPDATE coupons SET active = ?, updated_at = ? WHERE code = ?').bind(active ? 1 : 0, now.toISOString(), code).run();
  return (res.meta.changes ?? 0) > 0 ? { ok: true } : { ok: false, error: 'No such code' };
}

export interface CouponUse {
  id: number;
  order_no: string;
  status: string;
  payment_status: string;
  discount_paise: number;
  total_paise: number;
  created_at: string;
  counted: number;
}

/** Orders that used a code; `counted` = still holds a use (released when the payment failed). */
export async function couponUsage(db: D1Database, code: string): Promise<CouponUse[]> {
  return (
    await db
      .prepare(
        `SELECT o.id, o.order_no, o.status, o.payment_status, o.discount_paise, o.total_paise, o.created_at,
                EXISTS (SELECT 1 FROM coupon_redemptions r WHERE r.order_id = o.id) AS counted
         FROM orders o WHERE o.coupon_code = ? ORDER BY o.created_at DESC LIMIT 200`,
      )
      .bind(code)
      .all<CouponUse>()
  ).results;
}
