import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

// Serves a photo from R2. The object key (e.g. "photos/1699-mango.png") is passed
// as a query parameter — NOT a path segment — because the key contains a slash.
// Cloudflare's edge URL normalization decodes %2F back to "/" before requests reach
// the Worker, which would split an encoded key across multiple path segments and
// break single-segment dynamic route matching. Query params are left untouched.
export const GET: APIRoute = async ({ url }) => {
  const key = url.searchParams.get('key') ?? '';

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
