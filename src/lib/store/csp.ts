/**
 * Enforced CSP on the pages that carry an order or review token, or take payment. Only
 * our own scripts plus Razorpay Checkout and Turnstile may load; inline
 * scripts/styles stay allowed (site-wide layout code), external ones don't.
 */
export const STORE_CSP = [
  "default-src 'self'",
  // checkout.js also injects scripts from cdn.razorpay.com (risk detection).
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com", // the build inlines small fonts as data: URIs
  "img-src 'self' data: https:",
  "connect-src 'self' https://*.razorpay.com https://challenges.cloudflare.com",
  "frame-src https://*.razorpay.com https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  // checkout.js's redirect flow (iOS, Android WebView, in-app browsers) submits a form to Razorpay.
  "form-action 'self' https://*.razorpay.com",
  "frame-ancestors 'none'",
].join('; ');

export const isStoreTransactionalPath = (pathname: string) => /^\/(cart|checkout|review)\/?$|^\/order(\/|$)/.test(pathname);
