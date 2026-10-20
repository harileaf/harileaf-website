/**
 * The discount code the shopper applied, kept in localStorage next to the cart
 * (`hl_coupon_v1`). The server validates it on every quote; this module only
 * remembers it and renders the "Have a discount code?" box.
 */
import { formatINR } from '../../lib/store/money';
import { h } from './dom';

const KEY = 'hl_coupon_v1';

export interface QuoteCoupon {
  ok: boolean;
  code: string;
  discount?: number;
  label?: string;
  reason?: string;
  message?: string;
}

export function readCoupon(): string | null {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function setCoupon(code: string | null): void {
  try {
    if (code) localStorage.setItem(KEY, code);
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the code still applies for this page view via the caller's state.
  }
}

/** Failures that won't fix themselves: drop the code so it doesn't linger in the cart. */
const DEAD = ['not_found', 'paused', 'expired', 'limit_reached', 'not_started'];
export const isDeadCoupon = (c: QuoteCoupon | null | undefined) => Boolean(c && !c.ok && c.reason && DEAD.includes(c.reason));

/**
 * The box for the order summary. `pending` is the code just typed (shown with
 * its error when the server refused it); `applied` is the quote's verdict on
 * the stored code.
 */
export function couponBox(opts: {
  applied: QuoteCoupon | null;
  rejected?: { code: string; message: string } | null;
  onApply: (code: string) => void;
  onRemove: () => void;
  /** Keep the disclosure open (after "Remove", so focus can land in it). */
  open?: boolean;
}): HTMLElement {
  const { applied } = opts;
  if (applied) {
    const remove = h('button', { type: 'button', class: 'text-sm font-bold text-primary underline', 'aria-label': `Remove discount code ${applied.code}` }, 'Remove');
    remove.addEventListener('click', opts.onRemove);
    return h('div', { class: 'rounded-xl border border-black/10 bg-white px-4 py-3 text-sm', 'data-coupon': applied.ok ? 'applied' : 'invalid' },
      h('div', { class: 'flex items-center justify-between gap-3' },
        h('span', { class: 'font-bold break-all' }, applied.code, applied.ok && applied.label ? h('span', { class: 'font-normal text-on-surface-variant' }, ` · ${applied.label}`) : null),
        remove,
      ),
      !applied.ok ? h('p', { class: 'mt-1 font-bold', style: 'color:#8a4b00', role: 'status' }, applied.message ?? 'This code can’t be used.') : null,
    );
  }

  const input = h('input', {
    id: 'coupon-code', name: 'coupon', class: 'min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-3 py-2.5 text-base uppercase focus:outline-none focus:ring-2 focus:ring-primary',
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: 24, value: opts.rejected?.code ?? '',
    'aria-describedby': opts.rejected ? 'coupon-error' : undefined, 'aria-invalid': opts.rejected ? 'true' : undefined,
  });
  const apply = h('button', { type: 'button', class: 'rounded-xl px-4 py-2.5 font-extrabold text-white', style: 'background:#196a5e' }, 'Apply');
  const submit = () => {
    const code = input.value.trim();
    if (code) opts.onApply(code);
  };
  apply.addEventListener('click', submit);
  // Inside the checkout form: Enter applies the code instead of placing the order.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  return h('details', { class: 'text-sm', open: Boolean(opts.rejected) || opts.open },
    h('summary', { class: 'font-bold cursor-pointer' }, 'Have a discount code?'),
    h('div', { class: 'mt-2 flex gap-2' }, h('label', { for: 'coupon-code', class: 'sr-only' }, 'Discount code'), input, apply),
    opts.rejected ? h('p', { id: 'coupon-error', class: 'mt-1 font-bold', style: 'color:#b3261e', role: 'alert' }, opts.rejected.message) : null,
  );
}

/** "Discount (CODE)  −₹X" summary row, or null. */
export function discountRow(c: QuoteCoupon | null, discount: number): HTMLElement | null {
  if (!c?.ok || discount <= 0) return null;
  return h('p', { class: 'flex justify-between gap-3', style: 'color:#1d6b3a' }, h('span', {}, `Discount (${c.code})`), h('span', { class: 'font-bold whitespace-nowrap' }, `−${formatINR(discount)}`));
}

/** After apply/remove re-renders the box, keep keyboard focus in it. */
export function focusCouponBox(root: ParentNode): void {
  (root.querySelector<HTMLElement>('[data-coupon] button') ?? root.querySelector<HTMLElement>('#coupon-code'))?.focus();
}
