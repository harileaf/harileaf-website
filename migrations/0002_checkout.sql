-- M3 checkout: per-month order number counter (HL-YYMM-NNNN).
CREATE TABLE order_counters (
  yymm    TEXT PRIMARY KEY CHECK (length(yymm) = 4 AND yymm NOT GLOB '*[^0-9]*'),
  last_no INTEGER NOT NULL DEFAULT 0 CHECK (last_no >= 0)
);

-- Like document counters, an order counter only ever advances by one.
CREATE TRIGGER order_counters_step_one BEFORE UPDATE OF last_no ON order_counters
WHEN NEW.last_no IS NOT OLD.last_no + 1
BEGIN
  SELECT RAISE(ABORT, 'order counter must advance by one');
END;

CREATE INDEX orders_pending ON orders(status, created_at) WHERE status = 'pending_payment';
