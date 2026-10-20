import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon } from '../../../../lib/admin-api';
import { allowed, json, readJson, tooMany } from '../../../../lib/store-api';
import { confirmCod } from '../../../../lib/store/cod';
import { getOrderByNo } from '../../../../lib/store/orders';
import { checkViewToken } from '../../../../lib/store/tokens';

export const prerender = false;

/** The customer confirms their COD order (POST only: email link scanners must not confirm). */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!(await allowed(env, request, 'confirm'))) return tooMany();
  const b = await readJson(request);
  const s = (k: string) => (typeof b?.[k] === 'string' ? (b[k] as string) : '');
  if (!b || !env.ORDER_TOKEN_SECRET) return json({ error: 'Invalid request' }, 400);
  const view = await getOrderByNo(env.STORE_DB, s('orderNo'));
  if (!view || !(await checkViewToken(env.ORDER_TOKEN_SECRET, s('token'), view.order.view_token_hash))) return json({ error: 'Order not found' }, 404);
  const r = await confirmCod(env.STORE_DB, view.order.id, { now: new Date(), actor: 'customer' });
  if (!r.ok) return json({ error: r.error }, 409);
  drainSoon(env, locals);
  return json({ status: 'confirmed' });
};
