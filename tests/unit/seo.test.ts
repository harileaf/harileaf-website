import { describe, expect, it } from 'vitest';
import { jsonLdString, productGroupJsonLd, productTitle } from '../../src/lib/store/seo';
import { images, product, variant } from '../helpers/product-fixture';

describe('seo', () => {
  it('titles use name, pack and the first allowed claim, dropping parts to stay short and never a banned claim', () => {
    expect(productTitle(product({ name: 'Karjat 3 Rice' }), variant(), { mayUseOrganic: false })).toBe('Karjat 3 Rice, 5 kg | Unpolished | HariLeaf');
    const long = product({ name: 'Karjat 3 Unpolished Hand-Harvested Heritage Rice', claims: [{ code: 'stone', text: 'Milled on a slow stone mill', evidence_note: 'x' }] });
    expect(productTitle(long, variant(), { mayUseOrganic: false })).toBe('Karjat 3 Unpolished Hand-Harvested Heritage Rice, 5 kg | HariLeaf');
    const banned = product({ name: 'Turmeric', claims: [{ code: 'organic', text: 'Organic', evidence_note: 'x' }] });
    expect(productTitle(banned, variant({ label: '200 g' }), { mayUseOrganic: false })).toBe('Turmeric, 200 g | HariLeaf');
  });

  it('ProductGroup JSON-LD gives each pack its own URL, INR price, MRP strikethrough, availability, shipping and returns', () => {
    const ld = productGroupJsonLd({
      product: product(),
      variants: [variant(), variant({ id: 12, sku: 'KJ3-1KG', label: '1 kg', unitQtyG: 1000, price: 14900, mrp: 14900, availability: 'sold_out' })],
      images,
    }) as any;
    expect(ld).toMatchObject({ '@type': 'ProductGroup', productGroupID: 'product-7', variesBy: ['https://schema.org/size'], url: 'https://harileaf.org/rice/karjat-3' });
    expect(ld).not.toHaveProperty('aggregateRating');
    const [five, one] = ld.hasVariant;
    expect(five.offers).toMatchObject({
      url: 'https://harileaf.org/rice/karjat-3?v=KJ3-5KG', price: '699.00', priceCurrency: 'INR', availability: 'https://schema.org/InStock',
      shippingDetails: { shippingRate: { value: 0, currency: 'INR' }, shippingDestination: { addressCountry: 'IN' } },
      hasMerchantReturnPolicy: { applicableCountry: 'IN' },
    });
    expect(five.offers.priceSpecification[1]).toEqual({ '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/StrikethroughPrice', price: '799.00', priceCurrency: 'INR' });
    expect(one.offers.availability).toBe('https://schema.org/OutOfStock');
    expect(one.offers).not.toHaveProperty('priceSpecification');
  });

  it('escapes "<" so content cannot close the JSON-LD script tag', () => {
    expect(jsonLdString({ name: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
});
