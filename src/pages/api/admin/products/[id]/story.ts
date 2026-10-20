import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, idParam, isAdmin, json, readJsonObject, unauthorised } from '../../../../../lib/admin-api';
import { saveProductStory } from '../../../../../lib/store/story-pages';

export const prerender = false;

const UNREADABLE = "Couldn't read that request. Reload the page and try again.";

/** PUT a product's story. Body: { story: ProductStory | null } (null removes the story). The library coerces the story. */
export const PUT: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  if (!id) return json({ error: 'Not found' }, 404);
  // Removal must be an explicit {"story": null}; an empty or malformed body never wipes the story.
  const body = await readJsonObject(request);
  if (!body || !('story' in body)) return json({ error: UNREADABLE }, 400);
  const res = await saveProductStory(env.STORE_DB, id, body.story);
  if (!res.ok) return json({ error: 'Not saved', errors: res.errors }, res.errors._ === 'Product not found' ? 404 : 400);
  drainSoon(env, locals);
  return json(Object.keys(res.warnings).length ? { ok: true, id, warnings: res.warnings } : { ok: true, id });
};
