/** Canonical store URLs. Product pages live under their category: /rice/karjat-3. */

export const SITE = 'https://harileaf.org';

export const CATEGORY_SLUGS = ['rice', 'spices', 'produce'] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export const isCategorySlug = (s: string): s is CategorySlug => (CATEGORY_SLUGS as readonly string[]).includes(s);

/** Landing pages edited in /admin/pages (fixed templates; a new one is a code change). */
export const STORY_PAGE_SLUGS = ['rice', 'turmeric', 'spices'] as const;
export type StoryPageSlug = (typeof STORY_PAGE_SLUGS)[number];

export const isStoryPageSlug = (s: string): s is StoryPageSlug => (STORY_PAGE_SLUGS as readonly string[]).includes(s);

export const categoryPath = (category: string) => `/${category}/`;
export const productPath = (category: string, slug: string) => `/${category}/${slug}`;
export const variantPath = (category: string, slug: string, sku: string) =>
  `${productPath(category, slug)}?v=${encodeURIComponent(sku)}`;
export const absolute = (path: string) => new URL(path, SITE).toString();

/** Public URL for an R2 object served by /media/[...key]. */
export const mediaUrl = (key: string) => `/media/${key.split('/').map(encodeURIComponent).join('/')}`;

/** An https URL safe to render as a link (rejects javascript:, data:, http: etc.). */
export function safeHttpsUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
