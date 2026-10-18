/**
 * Worker entry. The Cloudflare adapter's default entry only exports `fetch`,
 * so this wraps its handler and adds `scheduled()` for the store's cron jobs
 * (outbox drain; later: reservation expiry and payment reconciliation).
 *
 * wrangler.toml points `main` here; the adapter respects a user-set `main`.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { runScheduled } from './lib/store/scheduled';

export default {
  fetch: handle,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const at = new Date(controller.scheduledTime);
    // runScheduled logs its own failures; this is the backstop so nothing reaches the runtime as an unhandled rejection.
    ctx.waitUntil(runScheduled(env, at).catch((err) => console.error(JSON.stringify({ msg: 'scheduled handler crashed', at: at.toISOString(), error: String(err) }))));
  },
};
