import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { verifyPassphrase, createSession, deleteSession, setSessionCookie, clearSessionCookie } from '../../lib/auth';
import { checkLoginAllowed, clearLoginFailures, recordLoginFailure } from '../../lib/store/throttle';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, cookies }) => {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const now = new Date();
  if (!(await checkLoginAllowed(env.HARILEAF_CMS, ip, now))) {
    return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
  }
  let passphrase: string;
  try {
    const body = await request.json() as { passphrase?: string };
    passphrase = body.passphrase ?? '';
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  const valid = await verifyPassphrase(passphrase, env.ADMIN_PASSPHRASE);
  if (!valid) {
    await recordLoginFailure(env.HARILEAF_CMS, ip, now);
    return json({ error: 'Incorrect passphrase' }, 401);
  }
  await clearLoginFailures(env.HARILEAF_CMS, ip);
  const token = await createSession(env.HARILEAF_CMS);
  setSessionCookie(cookies, token);
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ cookies }) => {
  await deleteSession(env.HARILEAF_CMS, cookies);
  clearSessionCookie(cookies);
  return json({ ok: true });
};
