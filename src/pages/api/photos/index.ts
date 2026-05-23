import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth';
import { listPhotos, addPhoto } from '../../../lib/cms';

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  const photos = await listPhotos(env.HARILEAF_CMS, env.R2_PUBLIC_BASE ?? '');
  return new Response(JSON.stringify(photos), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const { env } = locals.runtime;
  if (!(await validateSession(env.HARILEAF_CMS, cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const form = await request.formData();
  const file = form.get('file');
  const label = (form.get('label') as string | null) ?? '';
  if (!(file instanceof File) || !label.trim()) {
    return new Response(JSON.stringify({ error: 'file and label are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (file.size > 8 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'File exceeds 8 MB limit' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }
  const photo = await addPhoto(env.HARILEAF_CMS, env.HARILEAF_MEDIA, env.R2_PUBLIC_BASE, file, label.trim());
  return new Response(JSON.stringify(photo), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
