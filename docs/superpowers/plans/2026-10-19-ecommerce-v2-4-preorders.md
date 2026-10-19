# E-commerce V2-4 — Pre-orders + Ready to Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Each task: failing test → see it fail → implement → see it pass → commit.

**Goal:** Pre-orders (spec: v2 Features → Pre-orders): a separate, prepaid-only cart; orders store `is_preorder` and `expected_dispatch_date`; stock is taken from the pre-order allocation; nothing reaches Shiprocket until the admin marks the order **Ready to dispatch** (invoice + Shiprocket push + email); delays move the date with an email and a one-click cancel with full refund; the product page and checkout show the dispatch date.

**Architecture:**
- **Availability**: `mapVariant` stops downgrading `preorder` to `notify`. A pre-order needs an off-season product in `preorder` mode with a dispatch date and stock; `stock_qty` is the allocation.
- **Quote**: `preorder` lines are buyable and form their own cart group (`preorder` takes precedence over `perishable`, so mango pre-orders still get their zone check). COD is refused ("Pre-orders are prepaid").
- **Order**: `is_preorder = 1`, and `expected_dispatch_date` is the latest dispatch date in the cart. Stock is reserved exactly as for other prepaid orders.
- **Ready to dispatch** = the existing `pack` claim. Its `ok` SQL now also requires `is_preorder = 1` for this action and `is_preorder = 0` for plain pack. It issues the invoice, sets `ready_to_dispatch = 1`, and queues `shiprocket.create` + `email.ready_to_dispatch` in the same batch. The Shiprocket handler skips pre-orders that aren't ready (captured payments queue a push, so this guard is what keeps them out).
- **Delay**: claim `delay:<new date>`. Allowed only while `placed`, a pre-order, not ready, and the new date is later. It updates the date, logs an event, and queues `email.preorder_delayed` (new date, reason, link to the order page's cancel button). Customer cancel (already allowed while `placed`) refunds a captured payment in full.
- **SEO**: `PreOrder` + `availabilityStarts` in JSON-LD; the feed gets `preorder` + `g:availability_date` (`YYYY-MM-DDT00:00+05:30`; Merchant Center allows up to 1 year ahead).

**Base branch:** `feat/ecommerce-v2-3-perishables`. Branch: `feat/ecommerce-v2-4-preorders`.

## Tasks
- [ ] 1. Availability + quote groups + COD rule + order fields; integration test (separate cart, prepaid only, allocation reserved, date stored).
- [ ] 2. Ready to dispatch + delay in `fulfilment.ts`; Shiprocket guard; emails; integration races (two Ready clicks → one invoice, one push, one email; a captured payment never pushes before Ready; a delay can't move the date earlier; cancel after a delay refunds).
- [ ] 3. Admin order detail actions (Ready to dispatch, Push back date) + list tag; customer order page (pre-order banner, date, cancel); product page buy box ("Pre-order · Dispatches from {date} · prepaid only"); checkout dispatch line.
- [ ] 4. JSON-LD PreOrder + feed preorder tests (one each); notify-me now also fires when a pre-order opens.
- [ ] 5. Policies: pre-order terms (shipping, refund, terms). Gates + browser pass (1280 / 390). Spec notes, PR.
