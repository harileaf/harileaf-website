import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { validateSession } from '../../../lib/auth';
import { listPhotos, addPhoto } from '../../../lib/cms';

export const GET: APIRoute = async ({ cookies }) => {
  const photos = await listPhotos(env.HARILEAF_CMS);
  return new Response(JSON.stringify(photos), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await validateSession(env.HARILEAF_CMS, cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const form = await request.formData();
  const file = form.get('file');
  const label = (form.get('label') as string | null) ?? '';
  const category = ((form.get('category') as string | null) ?? '').trim() || undefined;
  if (!(file instanceof File) || !label.trim()) {
    return new Response(JSON.stringify({ error: 'file and label are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (file.size > 8 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'File exceeds 8 MB limit' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }
  const photo = await addPhoto(env.HARILEAF_CMS, env.HARILEAF_MEDIA, file, label.trim(), category);
  return new Response(JSON.stringify(photo), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
