import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { checkServiceability, type ShiprocketConfig } from '../../src/lib/store/shiprocket';

function cfg(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: Array<{ url: string; auth: string | null }> = [];
  const c: ShiprocketConfig = {
    email: 'api@harileaf.org',
    password: 'pw',
    kv: env.HARILEAF_CMS,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: (init.headers as Record<string, string>)?.Authorization ?? null });
      const r = handler(url, init);
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    }) as unknown as typeof fetch,
  };
  return { c, calls };
}

describe('checkServiceability', () => {
  it('logs in once, caches the token and reports COD, ETA and place', async () => {
    await env.HARILEAF_CMS.delete('shiprocket:token');
    const { c, calls } = cfg((url) => {
      if (url.endsWith('/auth/login')) return { body: { token: 'tok-1' } };
      const cod = new URL(url).searchParams.get('cod') === '1';
      return { body: { status: 200, data: { available_courier_companies: [{ courier_name: 'Delhivery', cod: cod ? 1 : 0, estimated_delivery_days: '4', city: 'Bengaluru', state: 'Karnataka' }, { courier_name: 'Xpress', estimated_delivery_days: '3', city: 'Bengaluru', state: 'Karnataka' }] } } };
    });
    const q = { pickup: '400092', delivery: '560001', weightKg: 1.05, declaredValue: 699 };
    expect(await checkServiceability(c, q)).toEqual({ serviceable: true, cod: true, etaDays: 3, city: 'Bengaluru', state: 'Karnataka' });
    await checkServiceability(c, q);
    expect(calls.filter((x) => x.url.endsWith('/auth/login'))).toHaveLength(1);
    expect(calls.filter((x) => x.url.includes('/serviceability/')).every((x) => x.auth === 'Bearer tok-1')).toBe(true);
    expect(calls[1].url).toContain('pickup_postcode=400092&delivery_postcode=560001&weight=1.05&cod=0');
  });

  it('reports unserviceable pincodes and refreshes an expired token', async () => {
    await env.HARILEAF_CMS.put('shiprocket:token', 'stale');
    let logins = 0;
    const { c } = cfg((url, init) => {
      if (url.endsWith('/auth/login')) return { body: { token: `fresh-${++logins}` } };
      if ((init.headers as Record<string, string>).Authorization === 'Bearer stale') return { status: 401, body: {} };
      return { body: { status: 404, message: 'No courier serviceable' } };
    });
    expect(await checkServiceability(c, { pickup: '400092', delivery: '744301', weightKg: 1, declaredValue: 100 })).toEqual({ serviceable: false, cod: false, etaDays: null, city: null, state: null });
    expect(logins).toBe(1);
  });

  it('throws on Shiprocket outages so callers can fall back', async () => {
    await env.HARILEAF_CMS.put('shiprocket:token', 'ok');
    const { c } = cfg(() => ({ status: 503, body: {} }));
    await expect(checkServiceability(c, { pickup: '400092', delivery: '560001', weightKg: 1, declaredValue: 100 })).rejects.toThrow(/503/);
  });
});
