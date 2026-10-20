/**
 * Public media from R2: product photos, lab-report PDFs, organic
 * certificates and photo-library photos (already public via /api/photos/image). Only these prefixes are served —
 * nothing else in the bucket (e.g. future invoice exports) is reachable
 * through this route.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { r2Response } from '../../lib/store/r2';

export const prerender = false;

const PUBLIC_PREFIXES = ['products/', 'lab-reports/', 'certificates/', 'photos/'];

export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? '';
  if (!PUBLIC_PREFIXES.some((p) => key.startsWith(p)) || key.includes('..') || key.includes('//')) {
    return new Response('Not found', { status: 404 });
  }
  const object = await env.HARILEAF_MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  return r2Response(object);
};
