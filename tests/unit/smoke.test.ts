import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';

it('runs inside workerd with a D1 binding', async () => {
  const row = await env.STORE_DB.prepare('SELECT 1 AS one').first<{ one: number }>();
  expect(row?.one).toBe(1);
});
