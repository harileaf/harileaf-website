import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { validateSession } from '../../../lib/auth';
import { getSettings, putSettings, validateSettings } from '../../../lib/store/settings';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ cookies }) => {
  if (!(await validateSession(env.HARILEAF_CMS, cookies))) return json({ error: 'Unauthorised' }, 401);
  return json(await getSettings(env.STORE_DB));
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!(await validateSession(env.HARILEAF_CMS, cookies))) return json({ error: 'Unauthorised' }, 401);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Expected an object' }, 400);

  const result = validateSettings(input as Record<string, unknown>, await getSettings(env.STORE_DB));
  if (!result.ok) return json({ error: 'Invalid settings', errors: result.errors }, 400);
  await putSettings(env.STORE_DB, result.value);
  return json({ ok: true, settings: result.value });
};
