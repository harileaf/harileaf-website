/**
 * Transactional email via Resend, sent from outbox handlers. Each send carries
 * an Idempotency-Key (`<kind>/<order_no>`) so a retried outbox row never sends
 * twice within Resend's 24 h window (409 = same send still in flight → retry). Without RESEND_API_KEY (local dev) emails
 * are logged and skipped.
 */
import { needsCodConfirmation } from './cod';
import { timedFetch } from './http';
import { formatINR } from './money';
import type { OrderItemRow, OrderRow } from './orders';
import type { StoreSettings } from './settings';
import { absolute } from './urls';

export const FROM = 'HariLeaf <orders@harileaf.org>';

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  replyTo?: string;
}

export async function sendEmail(env: Env, e: Email, fetchImpl: typeof fetch = fetch): Promise<'sent' | 'skipped'> {
  if (!env.RESEND_API_KEY) {
    console.log(JSON.stringify({ msg: 'email skipped (no RESEND_API_KEY)', to: e.to, subject: e.subject }));
    return 'skipped';
  }
  const res = await timedFetch(fetchImpl)('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'harileaf-store/1.0',
      'Idempotency-Key': e.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({ from: FROM, to: [e.to], subject: e.subject, html: e.html, text: e.text, ...(e.replyTo ? { reply_to: e.replyTo } : {}) }),
  });
  if (res.ok) return 'sent';
  const body = await res.text().catch(() => '');
  // 409 concurrent_idempotent_requests: the same send is still in flight — retry later.
  throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(title: string, bodyHtml: string, settings: StoreSettings): string {
  const care = [settings.customer_care_email, settings.customer_care_phone].filter(Boolean).map(esc).join(' · ');
  return `<!doctype html><html><body style="margin:0;background:#f6f6f3;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px">
<tr><td style="padding:24px 24px 8px"><p style="margin:0;font-weight:bold;color:#196a5e;font-size:18px">HariLeaf</p>
<h1 style="font-size:20px;margin:12px 0 0">${esc(title)}</h1></td></tr>
<tr><td style="padding:8px 24px 24px;font-size:14px;line-height:1.55">${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #eee;font-size:12px;color:#666">${care ? `Questions? ${care}<br>` : ''}${esc(settings.legal_name || 'HariLeaf')}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Lines at their price before any coupon; the discount follows as its own row. */
function itemsTable(items: OrderItemRow[], o?: Pick<OrderRow, 'coupon_code' | 'discount_paise'>): { html: string; text: string } {
  const gross = (i: OrderItemRow) => i.unit_price_paise * i.qty;
  const discount = o?.coupon_code && o.discount_paise > 0 ? o : null;
  const rows = items
    .map((i) => `<tr><td style="padding:6px 0">${esc(i.product_name)} · ${esc(i.variant_label)} × ${i.qty}</td><td align="right" style="padding:6px 0">${formatINR(gross(i))}</td></tr>`)
    .join('');
  const discountRow = discount ? `<tr><td style="padding:6px 0;color:#1d6b3a">Discount (${esc(discount.coupon_code!)})</td><td align="right" style="padding:6px 0;color:#1d6b3a">−${formatINR(discount.discount_paise)}</td></tr>` : '';
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}${discountRow}</table>`,
    text: [
      ...items.map((i) => `- ${i.product_name} · ${i.variant_label} × ${i.qty}: ${formatINR(gross(i))}`),
      ...(discount ? [`- Discount (${discount.coupon_code}): −${formatINR(discount.discount_paise)}`] : []),
    ].join('\n'),
  };
}

const address = (o: OrderRow) => [o.customer_name, o.ship_line1, o.ship_line2, `${o.ship_city}, ${o.ship_state} ${o.ship_pincode}`].filter(Boolean).join(', ');

export function orderPlacedEmail(o: OrderRow, items: OrderItemRow[], viewUrl: string, settings: StoreSettings): Email {
  const t = itemsTable(items, o);
  const pay =
    o.payment_method === 'cod'
      ? `Cash on delivery — please keep ${formatINR(o.total_paise)} ready.`
      : o.payment_status === 'paid'
        ? `Paid online — ${formatINR(o.total_paise)}.`
        : `Payment of ${formatINR(o.total_paise)} received and being confirmed by your bank.`;
  const confirm = needsCodConfirmation(o);
  const confirmHtml = confirm
    ? `<div style="background:#fff4e0;border:1px solid #e8c37a;border-radius:10px;padding:12px 14px;margin:12px 0"><p style="margin:0 0 8px"><strong>One quick step:</strong> please confirm your cash-on-delivery order so we can ship it.</p><a href="${esc(viewUrl)}#confirm" style="display:inline-block;background:#196a5e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:bold">Confirm my order</a></div>`
    : '';
  const preorderDay = o.is_preorder === 1 && o.expected_dispatch_date
    ? new Date(`${o.expected_dispatch_date}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : null;
  const when = preorderDay
    ? `This is a pre-order: we expect to dispatch it from <strong>${esc(preorderDay)}</strong> and will email you when it's ready, and again with tracking. You can cancel for a full refund any time before then.`
    : `We'll pack it within 2 business days ${confirm ? 'of your confirmation ' : ''}and email you a tracking link when it ships.`;
  const html = `<p>Hi ${esc(o.customer_name.split(' ')[0])}, thank you for your order <strong>${esc(o.order_no)}</strong>. ${when}</p>
${confirmHtml}
${t.html}
<p style="margin-top:12px"><strong>Total: ${formatINR(o.total_paise)}</strong> (inclusive of GST, free delivery)<br>${esc(pay)}</p>
<p><strong>Delivering to:</strong> ${esc(address(o))}</p>
<p><a href="${esc(viewUrl)}" style="display:inline-block;background:#196a5e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:bold">View your order</a></p>
<p style="color:#666;font-size:12px">This email acknowledges your ${o.payment_method === 'cod' ? 'order' : 'payment'}. Your GST invoice is issued when the order is dispatched. You can cancel free of charge until it's packed — see our <a href="${absolute('/refund-policy/')}">refund policy</a>.</p>`;
  const text = `Thank you for your order ${o.order_no}.${confirm ? `\n\nPlease confirm your cash-on-delivery order so we can ship it: ${viewUrl}#confirm` : ''}\n\n${t.text}\n\nTotal: ${formatINR(o.total_paise)} (incl. GST, free delivery)\n${pay}\nDelivering to: ${address(o)}\n\nView your order: ${viewUrl}\n\nYour GST invoice is issued when the order is dispatched.`;
  return { to: o.email, subject: confirm ? `Please confirm your order ${o.order_no} — HariLeaf` : `Order ${o.order_no} confirmed — HariLeaf`, html: layout(confirm ? 'Thank you — one quick step' : 'Your order is confirmed', html, settings), text, idempotencyKey: `email.placed/${o.order_no}`, replyTo: settings.customer_care_email || undefined };
}

export function ownerNewOrderEmail(o: OrderRow, items: OrderItemRow[], settings: StoreSettings): Email | null {
  if (!settings.notify_email) return null;
  const t = itemsTable(items, o);
  const html = `<p><strong>${esc(o.order_no)}</strong> · ${o.payment_method === 'cod' ? 'COD' : 'Prepaid'} · ${formatINR(o.total_paise)}</p>${t.html}<p>${esc(address(o))}<br>${esc(o.phone)} · ${esc(o.email)}</p><p><a href="${absolute('/admin/')}">Open admin</a></p>`;
  return {
    to: settings.notify_email,
    subject: `New order ${o.order_no} — ${formatINR(o.total_paise)} (${o.payment_method === 'cod' ? 'COD' : 'prepaid'})`,
    html: layout('New order', html, settings),
    text: `New order ${o.order_no} (${o.payment_method}) ${formatINR(o.total_paise)}\n${t.text}\n${address(o)}\n${o.phone} ${o.email}`,
    idempotencyKey: `email.owner_new_order/${o.order_no}`,
  };
}

export function paymentReleasedEmail(o: OrderRow, settings: StoreSettings, why: 'stock' | 'coupon' = 'stock'): Email {
  const lost = why === 'coupon' ? `the discount code ${esc(o.coupon_code ?? '')} can no longer be used for it` : 'they have since sold out';
  const html = `<p>Hi ${esc(o.customer_name.split(' ')[0])}, your payment for order <strong>${esc(o.order_no)}</strong> reached us after the time we could hold your items, and ${lost}.</p>
<p><strong>We have not charged you.</strong> The amount was only authorised, and your bank will release it automatically — usually within 5–7 days.</p>
<p>We're sorry for the trouble. You're welcome to <a href="${absolute('/shop/')}">order again</a>.</p>`;
  return {
    to: o.email,
    subject: `Order ${o.order_no}: payment not taken — HariLeaf`,
    html: layout("We couldn't complete your order", html, settings),
    text: `Your payment for order ${o.order_no} arrived after we could hold your items, and ${why === 'coupon' ? `the discount code ${o.coupon_code ?? ''} can no longer be used for it` : 'they sold out'}. We have not charged you; your bank will release the authorised amount automatically (usually within 5–7 days).`,
    idempotencyKey: `email.payment_released/${o.order_no}`,
    replyTo: settings.customer_care_email || undefined,
  };
}
