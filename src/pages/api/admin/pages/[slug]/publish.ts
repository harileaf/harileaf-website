import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, isAdmin, json, unauthorised } from '../../../../../lib/admin-api';
import { publishStoryPage } from '../../../../../lib/store/story-pages';
import { isStoryPageSlug } from '../../../../../lib/store/urls';

export const prerender = false;

/** POST: make the saved draft live after the full checks. */
export const POST: APIRoute = async ({ params, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const slug = params.slug ?? '';
  if (!isStoryPageSlug(slug)) return json({ error: 'Not found' }, 404);
  const res = await publishStoryPage(env.STORE_DB, slug);
  if (!res.ok) return json({ error: 'Not published', errors: res.errors }, res.errors._ === 'Page not found' ? 404 : 400);
  drainSoon(env, locals);
  return json({ ok: true });
};
