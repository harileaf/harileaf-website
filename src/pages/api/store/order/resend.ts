import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon } from '../../../../lib/admin-api';
import { allowed, json, readJson, tooMany } from '../../../../lib/store-api';
import { nowIso } from '../../../../lib/store/db';

export const prerender = false;

const SAME_ANSWER = { message: 'If that order number and email match an order, we’ve emailed you a link. It can take a few minutes — check your spam folder too.' };

/**
 * Emails a fresh link to an order. Answers the same whether or not the order
 * exists (no probing); per-IP rate limit plus at most one email per order per
 * 10 minutes.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!(await allowed(env, request, 'resend'))) return tooMany();
  const b = await readJson(request);
  const orderNo = typeof b?.orderNo === 'string' ? b.orderNo.trim().toUpperCase().slice(0, 20) : '';
  const email = typeof b?.email === 'string' ? b.email.trim().toLowerCase().slice(0, 200) : '';
  if (!orderNo || !email) return json({ error: 'Enter your order number and email' }, 400);
  const at = new Date();
  const recent = new Date(at.getTime() - 10 * 60_000).toISOString();
  await env.STORE_DB.prepare(
    `INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at)
     SELECT o.id, 'email.order_link', '{}', 'pending', 0, ?1, ?1, ?1 FROM orders o
     WHERE o.order_no = ?2 AND lower(o.email) = ?3
       AND NOT EXISTS (SELECT 1 FROM outbox x WHERE x.order_id = o.id AND x.kind = 'email.order_link' AND x.created_at > ?4)`,
  )
    .bind(nowIso(at), orderNo, email, recent)
    .run();
  drainSoon(env, locals);
  return json(SAME_ANSWER);
};
