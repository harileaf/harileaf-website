import { describe, expect, it } from 'vitest';
import { jsonLdString, productGroupJsonLd, productTitle, recipeJsonLd } from '../../src/lib/store/seo';
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

  it('marks up ratings only from approved reviews shown on the page', () => {
    const reviews = {
      summary: { count: 2, average: 3, distribution: [1, 0, 0, 0, 1] as [number, number, number, number, number] },
      items: [
        { id: 1, rating: 5, title: 'Lovely', body: 'Cooks evenly.', displayName: 'Asha, Mumbai', publishedAt: '2026-11-02T06:00:00.000Z' },
        { id: 2, rating: 1, title: 'Too broken', body: 'Many broken grains.', displayName: 'Ravi, Pune', publishedAt: '2026-11-01T06:00:00.000Z' },
      ],
    };
    const ld = productGroupJsonLd({ product: product(), variants: [variant()], images, reviews }) as any;
    expect(ld.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 3, reviewCount: 2, bestRating: 5, worstRating: 1 });
    expect(ld.review[1]).toEqual({
      '@type': 'Review', name: 'Too broken', reviewBody: 'Many broken grains.', datePublished: '2026-11-01',
      author: { '@type': 'Person', name: 'Ravi, Pune' }, reviewRating: { '@type': 'Rating', ratingValue: 1, bestRating: 5, worstRating: 1 },
    });
    const none = productGroupJsonLd({ product: product(), variants: [variant()], images, reviews: { summary: null, items: [] } }) as any;
    expect(none).not.toHaveProperty('aggregateRating');
    expect(none).not.toHaveProperty('review');
  });

  it('perishables: returns not permitted, and no all-India shipping claim (their zone is set in Merchant Center)', () => {
    const ld = productGroupJsonLd({ product: product({ perishable: true, deliveryZoneId: 'mmr' }), variants: [variant()], images }) as any;
    expect(ld.hasVariant[0].offers.hasMerchantReturnPolicy.returnPolicyCategory).toBe('https://schema.org/MerchantReturnNotPermitted');
    expect(ld.hasVariant[0].offers).not.toHaveProperty('shippingDetails');
  });

  it('pre-orders are PreOrder with availabilityStarts', () => {
    const p = product({ season: { startMd: '04-01', endMd: '06-30', offSeasonMode: 'preorder', preorderDispatchDate: '2027-04-10' } });
    const ld = productGroupJsonLd({ product: p, variants: [variant({ availability: 'preorder' })], images }) as any;
    expect(ld.hasVariant[0].offers).toMatchObject({ availability: 'https://schema.org/PreOrder', availabilityStarts: '2027-04-10', price: '699.00' });
  });

  it('Recipe JSON-LD: three image ratios, ISO 8601 times, HowToSteps, HariLeaf as author', () => {
    const ld = recipeJsonLd(
      { slug: 'haldi-doodh', title: 'Haldi doodh', summary: 'Warm turmeric milk.', published: '2026-10-18', updated: '2026-11-02', category: 'Drink', prepMinutes: 2, cookMinutes: 5, serves: 1, ingredients: ['1 cup milk'], steps: ['Warm the milk.', 'Serve.'] },
      ['/_astro/a-16x9.jpg', '/_astro/a-4x3.jpg', '/_astro/a-1x1.jpg'],
    ) as any;
    expect(ld).toMatchObject({
      '@type': 'Recipe', name: 'Haldi doodh', url: 'https://harileaf.org/recipes/haldi-doodh/', datePublished: '2026-10-18', dateModified: '2026-11-02',
      image: ['https://harileaf.org/_astro/a-16x9.jpg', 'https://harileaf.org/_astro/a-4x3.jpg', 'https://harileaf.org/_astro/a-1x1.jpg'],
      author: { '@type': 'Organization', name: 'HariLeaf', url: 'https://harileaf.org/' },
      prepTime: 'PT2M', cookTime: 'PT5M', totalTime: 'PT7M', recipeYield: ['1', '1 serving'], recipeIngredient: ['1 cup milk'],
      recipeInstructions: [{ '@type': 'HowToStep', position: 1, text: 'Warm the milk.' }, { '@type': 'HowToStep', position: 2, text: 'Serve.' }],
    });
  });

  it('escapes "<" so content cannot close the JSON-LD script tag', () => {
    expect(jsonLdString({ name: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
});
