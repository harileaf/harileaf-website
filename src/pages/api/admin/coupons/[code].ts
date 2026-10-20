import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin, json, readJson, unauthorised } from '../../../../lib/admin-api';
import { normalizeCode, setCouponActive, updateCoupon, validateCouponInput } from '../../../../lib/store/coupons';

export const prerender = false;

/** Edit the terms of an unused code (the database refuses once it has been used). */
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const code = normalizeCode(params.code);
  const body = await readJson(request);
  if (!code || !body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request' }, 400);
  const ids = (await env.STORE_DB.prepare('SELECT id FROM categories').all<{ id: number }>()).results.map((c) => c.id);
  const v = validateCouponInput({ ...(body as Record<string, unknown>), code }, ids);
  if (!v.ok) return json({ error: 'Please check the highlighted fields', errors: v.errors }, 400);
  const { code: _c, ...terms } = v.value;
  const r = await updateCoupon(env.STORE_DB, code, terms, new Date());
  return r.ok ? json({ ok: true }) : json({ error: r.error }, 409);
};

/** Pause or resume: { active: boolean }. */
export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const code = normalizeCode(params.code);
  const body = (await readJson(request)) as { active?: unknown } | undefined;
  if (!code || typeof body?.active !== 'boolean') return json({ error: 'Invalid request' }, 400);
  const r = await setCouponActive(env.STORE_DB, code, body.active, new Date());
  return r.ok ? json({ ok: true }) : json({ error: r.error }, 404);
};
