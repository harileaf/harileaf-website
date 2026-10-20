import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { allowed, json, tooMany } from '../../../lib/store-api';
import { stateCodeFor } from '../../../lib/store/india-states';
import { getSettings } from '../../../lib/store/settings';
import { checkServiceability, couriers, shiprocketConfig } from '../../../lib/store/shiprocket';
import { deliveryWindow, nextDispatch, parseCalendar, parseZones, pickCourier, pincodeInZone } from '../../../lib/store/zones';

export const prerender = false;

/**
 * GET /api/store/pincode?pin=560001&grams=1050&value=69900
 * → { serviceable, cod, etaDays, city, state, stateCode, checked }.
 * `checked: false` means we couldn't ask the courier (not configured / outage):
 * checkout still allows non-perishable orders and confirms delivery afterwards.
 *
 * With `&zone={id}` (a perishable's delivery zone) the answer is that zone's
 * verdict instead: { zone: { name, inZone, courier, etaDays, dispatch, window, city, stateCode } }
 * (one call: checkout skips the general check for a fresh-produce cart).
 */
export const GET: APIRoute = async ({ url, request }) => {
  if (!(await allowed(env, request, 'pincode'))) return tooMany();
  const pin = url.searchParams.get('pin') ?? '';
  if (!/^[1-9]\d{5}$/.test(pin)) return json({ error: 'Enter a 6-digit pincode' }, 400);
  const num = (k: string, d: number) => {
    const n = Number(url.searchParams.get(k));
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  const grams = Math.min(50_000, Math.max(100, num('grams', 1000)));
  // Paise, clamped to a sane order range and bucketed (COD availability can depend on value).
  const value = Math.min(10_000_000, Math.max(10_000, num('value', 10_000)));
  const valueBucket = Math.ceil(Math.log2(value / 10_000));

  const unknown = { serviceable: null, cod: null, etaDays: null, city: null, state: null, stateCode: null, checked: false };
  const cfg = shiprocketConfig(env);
  const settings = await getSettings(env.STORE_DB);

  const zoneId = url.searchParams.get('zone');
  if (zoneId) {
    const zone = parseZones(settings.delivery_zones).find((z) => z.id === zoneId && z.enabled);
    if (!zone) return json({ error: 'Not on sale' }, 404);
    const base = { name: zone.name, maxTransitDays: zone.maxTransitDays, inZone: pincodeInZone(pin, zone), courier: null as boolean | null, etaDays: null as number | null, dispatch: null as string | null, window: null as { from: string; to: string } | null, city: null as string | null, stateCode: null as string | null };
    if (!base.inZone || !cfg || !settings.pickup_pincode) return json({ zone: base });
    try {
      // The courier list is cached briefly (a shopper re-checking a pincode, or many checking the same one);
      // checkout itself always asks Shiprocket afresh, so a stale answer only affects this preview.
      const listKey = `zcour:${settings.pickup_pincode}:${pin}:${Math.ceil(grams / 500)}:${valueBucket}`;
      const hit = await env.HARILEAF_CMS.get(listKey);
      const list: Awaited<ReturnType<typeof couriers>> = hit ? JSON.parse(hit) : await couriers(cfg, { pickup: settings.pickup_pincode, delivery: pin, weightKg: grams / 1000, cod: false, declaredValue: value / 100 });
      if (!hit && list.length) await env.HARILEAF_CMS.put(listKey, JSON.stringify(list), { expirationTtl: 3600 });
      const pick = pickCourier(list, zone);
      const dispatch = pick ? nextDispatch(new Date(), parseCalendar(settings)) : null;
      const place = list.find((c) => c.city && c.state);
      return json({ zone: { ...base, city: place?.city ?? null, stateCode: place?.state ? stateCodeFor(place.state) : null, courier: Boolean(pick), etaDays: pick?.etaDays ?? null, dispatch, window: dispatch && pick ? deliveryWindow(dispatch, pick.etaDays) : null } });
    } catch (err) {
      console.error(JSON.stringify({ msg: 'zone pincode check failed', pin, error: String(err) }));
      return json({ zone: base });
    }
  }

  if (!cfg || !settings.pickup_pincode) return json(unknown);

  const cacheKey = `pin:${pin}:${Math.ceil(grams / 500)}:${valueBucket}`;
  const cached = await env.HARILEAF_CMS.get(cacheKey);
  if (cached) return json(JSON.parse(cached));

  try {
    const s = await checkServiceability(cfg, { pickup: settings.pickup_pincode, delivery: pin, weightKg: grams / 1000, declaredValue: value / 100 });
    const out = { ...s, stateCode: s.state ? stateCodeFor(s.state) : null, checked: true };
    // Only cache positive answers: a transient 'not serviceable' must not stick for 12 h.
    if (s.serviceable) await env.HARILEAF_CMS.put(cacheKey, JSON.stringify(out), { expirationTtl: 12 * 3600 });
    return json(out);
  } catch (err) {
    console.error(JSON.stringify({ msg: 'pincode check failed', pin, error: String(err) }));
    return json(unknown);
  }
};
