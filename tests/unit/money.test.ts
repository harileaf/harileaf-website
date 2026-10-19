import { describe, expect, it } from 'vitest';
import { amountInWords, assertPaise, formatINR, formatUnitPrice, unitSalePrice } from '../../src/lib/store/money';

describe('money', () => {
  it('only accepts integer, non-negative, safe paise', () => {
    expect(assertPaise(69900)).toBe(69900);
    for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => assertPaise(bad)).toThrow();
  });

  it('formats rupees with Indian grouping and paise only when present', () => {
    expect(formatINR(69900)).toBe('₹699');
    expect(formatINR(69905)).toBe('₹699.05');
    expect(formatINR(1234567800)).toBe('₹1,23,45,678');
  });

  it('writes invoice amounts in words (lakh, crore, paise)', () => {
    expect(amountInWords(134950)).toBe('Rupees One Thousand Three Hundred Forty Nine and Fifty Paise Only');
    expect(amountInWords(10000000)).toBe('Rupees One Lakh Only');
    expect(amountInWords(12345678900)).toBe('Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only');
  });

  it('declares the unit sale price per gram under 1 kg and per kg from 1 kg (Legal Metrology)', () => {
    expect(unitSalePrice(9500, 500)).toEqual({ paise: 19, per: 'g' });
    expect(unitSalePrice(14900, 1000)).toEqual({ paise: 14900, per: 'kg' });
    expect(formatUnitPrice(6000, 50)).toBe('₹1.20/g');
    expect(formatUnitPrice(10000, 3000)).toBe('₹33.33/kg');
    expect(() => unitSalePrice(100, 0)).toThrow();
  });
});
