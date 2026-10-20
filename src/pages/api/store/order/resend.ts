import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon } from '../../../../lib/admin-api';
import { allowed, json, readJson, tooMany } from '../../../../lib/store-api';
import { nowIso } from '../../../../lib/store/db';
import { viewTokenFor } from '../../../../lib/store/orders';
import { hashViewToken } from '../../../../lib/store/tokens';
import { verifyTurnstile } from '../../../../lib/store/turnstile';

export const prerender = false;

const SAME_ANSWER = { message: 'If that order number and email match an order, we’ve emailed you a new link. It can take a few minutes — check your spam folder too.' };

/** At most 3 link emails per order per day, and a store-wide daily ceiling (the email provider's quota is shared with order emails). */
export const PER_ORDER_PER_DAY = 3;
export const STORE_PER_DAY = 40; // default; override with the ORDER_LINK_DAILY_CAP Worker variable

/**
 * Emails a *new* link to an order and retires the old ones (bumps
 * view_token_rev, so a forwarded or leaked link stops working). Answers the
 * same whether or not the order exists (no probing; the no-match path does
 * the same hashing work); per-IP rate limit, Turnstile when configured, and
 * the caps above.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!(await allowed(env, request, 'resend'))) return tooMany();
  const b = await readJson(request);
  const orderNo = typeof b?.orderNo === 'string' ? b.orderNo.trim().toUpperCase().slice(0, 20) : '';
  const email = typeof b?.email === 'string' ? b.email.trim().toLowerCase().slice(0, 200) : '';
  if (!orderNo || !email) return json({ error: 'Enter your order number and email' }, 400);
  if (!env.ORDER_TOKEN_SECRET) return json({ error: 'Not available right now' }, 503);
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, typeof b?.turnstileToken === 'string' ? b.turnstileToken : null, request.headers.get('CF-Connecting-IP')))) {
    return json({ error: 'Please complete the security check and try again.', code: 'turnstile' }, 403);
  }

  const db = env.STORE_DB;
  const now = new Date();
  const at = nowIso(now);
  const day = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const tenMin = new Date(now.getTime() - 10 * 60_000).toISOString();
  const o = await db
    .prepare(
      `SELECT o.id, o.idempotency_key, o.view_token_rev,
         (SELECT count(*) FROM outbox x WHERE x.order_id = o.id AND x.kind = 'email.order_link' AND x.created_at > ?3) AS today,
         (SELECT count(*) FROM outbox x WHERE x.order_id = o.id AND x.kind = 'email.order_link' AND x.created_at > ?4) AS recent,
         (SELECT count(*) FROM outbox x WHERE x.kind = 'email.order_link' AND x.created_at > ?3) AS store_today
       FROM orders o WHERE o.order_no = ?1 AND lower(o.email) = ?2`,
    )
    .bind(orderNo, email, day, tenMin)
    .first<{ id: number; idempotency_key: string | null; view_token_rev: number; today: number; recent: number; store_today: number }>();

  const rev = (o?.view_token_rev ?? 0) + 1;
  const hash = await hashViewToken(env.ORDER_TOKEN_SECRET, await viewTokenFor(env.ORDER_TOKEN_SECRET, o?.idempotency_key ?? orderNo, rev));
  if (!o || !o.idempotency_key || o.recent > 0 || o.today >= PER_ORDER_PER_DAY) return json(SAME_ANSWER);
  const storeCap = Number(env.ORDER_LINK_DAILY_CAP) > 0 ? Number(env.ORDER_LINK_DAILY_CAP) : STORE_PER_DAY;
  if (o.store_today >= storeCap) {
    console.error(JSON.stringify({ msg: 'order-link emails hit the daily ceiling', order: o.id }));
    return json(SAME_ANSWER);
  }
  await db.batch([
    db.prepare('UPDATE orders SET view_token_rev = ?, view_token_hash = ?, updated_at = ? WHERE id = ? AND view_token_rev = ?').bind(rev, hash, at, o.id, o.view_token_rev),
    db
      .prepare(
        `INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at)
         SELECT id, 'email.order_link', '{}', 'pending', 0, ?2, ?2, ?2 FROM orders WHERE id = ?1 AND view_token_rev = ?3`, // only if our rev bump applied
      )
      .bind(o.id, at, rev),
    db.prepare("INSERT INTO order_events (order_id, at, type, actor, note) SELECT ?1, ?2, 'link_rotated', 'customer', 'New order link emailed; older links no longer work' WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND view_token_rev = ?3)").bind(o.id, at, rev),
  ]);
  drainSoon(env, locals);
  return json(SAME_ANSWER);
};
