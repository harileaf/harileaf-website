/**
 * Outbox handler registry: kind → handler. A row whose kind has no handler is
 * marked dead (and surfaces on the admin dashboard) rather than retried
 * forever. M4 adds `shiprocket.create`, `razorpay.refund` and the shipping emails.
 */
import { makePurgeHandler } from './edge-cache';
import { makeEmailHandlers } from './email-handlers';
import type { OutboxHandler } from './outbox';
import { makeCaptureHandler } from './payments';

export const OUTBOX_HANDLERS: Record<string, OutboxHandler> = {
  'cache.purge': makePurgeHandler(),
  'razorpay.capture': makeCaptureHandler(),
  ...makeEmailHandlers(),
};
