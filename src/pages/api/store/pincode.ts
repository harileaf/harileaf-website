import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json } from '../../../lib/store-api';
import { stateCodeFor } from '../../../lib/store/india-states';
import { getSettings } from '../../../lib/store/settings';
import { checkServiceability, shiprocketConfig } from '../../../lib/store/shiprocket';

export const prerender = false;

/**
 * GET /api/store/pincode?pin=560001&grams=1050&value=69900
 * → { serviceable, cod, etaDays, city, state, stateCode, checked }.
 * `checked: false` means we couldn't ask the courier (not configured / outage):
 * checkout still allows non-perishable orders and confirms delivery afterwards.
 */
export const GET: APIRoute = async ({ url }) => {
  const pin = url.searchParams.get('pin') ?? '';
  if (!/^[1-9]\d{5}$/.test(pin)) return json({ error: 'Enter a 6-digit pincode' }, 400);
  const grams = Math.min(50_000, Math.max(100, Number(url.searchParams.get('grams')) || 1000));
  const value = Math.max(100, Number(url.searchParams.get('value')) || 10_000);

  const unknown = { serviceable: null, cod: null, etaDays: null, city: null, state: null, stateCode: null, checked: false };
  const cfg = shiprocketConfig(env);
  const settings = await getSettings(env.STORE_DB);
  if (!cfg || !settings.pickup_pincode) return json(unknown);

  const cacheKey = `pin:${pin}:${Math.ceil(grams / 500)}`;
  const cached = await env.HARILEAF_CMS.get(cacheKey);
  if (cached) return json(JSON.parse(cached));

  try {
    const s = await checkServiceability(cfg, { pickup: settings.pickup_pincode, delivery: pin, weightKg: grams / 1000, declaredValue: value / 100 });
    const out = { ...s, stateCode: s.state ? stateCodeFor(s.state) : null, checked: true };
    await env.HARILEAF_CMS.put(cacheKey, JSON.stringify(out), { expirationTtl: 12 * 3600 });
    return json(out);
  } catch (err) {
    console.error(JSON.stringify({ msg: 'pincode check failed', pin, error: String(err) }));
    return json(unknown);
  }
};
