/**
 * Enforced CSP on the pages that carry an order token or take payment. Only
 * our own scripts plus Razorpay Checkout and Turnstile may load; inline
 * scripts/styles stay allowed (site-wide layout code), external ones don't.
 */
export const STORE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://*.razorpay.com https://challenges.cloudflare.com",
  "frame-src https://*.razorpay.com https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const isStoreTransactionalPath = (pathname: string) => /^\/(cart|checkout)\/?$|^\/order(\/|$)/.test(pathname);
