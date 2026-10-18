/**
 * Admin gate, layer 1 of 2: Cloudflare Access.
 *
 * When CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set, every admin request
 * (see requiresAdminAccess: /admin, /api/admin, /api/auth, Keystatic, and
 * writes to the photo/produce/content APIs) must carry a valid Access JWT (layer 2 is the existing passphrase session,
 * checked by the pages and API routes themselves). When neither is set, admin
 * stays session-only and the dashboard shows a warning. Half-configured fails
 * closed.
 */
import type { APIContext, MiddlewareNext } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { accessDecision, requiresAdminAccess, verifyAccessJwt } from './lib/store/access';
import { withEdgeCache } from './lib/store/edge-cache';

/** Same headers public/_headers gives static assets; SSR responses need them too. */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function withSecurityHeaders(res: Response): Response {
  try {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!res.headers.has(k)) res.headers.set(k, v);
    return res;
  } catch {
    // Immutable headers (e.g. a fetched response): copy into a new Response.
    const copy = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!copy.headers.has(k)) copy.headers.set(k, v);
    return copy;
  }
}

const deny = (status: number, message: string) =>
  new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export const onRequest = defineMiddleware(async (context, next) => withSecurityHeaders(await gate(context, next)));

const gate = async (context: APIContext, next: MiddlewareNext): Promise<Response> => {
  if (!requiresAdminAccess(context.url.pathname, context.request.method)) {
    // Public store pages are cached at the edge (see edge-cache.ts); everything else passes through.
    // Skipped in `astro dev` so edits show up immediately.
    if (import.meta.env.DEV) return next();
    const cf = context.locals.cfContext;
    return withEdgeCache(context.request, (p) => cf?.waitUntil(p), () => next());
  }

  const { env } = await import('cloudflare:workers');
  const decision = accessDecision(env);
  if (decision.mode === 'off') {
    context.locals.accessConfigured = false;
    return next();
  }
  if (decision.mode === 'misconfigured') {
    console.error(JSON.stringify({ msg: 'Cloudflare Access half-configured: set both CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD' }));
    return deny(503, 'Admin is temporarily unavailable.');
  }

  const token = context.request.headers.get('Cf-Access-Jwt-Assertion') ?? context.cookies.get('CF_Authorization')?.value ?? '';
  const identity = token ? await verifyAccessJwt(token, decision.cfg) : null;
  if (!identity) return deny(403, 'Forbidden');

  context.locals.accessConfigured = true;
  context.locals.adminEmail = identity.email;
  return next();
};
