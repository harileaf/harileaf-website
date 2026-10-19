import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { allowed, json, readJson, tooMany } from '../../../../lib/store-api';
import { publicQuote, quoteCart } from '../../../../lib/store/quote';
import { getSettings } from '../../../../lib/store/settings';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson(request);
  // No phone here: "already used with this number" would tell anyone whether a number has
  // ordered. One-per-phone codes are judged at checkout, which is behind Turnstile.
  const quote = await quoteCart(env.STORE_DB, body?.lines, { today: new Date(), settings: await getSettings(env.STORE_DB), coupon: body?.coupon });
  // Guessing codes means many unknown ones: rate-limit those (a valid code re-quoted on
  // every quantity change never counts, so a shopper's applied code is never dropped).
  if (quote.coupon && !quote.coupon.ok && quote.coupon.reason === 'not_found' && !(await allowed(env, request, 'coupon'))) return tooMany();
  return json(publicQuote(quote));
};
