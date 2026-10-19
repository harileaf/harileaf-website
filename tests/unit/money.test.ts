import { describe, expect, it } from 'vitest';
import { amountInWords, assertPaise, formatINR, formatUnitPrice, unitPricePerKg, unitSalePrice } from '../../src/lib/store/money';

describe('assertPaise', () => {
  it('accepts non-negative integers and rejects everything else', () => {
    expect(assertPaise(0)).toBe(0);
    expect(assertPaise(69900)).toBe(69900);
    expect(() => assertPaise(-1)).toThrow();
    expect(() => assertPaise(1.5)).toThrow();
    expect(() => assertPaise(Number.NaN)).toThrow();
    expect(() => assertPaise(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});

describe('formatINR', () => {
  it.each([
    [0, '₹0'],
    [100, '₹1'],
    [69900, '₹699'],
    [69950, '₹699.50'],
    [69905, '₹699.05'],
    [134900, '₹1,349'],
    [13490000, '₹1,34,900'],
    [1234567800, '₹1,23,45,678'],
  ])('%i paise → %s', (p, s) => {
    expect(formatINR(p)).toBe(s);
  });
});

describe('amountInWords', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [100, 'Rupees One Only'],
    [50, 'Rupees Zero and Fifty Paise Only'],
    [134950, 'Rupees One Thousand Three Hundred Forty Nine and Fifty Paise Only'],
    [69900, 'Rupees Six Hundred Ninety Nine Only'],
    [1001500, 'Rupees Ten Thousand Fifteen Only'],
    [10000000, 'Rupees One Lakh Only'],
    [12345678900, 'Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only'],
    [1000000000000, 'Rupees One Thousand Crore Only'],
  ])('%i paise', (p, words) => {
    expect(amountInWords(p)).toBe(words);
  });
});

describe('unitPricePerKg', () => {
  it('scales the pack price to 1 kg, rounded to the paisa', () => {
    expect(unitPricePerKg(69900, 5000)).toBe(13980);
    expect(unitPricePerKg(14900, 1000)).toBe(14900);
    expect(unitPricePerKg(12900, 200)).toBe(64500);
    expect(unitPricePerKg(10000, 3000)).toBe(3333);
  });
  it('rejects a non-positive pack size', () => {
    expect(() => unitPricePerKg(100, 0)).toThrow();
  });
});

describe('unitSalePrice', () => {
  it('is per gram under 1 kg and per kg from 1 kg, to the paisa', () => {
    expect(unitSalePrice(6000, 50)).toEqual({ paise: 120, per: 'g' });
    expect(unitSalePrice(9500, 500)).toEqual({ paise: 19, per: 'g' });
    expect(unitSalePrice(12900, 999)).toEqual({ paise: 13, per: 'g' });
    expect(unitSalePrice(14900, 1000)).toEqual({ paise: 14900, per: 'kg' });
    expect(unitSalePrice(69900, 5000)).toEqual({ paise: 13980, per: 'kg' });
    expect(() => unitSalePrice(100, 0)).toThrow();
  });
  it('formats with the unit', () => {
    expect(formatUnitPrice(6000, 50)).toBe('₹1.20/g');
    expect(formatUnitPrice(9500, 500)).toBe('₹0.19/g');
    expect(formatUnitPrice(69900, 5000)).toBe('₹139.80/kg');
  });
});
