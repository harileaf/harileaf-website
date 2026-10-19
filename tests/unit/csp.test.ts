import { expect, it } from 'vitest';
import { STORE_CSP, isStoreTransactionalPath } from '../../src/lib/store/csp';

it('applies the store CSP to cart, checkout, order and review pages only', () => {
  for (const p of ['/cart', '/cart/', '/checkout', '/checkout/', '/order/HL-2610-0001', '/order/HL-2610-0001/invoice', '/order/find', '/review', '/review/']) expect(isStoreTransactionalPath(p)).toBe(true);
  for (const p of ['/', '/shop/', '/rice/karjat-3', '/orders', '/cartography', '/admin/orders', '/reviews', '/admin/reviews']) expect(isStoreTransactionalPath(p)).toBe(false);
});

it('allows only our origin plus Razorpay and Turnstile to run scripts or frames', () => {
  const script = STORE_CSP.split('; ').find((d) => d.startsWith('script-src'))!;
  expect(script.split(' ').filter((t) => t.startsWith('https:'))).toEqual(['https://checkout.razorpay.com', 'https://cdn.razorpay.com', 'https://challenges.cloudflare.com']);
  expect(STORE_CSP).toContain("frame-ancestors 'none'");
  expect(STORE_CSP).toContain("object-src 'none'");
});
