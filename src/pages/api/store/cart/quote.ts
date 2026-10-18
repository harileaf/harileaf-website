import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json, readJson } from '../../../../lib/store-api';
import { publicQuote, quoteCart } from '../../../../lib/store/quote';
import { getSettings } from '../../../../lib/store/settings';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson(request);
  const quote = await quoteCart(env.STORE_DB, body?.lines, { today: new Date(), settings: await getSettings(env.STORE_DB) });
  return json(publicQuote(quote));
};
