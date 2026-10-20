import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, idParam, isAdmin, json, readJson, unauthorised } from '../../../../../lib/admin-api';
import { activateBatch, addBatch } from '../../../../../lib/store/catalog-admin';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  const b = (await readJson(request)) as Record<string, unknown> | undefined;
  if (!id || !b) return json({ error: 'Invalid request' }, 400);
  const res = await addBatch(env.STORE_DB, id, {
    batchCode: String(b.batchCode ?? '').trim(),
    packedOn: String(b.packedOn ?? ''),
    groundOrMilledOn: b.groundOrMilledOn ? String(b.groundOrMilledOn) : null,
    labReportId: Number.isInteger(b.labReportId) ? (b.labReportId as number) : null,
    makeActive: b.makeActive === true,
  });
  if (!res.ok) return json({ error: res.error }, 400);
  drainSoon(env, locals);
  return json(res, 201);
};

export const PATCH: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  const b = (await readJson(request)) as { batchId?: number } | undefined;
  if (!id || !b || !Number.isInteger(b.batchId)) return json({ error: 'Invalid request' }, 400);
  const res = await activateBatch(env.STORE_DB, id, b.batchId as number);
  if (!res.ok) return json({ error: res.error }, 400);
  drainSoon(env, locals);
  return json(res);
};
