import { expect, it } from 'vitest';
import { googleFeedXml, storeSitemapXml } from '../../src/lib/store/feed';
import { images, product, variant } from '../helpers/product-fixture';

it('Merchant Center feed: one item per pack, MRP as price and sale_price only when discounted, products without an image skipped, XML escaped', () => {
  const { xml, skipped } = googleFeedXml([
    {
      product: product({ name: 'Rice & "dal"' }),
      variants: [variant(), variant({ id: 12, sku: 'KJ3-1KG', label: '1 kg', unitQtyG: 1000, price: 14900, mrp: 14900, availability: 'sold_out' })],
      images,
    },
    { product: product({ id: 8, slug: 'no-photo' }), variants: [variant({ sku: 'NP-1' })], images: [] },
  ]);
  expect(xml.match(/<item>/g)).toHaveLength(2);
  expect(xml).toContain('<g:id>KJ3-5KG</g:id><g:item_group_id>product-7</g:item_group_id>');
  expect(xml).toContain('<g:price>799.00 INR</g:price><g:sale_price>699.00 INR</g:sale_price>');
  expect(xml).toContain('<link>https://harileaf.org/rice/karjat-3?v=KJ3-5KG</link>');
  expect(xml).toContain('<g:shipping><g:country>IN</g:country><g:price>0.00 INR</g:price></g:shipping>');
  expect(xml).toContain('Rice &amp; &quot;dal&quot;');
  const oneKg = xml.slice(xml.indexOf('<g:id>KJ3-1KG'));
  expect(oneKg.slice(0, oneKg.indexOf('</item>'))).not.toContain('sale_price');
  expect(oneKg).toContain('<g:availability>out_of_stock</g:availability>');
  expect(skipped).toEqual(['no-photo: no image']);
});

it('store sitemap lists product, category, shop and content URLs with lastmod', () => {
  const xml = storeSitemapXml([{ product: product(), variants: [variant()], images }], [{ path: '/our-process/' }]);
  expect(xml).toContain('<url><loc>https://harileaf.org/rice/karjat-3</loc><lastmod>2026-10-18</lastmod></url>');
  for (const loc of ['/rice/', '/shop/', '/our-process/']) expect(xml).toContain(`<loc>https://harileaf.org${loc}</loc>`);
});
