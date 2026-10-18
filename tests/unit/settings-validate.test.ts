import { describe, expect, it } from 'vitest';
import { SETTING_DEFAULTS, isValidGstin, missingForLaunch, validateSettings } from '../../src/lib/store/settings';

describe('isValidGstin', () => {
  it('accepts well-formed GSTINs with a correct checksum', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin('27AAACR5055K1Z7')).toBe(true);
    expect(isValidGstin('07AAGFF2194N1Z1')).toBe(true);
  });
  it('rejects a bad checksum, a bad shape and lowercase', () => {
    expect(isValidGstin('27AAPFU0939F1ZW')).toBe(false);
    expect(isValidGstin('29GGGGG1314R9Z6')).toBe(false); // the GST portal's illustrative sample has no valid checksum
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isValidGstin('27aapfu0939f1zv')).toBe(false);
    expect(isValidGstin('')).toBe(false);
  });
});

describe('validateSettings', () => {
  const current = { ...SETTING_DEFAULTS };

  it('normalises and accepts a complete, valid set', () => {
    const res = validateSettings(
      {
        gstin: ' 27aapfu0939f1zv ',
        legal_name: 'HariLeaf Agritech Pvt Ltd',
        fssai_license: '11524999000123',
        customer_care_phone: '+91 98209 66177',
        customer_care_email: 'Care@HariLeaf.org',
        grievance_officer_phone: '022-28901234',
        min_order_paise: '49900',
        cod_max_order_paise: '300000',
      },
      current,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.gstin).toBe('27AAPFU0939F1ZV');
    expect(res.value.customer_care_phone).toBe('9820966177');
    expect(res.value.grievance_officer_phone).toBe('02228901234');
    expect(res.value.customer_care_email).toBe('care@harileaf.org');
    expect(res.value.state_code).toBe('27');
  });

  it('allows fields to stay empty until launch', () => {
    expect(validateSettings({ gstin: '', fssai_license: '' }, current).ok).toBe(true);
  });

  it('reports field-level errors', () => {
    const res = validateSettings(
      {
        gstin: '27AAPFU0939F1ZW',
        fssai_license: '1234',
        customer_care_phone: '12345',
        customer_care_email: 'not-an-email',
        state_code: '99',
        min_order_paise: '499.5',
        cod_max_order_paise: '0',
        bogus: 'x',
      },
      current,
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(Object.keys(res.errors).sort()).toEqual(
      ['bogus', 'cod_max_order_paise', 'customer_care_email', 'customer_care_phone', 'fssai_license', 'gstin', 'min_order_paise', 'state_code'].sort(),
    );
  });

  it('requires the GSTIN state prefix to match the state code, using stored values for the other field', () => {
    const res = validateSettings({ state_code: '29' }, { ...current, gstin: '27AAPFU0939F1ZV' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.gstin).toMatch(/state code/);
  });

  it('rejects overly long text', () => {
    const res = validateSettings({ address: 'x'.repeat(501) }, current);
    expect(res.ok).toBe(false);
  });
});

describe('missingForLaunch', () => {
  it('lists the legal and contact fields that are still empty', () => {
    expect(missingForLaunch(SETTING_DEFAULTS)).toEqual([
      'legal_name', 'address', 'gstin', 'fssai_license', 'customer_care_phone', 'customer_care_email',
      'grievance_officer_name', 'grievance_officer_email', 'grievance_officer_phone', 'pickup_pincode',
    ]);
  });
});

it('validates the COD confirmation window (0 = never, otherwise after the 24 h reminder)', () => {
  const cur = { ...SETTING_DEFAULTS };
  expect(validateSettings({ cod_confirm_window_hours: '0' }, cur).ok).toBe(true);
  expect(validateSettings({ cod_confirm_window_hours: '72' }, cur).ok).toBe(true);
  expect(validateSettings({ cod_confirm_window_hours: '12' }, cur).ok).toBe(false);
  expect(validateSettings({ cod_confirm_window_hours: 'x' }, cur).ok).toBe(false);
});
