import { expect, it } from 'vitest';
import { SETTING_DEFAULTS, isValidGstin, validateSettings } from '../../src/lib/store/settings';

const current = { ...SETTING_DEFAULTS };

it('accepts GSTINs only with a correct checksum and shape', () => {
  expect(['27AAPFU0939F1ZV', '07AAGFF2194N1Z1'].map(isValidGstin)).toEqual([true, true]);
  // bad checksum, the GST portal's sample (no valid checksum), too short, lowercase
  expect(['27AAPFU0939F1ZW', '29GGGGG1314R9Z6', '27AAPFU0939F1Z', '27aapfu0939f1zv'].map(isValidGstin)).toEqual([false, false, false, false]);
});

it('normalises a valid set, allows empty fields before launch and derives the state code', () => {
  const res = validateSettings({
    gstin: ' 27aapfu0939f1zv ', fssai_license: '11524999000123', customer_care_phone: '+91 98209 66177',
    customer_care_email: 'Care@HariLeaf.org', grievance_officer_phone: '022-28901234', min_order_paise: '49900', address: '',
  }, current);
  expect(res.ok && res.value).toMatchObject({
    gstin: '27AAPFU0939F1ZV', customer_care_phone: '9820966177', grievance_officer_phone: '02228901234', customer_care_email: 'care@harileaf.org', state_code: '27', address: '',
  });
});

it('reports field-level errors, including a GSTIN that does not match the stored state code', () => {
  const res = validateSettings({
    gstin: '27AAPFU0939F1ZW', fssai_license: '1234', customer_care_phone: '12345', customer_care_email: 'not-an-email',
    state_code: '99', min_order_paise: '499.5', cod_max_order_paise: '0', address: 'x'.repeat(501), bogus: 'x',
  }, current);
  expect(!res.ok && Object.keys(res.errors).sort()).toEqual(['address', 'bogus', 'cod_max_order_paise', 'customer_care_email', 'customer_care_phone', 'fssai_license', 'gstin', 'min_order_paise', 'state_code']);
  const mismatch = validateSettings({ state_code: '29' }, { ...current, gstin: '27AAPFU0939F1ZV' });
  expect(!mismatch.ok && mismatch.errors.gstin).toMatch(/state code/);
});

it('validates the COD confirmation window (0 = never, otherwise after the 24 h reminder)', () => {
  const cur = { ...SETTING_DEFAULTS };
  expect(validateSettings({ cod_confirm_window_hours: '0' }, cur).ok).toBe(true);
  expect(validateSettings({ cod_confirm_window_hours: '72' }, cur).ok).toBe(true);
  expect(validateSettings({ cod_confirm_window_hours: '12' }, cur).ok).toBe(false);
  expect(validateSettings({ cod_confirm_window_hours: 'x' }, cur).ok).toBe(false);
});

it('needs at least one dispatch day', () => {
  expect(validateSettings({ dispatch_days: '4, 1 ,2' }, current)).toMatchObject({ ok: true, value: { dispatch_days: '1,2,4' } });
  expect(validateSettings({ dispatch_days: '' }, current)).toMatchObject({ ok: false, errors: { dispatch_days: 'Choose at least one dispatch day' } });
});
