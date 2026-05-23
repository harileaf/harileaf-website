import type { APIRoute } from 'astro';
import { validateSession } from '../../lib/auth';
import { getContent, putContent } from '../../lib/cms';
import type { ContentFields } from '../../lib/cms-types';

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  const fields = await getContent(env.HARILEAF_CMS);
  return new Response(JSON.stringify(fields), { headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ request, locals, cookies }) => {
  const { env } = locals.runtime;
  if (!(await validateSession(env.HARILEAF_CMS, cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  let fields: ContentFields;
  try {
    fields = await request.json() as ContentFields;
    if (typeof fields !== 'object' || fields === null) throw new Error('Expected object');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  await putContent(env.HARILEAF_CMS, fields);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
