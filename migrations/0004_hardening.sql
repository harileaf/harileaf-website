-- M5 hardening.

-- COD confirmation before shipping. Decided per order at placement: orders
-- placed while the `cod_confirmation` setting is off (and all orders from
-- before this migration) are confirmed on creation; the rest wait for the
-- customer (button on the order page) or an admin (after a call).
ALTER TABLE orders ADD COLUMN cod_confirmed_at TEXT;
UPDATE orders SET cod_confirmed_at = created_at WHERE payment_method = 'cod';
CREATE INDEX orders_cod_unconfirmed ON orders(created_at) WHERE payment_method = 'cod' AND status = 'placed' AND cod_confirmed_at IS NULL;

-- Order-link rotation: the emailed link is derived from (idempotency key, rev);
-- "find your order" bumps rev, so earlier links stop working.
ALTER TABLE orders ADD COLUMN view_token_rev INTEGER NOT NULL DEFAULT 0 CHECK (view_token_rev >= 0);

-- The outbox is queried per order and kind (dedupe checks for reminders, resends).
CREATE INDEX outbox_order_kind ON outbox(order_id, kind, created_at);
