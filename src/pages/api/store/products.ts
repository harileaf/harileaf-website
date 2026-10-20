import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json } from '../../../lib/store-api';
import { listProducts } from '../../../lib/store/catalog';

export const prerender = false;

/**
 * Buyable details for products named on prerendered pages (recipes):
 * GET ?slugs=rice/karjat-3,spices/turmeric-powder → { products: [{ key, name, path, fromPrice, availability }] }.
 * Active products only; unknown ones are left out (the page's plain link still works).
 */
export const GET: APIRoute = async ({ url }) => {
  const keys = (url.searchParams.get('slugs') ?? '').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9-]+\/[a-z0-9-]+$/.test(s)).slice(0, 20);
  if (!keys.length) return json({ products: [] });
  const cards = await listProducts(env.STORE_DB, { keys, today: new Date() });
  const products = cards.map((c) => ({ key: `${c.categorySlug}/${c.slug}`, name: c.name, path: c.path, fromPrice: c.fromPrice, availability: c.availability }));
  return json({ products }, 200, { 'Cache-Control': 'public, max-age=300' });
};
