import { describe, expect, it } from 'vitest';
import { isStateCode, stateCodeFor, stateName } from '../../src/lib/store/india-states';
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
  it('computes standard HMAC-SHA256 hex, compares in constant time and needs a secret', async () => {
    await expect(hashViewToken('', 'x')).rejects.toThrow(/ORDER_TOKEN_SECRET/);
    expect([constantTimeEqual('abc', 'abc'), constantTimeEqual('abc', 'abd'), constantTimeEqual('abc', 'ab')]).toEqual([true, false, false]);
    // RFC 4231 test case 2
    expect(await hmacHex('Jefe', 'what do ya want for nothing?')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
});

describe('India states', () => {
  it('maps names (and the aliases couriers return) to GST state codes', () => {
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
});
