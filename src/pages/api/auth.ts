import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { verifyPassphrase, createSession, deleteSession, setSessionCookie, clearSessionCookie } from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  let passphrase: string;
  try {
    const body = await request.json() as { passphrase?: string };
    passphrase = body.passphrase ?? '';
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const valid = await verifyPassphrase(passphrase, env.ADMIN_PASSPHRASE);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Incorrect passphrase' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const token = await createSession(env.HARILEAF_CMS);
  setSessionCookie(cookies, token);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ cookies }) => {
  await deleteSession(env.HARILEAF_CMS, cookies);
  clearSessionCookie(cookies);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
