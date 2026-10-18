import { describe, expect, it } from 'vitest';
import {
  RazorpayError, capturePayment, createOrder, fetchPayment, listOrderPayments, paymentMatches, verifyPaymentSignature, verifyWebhookSignature,
  type RazorpayConfig, type RazorpayPayment,
} from '../../src/lib/store/razorpay';
import { hmacHex } from '../../src/lib/store/tokens';

function mock(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  const cfg: RazorpayConfig = { keyId: 'rzp_test_abc', keySecret: 'secret', fetch: fetchImpl };
  return { cfg, calls };
}

describe('Razorpay API calls', () => {
  it('creates an order with manual capture and basic auth', async () => {
    const { cfg, calls } = mock([{ body: { id: 'order_1', amount: 69900, amount_paid: 0, currency: 'INR', receipt: 'HL-2610-0001', status: 'created' } }]);
    const order = await createOrder(cfg, { amountPaise: 69900, receipt: 'HL-2610-0001', notes: { order_no: 'HL-2610-0001' } });
    expect(order.id).toBe('order_1');
    expect(calls[0].url).toBe('https://api.razorpay.com/v1/orders');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('rzp_test_abc:secret')}`);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      amount: 69900, currency: 'INR', receipt: 'HL-2610-0001', notes: { order_no: 'HL-2610-0001' },
      payment: { capture: 'manual', capture_options: { manual_expiry_period: 4320, refund_speed: 'normal' } },
    });
  });

  it('fetches, lists and captures payments', async () => {
    const pay = { id: 'pay_1', amount: 69900, currency: 'INR', status: 'authorized', order_id: 'order_1' };
    const { cfg, calls } = mock([{ body: pay }, { body: { items: [pay] } }, { body: { ...pay, status: 'captured' } }]);
    expect((await fetchPayment(cfg, 'pay_1')).status).toBe('authorized');
    expect(await listOrderPayments(cfg, 'order_1')).toHaveLength(1);
    expect((await capturePayment(cfg, 'pay_1', 69900)).status).toBe('captured');
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ['GET', 'https://api.razorpay.com/v1/payments/pay_1'],
      ['GET', 'https://api.razorpay.com/v1/orders/order_1/payments'],
      ['POST', 'https://api.razorpay.com/v1/payments/pay_1/capture'],
    ]);
    expect(JSON.parse(calls[2].init.body as string)).toEqual({ amount: 69900, currency: 'INR' });
  });

  it('turns API errors into RazorpayError with the description', async () => {
    const { cfg } = mock([{ status: 400, body: { error: { code: 'BAD_REQUEST_ERROR', description: 'Payment is not in authorized state' } } }]);
    const err = await capturePayment(cfg, 'pay_1', 100).catch((e) => e);
    expect(err).toBeInstanceOf(RazorpayError);
    expect(err).toMatchObject({ status: 400, code: 'BAD_REQUEST_ERROR', message: 'Payment is not in authorized state' });
  });
});

describe('signatures', () => {
  it('verifies the checkout signature over order_id|payment_id', async () => {
    const sig = await hmacHex('secret', 'order_1|pay_1');
    expect(await verifyPaymentSignature('secret', 'order_1', 'pay_1', sig)).toBe(true);
    expect(await verifyPaymentSignature('secret', 'order_2', 'pay_1', sig)).toBe(false);
    expect(await verifyPaymentSignature('other', 'order_1', 'pay_1', sig)).toBe(false);
    expect(await verifyPaymentSignature('secret', 'order_1', 'pay_1', '')).toBe(false);
  });

  it('verifies webhooks over the exact raw body', async () => {
    const body = '{"event":"payment.authorized","payload":{}}';
    const sig = await hmacHex('whsec', body);
    expect(await verifyWebhookSignature('whsec', body, sig)).toBe(true);
    expect(await verifyWebhookSignature('whsec', `${body} `, sig)).toBe(false);
    expect(await verifyWebhookSignature('whsec', body, null)).toBe(false);
    expect(await verifyWebhookSignature('', body, sig)).toBe(false);
  });
});

describe('paymentMatches', () => {
  const p: RazorpayPayment = { id: 'pay_1', amount: 69900, currency: 'INR', status: 'authorized', order_id: 'order_1' };
  it('accepts authorised or captured payments for exactly this order and amount', () => {
    expect(paymentMatches(p, { razorpayOrderId: 'order_1', amountPaise: 69900 })).toBe(true);
    expect(paymentMatches({ ...p, status: 'captured' }, { razorpayOrderId: 'order_1', amountPaise: 69900 })).toBe(true);
    expect(paymentMatches({ ...p, status: 'failed' }, { razorpayOrderId: 'order_1', amountPaise: 69900 })).toBe(false);
    expect(paymentMatches(p, { razorpayOrderId: 'order_2', amountPaise: 69900 })).toBe(false);
    expect(paymentMatches(p, { razorpayOrderId: 'order_1', amountPaise: 100 })).toBe(false);
    expect(paymentMatches({ ...p, currency: 'USD' }, { razorpayOrderId: 'order_1', amountPaise: 69900 })).toBe(false);
  });
});
