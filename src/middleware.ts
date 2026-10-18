/**
 * Admin gate, layer 1 of 2: Cloudflare Access.
 *
 * When CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set, every admin request
 * must carry a valid Access JWT (layer 2 is the existing passphrase session,
 * checked by the pages and API routes themselves). When neither is set, admin
 * stays session-only and the dashboard shows a warning. Half-configured fails
 * closed.
 */
import { defineMiddleware } from 'astro:middleware';
import { accessDecision, verifyAccessJwt } from './lib/store/access';

const isAdminPath = (p: string) =>
  p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/admin/') || p === '/api/auth';

const deny = (status: number, message: string) =>
  new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export const onRequest = defineMiddleware(async (context, next) => {
  if (!isAdminPath(context.url.pathname)) return next();

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
});
