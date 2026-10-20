/**
 * Store settings (seller identity, grievance officer, order limits), stored as
 * key/value rows in D1 and edited at /admin/settings. Values are strings;
 * paise amounts are integer strings.
 */
import { validateZones } from './zones';

export const SETTING_KEYS = [
  'gstin', 'legal_name', 'trade_name', 'address', 'state_code', 'fssai_license',
  'customer_care_phone', 'customer_care_email',
  'grievance_officer_name', 'grievance_officer_email', 'grievance_officer_phone',
  'min_order_paise', 'cod_max_order_paise', 'notify_email', 'low_stock_email',
  'pickup_pincode', 'shiprocket_pickup_location', 'cod_confirmation', 'cod_confirm_window_hours',
  'delivery_zones', 'dispatch_days', 'dispatch_blackouts', 'dispatch_cutoff_hour', 'shiprocket_auto_push',
  'google_review_url',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export type StoreSettings = Record<SettingKey, string>;

export const SETTING_DEFAULTS: StoreSettings = {
  gstin: '',
  legal_name: '',
  trade_name: 'HariLeaf',
  address: '',
  state_code: '27', // Maharashtra
  fssai_license: '',
  customer_care_phone: '',
  customer_care_email: '',
  grievance_officer_name: '',
  grievance_officer_email: '',
  grievance_officer_phone: '',
  min_order_paise: '49900', // placeholder until courier rate cards are in (spec)
  cod_max_order_paise: '300000',
  notify_email: '',
  low_stock_email: '',
  pickup_pincode: '',
  shiprocket_pickup_location: '',
  /** 'on': COD orders ship only after the customer or an admin confirms them. */
  cod_confirmation: 'on',
  /** Unconfirmed COD orders are cancelled (stock released) after this many hours; '0' = never. */
  cod_confirm_window_hours: '48',
  /**
   * Perishable delivery zones (zones.ts). Launch default: Mumbai MMR by pincode
   * prefix, air couriers within 2 days, disabled until packaging trials and the
   * zone margin sheet are done (owner to check the prefixes).
   */
  delivery_zones: JSON.stringify([{ id: 'mmr', name: 'Mumbai MMR', pincodes: ['400', '401', '4102', '421'], expressOnly: true, maxTransitDays: 2, enabled: false }]),
  /** Perishables leave the farm Mon–Thu only, so nothing sits in a hub over the weekend. */
  dispatch_days: '1,2,3,4',
  dispatch_blackouts: '',
  dispatch_cutoff_hour: '11',
  /** 'on' (v1): orders go to Shiprocket automatically. 'off': the admin books each courier from the order page. */
  shiprocket_auto_push: 'on',
  /** Google Business Profile "Ask for reviews" link; when set, the delivered email offers it beside the on-site review. */
  google_review_url: '',
};

/** Required before Razorpay KYC / launch (E-Commerce Rules, Legal Metrology, FSSAI). */
const LAUNCH_REQUIRED: SettingKey[] = [
  'legal_name', 'address', 'gstin', 'fssai_license', 'customer_care_phone', 'customer_care_email',
  'grievance_officer_name', 'grievance_officer_email', 'grievance_officer_phone',
  'pickup_pincode',
];

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 15-character GSTIN with the mod-36 check character. */
export function isValidGstin(g: string): boolean {
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === g[14];
}

/** A Google review link: g.page short links, or Google Maps / Search review URLs. */
export function isGoogleReviewUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /^(g\.page|(www\.|search\.)?google\.[a-z.]+|maps\.app\.goo\.gl)$/.test(u.hostname);
  } catch {
    return false;
  }
}

/** Indian phone → 10-digit mobile or 11-digit landline with STD code; null if invalid. */
function normalisePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (/^[6-9]\d{9}$/.test(d)) return d;
  if (/^0\d{10}$/.test(d)) return d;
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_KEYS: SettingKey[] = ['customer_care_email', 'grievance_officer_email', 'notify_email', 'low_stock_email'];
const PHONE_KEYS: SettingKey[] = ['customer_care_phone', 'grievance_officer_phone'];

export type SettingsValidation =
  | { ok: true; value: StoreSettings }
  | { ok: false; errors: Record<string, string> };

/** Validates `input` merged over `current`, so cross-field rules see the final values. */
export function validateSettings(input: Record<string, unknown>, current: StoreSettings): SettingsValidation {
  const errors: Record<string, string> = {};
  const value: StoreSettings = { ...current };

  for (const [key, raw] of Object.entries(input)) {
    if (!(SETTING_KEYS as readonly string[]).includes(key)) {
      errors[key] = 'Unknown setting';
      continue;
    }
    if (typeof raw !== 'string') {
      errors[key] = 'Must be text';
      continue;
    }
    value[key as SettingKey] = raw.trim();
  }

  const set = (k: SettingKey, v: string) => (value[k] = v);
  const fail = (k: SettingKey, msg: string) => (errors[k] ??= msg);

  const LONG: Partial<Record<SettingKey, number>> = { delivery_zones: 20_000, dispatch_blackouts: 4_000 };
  for (const k of SETTING_KEYS) if (value[k].length > (LONG[k] ?? 500)) fail(k, `Too long (max ${LONG[k] ?? 500} characters)`);

  const zones = validateZones(value.delivery_zones);
  if (!zones.ok) fail('delivery_zones', zones.error);
  else set('delivery_zones', JSON.stringify(zones.value));
  const days = value.dispatch_days.split(/[\s,]+/).filter(Boolean);
  // At least one: with none, fresh produce could never be dispatched and the shipping policy would list no days.
  if (!days.length || days.some((d) => !/^[1-7]$/.test(d))) fail('dispatch_days', 'Choose at least one dispatch day');
  else set('dispatch_days', [...new Set(days.map(Number))].sort().join(','));
  const blackouts = value.dispatch_blackouts.split(/[\s,]+/).filter(Boolean);
  if (blackouts.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) fail('dispatch_blackouts', 'Dates as YYYY-MM-DD, separated by commas');
  else set('dispatch_blackouts', [...new Set(blackouts)].sort().join(', '));
  if (!/^\d{1,2}$/.test(value.dispatch_cutoff_hour) || Number(value.dispatch_cutoff_hour) > 23) fail('dispatch_cutoff_hour', 'An hour from 0 to 23 (IST)');

  set('gstin', value.gstin.toUpperCase());
  if (value.gstin && !isValidGstin(value.gstin)) fail('gstin', 'Not a valid GSTIN (check the 15 characters)');

  if (!/^(0[1-9]|[12][0-9]|3[0-8])$/.test(value.state_code)) fail('state_code', 'Use the 2-digit GST state code, e.g. 27');
  if (value.gstin && !errors.gstin && !errors.state_code && value.gstin.slice(0, 2) !== value.state_code)
    fail('gstin', `GSTIN starts with ${value.gstin.slice(0, 2)} but the state code is ${value.state_code}`);

  if (value.google_review_url && !isGoogleReviewUrl(value.google_review_url))
    fail('google_review_url', 'Paste the link from Business Profile → Ask for reviews (https://g.page/r/…)');

  if (value.fssai_license && !/^\d{14}$/.test(value.fssai_license)) fail('fssai_license', 'FSSAI licence numbers have 14 digits');

  for (const k of PHONE_KEYS) {
    if (!value[k]) continue;
    const p = normalisePhone(value[k]);
    if (p) set(k, p);
    else fail(k, 'Use a 10-digit mobile or an STD landline number');
  }

  for (const k of EMAIL_KEYS) {
    set(k, value[k].toLowerCase());
    if (value[k] && !EMAIL.test(value[k])) fail(k, 'Not a valid email address');
  }

  if (value.pickup_pincode && !/^[1-9]\d{5}$/.test(value.pickup_pincode)) fail('pickup_pincode', 'Enter the 6-digit pincode you ship from');
  if (!['on', 'off'].includes(value.cod_confirmation)) fail('cod_confirmation', 'Choose on or off');
  if (!['on', 'off'].includes(value.shiprocket_auto_push)) fail('shiprocket_auto_push', 'Choose on or off');
  if (!/^\d{1,3}$/.test(value.cod_confirm_window_hours) || (Number(value.cod_confirm_window_hours) > 0 && Number(value.cod_confirm_window_hours) < 25))
    fail('cod_confirm_window_hours', 'Enter hours (at least 25, after the 24-hour reminder), or 0 to never cancel');
  if (!/^\d+$/.test(value.min_order_paise)) fail('min_order_paise', 'Enter an amount in rupees');
  if (!/^\d+$/.test(value.cod_max_order_paise) || Number(value.cod_max_order_paise) <= 0)
    fail('cod_max_order_paise', 'Enter a positive amount');

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function missingForLaunch(s: StoreSettings): SettingKey[] {
  return LAUNCH_REQUIRED.filter((k) => !s[k]);
}

export async function getSettings(db: D1Database): Promise<StoreSettings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const out: StoreSettings = { ...SETTING_DEFAULTS };
  for (const { key, value } of results)
    if ((SETTING_KEYS as readonly string[]).includes(key)) out[key as SettingKey] = value;
  return out;
}

export async function putSettings(db: D1Database, value: StoreSettings): Promise<void> {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  await db.batch(SETTING_KEYS.map((k) => stmt.bind(k, value[k])));
}
