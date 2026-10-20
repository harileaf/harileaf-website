# SEO and traffic playbook

What the code does for search, and what the owner does outside it. Audience: people worldwide looking for heritage rice, spices and fruit that are grown and processed with care, who want the bran, oils and aroma kept in. Sales: India only for now (fresh mangoes: Mumbai MMR). Overseas demand is collected at `/international/`.

## Already in the code

- `sitemap-index.xml` (all static pages) and `sitemap-store.xml` (products, categories, recipes, articles, with `lastmod`), both listed in `robots.txt`.
- `robots.txt` keeps admin, API, cart, checkout, order and review pages out; everything else is open, including to AI search crawlers.
- `llms.txt`: a plain summary of the farm, products and key pages for AI answer engines.
- Structured data: Organization (every page), Product groups with offers, shipping and returns (product pages), Recipe, Article, BreadcrumbList and ItemList (guide and recipe indexes), FAQPage (product FAQs).
- Google Merchant Center feed at `/feeds/google.xml`.
- Seven guides under `/learn/`. They answer what people search for: adulterated turmeric, carbide-free mangoes, red vs brown vs white rice, cooking unpolished rice, turmeric curing, polished vs unpolished rice, stone vs machine grinding.

## Blocker: no products are live

`/feeds/google.xml` and the product part of `sitemap-store.xml` are empty because no product is active in `/admin/products`. Nothing can rank or show in Google Shopping until products are published. For each product, give:
- a unique description of 150–300 words (variety, where it's grown, how it's milled or ground, how to cook or use it);
- at least three photos: pack, grain or powder close-up, farm;
- the lab report and batch;
- 3–5 FAQs. These become FAQPage markup.

## Week 1: one-time setup (owner)

1. **Google Search Console.** `harileaf.org` is already verified by DNS.
   - Under *Sitemaps*, submit `sitemap-index.xml` and `sitemap-store.xml`.
   - Use *URL inspection → Request indexing* for `/`, `/rice/`, `/spices/`, `/produce/`, `/shop/`, `/our-process/`, `/learn/`, each new guide and `/international/`.
2. **Bing Webmaster Tools.** Sign in and choose *Import from Google Search Console*. Bing's index also feeds DuckDuckGo, Yahoo and ChatGPT search.
3. **Cloudflare dashboard** (owner, since the Cloudflare connector isn't available to Claude):
   - *Caching → Configuration → Crawler Hints*: **on**. It tells Bing and Yandex about changed pages through IndexNow, with no code needed.
   - *Security → Bots / AI Crawl Control*: make sure "Block AI bots" and the managed robots.txt are **off**, if you want to appear in ChatGPT, Perplexity and Gemini answers. Keep Bot Fight Mode as it is; verified search bots are always allowed.
4. **Merchant Center**, once products are live:
   - Add the feed `https://harileaf.org/feeds/google.xml` with a daily fetch.
   - Turn on *free listings*, which put products in the Shopping tab and Images.
   - Shipping: free, India. Returns: link `/refund-policy/`.
   - Link Merchant Center to Search Console.
5. **Google Business Profile**, as a service-area business. Details are in the next section.

## Google Business Profile (service area: Mumbai MMR)

Google allows a service-area business if you deliver to customers in person. Hide the address and list the areas.

- **Name:** `HariLeaf`, exactly as on the packaging. Adding keywords such as "HariLeaf Organic Rice Mumbai" breaks Google's rules and can get the listing suspended.
- **Primary category:** *Farm*. **Additional:** *Rice supplier*, *Spice store*, *Fruit and vegetable store*. Pick the closest matches Google offers when you type them.
- **Service areas** (up to 20): Mumbai, Thane, Navi Mumbai, Mira-Bhayandar, Vasai-Virar, Palghar, Kalyan-Dombivli, Bhiwandi.
- **Website:** `https://harileaf.org/`. **Phone:** the customer-care number in /admin/settings.
- **Verification:** usually a short continuous video showing the farm or packing area, the signage or branded packs, and proof that you run the business (packing an order, a GST certificate or a delivery vehicle).
- **Description** (under 750 characters):

  > HariLeaf grows heritage rice, turmeric and Kesar mangoes on its own farm in Wada, Palghar. The rice (Karjat 3, Kolam rice from Wada and red rice) is grown without synthetic pesticides or fertilisers, hand-harvested, sun-dried and milled once to take off only the husk, so the bran and germ stay on the grain. The turmeric is boiled, sun-cured and slowly stone-ground so more of its aromatic oils stay in the powder; lab results are published on each product page. Kesar mangoes are ripened on hay at the farm, never with carbide, and delivered fresh across Mumbai in season. Rice and spices ship free across India.

- **Products tab:** one entry per product, with photo, price and a link to its product page.
- **Photos:**
  - At the start: 10 or more real photos, including fields, harvest, sun-drying, the stone chakki, hay ripening, packing and the team.
  - After that, add new ones every month.
- **Posts:** one a week, such as harvest updates, the new mango season, a new guide or a recipe.
- **Reviews:** after delivery, ask each customer in person and with the review link in a follow-up message. Reply to every review. Never pay for or filter reviews.

## Keyword map

Each page targets one main search. Use these phrases in titles, headings and the first paragraph.

| Page | Primary query | Secondary |
|---|---|---|
| `/rice/` | heritage rice online | unpolished rice India, red rice buy, Karjat 3 rice, Kolam rice |
| `/spices/` (and `/turmeric/` once live) | stone-ground turmeric powder | PGS certified turmeric, whole turmeric fingers, high curcumin turmeric |
| `/produce/` | hay-ripened Kesar mango Mumbai | carbide-free mango delivery, farm mangoes Mumbai |
| `/our-process/` | how unpolished rice is milled | low-temperature stone grinding |
| `/learn/how-to-tell-if-turmeric-is-adulterated/` | how to check turmeric adulteration | turmeric water test |
| `/learn/carbide-free-mangoes-hay-ripening/` | how to identify carbide mango | hay ripened mango |
| `/learn/red-rice-vs-brown-rice-vs-white-rice/` | red rice vs brown rice | |
| `/learn/how-to-cook-unpolished-rice/` | how to cook unpolished rice | unpolished rice water ratio |
| `/learn/turmeric-curing-boiled-sun-dried/` | how turmeric is processed | turmeric curing |
| `/international/` | buy Indian heritage rice abroad | Indian turmeric for importers |

## Content: two guides a month

Guides and recipes are the main source of worldwide traffic. Each one should answer a real search, teach something, and link to a product page and to `/our-process/`. Next topics:
- Karjat 3 rice: the variety, how it cooks, what to make with it.
- Kolam rice vs sona masoori vs basmati.
- Whole turmeric fingers: how to grind or grate them at home, and how to store them.
- How to read a spice lab report: curcumin, moisture, what "not detected" means.
- What PGS-India certification is, and how it differs from NPOP. Write this from the turmeric page's point of view.
- How to store rice and spices so they keep their aroma.
- More recipes, each a global favourite: golden milk (haldi doodh is live), turmeric rice, red rice salad, Konkan fish curry with red rice, mango lassi, aamras.

Rules for every piece:
- The claims checker in the tests applies to all of them.
- No health claims.
- "Organic" only for the certified turmeric.
- "Pesticide-free" is allowed in code, but have a residue lab report behind every batch that carries it. Merchant Center and FSSAI can both ask for proof.

## Off-site: backlinks and audience

- **Video:** process footage suits this audience best. Post short clips (Instagram Reels, YouTube Shorts) of milling, sun-drying, the stone chakki and hay ripening. Link each clip to its guide.
- **Pinterest:** a recipe and guide pin for every page. It drives a lot of overseas recipe traffic.
- **Communities:** answer real questions on Reddit (r/IndianFood, r/Cooking), Quora and diaspora groups. Answer honestly, and link only where it helps.
- **Samples:** send packs to Indian-food bloggers and YouTubers, in India and in the diaspora (UK, US, UAE, Singapore). Ask for an honest review, not a paid post.
- **Directories:** PGS-India / Jaivik Bharat listing for the turmeric, Maharashtra agri-tourism listings, JustDial (local), IndiaMART (bulk enquiries).
- **Press:** Mumbai food writers are a good fit for the hay-ripened mango story at the start of the season, around March–April.

## Every week (owner, about 30 minutes)

- Search Console → *Performance*: find queries with many impressions and a position of 5–15. Improve those pages first: answer the query more directly in the heading and first paragraph.
- Search Console → *Pages*: fix anything listed under "Crawled – not indexed" or as an error.
- Merchant Center → *Diagnostics*: fix any disapproved products.
- Read the `/international/` enquiries and count them by country. That shows where to export first.

## Deliberately not changed

- The homepage, `/about`, `/technology`, `/solutions` and `/farms/*` still describe HariLeaf Agritech. The owner chose to keep both identities, so the homepage title still targets precision agriculture. Only the site-wide Organization markup now covers both sides.
- `/rice/` and `/spices/` (and the new `/turmeric/`) are being rebuilt in `feat/rice-turmeric-pages`. That work adds their breadcrumb, FAQ and sitemap entries.
