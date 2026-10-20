import { beforeEach, describe, expect, it } from 'vitest';
import { emptyStoryPage } from '../../src/lib/store/story';
import { getProductsByIds } from '../../src/lib/store/catalog';
import { getStoryPageRow, listStoryPages, loadContextProducts, loadStoryPageView, publishedPageConflicts, publishStoryPage, saveProductStory, saveStoryPageDraft, storyLinkFor } from '../../src/lib/store/story-pages';
import { GET as sitemap } from '../../src/pages/sitemap-store.xml';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const NOW = new Date('2026-10-20T06:00:00Z');
const organic = {
  category_id: 2, organic_scheme: 'pgs_organic', organic_cert_number: 'PGS-1',
  process_claims: JSON.stringify([{ code: 'traditional', text: 'Boiled the traditional way', evidence_note: 'Village records, 40 years' }]),
};
async function turmericProducts(): Promise<[number, number]> {
  const a = await insertProduct({ ...organic, name: 'Turmeric powder' });
  const b = await insertProduct({ ...organic, name: 'Turmeric fingers' });
  await insertVariant(a);
  await insertVariant(b);
  return [a, b];
}
const hero = (over: Partial<ReturnType<typeof emptyStoryPage>['hero']>) => ({ ...emptyStoryPage().hero, ...over });
const seo = { title: 'Stone-Ground Turmeric Powder (Haldi) | HariLeaf', description: 'Boiled, sun-cured, stone-ground turmeric.' };
const purgeCount = async () => Number(await scalar("SELECT count(*) FROM outbox WHERE kind = 'cache.purge'"));
const lastPurgeUrls = async (): Promise<string[]> =>
  JSON.parse(String(await scalar("SELECT payload FROM outbox WHERE kind = 'cache.purge' ORDER BY id DESC LIMIT 1"))).urls;
const slugOf = (id: number) => scalar<string>('SELECT slug FROM products WHERE id = ?', id);

beforeEach(async () => {
  await db.prepare('UPDATE story_pages SET published = NULL, published_at = NULL').run();
});

describe('landing-page drafts and publish', () => {
  it('saves a draft with unsupported wording as warnings, and refuses to publish it', async () => {
    const [a] = await turmericProducts();
    const rice = await insertProduct({ category_id: 1 });
    await insertVariant(rice);
    const draft = { ...emptyStoryPage(), seo: { title: 'Turmeric', description: 'Stone-ground turmeric.' }, hero: hero({ line1: 'Haldi', line2: 'Organic and immunity-boosting' }), productIds: [a, rice], storyFromProductId: a };
    const saved = await saveStoryPageDraft(db, 'turmeric', draft, NOW);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.warnings['hero.line2']).toMatch(/organic/);
    expect(saved.warnings['hero.line2']).toMatch(/immunity/);
    expect(JSON.parse(String(await scalar("SELECT draft FROM story_pages WHERE slug = 'turmeric'"))).hero.line2).toBe('Organic and immunity-boosting');
    const before = await purgeCount();
    const pub = await publishStoryPage(db, 'turmeric', NOW);
    expect(pub.ok).toBe(false);
    expect(!pub.ok && pub.errors['hero.line2']).toMatch(/immunity/);
    expect(await scalar("SELECT published FROM story_pages WHERE slug = 'turmeric'")).toBeNull();
    expect(await purgeCount()).toBe(before);
  });

  it('rejects a draft for an unknown page and a structurally invalid draft', async () => {
    expect(await saveStoryPageDraft(db, 'produce', emptyStoryPage(), NOW)).toEqual({ ok: false, errors: { _: 'Page not found' } });
    expect(await publishStoryPage(db, 'produce', NOW)).toEqual({ ok: false, errors: { _: 'Page not found' } });
    const savedAt = await scalar("SELECT draft_saved_at FROM story_pages WHERE slug = 'turmeric'");
    const bad = await saveStoryPageDraft(db, 'turmeric', { ...emptyStoryPage(), seo: { title: 'x'.repeat(80), description: '' } }, NOW);
    expect(!bad.ok && bad.errors['seo.title']).toMatch(/70/);
    expect(await scalar("SELECT draft_saved_at FROM story_pages WHERE slug = 'turmeric'")).toBe(savedAt);
  });

  it('reports a missing seeded row instead of pretending to save', async () => {
    const row = await db.prepare("SELECT * FROM story_pages WHERE slug = 'rice'").first<Record<string, unknown>>();
    await db.prepare("DELETE FROM story_pages WHERE slug = 'rice'").run();
    try {
      expect(await saveStoryPageDraft(db, 'rice', emptyStoryPage(), NOW)).toEqual({ ok: false, errors: { _: 'This page is missing. Run the latest migration.' } });
      expect(await publishStoryPage(db, 'rice', NOW)).toEqual({ ok: false, errors: { _: 'Page not found' } });
    } finally {
      const cols = Object.keys(row!);
      await db.prepare(`INSERT INTO story_pages (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...Object.values(row!)).run();
    }
  });

  it('refuses to publish without a search title and description (the live page would have an empty <title>)', async () => {
    const [a] = await turmericProducts();
    const draft = { ...emptyStoryPage(), hero: hero({ line1: 'Haldi the slow way.' }), productIds: [a], storyFromProductId: a };
    const saved = await saveStoryPageDraft(db, 'turmeric', draft, NOW);
    expect(saved.ok && saved.warnings['seo.title']).toBeTruthy();
    const pub = await publishStoryPage(db, 'turmeric', NOW);
    expect(pub.ok).toBe(false);
    expect(!pub.ok && pub.errors['seo.title']).toMatch(/search title/);
    expect(!pub.ok && pub.errors['seo.description']).toMatch(/search description/);
    expect(await scalar("SELECT published FROM story_pages WHERE slug = 'turmeric'")).toBeNull();
  });

  it('publishes a valid draft and purges the page, the hub, the sitemap and the linked product pages', async () => {
    const [a, b] = await turmericProducts();
    const draft = {
      ...emptyStoryPage(), seo,
      hero: hero({ line1: 'Haldi the slow way.', line2: 'Certified organic, stone-ground.' }), productIds: [a, b], storyFromProductId: a, labColumns: ['Curcumin'],
    };
    expect((await saveStoryPageDraft(db, 'turmeric', draft, NOW)).ok).toBe(true);
    const before = await purgeCount();
    expect(await publishStoryPage(db, 'turmeric', NOW)).toEqual({ ok: true });
    expect(await purgeCount()).toBe(before + 2);
    const urls = await lastPurgeUrls();
    for (const u of ['https://harileaf.org/turmeric', 'https://harileaf.org/spices', 'https://harileaf.org/sitemap-store.xml']) expect(urls).toContain(u);
    for (const id of [a, b]) expect(urls).toContain(`https://harileaf.org/spices/${await slugOf(id)}`);
    expect(await scalar("SELECT published_at FROM story_pages WHERE slug = 'turmeric'")).toBe(NOW.toISOString());
    expect(JSON.parse(String(await scalar("SELECT published FROM story_pages WHERE slug = 'turmeric'"))).hero.line2).toBe('Certified organic, stone-ground.');
    expect((await listStoryPages(db)).find((p) => p.slug === 'turmeric')?.status).toBe('published');
    expect(await storyLinkFor(db, a)).toEqual({ path: '/turmeric/', label: 'The turmeric story →' });

    // A later draft leaves the live page alone and shows as unpublished changes.
    expect((await saveStoryPageDraft(db, 'turmeric', { ...draft, closing: 'Ground fresh.' }, NOW)).ok).toBe(true);
    expect(JSON.parse(String(await scalar("SELECT published FROM story_pages WHERE slug = 'turmeric'"))).closing).toBe('');
    expect((await listStoryPages(db)).find((p) => p.slug === 'turmeric')?.status).toBe('changed');
  });

  it('on republish also purges a product page that was dropped from the page (its story link goes away)', async () => {
    const [a, b] = await turmericProducts();
    const draft = { ...emptyStoryPage(), seo, hero: hero({ line1: 'Haldi' }), productIds: [a, b], storyFromProductId: a };
    expect((await saveStoryPageDraft(db, 'turmeric', draft, NOW)).ok).toBe(true);
    expect((await publishStoryPage(db, 'turmeric', NOW)).ok).toBe(true);
    expect((await saveStoryPageDraft(db, 'turmeric', { ...draft, productIds: [a] }, NOW)).ok).toBe(true);
    expect((await publishStoryPage(db, 'turmeric', NOW)).ok).toBe(true);
    expect(await lastPurgeUrls()).toContain(`https://harileaf.org/spices/${await slugOf(b)}`);
    expect(await storyLinkFor(db, b)).toBeNull();
  });
});

describe('sitemap', () => {
  it('lists /turmeric only once it is published, with the publish date; /rice and /spices always', async () => {
    const get = async () => (await sitemap({} as any)).text();
    let xml = await get();
    expect(xml).not.toContain('/turmeric/');
    for (const p of ['/rice/', '/spices/']) expect(xml).toContain(`<loc>https://harileaf.org${p}</loc>`);
    const [a, b] = await turmericProducts();
    const draft = { ...emptyStoryPage(), seo, hero: hero({ line1: 'Haldi the slow way.', line2: 'Certified organic, stone-ground.' }), productIds: [a, b], storyFromProductId: a, labColumns: ['Curcumin'] };
    expect((await saveStoryPageDraft(db, 'turmeric', draft, NOW)).ok).toBe(true);
    expect(await get()).not.toContain('/turmeric/');
    expect(await publishStoryPage(db, 'turmeric', NOW)).toEqual({ ok: true });
    xml = await get();
    expect(xml).toContain('<url><loc>https://harileaf.org/turmeric/</loc><lastmod>2026-10-20</lastmod></url>');
  });
});

describe('product story', () => {
  it('saves after claims checks, warns about missing lab values, and can be removed', async () => {
    const [a] = await turmericProducts();
    const bad = await saveProductStory(db, a, {
      comparison: { heading: 'Stone vs mill', oursLabel: 'Ours', theirsLabel: 'High-speed mill', rows: [{ aspect: 'Powder', ours: 'Keeps oils', theirs: 'Fake colour', source: '' }, { aspect: 'Heat', ours: 'Cool', theirs: 'Hot', source: '' }] },
    }, NOW);
    expect(!bad.ok && bad.errors['comparison.rows.0']).toMatch(/competitor/);
    expect(await scalar(`SELECT story FROM products WHERE id = ${a}`)).toBeNull();
    const before = await purgeCount();
    const ok = await saveProductStory(db, a, { proofLine: [{ kind: 'lab', key: 'Curcumin', label: 'Curcumin' }], icons: [{ icon: 'sun', label: 'Sun-cured' }] }, NOW);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.warnings['proofLine.0']).toBe("There's no active batch with a lab report yet, so lab items are hidden on the page");
    expect(JSON.parse(String(await scalar(`SELECT story FROM products WHERE id = ${a}`))).icons).toEqual([{ icon: 'sun', label: 'Sun-cured' }]);
    expect(await purgeCount()).toBe(before + 2);
    const urls = await lastPurgeUrls();
    for (const p of [`/spices/${await slugOf(a)}`, '/spices', '/turmeric']) expect(urls).toContain(`https://harileaf.org${p}`);

    const rep = await db
      .prepare("INSERT INTO lab_reports (product_id, batch_code, tested_on, lab_name, test_scope, summary, visible) VALUES (?, 'T-09', '2026-09-01', 'Lab', 'x', ?, 1)")
      .bind(a, JSON.stringify({ Moisture: '8 %' }))
      .run();
    await db.prepare("INSERT INTO batches (product_id, batch_code, packed_on, lab_report_id, active) VALUES (?, 'T-09', '2026-09-02', ?, 1)").bind(a, rep.meta.last_row_id).run();
    const withBatch = await saveProductStory(db, a, { proofLine: [{ kind: 'lab', key: 'Curcumin', label: 'Curcumin' }, { kind: 'lab', key: 'moisture', label: 'Moisture' }] }, NOW);
    expect(withBatch.ok && withBatch.warnings).toEqual({ 'proofLine.0': "The active batch's lab report has no 'Curcumin', so this item is hidden on the page" });

    expect((await saveProductStory(db, a, null, NOW)).ok).toBe(true);
    expect(await scalar(`SELECT story FROM products WHERE id = ${a}`)).toBeNull();
    expect(await saveProductStory(db, 999_999, null, NOW)).toEqual({ ok: false, errors: { _: 'Product not found' } });
  });

  it('saves despite a problem the published page already had, and returns it as a warning', async () => {
    const [a] = await turmericProducts();
    const page = { ...emptyStoryPage(), seo, hero: hero({ line1: 'Haldi', line2: 'Boosts immunity' }), productIds: [a], storyFromProductId: a };
    await db.prepare("UPDATE story_pages SET published = json(?), published_at = ? WHERE slug = 'turmeric'").bind(JSON.stringify(page), NOW.toISOString()).run();
    const res = await saveProductStory(db, a, { icons: [{ icon: 'sun', label: 'Sun-cured' }] }, NOW);
    expect(res).toEqual({ ok: true, warnings: { _pages: "/turmeric already uses 'immunity' in Hero line 2; edit and republish the page to fix it." } });
    expect(JSON.parse(String(await scalar(`SELECT story FROM products WHERE id = ${a}`))).icons).toHaveLength(1);
    expect(await scalar("SELECT published FROM story_pages WHERE slug = 'turmeric'")).not.toBeNull();
  });
});

describe('published-page re-check', () => {
  it('blocks only the problems a change introduces, naming the page, the wording and the field', async () => {
    const [a, b] = await turmericProducts();
    const page = {
      ...emptyStoryPage(), seo, productIds: [a, b], storyFromProductId: a, cardBlurbs: { [b]: 'Whole organic fingers' },
      hero: hero({ line1: 'Haldi', line2: 'Certified organic, stone-ground.', subtitle: 'Good for immunity' }),
    };
    await db.prepare("UPDATE story_pages SET published = json(?), published_at = ? WHERE slug = 'turmeric'").bind(JSON.stringify(page), NOW.toISOString()).run();
    const [saved] = await loadContextProducts(db, [b]);
    const unchanged = await publishedPageConflicts(db, saved);
    expect(unchanged).toEqual({ blocking: [], warnings: ["/turmeric already uses 'immunity' in Hero subtitle; edit and republish the page to fix it."] });

    const lapsed = await publishedPageConflicts(db, { ...saved, organic: { scheme: 'none', conversionSince: null, certNumber: null } });
    expect(lapsed.blocking).toEqual([
      "/turmeric uses 'organic' and 'certified organic' in Hero line 2; edit and republish the page first.",
      "/turmeric uses 'organic' in Card blurb (Turmeric fingers); edit and republish the page first.",
    ]);
    expect(lapsed.warnings).toEqual(unchanged.warnings);
    for (const m of lapsed.blocking) expect(m).not.toMatch(/would break|: .*:/);

    // A page that doesn't link the product is not checked.
    const other = await insertProduct({ category_id: 2 });
    const [o] = await loadContextProducts(db, [other]);
    expect(await publishedPageConflicts(db, { ...o, organic: { scheme: 'none', conversionSince: null, certNumber: null } })).toEqual({ blocking: [], warnings: [] });
  });
});

describe('view model', () => {
  it('builds cards in order, hero proof from the active batch, the lab table and the shared certification line', async () => {
    const [a, b] = await turmericProducts();
    const rep = await db
      .prepare("INSERT INTO lab_reports (product_id, batch_code, tested_on, lab_name, test_scope, summary, visible) VALUES (?, 'T-01', '2026-09-01', 'Lab', 'x', ?, 1)")
      .bind(a, JSON.stringify({ Curcumin: '5.1 %', Moisture: '8 %' }))
      .run();
    await db.prepare("INSERT INTO batches (product_id, batch_code, packed_on, lab_report_id, active) VALUES (?, 'T-01', '2026-09-02', ?, 1)").bind(a, rep.meta.last_row_id).run();
    expect((await saveProductStory(db, a, { grower: { names: 'Patil family', place: 'Wada, Palghar' } }, NOW)).ok).toBe(true);
    const draft = { ...emptyStoryPage(), productIds: [b, a], storyFromProductId: a, labColumns: ['Curcumin', 'Moisture'], hero: hero({ line1: 'Haldi', proof: [{ productId: a, key: 'Curcumin', label: 'Curcumin' }] }) };
    expect((await saveStoryPageDraft(db, 'turmeric', draft, NOW)).ok).toBe(true);
    const v = await loadStoryPageView(db, 'turmeric', 'draft', NOW);
    expect(v?.cards.map((c) => c.id)).toEqual([b, a]);
    expect(v?.heroProof).toEqual(['Curcumin 5.1 %']);
    expect(v?.labTable.columns).toEqual(['Curcumin', 'Moisture']);
    expect(v?.labTable.rows[0]).toMatchObject({ batchCode: 'T-01', values: ['5.1 %', '8 %'], productName: 'Turmeric powder' });
    expect(v?.certificationLine).toBe('Certified organic (PGS-India Organic) · Certificate PGS-1');
    expect(v?.certifications[String(a)]?.line).toBe(v?.certificationLine);
    expect(v?.growers.map((g) => g.names)).toEqual(['Patil family']);
    expect(v?.storyFrom?.product.id).toBe(a);
    expect(v?.turmericPublished).toBe(false);
    expect(await loadStoryPageView(db, 'turmeric', 'published', NOW)).toBeNull();
    expect(await loadStoryPageView(db, 'produce', 'draft', NOW)).toBeNull();
  });

  it('drops an inactive linked product from cards, hero proof, growers and the certification line', async () => {
    const [a, b] = await turmericProducts();
    const plain = await insertProduct({ category_id: 2, name: 'Uncertified turmeric' });
    await insertVariant(plain);
    const rep = await db
      .prepare("INSERT INTO lab_reports (product_id, batch_code, tested_on, lab_name, test_scope, summary, visible) VALUES (?, 'T-02', '2026-09-01', 'Lab', 'x', ?, 1)")
      .bind(a, JSON.stringify({ Curcumin: '4.9 %' }))
      .run();
    await db.prepare("INSERT INTO batches (product_id, batch_code, packed_on, lab_report_id, active) VALUES (?, 'T-02', '2026-09-02', ?, 1)").bind(a, rep.meta.last_row_id).run();
    expect((await saveProductStory(db, a, { grower: { names: 'Patil family', place: 'Wada' } }, NOW)).ok).toBe(true);
    const draft = { ...emptyStoryPage(), productIds: [a, b, plain], storyFromProductId: b, hero: hero({ line1: 'Haldi', proof: [{ productId: a, key: 'Curcumin', label: 'Curcumin' }] }) };
    expect((await saveStoryPageDraft(db, 'turmeric', draft, NOW)).ok).toBe(true);
    expect((await loadStoryPageView(db, 'turmeric', 'draft', NOW))?.certificationLine).toBeNull();
    await db.prepare("UPDATE products SET status = 'discontinued' WHERE id IN (?, ?)").bind(a, plain).run();
    const v = await loadStoryPageView(db, 'turmeric', 'draft', NOW);
    expect(v?.cards.map((c) => c.id)).toEqual([b]);
    expect(v?.heroProof).toEqual([]);
    expect(v?.growers).toEqual([]);
    expect(v?.labTable.rows).toEqual([]);
    expect(v?.certificationLine).toBe('Certified organic (PGS-India Organic) · Certificate PGS-1');
  });

  it('tells the other pages whether /turmeric is live', async () => {
    const [a] = await turmericProducts();
    expect((await loadStoryPageView(db, 'spices', 'draft', NOW))?.turmericPublished).toBe(false);
    expect((await saveStoryPageDraft(db, 'turmeric', { ...emptyStoryPage(), seo, hero: hero({ line1: 'Haldi' }), productIds: [a], storyFromProductId: a }, NOW)).ok).toBe(true);
    expect((await publishStoryPage(db, 'turmeric', NOW)).ok).toBe(true);
    expect((await loadStoryPageView(db, 'spices', 'draft', NOW))?.turmericPublished).toBe(true);
    expect((await loadStoryPageView(db, 'rice', 'draft', NOW))?.turmericPublished).toBe(true);
    expect((await loadStoryPageView(db, 'turmeric', 'published', NOW))?.turmericPublished).toBe(true);
  });
});

describe('robustness', () => {
  it('treats unreadable published JSON as unpublished', async () => {
    await db.prepare("UPDATE story_pages SET published = '{}', published_at = ? WHERE slug = 'turmeric'").bind(NOW.toISOString()).run();
    await db.exec('PRAGMA ignore_check_constraints = ON');
    try {
      await db.prepare("UPDATE story_pages SET published = '{\"seo\":' WHERE slug = 'turmeric'").run();
    } finally {
      await db.exec('PRAGMA ignore_check_constraints = OFF');
    }
    const row = await getStoryPageRow(db, 'turmeric');
    expect(row?.published).toBeNull();
    expect(row?.publishedAt).toBeNull();
    expect(await loadStoryPageView(db, 'turmeric', 'published', NOW)).toBeNull();
    expect((await listStoryPages(db)).find((p) => p.slug === 'turmeric')?.status).toBe('never');
  });

  it('ignores malformed process_claims entries instead of throwing', async () => {
    const claims = JSON.stringify([1, null, 'traditional', { code: 'traditional' }, { code: 'natural', text: 5, evidence_note: 'x' }, { code: 'pure', text: 'Pure', evidence_note: 'Lab' }]);
    const id = await insertProduct({ category_id: 2, process_claims: claims });
    await insertVariant(id);
    const [ctx] = await loadContextProducts(db, [id]);
    expect(ctx.claims).toEqual([{ code: 'pure', text: 'Pure', evidence_note: 'Lab' }]);
    const [p] = await getProductsByIds(db, [id]);
    expect(p.claims).toEqual([{ code: 'pure', text: 'Pure', evidence_note: 'Lab' }]);
    expect((await saveStoryPageDraft(db, 'turmeric', { ...emptyStoryPage(), productIds: [id], storyFromProductId: id, hero: hero({ line1: 'Pure haldi' }) }, NOW)).ok).toBe(true);
  });
});
