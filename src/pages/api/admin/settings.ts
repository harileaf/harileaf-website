import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { validateSession } from '../../../lib/auth';
import { drainSoon } from '../../../lib/admin-api';
import { purgeStorefrontStmts } from '../../../lib/store/catalog-admin';
import { getSettings, putSettings, validateSettings } from '../../../lib/store/settings';
import { parseZones, zoneIdOf } from '../../../lib/store/zones';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ cookies }) => {
  if (!(await validateSession(env.HARILEAF_CMS, cookies))) return json({ error: 'Unauthorised' }, 401);
  return json(await getSettings(env.STORE_DB));
};

export const PUT: APIRoute = async ({ request, cookies, locals }) => {
  if (!(await validateSession(env.HARILEAF_CMS, cookies))) return json({ error: 'Unauthorised' }, 401);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Expected an object' }, 400);

  const result = validateSettings(input as Record<string, unknown>, await getSettings(env.STORE_DB));
  if (!result.ok) return json({ error: 'Invalid settings', errors: result.errors }, 400);
  // A zone a product is sold in can't be removed (pause it by unticking "Enabled" instead).
  const kept = new Set(parseZones(result.value.delivery_zones).map((z) => z.id));
  const { results: zoned } = await env.STORE_DB.prepare('SELECT name, delivery_zone FROM products WHERE delivery_zone IS NOT NULL').all<{ name: string; delivery_zone: string }>();
  const orphan = zoned.find((p) => !kept.has(zoneIdOf(p.delivery_zone) ?? ''));
  if (orphan) {
    const msg = `${orphan.name} is sold in zone "${zoneIdOf(orphan.delivery_zone)}" — move it to another zone first, or untick "Enabled" to pause the zone`;
    return json({ error: 'Invalid settings', errors: { delivery_zones: msg } }, 400);
  }
  await putSettings(env.STORE_DB, result.value);
  // Seller details and order limits appear on every product page and the policy pages.
  await env.STORE_DB.batch(await purgeStorefrontStmts(env.STORE_DB, new Date().toISOString()));
  drainSoon(env, locals);
  return json({ ok: true, settings: result.value });
};
