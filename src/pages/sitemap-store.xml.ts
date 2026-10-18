import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { RECIPES } from '../content/store/recipes';
import { listActiveProductsWithVariants } from '../lib/store/catalog';
import { PAGE_CACHE_CONTROL } from '../lib/store/edge-cache';
import { storeSitemapXml } from '../lib/store/feed';

export const prerender = false;

export const GET: APIRoute = async () => {
  const entries = await listActiveProductsWithVariants(env.STORE_DB, new Date());
  const xml = storeSitemapXml(entries, [{ path: '/our-process/' }, { path: '/recipes/' }, ...RECIPES.map((r) => ({ path: `/recipes/${r.slug}/` }))]);
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': PAGE_CACHE_CONTROL } });
};
