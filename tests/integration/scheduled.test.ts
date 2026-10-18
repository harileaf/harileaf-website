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
