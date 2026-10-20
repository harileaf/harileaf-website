/** Helpers for public /api/store/* routes. */
export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await request.json();
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Per-IP rate limit (fails open if the binding isn't configured, e.g. in tests). */
export async function allowed(env: Env, request: Request, bucket: string): Promise<boolean> {
  if (!env.STORE_RATE_LIMITER) return true;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  try {
    return (await env.STORE_RATE_LIMITER.limit({ key: `${bucket}:${ip}` })).success;
  } catch {
    return true;
  }
}

export const tooMany = () => json({ error: 'Too many requests — please wait a minute and try again.' }, 429, { 'Retry-After': '60' });

/** Razorpay checkout.js options the browser needs to open payment for an order. */
export function paymentOptions(env: Env, o: { orderNo: string; razorpayOrderId: string; total: number; name: string; email: string; phone: string; timeoutSeconds?: number }) {
  return {
    key: env.RAZORPAY_KEY_ID,
    order_id: o.razorpayOrderId,
    amount: o.total,
    currency: 'INR',
    name: 'HariLeaf',
    description: `Order ${o.orderNo}`,
    prefill: { name: o.name, email: o.email, contact: o.phone },
    notes: { order_no: o.orderNo },
    theme: { color: '#196a5e' },
    // UX hint only: the server-side reservation expiry (30 min) is authoritative.
    timeout: Math.max(60, Math.min(900, Math.floor(o.timeoutSeconds ?? 900))),
  };
}
