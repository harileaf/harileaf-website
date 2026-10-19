-- V2-1 coupons (discount codes).
--
-- The database enforces every limit: a redemption row is part of the order
-- batch, and triggers keep `used_count` in step with the rows, so the usage
-- CHECK and the one-per-phone UNIQUE abort the whole order batch when a code
-- is used up. Releasing a use (payment failed) is a DELETE of the order's
-- redemption inside the expiry claim batch.

CREATE TABLE coupons (
  code               TEXT PRIMARY KEY CHECK (length(code) BETWEEN 4 AND 20 AND code NOT GLOB '*[^A-Z0-9]*'),
  kind               TEXT NOT NULL CHECK (kind IN ('percent', 'flat')),
  -- percent: whole percent (1–90); flat: paise.
  value              INTEGER NOT NULL CHECK (value > 0),
  max_discount_paise INTEGER CHECK (max_discount_paise IS NULL OR max_discount_paise > 0),
  -- Compared with the cart subtotal before any discount.
  min_order_paise    INTEGER NOT NULL DEFAULT 0 CHECK (min_order_paise >= 0),
  starts_at          TEXT,
  ends_at            TEXT,
  usage_limit        INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  used_count         INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  one_per_phone      INTEGER NOT NULL DEFAULT 0 CHECK (one_per_phone IN (0, 1)),
  -- NULL = every category; otherwise a JSON array of category ids.
  category_ids       TEXT CHECK (category_ids IS NULL OR (json_valid(category_ids) AND json_type(category_ids) = 'array')),
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  note               TEXT,
  first_used_at      TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  CONSTRAINT coupon_usage_limit CHECK (usage_limit IS NULL OR used_count <= usage_limit),
  CHECK (kind <> 'percent' OR value BETWEEN 1 AND 90),
  -- A flat code can never cover a whole order, so a coupon never makes a total ₹0
  -- (₹0 orders are free replacements).
  CHECK (kind <> 'flat' OR min_order_paise > value),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

CREATE TABLE coupon_redemptions (
  id          INTEGER PRIMARY KEY,
  coupon_code TEXT NOT NULL REFERENCES coupons(code),
  order_id    INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  -- Only for one-per-phone codes (NULLs never collide in a UNIQUE).
  phone       TEXT CHECK (phone IS NULL OR (length(phone) = 10 AND phone NOT GLOB '*[^0-9]*')),
  created_at  TEXT NOT NULL,
  UNIQUE (coupon_code, phone)
);

-- Only an active code, inside its dates (judged at the order's time), with a
-- phone when it is one-per-phone.
CREATE TRIGGER coupon_redemptions_redeemable BEFORE INSERT ON coupon_redemptions
WHEN NOT EXISTS (
  SELECT 1 FROM coupons c
  WHERE c.code = NEW.coupon_code AND c.active = 1
    AND (c.starts_at IS NULL OR c.starts_at <= NEW.created_at)
    AND (c.ends_at IS NULL OR NEW.created_at < c.ends_at)
    AND (c.one_per_phone = 0 OR NEW.phone IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'coupon not redeemable');
END;

CREATE TRIGGER coupon_redemptions_count AFTER INSERT ON coupon_redemptions
BEGIN
  UPDATE coupons SET used_count = used_count + 1, first_used_at = COALESCE(first_used_at, NEW.created_at) WHERE code = NEW.coupon_code;
END;

CREATE TRIGGER coupon_redemptions_release AFTER DELETE ON coupon_redemptions
BEGIN
  UPDATE coupons SET used_count = used_count - 1 WHERE code = OLD.coupon_code;
END;

CREATE TRIGGER coupon_redemptions_fixed BEFORE UPDATE OF coupon_code, order_id, created_at ON coupon_redemptions
BEGIN
  SELECT RAISE(ABORT, 'coupon redemptions are fixed');
END;

-- Once a code has been used, its terms are frozen; it can only be paused.
CREATE TRIGGER coupons_terms_frozen BEFORE UPDATE OF code, kind, value, max_discount_paise, min_order_paise, starts_at, ends_at, usage_limit, one_per_phone, category_ids ON coupons
WHEN OLD.first_used_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'coupon terms are frozen after first use');
END;

CREATE TRIGGER coupons_no_delete_used BEFORE DELETE ON coupons
WHEN OLD.first_used_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'coupon terms are frozen after first use');
END;

-- A discount on an order comes from a coupon (free replacements excepted).
CREATE TRIGGER orders_discount_needs_coupon BEFORE INSERT ON orders
WHEN NEW.discount_paise > 0 AND NEW.coupon_code IS NULL AND NEW.replacement_for_order_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'discount without a coupon');
END;

CREATE INDEX orders_coupon_code ON orders(coupon_code) WHERE coupon_code IS NOT NULL;
