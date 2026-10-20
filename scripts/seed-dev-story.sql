-- Story sections for the dev turmeric product (id 2) and published /turmeric and /spices pages.
-- Made-up values. Never run with --remote.
UPDATE products SET
  organic_scheme = 'pgs_organic', organic_cert_number = 'PGS-DEV-1',
  process_claims = json('[{"code":"stone_ground","text":"Stone-ground slowly","evidence_note":"Mill log (dev)"}]'),
  story = json('{"proofLine":[{"kind":"lab","key":"Curcumin","label":"Curcumin"},{"kind":"text","text":"Lab-tested every batch"}],"icons":[{"icon":"stone_mill","label":"Stone-ground cool"},{"icon":"sun","label":"Boiled and sun-cured"},{"icon":"lab","label":"Batch lab report"}],"showCategorySwitcher":false,"originStory":null,"processSteps":[{"title":"Dug by hand","text":"After about nine months, when the leaves dry.","photoKey":null,"photoAlt":""},{"title":"Boiled and sun-cured","text":"Then dried in the sun for about three weeks.","photoKey":null,"photoAlt":""},{"title":"Stone-ground slowly","text":"So the powder stays cool and keeps its oils.","photoKey":null,"photoAlt":""}],"comparison":{"heading":"Stone-ground vs industrial","oursLabel":"Ours · stone mill","theirsLabel":"High-speed mill","rows":[{"aspect":"Heat","ours":"Slow, stays cool","theirs":"Friction heats the powder","source":""},{"aspect":"Aroma","ours":"Earthy, warm","theirs":"Mostly colour","source":""}],"note":"","imageKey":null,"imageAlt":""},"grower":{"names":"HariLeaf farm team","place":"Maharashtra","since":"","bodyMd":"","photoKey":null,"photoAlt":""},"use":{"kind":"use","heading":"How to use","steps":["A pinch in dal or sabzi","Warm milk with a spoon of haldi"]}}')
WHERE id = 2;

INSERT OR IGNORE INTO lab_reports (id, product_id, batch_code, tested_on, lab_name, lab_accreditation, test_scope, summary, visible) VALUES
 (2, 2, 'TP-2610', '2026-10-14', 'Sample Lab (dev)', 'NABL TC-0000', 'Curcumin, volatile oil, moisture', '{"Curcumin":"5.1 %","Volatile oil":"4.2 %","Moisture":"8 %"}', 1);
-- UNIQUE (product_id, batch_code) makes the insert idempotent; batches_one_active allows one active batch, so switch in two steps.
INSERT OR IGNORE INTO batches (product_id, batch_code, packed_on, ground_or_milled_on, lab_report_id, active) VALUES (2, 'TP-2610', '2026-10-12', '2026-10-10', 2, 0);
UPDATE batches SET active = 0 WHERE product_id = 2;
UPDATE batches SET active = 1 WHERE product_id = 2 AND batch_code = 'TP-2610';

UPDATE story_pages SET
  draft = json('{"seo":{"title":"Stone-Ground Turmeric Powder (Haldi), Sun-Cured | HariLeaf","description":"Turmeric boiled, sun-cured and ground slowly on stone, every batch lab-tested."},"hero":{"eyebrow":"HariLeaf turmeric","line1":"Haldi the slow way.","line2":"Boiled, sun-cured, stone-ground.","subtitle":"Certified organic turmeric from our farm.","ctaLabel":"Buy turmeric","photoKey":null,"photoAlt":"","proof":[{"productId":2,"key":"Curcumin","label":"Curcumin"}]},"productIds":[2],"storyFromProductId":2,"cardBlurbs":{},"labColumns":["Curcumin","Volatile oil","Moisture"],"facts":[{"title":"Curcumin","text":"The pigment that gives haldi its colour."}],"faq":[{"q":"Why is it less bright than store turmeric?","a":"It is ground slowly from whole cured rhizomes."}],"note":"","closing":"","hidden":[]}'),
  draft_saved_at = '2026-10-20T00:00:00.000Z'
WHERE slug = 'turmeric';
UPDATE story_pages SET published = draft, published_at = '2026-10-20T00:00:00.000Z' WHERE slug = 'turmeric';

UPDATE story_pages SET
  draft = json('{"seo":{"title":"Stone-Ground Spices | HariLeaf","description":"Turmeric and red chilli, ground slowly on stone."},"hero":{"eyebrow":"HariLeaf spices","line1":"Spices ground slowly, on stone.","line2":"","subtitle":"","ctaLabel":"","photoKey":null,"photoAlt":"","proof":[]},"productIds":[2],"storyFromProductId":2,"cardBlurbs":{},"labColumns":[],"facts":[],"faq":[],"note":"Both are ground slowly so they keep their aroma.","closing":"","hidden":[]}'),
  draft_saved_at = '2026-10-20T00:00:00.000Z'
WHERE slug = 'spices';
UPDATE story_pages SET published = draft, published_at = '2026-10-20T00:00:00.000Z' WHERE slug = 'spices';

-- Rice: a small story on the rice product, while the legacy /rice page stays unpublished (the legacy markup renders).
UPDATE products SET
  story = json('{"proofLine":[{"kind":"lab","key":"Pesticide residues","label":"Pesticide residues"},{"kind":"text","text":"Milled just once"}],"icons":[],"showCategorySwitcher":false,"originStory":null,"processSteps":[],"comparison":null,"grower":null,"use":null}')
WHERE id = 1;
UPDATE story_pages SET published = NULL, published_at = NULL WHERE slug = 'rice';
