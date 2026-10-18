# Integration API notes (researched 2026-10-18)

Implementation-ready facts gathered from official docs for M3/M4. **UNCONFIRMED** marks anything the docs didn't state; re-check those against the live API in test mode.

## Razorpay (base `https://api.razorpay.com/v1`, HTTP Basic `key_id:key_secret`)

- **Create order** `POST /orders` `{amount (paise), currency:"INR", receipt (≤40 chars, unique), notes (≤15 pairs)}` → `{id:"order_…", amount, amount_paid, amount_due, currency, receipt, status: created|attempted|paid, attempts, created_at}`. Create a new order per payment attempt.
- **Manual capture per order** (overrides dashboard): `"payment": {"capture": "manual", "capture_options": {"manual_expiry_period": <minutes, ≤7200>, "refund_speed": "normal"|"optimum"}}`. The legacy `payment_capture` flag is no longer documented — don't use it. (Docs: payment-gateway/rainy-day/capture-settings/api)
- **Fetch payment** `GET /payments/{id}` → `id, amount, currency, status (created|authorized|captured|refunded|failed), order_id, method, captured, amount_refunded, refund_status, email, contact, fee, tax, error_code, error_description, created_at`.
- **Payments of an order** `GET /orders/{id}/payments` → `{items:[payment]}`.
- **Capture** `POST /payments/{id}/capture {amount, currency}` — must equal the authorised amount; payment must be `authorized` (400 otherwise).
- **Uncaptured authorisations auto-refund** after 3 days (some pages say 5; max `manual_expiry_period` is 5 days) — design for 3 days. Fee treatment of uncaptured auto-refunds: UNCONFIRMED.
- **Refund** `POST /payments/{id}/refund {amount?, speed?, notes?, receipt?}` → refund `{id:"rfnd_…", amount, payment_id, status: pending|processed|failed, speed_requested, speed_processed, acquirer_data}`. **Only captured payments can be refunded**; to release an authorised payment, don't capture it.
- **List payments** `GET /payments?from=&to=&count=(≤100)&skip=` (unix seconds) for reconciliation.
- **Checkout.js** `https://checkout.razorpay.com/v1/checkout.js`; options `key, amount, currency, name, order_id, description, image, prefill{name,email,contact}, notes, theme, handler(res), modal.ondismiss, timeout (seconds)`. Success handler gets `razorpay_payment_id, razorpay_order_id, razorpay_signature`; failures via `rzp.on('payment.failed', r => r.error)`.
- **Payment signature** = hex HMAC-SHA256 of `"{stored order_id}|{payment_id}"` with the key secret; compare in constant time.
- **Webhooks**: header `X-Razorpay-Signature` = hex HMAC-SHA256 of the **raw body** with the **webhook secret**; dedupe on `x-razorpay-event-id`; events may arrive out of order; respond 2xx within 5 s; retried with backoff for 24 h, then disabled. Events: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid` (payload has `payment` and `order`), `refund.created|processed|failed`. Envelope `{event, payload:{payment:{entity}}, created_at}`.
- **Test mode**: keys `rzp_test_…`; card 4100 2800 0000 1007 (any CVV/future expiry, OTP ≥4 digits); UPI `success@razorpay` / `failure@razorpay`.

## Shiprocket (base `https://apiv2.shiprocket.in`, `Authorization: Bearer <token>`)

- **Login** `POST /v1/external/auth/login {email, password}` → `token` (JWT, valid 10 days). Use a dedicated API user (Settings → API → Add New API User; different email from the main login).
- **Serviceability** `GET /v1/external/courier/serviceability/?pickup_postcode=&delivery_postcode=&cod=0|1&weight=<kg>[&declared_value=&length=&breadth=&height=]` → `data.available_courier_companies[]` with `courier_company_id, courier_name, rate, cod (0/1), etd ("Jul 01, 2024"), estimated_delivery_days, is_surface, city, state, postcode`, plus `data.recommended_courier_company_id`. Not serviceable: body `status` ≠ 200 or empty/missing list (UNCONFIRMED exact shape). 422 on missing params.
- **Pincode details** `GET /v1/external/open/postcode/details?postcode=` → `{success, postcode_details:{postcode, city, state, state_code, locality[]}}`; unknown → 403. Send the bearer token (auth requirement UNCONFIRMED).
- **Create order** `POST /v1/external/orders/create/adhoc` required: `order_id` (≤50 chars), `order_date` ("yyyy-mm-dd hh:mm"), `pickup_location` (exact configured name), `billing_customer_name, billing_address, billing_city (≤30), billing_pincode, billing_state, billing_country, billing_email, billing_phone`, `shipping_is_billing` (else `shipping_*`), `order_items[] {name, sku, units, selling_price (incl. GST, per unit), discount?, tax?, hsn?}`, `payment_method: "COD"|"Prepaid"`, `sub_total` (we compute), `length, breadth, height` (cm, >0.5), `weight` (kg). Response `{order_id (Shiprocket id), shipment_id, status:"NEW", status_code:1}`. Re-sending an existing `order_id` doesn't update it.
- **Find by our id** (idempotent retry): `GET /v1/external/orders?filter_by=channel_order_id&filter=<order_no>` → `data[] {id, channel_order_id, status, shipments[]}`.
- **Cancel** `POST /v1/external/orders/cancel {ids:[shiprocket ids]}` → 204.
- **Tracking webhook**: configured in Settings → API → Webhooks with a security token sent as **`x-api-key`**; must reply 200; **URL must not contain "shiprocket", "kartrocket", "sr" or "kr"** (so `/api/webhooks/courier`). Payload: `awb, courier_name, current_status, current_status_id, shipment_status, shipment_status_id, current_timestamp ("23 05 2023 11:43:52"), order_id, sr_order_id, etd, scans[]`. Key on `shipment_status_id` (shipment table): 6 Shipped, 7 Delivered, 8 Canceled, 9 RTO Initiated, 10 RTO Delivered, 12 Lost, 17 Out For Delivery, 18 In Transit, 19 Out For Pickup, 21 Undelivered (NDR), 22 Delayed, 38 Reached Destination Hub, 40 RTO_NDR, 41 RTO_OFD, 42 Picked Up, 45 Cancelled before dispatch, 46 RTO In Transit. Fall back to status text. Match orders on `sr_order_id`/`awb` (payload `order_id` format UNCONFIRMED).
- **Track** `GET /v1/external/courier/track/awb/{awb}` → `tracking_data {track_status, shipment_status, track_url, etd, shipment_track[], shipment_track_activities[]}`.
- **COD remittance**: no documented API/CSV spec (UNCONFIRMED); order details expose `remittance_date, remittance_utr, remittance_status`.

## Resend

- `POST https://api.resend.com/emails`, `Authorization: Bearer re_…`, **`User-Agent` header required** (403 without). Body `{from, to (≤50), subject, html?, text?, reply_to?, headers?, tags?[{name,value}]}` → `{id}`.
- **`Idempotency-Key`** header (1–256 chars, kept 24 h): same key + same body → original response, no resend; same key + different body → 409. Use `<event>/<entity-id>`.
- 10 req/s; free tier **100 emails/day, 3,000/month**.

## Cloudflare caching

- Workers run **before** the CDN cache; SSR output is only cached if the Worker uses `caches.default` (honours `Cache-Control`/`s-maxage`, never stores `Set-Cookie` responses, per data centre).
- **Purge by URL clears Cache API entries globally**: `POST /client/v4/zones/{zone}/purge_cache {files:[…]}`, `Authorization: Bearer` with **Zone → Cache Purge** permission; Free plan 100 URLs/request. Purge the exact URL used as the `put` key (custom cache keys can't be purged by URL).
- The newer opt-in "Workers Cache" is *not* purged by the zone API and resets per deploy — not used.
