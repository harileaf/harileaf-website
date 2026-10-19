import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { allowed, json, readJson, tooMany } from '../../../../lib/store-api';
import { publicQuote, quoteCart } from '../../../../lib/store/quote';
import { getSettings } from '../../../../lib/store/settings';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson(request);
  // Discount codes can be guessed by trying many: rate-limit quotes that carry one.
  if (body?.coupon && !(await allowed(env, request, 'coupon'))) return tooMany();
  // The phone (when the checkout form has one) lets a one-per-phone code say "already used" before submit.
  const phone = typeof body?.phone === 'string' && /^[6-9]\d{9}$/.test(body.phone) ? body.phone : null;
  const quote = await quoteCart(env.STORE_DB, body?.lines, { today: new Date(), settings: await getSettings(env.STORE_DB), coupon: body?.coupon, phone });
  return json(publicQuote(quote));
};
