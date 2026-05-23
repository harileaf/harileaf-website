import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals }) => {
  const { env } = locals.runtime;
  const key = decodeURIComponent(params.key ?? '');

  if (!key.startsWith('photos/')) {
    return new Response('Not found', { status: 404 });
  }

  const object = await env.HARILEAF_MEDIA.get(key);
  if (!object) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
};
