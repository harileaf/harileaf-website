import { expect, it } from 'vitest';
import { loadPolicySettings } from '../../src/lib/store/policy-settings';
import { SETTING_DEFAULTS } from '../../src/lib/store/settings';

it('policy pages fall back to defaults when the store database is missing or broken', async () => {
  expect(await loadPolicySettings(undefined)).toEqual(SETTING_DEFAULTS);
  const broken = { prepare: () => { throw new Error('no such table: settings'); } } as unknown as D1Database;
  expect(await loadPolicySettings(broken)).toEqual(SETTING_DEFAULTS);
});
