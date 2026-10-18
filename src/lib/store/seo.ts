/**
 * SEO builders for store pages: titles/meta and Schema.org JSON-LD.
 *
 * JSON-LD follows Google's merchant-listing guidance: one ProductGroup per
 * product page (variesBy size), a Product + Offer per pack with its own `?v=`
 * URL, free shipping within India, and the returns policy. Ratings are only
 * added when approved reviews exist (none in v1), so there is no
 * `aggregateRating` here yet.
 */
import type { Availability } from './availability';
import type { Faq, Image, Product, Variant } from './catalog';
import { findBannedPhrases } from './claims';
import { absolute, productPath, variantPath } from './urls';

export const BRAND = 'HariLeaf';
const TITLE_MAX = 65;
const DESC_MAX = 155;

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,.;:–-]+$/, '')}…`;
};

/** "Karjat 3 Unpolished Rice, 5 kg | Stone ground | HariLeaf" — falls back to shorter forms to fit. */
export function productTitle(p: Product, defaultVariant: Variant | null, opts: { mayUseOrganic: boolean }): string {
  if (p.seoTitle?.trim()) return p.seoTitle.trim();
  const claim = p.claims.find((c) => c.text.trim() && findBannedPhrases(c.text, { organicScheme: p.organic.scheme, claims: p.claims, mayUseOrganic: opts.mayUseOrganic }).length === 0);
  const head = defaultVariant ? `${p.name}, ${defaultVariant.label}` : p.name;
  const candidates = [
    claim ? `${head} | ${claim.text} | ${BRAND}` : null,
    `${head} | ${BRAND}`,
    `${p.name} | ${BRAND}`,
  ].filter((c): c is string => Boolean(c));
  return candidates.find((c) => c.length <= TITLE_MAX) ?? clip(candidates[candidates.length - 1], TITLE_MAX);
}

export function productDescription(p: Product): string {
  return clip(p.seoDescription?.trim() || p.shortDescription || `${p.name} from HariLeaf.`, DESC_MAX);
}

const SCHEMA_AVAILABILITY: Record<Availability, string> = {
  buy: 'https://schema.org/InStock',
  preorder: 'https://schema.org/PreOrder',
  sold_out: 'https://schema.org/OutOfStock',
  notify: 'https://schema.org/OutOfStock',
};

const rupees = (paise: number) => (paise / 100).toFixed(2);

export function shippingDetails() {
  return {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'INR' },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 2, unitCode: 'DAY' },
      transitTime: { '@type': 'QuantitativeValue', minValue: 3, maxValue: 7, unitCode: 'DAY' },
    },
  };
}

/**
 * Food packs aren't returnable except when damaged or wrong (refund policy),
 * which Google models as "returns not permitted".
 */
export function returnPolicy() {
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'IN',
    returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
  };
}

export function productGroupJsonLd(input: { product: Product; variants: Variant[]; images: Image[] }): Record<string, unknown> {
  const { product: p, variants, images } = input;
  const imageUrls = images.map((i) => absolute(i.url));
  return {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    name: p.name,
    description: productDescription(p),
    url: absolute(productPath(p.category.slug, p.slug)),
    brand: { '@type': 'Brand', name: BRAND },
    productGroupID: `product-${p.id}`,
    variesBy: ['https://schema.org/size'],
    ...(imageUrls.length ? { image: imageUrls } : {}),
    countryOfOrigin: p.listing.countryOfOrigin,
    hasVariant: variants.map((v) => ({
      '@type': 'Product',
      sku: v.sku,
      name: `${p.name} ${v.label}`,
      size: v.label,
      ...(imageUrls.length ? { image: imageUrls[0] } : {}),
      offers: {
        '@type': 'Offer',
        url: absolute(variantPath(p.category.slug, p.slug, v.sku)),
        price: rupees(v.price),
        priceCurrency: 'INR',
        ...(v.mrp > v.price
          ? {
              priceSpecification: [
                { '@type': 'UnitPriceSpecification', price: rupees(v.price), priceCurrency: 'INR' },
                { '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/StrikethroughPrice', price: rupees(v.mrp), priceCurrency: 'INR' },
              ],
            }
          : {}),
        availability: SCHEMA_AVAILABILITY[v.availability],
        ...(v.availability === 'preorder' && p.season.preorderDispatchDate ? { availabilityStarts: p.season.preorderDispatchDate } : {}),
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: BRAND },
        shippingDetails: shippingDetails(),
        hasMerchantReturnPolicy: returnPolicy(),
      },
    })),
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: absolute(it.path) })),
  };
}

export function faqJsonLd(faq: Faq[]): Record<string, unknown> | null {
  if (!faq.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

/** Serialise for a <script type="application/ld+json"> block; `<` is escaped so text can't close the tag. */
export function jsonLdString(obj: Record<string, unknown>): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
