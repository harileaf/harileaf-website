-- HariLeaf store — core schema (v1: rice & spices; v2 columns present but unused).
--
-- Invariants live in the database, not only in application code: a D1 batch
-- rolls back only when a statement ERRORS, and an UPDATE matching 0 rows does
-- not error. Every rule that must hold is therefore a CHECK, a UNIQUE index or
-- a trigger that RAISE(ABORT)s.
--
-- Conventions: money = INTEGER paise (GST-inclusive); timestamps = ISO-8601 UTC
-- text from Date#toISOString() (sorts lexicographically); booleans = 0/1.

-- ── Catalog ────────────────────────────────────────────────────────────────

CREATE TABLE categories (
  id                      INTEGER PRIMARY KEY,
  slug                    TEXT NOT NULL UNIQUE CHECK (slug <> '' AND slug NOT GLOB '*[^a-z0-9-]*'),
  name                    TEXT NOT NULL CHECK (name <> ''),
  intro                   TEXT NOT NULL DEFAULT '',
  seo_title               TEXT,
  seo_description         TEXT,
  google_product_category TEXT,
  sort                    INTEGER NOT NULL DEFAULT 0
);

INSERT INTO categories (id, slug, name, google_product_category, sort) VALUES
  (1, 'rice',    'Rice',    'Food, Beverages & Tobacco > Food Items > Grains, Rice & Cereal > Rice', 1),
  (2, 'spices',  'Spices',  'Food, Beverages & Tobacco > Food Items > Seasonings & Spices > Herbs & Spices', 2),
  (3, 'produce', 'Produce', 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables', 3);

CREATE TABLE products (
  id                       INTEGER PRIMARY KEY,
  category_id              INTEGER NOT NULL REFERENCES categories(id),
  slug                     TEXT NOT NULL CHECK (slug <> '' AND slug NOT GLOB '*[^a-z0-9-]*'),
  name                     TEXT NOT NULL CHECK (name <> ''),
  short_description        TEXT NOT NULL DEFAULT '',
  description_md           TEXT NOT NULL DEFAULT '',
  status                   TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'active', 'discontinued')),
  replacement_product_id   INTEGER REFERENCES products(id),

  organic_scheme           TEXT NOT NULL DEFAULT 'none'
                             CHECK (organic_scheme IN ('none', 'pgs_green', 'pgs_organic', 'npop')),
  organic_conversion_since INTEGER CHECK (organic_conversion_since IS NULL OR organic_conversion_since BETWEEN 2000 AND 2100),
  organic_cert_number      TEXT,
  organic_cert_r2_key      TEXT,

  process_claims           TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(process_claims) AND json_type(process_claims) = 'array'),
  how_its_made             TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(how_its_made) AND json_type(how_its_made) = 'object'),
  harvest_info             TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(harvest_info) AND json_type(harvest_info) = 'object'),
  attributes               TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes) AND json_type(attributes) = 'object'),
  faq                      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(faq) AND json_type(faq) = 'array'),

  -- Listing compliance (Legal Metrology Rule 6, FSSAI labelling & display)
  best_before_days         INTEGER CHECK (best_before_days IS NULL OR best_before_days > 0),
  storage_instructions     TEXT NOT NULL DEFAULT '',
  country_of_origin        TEXT NOT NULL DEFAULT 'India',
  ingredients              TEXT NOT NULL DEFAULT '',
  allergen_info            TEXT,
  veg_mark                 INTEGER NOT NULL DEFAULT 1 CHECK (veg_mark IN (0, 1)),
  nutrition                TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(nutrition) AND json_type(nutrition) = 'object'),

  hsn_code                 TEXT NOT NULL DEFAULT '' CHECK (hsn_code NOT GLOB '*[^0-9]*' AND length(hsn_code) IN (0, 4, 6, 8)),
  gst_rate_bp              INTEGER NOT NULL DEFAULT 0 CHECK (gst_rate_bp BETWEEN 0 AND 4000),

  perishable               INTEGER NOT NULL DEFAULT 0 CHECK (perishable IN (0, 1)),
  cod_allowed              INTEGER NOT NULL DEFAULT 1 CHECK (cod_allowed IN (0, 1)),
  delivery_zone            TEXT CHECK (delivery_zone IS NULL OR json_valid(delivery_zone)),          -- v2

  season_start_md          TEXT CHECK (season_start_md IS NULL OR season_start_md GLOB '[01][0-9]-[0-3][0-9]'),
  season_end_md            TEXT CHECK (season_end_md IS NULL OR season_end_md GLOB '[01][0-9]-[0-3][0-9]'),
  off_season_mode          TEXT CHECK (off_season_mode IS NULL OR off_season_mode IN ('notify', 'preorder')), -- v2
  preorder_dispatch_date   TEXT,                                                                     -- v2

  seo_title                TEXT,
  seo_description          TEXT,
  related_product_ids      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(related_product_ids) AND json_type(related_product_ids) = 'array'),

  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  published_at             TEXT,

  UNIQUE (category_id, slug),
  -- Perishables are prepaid only.
  CHECK (NOT (perishable = 1 AND cod_allowed = 1)),
  CHECK ((season_start_md IS NULL) = (season_end_md IS NULL)),
  CHECK (replacement_product_id IS NULL OR status = 'discontinued')
);

CREATE TABLE variants (
  id                  INTEGER PRIMARY KEY,
  product_id          INTEGER NOT NULL REFERENCES products(id),
  sku                 TEXT NOT NULL UNIQUE CHECK (sku <> ''),
  label               TEXT NOT NULL CHECK (label <> ''),
  net_qty_label       TEXT NOT NULL CHECK (net_qty_label <> ''),
  unit_qty_g          INTEGER NOT NULL CHECK (unit_qty_g > 0),
  price_paise         INTEGER NOT NULL CHECK (price_paise > 0),
  mrp_paise           INTEGER NOT NULL,                 -- the MRP printed on the pack
  currency            TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  weight_g            INTEGER NOT NULL CHECK (weight_g > 0),
  length_cm           REAL NOT NULL CHECK (length_cm > 0),
  breadth_cm          REAL NOT NULL CHECK (breadth_cm > 0),
  height_cm           REAL NOT NULL CHECK (height_cm > 0),
  stock_qty           INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),   -- available (unreserved) stock
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort                INTEGER NOT NULL DEFAULT 0,
  CHECK (price_paise <= mrp_paise)
);
CREATE INDEX variants_product ON variants(product_id, sort);

CREATE TABLE product_images (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  r2_key     TEXT NOT NULL,
  alt        TEXT NOT NULL CHECK (alt <> ''),
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX product_images_product ON product_images(product_id, sort);

CREATE TABLE lab_reports (
  id                INTEGER PRIMARY KEY,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  batch_code        TEXT NOT NULL,
  tested_on         TEXT NOT NULL,
  lab_name          TEXT NOT NULL,
  lab_accreditation TEXT,
  test_scope        TEXT NOT NULL DEFAULT '',
  summary           TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(summary)),
  pdf_r2_key        TEXT,
  visible           INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1))
);

CREATE TABLE batches (
  id                  INTEGER PRIMARY KEY,
  product_id          INTEGER NOT NULL REFERENCES products(id),
  batch_code          TEXT NOT NULL,
  packed_on           TEXT NOT NULL,
  ground_or_milled_on TEXT,
  lab_report_id       INTEGER REFERENCES lab_reports(id),
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (product_id, batch_code)
);
-- The buy box shows exactly one current batch per product.
CREATE UNIQUE INDEX batches_one_active ON batches(product_id) WHERE active = 1;

-- ── Orders ─────────────────────────────────────────────────────────────────

CREATE TABLE orders (
  id                     INTEGER PRIMARY KEY,
  order_no               TEXT NOT NULL UNIQUE,
  view_token_hash        TEXT NOT NULL,
  idempotency_key        TEXT UNIQUE,
  status                 TEXT NOT NULL CHECK (status IN (
                           'pending_payment', 'payment_failed', 'placed', 'packed', 'shipped',
                           'delivered', 'cancelled', 'rto', 'returned')),
  payment_method         TEXT NOT NULL CHECK (payment_method IN ('razorpay', 'cod')),
  payment_status         TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN (
                           'unpaid', 'authorized', 'paid', 'refund_pending', 'refunded', 'partially_refunded')),

  customer_name          TEXT NOT NULL CHECK (customer_name <> ''),
  email                  TEXT NOT NULL CHECK (email LIKE '%_@_%'),
  phone                  TEXT NOT NULL CHECK (length(phone) = 10 AND phone NOT GLOB '*[^0-9]*'),
  marketing_opt_in       INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_in IN (0, 1)),

  ship_line1             TEXT NOT NULL CHECK (ship_line1 <> ''),
  ship_line2             TEXT,
  ship_city              TEXT NOT NULL CHECK (ship_city <> ''),
  ship_state             TEXT NOT NULL CHECK (ship_state <> ''),
  ship_state_code        TEXT NOT NULL CHECK (length(ship_state_code) = 2 AND ship_state_code NOT GLOB '*[^0-9]*'),
  ship_pincode           TEXT NOT NULL CHECK (length(ship_pincode) = 6 AND ship_pincode NOT GLOB '*[^0-9]*'),

  bill_same_as_ship      INTEGER NOT NULL DEFAULT 1 CHECK (bill_same_as_ship IN (0, 1)),
  bill_name              TEXT,
  bill_line1             TEXT,
  bill_line2             TEXT,
  bill_city              TEXT,
  bill_state             TEXT,
  bill_state_code        TEXT CHECK (bill_state_code IS NULL OR (length(bill_state_code) = 2 AND bill_state_code NOT GLOB '*[^0-9]*')),
  bill_pincode           TEXT CHECK (bill_pincode IS NULL OR (length(bill_pincode) = 6 AND bill_pincode NOT GLOB '*[^0-9]*')),
  buyer_gstin            TEXT CHECK (buyer_gstin IS NULL OR length(buyer_gstin) = 15),
  buyer_legal_name       TEXT,

  subtotal_paise         INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  discount_paise         INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  gst_paise              INTEGER NOT NULL CHECK (gst_paise >= 0),
  total_paise            INTEGER NOT NULL CHECK (total_paise >= 0),
  currency               TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  coupon_code            TEXT,                                                    -- v2

  is_preorder            INTEGER NOT NULL DEFAULT 0 CHECK (is_preorder IN (0, 1)), -- v2
  expected_dispatch_date TEXT,                                                    -- v2
  ready_to_dispatch      INTEGER NOT NULL DEFAULT 0 CHECK (ready_to_dispatch IN (0, 1)), -- v2

  razorpay_order_id      TEXT UNIQUE,
  razorpay_payment_id    TEXT UNIQUE,
  paid_at                TEXT,

  shiprocket_order_id    TEXT,
  shiprocket_shipment_id TEXT,
  awb                    TEXT,
  courier                TEXT,
  tracking_url           TEXT,

  invoice_id             INTEGER REFERENCES invoices(id),
  cancel_reason          TEXT,
  cancelled_by           TEXT,

  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,

  -- No COD fee and free shipping: the payable total is the discounted subtotal.
  CHECK (total_paise = subtotal_paise - discount_paise),
  CHECK (gst_paise <= total_paise),
  CHECK (payment_method = 'razorpay' OR payment_status <> 'authorized')
);
CREATE INDEX orders_status_created ON orders(status, created_at);

CREATE TABLE order_items (
  id                INTEGER PRIMARY KEY,
  order_id          INTEGER NOT NULL REFERENCES orders(id),
  variant_id        INTEGER NOT NULL REFERENCES variants(id),
  product_name      TEXT NOT NULL,
  variant_label     TEXT NOT NULL,
  sku               TEXT NOT NULL,
  hsn_code          TEXT NOT NULL,
  gst_rate_bp       INTEGER NOT NULL CHECK (gst_rate_bp BETWEEN 0 AND 4000),
  unit_price_paise  INTEGER NOT NULL CHECK (unit_price_paise > 0),
  mrp_paise         INTEGER NOT NULL,
  qty               INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 20),
  discount_paise    INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  taxable_paise     INTEGER NOT NULL CHECK (taxable_paise >= 0),
  cgst_paise        INTEGER NOT NULL DEFAULT 0 CHECK (cgst_paise >= 0),
  sgst_paise        INTEGER NOT NULL DEFAULT 0 CHECK (sgst_paise >= 0),
  igst_paise        INTEGER NOT NULL DEFAULT 0 CHECK (igst_paise >= 0),
  line_total_paise  INTEGER NOT NULL CHECK (line_total_paise >= 0),
  perishable        INTEGER NOT NULL DEFAULT 0 CHECK (perishable IN (0, 1)),
  CHECK (unit_price_paise <= mrp_paise),
  CHECK (line_total_paise = unit_price_paise * qty - discount_paise),
  CHECK (line_total_paise = taxable_paise + cgst_paise + sgst_paise + igst_paise),
  CHECK (igst_paise = 0 OR (cgst_paise = 0 AND sgst_paise = 0)),
  UNIQUE (order_id, variant_id)
);

-- Immutable GST documents. Rendered only from `snapshot`.
CREATE TABLE invoices (
  id             INTEGER PRIMARY KEY,
  series         TEXT NOT NULL CHECK (series IN ('INV', 'CN')),
  doc_type       TEXT NOT NULL CHECK (doc_type IN (
                   'tax_invoice', 'bill_of_supply', 'invoice_cum_bill_of_supply', 'credit_note')),
  fy             TEXT NOT NULL CHECK (length(fy) = 4 AND fy NOT GLOB '*[^0-9]*'),
  seq            INTEGER NOT NULL CHECK (seq > 0),
  doc_no         TEXT NOT NULL UNIQUE CHECK (doc_no <> '' AND length(doc_no) <= 16),  -- CGST Rule 46(b)
  order_id       INTEGER NOT NULL REFERENCES orders(id),
  ref_invoice_id INTEGER REFERENCES invoices(id),
  issued_at      TEXT NOT NULL,
  snapshot       TEXT NOT NULL CHECK (json_valid(snapshot)),
  reason         TEXT,
  UNIQUE (series, fy, seq),
  -- The number is derived from (series, fy, seq), never typed in.
  CHECK (doc_no = CASE series WHEN 'INV' THEN 'HL/' || fy || '/' || printf('%06d', seq)
                              ELSE 'HLCN/' || fy || '/' || printf('%05d', seq) END),
  CHECK ((series = 'CN') = (doc_type = 'credit_note')),
  CHECK ((doc_type = 'credit_note') = (ref_invoice_id IS NOT NULL))
);
CREATE UNIQUE INDEX invoices_one_per_order ON invoices(order_id) WHERE doc_type <> 'credit_note';

CREATE TABLE doc_counters (
  series  TEXT NOT NULL CHECK (series IN ('INV', 'CN')),
  fy      TEXT NOT NULL CHECK (length(fy) = 4),
  last_no INTEGER NOT NULL DEFAULT 0 CHECK (last_no >= 0),
  PRIMARY KEY (series, fy)
);
INSERT INTO doc_counters (series, fy) VALUES ('INV', '2627'), ('INV', '2728'), ('CN', '2627'), ('CN', '2728');
-- Rows for later years are created on demand by the issuing batch
-- (src/lib/store/docnumbers.ts: INSERT OR IGNORE, then +1).

-- A counter only ever advances by exactly one, so no number is skipped.
CREATE TRIGGER doc_counters_step_one BEFORE UPDATE OF last_no ON doc_counters
WHEN NEW.last_no IS NOT OLD.last_no + 1
BEGIN
  SELECT RAISE(ABORT, 'document counter must advance by one');
END;

CREATE TRIGGER doc_counters_no_delete BEFORE DELETE ON doc_counters
BEGIN
  SELECT RAISE(ABORT, 'document counters are permanent');
END;

-- Gapless numbering: a document must take exactly the counter's current value,
-- which the same batch has just incremented.
CREATE TRIGGER invoices_seq_matches_counter BEFORE INSERT ON invoices
WHEN NEW.seq IS NOT (SELECT last_no FROM doc_counters WHERE series = NEW.series AND fy = NEW.fy)
BEGIN
  SELECT RAISE(ABORT, 'invoice sequence mismatch');
END;

CREATE TRIGGER invoices_credit_note_ref BEFORE INSERT ON invoices
WHEN NEW.doc_type = 'credit_note'
 AND (SELECT order_id = NEW.order_id AND doc_type <> 'credit_note' FROM invoices WHERE id = NEW.ref_invoice_id) IS NOT 1
BEGIN
  SELECT RAISE(ABORT, 'credit note must reference an invoice of the same order');
END;

CREATE TRIGGER invoices_no_update BEFORE UPDATE ON invoices
BEGIN
  SELECT RAISE(ABORT, 'invoices are immutable');
END;

CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices
BEGIN
  SELECT RAISE(ABORT, 'invoices are immutable');
END;

CREATE TABLE refunds (
  id                 INTEGER PRIMARY KEY,
  order_id           INTEGER NOT NULL REFERENCES orders(id),
  credit_note_id     INTEGER REFERENCES invoices(id),
  amount_paise       INTEGER NOT NULL CHECK (amount_paise > 0),
  razorpay_refund_id TEXT UNIQUE,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  reason             TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE stock_reservations (
  id         INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  qty        INTEGER NOT NULL CHECK (qty > 0),
  expires_at TEXT NOT NULL,
  state      TEXT NOT NULL CHECK (state IN ('held', 'consumed', 'released'))
);
CREATE INDEX stock_reservations_expiry ON stock_reservations(state, expires_at);
-- One live hold per order line. Released rows stay as history, so a late
-- authorisation can re-reserve the same line with a new row.
CREATE UNIQUE INDEX stock_reservations_one_held ON stock_reservations(order_id, variant_id) WHERE state = 'held';

-- A reservation can only be taken on a variant that is on sale. Checkout puts
-- the stock decrement and this insert in one batch, so the abort undoes both.
-- (Admins can still correct stock on inactive variants directly.)
CREATE TRIGGER stock_reservations_purchasable BEFORE INSERT ON stock_reservations
WHEN (SELECT v.active = 1 AND p.status = 'active'
        FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.id = NEW.variant_id) IS NOT 1
BEGIN
  SELECT RAISE(ABORT, 'variant not purchasable');
END;

-- held → consumed | released, never back.
CREATE TRIGGER stock_reservations_forward_only BEFORE UPDATE OF state ON stock_reservations
WHEN OLD.state <> 'held' AND NEW.state <> OLD.state
BEGIN
  SELECT RAISE(ABORT, 'reservation state is final');
END;

CREATE TRIGGER stock_reservations_fixed_lines BEFORE UPDATE OF variant_id, order_id, qty ON stock_reservations
WHEN NEW.variant_id IS NOT OLD.variant_id OR NEW.order_id IS NOT OLD.order_id OR NEW.qty IS NOT OLD.qty
BEGIN
  SELECT RAISE(ABORT, 'reservation lines are immutable');
END;

CREATE TRIGGER stock_reservations_no_delete BEFORE DELETE ON stock_reservations
BEGIN
  SELECT RAISE(ABORT, 'reservations are permanent history');
END;

-- ── Coordination ───────────────────────────────────────────────────────────

-- Exactly-once claims: `ok` is computed in SQL from the current order state,
-- so a stale or repeated claim errors (CHECK / NOT NULL / PK) and aborts its batch.
-- A kind is claimable once per order, so anything that can legitimately repeat
-- must carry a discriminator: 'refund:<refund_id>', 'credit_note:<n>', 'retry_capture:<attempt>'.
CREATE TABLE ops (
  order_id   INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  ok         INTEGER NOT NULL CHECK (ok = 1),
  created_at TEXT NOT NULL,
  PRIMARY KEY (order_id, kind)
);

CREATE TABLE order_events (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  at          TEXT NOT NULL,
  type        TEXT NOT NULL,
  actor       TEXT NOT NULL CHECK (actor IN ('customer', 'admin', 'razorpay', 'shiprocket', 'system')),
  actor_email TEXT,
  note        TEXT
);
CREATE INDEX order_events_order ON order_events(order_id, at);

CREATE TRIGGER order_events_no_update BEFORE UPDATE ON order_events
BEGIN
  SELECT RAISE(ABORT, 'order_events are append-only');
END;

CREATE TRIGGER order_events_no_delete BEFORE DELETE ON order_events
BEGIN
  SELECT RAISE(ABORT, 'order_events are append-only');
END;

-- Side effects are written in the same batch as the state change and drained
-- afterwards (by the request, then by cron). `running` + `lease_until` make
-- overlapping drains safe and let a crashed run's rows be reclaimed.
CREATE TABLE outbox (
  id              INTEGER PRIMARY KEY,
  order_id        INTEGER REFERENCES orders(id),
  kind            TEXT NOT NULL CHECK (kind <> ''),
  payload         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload)),
  state           TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'done', 'dead')),
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT NOT NULL,
  lease_until     TEXT,
  last_error      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX outbox_due ON outbox(state, next_attempt_at);

CREATE TABLE webhook_events (
  source      TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (source, event_id)
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
