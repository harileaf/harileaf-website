import { expect, it } from 'vitest';
import { SETTING_DEFAULTS, getSettings, putSettings } from '../../src/lib/store/settings';
import { db } from '../helpers/fixtures';

it('returns defaults when nothing is stored', async () => {
  expect(await getSettings(db)).toEqual(SETTING_DEFAULTS);
});

it('round-trips stored values and overwrites on update', async () => {
  await putSettings(db, { ...SETTING_DEFAULTS, legal_name: 'HariLeaf Agritech', min_order_paise: '59900' });
  await putSettings(db, { ...(await getSettings(db)), legal_name: 'HariLeaf Agritech Pvt Ltd' });
  const s = await getSettings(db);
  expect(s.legal_name).toBe('HariLeaf Agritech Pvt Ltd');
  expect(s.min_order_paise).toBe('59900');
});

it('ignores unknown keys stored by older code', async () => {
  await db.prepare("INSERT INTO settings (key, value) VALUES ('old_key', 'x')").run();
  expect(Object.keys(await getSettings(db))).not.toContain('old_key');
});
