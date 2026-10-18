/** Canonical store URLs. Product pages live under their category: /rice/karjat-3. */

export const SITE = 'https://harileaf.org';

export const CATEGORY_SLUGS = ['rice', 'spices', 'produce'] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export const isCategorySlug = (s: string): s is CategorySlug => (CATEGORY_SLUGS as readonly string[]).includes(s);

export const categoryPath = (category: string) => `/${category}/`;
export const productPath = (category: string, slug: string) => `/${category}/${slug}`;
export const variantPath = (category: string, slug: string, sku: string) =>
  `${productPath(category, slug)}?v=${encodeURIComponent(sku)}`;
export const absolute = (path: string) => new URL(path, SITE).toString();

/** Public URL for an R2 object served by /media/[...key]. */
export const mediaUrl = (key: string) => `/media/${key.split('/').map(encodeURIComponent).join('/')}`;
