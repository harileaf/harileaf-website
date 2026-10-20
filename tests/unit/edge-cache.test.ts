import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  PAGE_CACHE_CONTROL, cacheKeyUrl, isEdgeCacheable, makePurgeHandler, productPurgePaths, purgeUrls, shouldStore, withEdgeCache,
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

describe('edge cache', () => {
  it('caches only public catalog pages, keyed by build without query string or trailing slash', () => {
    for (const path of ['/rice/', '/rice/karjat-3', '/shop', '/feeds/google.xml', '/recipes/haldi-doodh']) expect([path, isEdgeCacheable(path)]).toEqual([path, true]);
    for (const path of ['/', '/rice/karjat-3/extra', '/rice/Bad_Slug', '/admin', '/cart', '/checkout', '/api/store/cart/quote']) expect([path, isEdgeCacheable(path)]).toEqual([path, false]);
    expect(cacheKeyUrl(new URL('https://harileaf.org/rice/karjat-3/?v=KJ3-5KG&utm_source=g'))).toBe('https://harileaf.org/rice/karjat-3?__b=dev');
    // A new build never reads the previous build's HTML (it references replaced asset hashes).
    expect(cacheKeyUrl(new URL('https://harileaf.org/rice/karjat-3'), 'b2')).not.toBe(cacheKeyUrl(new URL('https://harileaf.org/rice/karjat-3'), 'b1'));
  });

  it('stores only public 200/301/410 responses without cookies', () => {
    expect(shouldStore(page('x'))).toBe(true);
    // Retired products: crawlers keep asking, so cache the 301 (replacement) and 410 (discontinued) too.
    expect(shouldStore(new Response(null, { status: 301, headers: { Location: '/rice/new', 'Cache-Control': PAGE_CACHE_CONTROL } }))).toBe(true);
    expect(shouldStore(new Response('gone', { status: 410, headers: { 'Cache-Control': PAGE_CACHE_CONTROL } }))).toBe(true);
    expect(shouldStore(new Response('x', { status: 404, headers: { 'Cache-Control': PAGE_CACHE_CONTROL } }))).toBe(false);
    expect(shouldStore(new Response(null, { status: 302, headers: { Location: '/x', 'Cache-Control': PAGE_CACHE_CONTROL } }))).toBe(false);
    expect(shouldStore(page('x', { 'Cache-Control': PAGE_CACHE_CONTROL, 'Set-Cookie': 'a=b' }))).toBe(false);
    expect(shouldStore(page('x', { 'Cache-Control': 'no-store' }))).toBe(false);
  });

  it('renders once, then serves from cache for tracking-only query strings', async () => {
    const cache = new MemCache();
    const waits: Promise<unknown>[] = [];
    let renders = 0;
    const render = async () => page(`render ${++renders}`);
    const first = await withEdgeCache(new Request('https://harileaf.org/rice/karjat-3?v=A'), (p) => waits.push(p), render, cache as unknown as Cache);
    await Promise.all(waits);
    const second = await withEdgeCache(new Request('https://harileaf.org/rice/karjat-3/?utm_source=x&fbclid=y&igshid=a&mc_cid=a&_gl=2'), (p) => waits.push(p), render, cache as unknown as Cache);
    expect([first.headers.get('X-HL-Cache'), await second.text(), second.headers.get('X-HL-Cache'), renders]).toEqual(['MISS', 'render 1', 'HIT', 1]);
  });

  it('bypasses the cache for params a page reads, non-GET requests and uncacheable paths', async () => {
    const cache = new MemCache();
    let renders = 0;
    const render = async () => page(`r${++renders}`);
    for (const req of [new Request('https://harileaf.org/rice?waitlist=success'), new Request('https://harileaf.org/rice?waitlist=success'), new Request('https://harileaf.org/rice', { method: 'POST' }), new Request('https://harileaf.org/checkout')])
      await withEdgeCache(req, () => {}, render, cache as unknown as Cache);
    expect([renders, cache.store.size]).toEqual([4, 0]);
  });
});

describe('purge', () => {
  const row = { id: 1, order_id: null, kind: 'cache.purge', payload: {}, attempts: 1 };
  it('purges both hosts through the Cloudflare API in batches of 100', async () => {
    expect(purgeUrls(productPurgePaths('rice', 'karjat-3'))).toEqual(expect.arrayContaining(['https://harileaf.org/rice/karjat-3', 'https://www.harileaf.org/shop']));
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ success: true, errors: [], result: { id: 'x' } }), { status: 200 });
    }) as unknown as typeof fetch;
    await makePurgeHandler(fake)({ urls: Array.from({ length: 205 }, (_, i) => `https://harileaf.org/p${i}`) }, { env: { ...env, CF_ZONE_ID: 'zone1', CF_PURGE_API_TOKEN: 'tok' } as Env, row });
    expect(calls.map((c) => JSON.parse(c.init.body as string).files.length)).toEqual([100, 100, 5]);
    expect(JSON.parse(calls[0].init.body as string).files[0]).toBe('https://harileaf.org/p0?__b=dev'); // this build's key
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/zones/zone1/purge_cache');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('throws (so the outbox retries) when Cloudflare rejects the purge', async () => {
    const fake = (async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }), { status: 403 })) as unknown as typeof fetch;
    await expect(makePurgeHandler(fake)({ urls: ['https://harileaf.org/rice'] }, { env: { ...env, CF_ZONE_ID: 'z', CF_PURGE_API_TOKEN: 't' } as Env, row })).rejects.toThrow(/purge failed: 403/);
  });
});
