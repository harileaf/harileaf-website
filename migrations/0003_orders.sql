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

-- Delivery challans (CGST Rule 55) for free replacements, which carry no invoice.
-- Numbered per financial year without gaps: seq is assigned in the INSERT itself.
CREATE TABLE delivery_challans (
  id        INTEGER PRIMARY KEY,
  order_id  INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  fy        TEXT NOT NULL CHECK (length(fy) = 4 AND fy NOT GLOB '*[^0-9]*'),
  seq       INTEGER NOT NULL CHECK (seq > 0),
  doc_no    TEXT NOT NULL UNIQUE CHECK (doc_no = 'HLDC/' || fy || '/' || printf('%05d', seq)),
  issued_at TEXT NOT NULL,
  snapshot  TEXT NOT NULL CHECK (json_valid(snapshot)),
  UNIQUE (fy, seq)
);
CREATE TRIGGER delivery_challans_immutable BEFORE UPDATE ON delivery_challans
BEGIN SELECT RAISE(ABORT, 'delivery challans are immutable'); END;
CREATE TRIGGER delivery_challans_no_delete BEFORE DELETE ON delivery_challans
BEGIN SELECT RAISE(ABORT, 'delivery challans are immutable'); END;

CREATE INDEX orders_awb ON orders(awb);
CREATE INDEX orders_shiprocket ON orders(shiprocket_order_id);
CREATE INDEX refunds_order ON refunds(order_id, status);
