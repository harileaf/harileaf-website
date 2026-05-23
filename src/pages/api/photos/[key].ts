import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { validateSession } from '../../../lib/auth';
import { deletePhoto } from '../../../lib/cms';

export const DELETE: APIRoute = async ({ params, cookies }) => {
  if (!(await validateSession(env.HARILEAF_CMS, cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const key = decodeURIComponent(params.key ?? '');
  if (!key.startsWith('photos/')) {
    return new Response(JSON.stringify({ error: 'Invalid key' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  await deletePhoto(env.HARILEAF_CMS, env.HARILEAF_MEDIA, key);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
