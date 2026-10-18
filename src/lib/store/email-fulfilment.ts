/** Shipping / cancellation / refund emails (outbox `email.shipped|delivered|cancelled|refunded`). */
import { needsCodConfirmation } from './cod';
import { sendEmail, type Email } from './email';
import { orderViewUrl } from './email-handlers';
import { formatINR } from './money';
import type { OutboxHandler } from './outbox';
import type { OrderRow } from './orders';
import { getSettings, type StoreSettings } from './settings';
import { absolute, safeHttpsUrl } from './urls';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const first = (o: OrderRow) => esc(o.customer_name.split(' ')[0]);

function wrap(title: string, body: string, s: StoreSettings) {
  const care = [s.customer_care_email, s.customer_care_phone].filter(Boolean).map(esc).join(' · ');
  return `<!doctype html><html><body style="margin:0;background:#f6f6f3;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px"><tr><td style="padding:24px"><p style="margin:0;font-weight:bold;color:#196a5e">HariLeaf</p><h1 style="font-size:20px">${esc(title)}</h1><div style="font-size:14px;line-height:1.55">${body}</div></td></tr><tr><td style="padding:16px 24px;border-top:1px solid #eee;font-size:12px;color:#666">${care ? `Questions? ${care}` : ''}</td></tr></table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p><a href="${esc(href)}" style="display:inline-block;background:#196a5e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:bold">${esc(label)}</a></p>`;

export function shippedEmail(o: OrderRow, viewUrl: string, s: StoreSettings): Email {
  const invoiceUrl = viewUrl.replace(`/order/${o.order_no}?`, `/order/${o.order_no}/invoice?`);
  const trackingUrl = safeHttpsUrl(o.tracking_url);
  const track = trackingUrl ? button(trackingUrl, 'Track your parcel') : '';
  const docLink = o.total_paise > 0 ? `<a href="${esc(invoiceUrl)}">Download your GST invoice</a> · ` : '';
  const body = `<p>Hi ${first(o)}, your order <strong>${esc(o.order_no)}</strong> is on its way${o.courier ? ` with ${esc(o.courier)}` : ''}${o.awb ? ` (AWB ${esc(o.awb)})` : ''}.</p>${track}<p>${docLink}<a href="${esc(viewUrl)}">View your order</a></p>`;
  return { to: o.email, subject: `Order ${o.order_no} has shipped — HariLeaf`, html: wrap('Your order is on its way', body, s), text: `Your order ${o.order_no} has shipped.${trackingUrl ? ` Track: ${trackingUrl}` : ''}${o.total_paise > 0 ? `\nInvoice: ${invoiceUrl}` : ''}\nOrder: ${viewUrl}`, idempotencyKey: `email.shipped/${o.order_no}`, replyTo: s.customer_care_email || undefined };
}

export function deliveredEmail(o: OrderRow, viewUrl: string, s: StoreSettings): Email {
  const body = `<p>Hi ${first(o)}, your order <strong>${esc(o.order_no)}</strong> has been delivered. We hope you enjoy it!</p><p>Something not right — a damaged pack or a wrong item? Reply to this email with a photo within 48 hours and we'll send a replacement or refund it. See our <a href="${absolute('/refund-policy/')}">refund policy</a>.</p>${button(viewUrl, 'View your order')}`;
  return { to: o.email, subject: `Order ${o.order_no} delivered — HariLeaf`, html: wrap('Delivered', body, s), text: `Your order ${o.order_no} has been delivered. Damaged or wrong item? Reply with a photo within 48 hours.\n${viewUrl}`, idempotencyKey: `email.delivered/${o.order_no}`, replyTo: s.customer_care_email || undefined };
}

export function cancelledEmail(o: OrderRow, viewUrl: string, s: StoreSettings): Email {
  const money =
    o.payment_method === 'cod' || o.total_paise === 0
      ? 'No payment was taken.'
      : o.payment_status === 'refund_pending' || o.payment_status === 'refunded'
        ? `We're refunding ${formatINR(o.total_paise)} to your original payment method; it usually arrives within 5–7 business days.`
        : 'Your payment was not captured, so your bank will release the authorised amount automatically.';
  const body = `<p>Hi ${first(o)}, your order <strong>${esc(o.order_no)}</strong> has been cancelled${o.cancel_reason ? ` (${esc(o.cancel_reason)})` : ''}.</p><p>${esc(money)}</p>${button(viewUrl, 'View your order')}`;
  return { to: o.email, subject: `Order ${o.order_no} cancelled — HariLeaf`, html: wrap('Order cancelled', body, s), text: `Your order ${o.order_no} has been cancelled. ${money}\n${viewUrl}`, idempotencyKey: `email.cancelled/${o.order_no}`, replyTo: s.customer_care_email || undefined };
}

export function refundedEmail(o: OrderRow, viewUrl: string, s: StoreSettings): Email {
  const how = o.payment_method === 'cod' ? 'to the bank account / UPI you shared with us' : 'to your original payment method';
  const body = `<p>Hi ${first(o)}, we've refunded <strong>${formatINR(o.total_paise)}</strong> for order <strong>${esc(o.order_no)}</strong> ${how}. Depending on your bank it can take up to 5–7 business days to appear.</p>${button(viewUrl, 'View your order')}`;
  return { to: o.email, subject: `Refund for order ${o.order_no} — HariLeaf`, html: wrap('Your refund is on its way', body, s), text: `We've refunded ${formatINR(o.total_paise)} for order ${o.order_no} ${how}.\n${viewUrl}`, idempotencyKey: `email.refunded/${o.order_no}`, replyTo: s.customer_care_email || undefined };
}

export function codReminderEmail(o: OrderRow, viewUrl: string, s: StoreSettings): Email {
  const body = `<p>Hi ${first(o)}, your cash-on-delivery order <strong>${esc(o.order_no)}</strong> (${formatINR(o.total_paise)}) is waiting for your confirmation before we ship it.</p>${button(`${viewUrl}#confirm`, 'Confirm my order')}<p style="color:#666;font-size:12px">Didn't place this order, or changed your mind? You can cancel it from the same page.</p>`;
  return { to: o.email, subject: `Reminder: confirm your order ${o.order_no} — HariLeaf`, html: wrap('Please confirm your order', body, s), text: `Your COD order ${o.order_no} is waiting for your confirmation: ${viewUrl}#confirm`, idempotencyKey: `email.cod_reminder/${o.order_no}`, replyTo: s.customer_care_email || undefined };
}

export function orderLinkEmail(o: OrderRow, viewUrl: string, s: StoreSettings, rowId: number): Email {
  const body = `<p>Hi ${first(o)}, here is the link to your order <strong>${esc(o.order_no)}</strong>. Keep this email — anyone with the link can see the order. Links sent to you earlier for this order no longer work.</p>${button(viewUrl, 'View your order')}<p style="color:#666;font-size:12px">Didn't ask for this? You can ignore this email.</p>`;
  return { to: o.email, subject: `Your link to order ${o.order_no} — HariLeaf`, html: wrap('Your order link', body, s), text: `Your order ${o.order_no}: ${viewUrl}`, idempotencyKey: `email.order_link/${o.order_no}/${rowId}`, replyTo: s.customer_care_email || undefined };
}

export function makeFulfilmentEmailHandlers(fetchImpl?: typeof fetch): Record<string, OutboxHandler> {
  const handler = (build: (o: OrderRow, url: string, s: StoreSettings) => Email): OutboxHandler => async (_p, { env, row }) => {
    const o = await env.STORE_DB.prepare('SELECT * FROM orders WHERE id = ?').bind(row.order_id).first<OrderRow>();
    if (!o) throw new Error(`order ${row.order_id} not found`);
    await sendEmail(env, build(o, await orderViewUrl(env, o), await getSettings(env.STORE_DB)), fetchImpl);
  };
  return {
    'email.shipped': handler(shippedEmail),
    'email.delivered': handler(deliveredEmail),
    'email.cancelled': handler(cancelledEmail),
    'email.refunded': handler(refundedEmail),
    'email.order_link': async (_p, { env, row }) => {
      const o = await env.STORE_DB.prepare('SELECT * FROM orders WHERE id = ?').bind(row.order_id).first<OrderRow>();
      if (!o) return;
      await sendEmail(env, orderLinkEmail(o, await orderViewUrl(env, o), await getSettings(env.STORE_DB), row.id), fetchImpl);
    },
    'email.cod_reminder': async (_p, { env, row }) => {
      const o = await env.STORE_DB.prepare('SELECT * FROM orders WHERE id = ?').bind(row.order_id).first<OrderRow>();
      if (!o || !needsCodConfirmation(o)) return; // confirmed or cancelled meanwhile
      await sendEmail(env, codReminderEmail(o, await orderViewUrl(env, o), await getSettings(env.STORE_DB)), fetchImpl);
    },
  };
}
