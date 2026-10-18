import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  activateBatch, addBatch, addImage, addLabReport, deleteImage, getProductForAdmin, listProductsForAdmin, publishChecklist, saveProduct,
  setLabReportVisible, shelfLifeWarning, type ProductInput, type VariantInput,
} from '../../src/lib/store/catalog-admin';
import { SETTING_DEFAULTS, putSettings } from '../../src/lib/store/settings';
import { beforeAll } from 'vitest';
import { db, scalar } from '../helpers/fixtures';

const LISTING_SETTINGS = {
  ...SETTING_DEFAULTS, legal_name: 'HariLeaf Agritech Pvt Ltd', address: 'Borivali, Mumbai 400092', fssai_license: '11524999000123',
  customer_care_phone: '9820966177', customer_care_email: 'care@harileaf.org',
};
beforeAll(async () => putSettings(db, LISTING_SETTINGS));

const r2 = env.HARILEAF_MEDIA;
const NOW = new Date('2026-10-18T06:00:00Z');
let n = 0;

function input(over: Partial<ProductInput> = {}): ProductInput {
  n += 1;
  return {
    categorySlug: 'rice', slug: `rice-${n}`, name: `Rice ${n}`, shortDescription: 'Hearty short-grain rice.', descriptionMd: '',
    status: 'draft', replacementProductId: null, organicScheme: 'none', organicConversionSince: null, organicCertNumber: null,
    processClaims: [{ code: 'unpolished', text: 'Unpolished', evidence_note: 'Mill setting log' }],
    howItsMade: { Milling: 'Husk removed only' }, harvestInfo: {}, attributes: { Grain: 'Short, bold' },
    faq: [{ q: 'How long to soak?', a: '20 minutes.' }], bestBeforeDays: 270, storageInstructions: 'Cool, dry, airtight',
    countryOfOrigin: 'India', ingredients: 'Rice (100%)', allergenInfo: null, vegMark: true,
    nutrition: { per: '100 g', source: null, rows: [] }, hsnCode: '1006', gstRateBp: 500, perishable: false, codAllowed: true,
    seasonStartMd: null, seasonEndMd: null, offSeasonMode: null, preorderDispatchDate: null, seoTitle: null, seoDescription: null,
    relatedProductIds: [], ...over,
  };
}

function v(over: Partial<VariantInput> = {}): VariantInput {
  n += 1;
  return {
    sku: `SKU-${n}`, label: '1 kg', netQtyLabel: '1 kg', unitQtyG: 1000, pricePaise: 14900, mrpPaise: 16900, weightG: 1050,
    lengthCm: 20, breadthCm: 15, heightCm: 5, stockAdjust: 10, lowStockThreshold: 3, active: true, sort: 0, ...over,
  };
}

const png = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'a.png', { type: 'image/png' });

describe('saveProduct', () => {
  it('creates a draft with variants and queues a cache purge', async () => {
    const before = await scalar("SELECT count(*) FROM outbox WHERE kind = 'cache.purge'");
    const res = await saveProduct(db, null, input({ slug: 'karjat-3' }), [v({ sku: 'KJ3-1KG' }), v({ sku: 'KJ3-5KG', label: '5 kg', netQtyLabel: '5 kg', unitQtyG: 5000, pricePaise: 69900, mrpPaise: 79900, weightG: 5100 })], NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const a = await getProductForAdmin(db, res.id);
    expect(a?.product.slug).toBe('karjat-3');
    expect(a?.variants.map((x) => [x.sku, x.stock_qty])).toEqual([['KJ3-1KG', 10], ['KJ3-5KG', 10]]);
    expect(a?.publishedAt).toBeNull();
    expect(await scalar("SELECT count(*) FROM outbox WHERE kind = 'cache.purge'")).toBe(before + 2); // now + 30 s later
    const payload = JSON.parse(await scalar<string>("SELECT payload FROM outbox WHERE kind = 'cache.purge' ORDER BY id DESC LIMIT 1"));
    expect(payload.urls).toContain('https://harileaf.org/rice/karjat-3');
  });

  it('rejects banned and unsupported wording anywhere a shopper can see it', async () => {
    const res = await saveProduct(db, null, input({ name: 'Organic Rice', faq: [{ q: 'Is it good for diabetics?', a: 'Yes' }], attributes: { Farming: 'Chemical-free' } }), [v()], NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.name).toMatch(/organic/);
    expect(res.errors['faq.0']).toMatch(/diabet/);
    expect(res.errors['attributes.Farming']).toMatch(/chemical-free/);
  });

  it('allows "organic" only with a scheme and certificate number', async () => {
    const without = await saveProduct(db, null, input({ name: 'Organic Rice', organicScheme: 'npop' }), [v()], NOW);
    expect(without.ok).toBe(false);
    if (!without.ok) expect(without.errors.organicCertNumber).toBeDefined();
    const withCert = await saveProduct(db, null, input({ name: 'Organic Rice', organicScheme: 'npop', organicCertNumber: 'NPOP/2026/1' }), [v()], NOW);
    expect(withCert.ok).toBe(true);
  });

  it('blocks publishing until the seller details shown on listings are filled in', async () => {
    await putSettings(db, { ...LISTING_SETTINGS, fssai_license: '', address: '' });
    const created = await saveProduct(db, null, input(), [v()], NOW);
    if (!created.ok) throw new Error('setup');
    await addImage(db, r2, created.id, png(), 'Rice grains', NOW);
    const a = await getProductForAdmin(db, created.id);
    const res = await saveProduct(db, created.id, input({ slug: a!.product.slug, status: 'active' }), [v({ id: a!.variants[0].id, sku: a!.variants[0].sku, stockAdjust: 0 })], NOW);
    await putSettings(db, LISTING_SETTINGS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.settings).toMatch(/packer address, FSSAI licence/);
  });

  it('rejects pack ids that belong to another product', async () => {
    const a = await saveProduct(db, null, input(), [v()], NOW);
    const b = await saveProduct(db, null, input(), [v()], NOW);
    if (!a.ok || !b.ok) throw new Error('setup');
    const foreign = (await getProductForAdmin(db, b.id))!.variants[0];
    const res = await saveProduct(db, a.id, input({ slug: (await getProductForAdmin(db, a.id))!.product.slug }), [v({ id: foreign.id, sku: foreign.sku, stockAdjust: 0 })], NOW);
    expect(res).toEqual({ ok: false, errors: { variants: 'A pack size no longer exists — reload the page' } });
  });

  it('queues an immediate and a delayed purge that include other live product pages', async () => {
    const res = await saveProduct(db, null, input({ slug: 'purge-check' }), [v()], NOW);
    expect(res.ok).toBe(true);
    const { results } = await db.prepare("SELECT payload, next_attempt_at FROM outbox WHERE kind = 'cache.purge' ORDER BY id DESC LIMIT 2").all<{ payload: string; next_attempt_at: string }>();
    expect(results.map((r) => r.next_attempt_at).sort()).toEqual([NOW.toISOString(), new Date(NOW.getTime() + 30_000).toISOString()]);
    expect(JSON.parse(results[0].payload).urls).toContain('https://harileaf.org/rice/purge-check');
  });

  it('enforces the publish checklist and perishable rules', async () => {
    const res = await saveProduct(db, null, input({ status: 'active', ingredients: '', bestBeforeDays: null, perishable: true, codAllowed: true }), [], NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(Object.keys(res.errors)).toEqual(expect.arrayContaining(['variants', 'images', 'ingredients', 'bestBeforeDays', 'codAllowed']));
  });

  it('adjusts stock relative to the current level and deactivates removed variants', async () => {
    const created = await saveProduct(db, null, input(), [v({ sku: 'ADJ-1' }), v({ sku: 'ADJ-2' })], NOW);
    if (!created.ok) throw new Error('setup');
    const admin = await getProductForAdmin(db, created.id);
    const [a, b] = admin!.variants;
    // Two units sell while the editor is open.
    await db.prepare('UPDATE variants SET stock_qty = stock_qty - 2 WHERE id = ?').bind(a.id).run();
    const res = await saveProduct(db, created.id, input({ slug: admin!.product.slug, name: admin!.product.name }), [v({ id: a.id, sku: 'ADJ-1', stockAdjust: 5 })], NOW);
    expect(res.ok).toBe(true);
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', a.id)).toBe(13); // 10 - 2 sold + 5 added
    expect(await scalar('SELECT active FROM variants WHERE id = ?', b.id)).toBe(0);
    const tooMuch = await saveProduct(db, created.id, input({ slug: admin!.product.slug }), [v({ id: a.id, sku: 'ADJ-1', stockAdjust: -50 })], NOW);
    expect(tooMuch).toEqual({ ok: false, errors: { variants: 'A stock adjustment would take stock below zero' } });
  });

  it('freezes the URL once published and reports duplicate SKUs/slugs', async () => {
    const created = await saveProduct(db, null, input({ slug: 'frozen-1' }), [v({ sku: 'FRZ-1' })], NOW);
    if (!created.ok) throw new Error('setup');
    await addImage(db, r2, created.id, png(), 'Rice grains', NOW);
    const variantId = (await getProductForAdmin(db, created.id))!.variants[0].id;
    const live = await saveProduct(db, created.id, input({ slug: 'frozen-1', status: 'active' }), [v({ id: variantId, sku: 'FRZ-1', stockAdjust: 0 })], NOW);
    expect(live.ok).toBe(true);
    const rename = await saveProduct(db, created.id, input({ slug: 'frozen-2', status: 'active' }), [v({ id: variantId, sku: 'FRZ-1', stockAdjust: 0 })], NOW);
    expect(rename.ok).toBe(false);
    if (!rename.ok) expect(rename.errors.slug).toMatch(/can’t change/);

    expect(await saveProduct(db, null, input({ slug: 'frozen-1' }), [v()], NOW)).toEqual({ ok: false, errors: { slug: 'Another product in this category already uses this URL' } });
    expect(await saveProduct(db, null, input(), [v({ sku: 'FRZ-1' })], NOW)).toEqual({ ok: false, errors: { variants: 'A SKU is already used by another product' } });
  });
});

describe('images, batches and lab reports', () => {
  it('stores images in R2 and protects the last photo of a live product', async () => {
    const created = await saveProduct(db, null, input(), [v()], NOW);
    if (!created.ok) throw new Error('setup');
    const img = await addImage(db, r2, created.id, png(), 'Rice grains', NOW);
    expect(img.ok).toBe(true);
    if (!img.ok) return;
    expect(await r2.head(img.key)).not.toBeNull();
    expect(await addImage(db, r2, created.id, new File(['x'], 'a.gif', { type: 'image/gif' }), 'x', NOW)).toMatchObject({ ok: false });
    expect(await addImage(db, r2, created.id, png(), '  ', NOW)).toMatchObject({ ok: false });
    expect(await addImage(db, r2, created.id, png(), 'Organic rice that boosts immunity', NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/organic.*immunity/) });

    const admin = await getProductForAdmin(db, created.id);
    await saveProduct(db, created.id, input({ slug: admin!.product.slug, status: 'active' }), [v({ id: admin!.variants[0].id, sku: admin!.variants[0].sku, stockAdjust: 0 })], NOW);
    const imageId = admin!.images[0].id;
    expect(await deleteImage(db, r2, created.id, imageId, NOW)).toEqual({ ok: false, error: 'A live product needs at least one photo' });
  });

  it('keeps exactly one active batch and links lab reports', async () => {
    const created = await saveProduct(db, null, input(), [v()], NOW);
    if (!created.ok) throw new Error('setup');
    const lab = await addLabReport(db, r2, created.id, {
      batchCode: 'B1', testedOn: '2026-10-14', labName: 'Test Lab', labAccreditation: 'NABL TC-1234', testScope: 'Pesticide residues',
      summary: { 'Pesticide residues': 'Not detected (LOD 0.01 mg/kg)' }, visible: true,
    }, new File(['%PDF-1.4'], 'r.pdf', { type: 'application/pdf' }), NOW);
    expect(lab.ok).toBe(true);
    if (!lab.ok) return;
    expect(await addBatch(db, created.id, { batchCode: 'B1', packedOn: '2026-10-12', groundOrMilledOn: '2026-10-10', labReportId: lab.id, makeActive: true }, NOW)).toEqual({ ok: true });
    expect(await addBatch(db, created.id, { batchCode: 'B2', packedOn: '2026-10-15', groundOrMilledOn: null, labReportId: null, makeActive: true }, NOW)).toEqual({ ok: true });
    expect(await addBatch(db, created.id, { batchCode: 'B2', packedOn: '2026-10-15', groundOrMilledOn: null, labReportId: null, makeActive: false }, NOW)).toMatchObject({ ok: false });
    expect(await scalar('SELECT batch_code FROM batches WHERE product_id = ? AND active = 1', created.id)).toBe('B2');
    const b1 = await scalar<number>("SELECT id FROM batches WHERE product_id = ? AND batch_code = 'B1'", created.id);
    expect(await activateBatch(db, created.id, b1, NOW)).toEqual({ ok: true });
    expect(await scalar('SELECT batch_code FROM batches WHERE product_id = ? AND active = 1', created.id)).toBe('B1');
    // A wrong batch id must not deactivate the current batch.
    expect(await activateBatch(db, created.id, 999_999, NOW)).toEqual({ ok: false, error: 'Batch not found' });
    expect(await scalar('SELECT batch_code FROM batches WHERE product_id = ? AND active = 1', created.id)).toBe('B1');
    expect(await setLabReportVisible(db, created.id, lab.id, false, NOW)).toEqual({ ok: true });
    expect(await addBatch(db, created.id, { batchCode: 'B3', packedOn: '2026-10-01', groundOrMilledOn: '2026-10-05', labReportId: null, makeActive: false }, NOW)).toMatchObject({ ok: false });
  });
});

describe('listing helpers', () => {
  it('lists products for admin with stock and batch', async () => {
    const rows = await listProductsForAdmin(db);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('stock');
  });

  it('publish checklist names what is missing', () => {
    expect(publishChecklist(input({ ingredients: '' }), [], { imageCount: 0 }).map(([k]) => k)).toEqual(['variants', 'images', 'ingredients']);
  });

  it('warns when the active batch is too old for FSSAI shelf-life-at-delivery', () => {
    expect(shelfLifeWarning('2026-10-01', 270, NOW)).toBeNull();
    expect(shelfLifeWarning('2026-02-01', 270, NOW)).toMatch(/too little shelf life/);
    expect(shelfLifeWarning(null, 270, NOW)).toBeNull();
  });
});
