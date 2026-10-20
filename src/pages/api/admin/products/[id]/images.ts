import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, idParam, isAdmin, json, readJson, unauthorised } from '../../../../../lib/admin-api';
import { addImage, deleteImage, updateImage } from '../../../../../lib/store/catalog-admin';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  if (!id) return json({ error: 'Not found' }, 404);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return json({ error: 'Choose an image' }, 400);
  const res = await addImage(env.STORE_DB, env.HARILEAF_MEDIA, id, file, String(form?.get('alt') ?? ''));
  if (!res.ok) return json({ error: res.error }, 400);
  drainSoon(env, locals);
  return json(res, 201);
};

export const PATCH: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  const body = (await readJson(request)) as { imageId?: number; alt?: string; sort?: number; kind?: 'photo' | 'infographic' } | undefined;
  if (!id || !body || !Number.isInteger(body.imageId)) return json({ error: 'Invalid request' }, 400);
  const res = await updateImage(env.STORE_DB, id, body.imageId as number, { alt: body.alt, sort: body.sort, kind: body.kind });
  if (!res.ok) return json({ error: res.error }, 400);
  drainSoon(env, locals);
  return json(res);
};

export const DELETE: APIRoute = async ({ params, url, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  const imageId = idParam(url.searchParams.get('imageId') ?? undefined);
  if (!id || !imageId) return json({ error: 'Invalid request' }, 400);
  const res = await deleteImage(env.STORE_DB, env.HARILEAF_MEDIA, id, imageId);
  if (!res.ok) return json({ error: res.error }, 400);
  drainSoon(env, locals);
  return json(res);
};
