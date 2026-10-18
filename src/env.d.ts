/// <reference types="astro/client" />

// Cloudflare runtime types are imported as named aliases instead of being added
// globally: the global runtime types clash with the DOM types that client-side
// <script> code relies on (HTMLSelectElement, Response.json(), …).
type KVNamespace = import('@cloudflare/workers-types/latest').KVNamespace;
type R2Bucket = import('@cloudflare/workers-types/latest').R2Bucket;
type D1Database = import('@cloudflare/workers-types/latest').D1Database;
type D1PreparedStatement = import('@cloudflare/workers-types/latest').D1PreparedStatement;
type D1Result<T = unknown> = import('@cloudflare/workers-types/latest').D1Result<T>;
type ExecutionContext = import('@cloudflare/workers-types/latest').ExecutionContext;
type ScheduledController = import('@cloudflare/workers-types/latest').ScheduledController;

interface Env {
  // Bindings (wrangler.toml)
  HARILEAF_CMS: KVNamespace;
  HARILEAF_MEDIA: R2Bucket;
  STORE_DB: D1Database;
  // Secrets / vars (.env.example lists every one)
  ADMIN_PASSPHRASE: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  SHIPROCKET_EMAIL?: string;
  SHIPROCKET_PASSWORD?: string;
  SHIPROCKET_WEBHOOK_TOKEN?: string;
  RESEND_API_KEY?: string;
  ORDER_TOKEN_SECRET?: string;
  CF_ZONE_ID?: string;
  CF_PURGE_API_TOKEN?: string;
}

declare module 'cloudflare:workers' {
  const env: Env;
  export { env };
}

type Runtime = import('@astrojs/cloudflare').Runtime;

declare namespace App {
  interface Locals extends Runtime {
    /** Email from a verified Cloudflare Access JWT (admin routes only). */
    adminEmail?: string;
    /** False when CF_ACCESS_AUD is not configured, i.e. admin is session-only. */
    accessConfigured?: boolean;
  }
}
