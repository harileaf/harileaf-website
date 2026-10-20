import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin, json, unauthorised } from '../../../../lib/admin-api';
import { listStoryPages } from '../../../../lib/store/story-pages';

export const prerender = false;

/** GET the landing pages with their draft/published status. */
export const GET: APIRoute = async ({ cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  return json({ pages: await listStoryPages(env.STORE_DB) });
};
