import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, idParam, isAdmin, json, readJson, unauthorised } from '../../../../lib/admin-api';
import { runAdminAction } from '../../../../lib/store/admin-orders';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  const body = await readJson(request);
  if (!id || !body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request' }, 400);
  if (!env.ORDER_TOKEN_SECRET) return json({ error: 'ORDER_TOKEN_SECRET is not set' }, 503);
  const r = await runAdminAction(env.STORE_DB, id, body as Record<string, unknown>, { now: new Date(), actorEmail: locals.adminEmail ?? null, tokenSecret: env.ORDER_TOKEN_SECRET });
  if (!r.ok) return json({ error: r.error }, 409);
  drainSoon(env, locals);
  return json(r);
};
