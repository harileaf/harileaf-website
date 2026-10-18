-- M5 hardening: COD order confirmation before shipping.
-- Set when the customer (button in the order email / order page) or an admin
-- (after a call) confirms a cash-on-delivery order; unconfirmed COD orders are
-- not pushed to the courier while the `cod_confirmation` setting is on.
ALTER TABLE orders ADD COLUMN cod_confirmed_at TEXT;
CREATE INDEX orders_cod_unconfirmed ON orders(created_at) WHERE payment_method = 'cod' AND status = 'placed' AND cod_confirmed_at IS NULL;
