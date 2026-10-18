/**
 * Minimal Razorpay client (Orders, Payments, Refunds) for Workers — fetch +
 * Web Crypto, no SDK. See docs/superpowers/research/2026-10-18-integration-apis.md.
 */
import { timedFetch } from './http';
import { constantTimeEqual, hmacHex } from './tokens';

const BASE = 'https://api.razorpay.com/v1';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  fetch?: typeof fetch;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  amount_paid: number;
  currency: string;
  receipt: string | null;
  status: 'created' | 'attempted' | 'paid';
}

export interface RazorpayPayment {
  id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id: string | null;
  method?: string;
  captured?: boolean;
  amount_refunded?: number;
  error_code?: string | null;
  error_description?: string | null;
  created_at?: number;
}

export interface RazorpayRefund {
  id: string;
  amount: number;
  payment_id: string;
  status: 'pending' | 'processed' | 'failed';
}

export class RazorpayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
  }
}

export function razorpayConfig(env: Env, fetchImpl?: typeof fetch): RazorpayConfig | null {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return null;
  return { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, fetch: fetchImpl };
}

async function call<T>(cfg: RazorpayConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await timedFetch(cfg.fetch ?? fetch)(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${cfg.keyId}:${cfg.keySecret}`)}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { code?: string; description?: string } } & T;
  if (!res.ok) throw new RazorpayError(res.status, data.error?.code ?? null, data.error?.description ?? `Razorpay ${method} ${path} failed (${res.status})`);
  return data;
}

/**
 * Creates an order with manual capture: payments stay `authorized` until we
 * capture them, and Razorpay releases uncaptured authorisations automatically
 * after `manualExpiryMinutes` (max 7200).
 */
export function createOrder(
  cfg: RazorpayConfig,
  o: { amountPaise: number; receipt: string; notes?: Record<string, string>; manualExpiryMinutes?: number },
): Promise<RazorpayOrder> {
  return call<RazorpayOrder>(cfg, 'POST', '/orders', {
    amount: o.amountPaise,
    currency: 'INR',
    receipt: o.receipt.slice(0, 40),
    notes: o.notes ?? {},
    payment: {
      capture: 'manual',
      capture_options: { manual_expiry_period: Math.min(7200, o.manualExpiryMinutes ?? 4320), refund_speed: 'normal' },
    },
  });
}

export const fetchPayment = (cfg: RazorpayConfig, paymentId: string) =>
  call<RazorpayPayment>(cfg, 'GET', `/payments/${encodeURIComponent(paymentId)}`);

export async function listOrderPayments(cfg: RazorpayConfig, orderId: string): Promise<RazorpayPayment[]> {
  const res = await call<{ items: RazorpayPayment[] }>(cfg, 'GET', `/orders/${encodeURIComponent(orderId)}/payments`);
  return res.items ?? [];
}

export const capturePayment = (cfg: RazorpayConfig, paymentId: string, amountPaise: number) =>
  call<RazorpayPayment>(cfg, 'POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: 'INR' });

export const refundPayment = (cfg: RazorpayConfig, paymentId: string, r: { amountPaise?: number; receipt?: string; notes?: Record<string, string> }) =>
  call<RazorpayRefund>(cfg, 'POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
    ...(r.amountPaise !== undefined ? { amount: r.amountPaise } : {}),
    speed: 'normal',
    ...(r.receipt ? { receipt: r.receipt.slice(0, 40) } : {}),
    notes: r.notes ?? {},
  });

/** Checkout success signature: hex HMAC-SHA256("{our stored order_id}|{payment_id}", key secret). */
export async function verifyPaymentSignature(keySecret: string, orderId: string, paymentId: string, signature: string): Promise<boolean> {
  if (!signature || !orderId || !paymentId) return false;
  return constantTimeEqual(await hmacHex(keySecret, `${orderId}|${paymentId}`), signature.toLowerCase());
}

/** Webhook signature: hex HMAC-SHA256 of the raw request body with the webhook secret. */
export async function verifyWebhookSignature(webhookSecret: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!webhookSecret || !signature) return false;
  return constantTimeEqual(await hmacHex(webhookSecret, rawBody), signature.toLowerCase());
}

/** A payment we may fulfil an order with: authorised or captured, for exactly this order and amount. */
export function paymentMatches(p: RazorpayPayment, expected: { razorpayOrderId: string; amountPaise: number }): boolean {
  return (p.status === 'authorized' || p.status === 'captured') && p.order_id === expected.razorpayOrderId && p.amount === expected.amountPaise && p.currency === 'INR';
}
