import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, isAdmin, json, readJson, unauthorised } from '../../../../lib/admin-api';
import { coerceProductInput, coerceVariantInputs, listProductsForAdmin, saveProduct } from '../../../../lib/store/catalog-admin';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  return json(await listProductsForAdmin(env.STORE_DB));
};

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const body = (await readJson(request)) as { product?: unknown; variants?: unknown } | undefined;
  if (!body) return json({ error: 'Invalid JSON' }, 400);
  const res = await saveProduct(env.STORE_DB, null, coerceProductInput(body.product), coerceVariantInputs(body.variants));
  if (!res.ok) return json({ error: 'Not saved', errors: res.errors }, 400);
  drainSoon(env, locals);
  return json({ ok: true, id: res.id }, 201);
};
