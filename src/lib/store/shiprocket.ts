/**
 * Shiprocket client: auth (token cached in KV), courier serviceability and
 * pincode details. Order creation and tracking arrive in M4.
 * See docs/superpowers/research/2026-10-18-integration-apis.md.
 */
import { timedFetch } from './http';

const BASE = 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_KEY = 'shiprocket:token';
const TOKEN_TTL_S = 9 * 24 * 3600; // tokens last 10 days

export interface ShiprocketConfig {
  email: string;
  password: string;
  kv: KVNamespace;
  fetch?: typeof fetch;
}

export function shiprocketConfig(env: Env, fetchImpl?: typeof fetch): ShiprocketConfig | null {
  if (!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD) return null;
  return { email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD, kv: env.HARILEAF_CMS, fetch: fetchImpl };
}

export class ShiprocketError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function login(cfg: ShiprocketConfig): Promise<string> {
  const res = await timedFetch(cfg.fetch ?? fetch)(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!res.ok || !data.token) throw new ShiprocketError(res.status, `Shiprocket login failed: ${data.message ?? res.status}`);
  await cfg.kv.put(TOKEN_KEY, data.token, { expirationTtl: TOKEN_TTL_S });
  return data.token;
}

async function token(cfg: ShiprocketConfig): Promise<string> {
  return (await cfg.kv.get(TOKEN_KEY)) ?? login(cfg);
}

/** Authenticated call; on 401 the cached token is dropped and the call retried once. */
export async function srCall<T>(cfg: ShiprocketConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; data: T }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await timedFetch(cfg.fetch ?? fetch)(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token(cfg)}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401 && attempt === 0) {
      await cfg.kv.delete(TOKEN_KEY);
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, data };
  }
  throw new ShiprocketError(401, 'Shiprocket authentication failed');
}

export interface Serviceability {
  serviceable: boolean;
  cod: boolean;
  etaDays: number | null;
  city: string | null;
  state: string | null;
}

interface Courier {
  courier_name?: string;
  cod?: number;
  estimated_delivery_days?: string | number;
  city?: string;
  state?: string;
}

async function couriers(cfg: ShiprocketConfig, q: { pickup: string; delivery: string; weightKg: number; cod: boolean; declaredValue: number }): Promise<Courier[]> {
  const params = new URLSearchParams({
    pickup_postcode: q.pickup,
    delivery_postcode: q.delivery,
    weight: q.weightKg.toFixed(2),
    cod: q.cod ? '1' : '0',
    declared_value: String(Math.max(1, Math.round(q.declaredValue))),
  });
  const { status, data } = await srCall<{ status?: number; data?: { available_courier_companies?: Courier[] } }>(cfg, 'GET', `/courier/serviceability/?${params}`);
  if (status >= 500) throw new ShiprocketError(status, `Shiprocket serviceability failed (${status})`);
  if (status !== 200 || (data.status !== undefined && data.status !== 200)) return [];
  return data.data?.available_courier_companies ?? [];
}

/** Can we deliver to this pincode (and with COD)? Uses the fastest courier's ETA. */
export async function checkServiceability(
  cfg: ShiprocketConfig,
  q: { pickup: string; delivery: string; weightKg: number; declaredValue: number },
): Promise<Serviceability> {
  const prepaid = await couriers(cfg, { ...q, cod: false });
  if (!prepaid.length) return { serviceable: false, cod: false, etaDays: null, city: null, state: null };
  const codList = await couriers(cfg, { ...q, cod: true });
  const eta = prepaid
    .map((c) => Number(c.estimated_delivery_days))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)[0];
  const withPlace = prepaid.find((c) => c.city && c.state);
  return {
    serviceable: true,
    cod: codList.some((c) => c.cod === 1) || codList.length > 0,
    etaDays: eta ?? null,
    city: withPlace?.city ?? null,
    state: withPlace?.state ?? null,
  };
}
