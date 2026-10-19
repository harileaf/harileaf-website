# E-commerce V2-2 — Reviews + Notify me Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Each task: failing test → see it fail → implement → see it pass → commit.

**Goal:** Verified-buyer product reviews (spec: v2 Features → Reviews) and "Notify me" sign-ups for products that can't be bought right now (spec: v2 Features → Notify me), with the SEO rules for review markup (§3.2, §3.4).

**Architecture:**
- **`reviews.ts`** covers the review token (HMAC derived from the order's idempotency key, `review-token:` domain, never rotated with the order link), the reviewable items of an order, submission, moderation, and the public reads (summary plus first page, then "load more").
- **The database enforces the rules:**
  - one review per (order, product) via `UNIQUE`;
  - a `BEFORE INSERT` trigger accepts only delivered, non-replacement orders that contain the product;
  - status moves forward only (`pending → approved | rejected`);
  - an approved review's content can't change, and reviews can't be deleted.
- **`notify.ts`:**
  - sign-ups are upserted, so a duplicate answers the same and a re-sign-up after an earlier notification is allowed;
  - `queueBackInStock(db, now)` queues one `email.notify` outbox row per un-queued request for every product that is buyable or pre-orderable today. The insert and the `queued_at` stamp are one batch (a guarded, forward-only claim), so each request is queued exactly once even with overlapping crons;
  - it runs on the cron (calendar transitions such as a season opening) and straight after admin product/stock saves;
  - the handler sends with a Resend idempotency key per request and then sets `notified_at`.
- **Retention:** notified requests are deleted on the next cron. Un-notified ones are deleted after 12 months.

**Base branch:** `feat/ecommerce-v2-1-coupons`. Branch: `feat/ecommerce-v2-2-reviews-notify`.

**Decisions:**
- Notify me is offered only when **no** pack of the product can be bought (requests are per product, so a sign-up while another pack is buyable would email at once).
- `/review` is a token page like `/order/*`: CSP, no-store, no-referrer, noindex, full page loads (added to `isStoreTransactionalPath`).
- Rejection needs one of a fixed list of reasons: abusive language, personal information, not about the product, advertising/spam, health or disease claims. A low rating is never a reason. All rejections are counted on the admin page.
- The first 10 approved reviews (newest first) are in the HTML with the summary; "Show more reviews" fetches the next pages from `GET /api/store/reviews`. Only the server-rendered reviews are in JSON-LD.
- No confirmation email for notify sign-ups (Turnstile + rate limit instead). The single notification email says it is the only one.

## Tasks
- [ ] 1. Migration `0006_reviews_notify.sql`: `reviews` (+ triggers, index), `notify_requests` (UNIQUE product+email, `queued_at`, `notified_at`). Schema test: delivered-only, one per (order, product), frozen after approval, forward-only status.
- [ ] 2. `reviews.ts` + tests: token, reviewable items, submit (validation; duplicate → "already reviewed"), approve/reject (purges the product URL, admin email recorded), public summary + page. One integration test of the shopper path, one of moderation (approve purges, rejected never shows, negative reviews publish like any other).
- [ ] 3. `/review` page + `POST /api/store/review`; the delivered email links to it; `isStoreTransactionalPath` covers `/review`.
- [ ] 4. Product page: buy-box rating line, reviews section (summary, 10 reviews, verified-buyer label, how reviews work), "Show more" island; `seo.ts` `aggregateRating` + `review` on the ProductGroup only when ≥ 1 approved review. Unit test: present/absent shapes. e2e: the existing "reviews hidden" test still guards the 0-review case.
- [ ] 5. `/admin/reviews` moderation queue (pending first, approve / reject with reason, counts) + API; nav entry; dashboard to-do "reviews waiting".
- [ ] 6. `notify.ts` + `POST /api/store/notify` (Turnstile, rate limit, same answer for duplicates) + `email.notify` handler + cron step + call after admin saves. Integration race: two overlapping `queueBackInStock` runs queue each request once; a request is never emailed twice; nothing is queued while the product is unavailable.
- [ ] 7. Notify form on the product page (lazy Turnstile on first focus, privacy notice at the form, no marketing opt-in) for products with no buyable pack.
- [ ] 8. Retention: delete notified requests and requests older than 12 months (extend the retention test). Privacy policy: reviews and notify-me sections. Terms: review publication rules.
- [ ] 9. Gates + browser pass (1280 / 390): order → deliver (admin) → email link → review → approve → product page + JSON-LD; notify sign-up on a sold-out product → stock added in admin → outbox email row → retention deletes it. Rich Results Test on a deployed URL is for the owner (listed in the PR). Spec notes, PR.
