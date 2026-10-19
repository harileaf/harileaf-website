import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { enqueueStmt } from '../../src/lib/store/outbox';
import { runScheduled } from '../../src/lib/store/scheduled';
import { db, scalar } from '../helpers/fixtures';

it('drains the outbox; rows without a registered handler go dead', async () => {
  const at = '2026-10-18T06:00:00.000Z';
  const { meta } = await enqueueStmt(db, { kind: 'unregistered.kind', payload: {}, at }).run();
  await runScheduled(env, new Date(at));
  expect(await scalar('SELECT state FROM outbox WHERE id = ?', meta.last_row_id)).toBe('dead');
});

it('logs a failed run with context, then rejects so Cron Events records it (e.g. D1 unavailable)', async () => {
  const errors: string[] = [];
  const orig = console.error;
  console.error = (m: unknown) => void errors.push(String(m));
  const broken = { ...env, STORE_DB: { prepare: () => { throw new Error('D1 unavailable'); }, batch: async () => { throw new Error('D1 unavailable'); } } } as unknown as Env;
  try {
    await expect(runScheduled(broken, new Date('2026-10-18T06:00:00Z'))).rejects.toThrow('D1 unavailable');
  } finally {
    console.error = orig;
  }
  expect(errors.some((e) => e.includes('"msg":"scheduled run failed"') && e.includes('D1 unavailable'))).toBe(true);
});
