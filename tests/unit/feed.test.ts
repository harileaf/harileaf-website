import { describe, expect, it } from 'vitest';
import { googleFeedXml, storeSitemapXml, xmlEscape } from '../../src/lib/store/feed';
import { images, product, variant } from '../helpers/product-fixture';

describe('googleFeedXml', () => {
  const { xml, skipped } = googleFeedXml([
    {
      product: product(),
      variants: [variant(), variant({ id: 12, sku: 'KJ3-1KG', label: '1 kg', unitQtyG: 1000, price: 14900, mrp: 14900, availability: 'sold_out' })],
      images,
    },
    { product: product({ id: 8, slug: 'no-photo' }), variants: [variant({ sku: 'NP-1' })], images: [] },
    {
      product: product({ id: 9, slug: 'alphonso', category: { id: 3, slug: 'produce', name: 'Produce', googleCategory: null }, season: { startMd: '04-01', endMd: '06-30', offSeasonMode: 'preorder', preorderDispatchDate: '2027-04-05' } }),
      variants: [variant({ sku: 'ALP-12', label: '1 dozen', availability: 'preorder' })],
      images,
    },
  ]);

  it('emits one item per variant with MRP as price and the selling price as sale price', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml.match(/<item>/g)).toHaveLength(3);
    expect(xml).toContain('<g:id>KJ3-5KG</g:id><g:item_group_id>product-7</g:item_group_id>');
    expect(xml).toContain('<g:price>799.00 INR</g:price><g:sale_price>699.00 INR</g:sale_price>');
    expect(xml).toContain('<link>https://harileaf.org/rice/karjat-3?v=KJ3-5KG</link>');
    expect(xml).toContain('<g:identifier_exists>no</g:identifier_exists>');
    expect(xml).toContain('<g:shipping><g:country>IN</g:country><g:price>0.00 INR</g:price></g:shipping>');
    expect(xml).toContain('<g:unit_pricing_measure>5000 g</g:unit_pricing_measure>');
  });

  it('omits sale_price when there is no discount and maps availability', () => {
    const oneKg = xml.slice(xml.indexOf('<g:id>KJ3-1KG'));
    expect(oneKg.slice(0, oneKg.indexOf('</item>'))).not.toContain('sale_price');
    expect(oneKg).toContain('<g:availability>out_of_stock</g:availability>');
  });

  it('adds an availability date for pre-orders', () => {
    expect(xml).toContain('<g:availability>preorder</g:availability><g:availability_date>2027-04-05T00:00:00+05:30</g:availability_date>');
  });

  it('skips products without an image (Merchant Center requires one)', () => {
    expect(skipped).toEqual(['no-photo: no image']);
    expect(xml).not.toContain('NP-1');
  });

  it('escapes XML', () => {
    expect(xmlEscape(`Rice & "dal" <b>'x'</b>\u0001`)).toBe('Rice &amp; &quot;dal&quot; &lt;b&gt;&apos;x&apos;&lt;/b&gt;');
  });
});

describe('storeSitemapXml', () => {
  it('lists product, category and shop URLs with lastmod', () => {
    const xml = storeSitemapXml([{ product: product(), variants: [variant()], images }], [{ path: '/our-process/' }]);
    expect(xml).toContain('<url><loc>https://harileaf.org/rice/karjat-3</loc><lastmod>2026-10-18</lastmod></url>');
    expect(xml).toContain('<loc>https://harileaf.org/rice/</loc>');
    expect(xml).toContain('<loc>https://harileaf.org/shop/</loc>');
    expect(xml).toContain('<loc>https://harileaf.org/our-process/</loc>');
  });
});
