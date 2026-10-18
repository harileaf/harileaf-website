import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  PAGE_CACHE_CONTROL, cacheKeyUrl, isEdgeCacheable, makePurgeHandler, normalisePath, productPurgePaths, purgeUrls, shouldStore, withEdgeCache,
} from '../../src/lib/store/edge-cache';

class MemCache {
  store = new Map<string, Response>();
  async match(req: Request) {
    const r = this.store.get(req.url);
    return r ? r.clone() : undefined;
  }
  async put(req: Request, res: Response) {
    this.store.set(req.url, res.clone());
  }
  async delete(req: Request) {
    return this.store.delete(req.url);
  }
}

const page = (body: string, headers: Record<string, string> = { 'Cache-Control': PAGE_CACHE_CONTROL }) =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'text/html', ...headers } });

describe('cacheable paths and keys', () => {
  it.each([
    ['/rice', true], ['/rice/', true], ['/rice/karjat-3', true], ['/spices/turmeric/', true], ['/produce', true],
    ['/shop', true], ['/feeds/google.xml', true], ['/sitemap-store.xml', true], ['/recipes/haldi-doodh', true], ['/our-process/', true],
    ['/rice/karjat-3/extra', false], ['/admin', false], ['/cart', false], ['/checkout', false], ['/api/store/cart/quote', false], ['/', false],
    ['/rice/Bad_Slug', false],
  ])('%s → %s', (path, expected) => {
    expect(isEdgeCacheable(path)).toBe(expected);
  });

  it('drops the query string and trailing slash from the key', () => {
    expect(cacheKeyUrl(new URL('https://harileaf.org/rice/karjat-3/?v=KJ3-5KG&utm_source=g'))).toBe('https://harileaf.org/rice/karjat-3');
    expect(normalisePath('/')).toBe('/');
  });

  it('stores only public 200 responses without cookies', () => {
    expect(shouldStore(page('x'))).toBe(true);
    expect(shouldStore(new Response('x', { status: 404, headers: { 'Cache-Control': PAGE_CACHE_CONTROL } }))).toBe(false);
    expect(shouldStore(page('x', { 'Cache-Control': PAGE_CACHE_CONTROL, 'Set-Cookie': 'a=b' }))).toBe(false);
    expect(shouldStore(page('x', { 'Cache-Control': 'no-store' }))).toBe(false);
    expect(shouldStore(page('x', {}))).toBe(false);
  });
});

describe('withEdgeCache', () => {
  it('renders once, then serves from cache for any query string', async () => {
    const cache = new MemCache();
    const waits: Promise<unknown>[] = [];
    let renders = 0;
    const render = async () => page(`render ${++renders}`);
    const first = await withEdgeCache(new Request('https://harileaf.org/rice/karjat-3?v=A'), (p) => waits.push(p), render, cache as unknown as Cache);
    await Promise.all(waits);
    const second = await withEdgeCache(new Request('https://harileaf.org/rice/karjat-3/?utm=x'), (p) => waits.push(p), render, cache as unknown as Cache);
    expect(await first.text()).toBe('render 1');
    expect(first.headers.get('X-HL-Cache')).toBe('MISS');
    expect(await second.text()).toBe('render 1');
    expect(second.headers.get('X-HL-Cache')).toBe('HIT');
    expect(renders).toBe(1);
  });

  it('never caches non-GET requests or uncacheable paths', async () => {
    const cache = new MemCache();
    let renders = 0;
    const render = async () => page(`r${++renders}`);
    await withEdgeCache(new Request('https://harileaf.org/rice', { method: 'POST' }), () => {}, render, cache as unknown as Cache);
    await withEdgeCache(new Request('https://harileaf.org/checkout'), () => {}, render, cache as unknown as Cache);
    expect(cache.store.size).toBe(0);
    expect(renders).toBe(2);
  });
});

describe('purge', () => {
  it('builds absolute URLs for both hosts', () => {
    expect(purgeUrls(productPurgePaths('rice', 'karjat-3'))).toEqual([
      'https://harileaf.org/rice/karjat-3', 'https://harileaf.org/rice', 'https://harileaf.org/shop',
      'https://harileaf.org/sitemap-store.xml', 'https://harileaf.org/feeds/google.xml',
      'https://www.harileaf.org/rice/karjat-3', 'https://www.harileaf.org/rice', 'https://www.harileaf.org/shop',
      'https://www.harileaf.org/sitemap-store.xml', 'https://www.harileaf.org/feeds/google.xml',
    ]);
  });

  it('calls the Cloudflare purge API in batches of 30 with the zone token', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ success: true, errors: [], result: { id: 'x' } }), { status: 200 });
    }) as unknown as typeof fetch;
    const urls = Array.from({ length: 65 }, (_, i) => `https://harileaf.org/p${i}`);
    const handler = makePurgeHandler(fake);
    await handler({ urls }, { env: { ...env, CF_ZONE_ID: 'zone1', CF_PURGE_API_TOKEN: 'tok' } as Env, row: { id: 1, order_id: null, kind: 'cache.purge', payload: {}, attempts: 1 } });
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/zones/zone1/purge_cache');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(calls[2].init.body as string).files).toHaveLength(5);
  });

  it('throws (so the outbox retries) when Cloudflare rejects the purge', async () => {
    const fake = (async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }), { status: 403 })) as unknown as typeof fetch;
    await expect(
      makePurgeHandler(fake)({ urls: ['https://harileaf.org/rice'] }, { env: { ...env, CF_ZONE_ID: 'z', CF_PURGE_API_TOKEN: 't' } as Env, row: { id: 1, order_id: null, kind: 'cache.purge', payload: {}, attempts: 1 } }),
    ).rejects.toThrow(/purge failed: 403/);
  });

  it('skips the API (local dev) when the zone or token is missing', async () => {
    let called = false;
    const fake = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    await makePurgeHandler(fake)({ urls: ['https://harileaf.org/rice'] }, { env: { ...env, CF_ZONE_ID: undefined, CF_PURGE_API_TOKEN: undefined } as Env, row: { id: 1, order_id: null, kind: 'cache.purge', payload: {}, attempts: 1 } });
    expect(called).toBe(false);
  });
});
