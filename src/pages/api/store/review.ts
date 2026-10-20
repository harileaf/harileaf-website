import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { allowed, json, readJson, tooMany } from '../../../lib/store-api';
import { openReviewLink, submitReview, validateReviewInput } from '../../../lib/store/reviews';

export const prerender = false;

/** Body: { orderNo, token, productId, rating, title, body, displayName } from the /review page. */
export const POST: APIRoute = async ({ request }) => {
  if (!(await allowed(env, request, 'review'))) return tooMany();
  const body = await readJson(request);
  if (!body || !env.ORDER_TOKEN_SECRET) return json({ error: 'Invalid request' }, 400);
  const link = await openReviewLink(env.STORE_DB, env.ORDER_TOKEN_SECRET, String(body.orderNo ?? ''), String(body.token ?? ''));
  if (!link) return json({ error: 'This review link doesn’t work. Please use the link in your delivery email.' }, 404);
  const input = validateReviewInput(body);
  if (!input.ok) return json({ error: 'Please check the highlighted fields', errors: input.errors }, 400);
  if (!link.items.some((i) => i.productId === input.value.productId)) return json({ error: 'This product isn’t in your order.' }, 400);
  const r = await submitReview(env.STORE_DB, link.order.id, input.value, new Date());
  return r.ok ? json({ ok: true }, 201) : json({ error: r.message }, 409);
};
