import { beforeEach, describe, expect, it } from 'vitest';
import { emptyStoryPage } from '../../src/lib/store/story';
import { getStoryPageRow, listStoryPages, loadStoryPageView, publishStoryPage, saveProductStory, saveStoryPageDraft, STALE_DRAFT } from '../../src/lib/store/story-pages';
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
const published = async () => scalar("SELECT published FROM story_pages WHERE slug = 'turmeric'");

beforeEach(async () => {
  await db.prepare('UPDATE story_pages SET published = NULL, published_at = NULL').run();
});

describe('landing-page drafts and publish', () => {
  it('saves a draft with unsupported wording as warnings, and refuses to publish it', async () => {
    const [a] = await turmericProducts();
    const rice = await insertProduct({ category_id: 1 });
    await insertVariant(rice);
    const draft = { ...emptyStoryPage(), seo, hero: hero({ line1: 'Haldi', line2: 'Organic and immunity-boosting' }), productIds: [a, rice], storyFromProductId: a };
    const saved = await saveStoryPageDraft(db, 'turmeric', draft, NOW);
    expect(saved.ok && saved.warnings['hero.line2']).toMatch(/organic.*immunity|immunity.*organic/);
    expect(JSON.parse(String(await scalar("SELECT draft FROM story_pages WHERE slug = 'turmeric'"))).hero.line2).toBe('Organic and immunity-boosting');
    const before = await purgeCount();
    const pub = await publishStoryPage(db, 'turmeric', NOW);
    expect(!pub.ok && pub.errors['hero.line2']).toMatch(/immunity/);
    expect(await published()).toBeNull();
    expect(await purgeCount()).toBe(before);
  });

  it('refuses to publish without a search title and description', async () => {
    const [a] = await turmericProducts();
    expect((await saveStoryPageDraft(db, 'turmeric', { ...emptyStoryPage(), hero: hero({ line1: 'Haldi the slow way.' }), productIds: [a], storyFromProductId: a }, NOW)).ok).toBe(true);
    const pub = await publishStoryPage(db, 'turmeric', NOW);
    expect(!pub.ok && pub.errors['seo.title']).toMatch(/search title/);
    expect(!pub.ok && pub.errors['seo.description']).toMatch(/search description/);
    expect(await published()).toBeNull();
  });

  it('refuses a save from a stale tab (409) and keeps the newer draft', async () => {
    const loaded = String(await scalar("SELECT draft_saved_at FROM story_pages WHERE slug = 'rice'"));
    const first = await saveStoryPageDraft(db, 'rice', { ...emptyStoryPage(), closing: 'From tab one.' }, NOW, loaded);
    expect(first.ok).toBe(true);
    const second = await saveStoryPageDraft(db, 'rice', { ...emptyStoryPage(), closing: 'From tab two.' }, new Date(NOW.getTime() + 1000), loaded);
    expect(second).toEqual({ ok: false, conflict: true, errors: { _: STALE_DRAFT } });
    expect(JSON.parse(String(await scalar("SELECT draft FROM story_pages WHERE slug = 'rice'"))).closing).toBe('From tab one.');
  });

  it('publishes the checked draft with its purges (page, hub, sitemap, linked and dropped product pages); later drafts stay unpublished', async () => {
    const [a, b] = await turmericProducts();
    const draft = { ...emptyStoryPage(), seo, hero: hero({ line1: 'Haldi the slow way.', line2: 'Certified organic, stone-ground.' }), productIds: [a, b], storyFromProductId: a };
    expect((await saveStoryPageDraft(db, 'turmeric', draft, NOW)).ok).toBe(true);
    const before = await purgeCount();
    expect(await publishStoryPage(db, 'turmeric', NOW)).toEqual({ ok: true });
    expect(await purgeCount()).toBe(before + 2);
    const urls = await lastPurgeUrls();
    for (const u of ['/turmeric', '/spices', '/sitemap-store.xml', `/spices/${await slugOf(a)}`, `/spices/${await slugOf(b)}`]) expect(urls).toContain(`https://harileaf.org${u}`);
    expect(await scalar("SELECT published_at FROM story_pages WHERE slug = 'turmeric'")).toBe(NOW.toISOString());
    expect(JSON.parse(String(await published())).hero.line2).toBe('Certified organic, stone-ground.');

    expect((await saveStoryPageDraft(db, 'turmeric', { ...draft, productIds: [a], closing: 'Ground slowly.' }, NOW)).ok).toBe(true);
    expect(JSON.parse(String(await published())).closing).toBe('');
    expect((await publishStoryPage(db, 'turmeric', NOW)).ok).toBe(true);
    expect(await lastPurgeUrls()).toContain(`https://harileaf.org/spices/${await slugOf(b)}`);
  });
});

it('the sitemap lists /turmeric/ only once it is published, with the publish date', async () => {
  const get = async () => (await sitemap({} as any)).text();
  const [a] = await turmericProducts();
  expect((await saveStoryPageDraft(db, 'turmeric', { ...emptyStoryPage(), seo, hero: hero({ line1: 'Haldi' }), productIds: [a], storyFromProductId: a }, NOW)).ok).toBe(true);
  expect(await get()).not.toContain('/turmeric/');
  expect(await publishStoryPage(db, 'turmeric', NOW)).toEqual({ ok: true });
  expect(await get()).toContain('<url><loc>https://harileaf.org/turmeric/</loc><lastmod>2026-10-20</lastmod></url>');
});

it('a product story is checked before it is written, and a valid one is saved with its purges', async () => {
  const [a] = await turmericProducts();
  const bad = await saveProductStory(db, a, {
    comparison: { heading: 'Stone vs mill', oursLabel: 'Ours', theirsLabel: 'High-speed mill', rows: [{ aspect: 'Powder', ours: 'Keeps oils', theirs: 'Fake colour', source: '' }, { aspect: 'Heat', ours: 'Cool', theirs: 'Hot', source: '' }] },
  }, NOW);
  expect(!bad.ok && bad.errors['comparison.rows.0']).toMatch(/competitor/);
  expect(await scalar(`SELECT story FROM products WHERE id = ${a}`)).toBeNull();
  expect((await saveProductStory(db, a, { icons: [{ icon: 'sun', label: 'Sun-cured' }] }, NOW)).ok).toBe(true);
  expect(JSON.parse(String(await scalar(`SELECT story FROM products WHERE id = ${a}`))).icons).toEqual([{ icon: 'sun', label: 'Sun-cured' }]);
  const urls = await lastPurgeUrls();
  for (const p of [`/spices/${await slugOf(a)}`, '/turmeric']) expect(urls).toContain(`https://harileaf.org${p}`);
});

it('drops an inactive linked product from cards, hero proof, growers, the lab table and the certification line', async () => {
  const [a, b] = await turmericProducts();
  const plain = await insertProduct({ category_id: 2, name: 'Uncertified turmeric' });
  await insertVariant(plain);
  const rep = await db
    .prepare("INSERT INTO lab_reports (product_id, batch_code, tested_on, lab_name, test_scope, summary, visible) VALUES (?, 'T-02', '2026-09-01', 'Lab', 'x', ?, 1)")
    .bind(a, JSON.stringify({ Curcumin: '4.9 %' }))
    .run();
  await db.prepare("INSERT INTO batches (product_id, batch_code, packed_on, lab_report_id, active) VALUES (?, 'T-02', '2026-09-02', ?, 1)").bind(a, rep.meta.last_row_id).run();
  expect((await saveProductStory(db, a, { grower: { names: 'Patil family', place: 'Wada' } }, NOW)).ok).toBe(true);
  const draft = { ...emptyStoryPage(), productIds: [a, b, plain], storyFromProductId: b, labColumns: ['Curcumin'], hero: hero({ line1: 'Haldi', proof: [{ productId: a, key: 'Curcumin', label: 'Curcumin' }] }) };
  expect((await saveStoryPageDraft(db, 'turmeric', draft, NOW)).ok).toBe(true);
  const live = await loadStoryPageView(db, 'turmeric', 'draft', NOW);
  expect(live?.heroProof).toEqual(['Curcumin 4.9 %']);
  expect(live?.certificationLine).toBeNull();
  await db.prepare("UPDATE products SET status = 'discontinued' WHERE id IN (?, ?)").bind(a, plain).run();
  const v = await loadStoryPageView(db, 'turmeric', 'draft', NOW);
  expect(v?.cards.map((c) => c.id)).toEqual([b]);
  expect(v?.heroProof).toEqual([]);
  expect(v?.growers).toEqual([]);
  expect(v?.labTable.rows).toEqual([]);
  expect(v?.certificationLine).toBe('Certified organic (PGS-India Organic) · Certificate PGS-1');
});

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
