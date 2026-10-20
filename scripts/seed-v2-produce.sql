-- v2 fresh produce: Kesar mango (launch, Mumbai MMR) and dragon fruit (notify-me only).
-- Inserts DRAFT products for the owner to review in /admin/products before publishing:
--   * prices, pack weights, season dates and box sizes are placeholders — set the real ones;
--   * every process claim needs its evidence note (ripening log, harvest record) before the
--     editor lets you publish; until then "naturally ripened" wording is refused by the claims check;
--   * add at least 3 real photos with alt text.
-- Safe to run on the production database (and to re-run): both products stay draft (404) until published.
--   npx wrangler d1 execute harileaf-store --remote --file scripts/seed-v2-produce.sql

INSERT INTO products (category_id, slug, name, short_description, description_md, status, process_claims, how_its_made, harvest_info, attributes, faq,
  best_before_days, storage_instructions, country_of_origin, ingredients, nutrition, hsn_code, gst_rate_bp, perishable, cod_allowed, delivery_zone,
  season_start_md, season_end_md, off_season_mode, seo_title, seo_description, created_at, updated_at)
VALUES
 (3, 'kesar-mango', 'Kesar Mango',
  'Kesar mangoes from our farm, picked mature and ripened in hay — delivered within Mumbai MMR by express courier.',
  'Kesar is named for its saffron-orange flesh. Ours are picked by hand once the fruit is mature on the tree, then ripened in hay at the farm for a few days — never with calcium carbide, which FSSAI prohibits for ripening fruit.' || char(10) || char(10) ||
  'We send them only within **Mumbai MMR**, by express courier, so they reach you within two days of leaving the farm. We dispatch Monday to Thursday so no box sits in a courier hub over the weekend.' || char(10) || char(10) ||
  'Each box is packed in a single layer with padding. Some mangoes may need a day or two at room temperature: they are ready when they smell sweet at the stem and give slightly when pressed.',
  'draft',
  '[{"code":"natural","text":"Ripened in hay, no calcium carbide","evidence_note":""},{"code":"hand_picked","text":"Hand picked when mature","evidence_note":""}]',
  '{"Ripening":"In hay at the farm, a few days after picking","Picking":"By hand, when mature on the tree","Packing":"Single layer, padded box"}',
  '{"Season":"April to June (depends on the year’s weather)","Dispatch":"Monday to Thursday"}',
  '{"Variety":"Kesar","Grown at":"HariLeaf farm, Maharashtra","Delivery area":"Mumbai MMR only"}',
  '[{"q":"How can you tell a naturally ripened mango?","a":"Its skin ripens unevenly, with green and yellow patches; it smells sweet and fruity at the stem end; and the flesh is soft right up to the stone. A uniform bright-yellow skin with firm, pale flesh inside is a warning sign of forced ripening."},{"q":"How do you ripen your mangoes?","a":"We pick them mature and ripen them in hay at the farm for a few days. We never use calcium carbide."},{"q":"Where do you deliver Kesar mangoes?","a":"Only within Mumbai MMR, by express courier within two days of dispatch. Enter your pincode on this page to see the dispatch day and delivery dates."},{"q":"How should I store them?","a":"Keep them at room temperature, out of the sun, until they smell sweet and give slightly. Then refrigerate and eat within two to three days."},{"q":"What if a mango arrives damaged?","a":"Send us a photo of the box and the fruit within 24 hours of delivery and we’ll replace or refund the damaged fruit. Fresh produce can’t be returned otherwise."}]',
  7, 'Ripen at room temperature away from direct sun; once ripe, refrigerate and eat within 2–3 days.', 'India', 'Kesar mango (100%)', '{"per":"100 g","source":null,"rows":[]}',
  '080450', 0, 1, 0, '{"zone":"mmr"}', '04-20', '06-15', 'notify',
  'Kesar Mango Online, Mumbai | Hay-Ripened, No Carbide | HariLeaf',
  'Kesar mangoes from our farm, ripened in hay without calcium carbide and delivered within Mumbai MMR by express courier. Season April–June.',
  '2026-10-19T06:00:00.000Z', '2026-10-19T06:00:00.000Z'),
 (3, 'dragon-fruit', 'Dragon Fruit',
  'Dragon fruit grown at our farm, delivered within Mumbai MMR when we have a harvest to share.',
  'Our dragon fruit grows on climbing cactus at the farm and is picked when fully coloured. When we have a harvest to share we deliver it only within **Mumbai MMR**, by express courier.' || char(10) || char(10) ||
  'Not available right now: leave your email and we’ll tell you once, when it is.',
  'draft',
  '[{"code":"hand_picked","text":"Hand picked when fully coloured","evidence_note":""}]',
  '{"Picking":"By hand, when the skin is fully coloured"}', '{}', '{"Grown at":"HariLeaf farm, Maharashtra","Delivery area":"Mumbai MMR only"}',
  '[{"q":"Do you deliver dragon fruit in Mumbai?","a":"Yes, within Mumbai MMR, when we have a harvest to share. Leave your email on this page and we’ll tell you once it can be ordered."},{"q":"How should I store dragon fruit?","a":"At room temperature for a day or two, or in the fridge for up to a week."}]',
  5, 'Room temperature for 1–2 days, or refrigerate for up to a week.', 'India', 'Dragon fruit (100%)', '{"per":"100 g","source":null,"rows":[]}',
  '081090', 0, 1, 0, '{"zone":"mmr"}', NULL, NULL, 'notify',
  'Dragon Fruit Online, Mumbai | From Our Farm | HariLeaf',
  'Dragon fruit from our farm, delivered within Mumbai MMR by express courier when we have a harvest. Leave your email to hear when it’s ready.',
  '2026-10-19T06:00:00.000Z', '2026-10-19T06:00:00.000Z')
-- Re-running is safe: existing products/packs (same slug or SKU) are left as they are; any other error stops the script.
ON CONFLICT DO NOTHING;

-- Placeholder packs (stock 0, prices to be set). Legal Metrology: a fixed box is a pre-packaged
-- commodity, so declare its net quantity (weight) and MRP, and show the unit price per kg.
INSERT INTO variants (product_id, sku, label, net_qty_label, unit_qty_g, price_paise, mrp_paise, weight_g, length_cm, breadth_cm, height_cm, stock_qty, sort)
SELECT id, 'KESAR-3KG', '3 kg box', '3 kg (about 10–12 mangoes)', 3000, 120000, 120000, 3600, 40, 30, 12, 0, 0 FROM products WHERE category_id = 3 AND slug = 'kesar-mango' ON CONFLICT DO NOTHING;
INSERT INTO variants (product_id, sku, label, net_qty_label, unit_qty_g, price_paise, mrp_paise, weight_g, length_cm, breadth_cm, height_cm, stock_qty, sort)
SELECT id, 'DRAGON-1KG', '1 kg', '1 kg (2–3 fruits)', 1000, 30000, 30000, 1300, 25, 20, 12, 0, 0 FROM products WHERE category_id = 3 AND slug = 'dragon-fruit' ON CONFLICT DO NOTHING;
