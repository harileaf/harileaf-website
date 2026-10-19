import { describe, expect, it } from 'vitest';
import { moderateReview, openReviewLink, publishedReviews, reviewSummary, reviewTokenFor, submitReview } from '../../src/lib/store/reviews';
import { db, insertOrder, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const SECRET = 'review-secret';
const NOW = new Date('2026-11-01T06:00:00Z');
let n = 0;

async function deliveredOrder(productIds: number[], over: Record<string, unknown> = {}) {
  const key = `review-key-${++n}-xxxxxxxx`;
  const orderId = await insertOrder({ status: 'delivered', payment_status: 'paid', idempotency_key: key, ...over });
  for (const p of productIds) {
    const v = await insertVariant(p, { price_paise: 69900, mrp_paise: 69900 });
    await db
      .prepare(
        `INSERT INTO order_items (order_id, variant_id, product_name, variant_label, sku, hsn_code, gst_rate_bp, unit_price_paise, mrp_paise, qty, taxable_paise, cgst_paise, sgst_paise, line_total_paise)
         VALUES (?, ?, 'P', '1 kg', 'S', '1006', 500, 69900, 69900, 1, 66571, 1664, 1665, 69900)`,
      )
      .bind(orderId, v)
      .run();
  }
  const orderNo = await scalar<string>('SELECT order_no FROM orders WHERE id = ?', orderId);
  return { orderId, orderNo, token: await reviewTokenFor(SECRET, key) };
}
const review = (productId: number, rating = 5) => ({ productId, rating, title: 'Lovely rice', body: 'Cooks evenly and smells wonderful.', displayName: 'Asha, Mumbai' });

describe('reviews', () => {
  it('lets a verified buyer review each product of a delivered order once, through the emailed link', async () => {
    const [p1, p2, other] = [await insertProduct(), await insertProduct(), await insertProduct()];
    const o = await deliveredOrder([p1, p2]);
    expect(await openReviewLink(db, SECRET, o.orderNo, 'f'.repeat(32))).toBeNull();
    const link = await openReviewLink(db, SECRET, o.orderNo, o.token);
    expect(link?.order).toMatchObject({ delivered: true, firstName: 'Test', city: 'Mumbai' });
    expect(link?.items.map((i) => i.productId).sort()).toEqual([p1, p2].sort());

    expect(await submitReview(db, o.orderId, review(p1), NOW)).toEqual({ ok: true });
    expect(await submitReview(db, o.orderId, review(p1, 1), NOW)).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(await submitReview(db, o.orderId, review(other), NOW)).toMatchObject({ ok: false, reason: 'not_allowed' });
    const shipped = await deliveredOrder([p1], { status: 'shipped' });
    expect(await submitReview(db, shipped.orderId, review(p1), NOW)).toMatchObject({ ok: false, reason: 'not_allowed' });
    const replacement = await deliveredOrder([p1], { replacement_for_order_id: o.orderId, total_paise: 0, subtotal_paise: 0, gst_paise: 0 });
    expect(await submitReview(db, replacement.orderId, review(p1), NOW)).toMatchObject({ ok: false, reason: 'not_allowed' });
    // Text never changes once submitted.
    await expect(db.prepare("UPDATE reviews SET body = 'edited text here' WHERE order_id = ?").bind(o.orderId).run()).rejects.toThrow(/fixed/);
  });

  it('publishes approved reviews of every rating, hides rejected ones, purges the product page, and moderation is final', async () => {
    const p = await insertProduct();
    const [a, b, c] = [await deliveredOrder([p]), await deliveredOrder([p]), await deliveredOrder([p])];
    await submitReview(db, a.orderId, review(p, 5), NOW);
    await submitReview(db, b.orderId, review(p, 1), NOW);
    await submitReview(db, c.orderId, review(p, 4), NOW);
    const ids = (await db.prepare('SELECT id FROM reviews WHERE product_id = ? ORDER BY id').bind(p).all<{ id: number }>()).results.map((r) => r.id);
    expect(await reviewSummary(db, p)).toBeNull();

    const purgesBefore = await scalar("SELECT count(*) FROM outbox WHERE kind = 'cache.purge'");
    const ctx = { now: NOW, actorEmail: 'owner@harileaf.org' };
    expect(await moderateReview(db, ids[0], { action: 'approve' }, ctx)).toEqual({ ok: true });
    expect(await moderateReview(db, ids[1], { action: 'approve' }, ctx)).toEqual({ ok: true });
    expect(await moderateReview(db, ids[2], { action: 'reject', reason: 'personal_info' }, ctx)).toEqual({ ok: true });
    expect(await scalar("SELECT count(*) FROM outbox WHERE kind = 'cache.purge'")).toBe(purgesBefore + 4); // now + 30 s later, per approval
    expect(await moderateReview(db, ids[2], { action: 'approve' }, ctx)).toMatchObject({ ok: false });
    await expect(db.prepare("UPDATE reviews SET status = 'pending' WHERE id = ?").bind(ids[0]).run()).rejects.toThrow(/final/);

    expect(await reviewSummary(db, p)).toEqual({ count: 2, average: 3, distribution: [1, 0, 0, 0, 1] });
    expect((await publishedReviews(db, p)).map((r) => r.rating).sort()).toEqual([1, 5]);

    // Withdrawn at the reviewer's request: off the page, text blanked.
    expect(await moderateReview(db, ids[1], { action: 'withdraw' }, ctx)).toEqual({ ok: true });
    expect(await reviewSummary(db, p)).toMatchObject({ count: 1 });
    expect(await scalar('SELECT body FROM reviews WHERE id = ?', ids[1])).toBe('Removed at the reviewer\'s request.');
    await expect(db.prepare('DELETE FROM reviews WHERE id = ?').bind(ids[0]).run()).rejects.toThrow(/never deleted/);
  });
});
