/**
 * COD confirmation (setting `cod_confirmation`, default on). A cash-on-delivery
 * order ships only after the customer confirms it (button in the order email /
 * on the order page — a POST, so link scanners can't confirm) or an admin does
 * after a call. Unconfirmed orders get one reminder after 24 h and appear on
 * the dashboard; cancelling them stays a human decision.
 */
import { nowIso } from './db';
import { claimStmt, runClaim } from './ops';
import { enqueueStmt } from './outbox';
import type { OrderRow } from './orders';
import type { StoreSettings } from './settings';

export const COD_REMINDER_AFTER_H = 24;

export function needsCodConfirmation(o: Pick<OrderRow, 'payment_method' | 'total_paise' | 'status' | 'cod_confirmed_at'>, s: Pick<StoreSettings, 'cod_confirmation'>): boolean {
  return s.cod_confirmation !== 'off' && o.payment_method === 'cod' && o.total_paise > 0 && o.status === 'placed' && !o.cod_confirmed_at;
}

export async function confirmCod(
  db: D1Database,
  orderId: number,
  ctx: { now: Date; actor: 'customer' | 'admin'; actorEmail?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const at = nowIso(ctx.now);
  const claim = claimStmt(
    db,
    orderId,
    'cod_confirm',
    "SELECT payment_method = 'cod' AND status = 'placed' AND cod_confirmed_at IS NULL FROM orders WHERE id = ?",
    [orderId],
    at,
  );
  const res = await runClaim(db, claim, [
    db.prepare('UPDATE orders SET cod_confirmed_at = ?, updated_at = ? WHERE id = ?').bind(at, at, orderId),
    db.prepare("INSERT INTO order_events (order_id, at, type, actor, actor_email, note) VALUES (?, ?, 'cod_confirmed', ?, ?, ?)").bind(orderId, at, ctx.actor, ctx.actorEmail ?? null, ctx.actor === 'customer' ? 'Confirmed by the customer' : 'Confirmed by phone'),
    enqueueStmt(db, { orderId, kind: 'shiprocket.create', payload: {}, at }),
  ]);
  if (res.ok) return { ok: true };
  if (res.reason === 'other') throw res.error;
  const o = await db.prepare('SELECT status, cod_confirmed_at FROM orders WHERE id = ?').bind(orderId).first<{ status: string; cod_confirmed_at: string | null }>();
  if (o?.cod_confirmed_at) return { ok: true }; // already confirmed (double click / both sides)
  return { ok: false, error: o?.status === 'cancelled' ? 'This order was cancelled' : 'This order no longer needs confirming' };
}

/** Cron: one reminder email per unconfirmed COD order, 24 h after placing it. */
export async function remindUnconfirmedCod(db: D1Database, s: Pick<StoreSettings, 'cod_confirmation'>, now: Date): Promise<number> {
  if (s.cod_confirmation === 'off') return 0;
  const at = nowIso(now);
  const before = new Date(now.getTime() - COD_REMINDER_AFTER_H * 3600_000).toISOString();
  const res = await db
    .prepare(
      `INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at)
       SELECT o.id, 'email.cod_reminder', '{}', 'pending', 0, ?1, ?1, ?1 FROM orders o
       WHERE o.payment_method = 'cod' AND o.status = 'placed' AND o.cod_confirmed_at IS NULL AND o.total_paise > 0 AND o.created_at <= ?2
         AND NOT EXISTS (SELECT 1 FROM outbox x WHERE x.order_id = o.id AND x.kind = 'email.cod_reminder')
       LIMIT 50`,
    )
    .bind(at, before)
    .run();
  return res.meta.changes ?? 0;
}
