/**
 * Settings for public policy pages. These pages must render even before the
 * store database exists (or if D1 has a hiccup), so failures fall back to
 * defaults; empty values render as "Being updated".
 */
import { formatINR } from './money';
import { SETTING_DEFAULTS, getSettings, type StoreSettings } from './settings';

export const PENDING = 'Being updated';

export async function loadPolicySettings(db: D1Database | undefined): Promise<StoreSettings> {
  if (!db) return SETTING_DEFAULTS;
  try {
    return await getSettings(db);
  } catch (err) {
    console.error(JSON.stringify({ msg: 'policy settings load failed', error: String(err) }));
    return SETTING_DEFAULTS;
  }
}

export const orPending = (v: string) => (v.trim() ? v : PENDING);

export function rupeesSetting(paise: string): string {
  return /^\d+$/.test(paise) ? formatINR(Number(paise)) : PENDING;
}

/** Human-readable 10-digit mobile / STD landline. */
export function displayPhone(p: string): string {
  if (/^[6-9]\d{9}$/.test(p)) return `+91 ${p.slice(0, 5)} ${p.slice(5)}`;
  if (/^0\d{10}$/.test(p)) return `${p.slice(0, 3)} ${p.slice(3)}`;
  return orPending(p);
}

/** tel: link for a phone setting (mobile or STD landline), so it can be tapped on a phone. */
export function phoneHref(p: string): string | undefined {
  if (/^[6-9]\d{9}$/.test(p)) return `tel:+91${p}`;
  if (/^0\d{10}$/.test(p)) return `tel:+91${p.slice(1)}`;
  return undefined;
}

export const POLICY_CACHE = 'public, max-age=0, s-maxage=600';
