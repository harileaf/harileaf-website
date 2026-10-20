import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { drainSoon, idParam, isAdmin, json, readJson, unauthorised } from '../../../../../lib/admin-api';
import { addLabReport, setLabReportVisible } from '../../../../../lib/store/catalog-admin';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  const form = await request.formData().catch(() => null);
  if (!id || !form) return json({ error: 'Invalid request' }, 400);
  let summary: Record<string, string> = {};
  try {
    const parsed = JSON.parse(String(form.get('summary') ?? '{}'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      summary = Object.fromEntries(Object.entries(parsed).filter(([k, v]) => k.trim() && typeof v === 'string' && v.trim())) as Record<string, string>;
  } catch {
    return json({ error: 'Summary must be JSON' }, 400);
  }
  const pdf = form.get('pdf');
  const res = await addLabReport(
    env.STORE_DB,
    env.HARILEAF_MEDIA,
    id,
    {
      batchCode: String(form.get('batchCode') ?? ''),
      testedOn: String(form.get('testedOn') ?? ''),
      labName: String(form.get('labName') ?? ''),
      labAccreditation: String(form.get('labAccreditation') ?? '') || null,
      testScope: String(form.get('testScope') ?? ''),
      summary,
      visible: form.get('visible') !== 'false',
    },
    pdf instanceof File && pdf.size > 0 ? pdf : null,
  );
  if (!res.ok) return json({ error: res.error }, 400);
  drainSoon(env, locals);
  return json(res, 201);
};

export const PATCH: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!(await isAdmin(env, cookies))) return unauthorised();
  const id = idParam(params.id);
  const b = (await readJson(request)) as { reportId?: number; visible?: boolean } | undefined;
  if (!id || !b || !Number.isInteger(b.reportId) || typeof b.visible !== 'boolean') return json({ error: 'Invalid request' }, 400);
  const res = await setLabReportVisible(env.STORE_DB, id, b.reportId as number, b.visible);
  if (!res.ok) return json({ error: res.error }, 400);
  drainSoon(env, locals);
  return json(res);
};
