/**
 * R2 object → Response. Workers' R2 types and the DOM's Response/Headers types
 * describe the same runtime objects but are declared separately, so the one
 * unavoidable cast lives here.
 */
type R2ObjectBody = import('@cloudflare/workers-types/latest').R2ObjectBody;

export function r2Response(object: R2ObjectBody, cacheControl = 'public, max-age=31536000, immutable'): Response {
  const headers = new Headers();
  const meta = object.httpMetadata ?? {};
  if (meta.contentType) headers.set('Content-Type', meta.contentType);
  if (meta.contentDisposition) headers.set('Content-Disposition', meta.contentDisposition);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', cacheControl);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body as unknown as BodyInit, { headers });
}

const PUBLIC_MEDIA_PREFIXES = ['products/', 'lab-reports/', 'certificates/', 'photos/'];

/** Whether an R2 key may be served by the public /media route. */
export function isPublicMediaKey(key: string): boolean {
  return PUBLIC_MEDIA_PREFIXES.some((p) => key.startsWith(p)) && !key.includes('..') && !key.includes('//');
}
