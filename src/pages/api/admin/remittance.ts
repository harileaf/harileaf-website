import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin, json, unauthorised } from '../../../lib/admin-api';
import { importRemittances } from '../../../lib/store/remittance';

export const prerender = false;

const MAX_BYTES = 2 * 1024 * 1024;

/** Body: the remittance report CSV as text. */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const len = Number(request.headers.get('Content-Length') ?? 0);
  if (len > MAX_BYTES) return json({ error: 'File too large (2 MB max)' }, 413);
  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ error: 'File too large (2 MB max)' }, 413);
  const r = await importRemittances(env.STORE_DB, text, new Date());
  return 'error' in r ? json({ error: r.error }, 400) : json(r);
};
