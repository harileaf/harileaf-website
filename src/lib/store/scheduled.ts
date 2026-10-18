/**
 * Cron entry point (every 5 minutes). Each job must be safe to run twice and to
 * overlap with itself; the outbox claims rows with a guarded UPDATE.
 * M3 adds reservation expiry and Razorpay reconciliation here.
 */
import { OUTBOX_HANDLERS } from './handlers';
import { drainOutbox } from './outbox';

export async function runScheduled(env: Env, now: Date): Promise<void> {
  const outbox = await drainOutbox(env.STORE_DB, OUTBOX_HANDLERS, { env, now, limit: 50 });
  console.log(JSON.stringify({ msg: 'scheduled', at: now.toISOString(), outbox }));
}
