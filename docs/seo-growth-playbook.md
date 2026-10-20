# SEO and traffic playbook

What the code does for search, and what the owner does outside it. Audience: people worldwide looking for heritage rice, spices and fruit that are grown and processed with care, who want the bran, oils and aroma kept in. Sales: India only for now (fresh mangoes: Mumbai MMR). Overseas demand is collected at `/international/`.

## Already in the code

- `sitemap-index.xml` (all static pages) and `sitemap-store.xml` (products, categories, recipes, articles, with `lastmod`), both listed in `robots.txt`.
- `robots.txt` keeps admin, API, cart, checkout, order and review pages out; everything else is open, including to AI search crawlers.
- `llms.txt`: a plain summary of the farm, products and key pages for AI answer engines.
- Structured data: Organization (every page), Product groups with offers, shipping and returns (product pages), Recipe, Article, BreadcrumbList and ItemList (guide and recipe indexes), FAQPage (product FAQs).
- Google Merchant Center feed at `/feeds/google.xml`.
- Share images: `/images/brand/og-default.png` site-wide, and `/images/brand/og-farm.png` on produce, guide and recipe pages (both 1200×630). Guides also use it as their Article image.
- WebSite markup names the site "HariLeaf" for Google's site-name display. The site-search action is gone, since the site has no search page.
- Organization markup carries the returns policy, which Google uses for the merchant knowledge panel.
- **/admin/settings → Google review link**: once set, the "delivered" email asks for a Google review too.
- Seven guides under `/learn/`. They answer what people search for: adulterated turmeric, carbide-free mangoes, red vs brown vs white rice, cooking unpolished rice, turmeric curing, polished vs unpolished rice, stone vs machine grinding.

## Blocker: no products are live

`/feeds/google.xml` and the product part of `sitemap-store.xml` are empty because no product is active in `/admin/products`. Nothing can rank or show in Google Shopping until products are published. For each product, give:
- a unique description of 150–300 words (variety, where it's grown, how it's milled or ground, how to cook or use it);
- at least three photos: pack, grain or powder close-up, farm;
- the lab report and batch;
- 3–5 FAQs. These become FAQPage markup.

## Google Search: complete setup (owner)

Work through this in order. Use one Google account for Search Console, Merchant Center and the Business Profile, and add a second owner to each so access never depends on one login.

### 1. Cloudflare: done 2026-10-20 (through the API), except one click

- ✅ **www → root redirect:** a Redirect Rule, "www to root (SEO: one canonical host)", returns 301 and keeps the path and query string. `http://www.` reaches `https://harileaf.org` in one hop.
- ✅ **Minimum TLS 1.2.** It was 1.0. Always Use HTTPS, SSL Full (strict) and Rocket Loader off were already right.
- ✅ **AI crawlers:** "Block AI bots" is off and "AI training" stays *disallow*. Search and fetch agents can read the site:
  - allowed: Googlebot, Bingbot, Applebot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, Perplexity-User;
  - blocked: training crawlers, i.e. GPTBot, ClaudeBot and PerplexityBot (Cloudflare classes PerplexityBot with them).

  To appear more in Perplexity, allow PerplexityBot under *Security → Bots → AI Crawl Control*.
- ⬜ **Crawler Hints** (owner, dashboard only; API tokens can't switch it): *Caching → Configuration → Crawler Hints → On*.

### 2. Search Console (search.google.com/search-console)

`harileaf.org` is already verified as a Domain property by the DNS TXT record. Keep that record.

1. **Sitemaps:** submit `sitemap-index.xml` and `sitemap-store.xml`. Both should show "Success" within a day.
2. **Request indexing.** *URL inspection*, then *Request indexing* for:
   - `/`, `/rice/`, `/spices/`, `/produce/`, `/shop/`, `/our-process/`, `/learn/`, `/recipes/`, `/international/`
   - each guide under `/learn/`
   - each product page once it's live.

   There's a limit of about 10 a day; the sitemaps cover the rest.
3. **Users and permissions:** add a second owner.
4. **Settings → Shopping** (if your account shows it): set shipping to free in India and returns to "not accepted, except damaged or wrong item", linking `/refund-policy/`. This matches the structured data.
5. **Link Merchant Center:** *Settings → Associations*, once Merchant Center exists (step 3).
6. **Check the rich results:** paste one URL of each kind into the Rich Results Test (search.google.com/test/rich-results). All should be valid with no errors.

   | Page | What it should show |
   |---|---|
   | a product page | Product / Merchant listing |
   | a recipe | Recipe |
   | a guide | Article and Breadcrumb |
   | the homepage | Organization and WebSite |
7. **Reports to watch:**
   - *Pages*: why URLs aren't indexed.
   - *Experience*: Core Web Vitals, HTTPS.
   - *Shopping*: Merchant listings, Product snippets.
   - *Enhancements*: Breadcrumbs, Recipes, Review snippets.

   Fix anything marked invalid; warnings are optional.
8. **How the site appears in results:**
   - Site name: the homepage's WebSite markup now says "HariLeaf".
   - Favicon: `/favicon.svg`.
   - Logo: in the Organization markup.
   - Share image: guides and produce pages default to `/images/brand/og-farm.png` (1200×630). Large images with `max-image-preview:large` keep pages eligible for Google Discover.

   Google picks these up on its next crawl; you don't need to do anything.
9. **Bing Webmaster Tools** (bing.com/webmasters): *Import from Google Search Console*. One click, and it also covers DuckDuckGo, Yahoo and ChatGPT search.
10. **IndexNow** (Bing, Yandex, Seznam, Naver): the key file is `public/3011935841540ca23e334fff3226a171.txt`. After publishing new or changed pages, tell the engines straight away instead of waiting for a crawl:
    ```sh
    curl -s -X POST https://api.indexnow.org/indexnow -H 'Content-Type: application/json' \
      -d '{"host":"harileaf.org","key":"3011935841540ca23e334fff3226a171","keyLocation":"https://harileaf.org/3011935841540ca23e334fff3226a171.txt","urlList":["https://harileaf.org/learn/new-guide/"]}'
    ```
    A 200 or 202 means accepted. Google doesn't use IndexNow; use *Request indexing* in Search Console for Google.

### 3. Merchant Center (merchants.google.com), once products are live

1. **Business info:** name HariLeaf, website `https://harileaf.org` (claim it; Search Console verification carries over), customer-care phone and email.
2. **Feed:** *Products → Add products → Scheduled fetch*.
   - URL: `https://harileaf.org/feeds/google.xml`
   - Daily fetch, India, English, INR.
3. **Shipping:** free, India, 0–2 days handling and 3–7 days transit. These match the structured data.
   - Mangoes ship only to the Mumbai MMR pincodes; the feed already carries those per item.
4. **Returns:** not accepted, except damaged or wrong items. Policy URL `/refund-policy/`.
5. **Free listings:** turn on. Products then appear in the Shopping tab, Google Images and Search at no cost.
6. **Diagnostics:** fix disapprovals within a few days. The usual causes are a price mismatch, a missing image, or a health or "free-from" claim the reviewer wants evidence for.
7. **Later, once orders flow:** Google Customer Reviews (seller ratings), if it's offered for India in your account. This adds store-level stars.

## Google Business Profile: complete setup (service area: Mumbai MMR)

A service-area business is allowed because you deliver to customers in person. Google asks for the real address to verify, then hides it.

### Create and verify (business.google.com)

1. **Business name:** `HariLeaf`, the name on the packaging and the invoice. Adding keywords ("HariLeaf Organic Rice Mumbai") breaks Google's rules and gets profiles suspended.
2. **Category:**
   - Primary: *Farm*.
   - Additional: *Rice supplier*, *Spice store*, *Fruit and vegetable store*. Choose the closest Google offers as you type. These can change later; the primary one matters most.
3. **"Do you want to add a location customers can visit?"** No.
4. **Service areas** (up to 20): Mumbai, Thane, Navi Mumbai, Mira-Bhayandar, Vasai-Virar, Palghar, Kalyan-Dombivli, Bhiwandi.
5. **Contact details:**
   - Phone: the customer-care number (the same one as on the website and invoices).
   - Website: `https://harileaf.org/?utm_source=google&utm_medium=organic&utm_campaign=gbp`. The tag lets you tell Business Profile visits apart in analytics; the canonical tag keeps Search clean.
6. **Address for verification:** the business address on the GST registration. It stays hidden.
7. **Verification:** usually one continuous video, shot on a phone. Show:
   - where you are: the street, the farm entrance or the packing place;
   - the branded packs or signage;
   - that you run the business: packing an order, the GST or FSSAI certificate, the delivery vehicle.

   Approval takes from a few days to two weeks. Don't edit the name or category while it's pending.

### Complete the profile after verification

- **Description:** see below. No links, no prices.
- **Opening date:** 2023.
- **Hours:** the hours you answer the phone, e.g. Mon–Sat 9:00–18:00.
- **Logo:** at least 250×250 px, square. The site's `icon-color.png` is only 64 px, so export a larger one.
- **Cover photo:** 1080×608 px or larger. Use the farm or the harvest, not a graphic.
- **Photos:** 10 or more real ones at the start, then a few every month. Profiles with photos get more clicks. Cover:
  - fields and harvest
  - sun-drying
  - the stone chakki
  - hay ripening
  - packing
  - the team
  - finished packs
- **Products:** one per product, with photo, price, a short description and the button *Buy* → its product page. Group them as Rice, Spices and Fruit.
- **Services:** "Home delivery – fresh mangoes (Mumbai MMR, in season)" and "Delivery across India – rice and spices".
- **Links:** if the *Order online / Shop* link field is offered, use `https://harileaf.org/shop/`.
- **Social profiles:** Instagram, plus any other real profile.
- **Attributes:** tick what's true, e.g. *Delivery* and *Online orders*. The list depends on the category.

**Description** (under 750 characters):

> HariLeaf grows heritage rice, turmeric and Kesar mangoes on its own farm in Wada, Palghar. The rice (Karjat 3, Kolam rice from Wada and red rice) is grown without synthetic pesticides or fertilisers, hand-harvested, sun-dried and milled once to take off only the husk, so the bran and germ stay on the grain. The turmeric is boiled, sun-cured and slowly stone-ground so more of its aromatic oils stay in the powder; lab results are published on each product page. Kesar mangoes are ripened on hay at the farm, never with carbide, and delivered fresh across Mumbai in season. Rice and spices ship free across India.

### Keep it active

- **Posts, weekly:**
  - *Update*: harvest, a new guide or a recipe.
  - *Offer*: start of mango season, a coupon.
  - *Event*: farm visit day, if you hold one.

  Posts with a photo and a "Learn more" link to the matching page do best.
- **Reviews:**
  - Paste the profile's review link (*Ask for reviews*) into **/admin/settings → Google → Google review link**. Every "delivered" email then offers it beside the on-site review.
  - Also ask in person at the mango deliveries.
  - Reply to every review, good or bad, within a few days.
  - Never offer anything for a review, and never ask only happy customers (Google policy and IS 19000:2022).
- **Keep name, phone and website identical everywhere:** the site, invoices, Instagram, JustDial and IndiaMART. Inconsistent details weaken the local listing.
- **Performance, monthly:** look at searches, calls and website clicks. The searches tell you which words local people use; feed them into the guides.
- **Link back from the site:** send Claude the profile's share link once it's verified. It goes into the Organization `sameAs`, which ties the website and the profile together for Google.

### Never

- Two profiles for one business.
- A virtual office or a PO box as the address.
- Keywords in the name.
- Buying reviews, or "review for a discount".

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
