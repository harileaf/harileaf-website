import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, idParam, isAdmin, json, unauthorised } from '../../../../../lib/admin-api';
import { setCertificate } from '../../../../../lib/store/catalog-admin';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!id || !(file instanceof File)) return json({ error: 'Choose a file' }, 400);
  const res = await setCertificate(env.STORE_DB, env.HARILEAF_MEDIA, id, file);
  if (!res.ok) return json({ error: res.error }, 400);
  drainSoon(env, locals);
  return json(res, 201);
};
