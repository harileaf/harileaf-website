import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { idParam, isAdmin, json, readJson, unauthorised } from '../../../../../lib/admin-api';
import { bookCourier, courierOptions, labelUrl, manifestUrl } from '../../../../../lib/store/shiprocket-booking';

export const prerender = false;

/** Couriers Shiprocket offers for this order's parcel. */
export const GET: APIRoute = async ({ params, cookies }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  if (!id) return json({ error: 'Not found' }, 404);
  const r = await courierOptions(env, id);
  return r.ok ? json(r.value) : json({ error: r.error }, 422);
};

/** { action: 'book', courierId } | { action: 'label' } | { action: 'manifest' } */
export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  const body = (await readJson(request)) as { action?: unknown; courierId?: unknown } | undefined;
  if (!id || !body) return json({ error: 'Invalid request' }, 400);
  const r =
    body.action === 'book' ? await bookCourier(env, id, Number(body.courierId), { now: new Date(), actorEmail: locals.adminEmail ?? null })
    : body.action === 'label' ? await labelUrl(env, id)
    : body.action === 'manifest' ? await manifestUrl(env, id)
    : { ok: false as const, error: 'Unknown action' };
  return r.ok ? json({ ok: true, value: r.value }) : json({ error: r.error }, 422);
};
