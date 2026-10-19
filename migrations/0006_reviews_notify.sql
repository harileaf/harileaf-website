-- V2-2 verified-buyer reviews and "notify me" sign-ups.

-- One review per (order, product), only from a delivered order that contains
-- the product. Moderation moves forward only; the text never changes, except
-- that a review withdrawn at the reviewer's request (DPDP erasure) is blanked.
CREATE TABLE reviews (
  id              INTEGER PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id),
  product_id      INTEGER NOT NULL REFERENCES products(id),
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 100),
  body            TEXT NOT NULL CHECK (length(body) BETWEEN 10 AND 2000),
  display_name    TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 40),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reject_reason   TEXT CHECK (reject_reason IS NULL OR reject_reason IN ('abusive', 'personal_info', 'off_topic', 'spam', 'health_claim')),
  created_at      TEXT NOT NULL,
  moderated_at    TEXT,
  moderated_by    TEXT,
  approved_at     TEXT,
  UNIQUE (order_id, product_id),
  CHECK ((status = 'approved') = (approved_at IS NOT NULL) OR status = 'withdrawn'),
  CHECK ((status = 'rejected') = (reject_reason IS NOT NULL))
);
CREATE INDEX reviews_product_published ON reviews(product_id, approved_at DESC) WHERE status = 'approved';
CREATE INDEX reviews_pending ON reviews(created_at) WHERE status = 'pending';

CREATE TRIGGER reviews_verified_buyer BEFORE INSERT ON reviews
WHEN NOT EXISTS (
  SELECT 1 FROM orders o JOIN order_items i ON i.order_id = o.id JOIN variants v ON v.id = i.variant_id
  WHERE o.id = NEW.order_id AND o.status = 'delivered' AND o.replacement_for_order_id IS NULL AND v.product_id = NEW.product_id
)
BEGIN
  SELECT RAISE(ABORT, 'review needs a delivered order with this product');
END;

CREATE TRIGGER reviews_new_is_pending BEFORE INSERT ON reviews
WHEN NEW.status <> 'pending'
BEGIN
  SELECT RAISE(ABORT, 'reviews start pending');
END;

-- pending → approved | rejected | withdrawn; approved → withdrawn. Nothing else.
CREATE TRIGGER reviews_forward_only BEFORE UPDATE OF status ON reviews
WHEN NOT ((OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected', 'withdrawn')) OR (OLD.status = 'approved' AND NEW.status = 'withdrawn'))
BEGIN
  SELECT RAISE(ABORT, 'review moderation is final');
END;

CREATE TRIGGER reviews_content_fixed BEFORE UPDATE OF order_id, product_id, rating, title, body, display_name, created_at ON reviews
WHEN NOT (OLD.status <> 'withdrawn' AND NEW.status = 'withdrawn' AND NEW.order_id = OLD.order_id AND NEW.product_id = OLD.product_id AND NEW.rating = OLD.rating AND NEW.created_at = OLD.created_at)
BEGIN
  SELECT RAISE(ABORT, 'review content is fixed');
END;

CREATE TRIGGER reviews_no_delete BEFORE DELETE ON reviews
BEGIN
  SELECT RAISE(ABORT, 'reviews are never deleted');
END;

-- "Notify me": one live request per (product, email). queued_at marks the
-- single outbox row created for it; notified_at is set once the email went.
-- Rows are deleted by the retention job after notification or 12 months.
CREATE TABLE notify_requests (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  email       TEXT NOT NULL CHECK (email LIKE '%_@_%' AND length(email) <= 254),
  created_at  TEXT NOT NULL,
  queued_at   TEXT,
  notified_at TEXT,
  UNIQUE (product_id, email),
  CHECK (notified_at IS NULL OR queued_at IS NOT NULL)
);
CREATE INDEX notify_requests_waiting ON notify_requests(product_id) WHERE queued_at IS NULL;
