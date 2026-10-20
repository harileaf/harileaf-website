/**
 * Admin login throttling: at most 5 failed passphrase attempts per IP per
 * 15-minute window. Counters live in KV (eventually consistent, which is fine
 * for slowing down guessing).
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const key = (ip: string) => `login-fail:${ip}`;

type Counter = { count: number; firstAt: number };

async function read(kv: KVNamespace, ip: string): Promise<Counter | null> {
  const raw = await kv.get(key(ip));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Counter;
  } catch {
    return null;
  }
}

export async function checkLoginAllowed(kv: KVNamespace, ip: string, now: Date): Promise<boolean> {
  const c = await read(kv, ip);
  if (!c || now.getTime() - c.firstAt >= WINDOW_MS) return true;
  return c.count < MAX_FAILURES;
}

export async function recordLoginFailure(kv: KVNamespace, ip: string, now: Date): Promise<void> {
  const c = await read(kv, ip);
  const next: Counter = !c || now.getTime() - c.firstAt >= WINDOW_MS ? { count: 1, firstAt: now.getTime() } : { ...c, count: c.count + 1 };
  // KV TTL must be ≥ 60 s; the window check above is what actually expires it.
  await kv.put(key(ip), JSON.stringify(next), { expirationTtl: WINDOW_MS / 1000 + 60 });
}

export async function clearLoginFailures(kv: KVNamespace, ip: string): Promise<void> {
  await kv.delete(key(ip));
}
