/**
 * Edge caching for public store pages (spec: Rendering and caching).
 *
 * Workers run before Cloudflare's CDN cache, so SSR output is only cached when
 * we store it ourselves in `caches.default` (per data centre). The cache key is
 * the URL with the query string and trailing slash removed, so `?v=SKU`,
 * `utm_*` and `/rice/` vs `/rice` share one entry — pages must therefore never
 * depend on those parameters on the server (variant preselection is done in
 * the browser). Any other query parameter (e.g. `?waitlist=success`, which a
 * page reads server-side) bypasses the cache. Admin writes purge exact keys
 * globally via the Cloudflare API.
 *
 * Keys carry the build id: a deploy replaces the hashed CSS/JS assets, so HTML
 * cached by the previous build must never be served (it would reference files
 * that no longer exist). Old entries simply expire.
 */
import type { OutboxHandler } from './outbox';
import { CATEGORY_SLUGS } from './urls';

const HOSTS = ['harileaf.org', 'www.harileaf.org'];
export const PAGE_TTL_SECONDS = 3600;
export const PAGE_CACHE_CONTROL = `public, max-age=0, s-maxage=${PAGE_TTL_SECONDS}, stale-while-revalidate=60`;

const CACHED_EXACT = new Set(['/shop', '/our-process', '/sitemap-store.xml', '/feeds/google.xml', '/recipes']);

export function normalisePath(pathname: string): string {
  const p = pathname.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/** Paths whose HTML/XML is edge-cached. */
export function isEdgeCacheable(pathname: string): boolean {
  const p = normalisePath(pathname);
  if (CACHED_EXACT.has(p) || p.startsWith('/recipes/')) return true;
  const [, first, second, extra] = p.split('/');
  return (CATEGORY_SLUGS as readonly string[]).includes(first) && extra === undefined && (second === undefined || /^[a-z0-9-]+$/.test(second));
}

/** Query parameters that never change the server-rendered HTML. */
const IGNORED_PARAM = /^(v|utm_[a-z_]+|gclid|gbraid|wbraid|dclid|fbclid|igshid|ttclid|twclid|li_fat_id|msclkid|yclid|mc_[a-z]+|_ga|_gl|gad_source|srsltid|ref)$/i;

export function onlyIgnorableParams(url: URL): boolean {
  for (const key of url.searchParams.keys()) if (!IGNORED_PARAM.test(key)) return false;
  return true;
}

/** Set per build by astro.config (vite define); 'dev' in tests. */
export const BUILD_ID: string = import.meta.env.HL_BUILD_ID ?? 'dev';

/** The Cache API key for an already-normalised absolute page URL. */
export const versionedKey = (pageUrl: string, build = BUILD_ID) => `${pageUrl}?__b=${encodeURIComponent(build)}`;

export function cacheKeyUrl(url: URL, build = BUILD_ID): string {
  return versionedKey(`${url.protocol}//${url.host}${normalisePath(url.pathname)}`, build);
}

/** 200 pages, plus 301s (replaced products) and 410s (discontinued) that crawlers keep requesting. */
const CACHEABLE_STATUS = new Set([200, 301, 410]);

export function shouldStore(res: Response): boolean {
  if (!CACHEABLE_STATUS.has(res.status)) return false;
  if (res.headers.has('Set-Cookie')) return false;
  const cc = res.headers.get('Cache-Control') ?? '';
  return /s-maxage=\d+/.test(cc) && !/no-store|private/.test(cc);
}

/** Wraps a GET render with the Workers Cache API. Other methods pass straight through. */
export async function withEdgeCache(
  request: Request,
  waitUntil: (p: Promise<unknown>) => void,
  render: () => Promise<Response>,
  cache: Cache | undefined = (globalThis as { caches?: { default?: Cache } }).caches?.default,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !cache || !isEdgeCacheable(url.pathname) || !onlyIgnorableParams(url)) return render();
  const key = new Request(cacheKeyUrl(url), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set('X-HL-Cache', 'HIT');
    return res;
  }
  const res = await render();
  if (shouldStore(res)) {
    waitUntil(cache.put(key, res.clone()).catch((err) => console.error(JSON.stringify({ msg: 'cache put failed', error: String(err) }))));
    res.headers.set('X-HL-Cache', 'MISS');
  }
  return res;
}

/** Absolute URLs (both hosts) to purge after a catalog change. */
export function purgeUrls(paths: string[]): string[] {
  const unique = [...new Set(paths.map(normalisePath))];
  return HOSTS.flatMap((h) => unique.map((p) => `https://${h}${p}`));
}

export function productPurgePaths(categorySlug: string, productSlug: string | null): string[] {
  return [
    ...(productSlug ? [`/${categorySlug}/${productSlug}`] : []),
    `/${categorySlug}`,
    '/shop',
    '/sitemap-store.xml',
    '/feeds/google.xml',
  ];
}

const PURGE_BATCH = 30;

/**
 * Outbox handler for `cache.purge` ({ urls: string[] }). Without CF_ZONE_ID /
 * CF_PURGE_API_TOKEN (local dev) it only clears this data centre and logs.
 */
export function makePurgeHandler(fetchImpl: typeof fetch = fetch): OutboxHandler {
  return async (payload: { urls?: unknown }, { env }) => {
    // Payloads hold page URLs; purge this build's keys for them.
    const urls = (Array.isArray(payload.urls) ? payload.urls.filter((u): u is string => typeof u === 'string') : []).map((u) => versionedKey(u));
    if (!urls.length) return;
    const local = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    if (local) await Promise.all(urls.map((u) => local.delete(new Request(u)).catch(() => false)));

    if (!env.CF_ZONE_ID || !env.CF_PURGE_API_TOKEN) {
      console.log(JSON.stringify({ msg: 'cache purge skipped (no CF_ZONE_ID / CF_PURGE_API_TOKEN)', urls: urls.length }));
      return;
    }
    for (let i = 0; i < urls.length; i += PURGE_BATCH) {
      const res = await fetchImpl(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/purge_cache`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CF_PURGE_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: urls.slice(i, i + PURGE_BATCH) }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; errors?: unknown };
      if (!res.ok || body.success !== true) throw new Error(`purge failed: ${res.status} ${JSON.stringify(body.errors ?? body)}`.slice(0, 500));
    }
  };
}
