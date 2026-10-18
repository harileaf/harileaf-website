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
import { reconcileRefunds } from './refunds';
import { cancelStaleUnconfirmedCod, remindUnconfirmedCod } from './cod';
import { getSettings } from './settings';
import { anonymiseStaleOrders } from './retention';

export async function runScheduled(env: Env, now: Date): Promise<void> {
  try {
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
    if (rzp) await step('refunds_settled', () => reconcileRefunds(env.STORE_DB, rzp, now));
    await step('captures_requeued', () => requeueStuckCaptures(env.STORE_DB, now));
    await step('cod_reminders', () => remindUnconfirmedCod(env.STORE_DB, now));
    await step('cod_expired', async () => cancelStaleUnconfirmedCod(env.STORE_DB, Number((await getSettings(env.STORE_DB)).cod_confirm_window_hours), now));
    await step('anonymised', () => anonymiseStaleOrders(env.STORE_DB, now));
    await step('outbox', () => drainOutbox(env.STORE_DB, OUTBOX_HANDLERS, { env, now, limit: 50 }));
    console.log(JSON.stringify({ msg: 'scheduled', ...report }));
  } catch (err) {
    // Each job already catches its own errors; this guards the runner itself.
    console.error(JSON.stringify({ msg: 'scheduled run failed', at: now.toISOString(), error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }));
  }
}
