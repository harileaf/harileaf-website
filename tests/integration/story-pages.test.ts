import { beforeEach, describe, expect, it } from 'vitest';
import { emptyStoryPage } from '../../src/lib/store/story';
import { listStoryPages, loadStoryPageView, publishStoryPage, saveProductStory, saveStoryPageDraft, storyLinkFor } from '../../src/lib/store/story-pages';
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
    expect(ok.warnings['proofLine.0']).toMatch(/no 'Curcumin'/);
    expect(JSON.parse(String(await scalar(`SELECT story FROM products WHERE id = ${a}`))).icons).toEqual([{ icon: 'sun', label: 'Sun-cured' }]);
    expect(await purgeCount()).toBe(before + 2);
    const urls = await lastPurgeUrls();
    for (const p of [`/spices/${await slugOf(a)}`, '/spices', '/turmeric']) expect(urls).toContain(`https://harileaf.org${p}`);
    expect((await saveProductStory(db, a, null, NOW)).ok).toBe(true);
    expect(await scalar(`SELECT story FROM products WHERE id = ${a}`)).toBeNull();
    expect(await saveProductStory(db, 999_999, null, NOW)).toEqual({ ok: false, errors: { _: 'Product not found' } });
  });

  it('is blocked, naming the page and the wording, while a published page using the product would fail its checks', async () => {
    const [a] = await turmericProducts();
    const page = { ...emptyStoryPage(), seo, hero: hero({ line1: 'Haldi', line2: 'Boosts immunity' }), productIds: [a], storyFromProductId: a };
    await db.prepare("UPDATE story_pages SET published = json(?), published_at = ? WHERE slug = 'turmeric'").bind(JSON.stringify(page), NOW.toISOString()).run();
    const before = await purgeCount();
    const res = await saveProductStory(db, a, { icons: [{ icon: 'sun', label: 'Sun-cured' }] }, NOW);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.errors._pages).toMatch(/\/turmeric would break in Hero line 2/);
    expect(!res.ok && res.errors._pages).toMatch(/immunity/);
    expect(await scalar(`SELECT story FROM products WHERE id = ${a}`)).toBeNull();
    expect(await purgeCount()).toBe(before);
    expect(await scalar("SELECT published FROM story_pages WHERE slug = 'turmeric'")).not.toBeNull();
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
});
