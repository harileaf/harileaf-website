-- Story pages (spec 2026-10-20-rice-turmeric-pages-design.md).

-- Product story sections (null = no story; the product page keeps the classic bento).
ALTER TABLE products ADD COLUMN story TEXT CHECK (story IS NULL OR (json_valid(story) AND json_type(story) = 'object'));
-- Geographical Indication: the badge and the registered name only with both values (enforced in code).
ALTER TABLE products ADD COLUMN gi_name TEXT;
ALTER TABLE products ADD COLUMN gi_au_reg_number TEXT;
-- Gallery images: photos vs designed infographics.
ALTER TABLE product_images ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'infographic'));

-- Landing pages: slug validated in code (isStoryPageSlug), draft always present, published once published.
CREATE TABLE story_pages (
  slug            TEXT PRIMARY KEY,
  draft           TEXT NOT NULL CHECK (json_valid(draft) AND json_type(draft) = 'object'),
  published       TEXT CHECK (published IS NULL OR (json_valid(published) AND json_type(published) = 'object')),
  draft_saved_at  TEXT NOT NULL,
  published_at    TEXT
);

-- Seed drafts. /rice carries today's copy without GI wording or the registered name.
INSERT INTO story_pages (slug, draft, published, draft_saved_at, published_at) VALUES
('rice', json('{"seo":{"title":"Heritage Rice Online: Karjat 3, Kolam from Wada & Red Rice | HariLeaf","description":"Buy HariLeaf heritage rice, grown on our farm and milled just enough to remove the husk, so the bran and germ stay on the grain."},"hero":{"eyebrow":"HariLeaf rice","line1":"Rice with the bran","line2":"left on.","subtitle":"Three heritage varieties, transplanted by hand, cut with sickles, sun-dried and milled just once.","ctaLabel":"Choose your rice","photoKey":null,"photoAlt":"","proof":[]},"productIds":[],"storyFromProductId":null,"cardBlurbs":{},"labColumns":["Moisture","Broken grains","Pesticide residues"],"facts":[{"title":"Grown on our farm","text":"Grown and harvested by us, with the batch and packed-on date on every pack."},{"title":"Minimally processed","text":"We mill just enough to remove the husk and keep the grain whole."},{"title":"Farmer-direct","text":"Sold by the people who grow it."}],"faq":[],"note":"","closing":"Good food is grown, not manufactured.","hidden":[]}'), NULL, '2026-10-20T00:00:00.000Z', NULL),
('turmeric', json('{"seo":{"title":"","description":""},"hero":{"eyebrow":"HariLeaf turmeric","line1":"Haldi the slow way.","line2":"Boiled, sun-cured, stone-ground.","subtitle":"","ctaLabel":"Buy turmeric","photoKey":null,"photoAlt":"","proof":[]},"productIds":[],"storyFromProductId":null,"cardBlurbs":{},"labColumns":["Curcumin","Volatile oil","Moisture"],"facts":[],"faq":[],"note":"","closing":"","hidden":[]}'), NULL, '2026-10-20T00:00:00.000Z', NULL),
('spices', json('{"seo":{"title":"Stone-Ground Spices | HariLeaf","description":""},"hero":{"eyebrow":"HariLeaf spices","line1":"Spices ground slowly, on stone.","line2":"","subtitle":"","ctaLabel":"","photoKey":null,"photoAlt":"","proof":[]},"productIds":[],"storyFromProductId":null,"cardBlurbs":{},"labColumns":[],"facts":[],"faq":[],"note":"","closing":"","hidden":[]}'), NULL, '2026-10-20T00:00:00.000Z', NULL);
