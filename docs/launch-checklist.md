# Store launch checklist

Everything that must happen outside the code before the first real order. Work top to bottom; each line says who does it and how to check it. The setup commands are in the README (*Store development*).

## 1. Cloudflare (owner)

- [ ] Workers **Paid** plan (the free plan's 10 ms CPU limit is too tight for SSR + crypto).
- [ ] `npx wrangler d1 create harileaf-store`; put the id in `wrangler.toml` → `database_id`; `npx wrangler d1 migrations apply harileaf-store --remote`.
- [ ] `npx wrangler r2 bucket create harileaf-backups`, **public access off**, lifecycle rule: delete after 90 days.
- [ ] Deploy API token (`CLOUDFLARE_API_TOKEN` in GitHub secrets) has **Workers Scripts Edit, D1 Edit, R2 Edit**. A separate token with only **Zone → Cache Purge** goes in `CF_PURGE_API_TOKEN`, and the zone id in `CF_ZONE_ID`.
- [ ] **Access** application for the admin paths (README step 3) → `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`. Check: `/admin` asks for the Access login in a private window.
- [ ] **Turnstile** widget for `harileaf.org` → `PUBLIC_TURNSTILE_SITE_KEY` (Worker variable) and `TURNSTILE_SECRET_KEY`.
- [ ] WAF rate-limiting rule (defence in depth on top of the Worker's own per-IP limiter): `http.request.uri.path wildcard "/api/store/*"`, 60 requests / 1 minute / IP → Block for 10 minutes.
- [ ] Run *Nightly D1 backup* once from GitHub → Actions; check the object appears in `harileaf-backups/d1/`. Do one restore drill into a scratch database (README → Backups).

## 2. Secrets (owner, `npx wrangler secret put <NAME>`)

`ORDER_TOKEN_SECRET` (`openssl rand -hex 32`; never change it after launch — it invalidates every emailed order link), `ADMIN_PASSPHRASE`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `CF_ZONE_ID`, `CF_PURGE_API_TOKEN`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`.

## 3. Store settings (owner, /admin/settings)

- [ ] Legal name, address, GSTIN (state code must match), FSSAI licence, customer care phone + email, grievance officer (name, email, phone).
- [ ] Minimum order (from courier rate cards), COD maximum, COD confirmation on/off.
- [ ] Pickup pincode + Shiprocket pickup location name, new-order email.
- [ ] The dashboard shows no "Needed before launch" warning.

## 4. Providers (owner)

- [ ] **Razorpay**: KYC done (needs the live policy pages: shipping, refund, privacy, terms, grievance, contact). Live keys. Webhook `https://harileaf.org/api/webhooks/razorpay` with `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`.
- [ ] **Shiprocket**: KYC, pickup address, API user, wallet recharged, COD remittance cycle chosen, webhook `https://harileaf.org/api/webhooks/courier` with the security token.
- [ ] **Resend**: `harileaf.org` verified (SPF, DKIM; add DMARC `p=none` to start). Free tier is 100 emails/day — upgrade before marketing pushes.
- [ ] **Google**: Search Console → submit `https://harileaf.org/sitemap-store.xml`; Merchant Center → feed `https://harileaf.org/feeds/google.xml` (daily fetch), shipping = free, returns policy URL.

## 5. Reviews (owner + advisers)

- [ ] **CA**: invoice format and numbering (`HL/2627/000001`), credit notes, delivery challan for free replacements (no invoice), B2B place of supply, COD remittance reconciliation, HSN codes and GST rates per product.
- [ ] **Lawyer**: privacy policy (DPDP Act 2023), refund/cancellation, shipping and terms pages; grievance officer duties (E-Commerce Rules 2020).
- [ ] **Labelling**: each product's net quantity, MRP, best-before, FSSAI number and manufacturer address match the physical pack (Legal Metrology + FSSAI). No "organic" wording until certification (claims policy).

## 6. Go-live test (owner, on production, before announcing)

- [ ] Prepaid order with a real card/UPI (small amount): payment captured in Razorpay; confirmation email; order page; owner email.
- [ ] Pack it in admin → invoice prints correctly; Shiprocket order appears; courier webhook moves it to shipped (Shiprocket has a "test webhook" button).
- [ ] Cancel / refund that order → credit note, refund reaches the card, "refunded" email.
- [ ] COD order → "please confirm" email → confirm on the order page → appears in Shiprocket.
- [ ] Customer self-cancel of a placed order; "find your order" link email.
- [ ] Edit a product price in admin → the product page shows the new price within a minute (edge-cache purge).
- [ ] Browser console on /checkout and /order shows no CSP errors while the Razorpay window is open.
- [ ] Workers Logs show no unexpected errors; dashboard shows no failed background tasks.

## After launch

- Daily: dashboard to-dos (to pack, unconfirmed COD, NDR, courier problems, failed refunds).
- Weekly: COD remittance import; check backups ran (GitHub Actions).
- Monthly: Lighthouse run in CI stays green; review Workers Logs for repeated errors.
