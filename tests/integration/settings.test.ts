import { expect, it } from 'vitest';
import { SETTING_DEFAULTS, getSettings, putSettings } from '../../src/lib/store/settings';
import { db } from '../helpers/fixtures';

it('returns defaults until saved, then round-trips updates', async () => {
  expect(await getSettings(db)).toEqual(SETTING_DEFAULTS);
  await putSettings(db, { ...SETTING_DEFAULTS, legal_name: 'HariLeaf Agritech', min_order_paise: '59900' });
  await putSettings(db, { ...(await getSettings(db)), legal_name: 'HariLeaf Agritech Pvt Ltd' });
  expect(await getSettings(db)).toMatchObject({ legal_name: 'HariLeaf Agritech Pvt Ltd', min_order_paise: '59900' });
});
