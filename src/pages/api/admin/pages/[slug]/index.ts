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
  // Optional: the draft_saved_at the editor loaded; a different stored one means another tab saved since (409, nothing written).
  const expected = typeof body.expectedSavedAt === 'string' ? body.expectedSavedAt : undefined;
  const res = await saveStoryPageDraft(env.STORE_DB, slug, body.draft, new Date(), expected);
  if (!res.ok && res.conflict) return json({ error: res.errors._ }, 409);
  if (!res.ok) return json({ error: 'Not saved', errors: res.errors }, res.errors._ === 'Page not found' ? 404 : 400);
  return json({ ok: true, savedAt: res.savedAt, ...(Object.keys(res.warnings).length ? { warnings: res.warnings } : {}) });
};
