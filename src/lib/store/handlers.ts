/**
 * Outbox handler registry: kind → handler. A row whose kind has no handler is
 * marked dead (and surfaces on the admin dashboard) rather than retried forever.
 */
import { makePurgeHandler } from './edge-cache';
import { makeFulfilmentEmailHandlers } from './email-fulfilment';
import { makeEmailHandlers } from './email-handlers';
import type { OutboxHandler } from './outbox';
import { makeCaptureHandler } from './payments';
import { makeRefundHandler } from './refunds';
import { makeShiprocketHandlers } from './shiprocket-orders';

export const OUTBOX_HANDLERS: Record<string, OutboxHandler> = {
  'cache.purge': makePurgeHandler(),
  'razorpay.capture': makeCaptureHandler(),
  'razorpay.refund': makeRefundHandler(),
  ...makeEmailHandlers(),
  ...makeFulfilmentEmailHandlers(),
  ...makeShiprocketHandlers(),
};
