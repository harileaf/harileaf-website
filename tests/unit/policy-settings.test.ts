import { expect, it } from 'vitest';
import { PENDING, displayPhone, loadPolicySettings, orPending, rupeesSetting } from '../../src/lib/store/policy-settings';
import { SETTING_DEFAULTS } from '../../src/lib/store/settings';

it('formats phones for display and marks missing values as pending', () => {
  expect(displayPhone('9820966177')).toBe('+91 98209 66177');
  expect(displayPhone('02228901234')).toBe('022 28901234');
  expect(displayPhone('')).toBe(PENDING);
  expect(orPending('  ')).toBe(PENDING);
  expect(orPending('HariLeaf')).toBe('HariLeaf');
});

it('formats paise settings as rupees', () => {
  expect(rupeesSetting('49900')).toBe('₹499');
  expect(rupeesSetting('')).toBe(PENDING);
});

it('falls back to defaults when the store database is missing or broken', async () => {
  expect(await loadPolicySettings(undefined)).toEqual(SETTING_DEFAULTS);
  const broken = { prepare: () => { throw new Error('no such table: settings'); } } as unknown as D1Database;
  expect(await loadPolicySettings(broken)).toEqual(SETTING_DEFAULTS);
});
