# E-commerce M1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the store foundation from the e-commerce spec (`docs/superpowers/specs/2026-10-18-ecommerce-design.md`, "Build Order → v1 → 1. Foundation"). That means the D1 schema with database-enforced invariants, pure store logic (money, GST, document numbering, availability, claims), exactly-once claim batches, the outbox runner and cron entry, Cloudflare Access verification, the split admin with a Settings page, and the policy / grievance pages. No shopper-facing commerce yet.

**Architecture:** All store logic lives in plain TypeScript modules under `src/lib/store/` that take a `D1Database` (or plain values) and never import Astro. Astro routes stay thin wrappers. Integrity rules (stock ≥ 0, exactly-once claims, immutable invoices) are SQL constraints and triggers, so a D1 batch aborts on violation. A custom Worker entry `src/worker.ts` wraps the adapter's `fetch` and adds `scheduled()` for the outbox.

**Tech Stack:** Astro 6.1 (SSR) · `@astrojs/cloudflare` 13.1 · Cloudflare Workers + D1 + KV + R2 · Vitest 4.1 + `@cloudflare/vitest-pool-workers` 0.23 (tests run inside workerd with a real local D1) · Web Crypto (HMAC, RS256 JWT).

**Out of scope for M1** (later milestones / PRs): product admin and pages (M2), cart / checkout / Razorpay (M3), orders / invoices UI / Shiprocket / emails (M4), hardening (M5).

---

## Verified facts this plan relies on

| Fact | How it was checked |
|---|---|
| `@astrojs/cloudflare` 13.1.8 uses `config.main ?? "@astrojs/cloudflare/entrypoints/server"` and exports `@astrojs/cloudflare/handler` (`handle(request, env, ctx)`) | `node_modules/@astrojs/cloudflare/dist/wrangler.js:15`, package `exports` |
| A failing `CHECK` aborts the whole D1 batch; an `INSERT … SELECT (subquery)` claim fails with `NOT NULL` (missing row), `CHECK` (wrong state), and `CHECK`/PK (repeat claim) | Spike run in workerd via vitest-pool-workers (deleted after) |
| Vitest 4 config: `cloudflareTest()` plugin + `readD1Migrations()` from `@cloudflare/vitest-pool-workers`, `applyD1Migrations` from `cloudflare:test` | context7 docs + spike |
| Baseline `astro check` has 14 errors on `main` (missing `KVNamespace`/`R2Bucket` types, `platformProxy` no longer an adapter option, `sessionDrivers.memory` missing from Astro 6 types; it exists at runtime) | `npx astro check` in the fresh worktree |

## File structure

```
migrations/
  0001_store_core.sql            # every v1 table, CHECKs, triggers, seed counters/settings
src/worker.ts                    # Worker entry: fetch → Astro handler, scheduled → runScheduled
src/middleware.ts                # Cloudflare Access JWT check on /admin* and /api/admin*
src/lib/store/
  money.ts                       # paise helpers, formatINR, amount in words
  gst.ts                         # GST back-out, CGST/SGST/IGST split, document type
  fy.ts                          # IST financial year, document numbers (≤16 chars)
  availability.ts                # buy / sold_out / preorder / notify (+ season wrap)
  claims.ts                      # organicCopy(), banned-word validation
  db.ts                          # nowIso(), constraint-error classifier
  ops.ts                         # exactly-once claim statement + runClaim()
  transitions.ts                 # order status graph, canTransition()
  outbox.ts                      # enqueueStmt(), drainOutbox() with lease + backoff
  scheduled.ts                   # runScheduled(env): outbox drain (M3+ adds expiry/reconcile)
  settings.ts                    # typed settings get/put + validation (GSTIN, email, phone)
  access.ts                      # Cloudflare Access JWT (RS256 via JWKS) verifier
  throttle.ts                    # login throttle (KV counters)
src/layouts/AdminLayout.astro    # shared admin shell + session gate + login form + nav
src/scripts/admin/toast.ts       # shared toast helper
src/pages/admin/index.astro      # dashboard (links, Access status, settings completeness)
src/pages/admin/photos.astro     # moved from admin.astro (unchanged behaviour)
src/pages/admin/produce.astro    # moved from admin.astro (unchanged behaviour)
src/pages/admin/content.astro    # moved from admin.astro (unchanged behaviour)
src/pages/admin/settings.astro   # store settings form
src/pages/api/admin/settings.ts  # GET/PUT settings (session-gated)
src/pages/shipping-policy.astro, refund-policy.astro, grievance.astro   # SSR, read settings
src/components/policy/PolicyPage.astro   # shared layout for the three policy pages
tests/
  wrangler.test.toml, worker-stub.ts, apply-migrations.ts, env.d.ts
  unit/*.test.ts                 # pure logic
  integration/*.test.ts          # D1 constraints, claims, outbox, settings
vitest.config.ts
```

Deleted: `src/pages/admin.astro` (replaced by `src/pages/admin/index.astro` + sub-pages).

---

### Task 1: Tooling baseline (types, config, test runner, CI)

**Files:** Modify `astro.config.mjs`, `src/env.d.ts`, `package.json`, `.github/workflows/ci.yml`, `tsconfig.json`. Create `vitest.config.ts`, `tests/wrangler.test.toml`, `tests/worker-stub.ts`, `tests/apply-migrations.ts`, `tests/env.d.ts`, `tests/unit/smoke.test.ts`, `worker-configuration.d.ts` (generated).

- [ ] `astro.config.mjs`: remove `platformProxy` (not an option in adapter 13); `session.driver: sessionDrivers.lruCache()` (in-memory like before, typed, still no `SESSION` KV).
- [ ] `npx wrangler types` → `worker-configuration.d.ts` (runtime + `Env` from `wrangler.toml`). `src/env.d.ts`: keep only secrets/vars not in `wrangler.toml` (merged into the global `Env`), drop the manual `cloudflare:workers` module declaration if the runtime types provide it.
- [ ] Test harness: `tests/wrangler.test.toml` (main `worker-stub.ts`, D1 `STORE_DB` → `../migrations`, KV `HARILEAF_CMS`), `vitest.config.ts` with `cloudflareTest({ wrangler: { configPath }, miniflare: { bindings: { TEST_MIGRATIONS } } })`, `setupFiles: ['tests/apply-migrations.ts']`, `include: ['tests/**/*.test.ts']`.
- [ ] Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"types": "wrangler types"`.
- [ ] CI: add `npm test` after `astro check`.
- [ ] Verify: `npx astro check` → 0 errors; `npm test` → smoke passes; `npm run build` passes.
- [ ] Commit `chore: fix baseline type errors and add vitest (workerd + D1) harness`.

### Task 2: D1 schema with enforced invariants

**Files:** Create `migrations/0001_store_core.sql`, `tests/integration/schema.test.ts`.

The schema is every v1 table in the spec's Data Model, plus these deltas (recorded in the spec in Task 14):
- `invoices.series` (`INV` | `CN`) column; `UNIQUE(series, fy, seq)`; partial unique index `ON invoices(order_id) WHERE doc_type <> 'credit_note'`; triggers `BEFORE UPDATE`/`BEFORE DELETE` → `RAISE(ABORT, 'invoices are immutable')`.
- `variants`: `CHECK (stock_qty >= 0)`, `CHECK (price_paise > 0 AND price_paise <= mrp_paise)`; trigger `variants_no_sale_when_inactive`: `BEFORE UPDATE OF stock_qty … WHEN NEW.stock_qty < OLD.stock_qty AND OLD.active = 0` → `RAISE(ABORT, 'variant inactive')`. This replaces the spec's `WHERE active = 1`, which silently matched 0 rows.
- `ops`: `ok INTEGER NOT NULL CHECK (ok = 1)`, `PRIMARY KEY (order_id, kind)`.
- `outbox`: `state IN ('pending','running','done','dead')`, `lease_until`. The `running` state + lease makes overlapping cron runs safe and recovers crashed runs.
- `stock_reservations.state IN ('held','consumed','released')`; `webhook_events PRIMARY KEY (source, event_id)`; `doc_counters PRIMARY KEY (series, fy)` seeded for FY `2627` and `2728`; `settings(key PRIMARY KEY, value)`.
- `orders`: `CHECK` on `status`, `payment_method`, `payment_status` enums; `UNIQUE(order_no)`; `idempotency_key UNIQUE` (for M3 checkout retries).
- Money columns are `INTEGER NOT NULL CHECK (>= 0)`.

Tests (real D1): stock can't go negative (batch rolls back); inactive variant decrement aborts; invoice update/delete abort; second non-credit invoice for the same order aborts; credit note for the same order allowed; enum `CHECK`s reject bad status; webhook event PK dedupes.

- [ ] Write `schema.test.ts` → run → FAIL (no tables).
- [ ] Write migration → run → PASS.
- [ ] Commit `feat(store): D1 core schema with constraint-enforced invariants`.

### Task 3: Worker entry, bindings, cron

**Files:** Create `src/worker.ts`, `src/lib/store/scheduled.ts` (stub that calls `drainOutbox` once Task 9 lands). Modify `wrangler.toml`.

- `wrangler.toml`: `main = "src/worker.ts"`, `workers_dev = false` (otherwise `*.workers.dev` bypasses Cloudflare Access on the custom domain), `[[d1_databases]] binding = "STORE_DB" database_name = "harileaf-store" database_id = "<set after wrangler d1 create>" migrations_dir = "migrations"`, `[triggers] crons = ["*/5 * * * *"]`.
- `src/worker.ts`:
  ```ts
  import { handle } from '@astrojs/cloudflare/handler';
  import { runScheduled } from './lib/store/scheduled';
  export default {
    fetch: handle,
    async scheduled(controller, env, ctx) { ctx.waitUntil(runScheduled(env, new Date(controller.scheduledTime))); },
  } satisfies ExportedHandler<Env>;
  ```
- [ ] Verify `npm run build` emits `dist/server/wrangler.json` with `"main"` → built worker entry and `triggers.crons`, then `npx wrangler dev --config dist/server/wrangler.json --test-scheduled` + `curl /__scheduled` → 200.
- [ ] Commit `feat(store): custom worker entry with scheduled handler, D1 binding, cron`.

### Task 4: Money + GST

**Files:** `src/lib/store/money.ts`, `src/lib/store/gst.ts`, `tests/unit/money.test.ts`, `tests/unit/gst.test.ts`.

API:
```ts
// money.ts
export type Paise = number;                                  // integer
export function assertPaise(n: number): Paise;               // throws on non-integer / negative
export function formatINR(p: Paise): string;                 // 69900 → "₹699", 69950 → "₹699.50", Indian grouping "₹1,34,900"
export function amountInWords(p: Paise): string;             // 134950 → "Rupees One Thousand Three Hundred Forty Nine and Fifty Paise Only" (Indian lakh/crore)
export function unitPricePerKg(price: Paise, unitQtyG: number): Paise; // rounded
// gst.ts
export interface TaxLineInput { lineTotal: Paise; rateBp: number }      // GST-inclusive, after discount
export interface TaxLine extends TaxLineInput { taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise }
export function backOut(lineTotal: Paise, rateBp: number): { taxable: Paise; tax: Paise };
export function splitTax(lines: TaxLineInput[], intraState: boolean): TaxLine[];
export function documentType(lines: { rateBp: number }[]): 'tax_invoice' | 'bill_of_supply' | 'invoice_cum_bill_of_supply';
export function allocateDiscount(lineTotals: Paise[], discount: Paise): Paise[]; // largest remainder, Σ = discount
```
Rules: `taxable = round(line × 10000 / (10000 + rateBp))`; intra-state → `cgst = floor(tax/2)`, `sgst = tax − cgst` (odd paisa to SGST); inter-state → `igst = tax`.

Tests: worked examples (₹699 @5% → taxable 66571, tax 3329, CGST 1664 / SGST 1665); 0% lines; IGST path; doc types for taxable / exempt / mixed; **property test** (seeded PRNG, 2,000 random carts): Σ(taxable + tax) = Σ lineTotal, and Σ allocated discount = discount, with no negative line. Formatting incl. lakh grouping; amount in words incl. paise and zero.

- [ ] Tests → FAIL → implement → PASS → commit `feat(store): money and GST maths with property tests`.

### Task 5: Financial year + document numbers

**Files:** `src/lib/store/fy.ts`, `tests/unit/fy.test.ts`.
```ts
export function fyOf(at: Date): string;                       // IST; 2027-03-31T18:29:59Z → "2627", 2027-03-31T18:30:00Z → "2728"
export function docNo(series: 'INV' | 'CN', fy: string, seq: number): string; // "HL/2627/000042", "HLCN/2627/00003"; throws if > 16 chars
export function orderNo(at: Date, seq: number): string;      // "HL-2610-0042" (IST yymm)
```
- [ ] Tests (IST rollover boundary, 16-char limit incl. seq 999999 / 99999, orderNo IST month) → FAIL → implement → PASS → commit.

### Task 6: Availability

**Files:** `src/lib/store/availability.ts`, `tests/unit/availability.test.ts`.
```ts
export type Availability = 'buy' | 'sold_out' | 'preorder' | 'notify';
export interface AvailabilityInput {
  status: 'draft' | 'active' | 'discontinued';
  seasonStartMd: string | null; seasonEndMd: string | null;   // "MM-DD"
  offSeasonMode: 'notify' | 'preorder' | null;
  preorderDispatchDate: string | null;
  variantActive: boolean; stockQty: number;
}
export function inSeason(startMd: string | null, endMd: string | null, todayIst: Date): boolean; // wraps year end
export function availability(p: AvailabilityInput, todayIst: Date): Availability | null;     // null = not purchasable / not listed (draft, discontinued, inactive variant)
```
- [ ] Tests (no season; within; outside; wrap Nov→Feb; boundary days inclusive; sold out; preorder needs date + stock else notify; draft/discontinued/inactive → null) → implement → PASS → commit.

### Task 7: Claims policy

**Files:** `src/lib/store/claims.ts`, `tests/unit/claims.test.ts`.
```ts
export type OrganicScheme = 'none' | 'pgs_green' | 'pgs_organic' | 'npop';
export interface ProcessClaim { code: string; text: string; evidence_note: string }
export function organicCopy(p: { organicScheme: OrganicScheme; conversionSince: number | null; certNumber: string | null }):
  { certificationLine: string | null; mayUseOrganic: boolean; badge: 'pgs_green' | 'pgs_organic' | 'npop' | null };
export function findBannedPhrases(text: string, ctx: { organicScheme: OrganicScheme; claims: ProcessClaim[] }): string[];
export function validateProcessClaims(claims: ProcessClaim[]): string[];     // errors: missing evidence_note, empty text
```
Banned: "chemical-free"/"chemical free", "100% organic", "naturally grown", "organic"/"organically" when `!mayUseOrganic` (word-boundary, case-insensitive; "under conversion to organic" allowed only for `pgs_green`), "traditionally made"/"traditional" unless a claim with code `traditional` exists. Disease words ("diabet", "cure", "cancer", "cholesterol", "immunity booster") are flagged as health claims.
- [ ] Tests (each scheme's line; `pgs_green` without cert → no line; banned matrix incl. case/hyphen variants; "Organic" allowed for `npop`; health words) → implement → PASS → commit.

### Task 8: Order status graph

**Files:** `src/lib/store/transitions.ts`, `tests/unit/transitions.test.ts`.
```ts
export type OrderStatus = 'pending_payment'|'payment_failed'|'placed'|'packed'|'shipped'|'delivered'|'cancelled'|'rto'|'returned';
export type Actor = 'customer'|'admin'|'razorpay'|'shiprocket'|'system';
export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor, opts?: { customerCancelled?: boolean }): boolean;
```
The edges follow the spec's diagram: `payment_failed → placed` only for `razorpay`/`system` (late auth) and never if `customerCancelled`; `placed → cancelled` for customer/admin; `packed → cancelled` admin only; `shipped → rto|delivered` shiprocket/admin; `delivered → returned` admin. Everything else is false.
- [ ] Exhaustive matrix test (every from × to × actor against an explicit allow-list) → implement → PASS → commit.

### Task 9: Exactly-once claims + outbox

**Files:** `src/lib/store/db.ts`, `src/lib/store/ops.ts`, `src/lib/store/outbox.ts`, `src/lib/store/scheduled.ts`, `tests/integration/ops.test.ts`, `tests/integration/outbox.test.ts`.
```ts
// db.ts
export const nowIso: (d?: Date) => string;
export type ConstraintKind = 'stock' | 'claim' | 'unique' | 'immutable' | 'inactive' | 'other';
export function classifyD1Error(err: unknown): ConstraintKind;  // parses "CHECK constraint failed: stock_qty >= 0", "ok = 1", "NOT NULL … ops.ok", "UNIQUE", trigger messages
// ops.ts
export function claimStmt(db: D1Database, orderId: number, kind: string, okSql: string, okBinds: unknown[], at: string): D1PreparedStatement;
// okSql is a scalar SELECT over orders, e.g. "SELECT status = 'pending_payment' AND total_paise = ? FROM orders WHERE id = ?"
export async function runClaim(db: D1Database, claim: D1PreparedStatement, rest: D1PreparedStatement[]): Promise<{ ok: true } | { ok: false; reason: 'claim' | 'stock' | 'other'; error: unknown }>;
// outbox.ts
export function enqueueStmt(db: D1Database, e: { orderId?: number; kind: string; payload: unknown; at: string }): D1PreparedStatement;
export type OutboxHandler = (payload: any, ctx: { env: Env; row: OutboxRow }) => Promise<void>;
export async function drainOutbox(db: D1Database, handlers: Record<string, OutboxHandler>, opts: { env: Env; now: Date; limit?: number; ids?: number[] }): Promise<{ done: number; failed: number; dead: number }>;
export function backoffMs(attempts: number): number;  // 30s × 2^(attempts-1), capped 6h; dead after 8 attempts
```
Drain claims each row with `UPDATE outbox SET state='running', lease_until=?, attempts=attempts+1 WHERE id=? AND (state='pending' AND next_attempt_at<=? OR state='running' AND lease_until<?)` and only acts when `meta.changes === 1`. Success → `done`. Throw → `pending` + backoff, or `dead` at max attempts. Unknown kind → `dead` immediately with `last_error='no handler'`.

Integration tests: two concurrent `runClaim` for the same order/kind → exactly one ok and the side-effect rows appear once; claim on missing order → `claim`; wrong state → `claim`; stock-short statement inside a claim batch → `stock` and the claim row is rolled back too; outbox: success → done; failure → backoff time; 8th failure → dead; two concurrent drains → handler called once per row; expired lease is reclaimed; `ids` option drains only given rows (the "request drains its own rows" path).
- [ ] Tests → FAIL → implement → PASS → commit `feat(store): exactly-once claim batches and outbox runner`.

### Task 10: Settings

**Files:** `src/lib/store/settings.ts`, `tests/unit/settings-validate.test.ts`, `tests/integration/settings.test.ts`.
```ts
export const SETTING_KEYS = ['gstin','legal_name','trade_name','address','state_code','fssai_license','customer_care_phone','customer_care_email','grievance_officer_name','grievance_officer_email','grievance_officer_phone','min_order_paise','cod_max_order_paise','notify_email','low_stock_email'] as const;
export type SettingKey = typeof SETTING_KEYS[number];
export type StoreSettings = Record<SettingKey, string>;
export const SETTING_DEFAULTS: StoreSettings;          // min_order_paise "49900", cod_max_order_paise "300000", state_code "27", rest ""
export function validateSettings(input: Partial<StoreSettings>): { ok: true; value: Partial<StoreSettings> } | { ok: false; errors: Partial<Record<SettingKey, string>> };
export function isValidGstin(g: string): boolean;     // 15-char pattern + mod-36 checksum
export async function getSettings(db: D1Database): Promise<StoreSettings>;
export async function putSettings(db: D1Database, value: Partial<StoreSettings>): Promise<void>;   // single batch upsert
export function missingForLaunch(s: StoreSettings): SettingKey[];   // legal/grievance/customer-care keys still empty
```
- [ ] Tests (GSTIN checksum with a known-valid number and one-char corruption; FSSAI 14 digits; Indian mobile; email; state code 01–38; paise integers; GSTIN state prefix must equal `state_code`; get returns defaults; put round-trip) → implement → PASS → commit.

### Task 11: Cloudflare Access verification + login throttle

**Files:** `src/lib/store/access.ts`, `src/lib/store/throttle.ts`, `src/middleware.ts`, `src/pages/api/auth.ts` (throttle), `tests/unit/access.test.ts`, `tests/integration/throttle.test.ts`.
```ts
export interface AccessConfig { teamDomain: string; aud: string }    // from env CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD
export async function verifyAccessJwt(token: string, cfg: AccessConfig, opts?: { now?: Date; fetchJwks?: (url: string) => Promise<{ keys: JsonWebKey[] }> }): Promise<{ email: string } | null>;
// throttle.ts
export async function checkLoginAllowed(kv: KVNamespace, ip: string, now: Date): Promise<boolean>;  // ≤5 failures / 15 min
export async function recordLoginFailure(kv: KVNamespace, ip: string, now: Date): Promise<void>;
export async function clearLoginFailures(kv: KVNamespace, ip: string): Promise<void>;
```
Middleware: for `/admin`, `/admin/*`, `/api/admin/*`, `/api/auth`. If `CF_ACCESS_AUD` is configured, require a valid `Cf-Access-Jwt-Assertion` (else 403) and set `locals.adminEmail`. If not configured, pass through (session-only, the current behaviour) and set `locals.accessConfigured = false` so the dashboard shows a warning. Verification: RS256 over `header.payload` with the JWKS key matching `kid`; check `aud` contains cfg.aud, `iss === https://{teamDomain}`, `exp > now`, `nbf <= now`. The JWKS is cached in module scope for 10 min.
- [ ] Unit tests with a generated RSA key pair: valid → email; wrong aud / iss / expired / bad signature / unknown kid / malformed → null. Throttle tests: 5 failures allowed, 6th blocked, window expiry, clear on success.
- [ ] Implement → PASS → wire `/api/auth` (429 when throttled) → commit `feat(admin): Cloudflare Access JWT verification and login throttling`.

### Task 12: Admin split + Settings page

**Files:** Create `src/layouts/AdminLayout.astro`, `src/scripts/admin/toast.ts`, `src/pages/admin/{index,photos,produce,content,settings}.astro`, `src/pages/api/admin/settings.ts`. Delete `src/pages/admin.astro`.

- `AdminLayout` props `{ title, active }`: `prerender = false`; validates the session (`validateSession`). Unauthenticated → renders the existing login card (same markup and script as today) for any admin URL. Authenticated → header (logo, nav: Dashboard · Photos · Produce · Content · Settings, Sign out), `<slot/>`, toast container. Inline critical styles copied from the current `admin.astro` `<style>`.
- Photos / Produce / Content pages: move each `init*Tab` script body verbatim into its page's `<script>`, replacing `document.getElementById('tab-…')` with a page-level `#panel` and importing `showToast` from `src/scripts/admin/toast.ts`. Behaviour and APIs stay the same.
- Dashboard: cards linking to sections; "Cloudflare Access not configured" warning when `locals.accessConfigured === false`; "Settings needed before launch" list from `missingForLaunch()`.
- Settings page: a form for every `SETTING_KEYS` field (rupee inputs for the two paise fields), `PUT /api/admin/settings`, field-level error display.
- `/api/admin/settings`: GET/PUT, session-gated (`validateSession`, 401), JSON validation via `validateSettings` (400 with `errors`), `putSettings`.
- [ ] `npm run build` + `astro check` clean; manual check in `astro dev` (Playwright snapshot): login → each tab loads → settings save + validation error → sign out.
- [ ] Commit `refactor(admin): split admin into pages under AdminLayout; add store settings`.

### Task 13: Policy and grievance pages

**Files:** Create `src/components/policy/PolicyPage.astro`, `src/pages/shipping-policy.astro`, `src/pages/refund-policy.astro`, `src/pages/grievance.astro`. Modify `src/content/footer.json` (add Shipping Policy, Refund Policy, Grievance Officer links).

- SSR (`prerender = false`), `Cache-Control: public, s-maxage=600`; reads `getSettings(env.STORE_DB)`. Settings that are still missing render as "Being updated". The text reflects the spec decisions:
  - **Shipping:** pan-India to serviceable pincodes; free shipping above the minimum order (`min_order_paise`); dispatch within 2 business days; typical transit 3–7 days; tracking by email; perishables not offered yet.
  - **Refund:** cancel free of charge until packed; damaged/wrong item: report with a photo within 48 h of delivery → replacement or full refund; refunds to the original method within 5–7 business days of approval; COD refunds via bank transfer/UPI; no cancellation charges.
  - **Grievance:** grievance officer name, email, phone; seller legal name, address, GSTIN, FSSAI licence; acknowledgement within 48 hours, resolution within one month (Consumer Protection (E-Commerce) Rules 2020).
- SEO via `SEO` + `BreadcrumbList` as in `privacy.astro`.
- [ ] Build + manual render check → commit `feat(store): shipping, refund and grievance policy pages`.

### Task 14: Docs, env, spec deltas, PR

- `.env.example`: add every new secret from the spec + `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`.
- Spec: record the M1 deltas (invoice `series` column, inactive-variant trigger replacing `WHERE active = 1`, outbox `running` + lease, `workers_dev = false` + in-app Access JWT check, `idempotency_key` column).
- `README` section "Store development": `npm test`, `wrangler d1 migrations apply harileaf-store --local`, `--test-scheduled`.
- [ ] Full verification: `npx astro check`, `npm test`, `npm run build`.
- [ ] Push branch, open PR with summary, test evidence, the owner actions (create D1 + set `database_id`, apply migrations remotely, Workers Paid, Access app, fill settings), and what's next (M2).
