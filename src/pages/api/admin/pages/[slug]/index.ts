import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin, json, readJsonObject, unauthorised } from '../../../../../lib/admin-api';
import { getStoryPageRow, saveStoryPageDraft } from '../../../../../lib/store/story-pages';
import { isStoryPageSlug } from '../../../../../lib/store/urls';

export const prerender = false;

const UNREADABLE = "Couldn't read that request. Reload the page and try again.";

/** GET a landing page's draft and published versions. */
export const GET: APIRoute = async ({ params, cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const slug = params.slug ?? '';
  const row = isStoryPageSlug(slug) ? await getStoryPageRow(env.STORE_DB, slug) : null;
  return row ? json(row) : json({ error: 'Not found' }, 404);
};

/** Save draft: structure only; claims and completeness come back as warnings. A draft is not live, so no purge and no drain. */
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const slug = params.slug ?? '';
  if (!isStoryPageSlug(slug)) return json({ error: 'Not found' }, 404);
  const body = await readJsonObject(request);
  if (!body || !body.draft || typeof body.draft !== 'object' || Array.isArray(body.draft)) return json({ error: UNREADABLE }, 400);
  const res = await saveStoryPageDraft(env.STORE_DB, slug, body.draft);
  if (!res.ok) return json({ error: 'Not saved', errors: res.errors }, res.errors._ === 'Page not found' ? 404 : 400);
  return json(Object.keys(res.warnings).length ? { ok: true, warnings: res.warnings } : { ok: true });
};
