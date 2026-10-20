/**
 * Google Merchant Center product feed (RSS 2.0 + g: namespace) and the store
 * sitemap. One feed item per active variant; `g:price` is the printed MRP and
 * `g:sale_price` the selling price when lower (spec: SEO → Site-wide).
 */
import type { Availability } from './availability';
import type { Image, Product, Variant } from './catalog';
import { productDescription } from './seo';
import { absolute, categoryPath, productPath, variantPath } from './urls';
import { MAX_ZONE_PINCODES, type Zone } from './zones';

export const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // XML 1.0 forbids most control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const FEED_AVAILABILITY: Record<Availability, string> = {
  buy: 'in_stock',
  preorder: 'preorder',
  sold_out: 'out_of_stock',
  notify: 'out_of_stock',
};

const inr = (paise: number) => `${(paise / 100).toFixed(2)} INR`;

export interface FeedEntry {
  product: Product;
  variants: Variant[];
  images: Image[];
  /** Perishables: the zone they ship to (even while it's not selling), so they're never offered outside it. */
  shippingZone?: Zone | null;
}

/**
 * Free shipping across India, or for a zone-limited perishable one `g:shipping`
 * per pincode/prefix (`400*`; Merchant Center supports postal codes for India)
 * with its transit time, plus a `shipping_label` for account-level services.
 */
function shippingTags(p: Product, zone: Zone | null | undefined): string[] {
  if (!p.perishable) return ['<g:shipping><g:country>IN</g:country><g:price>0.00 INR</g:price></g:shipping>'];
  if (!zone) return []; // no zone set yet: never claim delivery anywhere
  return [
    ...zone.pincodes.map(
      (pin) =>
        `<g:shipping><g:country>IN</g:country><g:postal_code>${pin.length === 6 ? pin : `${pin}*`}</g:postal_code><g:price>0.00 INR</g:price>` +
        `<g:min_transit_time>1</g:min_transit_time><g:max_transit_time>${zone.maxTransitDays}</g:max_transit_time></g:shipping>`,
    ),
    `<g:shipping_label>zone-${xmlEscape(zone.id)}</g:shipping_label>`,
  ];
}

export function googleFeedXml(entries: FeedEntry[], opts: { title?: string } = {}): { xml: string; skipped: string[] } {
  const items: string[] = [];
  const skipped: string[] = [];
  for (const { product: p, variants, images, shippingZone } of entries) {
    if (!images.length) {
      skipped.push(`${p.slug}: no image`);
      continue;
    }
    // Never list it without its zone's limits (zones saved before the cap could exceed it).
    if (p.perishable && shippingZone && shippingZone.pincodes.length > MAX_ZONE_PINCODES) {
      skipped.push(`${p.slug}: zone "${shippingZone.id}" has more than ${MAX_ZONE_PINCODES} pincodes — use prefixes`);
      continue;
    }
    for (const v of variants) {
      const tag = (name: string, value: string) => `<g:${name}>${xmlEscape(value)}</g:${name}>`;
      const parts = [
        tag('id', v.sku),
        tag('item_group_id', `product-${p.id}`),
        `<title>${xmlEscape(`${p.name} – ${v.label}`)}</title>`,
        `<description>${xmlEscape(productDescription(p))}</description>`,
        `<link>${xmlEscape(absolute(variantPath(p.category.slug, p.slug, v.sku)))}</link>`,
        tag('image_link', absolute(images[0].url)),
        ...images.slice(1, 10).map((i) => tag('additional_image_link', absolute(i.url))),
        tag('availability', FEED_AVAILABILITY[v.availability]),
        ...(v.availability === 'preorder' && p.season.preorderDispatchDate
          ? [tag('availability_date', `${p.season.preorderDispatchDate}T00:00:00+05:30`)]
          : []),
        tag('price', inr(v.mrp)),
        ...(v.price < v.mrp ? [tag('sale_price', inr(v.price))] : []),
        tag('unit_pricing_measure', `${v.unitQtyG} g`),
        tag('unit_pricing_base_measure', '1 kg'),
        tag('brand', 'HariLeaf'),
        tag('condition', 'new'),
        tag('identifier_exists', 'no'),
        ...(p.category.googleCategory ? [tag('google_product_category', p.category.googleCategory)] : []),
        tag('product_type', p.category.name),
        tag('size', v.label),
        ...shippingTags(p, shippingZone),
      ];
      items.push(`<item>${parts.join('')}</item>`);
    }
  }
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>` +
    `<title>${xmlEscape(opts.title ?? 'HariLeaf products')}</title><link>${absolute('/shop')}</link>` +
    `<description>Products sold by HariLeaf</description>` +
    items.join('') +
    `</channel></rss>`;
  return { xml, skipped };
}

export function storeSitemapXml(
  entries: FeedEntry[],
  extra: Array<{ path: string; lastmod?: string }> = [],
): string {
  const urls: Array<{ loc: string; lastmod?: string }> = [];
  const categories = new Map<string, string>();
  for (const { product: p } of entries) {
    urls.push({ loc: absolute(productPath(p.category.slug, p.slug)), lastmod: p.updatedAt.slice(0, 10) });
    const prev = categories.get(p.category.slug);
    if (!prev || p.updatedAt > prev) categories.set(p.category.slug, p.updatedAt);
  }
  for (const [slug, updated] of categories) urls.push({ loc: absolute(categoryPath(slug)), lastmod: updated.slice(0, 10) });
  urls.push({ loc: absolute('/shop/') });
  // An extra page can also be a category with products (e.g. /produce/): list it once.
  for (const e of extra) if (!urls.some((u) => u.loc === absolute(e.path))) urls.push({ loc: absolute(e.path), lastmod: e.lastmod });
  const body = urls
    .map((u) => `<url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}
