import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { allowed, json, readJson, tooMany } from '../../../lib/store-api';
import { acceptsNotify, normaliseEmail, signUp } from '../../../lib/store/notify';
import { verifyTurnstile } from '../../../lib/store/turnstile';

export const prerender = false;

/**
 * "Notify me": { productId, email, turnstileToken }. The answer is the same
 * whether the address was new or already waiting, so it can't be used to
 * learn who signed up.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!(await allowed(env, request, 'notify'))) return tooMany();
  const body = await readJson(request);
  const productId = Number(body?.productId);
  const email = normaliseEmail(body?.email);
  if (!body || !Number.isInteger(productId) || productId <= 0) return json({ error: 'Invalid request' }, 400);
  if (!email) return json({ error: 'Enter a valid email address', errors: { email: 'Enter a valid email address' } }, 400);
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, typeof body.turnstileToken === 'string' ? body.turnstileToken : null, request.headers.get('CF-Connecting-IP')))) {
    return json({ error: 'Please complete the security check and try again.', code: 'turnstile' }, 403);
  }
  const now = new Date();
  if (!(await acceptsNotify(env.STORE_DB, productId, now))) return json({ error: 'This product can be ordered now — no need to wait.', code: 'available' }, 409);
  await signUp(env.STORE_DB, productId, email, now);
  return json({ ok: true });
};
