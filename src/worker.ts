/**
 * Worker entry. The Cloudflare adapter's default entry only exports `fetch`,
 * so this wraps its handler and adds `scheduled()` for the store's cron jobs
 * (outbox drain every minute; maintenance every 5 minutes).
 *
 * wrangler.toml points `main` here; the adapter respects a user-set `main`.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { runScheduled } from './lib/store/scheduled';

export default {
  fetch: handle,
  // Awaited, so the run's real duration and outcome show in Cron Events: runScheduled logs
  // failures with context, then rethrows so the invocation is recorded as an exception.
  async scheduled(controller: ScheduledController, env: Env) {
    await runScheduled(env, new Date(controller.scheduledTime), controller.cron);
  },
};
