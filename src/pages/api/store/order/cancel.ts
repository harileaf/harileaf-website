import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon } from '../../../../lib/admin-api';
import { allowed, json, readJson, tooMany } from '../../../../lib/store-api';
import { cancelOrder } from '../../../../lib/store/fulfilment';
import { getOrderByNo } from '../../../../lib/store/orders';
import { checkViewToken } from '../../../../lib/store/tokens';

export const prerender = false;

/** Customer self-cancel, allowed until the order is packed (spec: Cancellation). */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!(await allowed(env, request, 'cancel'))) return tooMany();
  const b = await readJson(request);
  const s = (k: string) => (typeof b?.[k] === 'string' ? (b[k] as string) : '');
  if (!b || !env.ORDER_TOKEN_SECRET) return json({ error: 'Invalid request' }, 400);
  const view = await getOrderByNo(env.STORE_DB, s('orderNo'));
  if (!view || !(await checkViewToken(env.ORDER_TOKEN_SECRET, s('token'), view.order.view_token_hash))) return json({ error: 'Order not found' }, 404);
  const r = await cancelOrder(env.STORE_DB, view.order.id, { now: new Date(), actor: 'customer', reason: s('reason') });
  if (!r.ok) return json({ error: r.error }, 409);
  drainSoon(env, locals);
  return json({ status: 'cancelled' });
};
