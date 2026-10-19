/**
 * "Notify me" (spec: v2 Features → Notify me). A shopper leaves an email for a
 * product nobody can buy right now; when any pack becomes buyable or
 * pre-orderable, each waiting request gets one email, then its address is
 * deleted by the retention job.
 *
 * Exactly once: `queueBackInStock` inserts the outbox rows and stamps
 * `queued_at` in one batch (one transaction), selecting only rows whose
 * `queued_at` is still NULL, so overlapping runs can't queue a request twice.
 * The email handler sends with a per-request idempotency key and then sets
 * `notified_at`. Availability changes both on admin saves and on the calendar
 * (a season opening), so this runs on the cron and right after admin saves.
 */
import { listActiveProductsWithVariants } from './catalog';
import { nowIso } from './db';
import { sendEmail, type Email } from './email';
import type { OutboxHandler } from './outbox';
import { getSettings, type StoreSettings } from './settings';
import { absolute } from './urls';

export const NOTIFY_RETENTION_MONTHS = 12;

export function normaliseEmail(raw: unknown): string | null {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : null;
}

/** Products that can't be bought now (every pack sold out or out of season) take sign-ups. */
export async function acceptsNotify(db: D1Database, productId: number, today: Date): Promise<boolean> {
  const all = await listActiveProductsWithVariants(db, today);
  const hit = all.find((x) => x.product.id === productId);
  return Boolean(hit && !hit.variants.some((v) => v.availability === 'buy' || v.availability === 'preorder'));
}

/**
 * Stores a request. A duplicate is a no-op; signing up again after an earlier
 * notification starts a fresh request. Callers answer the same either way.
 */
export async function signUp(db: D1Database, productId: number, email: string, now: Date): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notify_requests (product_id, email, created_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (product_id, email) DO UPDATE SET created_at = ?3, queued_at = NULL, notified_at = NULL WHERE notify_requests.notified_at IS NOT NULL`,
    )
    .bind(productId, email, nowIso(now))
    .run();
}

/** Queues one `email.notify` row per waiting request of every product that is buyable or pre-orderable today. */
export async function queueBackInStock(db: D1Database, now: Date): Promise<number> {
  const { results: waiting } = await db.prepare('SELECT DISTINCT product_id FROM notify_requests WHERE queued_at IS NULL').all<{ product_id: number }>();
  if (!waiting.length) return 0;
  const ids = new Set(waiting.map((w) => w.product_id));
  const available = (await listActiveProductsWithVariants(db, now))
    .filter((x) => ids.has(x.product.id) && x.variants.some((v) => v.availability === 'buy' || v.availability === 'preorder'))
    .map((x) => x.product.id);
  let queued = 0;
  const at = nowIso(now);
  for (const productId of available) {
    const res = await db.batch([
      db.prepare(
        `INSERT INTO outbox (order_id, kind, payload, state, attempts, next_attempt_at, created_at, updated_at)
         SELECT NULL, 'email.notify', json_object('requestId', id), 'pending', 0, ?1, ?1, ?1 FROM notify_requests WHERE product_id = ?2 AND queued_at IS NULL`,
      ).bind(at, productId),
      db.prepare('UPDATE notify_requests SET queued_at = ?1 WHERE product_id = ?2 AND queued_at IS NULL').bind(at, productId),
    ]);
    queued += res[0].meta.changes ?? 0;
  }
  return queued;
}

export function backInStockEmail(r: { id: number; email: string; name: string; path: string; preorder: boolean }, s: StoreSettings): Email {
  const url = absolute(r.path);
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const what = r.preorder ? 'is open for pre-order' : 'is available again';
  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f3;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a"><div style="max-width:560px;margin:0 auto;padding:24px 12px"><div style="background:#fff;border-radius:12px;padding:24px">
<p style="margin:0;font-weight:bold;color:#196a5e;font-size:18px">HariLeaf</p>
<h1 style="font-size:20px;margin:12px 0">${esc(r.name)} ${what}</h1>
<p style="font-size:14px;line-height:1.55">You asked us to tell you when ${esc(r.name)} ${what}. Here it is:</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#196a5e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:bold">See ${esc(r.name)}</a></p>
<p style="font-size:12px;color:#666">This is the only email you'll get about this request, and we've now deleted your address from the list. If you didn't ask for it, you can ignore it.</p>
</div><p style="font-size:12px;color:#666;padding:12px">${esc(s.legal_name || 'HariLeaf')}</p></div></body></html>`;
  return {
    to: r.email,
    subject: `${r.name} ${what} — HariLeaf`,
    html,
    text: `You asked us to tell you when ${r.name} ${what}: ${url}\n\nThis is the only email you'll get about this request, and we've deleted your address from the list.`,
    idempotencyKey: `email.notify/${r.id}`,
    replyTo: s.customer_care_email || undefined,
  };
}

/** Outbox handler `email.notify` ({ requestId }). A request deleted meanwhile (retention) is skipped. */
export function makeNotifyHandler(fetchImpl?: typeof fetch): OutboxHandler {
  return async (payload: { requestId?: number }, { env }) => {
    const db = env.STORE_DB;
    const r = await db
      .prepare(
        `SELECT n.id, n.email, n.product_id, n.notified_at, p.name, p.slug, c.slug AS category_slug
         FROM notify_requests n JOIN products p ON p.id = n.product_id JOIN categories c ON c.id = p.category_id WHERE n.id = ?`,
      )
      .bind(payload.requestId ?? 0)
      .first<{ id: number; email: string; product_id: number; notified_at: string | null; name: string; slug: string; category_slug: string }>();
    if (!r || r.notified_at) return;
    const now = new Date();
    const hit = (await listActiveProductsWithVariants(db, now)).find((x) => x.product.id === r.product_id);
    const preorder = Boolean(hit && !hit.variants.some((v) => v.availability === 'buy') && hit.variants.some((v) => v.availability === 'preorder'));
    await sendEmail(env, backInStockEmail({ id: r.id, email: r.email, name: r.name, path: `/${r.category_slug}/${r.slug}`, preorder }, await getSettings(db)), fetchImpl);
    await db.prepare('UPDATE notify_requests SET notified_at = ? WHERE id = ? AND notified_at IS NULL').bind(nowIso(now), r.id).run();
  };
}

/** Retention: addresses go once notified, and after 12 months regardless. */
export async function purgeNotifyRequests(db: D1Database, now: Date): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - NOTIFY_RETENTION_MONTHS);
  const res = await db.prepare('DELETE FROM notify_requests WHERE notified_at IS NOT NULL OR created_at < ?').bind(cutoff.toISOString()).run();
  return res.meta.changes ?? 0;
}
