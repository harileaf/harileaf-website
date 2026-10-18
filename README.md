# HariLeaf

Marketing site and (in progress) online store for HariLeaf — Astro 6 (SSR) on Cloudflare Workers with D1, KV and R2.

- Store design: [`docs/superpowers/specs/2026-10-18-ecommerce-design.md`](docs/superpowers/specs/2026-10-18-ecommerce-design.md)
- Current plan: [`docs/superpowers/plans/2026-10-18-ecommerce-m1-foundation.md`](docs/superpowers/plans/2026-10-18-ecommerce-m1-foundation.md)

## Commands

| Command | What it does |
| :-- | :-- |
| `npm install` | Install dependencies (Node ≥ 22.12) |
| `npm run dev` | Dev server at `localhost:4321` with local D1/KV/R2 from `wrangler.toml` |
| `npm run build` | Production build into `dist/` |
| `npm run check` | `astro check` (types) |
| `npm test` | Store tests — Vitest running inside workerd with a real local D1 |

Local secrets go in `.dev.vars` (git-ignored), e.g. `ADMIN_PASSPHRASE=…`. `.env.example` lists every secret the Worker reads.

## Store development

Store logic lives in `src/lib/store/` as plain TypeScript modules that take a `D1Database`; Astro routes are thin wrappers. Integrity rules (stock never negative, exactly-once state changes, immutable gapless invoices, append-only order events) are enforced by the schema in `migrations/`, so tests exercise them against real D1.

### One-time setup (production)

1. Upgrade to the **Workers Paid** plan (the free plan's 10 ms CPU limit is too tight for SSR + crypto).
2. Create the database and put its id into `wrangler.toml` (`database_id` under `STORE_DB`). The deploy workflow applies pending migrations before each deploy, so the `CLOUDFLARE_API_TOKEN` secret needs **D1 Edit** permission:
   ```sh
   npx wrangler d1 create harileaf-store
   npx wrangler d1 migrations apply harileaf-store --remote
   ```
3. Create a **Cloudflare Access** application covering `harileaf.org/admin*`, `/api/admin*`, `/api/auth`, `/keystatic*`, `/api/keystatic*`, `/api/photos*`, `/api/produce` and `/api/content` (the Worker only requires the Access token for writes to the last three, so public pages keep reading them — add a bypass policy for GET on those paths), allow the admin emails, then set its team domain and AUD tag as secrets:
   ```sh
   npx wrangler secret put CF_ACCESS_TEAM_DOMAIN   # e.g. harileaf.cloudflareaccess.com
   npx wrangler secret put CF_ACCESS_AUD
   ```
   Until both are set, admin is passphrase-only and the dashboard shows a warning. Setting only one locks admin (fails closed).
4. Fill in **/admin/settings** (legal name, address, GSTIN, FSSAI licence, customer care, grievance officer). The policy pages read these values.
5. Connect the integrations (each value via `npx wrangler secret put <NAME>`):
   - **Razorpay**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`. Dashboard → Webhooks → `https://harileaf.org/api/webhooks/razorpay` with events `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`; put its secret in `RAZORPAY_WEBHOOK_SECRET`.
   - **Shiprocket**: an API user (Settings → API) as `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD`; set the pickup location name and pincode in /admin/settings. Settings → API → Webhooks → `https://harileaf.org/api/webhooks/courier` with a security token, stored as `SHIPROCKET_WEBHOOK_TOKEN`.
   - **Resend**: verify `harileaf.org` (SPF/DKIM) and set `RESEND_API_KEY`. Free tier: 100 emails/day.
   - **Turnstile**: `PUBLIC_TURNSTILE_SITE_KEY` (a Worker variable, read at request time) and `TURNSTILE_SECRET_KEY`.
   - `ORDER_TOKEN_SECRET`: a random 32+ byte string (`openssl rand -hex 32`). Changing it invalidates every order link already emailed.
6. Daily operations live in **/admin/orders** (pack → issues the GST invoice; ship/deliver update automatically from Shiprocket tracking) and **/admin/remittance** (import Shiprocket's COD remittance CSV).

### Local database

```sh
npx wrangler d1 migrations apply harileaf-store --local
npx wrangler d1 execute harileaf-store --local --command "SELECT * FROM settings"
```

### Cron

`src/worker.ts` wraps the Astro handler and adds `scheduled()` (every 5 minutes: drains the outbox). To trigger it locally, run the built Worker **without** the assets binding — Wrangler's local assets proxy can't forward `ScheduledController` (`DataCloneError`); production is unaffected:

```sh
npm run build
node -e "const f='dist/server/wrangler.json',d=require('./'+f);delete d.assets;require('fs').writeFileSync('dist/server/wrangler.cron.json',JSON.stringify(d))"
npx wrangler dev --config dist/server/wrangler.cron.json --test-scheduled
curl http://localhost:8787/cdn-cgi/handler/scheduled
```
