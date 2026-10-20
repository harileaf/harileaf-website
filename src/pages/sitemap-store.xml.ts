import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { ARTICLES } from '../content/store/articles';
import { RECIPES } from '../content/store/recipes';
import { listActiveProductsWithVariants } from '../lib/store/catalog';
import { PAGE_CACHE_CONTROL } from '../lib/store/edge-cache';
import { storeSitemapXml } from '../lib/store/feed';
import { listStoryPages } from '../lib/store/story-pages';

export const prerender = false;

export const GET: APIRoute = async () => {
  const entries = await listActiveProductsWithVariants(env.STORE_DB, new Date());
  const latest = (dates: string[]) => dates.sort().pop();
  // publishedAt is null for an unpublished or unreadable page.
  const pages = await listStoryPages(env.STORE_DB);
  const published = (slug: string) => pages.find((p) => p.slug === slug)?.publishedAt?.slice(0, 10);
  const storyExtras = [
    // /rice and /spices always render (story page or legacy); /turmeric only once published.
    { path: '/rice/', lastmod: published('rice') },
    { path: '/spices/', lastmod: published('spices') },
    ...(published('turmeric') ? [{ path: '/turmeric/', lastmod: published('turmeric') }] : []),
  ];
  const xml = storeSitemapXml(entries, [
    ...storyExtras,
    { path: '/produce/' },
    { path: '/our-process/' },
    { path: '/recipes/', lastmod: latest(RECIPES.map((r) => r.updated)) },
    ...RECIPES.map((r) => ({ path: `/recipes/${r.slug}/`, lastmod: r.updated })),
    { path: '/learn/', lastmod: latest(ARTICLES.map((a) => a.updated)) },
    ...ARTICLES.map((a) => ({ path: `/learn/${a.slug}/`, lastmod: a.updated })),
  ]);
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': PAGE_CACHE_CONTROL } });
};
