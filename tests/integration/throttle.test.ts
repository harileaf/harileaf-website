import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { checkLoginAllowed, clearLoginFailures, recordLoginFailure } from '../../src/lib/store/throttle';

const kv = env.HARILEAF_CMS;
const T0 = new Date('2026-10-18T06:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

it('allows five failures in 15 minutes, then blocks', async () => {
  const ip = '203.0.113.1';
  for (let i = 0; i < 5; i++) {
    expect(await checkLoginAllowed(kv, ip, at(i))).toBe(true);
    await recordLoginFailure(kv, ip, at(i));
  }
  expect(await checkLoginAllowed(kv, ip, at(5))).toBe(false);
  // Another IP is unaffected.
  expect(await checkLoginAllowed(kv, '203.0.113.2', at(5))).toBe(true);
});

it('opens again once the window has passed or after a successful login', async () => {
  const ip = '203.0.113.3';
  for (let i = 0; i < 5; i++) await recordLoginFailure(kv, ip, at(0));
  expect(await checkLoginAllowed(kv, ip, at(14))).toBe(false);
  expect(await checkLoginAllowed(kv, ip, at(16))).toBe(true);
  const other = '203.0.113.4';
  for (let i = 0; i < 5; i++) await recordLoginFailure(kv, other, at(0));
  await clearLoginFailures(kv, other);
  expect(await checkLoginAllowed(kv, other, at(1))).toBe(true);
});

