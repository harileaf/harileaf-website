import { describe, expect, it } from 'vitest';
import { activeLabSummaries, getProductPage, getProductsByIds, listProducts } from '../../src/lib/store/catalog';
import { db, insertProduct, insertVariant } from '../helpers/fixtures';

const TODAY = new Date('2026-10-18T06:30:00Z');

async function image(productId: number, key: string, sort = 0) {
  await db.prepare('INSERT INTO product_images (product_id, r2_key, alt, sort) VALUES (?, ?, ?, ?)').bind(productId, key, `alt ${key}`, sort).run();
}

describe('listProducts', () => {
  it('lists active products with an active variant, cheapest buyable pack first', async () => {
    const rice = await insertProduct({ slug: 'karjat-3', name: 'Karjat 3', process_claims: JSON.stringify([{ code: 'unpolished', text: 'Unpolished', evidence_note: 'mill' }]) });
    await insertVariant(rice, { label: '5 kg', price_paise: 69900, mrp_paise: 79900, unit_qty_g: 5000 });
    await insertVariant(rice, { label: '1 kg', price_paise: 14900, mrp_paise: 16900, unit_qty_g: 1000, stock_qty: 0 });
    await image(rice, 'products/1/b.jpg', 2);
    await image(rice, 'products/1/a.jpg', 1);

    await insertVariant(await insertProduct({ slug: 'draft-thing', status: 'draft' }));
    await insertVariant(await insertProduct({ slug: 'old-thing', status: 'discontinued' }));
    await insertProduct({ slug: 'no-variants' });
    await insertVariant(await insertProduct({ slug: 'inactive-only' }), { active: 0 });

    const cards = await listProducts(db, { categorySlug: 'rice', today: TODAY });
    const card = cards.find((c) => c.slug === 'karjat-3')!;
    expect(cards.map((c) => c.slug)).not.toEqual(expect.arrayContaining(['draft-thing', 'old-thing', 'no-variants', 'inactive-only']));
    expect(card).toMatchObject({
      path: '/rice/karjat-3',
      fromPrice: 69900, // the 1 kg pack is sold out, so the cheapest *buyable* pack leads
      fromMrp: 79900,
      fromUnitPrice: '₹139.80/kg',
      availability: 'buy',
      variantCount: 2,
      image: { key: 'products/1/a.jpg', url: '/media/products/1/a.jpg', alt: 'alt products/1/a.jpg' },
    });
    expect(card.claims[0].code).toBe('unpolished');
    // Recipe pages ask for just the products they name.
    expect((await listProducts(db, { keys: ['rice/karjat-3', 'rice/draft-thing', 'spices/karjat-3'], today: TODAY })).map((c) => c.slug)).toEqual(['karjat-3']);
    expect(await listProducts(db, { keys: [], today: TODAY })).toEqual([]);
  });

  it('treats pre-orders as notify in v1 (no pre-order checkout yet)', async () => {
    const m = await insertProduct({ slug: 'kesar', category_id: 3, perishable: 1, cod_allowed: 0, season_start_md: '04-01', season_end_md: '06-30', off_season_mode: 'preorder', preorder_dispatch_date: '2027-04-05' });
    await insertVariant(m);
    const [card] = (await listProducts(db, { categorySlug: 'produce', today: TODAY })).filter((c) => c.slug === 'kesar');
    expect(card.availability).toBe('notify');
  });

});

describe('getProductPage', () => {
  it('returns the full product with batch, lab report and related products', async () => {
    const p = await insertProduct({
      slug: 'wada-kolam',
      name: 'Wada Kolam',
      faq: JSON.stringify([{ q: 'How to cook?', a: 'Soak 20 min.' }, { q: '', a: 'ignored' }]),
      nutrition: JSON.stringify({ per: '100 g', source: 'Lab report WK-2610', rows: [{ name: 'Dietary fibre', amount: '3.2 g' }, { name: '', amount: 'x' }] }),
      attributes: JSON.stringify({ Grain: 'Fine', Empty: '' }),
    });
    const v1 = await insertVariant(p, { label: '1 kg', sort: 1 });
    await insertVariant(p, { label: '5 kg', sort: 0, active: 0 });
    const lab = await db
      .prepare("INSERT INTO lab_reports (product_id, batch_code, tested_on, lab_name, summary, pdf_r2_key) VALUES (?, 'WK-2610', '2026-10-14', 'Test Lab', '{\"pesticides\":\"not detected\"}', 'lab-reports/wk.pdf')")
      .bind(p)
      .run();
    await db
      .prepare("INSERT INTO batches (product_id, batch_code, packed_on, lab_report_id, active) VALUES (?, 'WK-2610', '2026-10-12', ?, 1)")
      .bind(p, lab.meta.last_row_id)
      .run();
    const other = await insertProduct({ slug: 'red-rice' });
    await insertVariant(other);

    const res = await getProductPage(db, 'rice', 'wada-kolam', TODAY);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.variants.map((v) => v.id)).toEqual([v1]);
    expect(res.product.faq).toEqual([{ q: 'How to cook?', a: 'Soak 20 min.' }]);
    expect(res.product.nutrition).toEqual({ per: '100 g', source: 'Lab report WK-2610', rows: [{ name: 'Dietary fibre', amount: '3.2 g' }] });
    expect(res.product.attributes).toEqual({ Grain: 'Fine' });
    expect(res.batch).toMatchObject({ batchCode: 'WK-2610', packedOn: '2026-10-12', labReport: { labName: 'Test Lab', pdfUrl: '/media/lab-reports/wk.pdf' } });
    expect(res.labReports).toHaveLength(1);
    expect(res.related.map((r) => r.slug)).toContain('red-rice');
    expect(res.related.map((r) => r.slug)).not.toContain('wada-kolam');
  });

  it('is not found for drafts, unknown slugs, wrong category or no active variants', async () => {
    const d = await insertProduct({ slug: 'secret', status: 'draft' });
    await insertVariant(d);
    expect((await getProductPage(db, 'rice', 'secret', TODAY)).kind).toBe('not_found');
    expect((await getProductPage(db, 'rice', 'nope', TODAY)).kind).toBe('not_found');
    expect((await getProductPage(db, 'spices', 'karjat-3', TODAY)).kind).toBe('not_found');
    expect((await getProductPage(db, 'rice', 'no-variants', TODAY)).kind).toBe('not_found');
  });

  it('redirects a discontinued product to its active replacement, else 410', async () => {
    const replacement = await insertProduct({ slug: 'karjat-3-new' });
    await insertVariant(replacement);
    await insertProduct({ slug: 'karjat-old', status: 'discontinued', replacement_product_id: replacement });
    await insertProduct({ slug: 'gone-for-good', status: 'discontinued' });
    expect(await getProductPage(db, 'rice', 'karjat-old', TODAY)).toEqual({ kind: 'redirect', to: '/rice/karjat-3-new' });
    expect(await getProductPage(db, 'rice', 'gone-for-good', TODAY)).toEqual({ kind: 'gone' });
  });
});


describe('story fields', () => {
  it('maps the story column and the image kind', async () => {
    const id = await insertProduct({
      category_id: 2, slug: 'turmeric-story',
      story: JSON.stringify({ icons: [{ icon: 'sun', label: 'Sun-cured' }], processSteps: [] }),
    });
    await insertVariant(id);
    await db.prepare("INSERT INTO product_images (product_id, r2_key, alt, sort, kind) VALUES (?, 'products/t/info.webp', 'Comparison: stone mill vs high-speed mill', 0, 'infographic')").bind(id).run();
    const res = await getProductPage(db, 'spices', 'turmeric-story', TODAY);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.product.story?.icons).toEqual([{ icon: 'sun', label: 'Sun-cured' }]);
    expect(res.images[0].kind).toBe('infographic');
    const [p] = await getProductsByIds(db, [id]);
    expect(p.story?.icons[0].label).toBe('Sun-cured');
  });

  it('has no story when the column is empty', async () => {
    const id = await insertProduct({ category_id: 2, slug: 'turmeric-plain' });
    const [p] = await getProductsByIds(db, [id]);
    expect(p.story).toBeNull();
  });

  it('maps GI values, and whitespace-only values to null', async () => {
    const real = await insertProduct({ slug: 'gi-real', gi_name: 'Wada Kolam', gi_au_reg_number: 'AU-123' });
    const blank = await insertProduct({ slug: 'gi-blank', gi_name: '   ', gi_au_reg_number: ' ' });
    const [a, b] = await getProductsByIds(db, [real, blank]);
    expect(a.gi).toEqual({ name: 'Wada Kolam', auRegNumber: 'AU-123' });
    expect(b.gi).toEqual({ name: null, auRegNumber: null });
  });

  it('lists as siblings only the other active products of the same category', async () => {
    const self = await insertProduct({ category_id: 2, slug: 'sib-self' });
    const otherSpice = await insertProduct({ category_id: 2, slug: 'sib-spice' });
    const rice = await insertProduct({ category_id: 1, slug: 'sib-rice' });
    for (const id of [self, otherSpice, rice]) await insertVariant(id);
    const res = await getProductPage(db, 'spices', 'sib-self', TODAY);
    if (res.kind !== 'ok') throw new Error('expected ok');
    // Products from earlier tests in this file share the database, so check membership, not the whole list.
    const ids = res.siblings.map((c) => c.id);
    expect(ids).toContain(otherSpice);
    expect(ids).not.toContain(self);
    expect(ids).not.toContain(rice);
    expect(res.siblings.every((c) => c.categorySlug === 'spices')).toBe(true);
  });
});

describe('getProductsByIds', () => {
  it('keeps the input order and returns only active products', async () => {
    const a = await insertProduct({ slug: 'ids-a' });
    const b = await insertProduct({ slug: 'ids-b' });
    const draft = await insertProduct({ slug: 'ids-draft', status: 'draft' });
    const gone = await insertProduct({ slug: 'ids-gone', status: 'discontinued' });
    const got = await getProductsByIds(db, [b, draft, 999999, gone, a]);
    expect(got.map((p) => p.id)).toEqual([b, a]);
    expect(await getProductsByIds(db, [])).toEqual([]);
  });
});

describe('activeLabSummaries', () => {
  const lab = (productId: number, code: string, summary: object, visible: number) =>
    db.prepare("INSERT INTO lab_reports (product_id, batch_code, tested_on, lab_name, test_scope, summary, visible) VALUES (?, ?, '2026-09-01', 'Lab', 'x', ?, ?)")
      .bind(productId, code, JSON.stringify(summary), visible).run();
  const batch = (productId: number, code: string, labId: number | null, active: number) =>
    db.prepare("INSERT INTO batches (product_id, batch_code, packed_on, lab_report_id, active) VALUES (?, ?, '2026-09-02', ?, ?)").bind(productId, code, labId, active).run();

  it("reads lab values only from the active batch's visible report", async () => {
    const id = await insertProduct({ category_id: 2, slug: 'turmeric-lab' });
    await lab(id, 'T-00', { Curcumin: '3.0 %' }, 1);
    const cur = await lab(id, 'T-01', { Curcumin: '5.1 %' }, 0);
    await batch(id, 'T-01', cur.meta.last_row_id, 1);
    expect((await activeLabSummaries(db, [id])).get(id)).toBeUndefined(); // the active batch's report is hidden; no fallback to T-00
    await db.prepare('UPDATE lab_reports SET visible = 1 WHERE id = ?').bind(cur.meta.last_row_id).run();
    expect((await activeLabSummaries(db, [id])).get(id)).toEqual({ Curcumin: '5.1 %' });
  });

  it('answers several products in one call; a product without an active batch is absent', async () => {
    const a = await insertProduct({ slug: 'lab-a' });
    const b = await insertProduct({ slug: 'lab-b' });
    const c = await insertProduct({ slug: 'lab-c' });
    const la = await lab(a, 'A-1', { Moisture: '10 %' }, 1);
    const lb = await lab(b, 'B-1', { Moisture: '11 %' }, 1);
    const lc = await lab(c, 'C-1', { Moisture: '12 %' }, 1);
    await batch(a, 'A-1', la.meta.last_row_id, 1);
    await batch(b, 'B-1', lb.meta.last_row_id, 1);
    await batch(c, 'C-1', lc.meta.last_row_id, 0); // not the active batch
    const got = await activeLabSummaries(db, [a, b, c]);
    expect([...got.keys()].sort()).toEqual([a, b].sort());
    expect(got.get(a)).toEqual({ Moisture: '10 %' });
    expect(got.get(b)).toEqual({ Moisture: '11 %' });
  });
});
