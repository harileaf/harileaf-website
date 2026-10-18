import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { listActiveProductsWithVariants } from '../../lib/store/catalog';
import { PAGE_CACHE_CONTROL } from '../../lib/store/edge-cache';
import { googleFeedXml } from '../../lib/store/feed';

export const prerender = false;

/** Google Merchant Center product feed (register https://harileaf.org/feeds/google.xml as a scheduled fetch). */
export const GET: APIRoute = async () => {
  const entries = await listActiveProductsWithVariants(env.STORE_DB, new Date());
  const { xml, skipped } = googleFeedXml(entries);
  if (skipped.length) console.log(JSON.stringify({ msg: 'feed skipped products', skipped }));
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': PAGE_CACHE_CONTROL } });
};
