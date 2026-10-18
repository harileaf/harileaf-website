/** Cron entry point (every 5 minutes). Each job must be safe to run twice and to overlap with itself. */
export async function runScheduled(env: Env, now: Date): Promise<void> {
  console.log(JSON.stringify({ msg: 'scheduled', at: now.toISOString(), hasDb: Boolean(env.STORE_DB) }));
}
