import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json } from '../../../lib/store-api';
import { publishedReviews } from '../../../lib/store/reviews';

export const prerender = false;

/** "Show more reviews" on a product page: GET ?product={id}&offset={n}. Approved reviews only. */
export const GET: APIRoute = async ({ url }) => {
  const product = Number(url.searchParams.get('product'));
  const offset = Number(url.searchParams.get('offset') ?? 0);
  if (!Number.isInteger(product) || product <= 0 || !Number.isInteger(offset) || offset < 0 || offset > 10_000) return json({ error: 'Invalid request' }, 400);
  const reviews = await publishedReviews(env.STORE_DB, product, { offset });
  return json({ reviews: reviews.map(({ id: _id, ...r }) => r) }, 200, { 'Cache-Control': 'public, max-age=300' });
};
