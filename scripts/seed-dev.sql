-- LOCAL DEVELOPMENT ONLY — sample catalog for trying the storefront.
-- Prices, stock, batches and lab values are made up. Never run with --remote.
--   npx wrangler d1 execute harileaf-store --local --file scripts/seed-dev.sql

INSERT INTO products (id, category_id, slug, name, short_description, description_md, status, process_claims, how_its_made, harvest_info, attributes, faq,
  best_before_days, storage_instructions, ingredients, nutrition, hsn_code, gst_rate_bp, created_at, updated_at, published_at)
VALUES
 (1, 1, 'karjat-3', 'Karjat 3 Unpolished Rice', 'Hearty short-grain rice, milled just enough to remove the husk so the bran and germ stay on the grain.',
  'A dependable short-grain rice developed at a Konkan rice research station.' || char(10) || char(10) || 'Cooks soft and separate — ideal for **dal-chawal**, khichdi and lunch-box rice.',
  'active', '[{"code":"unpolished","text":"Unpolished","evidence_note":"Mill setting: husking only"},{"code":"hand_harvested","text":"Hand harvested","evidence_note":"Harvest log"}]',
  '{"Milling":"Husk removed only — no polishing","Drying":"Sun-dried paddy"}', '{"Harvest":"Kharif 2026"}', '{"Grain":"Short, bold","Cooking":"Soak 20 min; 1 : 2¼ water"}',
  '[{"q":"How long should I soak it?","a":"15–20 minutes, then cook 1 cup rice to 2¼ cups water."}]',
  270, 'Store in an airtight container in a cool, dry place.', 'Rice (100%)', '{"per":"100 g","source":"Sample values (dev seed)","rows":[{"name":"Dietary fibre","amount":"3.2 g"},{"name":"Protein","amount":"7.9 g"}]}',
  '1006', 500, '2026-10-18T06:00:00.000Z', '2026-10-18T06:00:00.000Z', '2026-10-18T06:00:00.000Z'),
 (2, 2, 'turmeric-powder', 'Stone-Ground Turmeric Powder', 'Sun-dried turmeric, ground slowly on stone in small lots.', '',
  'active', '[{"code":"stone_ground","text":"Stone ground","evidence_note":"Mill log"},{"code":"sun_dried","text":"Sun dried","evidence_note":"Drying log"}]',
  '{"Drying":"Whole rhizomes, sun-dried","Grinding":"Slow stone mill, small lots"}', '{}', '{}', '[]',
  365, 'Keep tightly closed, away from light and moisture.', 'Turmeric (100%)', '{"per":"100 g","source":null,"rows":[]}',
  '091030', 500, '2026-10-18T06:00:00.000Z', '2026-10-18T06:00:00.000Z', '2026-10-18T06:00:00.000Z');

INSERT INTO variants (product_id, sku, label, net_qty_label, unit_qty_g, price_paise, mrp_paise, weight_g, length_cm, breadth_cm, height_cm, stock_qty, sort) VALUES
 (1, 'KJ3-1KG', '1 kg', '1 kg', 1000, 14900, 16900, 1050, 20, 14, 6, 25, 0),
 (1, 'KJ3-5KG', '5 kg', '5 kg', 5000, 69900, 79900, 5150, 35, 25, 10, 12, 1),
 (2, 'TUR-200G', '200 g', '200 g', 200, 12900, 14900, 230, 15, 10, 5, 0, 0),
 (2, 'TUR-500G', '500 g', '500 g', 500, 29900, 29900, 540, 18, 12, 6, 30, 1);

INSERT INTO product_images (product_id, r2_key, alt, sort) VALUES
 (1, 'products/dev/rice-karjat.jpg', 'Karjat 3 rice grains', 0),
 (1, 'products/dev/rice-wada.jpg', 'Cooked rice in a steel bowl', 1),
 (2, 'products/dev/spice-turmeric.jpg', 'Stone-ground turmeric powder', 0);

INSERT INTO lab_reports (id, product_id, batch_code, tested_on, lab_name, lab_accreditation, test_scope, summary, visible) VALUES
 (1, 1, 'KJ-2610', '2026-10-14', 'Sample Lab (dev)', 'NABL TC-0000', 'Pesticide residues', '{"Pesticide residues":"Not detected (LOD 0.01 mg/kg)"}', 1);

INSERT INTO batches (product_id, batch_code, packed_on, ground_or_milled_on, lab_report_id, active) VALUES
 (1, 'KJ-2610', '2026-10-12', '2026-10-10', 1, 1);
