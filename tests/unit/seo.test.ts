import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd, faqJsonLd, jsonLdString, productDescription, productGroupJsonLd, productTitle } from '../../src/lib/store/seo';
import { images, product, variant } from '../helpers/product-fixture';

describe('productTitle', () => {
  it('uses name, default pack and the first allowed claim', () => {
    expect(productTitle(product({ name: 'Karjat 3 Rice' }), variant(), { mayUseOrganic: false })).toBe('Karjat 3 Rice, 5 kg | Unpolished | HariLeaf');
  });
  it('drops the claim, then the pack, to stay short', () => {
    const long = product({ name: 'Karjat 3 Unpolished Hand-Harvested Heritage Rice', claims: [{ code: 'stone', text: 'Milled on a slow stone mill', evidence_note: 'x' }] });
    expect(productTitle(long, variant(), { mayUseOrganic: false })).toBe('Karjat 3 Unpolished Hand-Harvested Heritage Rice, 5 kg | HariLeaf');
  });
  it('never uses a claim that contains banned wording', () => {
    const p = product({ name: 'Turmeric', claims: [{ code: 'organic', text: 'Organic', evidence_note: 'x' }] });
    expect(productTitle(p, variant({ label: '200 g' }), { mayUseOrganic: false })).toBe('Turmeric, 200 g | HariLeaf');
  });
  it('prefers the admin-set title', () => {
    expect(productTitle(product({ seoTitle: ' Custom title ' }), variant(), { mayUseOrganic: false })).toBe('Custom title');
  });
});

describe('productDescription', () => {
  it('clips to ~155 characters at a word boundary', () => {
    const d = productDescription(product({ shortDescription: 'word '.repeat(60) }));
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d.endsWith('…')).toBe(true);
  });
});

describe('productGroupJsonLd', () => {
  const ld = productGroupJsonLd({
    product: product(),
    variants: [variant(), variant({ id: 12, sku: 'KJ3-1KG', label: '1 kg', unitQtyG: 1000, price: 14900, mrp: 14900, availability: 'sold_out' })],
    images,
  }) as any;

  it('describes a ProductGroup varying by size', () => {
    expect(ld['@type']).toBe('ProductGroup');
    expect(ld.productGroupID).toBe('product-7');
    expect(ld.variesBy).toEqual(['https://schema.org/size']);
    expect(ld.url).toBe('https://harileaf.org/rice/karjat-3');
    expect(ld.image).toEqual(['https://harileaf.org/media/products/7/a.jpg', 'https://harileaf.org/media/products/7/b.jpg']);
    expect(ld.brand).toEqual({ '@type': 'Brand', name: 'HariLeaf' });
    expect(ld).not.toHaveProperty('aggregateRating');
  });

  it('gives each pack its own offer URL, INR price, availability, free shipping and returns policy', () => {
    const [five, one] = ld.hasVariant;
    expect(five.offers).toMatchObject({
      url: 'https://harileaf.org/rice/karjat-3?v=KJ3-5KG',
      price: '699.00',
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      shippingDetails: { shippingRate: { value: 0, currency: 'INR' }, shippingDestination: { addressCountry: 'IN' } },
      hasMerchantReturnPolicy: { applicableCountry: 'IN' },
    });
    expect(five.offers.priceSpecification[1]).toEqual({ '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/StrikethroughPrice', price: '799.00', priceCurrency: 'INR' });
    expect(one.offers.availability).toBe('https://schema.org/OutOfStock');
    expect(one.offers).not.toHaveProperty('priceSpecification');
  });
});

describe('breadcrumb, FAQ and serialisation', () => {
  it('builds absolute breadcrumb URLs', () => {
    expect(breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Rice', path: '/rice/' }]).itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://harileaf.org/' },
      { '@type': 'ListItem', position: 2, name: 'Rice', item: 'https://harileaf.org/rice/' },
    ]);
  });
  it('omits FAQ data without questions', () => {
    expect(faqJsonLd([])).toBeNull();
    expect(faqJsonLd([{ q: 'Q?', a: 'A.' }])?.mainEntity).toHaveLength(1);
  });
  it('escapes "<" so content cannot close the script tag', () => {
    expect(jsonLdString({ name: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
});
