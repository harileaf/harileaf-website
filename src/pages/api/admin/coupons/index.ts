import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin, json, readJson, unauthorised } from '../../../../lib/admin-api';
import { createCoupon, validateCouponInput } from '../../../../lib/store/coupons';

export const prerender = false;

const categoryIds = async () => (await env.STORE_DB.prepare('SELECT id FROM categories').all<{ id: number }>()).results.map((c) => c.id);

/** Create a code. Coupons never change public pages, so nothing is purged. */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Expected an object' }, 400);
  const v = validateCouponInput(body as Record<string, unknown>, await categoryIds());
  if (!v.ok) return json({ error: 'Please check the highlighted fields', errors: v.errors }, 400);
  const r = await createCoupon(env.STORE_DB, v.value, new Date());
  return r.ok ? json({ ok: true, code: v.value.code }, 201) : json({ error: r.error, errors: { code: r.error } }, 409);
};
