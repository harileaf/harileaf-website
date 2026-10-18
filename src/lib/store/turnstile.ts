/** Cloudflare Turnstile server-side check for checkout submits (skipped when no secret is configured). */
export async function verifyTurnstile(secret: string | undefined, token: string | null, ip: string | null, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean };
  return data.success === true;
}
