import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { validateCheckoutInput } from '../../src/lib/store/checkout-input';
import { orderPlacedEmail, sendEmail } from '../../src/lib/store/email';
import { makeEmailHandlers } from '../../src/lib/store/email-handlers';
import { createOrder, getOrderByNo, viewTokenFor } from '../../src/lib/store/orders';
import { quoteCart } from '../../src/lib/store/quote';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { db, insertProduct, insertVariant } from '../helpers/fixtures';

const NOW = new Date('2026-10-18T06:30:00Z');

async function codOrder(name = 'Asha <b>Rao</b>') {
  const v = await insertVariant(await insertProduct({ name: 'Karjat 3 <Rice>' }), { stock_qty: 5, price_paise: 69900, mrp_paise: 79900 });
  const quote = await quoteCart(db, [{ variantId: v, qty: 1 }], { today: NOW, settings: { ...SETTING_DEFAULTS, min_order_paise: '100' } });
  const co = validateCheckoutInput({ contact: { name, email: 'asha@example.com', phone: '9820012345' }, ship: { line1: '12 Lake Road', city: 'Mumbai', stateCode: '27', pincode: '400092' }, paymentMethod: 'cod' });
  if (!co.ok) throw new Error('co');
  const key = `email-test-${crypto.randomUUID()}`;
  const r = await createOrder(db, { quote, checkout: co.value, idempotencyKey: key, sellerStateCode: '27', tokenSecret: 'sek', now: NOW });
  if (!r.ok) throw new Error(r.message);
  return { ...r, key };
}

describe('order emails', () => {
  it('escapes customer and product text and links the order with its token', async () => {
    const o = await codOrder();
    const view = await getOrderByNo(db, o.orderNo);
    // Waiting for COD confirmation: asks the customer to confirm, via the order page (a POST there, not a GET link action).
    const email = orderPlacedEmail({ ...view!.order, cod_confirmed_at: null }, view!.items, `https://harileaf.org/order/${o.orderNo}?t=${o.viewToken}`, SETTING_DEFAULTS);
    expect(email.html).not.toMatch(/<b>Rao|<Rice>/);
    expect(email.html).toContain('Karjat 3 &lt;Rice&gt;');
    expect(email.html).toContain(`?t=${o.viewToken}`);
    expect(email.idempotencyKey).toBe(`email.placed/${o.orderNo}`);
    expect(email.subject).toBe(`Please confirm your order ${o.orderNo} — HariLeaf`);
    expect(email.html).toContain(`?t=${o.viewToken}#confirm`);
    const plain = orderPlacedEmail(view!.order, view!.items, `https://harileaf.org/order/${o.orderNo}?t=${o.viewToken}`, SETTING_DEFAULTS); // confirmed at placement
    expect(plain.subject).toBe(`Order ${o.orderNo} confirmed — HariLeaf`);
    expect(plain.html).not.toContain('#confirm');
  });

  it('sends to the customer and the owner through Resend with idempotency keys', async () => {
    await putSettings(db, { ...SETTING_DEFAULTS, notify_email: 'owner@harileaf.org', customer_care_email: 'care@harileaf.org' });
    const o = await codOrder('Asha Rao');
    const sent: Array<{ headers: Record<string, string>; body: { to: string[]; subject: string; reply_to?: string } }> = [];
    const fake = (async (_url: string, init: RequestInit) => {
      sent.push({ headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
      return new Response('{"id":"e1"}', { status: 200 });
    }) as unknown as typeof fetch;
    const handlers = makeEmailHandlers(fake);
    const testEnv = { ...env, RESEND_API_KEY: 're_test', ORDER_TOKEN_SECRET: 'sek' } as Env;
    await handlers['email.placed']({}, { env: testEnv, row: { id: 1, order_id: o.orderId, kind: 'email.placed', payload: {}, attempts: 1 } });
    await handlers['email.owner_new_order']({}, { env: testEnv, row: { id: 2, order_id: o.orderId, kind: 'email.owner_new_order', payload: {}, attempts: 1 } });
    expect(sent.map((s) => s.body.to[0])).toEqual(['asha@example.com', 'owner@harileaf.org']);
    expect(sent[1].headers['Idempotency-Key']).toBe(`email.owner_new_order/${o.orderNo}`);
    expect(sent[0].headers['Idempotency-Key']).toBe(`email.placed/${o.orderNo}`);
    expect(sent[0].headers['User-Agent']).toBeTruthy();
    expect(sent[0].body.reply_to).toBe('care@harileaf.org');
    const token = await viewTokenFor('sek', o.key);
    expect(JSON.stringify(sent[0].body)).toContain(`/order/${o.orderNo}?t=${token}`);
  });

  it('skips sending without an API key and throws on Resend errors so the outbox retries', async () => {
    const e = { to: 'a@b.co', subject: 's', html: 'h', text: 't', idempotencyKey: 'k' };
    expect(await sendEmail({ ...env, RESEND_API_KEY: undefined } as Env, e)).toBe('skipped');
    const failing = (async () => new Response('{"name":"rate_limit_exceeded"}', { status: 429 })) as unknown as typeof fetch;
    await expect(sendEmail({ ...env, RESEND_API_KEY: 're_x' } as Env, e, failing)).rejects.toThrow(/Resend 429/);
  });
});
