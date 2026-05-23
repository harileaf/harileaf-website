import type { APIRoute } from 'astro';
import { validateSession } from '../../lib/auth';
import { getProduce, putProduce } from '../../lib/cms';
import type { ProduceItem } from '../../lib/cms-types';

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  const items = await getProduce(env.HARILEAF_CMS);
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ request, locals, cookies }) => {
  const { env } = locals.runtime;
  if (!(await validateSession(env.HARILEAF_CMS, cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  let items: ProduceItem[];
  try {
    items = await request.json() as ProduceItem[];
    if (!Array.isArray(items)) throw new Error('Expected array');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  await putProduce(env.HARILEAF_CMS, items);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
