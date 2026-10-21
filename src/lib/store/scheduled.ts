/**
 * Cron entry points. Every 5 minutes: the maintenance jobs below. Every
 * minute (DRAIN_CRON): the outbox drain on its own, so it gets a whole
 * invocation's subrequest budget (Workers Free: 50). Each job is safe to run
 * twice and to overlap with itself (outbox rows are leased; order changes are
 * ops claims). Reconciliation runs before expiry so a payment whose callbacks
 * were missed places the order instead of releasing its stock.
 */
import { OUTBOX_HANDLERS } from './handlers';
import { drainLimit, drainOutbox } from './outbox';
import { expireReservations, reconcilePending, requeueStuckCaptures } from './payments';
import { razorpayConfig } from './razorpay';
import { reconcileRefunds } from './refunds';
import { cancelStaleUnconfirmedCod, remindUnconfirmedCod } from './cod';
import { getSettings } from './settings';
import { anonymiseStaleOrders } from './retention';
import { purgeNotifyRequests, queueBackInStock } from './notify';

/** Must match the every-minute entry in wrangler.toml [triggers] crons. */
export const DRAIN_CRON = '* * * * *';

export async function runScheduled(env: Env, now: Date, cron: string): Promise<void> {
  if (cron === DRAIN_CRON) return runDrain(env, now);
  return runMaintenance(env, now);
}

async function runDrain(env: Env, now: Date): Promise<void> {
  try {
    const outbox = await drainOutbox(env.STORE_DB, OUTBOX_HANDLERS, { env, now, limit: drainLimit(env.OUTBOX_CRON_LIMIT, 50) });
    if (outbox.done || outbox.failed || outbox.dead) console.log(JSON.stringify({ msg: 'scheduled drain', at: now.toISOString(), outbox }));
  } catch (err) {
    console.error(JSON.stringify({ msg: 'scheduled drain failed', at: now.toISOString(), error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }));
    throw err;
  }
}

async function runMaintenance(env: Env, now: Date): Promise<void> {
  const failed: string[] = [];
  try {
    const report: Record<string, unknown> = { at: now.toISOString() };
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        report[name] = await fn();
      } catch (err) {
        report[name] = `error: ${String(err)}`;
        failed.push(`${name} (${String(err)})`);
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
    // Seasons open on the calendar, not on a write: check waiting "notify me" requests every run.
    await step('notify_queued', () => queueBackInStock(env.STORE_DB, now));
    await step('notify_purged', () => purgeNotifyRequests(env.STORE_DB, now));
    console.log(JSON.stringify({ msg: 'scheduled', ...report }));
  } catch (err) {
    // Each job already catches its own errors; this guards the runner itself.
    console.error(JSON.stringify({ msg: 'scheduled run failed', at: now.toISOString(), error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }));
    throw err;
  }
  // The other jobs still ran; fail the invocation so Cron Events shows the run as failed.
  if (failed.length) throw new Error(`scheduled jobs failed: ${failed.join('; ')}`);
}
