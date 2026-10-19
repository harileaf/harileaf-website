# E-commerce V2-6 — Keystatic Recipes + SEO Articles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Each task: failing test → see it fail → implement → see it pass → commit.

**Goal:** Recipes become a Keystatic collection (spec: SEO → Recipes v2) without changing any URL. The two articles (spec: SEO → keyword table) are published. Product, category, recipe and article pages link to each other and to `/our-process` (SEO §3.4).

**Architecture:**
- **Keystatic `recipes`** (`src/content/recipes/*.json`): title, slug (file name), summary, hero image (`src/assets/recipes`, so prerendered pages get build-time 16:9 / 4:3 / 1:1 crops at 1200 px via `astro:assets`), alt text, published date, category, prep/cook minutes, serves, ingredients, steps, `productsUsed` (`category/slug`), and a tip.
  - `src/content/store/recipes.ts` turns into a loader over `import.meta.glob` (the JSON-import pattern; `createReader` fails during prerender).
- **Keystatic `articles`** (`src/content/articles/*.json`): title, summary, body (basic Markdown), published and updated dates, `relatedCategories`, `relatedRecipes`. Pages at `/learn/[slug]` (prerendered) plus a `/learn` index, with `Article` JSON-LD (Organization author, dates, image).
- **Recipe pages**:
  - plain links to the products used, server-rendered;
  - a small script enhances them with price and availability from `GET /api/store/products?slugs=rice/karjat-3,…` (active products only, edge-cacheable);
  - `Recipe` JSON-LD with three image ratios, ISO 8601 durations, `HowToStep`s, and HariLeaf as the author.
- **Back-links**:
  - product pages: "Cook it" (recipes using the product) and "Read more" (the category's article);
  - `/rice` and `/spices`: link to their article;
  - `/our-process`: links to `/learn`;
  - articles: link to their categories, recipes and `/our-process`.
- **Sitemap**: recipes and articles with real `lastmod`.

**Base branch:** `feat/ecommerce-v2-5-refunds-courier`. Branch: `feat/ecommerce-v2-6-content`.

## Tasks
- [ ] 1. Keystatic collections; migrate the 3 v1 recipes to JSON with images in `src/assets/recipes` (same slugs); loader; recipe page + image variants. Unit test: `Recipe` JSON-LD shape (image ratios, durations, steps, author).
- [ ] 2. `GET /api/store/products?slugs=` + enhancement script; product-page "Cook it" / "Read more" sections.
- [ ] 3. Articles collection + `/learn` pages + `Article` JSON-LD; the two articles drafted only from published process facts (owner to confirm). Content checked by the claims test.
- [ ] 4. Internal links (categories, `/our-process`, footer if needed) and sitemap entries with `lastmod`; e2e not needed (static pages). Lighthouse: add a recipe page.
- [ ] 5. Gates + browser pass; Keystatic admin loads both collections in dev. Spec notes, PR.
