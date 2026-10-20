import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, idParam, isAdmin, json, readJson, unauthorised } from '../../../../../lib/admin-api';
import { coerceProductInput, coerceVariantInputs, getProductForAdmin, saveProduct } from '../../../../../lib/store/catalog-admin';

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  const data = id ? await getProductForAdmin(env.STORE_DB, id) : null;
  return data ? json(data) : json({ error: 'Not found' }, 404);
};

export const PUT: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  if (!id) return json({ error: 'Not found' }, 404);
  const body = (await readJson(request)) as { product?: unknown; variants?: unknown } | undefined;
  if (!body) return json({ error: 'Invalid JSON' }, 400);
  const res = await saveProduct(env.STORE_DB, id, coerceProductInput(body.product), coerceVariantInputs(body.variants));
  if (!res.ok) return json({ error: 'Not saved', errors: res.errors }, res.errors._ === 'Product not found' ? 404 : 400);
  drainSoon(env, locals);
  return json(res.warnings ? { ok: true, id, warnings: res.warnings } : { ok: true, id });
};
