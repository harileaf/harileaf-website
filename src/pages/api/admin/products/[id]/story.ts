import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, idParam, isAdmin, json, readJson, unauthorised } from '../../../../../lib/admin-api';
import { saveProductStory } from '../../../../../lib/store/story-pages';

export const prerender = false;

/** Body: { story: ProductStory | null } (null removes the story). The library coerces the story. */
export const PUT: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  if (!id) return json({ error: 'Not found' }, 404);
  const body = (await readJson(request)) as { story?: unknown } | undefined | null;
  if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON' }, 400);
  const res = await saveProductStory(env.STORE_DB, id, body.story ?? null);
  if (!res.ok) return json({ error: 'Not saved', errors: res.errors }, res.errors._ === 'Product not found' ? 404 : 400);
  drainSoon(env, locals);
  return json(Object.keys(res.warnings).length ? { ok: true, id, warnings: res.warnings } : { ok: true, id });
};
