-- V2-5 partial refunds. A refund can cover part of an order: per line (some
-- of its quantity) or a plain amount spread over the lines. The database caps
-- each line at its line total and each order at the amount paid, so racing
-- refunds can never exceed it.
--
-- A refund that failed at the bank still counts (its credit note stands: the
-- money is owed to the customer) until it is retried; the retry row
-- (`retry_of`) takes its place, with the same lines and credit note.

ALTER TABLE refunds ADD COLUMN retry_of INTEGER REFERENCES refunds(id);
CREATE UNIQUE INDEX refunds_one_retry ON refunds(retry_of) WHERE retry_of IS NOT NULL;

CREATE TABLE refund_lines (
  refund_id     INTEGER NOT NULL REFERENCES refunds(id),
  order_item_id INTEGER NOT NULL REFERENCES order_items(id),
  -- Units given back (0 for a price adjustment spread over the line).
  qty           INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  amount_paise  INTEGER NOT NULL CHECK (amount_paise > 0),
  PRIMARY KEY (refund_id, order_item_id)
);
CREATE INDEX refund_lines_item ON refund_lines(order_item_id);

-- "Counts": every refund except a failed one that has been retried.
CREATE TRIGGER refund_lines_within_line BEFORE INSERT ON refund_lines
WHEN (SELECT retry_of FROM refunds WHERE id = NEW.refund_id) IS NULL
 AND ((SELECT COALESCE(SUM(l.amount_paise), 0) FROM refund_lines l JOIN refunds r ON r.id = l.refund_id
       WHERE l.order_item_id = NEW.order_item_id AND NOT (r.status = 'failed' AND EXISTS (SELECT 1 FROM refunds x WHERE x.retry_of = r.id))) + NEW.amount_paise
    > (SELECT line_total_paise FROM order_items WHERE id = NEW.order_item_id)
   OR (SELECT COALESCE(SUM(l.qty), 0) FROM refund_lines l JOIN refunds r ON r.id = l.refund_id
       WHERE l.order_item_id = NEW.order_item_id AND NOT (r.status = 'failed' AND EXISTS (SELECT 1 FROM refunds x WHERE x.retry_of = r.id))) + NEW.qty
    > (SELECT qty FROM order_items WHERE id = NEW.order_item_id))
BEGIN
  SELECT RAISE(ABORT, 'refund exceeds the line');
END;

CREATE TRIGGER refund_lines_same_order BEFORE INSERT ON refund_lines
WHEN (SELECT order_id FROM refunds WHERE id = NEW.refund_id) IS NOT (SELECT order_id FROM order_items WHERE id = NEW.order_item_id)
BEGIN
  SELECT RAISE(ABORT, 'refund line from another order');
END;

CREATE TRIGGER refunds_within_total BEFORE INSERT ON refunds
WHEN NEW.retry_of IS NULL
 AND (SELECT COALESCE(SUM(amount_paise), 0) FROM refunds r
      WHERE r.order_id = NEW.order_id AND NOT (r.status = 'failed' AND EXISTS (SELECT 1 FROM refunds x WHERE x.retry_of = r.id))) + NEW.amount_paise
   > (SELECT total_paise FROM orders WHERE id = NEW.order_id)
BEGIN
  SELECT RAISE(ABORT, 'refund exceeds the amount paid');
END;

-- A retry replaces exactly one failed refund of the same order, for the same amount.
CREATE TRIGGER refunds_retry_matches BEFORE INSERT ON refunds
WHEN NEW.retry_of IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM refunds f WHERE f.id = NEW.retry_of AND f.order_id = NEW.order_id AND f.status = 'failed' AND f.amount_paise = NEW.amount_paise)
BEGIN
  SELECT RAISE(ABORT, 'retry must replace a failed refund');
END;
