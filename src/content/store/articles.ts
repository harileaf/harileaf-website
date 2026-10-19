/**
 * Articles (v2 Keystatic collection `src/content/articles/*.json`), read
 * through import.meta.glob for the prerendered /learn pages. The file name is
 * the slug: /learn/<slug>/ never changes. Copy is checked against the claims
 * policy in tests/unit/content-claims.test.ts.
 */
export interface Article {
  slug: string;
  title: string;
  summary: string;
  body: string;
  published: string;
  updated: string;
  relatedCategories: string[];
  relatedRecipes: string[];
}

interface ArticleJson {
  title: string;
  summary: string;
  body: string;
  published: string;
  updated?: string | null;
  relatedCategories?: string[];
  relatedRecipes?: string[];
}

const files = import.meta.glob<ArticleJson>('../articles/*.json', { eager: true, import: 'default' });

export const ARTICLES: Article[] = Object.entries(files)
  .map(([file, a]) => ({
    slug: file.split('/').pop()!.replace(/\.json$/, ''),
    title: a.title,
    summary: a.summary,
    body: a.body,
    published: a.published,
    updated: a.updated || a.published,
    relatedCategories: a.relatedCategories ?? [],
    relatedRecipes: a.relatedRecipes ?? [],
  }))
  .sort((a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title));

export const articlesFor = (category: string) => ARTICLES.filter((a) => a.relatedCategories.includes(category));
