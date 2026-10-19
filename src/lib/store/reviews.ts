/**
 * Verified-buyer reviews (spec: v2 Features → Reviews; IS 19000:2022 practice).
 *
 * The delivered email links to /review?o={orderNo}&t={token}. The token is
 * derived from the order's idempotency key like the order link, but in its
 * own domain and never rotated, so "find your order" doesn't break review
 * links and a review link can't open the order page. The database (migration
 * 0006) allows only delivered, non-replacement orders that contain the
 * product, one review per (order, product), forward-only moderation and no
 * edits. Approved reviews of every rating are published; rejection needs a
 * policy reason, never a low rating.
 */
import { classifyD1Error, nowIso } from './db';
import { purgeUrls } from './edge-cache';
import { enqueueStmt } from './outbox';
import { constantTimeEqual, hmacHex } from './tokens';
import { mediaUrl, productPath } from './urls';

export const REVIEWS_PAGE = 10;

export const REJECT_REASONS = {
  abusive: 'Abusive or offensive language',
  personal_info: 'Contains personal information',
  off_topic: 'Not about the product',
  spam: 'Advertising or spam',
  health_claim: 'Health or disease claims',
} as const;
export type RejectReason = keyof typeof REJECT_REASONS;

export async function reviewTokenFor(secret: string, idempotencyKey: string): Promise<string> {
  return (await hmacHex(secret, `review-token:${idempotencyKey}`)).slice(0, 32);
}

export interface ReviewableItem {
  productId: number;
  name: string;
  path: string;
  image: string | null;
  review: { status: string; rating: number; title: string; createdAt: string } | null;
}

export interface ReviewLink {
  order: { id: number; orderNo: string; status: string; firstName: string; delivered: boolean };
  items: ReviewableItem[];
}

/** Opens a review link; null for a wrong token or unknown order (callers answer the same 404 either way). */
export async function openReviewLink(db: D1Database, secret: string, orderNo: string, token: string): Promise<ReviewLink | null> {
  if (!/^HL-\d{4}-\d{4,}$/.test(orderNo) || !/^[0-9a-f]{32}$/.test(token)) return null;
  const o = await db
    .prepare('SELECT id, order_no, status, customer_name, idempotency_key, replacement_for_order_id FROM orders WHERE order_no = ?')
    .bind(orderNo)
    .first<{ id: number; order_no: string; status: string; customer_name: string; idempotency_key: string | null; replacement_for_order_id: number | null }>();
  if (!o?.idempotency_key || !constantTimeEqual(await reviewTokenFor(secret, o.idempotency_key), token)) return null;
  const { results } = await db
    .prepare(
      `SELECT p.id AS product_id, p.name, p.slug, c.slug AS category_slug,
              (SELECT r2_key FROM product_images im WHERE im.product_id = p.id ORDER BY sort, id LIMIT 1) AS image_key,
              r.status, r.rating, r.title, r.created_at
       FROM (SELECT DISTINCT v.product_id FROM order_items i JOIN variants v ON v.id = i.variant_id WHERE i.order_id = ?1) x
       JOIN products p ON p.id = x.product_id JOIN categories c ON c.id = p.category_id
       LEFT JOIN reviews r ON r.order_id = ?1 AND r.product_id = p.id
       ORDER BY p.name`,
    )
    .bind(o.id)
    .all<{ product_id: number; name: string; slug: string; category_slug: string; image_key: string | null; status: string | null; rating: number | null; title: string | null; created_at: string | null }>();
  return {
    order: {
      id: o.id,
      orderNo: o.order_no,
      status: o.status,
      firstName: o.customer_name.split(/\s+/)[0] ?? '',
      delivered: o.status === 'delivered' && o.replacement_for_order_id === null,
    },
    items: results.map((r) => ({
      productId: r.product_id,
      name: r.name,
      path: productPath(r.category_slug, r.slug),
      image: r.image_key ? mediaUrl(r.image_key) : null,
      review: r.status ? { status: r.status, rating: r.rating!, title: r.title!, createdAt: r.created_at! } : null,
    })),
  };
}

/** The first name only: the reviewer may add a city, but we never publish where they live unasked. */
export const defaultDisplayName = (firstName: string) => firstName.slice(0, 40);

export interface ReviewInput {
  productId: number;
  rating: number;
  title: string;
  body: string;
  displayName: string;
}

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export function validateReviewInput(raw: Record<string, unknown>): { ok: true; value: ReviewInput } | { ok: false; errors: Record<string, string> } {
  const e: Record<string, string> = {};
  const productId = Number(raw.productId);
  const rating = Number(raw.rating);
  const title = clean(raw.title);
  // Keep the reviewer's line breaks in the body (collapsed to at most one blank line).
  const body = typeof raw.body === 'string' ? raw.body.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : '';
  const displayName = clean(raw.displayName);
  if (!Number.isInteger(productId) || productId <= 0) e.productId = 'Unknown product';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) e.rating = 'Choose a rating from 1 to 5 stars';
  if (title.length < 2 || title.length > 100) e.title = 'Add a short title (up to 100 characters)';
  if (body.length < 10 || body.length > 2000) e.body = 'Tell us a little more (10 to 2000 characters)';
  if (displayName.length < 2 || displayName.length > 40) e.displayName = 'Enter the name to show (2 to 40 characters)';
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, value: { productId, rating, title, body, displayName } };
}

export type SubmitResult = { ok: true } | { ok: false; reason: 'duplicate' | 'not_allowed'; message: string };

export async function submitReview(db: D1Database, orderId: number, r: ReviewInput, now: Date): Promise<SubmitResult> {
  try {
    await db
      .prepare('INSERT INTO reviews (order_id, product_id, rating, title, body, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(orderId, r.productId, r.rating, r.title, r.body, r.displayName, nowIso(now))
      .run();
    return { ok: true };
  } catch (err) {
    if (classifyD1Error(err) === 'unique') return { ok: false, reason: 'duplicate', message: 'You have already reviewed this product for this order.' };
    if (/review needs a delivered order/.test(String(err))) return { ok: false, reason: 'not_allowed', message: 'You can review products once your order has been delivered.' };
    throw err;
  }
}

export type ModerationAction = { action: 'approve' } | { action: 'reject'; reason: RejectReason } | { action: 'withdraw' };

/**
 * Approve, reject (with a policy reason) or withdraw at the reviewer's request.
 * Anything that changes what a product page shows purges that page.
 */
export async function moderateReview(db: D1Database, id: number, m: ModerationAction, ctx: { now: Date; actorEmail: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const at = nowIso(ctx.now);
  const row = await db
    .prepare('SELECT r.status, p.slug, c.slug AS category_slug FROM reviews r JOIN products p ON p.id = r.product_id JOIN categories c ON c.id = p.category_id WHERE r.id = ?')
    .bind(id)
    .first<{ status: string; slug: string; category_slug: string }>();
  if (!row) return { ok: false, error: 'No such review' };
  const update =
    m.action === 'approve'
      ? db.prepare("UPDATE reviews SET status = 'approved', approved_at = ?1, moderated_at = ?1, moderated_by = ?2 WHERE id = ?3 AND status = 'pending'").bind(at, ctx.actorEmail, id)
      : m.action === 'reject'
        ? db.prepare("UPDATE reviews SET status = 'rejected', reject_reason = ?1, moderated_at = ?2, moderated_by = ?3 WHERE id = ?4 AND status = 'pending'").bind(m.reason, at, ctx.actorEmail, id)
        : db
            .prepare(
              `UPDATE reviews SET status = 'withdrawn', title = 'Withdrawn', body = 'Removed at the reviewer''s request.', display_name = 'Withdrawn',
                 moderated_at = ?1, moderated_by = ?2 WHERE id = ?3 AND status IN ('pending', 'approved')`,
            )
            .bind(at, ctx.actorEmail, id);
  if (m.action === 'reject' && !(m.reason in REJECT_REASONS)) return { ok: false, error: 'Choose a reason' };
  // Only the product page shows reviews (now, and again 30 s later for pages mid-render, as catalog writes do).
  const urls = purgeUrls([productPath(row.category_slug, row.slug)]);
  const purge = m.action === 'reject' ? [] : [enqueueStmt(db, { kind: 'cache.purge', payload: { urls }, at }), enqueueStmt(db, { kind: 'cache.purge', payload: { urls }, at, notBefore: new Date(ctx.now.getTime() + 30_000).toISOString() })];
  const res = await db.batch([update, ...purge]);
  if ((res[0].meta.changes ?? 0) === 0) return { ok: false, error: `This review is already ${row.status}` };
  return { ok: true };
}

export interface PublicReview {
  id: number;
  rating: number;
  title: string;
  body: string;
  displayName: string;
  publishedAt: string;
}

export interface ReviewSummary {
  count: number;
  /** One decimal, e.g. 4.3. */
  average: number;
  /** Counts for 5, 4, 3, 2, 1 stars. */
  distribution: [number, number, number, number, number];
}

export async function reviewSummary(db: D1Database, productId: number): Promise<ReviewSummary | null> {
  const { results } = await db
    .prepare("SELECT rating, count(*) AS n FROM reviews WHERE product_id = ? AND status = 'approved' GROUP BY rating")
    .bind(productId)
    .all<{ rating: number; n: number }>();
  const count = results.reduce((a, r) => a + r.n, 0);
  if (!count) return null;
  const sum = results.reduce((a, r) => a + r.rating * r.n, 0);
  const dist = [5, 4, 3, 2, 1].map((s) => results.find((r) => r.rating === s)?.n ?? 0) as ReviewSummary['distribution'];
  return { count, average: Math.round((sum / count) * 10) / 10, distribution: dist };
}

/** Newest first. The product page renders the first page; "Show more" fetches the rest. */
export async function publishedReviews(db: D1Database, productId: number, opts: { offset?: number; limit?: number } = {}): Promise<PublicReview[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? REVIEWS_PAGE), 50);
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0));
  const { results } = await db
    .prepare(
      `SELECT id, rating, title, body, display_name, approved_at FROM reviews WHERE product_id = ? AND status = 'approved'
       ORDER BY approved_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .bind(productId, limit, offset)
    .all<{ id: number; rating: number; title: string; body: string; display_name: string; approved_at: string }>();
  return results.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, displayName: r.display_name, publishedAt: r.approved_at }));
}

export interface AdminReview {
  id: number;
  status: string;
  rating: number;
  title: string;
  body: string;
  display_name: string;
  reject_reason: RejectReason | null;
  created_at: string;
  moderated_at: string | null;
  moderated_by: string | null;
  product_name: string;
  order_id: number;
  order_no: string;
}

export async function listReviewsForAdmin(db: D1Database, status: 'pending' | 'approved' | 'rejected' | 'withdrawn'): Promise<AdminReview[]> {
  return (
    await db
      .prepare(
        `SELECT r.id, r.status, r.rating, r.title, r.body, r.display_name, r.reject_reason, r.created_at, r.moderated_at, r.moderated_by,
                p.name AS product_name, o.id AS order_id, o.order_no
         FROM reviews r JOIN products p ON p.id = r.product_id JOIN orders o ON o.id = r.order_id
         WHERE r.status = ? ORDER BY ${status === 'pending' ? 'r.created_at ASC' : 'r.moderated_at DESC'} LIMIT 200`,
      )
      .bind(status)
      .all<AdminReview>()
  ).results;
}

export async function reviewCounts(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db.prepare('SELECT status, count(*) AS n FROM reviews GROUP BY status').all<{ status: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.status, r.n]));
}
