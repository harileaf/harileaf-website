/** Shipping / cancellation / refund emails (outbox `email.shipped|delivered|cancelled|refunded`). */
import { needsCodConfirmation } from './cod';
import { sendEmail, type Email } from './email';
import { orderViewUrl } from './email-handlers';
import { formatINR } from './money';
import type { OutboxHandler } from './outbox';
import type { OrderRow } from './orders';
import { getSettings, type StoreSettings } from './settings';
import { reviewTokenFor } from './reviews';
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

/** `reviewUrl` is null for free replacements (only the original order can be reviewed). */
export function deliveredEmail(o: OrderRow, viewUrl: string, s: StoreSettings, reviewUrl: string | null = null, perishable = false): Email {
  // Fresh produce: report damage within 24 hours (refund policy); packs: 48 hours.
  const within = perishable ? '24 hours' : '48 hours';
  // A plain request: no reward, and no hint that only good reviews are wanted (IS 19000:2022).
  const review = reviewUrl ? `<p>Once you've tried it, would you tell other shoppers what you thought? Good or bad, every honest review is published.</p>${button(reviewUrl, 'Review your order')}` : '';
  const body = `<p>Hi ${first(o)}, your order <strong>${esc(o.order_no)}</strong> has been delivered. We hope you enjoy it!</p><p>Something not right — ${perishable ? 'fruit that arrived damaged' : 'a damaged pack'} or a wrong item? Reply to this email with a photo within ${within} and we'll send a replacement or refund it. See our <a href="${absolute('/refund-policy/')}">refund policy</a>.</p>${review}<p><a href="${esc(viewUrl)}">View your order</a></p>`;
  return { to: o.email, subject: `Order ${o.order_no} delivered — HariLeaf`, html: wrap('Delivered', body, s), text: `Your order ${o.order_no} has been delivered. Damaged or wrong item? Reply with a photo within ${within}.${reviewUrl ? `\nReview your order: ${reviewUrl}` : ''}\n${viewUrl}`, idempotencyKey: `email.delivered/${o.order_no}`, replyTo: s.customer_care_email || undefined };
}

const longDay = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

/** Pre-order: the harvest is in and the order is leaving the farm (sent by "Ready to dispatch"). */
export function readyToDispatchEmail(o: OrderRow, viewUrl: string, s: StoreSettings): Email {
  const body = `<p>Hi ${first(o)}, good news: your pre-order <strong>${esc(o.order_no)}</strong> is packed and ready to leave the farm. We'll email you the tracking link as soon as the courier collects it.</p>${button(viewUrl, 'View your order')}`;
  return { to: o.email, subject: `Your pre-order ${o.order_no} is ready to dispatch — HariLeaf`, html: wrap('Your pre-order is on its way soon', body, s), text: `Your pre-order ${o.order_no} is packed and ready to leave the farm. Tracking follows when the courier collects it.\n${viewUrl}`, idempotencyKey: `email.ready_to_dispatch/${o.order_no}`, replyTo: s.customer_care_email || undefined };
}

/** Pre-order pushed back: the new date, the reason, and a one-click cancel (full refund) on the order page. */
export function preorderDelayedEmail(o: OrderRow, viewUrl: string, s: StoreSettings, d: { from: string | null; to: string; reason: string }): Email {
  const body = `<p>Hi ${first(o)}, we're sorry: your pre-order <strong>${esc(o.order_no)}</strong> will now be dispatched from <strong>${esc(longDay(d.to))}</strong>${d.from ? ` instead of ${esc(longDay(d.from))}` : ''}.</p><p>Why: ${esc(d.reason)}</p><p>If that no longer works for you, you can cancel for a full refund to your original payment method — no questions asked. The button opens your order page, where you confirm the cancellation.</p>${button(`${viewUrl}#cancel`, 'Review or cancel your order')}<p>To keep your order, you don't need to do anything.</p>`;
  return {
    to: o.email,
    subject: `New dispatch date for your pre-order ${o.order_no} — HariLeaf`,
    html: wrap('Your pre-order has a new date', body, s),
    text: `Your pre-order ${o.order_no} will now be dispatched from ${longDay(d.to)}${d.from ? ` instead of ${longDay(d.from)}` : ''}.\nWhy: ${d.reason}\nTo keep your order, do nothing. To cancel for a full refund, confirm it on your order page: ${viewUrl}#cancel`,
    idempotencyKey: `email.preorder_delayed/${o.order_no}/${d.to}`,
    replyTo: s.customer_care_email || undefined,
  };
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
  const hours = Number(s.cod_confirm_window_hours);
  const deadline = hours > 0 ? ` If it isn't confirmed within ${hours} hours of ordering, we'll cancel it and release the items.` : '';
  const body = `<p>Hi ${first(o)}, your cash-on-delivery order <strong>${esc(o.order_no)}</strong> (${formatINR(o.total_paise)}) is waiting for your confirmation before we ship it.${deadline}</p>${button(`${viewUrl}#confirm`, 'Confirm my order')}<p style="color:#666;font-size:12px">Didn't place this order, or changed your mind? You can cancel it from the same page.</p>`;
  return { to: o.email, subject: `Reminder: confirm your order ${o.order_no} — HariLeaf`, html: wrap('Please confirm your order', body, s), text: `Your COD order ${o.order_no} is waiting for your confirmation: ${viewUrl}#confirm`, idempotencyKey: `email.cod_reminder/${o.order_no}`, replyTo: s.customer_care_email || undefined };
}

export function orderLinkEmail(o: OrderRow, viewUrl: string, s: StoreSettings, rowId: number): Email {
  const body = `<p>Hi ${first(o)}, here is the link to your order <strong>${esc(o.order_no)}</strong>. Keep this email — anyone with the link can see the order. Links sent to you earlier for this order no longer work.</p>${button(viewUrl, 'View your order')}<p style="color:#666;font-size:12px">Didn't ask for this? You can ignore this email.</p>`;
  return { to: o.email, subject: `Your link to order ${o.order_no} — HariLeaf`, html: wrap('Your order link', body, s), text: `Your order ${o.order_no}: ${viewUrl}`, idempotencyKey: `email.order_link/${o.order_no}/${rowId}`, replyTo: s.customer_care_email || undefined };
}

export function replacementPlacedEmail(o: OrderRow, viewUrl: string, s: StoreSettings, originalOrderNo: string): Email {
  const body = `<p>Hi ${first(o)}, we're sorry your order <strong>${esc(originalOrderNo)}</strong> wasn't right. We're sending a free replacement as order <strong>${esc(o.order_no)}</strong> — there's nothing to pay. We'll email you a tracking link when it ships.</p>${button(viewUrl, 'View the replacement')}`;
  return { to: o.email, subject: `Replacement for order ${originalOrderNo} — HariLeaf`, html: wrap('Your replacement is on the way', body, s), text: `We're sending a free replacement for order ${originalOrderNo} as order ${o.order_no}. Nothing to pay.\n${viewUrl}`, idempotencyKey: `email.replacement_placed/${o.order_no}`, replyTo: s.customer_care_email || undefined };
}

export function makeFulfilmentEmailHandlers(fetchImpl?: typeof fetch): Record<string, OutboxHandler> {
  const handler = (build: (o: OrderRow, url: string, s: StoreSettings) => Email): OutboxHandler => async (_p, { env, row }) => {
    const o = await env.STORE_DB.prepare('SELECT * FROM orders WHERE id = ?').bind(row.order_id).first<OrderRow>();
    if (!o) throw new Error(`order ${row.order_id} not found`);
    await sendEmail(env, build(o, await orderViewUrl(env, o), await getSettings(env.STORE_DB)), fetchImpl);
  };
  return {
    'email.shipped': handler(shippedEmail),
    'email.delivered': async (_p, { env, row }) => {
      const o = await env.STORE_DB.prepare('SELECT * FROM orders WHERE id = ?').bind(row.order_id).first<OrderRow & { replacement_for_order_id: number | null }>();
      if (!o) throw new Error(`order ${row.order_id} not found`);
      const reviewUrl = o.replacement_for_order_id === null && o.idempotency_key && env.ORDER_TOKEN_SECRET
        ? absolute(`/review?o=${o.order_no}&t=${await reviewTokenFor(env.ORDER_TOKEN_SECRET, o.idempotency_key)}`)
        : null;
      const perishable = Boolean(await env.STORE_DB.prepare('SELECT 1 AS p FROM order_items WHERE order_id = ? AND perishable = 1').bind(o.id).first());
      await sendEmail(env, deliveredEmail(o, await orderViewUrl(env, o), await getSettings(env.STORE_DB), reviewUrl, perishable), fetchImpl);
    },
    'email.cancelled': handler(cancelledEmail),
    'email.ready_to_dispatch': handler(readyToDispatchEmail),
    'email.preorder_delayed': async (payload: { from?: string | null; to?: string; reason?: string }, { env, row }) => {
      const o = await env.STORE_DB.prepare('SELECT * FROM orders WHERE id = ?').bind(row.order_id).first<OrderRow>();
      if (!o) throw new Error(`order ${row.order_id} not found`);
      if (o.status !== 'placed' || !payload.to) return; // cancelled or dispatched meanwhile
      await sendEmail(env, preorderDelayedEmail(o, await orderViewUrl(env, o), await getSettings(env.STORE_DB), { from: payload.from ?? null, to: payload.to, reason: payload.reason ?? '' }), fetchImpl);
    },
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
    'email.replacement_placed': async (_p, { env, row }) => {
      const o = await env.STORE_DB.prepare('SELECT * FROM orders WHERE id = ?').bind(row.order_id).first<OrderRow & { replacement_for_order_id: number | null }>();
      if (!o) throw new Error(`order ${row.order_id} not found`);
      const orig = await env.STORE_DB.prepare('SELECT order_no FROM orders WHERE id = ?').bind(o.replacement_for_order_id).first<{ order_no: string }>();
      await sendEmail(env, replacementPlacedEmail(o, await orderViewUrl(env, o), await getSettings(env.STORE_DB), orig?.order_no ?? ''), fetchImpl);
    },
  };
}
