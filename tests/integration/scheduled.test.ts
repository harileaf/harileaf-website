import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { enqueueStmt } from '../../src/lib/store/outbox';
import { DRAIN_CRON, runScheduled } from '../../src/lib/store/scheduled';
import { db, scalar } from '../helpers/fixtures';

it('drains the outbox on the every-minute cron only; rows without a registered handler go dead', async () => {
  const at = '2026-10-18T06:00:00.000Z';
  const { meta } = await enqueueStmt(db, { kind: 'unregistered.kind', payload: {}, at }).run();
  await runScheduled(env, new Date(at), '*/5 * * * *');
  expect(await scalar('SELECT state FROM outbox WHERE id = ?', meta.last_row_id)).toBe('pending');
  await runScheduled(env, new Date(at), DRAIN_CRON);
  expect(await scalar('SELECT state FROM outbox WHERE id = ?', meta.last_row_id)).toBe('dead');
});

it('logs a failed run with context, then rejects so Cron Events records it (e.g. D1 unavailable)', async () => {
  const errors: string[] = [];
  const orig = console.error;
  const origLog = console.log;
  console.error = (m: unknown) => void errors.push(String(m));
  console.log = (m: unknown) => void errors.push(String(m)); // per-job failures are reported in the run summary
  const broken = { ...env, STORE_DB: { prepare: () => { throw new Error('D1 unavailable'); }, batch: async () => { throw new Error('D1 unavailable'); } } } as unknown as Env;
  try {
    await expect(runScheduled(broken, new Date('2026-10-18T06:00:00Z'), '*/5 * * * *')).rejects.toThrow('D1 unavailable');
  } finally {
    console.error = orig;
    console.log = origLog;
  }
  expect(errors.some((e) => /"msg":"scheduled( run failed)?"/.test(e) && e.includes('D1 unavailable'))).toBe(true);
});
