import { describe, expect, it } from 'vitest';
import { INDIA_STATES, isStateCode, stateCodeFor, stateName } from '../../src/lib/store/india-states';
import { checkViewToken, constantTimeEqual, hashViewToken, hmacHex, newViewToken } from '../../src/lib/store/tokens';

describe('view tokens', () => {
  it('are 32 hex chars, unique, and verify only against their own hash', async () => {
    const a = newViewToken();
    const b = newViewToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
    const h = await hashViewToken('secret', a);
    expect(await checkViewToken('secret', a, h)).toBe(true);
    expect(await checkViewToken('secret', b, h)).toBe(false);
    expect(await checkViewToken('other-secret', a, h)).toBe(false);
    expect(await checkViewToken('secret', 'not-hex', h)).toBe(false);
  });
  it('computes standard HMAC-SHA256 hex', async () => {
    // RFC 4231 test case 2
    expect(await hmacHex('Jefe', 'what do ya want for nothing?')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
  it('refuses to hash without a secret', async () => {
    await expect(hashViewToken('', 'x')).rejects.toThrow(/ORDER_TOKEN_SECRET/);
  });
  it('compares in constant time', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
  });
});

describe('India states', () => {
  it('maps names (and common aliases) to GST codes', () => {
    expect(stateCodeFor('Maharashtra')).toBe('27');
    expect(stateCodeFor('MAHARASHTRA ')).toBe('27');
    expect(stateCodeFor('Jammu & Kashmir')).toBe('01');
    expect(stateCodeFor('NCT of Delhi')).toBe('07');
    expect(stateCodeFor('Orissa')).toBe('21');
    expect(stateCodeFor('Atlantis')).toBeNull();
    expect(stateName('29')).toBe('Karnataka');
    expect(isStateCode('27')).toBe(true);
    expect(isStateCode('28')).toBe(false); // pre-2014 Andhra Pradesh code
  });
  it('has unique codes for all 36 states and UTs', () => {
    expect(INDIA_STATES).toHaveLength(36);
    expect(new Set(INDIA_STATES.map((s) => s.code)).size).toBe(36);
  });
});
