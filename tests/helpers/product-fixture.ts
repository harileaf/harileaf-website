import type { Image, Product, Variant } from '../../src/lib/store/catalog';

export function product(over: Partial<Product> = {}): Product {
  return {
    id: 7,
    slug: 'karjat-3',
    category: { id: 1, slug: 'rice', name: 'Rice', googleCategory: 'Food, Beverages & Tobacco > Food Items > Grains, Rice & Cereal > Rice' },
    path: '/rice/karjat-3',
    name: 'Karjat 3 Unpolished Rice',
    shortDescription: 'Hearty short-grain rice milled just enough to remove the husk, so the bran and germ stay on the grain.',
    descriptionMd: '',
    status: 'active',
    organic: { scheme: 'none', conversionSince: null, certNumber: null, certUrl: null },
    claims: [{ code: 'unpolished', text: 'Unpolished', evidence_note: 'Mill setting log' }],
    howItsMade: {},
    harvestInfo: {},
    attributes: {},
    faq: [],
    listing: { bestBeforeDays: 270, storage: 'Cool, dry place', countryOfOrigin: 'India', ingredients: 'Rice (100%)', allergens: null, veg: true },
    nutrition: { per: '100 g', source: null, rows: [] },
    hsnCode: '1006',
    gstRateBp: 500,
    perishable: false,
    codAllowed: true,
    season: { startMd: null, endMd: null, offSeasonMode: null, preorderDispatchDate: null },
    seoTitle: null,
    seoDescription: null,
    relatedIds: [],
    updatedAt: '2026-10-18T06:00:00.000Z',
    ...over,
  };
}

export function variant(over: Partial<Variant> = {}): Variant {
  return {
    id: 11,
    sku: 'KJ3-5KG',
    label: '5 kg',
    netQtyLabel: '5 kg',
    unitQtyG: 5000,
    price: 69900,
    mrp: 79900,
    unitPricePerKg: 13980,
    stockQty: 20,
    availability: 'buy',
    ...over,
  };
}

export const images: Image[] = [
  { key: 'products/7/a.jpg', url: '/media/products/7/a.jpg', alt: 'Karjat 3 rice grains' },
  { key: 'products/7/b.jpg', url: '/media/products/7/b.jpg', alt: 'Paddy field' },
];
