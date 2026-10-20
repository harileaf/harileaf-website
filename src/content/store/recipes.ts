/**
 * Recipes (v2: a Keystatic collection, `src/content/recipes/*.json`; v1 had
 * them hand-written here). Prerendered pages read the JSON through
 * import.meta.glob — Keystatic's createReader fails during prerender — and
 * photos live in src/assets/recipes so the build can crop them for Google.
 * The file name is the slug: /recipes/<slug>/ never changes.
 */
import type { ImageMetadata } from 'astro';

export interface Recipe {
  slug: string;
  title: string;
  summary: string;
  image: ImageMetadata;
  imageAlt: string;
  prepMinutes: number;
  cookMinutes: number;
  serves: number;
  /** ISO date first published (Recipe structured data). */
  published: string;
  /** ISO date last edited (sitemap lastmod). */
  updated: string;
  category: string;
  ingredients: string[];
  steps: string[];
  /** Shop links: `category/slug` (a product) or just a category. */
  uses: Array<{ label: string; product: string; path: string }>;
  tip?: string;
}

interface RecipeJson {
  title: string;
  summary: string;
  heroImage: string;
  heroImageAlt: string;
  published: string;
  updated?: string | null;
  category: string;
  prepMinutes: number;
  cookMinutes: number;
  serves: number;
  ingredients: string[];
  steps: string[];
  productsUsed?: Array<{ product: string; label: string }>;
  tip?: string | null;
}

const files = import.meta.glob<RecipeJson>('../recipes/*.json', { eager: true, import: 'default' });
const images = import.meta.glob<ImageMetadata>('../../assets/recipes/*', { eager: true, import: 'default' });

/** "rice/karjat-3" → "/rice/karjat-3"; "rice" → "/rice/". */
export const shopPath = (product: string) => (product.includes('/') ? `/${product}` : `/${product}/`);

export const RECIPES: Recipe[] = Object.entries(files)
  .map(([file, r]) => {
    const slug = file.split('/').pop()!.replace(/\.json$/, '');
    const imageFile = r.heroImage.split('/').pop()!;
    const image = Object.entries(images).find(([p]) => p.endsWith(`/${imageFile}`))?.[1];
    if (!image) throw new Error(`recipe ${slug}: photo ${r.heroImage} not found in src/assets/recipes`);
    return {
      slug,
      title: r.title,
      summary: r.summary,
      image,
      imageAlt: r.heroImageAlt,
      prepMinutes: r.prepMinutes,
      cookMinutes: r.cookMinutes,
      serves: r.serves,
      published: r.published,
      updated: r.updated || r.published,
      category: r.category,
      ingredients: r.ingredients,
      steps: r.steps,
      uses: (r.productsUsed ?? []).map((u) => ({ label: u.label, product: u.product, path: shopPath(u.product) })),
      tip: r.tip || undefined,
    };
  })
  .sort((a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title));

export const recipeBySlug = (slug: string) => RECIPES.find((r) => r.slug === slug);

/** Recipes that use a product (`category/slug`) — for "Cook it" on product pages. */
export const recipesUsing = (category: string, slug: string) => RECIPES.filter((r) => r.uses.some((u) => u.product === `${category}/${slug}`));
