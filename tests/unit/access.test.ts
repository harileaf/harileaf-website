import { beforeAll, describe, expect, it } from 'vitest';
import { accessDecision, requiresAdminAccess, verifyAccessJwt, type AccessConfig } from '../../src/lib/store/access';

const cfg: AccessConfig = { teamDomain: 'harileaf.cloudflareaccess.com', aud: 'aud-tag-123' };
const NOW = new Date('2026-10-18T06:00:00Z');
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let keys: CryptoKeyPair;
let other: CryptoKeyPair;
let jwks: { keys: JsonWebKey[] };

async function sign(payload: Record<string, unknown>, opts: { kid?: string; key?: CryptoKey; alg?: string } = {}) {
  const header = b64url(JSON.stringify({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', opts.key ?? keys.privateKey, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

const good = () => ({
  aud: [cfg.aud],
  iss: `https://${cfg.teamDomain}`,
  email: 'nishit@harileaf.org',
  exp: sec(NOW) + 600,
  nbf: sec(NOW) - 10,
  iat: sec(NOW) - 10,
});

beforeAll(async () => {
  const alg = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  keys = (await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
  other = (await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', keys.publicKey)) as JsonWebKey;
  jwks = { keys: [{ ...jwk, kid: 'k1', alg: 'RS256', use: 'sig' } as JsonWebKey] };
});

const verify = (token: string, now = NOW) =>
  verifyAccessJwt(token, cfg, { now, fetchJwks: async (url) => {
    expect(url).toBe('https://harileaf.cloudflareaccess.com/cdn-cgi/access/certs');
    return jwks;
  } });

describe('verifyAccessJwt', () => {
  it('returns the email for a valid token (aud as array or string)', async () => {
    expect(await verify(await sign(good()))).toEqual({ email: 'nishit@harileaf.org' });
    expect(await verify(await sign({ ...good(), aud: cfg.aud }))).toEqual({ email: 'nishit@harileaf.org' });
  });

  it('rejects wrong claims, a bad signature, an unknown kid, a non-RS256 alg and garbage', async () => {
    for (const over of [{ aud: ['someone-else'] }, { iss: 'https://evil.cloudflareaccess.com' }, { exp: sec(NOW) - 1 }, { nbf: sec(NOW) + 60 }, { email: undefined }])
      expect(await verify(await sign({ ...good(), ...over }))).toBeNull();
    expect(await verify(await sign(good(), { key: other.privateKey }))).toBeNull();
    expect(await verify(await sign(good(), { kid: 'unknown' }))).toBeNull();
    expect(await verify(await sign(good(), { alg: 'HS256' }))).toBeNull();
    expect(await verify('not.a.jwt')).toBeNull();
    const svc = { ...good(), email: undefined, common_name: 'abc.access' };
    expect(await verify(await sign(svc))).toBeNull(); // service token not allow-listed
    expect(await verify('')).toBeNull();
    const t = await sign(good());
    const [h, , s] = t.split('.');
    expect(await verify(`${h}.${b64url(JSON.stringify({ ...good(), email: 'attacker@x.com' }))}.${s}`)).toBeNull();
  });

  it('accepts an allow-listed service token', async () => {
    const svcCfg = { ...cfg, serviceTokens: ['abc.access'] };
    const fetchJwks = async () => jwks;
    const svc = { ...good(), email: undefined, common_name: 'abc.access' };
    expect(await verifyAccessJwt(await sign(svc), svcCfg, { now: NOW, fetchJwks })).toEqual({ email: 'service-token:abc.access' });
    expect(await verifyAccessJwt(await sign({ ...svc, common_name: 'other.access' }), svcCfg, { now: NOW, fetchJwks })).toBeNull();
  });
});

describe('accessDecision', () => {
  it('is off without config and fails closed when only one of the two settings is present', () => {
    expect(accessDecision({})).toEqual({ mode: 'off' });
    expect(accessDecision({ CF_ACCESS_AUD: 'x' })).toEqual({ mode: 'misconfigured' });
    expect(accessDecision({ CF_ACCESS_TEAM_DOMAIN: 'x' })).toEqual({ mode: 'misconfigured' });
  });
  it('enforces with a normalised team domain', () => {
    expect(accessDecision({ CF_ACCESS_AUD: 'a', CF_ACCESS_TEAM_DOMAIN: 'https://harileaf.cloudflareaccess.com/' })).toEqual({
      mode: 'enforce',
      cfg: { aud: 'a', teamDomain: 'harileaf.cloudflareaccess.com' },
    });
  });
});

it('requiresAdminAccess gates every admin path and spelling the router serves, and nothing public', () => {
  const gated = [
    ['/admin', 'GET'], ['/admin/settings/', 'POST'], ['/api/admin/settings', 'PUT'], ['/api/auth', 'POST'],
    ['/keystatic/branch/main', 'GET'], ['/api/keystatic/update', 'POST'], ['/api/photos/image', 'DELETE'], ['/api/produce', 'PUT'], ['/api/content', 'put'],
    // Spellings Astro still routes to admin pages (it decodes escapes and tolerates repeated slashes and case).
    ['/%61dmin', 'GET'], ['/%2561dmin', 'GET'], ['//admin', 'GET'], ['/api//admin/settings', 'PUT'], ['/api/aut%68', 'POST'], ['/API/Admin/settings', 'PUT'],
  ];
  const open = [['/rice', 'GET'], ['/administrator', 'GET'], ['/api/photos/image', 'GET'], ['/api/content', 'HEAD'], ['/api/authx', 'POST']];
  for (const [path, method] of gated) expect([path, method, requiresAdminAccess(path, method)]).toEqual([path, method, true]);
  for (const [path, method] of open) expect([path, method, requiresAdminAccess(path, method)]).toEqual([path, method, false]);
});
