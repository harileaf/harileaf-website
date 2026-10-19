/** Validation of the checkout form (contact, delivery and billing address, payment method). */
import { isStateCode, stateName } from './india-states';
import { isValidGstin } from './settings';

export interface Address {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  stateCode: string;
  state: string;
  pincode: string;
}

export interface CheckoutInput {
  contact: { name: string; email: string; phone: string; marketingOptIn: boolean };
  ship: Address;
  bill: Address | null; // null = same as shipping
  buyerGstin: string | null;
  buyerLegalName: string | null;
  paymentMethod: 'razorpay' | 'cod';
}

export type CheckoutErrors = Record<string, string>;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function address(raw: unknown, prefix: string, e: CheckoutErrors, nameFallback: string): Address {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const a: Address = {
    name: str(r.name) || nameFallback,
    line1: str(r.line1),
    line2: str(r.line2) || null,
    city: str(r.city),
    stateCode: str(r.stateCode),
    state: '',
    pincode: str(r.pincode).replace(/\s/g, ''),
  };
  if (a.line1.length < 3 || a.line1.length > 120) e[`${prefix}.line1`] = 'Enter the house / building and street (up to 120 characters)';
  if (a.line2 && a.line2.length > 120) e[`${prefix}.line2`] = 'Up to 120 characters';
  if (a.city.length < 2 || a.city.length > 30) e[`${prefix}.city`] = 'Enter the city (up to 30 characters)';
  if (!isStateCode(a.stateCode)) e[`${prefix}.stateCode`] = 'Choose the state';
  else a.state = stateName(a.stateCode) ?? '';
  if (!/^[1-9]\d{5}$/.test(a.pincode)) e[`${prefix}.pincode`] = 'Enter a 6-digit pincode';
  if (a.name.length < 2 || a.name.length > 80) e[`${prefix}.name`] = 'Enter the full name';
  return a;
}

export function validateCheckoutInput(raw: unknown): { ok: true; value: CheckoutInput } | { ok: false; errors: CheckoutErrors } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c = (r.contact && typeof r.contact === 'object' ? r.contact : {}) as Record<string, unknown>;
  const e: CheckoutErrors = {};

  const name = str(c.name);
  const email = str(c.email).toLowerCase();
  let phone = str(c.phone).replace(/\D/g, '');
  if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
  if (phone.length === 11 && phone.startsWith('0')) phone = phone.slice(1);
  if (name.length < 2 || name.length > 80) e['contact.name'] = 'Enter your full name';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) e['contact.email'] = 'Enter a valid email address';
  if (!/^[6-9]\d{9}$/.test(phone)) e['contact.phone'] = 'Enter a 10-digit Indian mobile number';

  const ship = address(r.ship, 'ship', e, name);
  const sameBilling = r.billSameAsShip !== false;
  const bill = sameBilling ? null : address(r.bill, 'bill', e, name);

  const gstinRaw = str(r.buyerGstin).toUpperCase();
  const buyerGstin = gstinRaw || null;
  if (buyerGstin && !isValidGstin(buyerGstin)) e.buyerGstin = 'Not a valid GSTIN';
  const buyerLegalName = str(r.buyerLegalName) || null;
  if (buyerGstin && !buyerLegalName) e.buyerLegalName = 'Enter the business name registered with this GSTIN';
  const billState = bill?.stateCode ?? ship.stateCode;
  if (buyerGstin && !e.buyerGstin && billState && buyerGstin.slice(0, 2) !== billState)
    e.buyerGstin = sameBilling ? 'This GSTIN is registered in another state — add the billing address registered with it' : 'The GSTIN doesn’t match the billing state';

  const paymentMethod = r.paymentMethod === 'cod' ? 'cod' : r.paymentMethod === 'razorpay' ? 'razorpay' : null;
  if (!paymentMethod) e.paymentMethod = 'Choose how you want to pay';

  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    value: {
      contact: { name, email, phone, marketingOptIn: c.marketingOptIn === true },
      ship,
      bill,
      buyerGstin,
      buyerLegalName,
      paymentMethod: paymentMethod as 'razorpay' | 'cod',
    },
  };
}

export const isIdempotencyKey = (k: string | null): k is string => !!k && /^[A-Za-z0-9-]{16,64}$/.test(k);

/**
 * Place of supply for GST. Goods go to the delivery state, except B2B orders
 * billed to a registered buyer and shipped elsewhere on their instruction,
 * where it is the buyer's (billing) state — IGST Act s.10(1)(b).
 */
export function placeOfSupplyCode(c: Pick<CheckoutInput, 'ship' | 'bill' | 'buyerGstin'>): string {
  return c.buyerGstin && c.bill ? c.bill.stateCode : c.ship.stateCode;
}

/** What an idempotency key was used for: cart lines + email (+ discount code, when one is applied). */
export async function checkoutFingerprint(lines: unknown, email: unknown, coupon?: unknown): Promise<string> {
  const norm = (Array.isArray(lines) ? lines : [])
    .map((l) => `${Number((l as { variantId?: unknown })?.variantId)}x${Math.trunc(Number((l as { qty?: unknown })?.qty))}`)
    .sort()
    .join(',');
  const code = typeof coupon === 'string' && coupon.trim() ? `|${coupon.replace(/[\s-]/g, '').toUpperCase()}` : '';
  const data = new TextEncoder().encode(`${norm}|${String(email ?? '').trim().toLowerCase()}${code}`);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
