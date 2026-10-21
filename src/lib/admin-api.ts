/** Shared helpers for /api/admin/* routes (Cloudflare Access is enforced in middleware). */
import type { AstroCookies } from 'astro';
import { validateSession } from './auth';
import { OUTBOX_HANDLERS } from './store/handlers';
import { queueBackInStock } from './store/notify';
import { drainLimit, drainOutbox } from './store/outbox';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function isAdmin(env: Env, cookies: AstroCookies): Promise<boolean> {
  return validateSession(env.HARILEAF_CMS, cookies);
}

export const unauthorised = () => json({ error: 'Unauthorised' }, 401);

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** The request body as a plain JSON object, or null for bad JSON, a non-object or an array. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const body = await readJson(request);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export function idParam(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * After a write: queue "notify me" emails if a product just became buyable
 * (a no-op unless requests are waiting), then drain due outbox rows (cache
 * purges, emails) without delaying the response; anything that fails is
 * retried by the cron. OUTBOX_DRAIN_SOON_LIMIT = "0" leaves the drain to the
 * every-minute cron (Workers Free: the request has already used most of its
 * 50 subrequests).
 */
export function drainSoon(env: Env, locals: App.Locals): void {
  const now = new Date();
  const limit = drainLimit(env.OUTBOX_DRAIN_SOON_LIMIT, 10);
  const job = queueBackInStock(env.STORE_DB, now)
    .then(() => (limit > 0 ? drainOutbox(env.STORE_DB, OUTBOX_HANDLERS, { env, now, limit }) : undefined))
    .catch((err) =>
    console.error(JSON.stringify({ msg: 'post-write drain failed', error: String(err) })),
  );
  if (locals.cfContext) locals.cfContext.waitUntil(job);
}
