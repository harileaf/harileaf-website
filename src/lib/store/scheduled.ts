/**
 * Cron entry point (every 5 minutes). Each job is safe to run twice and to
 * overlap with itself (outbox rows are leased; order changes are ops claims).
 * Reconciliation runs before expiry so a payment whose callbacks were missed
 * places the order instead of releasing its stock.
 */
import { OUTBOX_HANDLERS } from './handlers';
import { drainOutbox } from './outbox';
import { expireReservations, reconcilePending, requeueStuckCaptures } from './payments';
import { razorpayConfig } from './razorpay';

export async function runScheduled(env: Env, now: Date): Promise<void> {
  const report: Record<string, unknown> = { at: now.toISOString() };
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      report[name] = await fn();
    } catch (err) {
      report[name] = `error: ${String(err)}`;
    }
  };
  const rzp = razorpayConfig(env);
  if (rzp) await step('reconciled', () => reconcilePending(env.STORE_DB, rzp, now));
  await step('expired', () => expireReservations(env.STORE_DB, now));
  await step('captures_requeued', () => requeueStuckCaptures(env.STORE_DB, now));
  await step('outbox', () => drainOutbox(env.STORE_DB, OUTBOX_HANDLERS, { env, now, limit: 50 }));
  console.log(JSON.stringify({ msg: 'scheduled', ...report }));
}
