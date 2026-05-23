import type { AstroCookies } from 'astro';

const SESSION_COOKIE = 'hl_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassphrase(submitted: string, stored: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(submitted), sha256(stored)]);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(kv: KVNamespace): Promise<string> {
  const token = crypto.randomUUID();
  await kv.put(`session:${token}`, 'valid', { expirationTtl: SESSION_TTL_SECONDS });
  return token;
}

export async function validateSession(kv: KVNamespace, cookies: AstroCookies): Promise<boolean> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const value = await kv.get(`session:${token}`);
  return value === 'valid';
}

export async function deleteSession(kv: KVNamespace, cookies: AstroCookies): Promise<void> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await kv.delete(`session:${token}`);
}

export function setSessionCookie(cookies: AstroCookies, token: string): void {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 0 });
}

export { SESSION_COOKIE };
