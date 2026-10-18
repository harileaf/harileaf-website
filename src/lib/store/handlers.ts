/**
 * Outbox handler registry: kind → handler. Later milestones register
 * `email.*`, `shiprocket.create`, `razorpay.capture`, `razorpay.refund` and
 * `cache.purge` here. A row whose kind has no handler is marked dead (and
 * surfaces on the admin dashboard) rather than retried forever.
 */
import { makePurgeHandler } from './edge-cache';
import type { OutboxHandler } from './outbox';

export const OUTBOX_HANDLERS: Record<string, OutboxHandler> = {
  'cache.purge': makePurgeHandler(),
};
