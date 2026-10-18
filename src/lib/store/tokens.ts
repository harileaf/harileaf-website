/**
 * Secret view tokens for order and review links (/order/HL-2610-0042?t=…).
 * The token is 128 random bits; only its HMAC-SHA256 (keyed with
 * ORDER_TOKEN_SECRET) is stored, and checks compare in constant time.
 */
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function newViewToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  if (!secret) throw new Error('ORDER_TOKEN_SECRET is not configured');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const hashViewToken = (secret: string, token: string) => hmacHex(secret, `order-view:${token}`);

export async function checkViewToken(secret: string, token: string, storedHash: string): Promise<boolean> {
  if (!/^[0-9a-f]{32}$/.test(token)) return false;
  return constantTimeEqual(await hashViewToken(secret, token), storedHash);
}
