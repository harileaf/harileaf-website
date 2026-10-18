/**
 * Cloudflare Access verification for /admin* and /api/admin*.
 *
 * Access sits in front of the custom domain and adds a signed JWT
 * (`Cf-Access-Jwt-Assertion`). Checking it in the Worker too means a request
 * that reaches the Worker some other way (a misconfigured route, a future
 * workers.dev URL) is still refused. Keys come from the team's JWKS endpoint.
 */

export interface AccessConfig {
  /** e.g. "harileaf.cloudflareaccess.com" */
  teamDomain: string;
  /** Application Audience (AUD) tag of the Access application. */
  aud: string;
}

export type AccessMode = { mode: 'off' } | { mode: 'misconfigured' } | { mode: 'enforce'; cfg: AccessConfig };

/** Off = session-only admin (today's behaviour). Half-configured fails closed. */
export function accessDecision(env: { CF_ACCESS_AUD?: string; CF_ACCESS_TEAM_DOMAIN?: string }): AccessMode {
  const aud = env.CF_ACCESS_AUD?.trim();
  const team = env.CF_ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!aud && !team) return { mode: 'off' };
  if (!aud || !team) return { mode: 'misconfigured' };
  return { mode: 'enforce', cfg: { aud, teamDomain: team } };
}

/**
 * Requests that need Cloudflare Access when it is configured. Astro matches
 * routes with or without a trailing slash, so paths are normalised first.
 * Public reads of site content (GET /api/photos, /api/produce, /api/content)
 * stay open; their writes are admin actions.
 */
export function requiresAdminAccess(pathname: string, method: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  const under = (prefix: string) => p === prefix || p.startsWith(`${prefix}/`);
  if (under('/admin') || under('/api/admin') || p === '/api/auth') return true;
  if (under('/keystatic') || under('/api/keystatic')) return true;
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  return write && (under('/api/photos') || p === '/api/produce' || p === '/api/content');
}

type Jwks = { keys: Array<JsonWebKey & { kid?: string }> };

const JWKS_TTL_MS = 10 * 60_000;
const jwksCache = new Map<string, { at: number; jwks: Jwks }>();

async function defaultFetchJwks(url: string): Promise<Jwks> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  return (await res.json()) as Jwks;
}

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/**
 * @param opts.fetchJwks injectable for tests; when given, the module JWKS cache is bypassed.
 */
export async function verifyAccessJwt(
  token: string,
  cfg: AccessConfig,
  opts: { now?: Date; fetchJwks?: (url: string) => Promise<Jwks> } = {},
): Promise<{ email: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const header = b64urlJson(h);
  const payload = b64urlJson(p);
  if (!header || !payload || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const aud = payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(cfg.aud) : aud === cfg.aud;
  if (!audOk) return null;
  if (payload.iss !== `https://${cfg.teamDomain}`) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now) return null;
  if (typeof payload.email !== 'string' || !payload.email) return null;

  const url = `https://${cfg.teamDomain}/cdn-cgi/access/certs`;
  const jwk = await findKey(url, header.kid, opts.fetchJwks);
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? { email: payload.email } : null;
  } catch {
    return null;
  }
}

async function findKey(url: string, kid: string, fetchJwks?: (url: string) => Promise<Jwks>): Promise<JsonWebKey | null> {
  const pick = (j: Jwks) => j.keys.find((k) => k.kid === kid) ?? null;
  if (fetchJwks) return pick(await fetchJwks(url));

  const cached = jwksCache.get(url);
  if (cached && Date.now() - cached.at < JWKS_TTL_MS) {
    const hit = pick(cached.jwks);
    if (hit) return hit;
  }
  // Unknown kid or stale cache: refetch once (keys rotate). If the fetch
  // fails, fall back to the last known keys rather than failing every request.
  try {
    const jwks = await defaultFetchJwks(url);
    jwksCache.set(url, { at: Date.now(), jwks });
    return pick(jwks);
  } catch (err) {
    console.error(JSON.stringify({ msg: 'Access JWKS fetch failed', error: String(err) }));
    return cached ? pick(cached.jwks) : null;
  }
}
