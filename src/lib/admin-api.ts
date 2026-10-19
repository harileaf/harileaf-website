/** Shared helpers for /api/admin/* routes (Cloudflare Access is enforced in middleware). */
import type { AstroCookies } from 'astro';
import { validateSession } from './auth';
import { OUTBOX_HANDLERS } from './store/handlers';
import { queueBackInStock } from './store/notify';
import { drainOutbox } from './store/outbox';

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

export function idParam(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * After a write: queue "notify me" emails if a product just became buyable
 * (a no-op unless requests are waiting), then drain due outbox rows (cache
 * purges, emails) without delaying the response; anything that fails is
 * retried by the cron.
 */
export function drainSoon(env: Env, locals: App.Locals): void {
  const now = new Date();
  const job = queueBackInStock(env.STORE_DB, now)
    .then(() => drainOutbox(env.STORE_DB, OUTBOX_HANDLERS, { env, now, limit: 10 }))
    .catch((err) =>
    console.error(JSON.stringify({ msg: 'post-write drain failed', error: String(err) })),
  );
  if (locals.cfContext) locals.cfContext.waitUntil(job);
}
