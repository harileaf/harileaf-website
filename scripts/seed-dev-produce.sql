-- LOCAL / CI ONLY — on top of seed-v2-produce.sql: publishes the Kesar mango, in season
-- with stock, and enables the Mumbai MMR zone, so a buyable perishable page exists for
-- e2e and Lighthouse. Never run with --remote.
UPDATE products SET status = 'active', published_at = '2026-10-19T06:00:00.000Z', season_start_md = NULL, season_end_md = NULL,
  process_claims = '[{"code":"natural","text":"Ripened in hay, no calcium carbide","evidence_note":"Dev seed"},{"code":"hand_picked","text":"Hand picked when mature","evidence_note":"Dev seed"}]'
WHERE category_id = 3 AND slug = 'kesar-mango';
UPDATE variants SET stock_qty = 40 WHERE sku = 'KESAR-3KG';
INSERT INTO settings (key, value) VALUES ('delivery_zones', '[{"id":"mmr","name":"Mumbai MMR","pincodes":["400","401","4102","421"],"expressOnly":true,"maxTransitDays":2,"enabled":true}]')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
