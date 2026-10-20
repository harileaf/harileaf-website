import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, idParam, isAdmin, json, readJson, unauthorised } from '../../../../lib/admin-api';
import { REJECT_REASONS, moderateReview, type ModerationAction, type RejectReason } from '../../../../lib/store/reviews';

export const prerender = false;

/** Body: { action: 'approve' } | { action: 'reject', reason } | { action: 'withdraw' } (reviewer's request). */
export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  const body = (await readJson(request)) as { action?: unknown; reason?: unknown } | undefined;
  let m: ModerationAction | null = null;
  if (body?.action === 'approve' || body?.action === 'withdraw') m = { action: body.action };
  else if (body?.action === 'reject' && typeof body.reason === 'string' && body.reason in REJECT_REASONS) m = { action: 'reject', reason: body.reason as RejectReason };
  if (!id || !m) return json({ error: 'Invalid request' }, 400);
  const r = await moderateReview(env.STORE_DB, id, m, { now: new Date(), actorEmail: locals.adminEmail ?? null });
  if (r.ok) drainSoon(env, locals); // purge the product page now
  return r.ok ? json({ ok: true }) : json({ error: r.error }, 409);
};
