-- M4 orders: replacements and COD remittance reconciliation.

-- A free replacement for a damaged/wrong order (zero-value, linked to the original).
ALTER TABLE orders ADD COLUMN replacement_for_order_id INTEGER REFERENCES orders(id);

-- COD cash remitted by Shiprocket, imported from its remittance report.
CREATE TABLE cod_remittances (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER REFERENCES orders(id),
  order_no     TEXT,
  awb          TEXT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  remitted_on  TEXT,
  utr          TEXT,
  imported_at  TEXT NOT NULL,
  UNIQUE (awb, utr)
);
CREATE INDEX cod_remittances_order ON cod_remittances(order_id);

CREATE INDEX orders_awb ON orders(awb);
CREATE INDEX orders_shiprocket ON orders(shiprocket_order_id);
CREATE INDEX refunds_order ON refunds(order_id, status);
