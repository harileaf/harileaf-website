# Agritech Brand Website — Execution-Ready Build Plan

**Project**: Agritech Company Brand Website
**Date**: April 10, 2026
**Status**: Starting from scratch
**Goal**: Fastest path to a live, modern, content-editable agritech brand website

---

## PART 1 — Executive Recommendation

### Recommended Stack

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Astro 5 | Ships zero JS by default. Built for content sites. Fastest performance ceiling. Native Cloudflare adapter. |
| **CMS** | Keystatic | Git-based. Zero external services. Content as files. TypeScript schemas. Free forever. |
| **Styling** | Tailwind CSS 4 | Utility-first. Zero-config in Astro. Tree-shaken. Fastest styling workflow. |
| **Interactivity** | Vanilla JS + `<details>`/`<summary>` | No framework needed for a content site. Hamburger menu and accordions only. |
| **Animation** | CSS native + Astro View Transitions | Zero-dependency animations. Built into Astro. GPU-accelerated. |
| **Image optimization** | Astro `<Image>` (built-in sharp) | Auto WebP/AVIF. Responsive srcset. Lazy loading. No external CDN needed. |
| **Hosting** | Cloudflare Pages | Free tier. Global CDN. GitHub integration. Preview deployments. Native Astro adapter. |
| **DNS/Security** | Cloudflare DNS + Turnstile | Free DDoS. Free bot protection. Auto SSL. |
| **Analytics** | Cloudflare Web Analytics | Free. Privacy-first. No cookies. Zero JS bundle cost. |
| **Forms** | Web3Forms | Free tier (250/mo). Zero backend. Works with plain HTML forms. |
| **Source Control** | GitHub | Actions for CI/CD. Projects for management. |

### CMS Comparison (then choosing one)

| Criteria | **Keystatic** (Chosen) | Tina CMS | Decap CMS |
|---|---|---|---|
| Fully open-source | Yes (MIT) | Yes (Apache 2.0) | Yes (MIT) |
| Content storage | Git repo (JSON/YAML/MDX) | Git repo (JSON/MDX) | Git repo (MD/YAML) |
| External service needed | None | Tina Cloud (free 2 users) | None |
| Content modeling | Excellent (TypeScript) | Good (TypeScript) | Basic (YAML config) |
| Admin UI quality | Very good (modern React) | Excellent (visual editing) | Dated |
| Astro integration | Native (first-class support) | Good | Needs adapter |
| Production editing | GitHub mode (OAuth) | Via Tina Cloud | Via Netlify Identity |
| Vendor lock-in | Zero | Low | Zero |
| Learning curve | Low | Medium | Low |

**Decision: Keystatic.** Zero dependencies. Content as plain files. Native Astro integration. TypeScript schemas. Modern admin UI. Free forever with no limits.

### Why this is the fastest path to live

1. **Zero boilerplate** — `npm create astro` + add Keystatic integration = working CMS site in 15 minutes
2. **Zero external accounts** — no CMS hosting, no API keys for content, no database
3. **Zero JS shipped** — Astro pages are static HTML. Fastest possible page loads.
4. **Zero build complexity** — Astro builds to static files. Cloudflare Pages serves them.
5. **Content = files** — edit JSON, commit, deployed. No webhook. No API. No rebuild orchestration.
6. **Native everything** — Astro has built-in image optimization, View Transitions, Cloudflare adapter, Keystatic integration. No glue code.

---

## PART 2 — Architecture Decision

### 2.1 Framework: Astro 5

**Why Astro over everything else for a brand website:**

| Concern | Astro | Next.js | Remix |
|---|---|---|---|
| JS shipped to client | 0 KB (unless you opt-in) | React runtime (~85KB) | React runtime (~85KB) |
| Build output | Static HTML/CSS | Needs server or adapter | Needs server |
| Content site performance | Perfect (static HTML) | Good (with SSG) | Good |
| Cloudflare compatibility | Native adapter | Needs `@cloudflare/next-on-pages` | Needs adapter |
| Learning curve | Low (HTML-first) | Medium (React) | Medium (React) |
| Image optimization | Built-in (sharp) | Built-in (sharp) | Manual |
| View Transitions | Built-in | Experimental | Manual |
| Keystatic integration | Official Astro integration | Works (Next.js adapter) | Manual |
| Build speed | Very fast | Moderate | Moderate |

**Astro's killer feature for this project:** Components are `.astro` files that look like HTML with a script fence. No React, no JSX complexity, no client-side hydration. Perfect for a content website.

```astro
---
// This runs at build time only. Zero JS shipped.
const { title, description } = Astro.props
---
<section class="py-24">
  <h2 class="text-4xl font-bold">{title}</h2>
  <p class="text-lg text-neutral-600">{description}</p>
</section>
```

### 2.2 CMS: Keystatic (Astro Integration)

**Setup is 3 steps:**
1. `npx astro add @keystatic/astro`
2. Create `keystatic.config.tsx`
3. Content appears in `src/content/` as JSON files

**Architecture:**
```
keystatic.config.tsx     → Schema definition (TypeScript)
src/content/**/*.json    → Content files (auto-managed by Keystatic)
/keystatic               → Admin UI route (development + production)
/api/keystatic/*         → API routes for GitHub mode
```

**Two operating modes:**

| Mode | When | How |
|---|---|---|
| **Local** | Development | Reads/writes local filesystem. Instant. |
| **GitHub** | Production | Reads/writes via GitHub API. Editors use deployed admin at `yourdomain.com/keystatic`. Saves create git commits → auto-rebuild. |

### 2.3 Content Flow

```
[Development]
Developer opens localhost:4321/keystatic
         ↓
Edits content in admin UI
         ↓
Keystatic writes JSON to src/content/
         ↓
Astro hot-reloads instantly
         ↓
Developer commits when ready

[Production]
Editor opens yourdomain.com/keystatic
         ↓
Authenticates with GitHub OAuth
         ↓
Edits content in admin UI
         ↓
"Save" → git commit via GitHub API
         ↓
Cloudflare Pages detects commit → builds
         ↓
Astro reads content from filesystem
         ↓
Static HTML deployed to global CDN (~60-90s)
```

**No webhook. No API calls at build time. No external content service. Files in, HTML out.**

### 2.4 Preview Strategy

**Development (local mode):**
- Edit in Keystatic admin → save → Astro hot reloads → see changes instantly
- This IS the preview. Zero extra setup.

**Production (GitHub mode):**
- Option A: Editor saves → commit to `main` → direct deploy (simplest)
- Option B: Editor saves → commit to `draft` branch → Cloudflare preview deploy → review → merge to `main`
- Recommendation: Start with Option A. Add branch workflow later if editorial review is needed.

### 2.5 Form Handling

**MVP: Web3Forms (simplest possible)**
- Plain HTML form with `action` attribute
- No JavaScript needed for basic submission
- Free: 250 submissions/month
- Cloudflare Turnstile for bot protection
- Email notification to configured address

```html
<form action="https://api.web3forms.com/submit" method="POST">
  <input type="hidden" name="access_key" value="YOUR_KEY" />
  <!-- form fields -->
  <button type="submit">Send</button>
</form>
```

**Post-launch upgrade:** Cloudflare Pages Function (serverless) + Resend for email.

### 2.6 Image Strategy

**Astro's built-in image optimization (no external service):**

```astro
---
import { Image } from 'astro:assets'
import farmHero from '../content/images/farm-hero.jpg'
---
<Image src={farmHero} alt="Aerial view of precision agriculture field" widths={[640, 1024, 1440]} />
```

**What Astro does automatically:**
- Converts to WebP/AVIF at build time
- Generates responsive `srcset`
- Lazy loads below-the-fold images
- Generates blur-up placeholders
- Outputs optimized files to build directory

**Image storage:**
- All images in `public/images/` (for CMS-managed) or `src/assets/images/` (for code-referenced)
- Keystatic config points image upload directories to `public/images/`
- Editors upload through Keystatic admin → images stored in git
- For a brand site (~50-100 images, ~200-400MB total), git is fine

### 2.7 Analytics

| Tool | Purpose | Cost | Setup |
|---|---|---|---|
| Cloudflare Web Analytics | Page views, Core Web Vitals | Free | Toggle in Cloudflare dashboard |

**That's it.** No Google Analytics. No cookie banners. No JS tags. Cloudflare Web Analytics is server-side, cookieless, and automatic for Pages projects.

Add Plausible ($9/mo) or PostHog (free self-hosted) later only if you need event tracking, funnels, or user behavior analysis.

### 2.8 SEO Strategy

**Astro makes SEO trivial:**

- Per-page `<title>`, `<meta>` via Astro's `<head>` — content from Keystatic
- Open Graph tags via reusable `<SEO>` component
- `sitemap.xml` via `@astrojs/sitemap` (official integration, auto-generated)
- `robots.txt` as static file in `public/`
- JSON-LD structured data as inline `<script type="application/ld+json">`
- Canonical URLs auto-generated from route
- Semantic HTML by default (Astro components ARE HTML)

**Structured data to include:**
- `Organization` — on every page
- `WebSite` — on homepage
- `BreadcrumbList` — on inner pages
- `FAQPage` — on FAQ section (if present)

**AI-search readiness (2026):**
- Clean, crawlable static HTML (Astro's default output)
- Structured headings and content hierarchy
- Question-answer patterns in content
- Fast load times (static pages)
- No content hidden behind JS

### 2.9 Security

| Measure | How | Cost |
|---|---|---|
| DDoS protection | Cloudflare (automatic) | Free |
| SSL/TLS | Cloudflare (automatic) | Free |
| Bot protection | Cloudflare Turnstile (forms) | Free |
| Security headers | `public/_headers` file | Free |
| CMS auth | GitHub OAuth (Keystatic) | Free |
| Dependency scanning | GitHub Dependabot | Free |

**`public/_headers`:**
```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## PART 3 — Agritech Content Strategy

### 3.1 Messaging Hierarchy

**Level 1 — Brand Promise (Homepage hero):**
"We use [specific technology] to help farmers [specific outcome]."
Concrete. Measurable. No buzzwords.

**Level 2 — How It Works (Homepage + Technology):**
Explain the technology so a farmer understands it in 30 seconds and an investor sees defensibility.

**Level 3 — Proof (Farms + Testimonials):**
Real farms. Real data. Real photos. Real names.

**Level 4 — People and Mission (About Us):**
Who built this? Why agriculture? Why now?

### 3.2 Trust-Building Content

| Trust Signal | Where | Why |
|---|---|---|
| Real farm photography | Farms, Homepage | Real-world proof |
| Specific metrics | Homepage stats, Farms | "32% yield increase" > "improved yields" |
| Named partners | Farms page | Real names = real trust |
| Team photos + bios | About Us | People trust people |
| Research/publications | Technology | Academic credibility |
| Certifications | Footer / About | Third-party validation |
| Partner logos | Homepage / About | Association credibility |

### 3.3 Technical Credibility

**Technology page must answer (in this order):**
1. What does it do? (plain English, 2 sentences)
2. How does it work? (visual step-by-step)
3. What results does it produce? (data, metrics)
4. What makes it different? (competitive edge)
5. What's the science? (expandable, for researchers)
6. Is it safe/sustainable? (environmental angle)

**Principle:** Outcomes first, mechanisms second.

### 3.4 Sustainability Storytelling

- Quantify impact ("X tons CO2 reduced", "Y% less water")
- Show before/after of land health
- Connect sustainability to profitability
- Avoid greenwashing — use data, not claims

### 3.5 Homepage Structure

```
[Hero] — Value proposition + hero image + CTA
[Stats bar] — 3-4 key metrics
[Problem → Solution] — Agricultural challenge → your approach
[Technology preview] — 3 feature cards → Technology page
[Farm spotlight] — 1-2 featured farms → Farms page
[Impact metrics] — Environmental/yield numbers (animated counters)
[CTA section] — "Partner with us" / "See our technology"
[Footer]
```

### 3.6 Technology Page Structure

```
[Hero] — Technology name + one-liner + hero visual
[How It Works] — 3-5 step visual process
[Features] — Card grid (3-6 features with icons)
[Deep Dive] — Expandable sections for depth
[Results] — Key performance metrics
[Research] — Publications, patents, certifications
[CTA] — "See it in action" → Farms
```

### 3.7 Farms Page Structure

```
[Hero] — "Real farms. Real results." + landscape photo
[Farm cards] — Grid with photo, name, location, key metric
[Individual farm detail] — Separate page per farm (full story)
[Aggregate impact] — Total farms, hectares, average improvement
[CTA] — "Become a partner farm"
```

### 3.8 About Us Page Structure

```
[Hero] — Mission statement + team/field photo
[Our Story] — Origin, mission, vision (2-3 paragraphs)
[Timeline] — Key milestones
[Team] — Photo grid with name, role, short bio
[Values] — 3-5 core values
[Partners/Investors] — Logo grid
[Careers CTA] — "Join us"
[Contact] — Contact form
```

---

## PART 4 — CMS Model Design (Keystatic)

### 4.1 Architecture

Keystatic uses:
- **Singletons** — one-off content (pages, settings). One JSON file each.
- **Collections** — repeatable content (farms, team). One JSON file per entry.

```
keystatic.config.tsx

Singletons:
├── siteSettings     → src/content/site-settings.json
├── navigation       → src/content/navigation.json
├── footer           → src/content/footer.json
├── homepage         → src/content/homepage.json
├── technologyPage   → src/content/technology-page.json
├── farmsPage        → src/content/farms-page.json
└── aboutPage        → src/content/about-page.json

Collections:
├── farmProfiles     → src/content/farm-profiles/{slug}/index.json
├── techFeatures     → src/content/tech-features/{slug}/index.json
├── teamMembers      → src/content/team-members/{slug}/index.json
├── testimonials     → src/content/testimonials/{slug}/index.json
└── faqs             → src/content/faqs/{slug}/index.json

Images:
└── public/images/   → All uploaded images (Keystatic-managed)
```

### 4.2 Singleton Schemas

#### `siteSettings`

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | text | Yes | Site-wide title |
| `tagline` | text | Yes | Used in hero/meta |
| `description` | text (multiline) | Yes | Default meta description |
| `logo` | image (`public/images/brand/`) | Yes | Main logo |
| `logoDark` | image | No | For dark backgrounds |
| `favicon` | image | Yes | 32x32 min |
| `email` | text | Yes | Primary contact |
| `phone` | text | No | |
| `address` | text (multiline) | No | Physical address |
| `socialLinks` | array of {platform: select, url: url} | No | |
| `defaultOgImage` | image | Yes | 1200x630 fallback |

#### `navigation`

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of {label, url, children[]} | Yes | Max 6 |
| `ctaButton` | object {label, url} | No | Header CTA |

#### `footer`

| Field | Type | Required | Notes |
|---|---|---|---|
| `columns` | array of {title, links[]} | Yes | 2-4 columns |
| `copyrightText` | text | Yes | |
| `legalLinks` | array of {label, url} | Yes | Privacy, Terms |

#### `homepage`

| Field | Type | Required | Notes |
|---|---|---|---|
| `hero.headline` | text | Yes | Primary value proposition |
| `hero.subheadline` | text (multiline) | Yes | Supporting text |
| `hero.image` | image | Yes | Hero image |
| `hero.ctaPrimary` | {label, url} | Yes | |
| `hero.ctaSecondary` | {label, url} | No | |
| `statsBar` | array of {value, label, suffix} | No | "32%" / "yield increase" |
| `problemSection.headline` | text | Yes | |
| `problemSection.body` | document (rich text) | Yes | |
| `problemSection.image` | image | No | |
| `techPreview.headline` | text | Yes | |
| `techPreview.description` | text (multiline) | No | |
| `techPreview.featureSlugs` | array of text | Yes | 3 tech feature slugs |
| `farmSpotlight.headline` | text | Yes | |
| `farmSpotlight.farmSlugs` | array of text | Yes | 1-2 farm slugs |
| `impactSection.headline` | text | Yes | |
| `impactSection.metrics` | array of {value, label, prefix, suffix} | Yes | |
| `ctaSection.headline` | text | Yes | |
| `ctaSection.body` | text (multiline) | No | |
| `ctaSection.buttons` | array of {label, url, variant: select} | Yes | |
| `seo` | seoFields | No | |

#### `technologyPage`

| Field | Type | Required | Notes |
|---|---|---|---|
| `hero.headline` | text | Yes | |
| `hero.subheadline` | text (multiline) | Yes | |
| `hero.image` | image | Yes | |
| `howItWorks.headline` | text | Yes | |
| `howItWorks.steps` | array of {title, description, image, iconName} | Yes | 3-5 steps |
| `deepDive` | array of {title, body: document} | No | Expandable sections |
| `results.headline` | text | No | |
| `results.metrics` | array of {value, label, context} | No | |
| `research` | array of {title, type: select, url, date} | No | |
| `seo` | seoFields | No | |

#### `farmsPage`

| Field | Type | Required | Notes |
|---|---|---|---|
| `hero.headline` | text | Yes | |
| `hero.subheadline` | text (multiline) | Yes | |
| `hero.image` | image | Yes | |
| `introduction` | document | No | |
| `aggregateStats` | array of {value, label} | No | |
| `ctaSection` | {headline, body, button: {label, url}} | No | |
| `seo` | seoFields | No | |

#### `aboutPage`

| Field | Type | Required | Notes |
|---|---|---|---|
| `hero.headline` | text | Yes | |
| `hero.image` | image | Yes | |
| `story` | document (rich text) | Yes | Origin story |
| `timeline` | array of {year, title, description} | No | |
| `values` | array of {title, description, iconName} | No | |
| `partnersHeadline` | text | No | |
| `partnerLogos` | array of {name, logo: image, url} | No | |
| `careersSection` | {headline, body, url} | No | |
| `contactSection` | {headline, body} | No | |
| `seo` | seoFields | No | |

### 4.3 Collection Schemas

#### `farmProfiles`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | text | Yes | Generates slug |
| `location` | text | Yes | |
| `heroImage` | image | Yes | Main photo |
| `cropType` | text | Yes | |
| `farmSize` | text | No | "250 hectares" |
| `challenge` | text (multiline) | Yes | Problem before |
| `solution` | text (multiline) | Yes | How tech helped |
| `results` | array of {metric, value, context} | Yes | Outcomes |
| `farmerQuote` | text (multiline) | No | |
| `farmerName` | text | No | |
| `farmerRole` | text | No | |
| `gallery` | array of images | No | |
| `body` | document (rich text) | No | Extended story |
| `featured` | checkbox | No | Show on homepage |
| `publishedAt` | date | Yes | |
| `seo` | seoFields | No | |

#### `techFeatures`

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | text | Yes | |
| `iconName` | text | Yes | Icon identifier |
| `shortDescription` | text (multiline) | Yes | 1-2 sentences |
| `body` | document | No | Detailed content |
| `image` | image | No | |
| `order` | integer | Yes | Display order |

#### `teamMembers`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | text | Yes | |
| `role` | text | Yes | |
| `photo` | image | Yes | |
| `shortBio` | text (multiline) | Yes | |
| `fullBio` | document | No | |
| `department` | text | No | |
| `socialLinks` | array of {platform: select, url} | No | |
| `order` | integer | Yes | |

#### `testimonials`

| Field | Type | Required | Notes |
|---|---|---|---|
| `quote` | text (multiline) | Yes | |
| `authorName` | text | Yes | |
| `authorRole` | text | No | |
| `authorCompany` | text | No | |
| `authorPhoto` | image | No | |
| `relatedFarmSlug` | text | No | |
| `featured` | checkbox | No | |

#### `faqs`

| Field | Type | Required | Notes |
|---|---|---|---|
| `question` | text | Yes | |
| `answer` | document (rich text) | Yes | |
| `category` | select | No | Technology / Partnership / General |
| `order` | integer | Yes | |

#### Shared `seoFields` pattern (on every page singleton)

| Field | Type | Required |
|---|---|---|
| `seo.metaTitle` | text | No (falls back to page title) |
| `seo.metaDescription` | text (multiline) | No |
| `seo.ogImage` | image | No (falls back to default) |
| `seo.noIndex` | checkbox | No |

---

## PART 5 — Website Feature Plan

### Must-Have (Launch)

- [ ] Responsive navigation with mobile hamburger
- [ ] Homepage — all sections from CMS
- [ ] Technology page — features, how-it-works, deep-dive
- [ ] Farms page — farm cards grid
- [ ] Farm detail pages — individual farm stories
- [ ] About Us — team, story, timeline, values
- [ ] Footer — columns, social, legal
- [ ] Contact form — Turnstile bot protection, Web3Forms
- [ ] SEO metadata on all pages (title, description, OG)
- [ ] Auto-generated `sitemap.xml` (@astrojs/sitemap)
- [ ] `robots.txt`
- [ ] JSON-LD structured data (Organization, WebSite, BreadcrumbList)
- [ ] Image optimization (Astro built-in: WebP/AVIF, srcset, lazy)
- [ ] WCAG 2.1 AA accessible
- [ ] Core Web Vitals passing (LCP < 2.5s, INP < 200ms, CLS < 0.1)
- [ ] Cloudflare Pages deployment + preview deploys
- [ ] Keystatic admin UI at /keystatic
- [ ] Security headers
- [ ] Cloudflare Web Analytics
- [ ] 404 page
- [ ] Scroll animations (fade-in, section reveals)
- [ ] Sticky header with scroll behavior
- [ ] Hover states on all interactive elements
- [ ] Astro View Transitions (page transitions)
- [ ] Mobile-first responsive design

### Should-Have (2 weeks post-launch)

- [ ] FAQ section with FAQPage schema markup
- [ ] Testimonials section
- [ ] Number counter animations
- [ ] Blog/insights section
- [ ] Newsletter signup
- [ ] Partner logo carousel
- [ ] Keystatic GitHub mode for production editing

### Nice-to-Have (Month 2+)

- [ ] Dark mode
- [ ] Multi-language (i18n)
- [ ] Interactive farm map
- [ ] Video embeds
- [ ] Advanced farm filtering
- [ ] Careers page
- [ ] Press/media kit
- [ ] Lighthouse CI in GitHub Actions

### NOT for MVP

| Feature | Why not |
|---|---|
| Page builder / block editor | Fixed sections + CMS content is enough |
| User auth | Brand site, not SaaS |
| E-commerce | Not in scope |
| Complex search (Algolia) | 4 pages don't need search |
| GSAP / Three.js / Lottie | Overkill for brand site |
| Social media feeds | Unreliable, slow, adds weight |
| Cookie consent | Cloudflare Analytics is cookieless |
| React/Vue/Svelte | Astro components handle everything |

---

## PART 6 — Animation Plan

### 6.1 Principles

1. **Purpose-driven** — guide attention, communicate state, provide feedback
2. **Subtle** — users should barely notice animations
3. **Performance-first** — only animate `transform` and `opacity`
4. **Accessible** — respect `prefers-reduced-motion`
5. **Fast** — entrances: 300-500ms. Hovers: 150-200ms. Max: 800ms.
6. **Consistent** — one easing everywhere: `cubic-bezier(0.16, 1, 0.3, 1)`

### 6.2 Implementation Approach

**Layer 1 — CSS (95% of all animations):**
```css
:root {
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
}
```
- Hover transitions: Tailwind `transition-*` utilities
- Entrance animations: `@starting-style` (CSS native, no JS)
- All interactive elements: `transition: transform, opacity, box-shadow`

**Layer 2 — Intersection Observer (scroll animations):**
- Tiny inline `<script>` in Astro layout (~15 lines)
- Adds `.in-view` class when element enters viewport
- CSS handles the actual animation
- Stagger via CSS `transition-delay` with `--index` custom property

```astro
<!-- FadeIn wrapper — zero JS framework needed -->
<div class="fade-in" style={`--index: ${index}`}>
  <slot />
</div>

<style>
  .fade-in {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity var(--duration-slow) var(--ease-out),
                transform var(--duration-slow) var(--ease-out);
    transition-delay: calc(var(--index, 0) * 100ms);
  }
  .fade-in.in-view {
    opacity: 1;
    transform: translateY(0);
  }
</style>
```

**Layer 3 — Astro View Transitions (page transitions, free):**
- Built into Astro — one line to enable
- Smooth cross-fade between pages
- Morph animations for shared elements (images, headings)
- Zero bundle cost — handled by the browser's View Transitions API

```astro
---
// In layout — enables page transitions site-wide
import { ViewTransitions } from 'astro:transitions'
---
<head>
  <ViewTransitions />
</head>
```

**Layer 4 — Counter animation (stats only):**
- Tiny inline `<script>` for number counting (~20 lines)
- Triggered by Intersection Observer
- No library needed

**Reduced motion:**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 6.3 Page-by-Page Spec

#### Homepage

| Element | Animation | Trigger | Priority |
|---|---|---|---|
| Hero headline | Fade-in + slide-up (20px) | Page load | Must-have |
| Hero subheadline | Fade-in, 100ms delay | Page load | Must-have |
| Hero CTAs | Fade-in, 200ms delay | Page load | Must-have |
| Hero image | Scale 1.02→1.0 + fade | Page load | Must-have |
| Stats numbers | Count-up (0→value) | Scroll | Should-have |
| Problem section | Fade-in + slide-up | Scroll | Must-have |
| Tech cards | Staggered fade-in | Scroll | Must-have |
| Tech cards hover | Lift (-4px) + shadow | Hover | Must-have |
| Farm card | Fade-in | Scroll | Must-have |
| Farm image hover | Zoom 1.03 | Hover | Must-have |
| Impact metrics | Count-up | Scroll | Should-have |
| CTA section | Fade-in | Scroll | Must-have |

#### Technology Page

| Element | Animation | Trigger | Priority |
|---|---|---|---|
| Hero | Staggered fade-in | Page load | Must-have |
| How-it-works steps | Staggered reveal | Scroll | Must-have |
| Feature cards | Staggered fade-in | Scroll | Must-have |
| Card hover | Lift + shadow + icon color | Hover | Must-have |
| Accordion expand | Smooth height (native `<details>`) | Click | Must-have |
| Metrics | Count-up | Scroll | Should-have |

#### Farms Page

| Element | Animation | Trigger | Priority |
|---|---|---|---|
| Hero | Fade-in + slide-up | Page load | Must-have |
| Farm cards | Staggered fade-in | Scroll | Must-have |
| Card image hover | Zoom 1.05 + overlay | Hover | Must-have |
| Stats | Count-up | Scroll | Should-have |

#### About Us Page

| Element | Animation | Trigger | Priority |
|---|---|---|---|
| Hero | Fade-in + slide-up | Page load | Must-have |
| Story paragraphs | Fade-in | Scroll | Must-have |
| Timeline items | Sequential reveal | Scroll | Should-have |
| Team cards | Staggered fade-in | Scroll | Must-have |
| Team photo hover | Scale + grayscale→color | Hover | Nice-to-have |
| Value cards | Staggered fade-in | Scroll | Must-have |

#### Global

| Element | Animation | Priority |
|---|---|---|
| Header | Transparent→solid on scroll (backdrop blur) | Must-have |
| Header | Hide on scroll-down, show on scroll-up | Should-have |
| Page transitions | View Transitions (cross-fade) | Must-have (free in Astro) |
| Button hover | Background + scale 1.02 | Must-have |
| Link hover | Underline slide-in | Must-have |
| Image loading | Blur-up → sharp (Astro built-in) | Must-have |

### 6.4 Avoid

| Animation | Why |
|---|---|
| Parallax | Heavy, gimmicky, nauseating |
| 3D / WebGL | Wrong tool for brand site |
| Auto-playing video bg | Performance killer |
| Typewriter effects | Dated |
| Particles | Wrong aesthetic for agriculture |
| Scroll-jacking | Universally hated |
| Lottie | Extra library, large files |
| Loading spinners | Static site loads instantly |
| Marquee text | Dated, inaccessible |

---

## PART 7 — Design-to-Development Plan

### 7.1 Design Audit

**Before writing code:**

**Step 1: Inventory all screens**
- List every artboard in Google Stitch
- Map to: Homepage, Technology, Farms, About, plus any sub-views
- Note missing pages/states

**Step 2: Completeness check**

| Item | Present? |
|---|---|
| All 4 pages | |
| Mobile layouts | |
| Tablet layouts | |
| Header design | |
| Footer design | |
| Hover states | |
| Focus states | |
| Empty states | |
| Error states (form) | |
| 404 page | |

**Step 3: Gap documentation**
For each missing item: can developer infer it, or does it need designer input?

### 7.2 Design System Extraction

**Extract from designs → map to Tailwind config:**

#### Typography
| Token | Extract from design | Maps to |
|---|---|---|
| Heading font | (family, weights) | `fontFamily.heading` in Tailwind |
| Body font | (family, weights) | `fontFamily.body` |
| Display size | (hero text size) | `fontSize.display` |
| h1-h6 sizes | (section headings) | `fontSize.h1` etc. |
| Body sizes | (body, small, lead) | `fontSize.body` etc. |
| Line heights | (heading vs body) | `lineHeight.tight/normal` |

#### Colors
| Token | Extract | Maps to |
|---|---|---|
| Primary | (brand color) | `colors.primary.DEFAULT/dark/light` |
| Secondary | (accent) | `colors.secondary` |
| Neutrals | (text/bg scale) | `colors.neutral.50-900` |
| Success | (positive metrics) | `colors.success` |
| Error | (form errors) | `colors.error` |

#### Spacing, Shadows, Radius
- Spacing grid (likely 4px/8px base)
- Section vertical padding (typically 64-120px desktop)
- Card shadows
- Border radius values
- Container max-width

### 7.3 Component Inventory

**Astro components (zero JS, static HTML):**
- [ ] `Container.astro` — max-width + padding
- [ ] `Section.astro` — vertical padding + background option
- [ ] `Hero.astro` — headline, text, image, CTAs
- [ ] `SectionHeading.astro` — headline + subheadline
- [ ] `StatsBar.astro` — row of stats
- [ ] `StatItem.astro` — value + label
- [ ] `FeatureCard.astro` — icon + title + description
- [ ] `FarmCard.astro` — image + name + location + metric
- [ ] `TeamCard.astro` — photo + name + role + bio
- [ ] `TestimonialCard.astro` — quote + author
- [ ] `TimelineItem.astro` — year + title + description
- [ ] `CTABanner.astro` — headline + body + buttons
- [ ] `PartnerLogoGrid.astro` — logo grid
- [ ] `FAQItem.astro` — `<details>`/`<summary>` (native HTML)
- [ ] `SEO.astro` — meta tags + OG + JSON-LD
- [ ] `OptimizedImage.astro` — Astro `<Image>` wrapper
- [ ] `FadeIn.astro` — scroll animation wrapper
- [ ] `Button.astro` — primary/secondary/outline variants

**Interactive components (minimal JS):**
- [ ] `Header.astro` — with inline `<script>` for mobile toggle + scroll behavior
- [ ] `Footer.astro`
- [ ] `ContactForm.astro` — HTML form + Turnstile + inline validation
- [ ] `CountUp.astro` — number animation with inline script

**Key difference from React:** Each `.astro` component is just HTML with props. No state, no hooks, no lifecycle. The `<script>` tag in an Astro component runs in the browser but is tiny and scoped.

### 7.4 Page Build Mapping

| Page | Sections | Components Used | CMS Content |
|---|---|---|---|
| **Homepage** | Hero, Stats, Problem, Tech Preview, Farm Spotlight, Impact, CTA | Hero, StatsBar, Section, FeatureCard, FarmCard, CTABanner | homepage singleton + referenced collections |
| **Technology** | Hero, How It Works, Features, Deep Dive, Results, Research | Hero, Section, StepItem, FeatureCard, FAQItem (accordion), StatItem | technologyPage singleton + techFeatures collection |
| **Farms** | Hero, Farm Grid, Stats, CTA | Hero, Section, FarmCard, StatsBar, CTABanner | farmsPage singleton + farmProfiles collection |
| **Farm Detail** | Hero, Story, Results, Quote, Gallery | Hero, Section, StatItem, ImageGallery | Individual farmProfile |
| **About** | Hero, Story, Timeline, Team, Values, Partners, Careers, Contact | Hero, Section, TimelineItem, TeamCard, CTABanner, PartnerLogoGrid, ContactForm | aboutPage singleton + teamMembers collection |

### 7.5 Responsive Plan

| Breakpoint | Width | Behavior |
|---|---|---|
| Mobile (default) | < 640px | Single column. Stacked. 44px touch targets. |
| Tablet (sm/md) | 640-1024px | 2-column grids. Collapsible nav. |
| Desktop (lg/xl) | 1024px+ | Full design fidelity. Horizontal nav. |
| Large (2xl) | 1280px+ | Max-width container. Centered. |

**Inference rules from desktop-only designs:**
1. 3-col → 2-col → 1-col
2. Side-by-side → stacked (image on top)
3. Large text → fluid with `clamp(2rem, 5vw, 4rem)`
4. Horizontal stats → 2x2 grid
5. Desktop nav → hamburger
6. Section padding → reduce 40% on mobile

### 7.6 CMS vs Static Decision

| Content | CMS? | Why |
|---|---|---|
| All text/copy | Yes | Changes with campaigns/updates |
| Button labels/URLs | Yes | CTAs evolve |
| Images | Yes | Updated per season/story |
| Stats/metrics | Yes | Numbers change |
| Farm profiles | Yes | New farms added |
| Team members | Yes | People join/leave |
| Navigation | Yes | Structure may change |
| Footer links | Yes | Legal pages change |
| Layout/section order | No | Fixed reduces complexity |
| Animation behavior | No | Developer concern |
| Colors/typography | No | Brand identity, rarely changes |
| Icons | No | Rarely changes |

### 7.7 Asset Preparation

1. Export images from Stitch at 2x resolution
2. Compress: JPEG quality 80-85%, keep under 2MB each
3. Use `.jpg` for photos, `.png` for transparency, `.svg` for icons/logos
4. Max width: 2400px
5. SVG icons: optimize with SVGO, use inline where possible
6. Fonts: configure via `@fontsource` packages or self-host in `public/fonts/`
7. Favicons: generate full set from logo (favicon.ico, apple-touch-icon, etc.)

### 7.8 Design QA

| Check | Method |
|---|---|
| Typography matches | DevTools + design side-by-side |
| Colors match | Color picker verify |
| Spacing matches | Overlay comparison |
| Responsive works | 375, 768, 1024, 1440px |
| Hover states | Compare with design |
| Animations smooth | Subjective + FPS check |
| Images sharp | Retina rendering check |
| All links work | Click test |
| Accessibility | Lighthouse + keyboard |

---

## PART 8 — GitHub Setup Plan

### 8.1 Repository

**Name:** `[company]-website` (e.g., `acme-agritech-website`)
**Type:** Single repo (code + content together — Keystatic's design)

### 8.2 Folder Structure

```
[company]-website/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── content_update.md
│   ├── workflows/
│   │   ├── ci.yml                 # Lint + build on PR
│   │   ├── deploy.yml             # Deploy to Cloudflare on push to main
│   │   └── lighthouse.yml         # Performance audit on PR
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
├── public/
│   ├── images/
│   │   ├── brand/                 # Logo, favicon, OG defaults
│   │   ├── farm-profiles/         # Farm photos
│   │   ├── team/                  # Headshots
│   │   ├── technology/            # Feature illustrations
│   │   └── general/               # Heroes, backgrounds
│   ├── fonts/                     # Self-hosted fonts (if any)
│   ├── _headers                   # Cloudflare security headers
│   ├── _redirects                 # Cloudflare redirects
│   ├── robots.txt
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── layout/                # Header, Footer, Container, Section
│   │   ├── blocks/                # Hero, Cards, Stats, CTA, etc.
│   │   ├── forms/                 # ContactForm
│   │   ├── animations/            # FadeIn, CountUp
│   │   └── seo/                   # SEO, JsonLd
│   ├── content/                   # KEYSTATIC CONTENT (JSON files)
│   │   ├── site-settings.json
│   │   ├── navigation.json
│   │   ├── footer.json
│   │   ├── homepage.json
│   │   ├── technology-page.json
│   │   ├── farms-page.json
│   │   ├── about-page.json
│   │   ├── farm-profiles/
│   │   ├── tech-features/
│   │   ├── team-members/
│   │   ├── testimonials/
│   │   └── faqs/
│   ├── layouts/
│   │   ├── BaseLayout.astro       # HTML shell, head, scripts
│   │   └── SiteLayout.astro       # Header + main + footer
│   ├── pages/
│   │   ├── index.astro            # Homepage
│   │   ├── technology.astro
│   │   ├── farms/
│   │   │   ├── index.astro        # Farm listing
│   │   │   └── [slug].astro       # Farm detail
│   │   ├── about.astro
│   │   ├── keystatic/             # Keystatic admin UI
│   │   │   └── [...params].astro
│   │   └── 404.astro
│   ├── styles/
│   │   └── global.css             # Tailwind imports + custom CSS
│   └── lib/
│       ├── keystatic.ts           # Reader helper
│       └── utils.ts               # Utility functions
├── keystatic.config.tsx           # CMS schema
├── astro.config.mjs               # Astro config
├── tailwind.config.mjs            # Tailwind config
├── tsconfig.json
├── package.json
└── WEBSITE_BUILD_PLAN.md
```

### 8.3 Branch Strategy

| Branch | Purpose | Protection |
|---|---|---|
| `main` | Production — auto-deploys | Protected: require PR, 1 review, passing CI |
| `feature/*` | Feature work | None |
| `fix/*` | Bug fixes | None |
| `content/*` | Content changes | None |

**Simple flow for small team:**
```
feature/* → main (PR + CI pass → auto-deploy)
```

### 8.4 Labels

| Label | Color | Purpose |
|---|---|---|
| `page:homepage` | Blue | |
| `page:technology` | Blue | |
| `page:farms` | Blue | |
| `page:about` | Blue | |
| `type:feature` | Green | |
| `type:bug` | Red | |
| `type:content` | Purple | |
| `type:design` | Pink | |
| `type:infra` | Gray | |
| `priority:high` | Red | |
| `priority:medium` | Yellow | |
| `priority:low` | Gray | |
| `scope:mvp` | Green | |
| `scope:post-launch` | Gray | |

### 8.5 Milestones

| Milestone | Target | Description |
|---|---|---|
| M0: Setup | Day 1-2 | Repo, Astro, Keystatic, Cloudflare |
| M1: Design System | Day 3-5 | Tokens, components, layout |
| M2: CMS Schema | Day 3-5 | Keystatic config, content structure |
| M3: Homepage | Day 6-9 | Full homepage from design |
| M4: Inner Pages | Day 10-15 | Technology, Farms, About |
| M5: Polish | Day 16-19 | Animations, responsive QA |
| M6: Launch | Day 20-22 | Content, QA, go live |

### 8.6 GitHub Project Board

**Kanban:** `Backlog` → `Ready` → `In Progress` → `In Review` → `Done`
**Table:** Group by milestone
**Roadmap:** Timeline view

### 8.7 GitHub Actions

#### CI (`ci.yml`) — pull_request
```
1. npm ci
2. astro check (TypeScript)
3. npm run build (catches errors)
```

#### Deploy (`deploy.yml`) — push to main
```
1. npm ci
2. npm run build
3. Deploy to Cloudflare Pages (wrangler pages deploy)
```

#### Lighthouse (`lighthouse.yml`) — pull_request
```
1. Build + serve
2. Lighthouse CI
3. Assert: Perf > 90, A11y > 95, SEO > 95
4. Comment on PR
```

### 8.8 Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `KEYSTATIC_GITHUB_CLIENT_ID` | Cloudflare env | GitHub OAuth (production admin) |
| `KEYSTATIC_GITHUB_CLIENT_SECRET` | Cloudflare env (secret) | GitHub OAuth |
| `KEYSTATIC_SECRET` | Cloudflare env (secret) | Session secret |
| `WEB3FORMS_API_KEY` | Cloudflare env (secret) | Form submissions |
| `CLOUDFLARE_API_TOKEN` | GitHub secret | Deploy |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub secret | Deploy |
| `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare env | Bot protection |

**No CMS API tokens. No content service keys. Content is filesystem.**

---

## PART 9 — Cloudflare Deployment Plan

### 9.1 Products Used (Free Tier)

| Product | Use | Free Limit |
|---|---|---|
| **Pages** | Hosting | 500 builds/mo, unlimited bandwidth |
| **DNS** | Domain | Unlimited |
| **CDN** | Edge cache | Unlimited |
| **Web Analytics** | Analytics | Unlimited |
| **Turnstile** | Bot protection | 1M/mo |
| **Workers** (Pages Functions) | Keystatic API | 100K req/day |

**NOT needed:** R2, D1, KV, Images. Everything is static files.

### 9.2 DNS Flow

```
Registrar → Cloudflare nameservers → CNAME → Pages project → User
```

### 9.3 Environments

| Env | URL | Trigger |
|---|---|---|
| Local | `localhost:4321` | `npm run dev` |
| Preview | `<hash>.project.pages.dev` | PR to main |
| Production | `yourdomain.com` | Push to main |

### 9.4 Setup

**Astro + Cloudflare Pages config:**

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import keystatic from '@keystatic/astro'
import sitemap from '@astrojs/sitemap'
import tailwind from '@astrojs/tailwind'

export default defineConfig({
  output: 'hybrid',  // Static by default, server routes for Keystatic
  adapter: cloudflare(),
  site: 'https://yourdomain.com',
  integrations: [
    keystatic(),
    tailwind(),
    sitemap(),
  ],
})
```

**Cloudflare Pages build settings:**
- Build command: `npm run build`
- Output directory: `dist`
- Node.js version: 20

### 9.5 Content Update Flow

```
Editor saves in Keystatic → git commit → Cloudflare detects → build → deploy
```

No webhooks. No APIs. Automatic.

### 9.6 Caching

Cloudflare handles it automatically. Add `public/_headers` for fine-tuning:

```
/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/images/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
```

### 9.7 Free Tier Safety

| Resource | Limit | Expected | Safe? |
|---|---|---|---|
| Builds | 500/mo | ~30-60 | Yes |
| Workers | 100K/day | <100 (admin) | Yes |
| Bandwidth | Unlimited | N/A | Yes |

---

## PART 10 — Build Roadmap

### Phase 0: Project Bootstrap (Day 1)

| Task | Owner | Time | Deliverable |
|---|---|---|---|
| `npm create astro@latest` | Developer | 5 min | New Astro project |
| Add integrations: `@keystatic/astro`, `@astrojs/tailwind`, `@astrojs/sitemap`, `@astrojs/cloudflare` | Developer | 10 min | Configured project |
| Create `keystatic.config.tsx` (basic structure) | Developer | 30 min | CMS schema started |
| Set up Keystatic routes | Developer | 10 min | Admin UI working |
| Create GitHub repo, push initial commit | Developer | 10 min | Repo live |
| Connect repo to Cloudflare Pages | Developer | 15 min | Auto-deploy working |
| Verify blank site deploys to Cloudflare | Developer | 5 min | Live URL |
| Add `_headers`, `robots.txt` | Developer | 10 min | Security + SEO |
| Enable Cloudflare Web Analytics | Developer | 5 min | Analytics active |

**End of Day 1:** Working Astro + Keystatic project. Live on Cloudflare. Admin UI accessible.

### Phase 1: Design Audit + Design System (Days 2-3)

| Task | Owner | Time | Deliverable |
|---|---|---|---|
| Export all Google Stitch designs | Designer | 1h | PNGs organized by page |
| Audit designs for completeness | Developer | 2h | Gap list |
| Extract colors, fonts, spacing | Developer | 2h | Token spreadsheet |
| Configure Tailwind with tokens | Developer | 1h | `tailwind.config.mjs` |
| Set up fonts (via @fontsource or self-host) | Developer | 30m | Fonts working |
| Create global CSS (variables, base styles) | Developer | 1h | `global.css` |
| Build `BaseLayout.astro` + `SiteLayout.astro` | Developer | 1h | Layout shells |

### Phase 2: CMS Schema + Components (Days 3-5)

| Task | Owner | Time | Deliverable |
|---|---|---|---|
| Complete `keystatic.config.tsx` — all singletons | Developer | 3h | Full schema |
| Complete `keystatic.config.tsx` — all collections | Developer | 2h | Collections defined |
| Create `src/lib/keystatic.ts` reader | Developer | 30m | Reader helper |
| Load placeholder content | Developer/Content | 2h | JSON content files |
| Build `Container`, `Section`, `Button` | Developer | 1h | Base components |
| Build `Header` (desktop + mobile) | Developer | 3h | Navigation |
| Build `Footer` | Developer | 2h | Footer |
| Build `Hero` | Developer | 2h | Hero component |
| Build `FeatureCard`, `FarmCard`, `TeamCard` | Developer | 3h | Card components |
| Build `StatsBar`, `StatItem` | Developer | 1h | Stats components |
| Build `CTABanner`, `SectionHeading` | Developer | 1h | Layout blocks |
| Build `TimelineItem`, `PartnerLogoGrid` | Developer | 1h | Remaining blocks |
| Build `FadeIn`, `CountUp` animation wrappers | Developer | 1h | Animation system |
| Build `SEO` + `JsonLd` components | Developer | 1h | SEO components |

### Phase 3: Page Build (Days 6-12)

| Task | Owner | Time | Deliverable |
|---|---|---|---|
| **Homepage** — all sections | Developer | 6h | Homepage complete |
| **Technology** page — all sections | Developer | 4h | Tech page complete |
| **Farms** listing page | Developer | 3h | Farm grid |
| **Farm detail** dynamic page `[slug].astro` | Developer | 3h | Farm stories |
| **About** page — all sections | Developer | 4h | About complete |
| **Contact form** (HTML + Turnstile + Web3Forms) | Developer | 2h | Form working |
| **404** page | Developer | 30m | Error page |
| `sitemap.ts` config | Developer | 15m | Sitemap |
| JSON-LD structured data | Developer | 2h | Schema markup |
| Connect all pages to Keystatic content | Developer | 2h | CMS-driven |

### Phase 4: Animations + Polish (Days 12-15)

| Task | Owner | Time | Deliverable |
|---|---|---|---|
| Scroll animations (fade-in on all sections) | Developer | 3h | Scroll effects |
| Hover effects (cards, buttons, links) | Developer | 2h | Interactive states |
| Sticky header + scroll behavior | Developer | 2h | Header polish |
| View Transitions (page transitions) | Developer | 30m | Page transitions |
| Counter animations | Developer | 1h | Stats animation |
| `prefers-reduced-motion` | Developer | 30m | Accessibility |
| Responsive QA (375, 768, 1024, 1440) | Developer | 3h | Responsive verified |
| Cross-browser test (Chrome, Firefox, Safari) | Developer | 2h | Compat verified |

### Phase 5: SEO + Performance (Days 15-17)

| Task | Owner | Time | Deliverable |
|---|---|---|---|
| Lighthouse audit — all pages | Developer | 2h | Scores > 90 |
| Fix any performance issues | Developer | 2h | Optimized |
| Verify meta tags (social debuggers) | Developer | 1h | Social sharing works |
| Verify structured data (Rich Results Test) | Developer | 30m | Valid |
| Keyboard navigation test | Developer | 1h | Accessible |
| Color contrast audit | Developer | 30m | AA compliant |
| Alt text audit | Content Editor | 1h | All images described |

### Phase 6: Content + QA + Launch (Days 17-22)

| Task | Owner | Time | Deliverable |
|---|---|---|---|
| Load all real content via Keystatic | Content Editor | 4h | Real content |
| Proofread everything | Content + Founder | 2h | Error-free |
| Test all forms end-to-end | Developer | 30m | Forms verified |
| Test all links | Developer | 30m | No broken links |
| Configure production domain | Developer | 30m | Domain live |
| Final Lighthouse audit | Developer | 30m | Scores passing |
| Set up GitHub Project for post-launch | Developer | 30m | Board ready |
| Train content editors on Keystatic | Developer | 1h | Team trained |
| **LAUNCH** | Founder | — | **LIVE** |

### Phase 7: Post-Launch (Weeks 4-8)

| Task | Priority |
|---|---|
| Enable Keystatic GitHub mode for editors | High |
| Add blog/insights section | Medium |
| Add testimonials | Medium |
| Add FAQ with schema markup | Medium |
| Newsletter integration | Medium |
| Lighthouse CI in GitHub Actions | Low |
| Dark mode | Low |

---

## PART 11 — Quality Checklist

### Performance
- [ ] Lighthouse Performance > 95 (Astro sites routinely hit 100)
- [ ] LCP < 2.5s (likely < 1s with Astro)
- [ ] INP < 200ms (likely 0 — no JS)
- [ ] CLS < 0.1
- [ ] Total page weight < 200KB (realistic with Astro)
- [ ] Zero render-blocking JS
- [ ] Images: WebP/AVIF, srcset, lazy
- [ ] Fonts: preload, display:swap
- [ ] Zero unused CSS (Tailwind tree-shakes)

### Accessibility
- [ ] Lighthouse A11y > 95
- [ ] Keyboard navigation everywhere
- [ ] Focus indicators visible
- [ ] All images have alt text
- [ ] Color contrast > 4.5:1
- [ ] Logical heading hierarchy
- [ ] Form labels linked to inputs
- [ ] `prefers-reduced-motion` respected
- [ ] Skip-to-content link
- [ ] `lang` attribute set

### Responsive
- [ ] 375, 390, 768, 1024, 1440, 1920px
- [ ] No horizontal scroll
- [ ] Touch targets > 44px
- [ ] Readable without zoom

### CMS
- [ ] All text from Keystatic
- [ ] Editor can update without developer
- [ ] Image upload works
- [ ] Save triggers rebuild
- [ ] Admin UI organized

### SEO
- [ ] Unique title + description per page
- [ ] OG tags + Twitter cards
- [ ] Canonical URLs
- [ ] Valid sitemap.xml
- [ ] Correct robots.txt
- [ ] JSON-LD structured data
- [ ] Single h1 per page
- [ ] Clean URLs
- [ ] No broken links

### Security
- [ ] SSL active
- [ ] Security headers set
- [ ] No secrets in client code
- [ ] Keystatic requires GitHub auth
- [ ] Dependabot enabled

### Launch
- [ ] No placeholder content remaining
- [ ] All images are real
- [ ] Grammar/spelling checked
- [ ] Contact info correct
- [ ] Legal pages linked
- [ ] Analytics active
- [ ] Domain resolving
- [ ] Team trained on CMS

---

## PART 12 — Risks and Tradeoffs

### Why Astro + Keystatic is lower risk than alternatives

| Risk | Astro + Keystatic | Next.js + Sanity |
|---|---|---|
| External service dependency | None | Sanity content lake |
| API key management | None (for content) | Multiple API keys |
| Build-time network calls | None (filesystem reads) | API calls to Sanity |
| Vendor lock-in | Zero | Low-medium |
| Monthly cost | $0 guaranteed | $0 free tier (limits apply) |
| JS bundle size | 0 KB | ~85KB React runtime |
| Complexity | Low | Medium |
| Things that can break | Less | More (API, webhooks, CDN) |

### Remaining Risks

**Image repo bloat:**
- Risk: >500MB of images in git
- Mitigation: optimize before upload, move to R2 if needed
- Timeline: not a concern until 200+ images

**Keystatic learning curve:**
- Risk: team unfamiliar with Keystatic admin
- Mitigation: 1-hour training session. UI is intuitive.

**Cloudflare Pages build limits:**
- Risk: 500 builds/month
- Reality: ~2 builds/day = 60/month. Plenty.

**No real-time collaboration:**
- Risk: Two editors can't edit simultaneously
- Reality: A brand site rarely has concurrent editors
- Mitigation: use branches if needed

**Limited interactivity:**
- Risk: If future features need complex client-side state
- Mitigation: Astro islands — add React/Svelte components to specific pages without changing architecture

### What to avoid overengineering

| Temptation | Resist because |
|---|---|
| Adding React "just in case" | Astro components handle this site |
| GraphQL | Filesystem reads are simpler |
| State management | No client state on a content site |
| Storybook | < 20 components |
| Design token pipeline | Tailwind config is enough |
| i18n framework | One language first |
| Testing library | Manual QA for 4 pages + Lighthouse CI |
| Docker / containers | Cloudflare Pages handles everything |
| Monorepo tooling | Single repo, single project |

---

## PART 13 — Final Recommendation

### The Stack

| Layer | Choice |
|---|---|
| Framework | **Astro 5** |
| CMS | **Keystatic** (git-based, zero cost) |
| Styling | **Tailwind CSS 4** |
| Interactivity | **Vanilla JS** (inline `<script>`, no framework) |
| Animations | **CSS native + Astro View Transitions** |
| Images | **Astro `<Image>`** (built-in sharp) |
| Forms | **Web3Forms** (free) + **Cloudflare Turnstile** (free) |
| Hosting | **Cloudflare Pages** (free) |
| Analytics | **Cloudflare Web Analytics** (free) |
| Source control | **GitHub** |
| CI/CD | **GitHub Actions** → Cloudflare Pages |

### First 10 Action Items

1. `npm create astro@latest -- --template minimal`
2. `npx astro add @keystatic/astro tailwind sitemap cloudflare`
3. Create `keystatic.config.tsx` with all singletons + collections
4. Set up Keystatic routes (`/keystatic`, `/api/keystatic`)
5. Create GitHub repo, push, connect to Cloudflare Pages
6. Verify blank site deploys to production URL
7. Export Google Stitch designs and extract design tokens
8. Configure Tailwind with colors, fonts, spacing from designs
9. Build layout (Header, Footer, Container) + 3-4 core components
10. Build Homepage section by section, connected to Keystatic content

### MVP Scope

**In:**
- 4 pages + farm detail pages
- Keystatic CMS admin
- Responsive nav + footer
- Contact form
- Scroll animations + View Transitions
- SEO + structured data + sitemap
- Cloudflare Pages + preview deploys
- Mobile-first responsive

**Out (later):**
- Blog
- Newsletter
- Dark mode
- Interactive map
- Advanced filtering
- Multi-language
- Careers page
- Search

### "Don't Do These Yet"

1. Don't add React/Vue/Svelte unless you hit a wall with Astro components
2. Don't add a blog until 3+ articles are written
3. Don't add newsletter until you have a strategy
4. Don't add dark mode until light is perfected
5. Don't add Storybook for < 20 components
6. Don't add Google Analytics — Cloudflare is enough
7. Don't add a chatbot — clarity > AI gimmicks
8. Don't move images to R2 until repo > 500MB
9. Don't add testing frameworks — Lighthouse CI + manual QA
10. Don't add Docker/containers — Cloudflare handles deployment

---

## Recommended Stack in One Line

**Astro 5 + Keystatic + Tailwind CSS 4 + Cloudflare Pages — zero JS shipped, zero external services, zero monthly cost, live in 3 weeks.**

---

## Timeline Summary

| Week | Focus | Deliverable |
|---|---|---|
| **Week 1** | Bootstrap + design system + CMS schema + components | Working project with admin, design tokens, component library |
| **Week 2** | All 4 pages built from designs + forms | Complete website on preview |
| **Week 3** | Animations + SEO + performance + content + QA + launch | **Production website live** |

**Total cost: $0/month.**
**External services: 0.**
**JS shipped to users: 0 bytes.**
**Time to live: ~22 working days for one developer.**

---


## PART 14 — Claude Code Prompt Playbook

Use these prompts in sequence with Claude Code to build the entire HariLeaf website. Each prompt is self-contained and references your actual designs. Copy-paste them one at a time. Wait for completion before moving to the next.

**Your design assets are already in place:**

```
designs/
├── homepage_desktop/screen.png          # Full homepage (desktop)
├── homepage_desktop/code.html           # Google Stitch HTML export
├── homepage_mobile/screen.png           # Full homepage (mobile)
├── homepage_mobile/code.html
├── technology_desktop/screen.png        # Technology page (desktop)
├── technology_desktop/code.html
├── technology_mobile/screen.png
├── technology_mobile/code.html
├── solutions_farms_desktop/screen.png   # Solutions & Farms page (desktop)
├── solutions_farms_desktop/code.html
├── solutions_farms_mobile/screen.png
├── solutions_farms_mobile/code.html
├── about_us_desktop/screen.png          # About Us page (desktop)
├── about_us_desktop/code.html
├── about_us_mobile/screen.png
├── about_us_mobile/code.html
├── contact_us_deskto/screen.png         # Contact Us page (desktop)
├── contact_us_deskto/code.html
├── contact_us_mobile/screen.png
├── contact_us_mobile/code.html
├── 404_page_desktop/screen.png           # 404 page (desktop)
├── 404_page_desktop/code.html
├── 404_page_mobile/screen.png            # 404 page (mobile)
├── 404_page_mobile/code.html
├── Brand_Guidelines/
│   ├── color_palette.png                # Hari Teal, Leaf Olive, Deep Forest, etc.
│   ├── logo_variants_v2.png             # Primary, Monochrome, Reverse, Icon-only
│   ├── Logo/                            # All logo PNGs (full-color, monochrome, white, icon)
│   ├── HariLeafAgriTech_BrandGuidelines_v1.pdf
│   └── applications.png, cover_bg.png, grad_bar.png, logo_clear_space.png, logo_donts.png
├── brand_tokens.css                     # CSS custom properties
└── terra_modern/DESIGN.md               # Full design system document
```

**Claude Code can read image files and HTML files directly.** Every prompt tells it to examine both the screenshot AND the HTML export for exact Tailwind classes, colors, and structure.

**Key design principles (from designs/terra_modern/DESIGN.md — "The Digital Greenhouse"):**
- **Manrope** font exclusively (already installed as `@fontsource-variable/manrope`)
- **No 1px borders** for sectioning — use background color shifts (surface hierarchy)
- **Glassmorphism** for navigation: `rgba(247, 250, 244, 0.7)` + `backdrop-filter: blur(20px)`
- **Brand gradient**: `linear-gradient(to right, #7FC8BA, #9FB17D)` — for hero CTAs, large banners, progress bars
- **Surface hierarchy**: surface (#F7FAF4) → surface-container-low (#F1F5EE) → surface-container (#ECEFE8) → surface-container-high (#E6E9E3) → surface-container-highest (#E0E3DD)
- **Tonal layering** instead of shadows — depth via background color shifts
- **Ambient shadows** only on floating elements: `box-shadow: 0 8px 24px rgba(25, 29, 25, 0.06)`

---

### Prompt 0: Project Bootstrap

```
I have an existing Astro project at the current directory. Verify and complete the project setup:

1. Check that these are installed and configured (they should already be):
   - Astro 5+ with @astrojs/cloudflare adapter
   - @keystatic/astro + @keystatic/core
   - @astrojs/tailwind + @astrojs/sitemap
   - @astrojs/react (needed for Keystatic admin UI)
   - @fontsource-variable/manrope
   - tailwindcss

2. Verify astro.config.mjs has:
   - output: 'hybrid' (NOT 'static' — Keystatic needs server routes)
   - cloudflare() adapter
   - keystatic(), tailwind({ applyBaseStyles: false }), sitemap(), react() integrations
   - site: 'https://example.com' (placeholder)
   If output is set to 'static', change it to 'hybrid'.

3. Ensure Keystatic routes exist:
   - src/pages/keystatic/[...params].astro (admin UI)
   - src/pages/api/keystatic/[...params].ts (API handler)
   If they don't exist, create them using the standard Keystatic Astro setup.

4. Ensure the folder structure exists (create any missing directories):
   - src/components/layout/
   - src/components/blocks/
   - src/components/forms/
   - src/components/animations/
   - src/components/seo/
   - src/content/ (for Keystatic JSON files)
   - src/layouts/
   - src/lib/
   - src/styles/
   - public/images/brand/
   - public/images/farm-profiles/
   - public/images/team/
   - public/images/technology/
   - public/images/general/

5. Copy logo assets from designs/Brand_Guidelines/Logo/ to public/images/brand/:
   - HariLeafAgriTech_logo_fullcolor_transparent_2000w.png → public/images/brand/logo.png
   - HariLeafAgriTech_logo_monochrome_white_transparent_2000w.png → public/images/brand/logo-white.png
   - HariLeafAgriTech_icon_leaf_fullcolor_transparent_512.png → public/images/brand/icon.png
   - Copy designs/Brand_Guidelines/Logo/favicon.ico → public/favicon.ico

6. Create public/_headers with security headers:
   /*
     X-Frame-Options: DENY
     X-Content-Type-Options: nosniff
     Referrer-Policy: strict-origin-when-cross-origin
     Permissions-Policy: camera=(), microphone=(), geolocation=()

   /_astro/*
     Cache-Control: public, max-age=31536000, immutable

   /images/*
     Cache-Control: public, max-age=86400, stale-while-revalidate=604800

7. Create public/robots.txt:
   User-agent: *
   Allow: /
   Disallow: /keystatic
   Sitemap: https://example.com/sitemap-index.xml

8. Create src/styles/global.css with:
   - @import '@fontsource-variable/manrope';
   - Tailwind directives (@tailwind base, components, utilities)
   - CSS custom properties: --ease-out: cubic-bezier(0.16, 1, 0.3, 1); --duration-fast: 150ms; --duration-normal: 300ms; --duration-slow: 500ms;
   - .brand-gradient { background: linear-gradient(to right, #7FC8BA, #9FB17D); }
   - .glass-nav { background: rgba(247, 250, 244, 0.7); backdrop-filter: blur(20px); }
   - html { scroll-behavior: smooth; }
   - body { font-family: 'Manrope Variable', 'Manrope', sans-serif; }
   - prefers-reduced-motion media query that sets animation-duration and transition-duration to 0.01ms

9. Verify the dev server starts with npm run dev and the Keystatic admin UI is accessible at /keystatic.
```

---

### Prompt 1: Keystatic CMS Schema

```
Check the existing keystatic.config.tsx — it should already have a complete schema. Verify it has all of the following and fill in anything missing:

SINGLETONS (each stores to src/content/):
1. siteSettings — title, tagline, description, logo image, logoDark image, email, phone, address (multiline), socialLinks array (platform select + url), defaultOgImage
2. navigation — items array (label, url, children array), ctaButton object (label, url) — the CTA is "Get Started" with brand-gradient style
3. footer — copyrightText ("© 2024 HariLeaf Agritech. Cultivating a sustainable future through autonomous field intelligence and regenerative precision."), legalLinks array (Privacy Policy, Terms of Service, Sustainability Report), socialIcons array (public, potted_plant, hub)
4. homepage — hero (badge: "Sustainable Innovation", headline: "Autonomous Intelligence For The Open Field.", description, heroImage, ctaPrimary: "Explore Our Tech", ctaSecondary: "Watch Drone Demo", floatingCard: {label: "Active Fleet", value: "HL-Sentinel V3", chip: "LIVE DATA"}), bentoSection (headline: "Precision Engineering for Nature.", subtitle, whitepaperLink, cards: [Multispectral Analysis 8-col, Zero-Waste Autonomy 4-col gradient, Variable Rate Delivery 4-col, Real-time Dashboard 8-col dark with 98% stat]), editorialSection (headline: "Regenerative Tech. Rooted in Stability.", body, image, checklistItems: [Carbon Sequestration Tracking, Biodiversity Preservation]), ctaSection (headline: "Ready to digitize your field?", body, primaryBtn: "Schedule a Consultation", secondaryBtn: "Download Brochure"), seo fields
5. technologyPage — hero (badge: "Precision Engineering", headline: "The Digital Greenhouse.", highlightWord: "Greenhouse" italic, description, image, cta: "Explore Infrastructure", floatingChip: {stat: "99.8%", label: "System Uptime"}), coreEcosystem (headline: "Core Ecosystem", subtitle, cards: [Hyper-Local Sensor Mesh 8-col, Neural Growth Engine 4-col primary-bg, Aero-Surveillance 4-col, HariLake Platform 8-col split]), droneSection (headline: "Drone-Led Remediation", features: [Spot-Application Technology, Swarm Intelligence, Self-Sustaining Docks]), statsBar (40% Water Reduction, 2.5x Yield Increase, 0% Soil Runoff, 12ms Latency), ctaSection (headline: "Ready to evolve your harvest?"), seo
6. solutionsFarmsPage — hero (badge: "Sustainable Innovation", headline: "Architecting the Future of Farming with AI & Data.", highlightWords: "Future of Farming", description, image with brand-gradient border), softwareEcosystem (headline: "Precision Software Ecosystem", cards: [LeafSense AI Vision 2-col, HydroLogic Hub 1-col primary-bg, Soil-DNA Analytics 1-col with 89% bar, AeroFleet Command 2-col image]), farmCards (headline: "Real-World Impact", cards: [Highland Vertical Oslo with live telemetry, Sonoma Smart Vineyard with live telemetry]), ctaSection (headline: "Ready to digitize your harvest?", side-by-side layout), seo
7. aboutPage — hero (badge: "Our Roots", headline: "Cultivating a Sustainable Legacy.", highlightWord: "Sustainable", description, image, floatingStat: {value: "12+", label: "Global Farming Patents"}), missionVision (mission: 7-col with eco icon + body, vision: 8-col primary-bg with quoted body + value pills [Resilience, Transparency, Harmony]), journey (headline: "The Journey", entries: [2018 The Seed is Planted, 2021 Scaling Up, 2024 The Digital Greenhouse]), coreValues (headline: "What Guides Us", cards: [Human-Centric Tech, Scientific Integrity, Radical Sustainability]), ctaSection (headline: "Ready to Join the Revolution?"), seo
8. contactPage — hero (headline: "Connect with the future of agritech.", subheadline: "Have questions about our technology or sustainability reports?"), formSection (heading: "Send a Message"), contactInfo (heading: "Reach Us Directly", laboratory object with address, emails array, whatsapp), sustainabilityBanner (headline: "Committed to Zero-Waste Communication.", body, ctaLabel: "Download Report"), seo

COLLECTIONS (each stores to src/content/{collection-name}/):
1. farmProfiles — name, location, heroImage, cropType, farmSize, challenge, solution, results array, farmerQuote, farmerName, farmerRole, gallery, body as document, featured checkbox, publishedAt date, seo
2. techFeatures — title, iconName, shortDescription, body as document, image, order integer
3. teamMembers — name, role, photo, shortBio, fullBio as document, department, socialLinks array, order integer
4. testimonials — quote, authorName, authorRole, authorCompany, authorPhoto, relatedFarmSlug, featured checkbox
5. faqs — question, answer as document, category select (Technology/Partnership/General), order integer

All image fields: store to public/images/ subdirectories. Use proper Keystatic field types. Required fields must be required. Add editor-friendly descriptions.

Also create src/lib/keystatic.ts with a createReader() helper that reads all singletons and collections using @keystatic/core/reader.
```

---

### Prompt 2: Design System + Tailwind Configuration

```
Read the existing tailwind.config.mjs — it should already have the HariLeaf design tokens. Also read these reference files:
- designs/brand_tokens.css (CSS custom properties)
- designs/terra_modern/DESIGN.md (full design system document)
- designs/Brand_Guidelines/color_palette.png (visual color reference)
- designs/homepage_desktop/code.html (contains the exact Tailwind config from Google Stitch)

Verify and complete the Tailwind configuration to match the HariLeaf "Digital Greenhouse" design system exactly:

COLORS — The full Material Design 3 palette from the design HTML exports:
- primary: #196A5E (Hari Teal dark — brand authority)
- on-primary: #FFFFFF
- primary-container: #7FC8BA (Hari Teal light — the gradient start color)
- on-primary-container: #00544A
- secondary: #546437 (Leaf Olive dark — growth accents)
- on-secondary: #FFFFFF
- secondary-container: #D7EAB1
- on-secondary-container: #5A6A3D
- tertiary: #6C5C4C (Soil Brown — grounding elements)
- on-tertiary: #FFFFFF
- tertiary-container: #CCB7A4
- on-tertiary-container: #574839
- Surface hierarchy (critical for "no-line" design rule):
  - surface: #F7FAF4 (page background)
  - surface-container-lowest: #FFFFFF (cards inside sections)
  - surface-container-low: #F1F5EE (large section blocks)
  - surface-container: #ECEFE8 (mid containers)
  - surface-container-high: #E6E9E3 (input fields, hover states)
  - surface-container-highest: #E0E3DD (chips, secondary buttons)
- on-surface: #191D19 (primary text — never use pure #000)
- on-surface-variant: #3F4946 (body text, softer reading)
- outline: #6F7976
- outline-variant: #BEC9C5 (ghost borders at 15% opacity)
- inverse-surface: #2D312D (dark sections, footer)
- error: #BA1A1A, error-container: #FFDAD6

TYPOGRAPHY — Manrope exclusively:
- fontFamily: { headline: ['Manrope Variable', 'Manrope', 'sans-serif'], body: ['Manrope Variable', 'Manrope', 'sans-serif'], label: ['Manrope Variable', 'Manrope', 'sans-serif'] }
- Hero/display: 3.5rem (text-6xl/text-7xl), font-extrabold, tracking-tighter, leading-[1.1]
- Section headings: text-4xl/text-5xl, font-extrabold, tracking-tight
- Card titles: text-xl/text-2xl, font-bold
- Body: text-base (1rem), text-on-surface-variant (#3F4946), leading-relaxed
- Labels: text-xs, font-bold, uppercase, tracking-widest (used for section labels like "THE DIGITAL GREENHOUSE", "PRECISION FIELD TECHNOLOGY")

SPACING:
- Container: max-w-7xl (1280px), centered, px-6 mobile / px-8 desktop
- Section padding: py-24 (6rem vertical)
- Card padding: p-8 or p-10
- Grid gaps: gap-8 (2rem) for cards, gap-16 (4rem) for editorial layouts

BORDER RADIUS (from design):
- DEFAULT: 0.25rem (rounded)
- lg: 0.5rem (rounded-lg) — buttons, inputs
- xl: 0.75rem (rounded-xl) — cards, sections
- 2xl: 1rem — large CTA banners
- full: 9999px (rounded-full) — primary CTA buttons, pill shapes

Ensure src/styles/global.css includes:
- @import '@fontsource-variable/manrope';
- Tailwind directives
- .brand-gradient { background: linear-gradient(to right, #7FC8BA, #9FB17D); }
- .text-brand-gradient { background: linear-gradient(to right, #7FC8BA, #9FB17D); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
- .glass-nav { background: rgba(247, 250, 244, 0.7); backdrop-filter: blur(20px); }
- .glass-form { background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(127, 200, 186, 0.1); }
- Animation timing custom properties
- prefers-reduced-motion media query
- Selection colors: selection:bg-primary-container selection:text-on-primary-container
```

---

### Prompt 3: Base Layout + Header + Footer

```
Read these design files to understand the exact header and footer (they changed recently):
- designs/homepage_desktop/code.html (lines 100-114 for header, lines 256-277 for footer)
- designs/technology_desktop/code.html (lines 93-108 for header)
- designs/about_us_desktop/code.html (lines 94-108 for header)

Build the base layouts and global components to MATCH THE UPDATED DESIGNS EXACTLY:

1. src/layouts/BaseLayout.astro:
   - HTML shell with lang="en", class="scroll-smooth"
   - <head>: charset, viewport, font import, global.css import
   - <body> with class="bg-surface text-on-surface selection:bg-primary-container selection:text-on-primary-container"
   - Props: title (string), description (string)

2. src/layouts/SiteLayout.astro:
   - Extends BaseLayout, includes Header + Footer, <main> with slot
   - Skip-to-content link for accessibility

3. src/components/layout/Header.astro — MATCH THE NEW NAV:
   The nav has CHANGED. New nav items are: Technology | Solutions & Farms | About | Contact
   - Fixed top, full width, z-50
   - Background: bg-[#F7FAF4]/70 backdrop-blur-md (glassmorphic), transition-colors duration-300
   - NO shadow-sm (old design had it, new design doesn't)
   - Inner: max-w-7xl mx-auto px-6 py-4, flex justify-between items-center
   - LEFT: HariLeaf logo img (h-10 to h-12, w-auto)
   - CENTER (hidden md:flex, items-center gap-8, font-manrope font-medium tracking-tight):
     - "Technology" → /technology
     - "Solutions & Farms" → /solutions (this REPLACES the old separate "Solutions" and "Farms" items)
     - "About" → /about
     - "Contact" → /contact (this is NEW in the nav)
     - Each link: text-[#3F4946] (text-on-surface-variant), pb-1, hover:text-[#196A5E] (hover:text-primary), transition-all duration-200
     - Active link: text-[#196A5E] (text-primary) + border-b-2 border-[#196A5E] pb-1
   - RIGHT: "Get Started" CTA — brand-gradient bg, text-on-primary, px-6 py-2.5, rounded-full, font-semibold, scale-95 active:opacity-80, transition-all duration-200
   - MOBILE: hamburger button toggling mobile menu
   - Read nav items from Keystatic navigation singleton
   - Inline <script> for mobile toggle + active link detection

4. src/components/layout/Footer.astro — MATCH THE NEW LIGHT FOOTER:
   The footer has CHANGED from dark to light. Read designs/homepage_desktop/code.html lines 256-277.
   - Background: bg-surface-container-low (#F1F5EE) — NOT the old dark emerald
   - py-12, max-w-7xl mx-auto px-8
   - 2-column grid (grid-cols-1 md:grid-cols-2 gap-8)
   - LEFT column:
     - Logo (h-8, w-auto) + brand name
     - Description/copyright: "© 2024 HariLeaf Agritech. Cultivating a sustainable future through autonomous field intelligence and regenerative precision."
     - text-sm text-on-surface-variant (normal case, NOT uppercase)
   - RIGHT column (md:items-end, space-y-4):
     - Link row (flex gap-8): "Privacy Policy", "Terms of Service", "Sustainability Report"
     - Each: text-sm text-on-surface-variant, hover:underline decoration-primary-container underline-offset-4
     - Social icons row below (flex gap-4): Material Symbols (public, potted_plant, hub) in text-primary opacity-90 hover:opacity-100
   - NO uppercase, NO tracking-widest — the new footer uses normal-case text-sm
   - Read footer data from Keystatic

5. src/components/layout/Container.astro — max-w-7xl mx-auto px-6
6. src/components/layout/Section.astro — py-24 px-6, background prop
```

---

### Prompt 4: Reusable Content Block Components

```
Read ALL updated design files — both screenshots AND HTML exports:
- designs/homepage_desktop/screen.png + code.html
- designs/technology_desktop/screen.png + code.html
- designs/solutions_farms_desktop/screen.png + code.html
- designs/about_us_desktop/screen.png + code.html
- designs/contact_us_deskto/screen.png + code.html

The designs have been updated. Study the new visual patterns. Build all reusable components:

1. src/components/blocks/Button.astro
   Button styles from updated designs:
   - PRIMARY: brand-gradient (linear-gradient 135deg, #7FC8BA → #9FB17D), text-on-primary, rounded-full, px-8 py-4, font-bold
   - SECONDARY: bg-surface-container-highest, text-primary, rounded-full, px-8 py-4, font-bold
   - OUTLINE: border-2 border-on-primary, text-on-primary, rounded-full, px-10 py-4, font-bold (used in gradient CTA sections)
   - DARK: bg-on-primary text-primary, rounded-full, px-10 py-4, font-bold (inverted, used in CTA sections)
   - CTA-NAV: bg-primary-container text-on-primary-container, rounded-full, px-6 py-2, font-semibold (used on about page header)
   - All: scale-95 active:opacity-80 transition-all duration-200
   - Props: variant, href, size, class

2. src/components/blocks/PillBadge.astro (NEW — used on every page hero)
   Every page now has a pill badge above the hero heading:
   - inline-flex items-center gap-2, px-3/px-4 py-1/py-1.5, rounded-full
   - bg-secondary-container text-on-secondary-container, text-xs font-bold tracking-widest uppercase
   - Optional Material Symbol icon inside (e.g., "eco" with FILL 1)
   - Props: text, icon (optional), class

3. src/components/blocks/SectionHeading.astro
   - H2: text-3xl/text-4xl font-bold tracking-tight
   - Optional subtitle: text-on-surface-variant text-lg
   - Optional "View more" link on the right side
   - Props: title, subtitle, linkText, linkHref, alignment

4. src/components/blocks/Hero.astro (updated pattern)
   All pages now use a GRID hero (NOT full-screen background):
   - Grid: grid-cols-1 lg:grid-cols-12 gap-12 items-center
   - LEFT (lg:col-span-7): PillBadge → H1 (text-5xl/6xl/7xl font-extrabold tracking-tighter leading-[1.1]) → description → CTAs
   - RIGHT (lg:col-span-5): Image in rounded container (rounded-xl or rounded-[2rem]) with aspect-square, shadow-2xl, gradient overlay, optional floating chip
   - Hero highlight word is text-primary (some with italic, like "Greenhouse")
   - Floating data chips: absolute positioned, bg-surface-container-lowest, p-6, rounded-xl/rounded-lg, shadow-xl, with metric + label
   - Decorative blur: absolute -z-10, brand-gradient, opacity-20, blur-3xl/blur-[120px]
   - Props: badge, headline, highlightText, description, image, ctaPrimary, ctaSecondary, floatingChip, pattern

5. src/components/blocks/BentoCard.astro (updated patterns)
   Four bento card variants across the designs:
   - DEFAULT: bg-surface-container-lowest, p-8/p-10, rounded-xl, icon + title + description
   - GRADIENT: brand-gradient bg, text-on-primary, icon + title + description (e.g., "Zero-Waste Autonomy")
   - DARK: bg-[#2D312D] or bg-inverse-surface, text-white, with large stat + progress bar (e.g., "98% Accuracy")
   - IMAGE: bg-surface-container-lowest with background image at low opacity, gradient overlay on hover
   - Tags/chips at bottom: px-3 py-1 bg-surface-container-highest rounded-full text-xs font-bold text-secondary uppercase
   - Props: variant, title, description, icon, stat, statLabel, tags[], image, colSpan

6. src/components/blocks/FeatureCard.astro (for Solutions page)
   - bg-surface-container-lowest, p-10, rounded-xl
   - Material Symbol icon (text-4xl text-primary) at top
   - Title (text-2xl font-bold), description (text-lg text-on-surface-variant)
   - Tags row at bottom (pill badges)
   - Arrow icon on right (group-hover:text-primary transition)
   - Props: icon, title, description, tags[], href

7. src/components/blocks/CaseStudyCard.astro (for Solutions page)
   - Image with rounded-xl overflow-hidden
   - Title + stats row below
   - Stats: each with value (text-2xl font-bold) + label (text-xs)
   - Props: title, image, description, stats[]

8. src/components/blocks/StatsBar.astro + StatItem.astro
   - Horizontal row of stats (flex, gap)
   - Each stat: large number (text-5xl font-bold) + label (text-xs uppercase tracking-widest)
   - Some in dark bg (#2D312D), some in light
   - CountUp animation support
   - Props: stats[], variant ('light' | 'dark')

9. src/components/blocks/CTABanner.astro (updated)
   - brand-gradient bg, rounded-xl, p-12, text-center
   - H2 text-4xl font-bold text-on-primary
   - Description text-xl text-on-primary/90
   - Two buttons side by side: dark primary + outline
   - NO email input (removed from new design)
   - Props: headline, body, primaryButton, secondaryButton

10. src/components/blocks/TimelineItem.astro (for About page)
11. src/components/blocks/MissionVisionCard.astro (updated for About bento grid)
    - Bento layout: mission card 7-col with icon + text, vision card 5-col
    - Icon in brand-gradient-bg rounded-lg container
    - Props: type, headline, body, icon

12. src/components/blocks/ContactInfoItem.astro (unchanged from before)
13. src/components/seo/SEO.astro
14. src/components/seo/JsonLd.astro

All components use Tailwind tokens. Astro <Image> for images. Semantic HTML.
```

---

### Prompt 5: Animation System

```
Build the animation system for the HariLeaf website. No external libraries — CSS + tiny inline scripts only.

The designs show a premium, editorial aesthetic. Animations should be subtle and purpose-driven.

1. src/components/animations/FadeIn.astro
   - Wrapper that fades in + slides up (20px) when scrolled into view
   - Props: delay (number for stagger), direction ('up' | 'left' | 'right'), duration (default 500ms)
   - Uses data-animate attribute (observed by global observer)
   - CSS: starts at opacity:0 + translateY(20px), transitions to opacity:1 + translateY(0)
   - Supports --index CSS variable for stagger: transition-delay: calc(var(--index, 0) * 100ms)

2. src/components/animations/StaggerChildren.astro
   - Wrapper that auto-assigns --index to each direct child
   - All children fade in sequentially with 100ms delay between each
   - Props: staggerDelay (default 100ms)

3. src/components/animations/CountUp.astro
   - Displays a number that counts from 0 to target when scrolled into view
   - Props: value (number), prefix (e.g. "$"), suffix (e.g. "+", "%", "M"), duration (default 2000ms)
   - Uses inline <script> with IntersectionObserver
   - Formats large numbers with commas (2,400,000 → "2.4M")
   - Easing: ease-out for natural deceleration

4. Global scroll observer — add to BaseLayout.astro as inline <script>:
   - Create one IntersectionObserver (threshold: 0.1, rootMargin: '0px 0px -50px 0px')
   - Observe all elements with [data-animate] attribute
   - On intersect: add .in-view class, then unobserve (animate once only)
   - ~15 lines of vanilla JS, no framework

5. In src/styles/global.css, add animation classes:
   [data-animate] {
     opacity: 0;
     transform: translateY(20px);
     transition: opacity var(--duration-slow) var(--ease-out),
                 transform var(--duration-slow) var(--ease-out);
     transition-delay: calc(var(--index, 0) * 100ms);
   }
   [data-animate].in-view { opacity: 1; transform: translateY(0); }
   [data-animate="left"] { transform: translateX(-20px); }
   [data-animate="right"] { transform: translateX(20px); }
   [data-animate="left"].in-view,
   [data-animate="right"].in-view { transform: translateX(0); }

   @media (prefers-reduced-motion: reduce) {
     [data-animate] { opacity: 1; transform: none; transition: none; }
   }

6. Card hover effects (used across all designs):
   - Feature cards: transition-colors on background (bg-surface-container → bg-surface-container-high)
   - Card icons: group-hover:scale-110 transition-transform
   - Image cards: group-hover:scale-105 transition-transform duration-700 on the image
   - Buttons: hover:brightness-105 transition-all active:scale-[0.98]

All animations: only animate transform + opacity (GPU accelerated). Use cubic-bezier(0.16, 1, 0.3, 1) easing. Fire once. Respect prefers-reduced-motion.
```


---

### Prompt 6: Homepage

```
Read these design files carefully before writing any code:
- designs/homepage_desktop/screen.png (full desktop layout)
- designs/homepage_mobile/screen.png (full mobile layout)
- designs/homepage_desktop/code.html (exact Tailwind classes and structure)

Build the complete Homepage at src/pages/index.astro, matching the UPDATED design EXACTLY. Read all content from Keystatic. Use SiteLayout.

The homepage has 4 distinct sections (NOT 5 — the old "Modern Intelligence" section and email input CTA are GONE). Build each one top to bottom:

SECTION 1 — HERO (Grid layout, NOT full-screen background):
The hero has CHANGED from a full-screen background image to a 2-column grid layout.
- Container: relative pt-32 pb-20 px-6 overflow-hidden
- Grid: max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center
- LEFT column (lg:col-span-7, space-y-8):
  - PillBadge: "Sustainable Innovation" with eco icon (Material Symbol, FILL 1)
    - inline-flex items-center gap-2 px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold tracking-widest uppercase
  - H1: "Autonomous Intelligence" (line 1) + "For The Open Field." (line 2, wrapped in text-brand-gradient span)
    - text-5xl lg:text-7xl font-extrabold tracking-tight text-on-surface leading-[1.1]
  - Description: "HariLeaf bridges the gap between biological potential and technological precision. Our mission-driven autonomous systems monitor, nurture, and optimize open-field farming at scale."
    - text-xl text-on-surface-variant max-w-2xl leading-relaxed
  - CTAs (flex flex-wrap gap-4 pt-4):
    - "Explore Our Tech" — brand-gradient text-on-primary px-8 py-4 rounded-full text-lg font-bold
    - "Watch Drone Demo" — bg-surface-container-highest text-primary px-8 py-4 rounded-full text-lg font-bold
- RIGHT column (lg:col-span-5, relative):
  - Image: aspect-square rounded-xl overflow-hidden shadow-2xl, drone over field
  - Gradient overlay: absolute inset-0 bg-gradient-to-t from-on-surface/40 to-transparent
  - Floating glass card at bottom: absolute bottom-6 left-6 right-6, glass-nav (backdrop-blur), rounded-lg
    - Left: "Active Fleet" label (text-white/80 text-xs font-bold uppercase tracking-widest) + "HL-Sentinel V3" value (text-white text-lg font-bold)
    - Right: "LIVE DATA" chip (bg-primary-container px-3 py-1 rounded-full text-on-primary-container text-xs font-bold)
  - Decorative blur: absolute -z-10 -top-12 -right-12 w-64 h-64 brand-gradient rounded-full opacity-20 blur-3xl
- Staggered FadeIn animation

SECTION 2 — PRECISION ENGINEERING (Bento Grid):
- Section bg: bg-surface-container-low, py-24
- Inner: max-w-7xl mx-auto px-6
- Header row (flex flex-col md:flex-row justify-between items-end mb-16 gap-6):
  - Left: H2 "Precision Engineering for Nature." (text-4xl font-bold tracking-tight) + subtitle "We don't just build machines; we cultivate digital ecosystems that empower farmers to grow more with less impact." (text-on-surface-variant text-lg)
  - Right: "View Technical Whitepaper" link with arrow_forward icon (text-primary font-bold)
- Bento grid: grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[280px]
  - Card 1 (md:col-span-8): "Multispectral Analysis" — bg-surface-container-lowest, p-8, sensors icon (text-4xl text-primary), description about nutrient deficiency detection, background image at opacity-10 (right half, group-hover:opacity-20)
  - Card 2 (md:col-span-4): "Zero-Waste Autonomy" — brand-gradient bg, text-on-primary, auto_awesome icon, description about AI pathing reducing energy 40%
  - Card 3 (md:col-span-4): "Variable Rate Delivery" — bg-surface-container-lowest, water_drop icon (text-4xl text-secondary), description about precision irrigation
  - Card 4 (md:col-span-8): "Real-time Dashboard" — bg-[#2D312D] dark card, text-white, stat "98%" (text-5xl font-bold text-primary-container) + "Accuracy in Yield Prediction" label, progress bar (h-2 brand-gradient w-4/5)
- FadeIn + StaggerChildren animation

SECTION 3 — EDITORIAL (2-column: image + checklist):
- py-24 px-6, max-w-7xl mx-auto
- Grid: grid-cols-1 lg:grid-cols-2 gap-20 items-center
- LEFT (order-2 lg:order-1): Image of organic farm with rounded-xl shadow-lg
- RIGHT (order-1 lg:order-2, space-y-6):
  - H2: "Regenerative Tech." (line break) "Rooted in Stability." — text-4xl font-bold tracking-tight
  - Body: "At HariLeaf, we believe the future of farming isn't just about high-tech gadgets; it's about making technology a servant of the soil. Our open-field solutions are designed to restore ecological balance while meeting the demands of a growing population."
    - text-lg text-on-surface-variant leading-relaxed
  - Checklist (ul space-y-4 pt-4), each item with check icon in bg-secondary-container p-1 rounded-full:
    - "Carbon Sequestration Tracking" — "Measure and monetize your farm's ability to pull CO2 from the atmosphere."
    - "Biodiversity Preservation" — "Autonomous systems that navigate around local flora and fauna without disruption."
- FadeIn animation

SECTION 4 — CTA (Gradient Banner):
- py-20 px-6
- Inner: max-w-5xl mx-auto brand-gradient rounded-xl p-12 text-center text-on-primary space-y-8
- H2: "Ready to digitize your field?" — text-4xl font-bold
- Body: "Join the hundred of farms worldwide using HariLeaf to optimize their harvests and protect the planet." — text-xl text-on-primary/90 max-w-2xl mx-auto
- Two buttons (flex flex-wrap justify-center gap-4):
  - "Schedule a Consultation" — bg-on-primary text-primary px-10 py-4 rounded-full font-bold text-lg
  - "Download Brochure" — border-2 border-on-primary text-on-primary px-10 py-4 rounded-full font-bold text-lg
- NO email input (removed from new design)
- FadeIn animation

Add SEO component with homepage-specific title/description. Add JSON-LD: Organization + WebSite schemas.

Load placeholder content into Keystatic matching all text visible in the designs. Use the EXACT headlines from the design — do not make up different ones.
```

---

### Prompt 7: Technology Page

```
Read these design files carefully:
- designs/technology_desktop/screen.png (full desktop layout)
- designs/technology_mobile/screen.png (full mobile layout)
- designs/technology_desktop/code.html (exact Tailwind classes and structure)

Build the Technology page at src/pages/technology.astro, matching the UPDATED design EXACTLY. Read content from Keystatic. Use SiteLayout.

The technology page has 5 sections (completely different from the old design). Build each one:

SECTION 1 — HERO (Grid layout with floating chip):
- Container: relative px-8 pt-20 pb-32 overflow-hidden
- Grid: max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center
- LEFT column (lg:col-span-7):
  - PillBadge: "Precision Engineering" — inline-block px-4 py-1.5 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold tracking-widest uppercase mb-6
  - H1: "The Digital" (line 1) + "Greenhouse." (line 2) — "Greenhouse" in text-primary italic (span)
    - text-6xl md:text-7xl font-extrabold tracking-tighter text-on-surface leading-[1.1] mb-8
  - Description: "Synthesizing organic growth with computational precision. Our infrastructure doesn't just monitor nature; it accelerates its potential through a closed-loop ecosystem of AI and hardware."
    - text-xl text-on-surface-variant max-w-xl leading-relaxed mb-10
  - CTA: "Explore Infrastructure" with arrow_downward icon — brand-gradient text-on-primary px-8 py-4 rounded-full font-bold flex items-center gap-2
- RIGHT column (lg:col-span-5, relative):
  - Image: aspect-square rounded-[2rem] overflow-hidden shadow-2xl, vertical greenhouse
  - Gradient overlay: bg-gradient-to-t from-primary/40 to-transparent
  - Floating chip: absolute -bottom-6 -left-6, bg-surface-container-lowest p-6 rounded-xl shadow-xl
    - hub icon (text-primary) + "99.8%" (text-2xl font-bold) + "System Uptime" (text-xs font-bold uppercase tracking-wider)
  - Decorative: absolute top-0 right-0 -z-10 w-1/2 h-full brand-gradient opacity-10 blur-[120px] rounded-full translate-x-1/2
- Staggered FadeIn

SECTION 2 — CORE ECOSYSTEM (Asymmetric Bento Grid):
- bg-surface-container-low py-32 px-8
- Section header: "Core Ecosystem" (text-4xl font-bold tracking-tight) + "Our technology stack is a symbiotic layer designed to harmonize the soil, the atmosphere, and the data stream." (text-on-surface-variant text-lg)
- Decorative: 3 horizontal bars (1 bg-primary w-24, 2 bg-outline-variant w-8, all h-1 rounded-full)
- Grid: grid grid-cols-1 md:grid-cols-12 gap-8
  - Card 1 (md:col-span-8): "Hyper-Local Sensor Mesh" — bg-surface-container-lowest, p-10, sensors icon (text-4xl text-primary), description about nanometer-scale probes + 400ms telemetry, checklist items: "Carbon Sequestration Tracking" + "Multi-Spectrum Light Analysis" (check_circle icons, text-secondary), bg image right side opacity-20
  - Card 2 (md:col-span-4): "Neural Growth Engine" — bg-primary text-on-primary, p-10, psychology icon (text-5xl), description about edge-AI 94% accuracy, description text: text-primary-container text-sm
  - Card 3 (md:col-span-4): "Aero-Surveillance" — bg-surface-container-highest, p-10, air icon (text-4xl text-secondary), description about LiDAR drones, status tag "Active Deployment" with green dot (h-2 w-2 bg-secondary rounded-full)
  - Card 4 (md:col-span-8): "The HariLake Platform" — bg-surface-container-lowest, split layout (flex-row), left: p-10 with title + description + "View Data Architecture" button (with chevron_right), right: dashboard image (w-1/2 bg-surface-container)
- StaggerChildren animation

SECTION 3 — DRONE-LED REMEDIATION (2-column: image + features):
- py-32 px-8 bg-surface
- Grid: max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-24 items-center
- LEFT: Drone image, aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl, decorative blur circle behind
- RIGHT: H2 "Drone-Led Remediation" (text-4xl font-bold tracking-tight mb-8) + 3 feature items:
  - Each: icon in h-14 w-14 rounded-full bg-surface-container-high circle + title (font-bold) + description
  - 1. "Spot-Application Technology" (location_searching icon) — "Our drones reduce chemical usage by up to 90% by applying nutrients and protection only where specifically needed, identified by AI."
  - 2. "Swarm Intelligence" (auto_mode icon) — "Fleet-wide coordination allows dozens of units to cover large areas simultaneously, sharing data to optimize flight paths and battery life."
  - 3. "Self-Sustaining Docks" (battery_charging_full icon) — "Solar-powered base stations allow for 24/7 operations without human intervention, ensuring constant monitoring of sensitive crops."
- FadeIn animation

SECTION 4 — METRICS / STATS BAR:
- py-24 px-8, border-y border-outline-variant/10
- Grid: max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12, text-center
- 4 stats:
  - "40%" — "Water Reduction" (text-5xl font-extrabold text-primary, label: text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant)
  - "2.5x" — "Yield Increase"
  - "0%" — "Soil Runoff"
  - "12ms" — "Latency Response"
- CountUp animation on scroll

SECTION 5 — CTA (Gradient Banner):
- py-32 px-8
- Inner: max-w-5xl mx-auto brand-gradient rounded-3xl p-16 text-center text-on-primary shadow-2xl relative overflow-hidden
- H2: "Ready to evolve your harvest?" — text-5xl font-bold tracking-tight mb-8
- Body: "Join the global network of farms utilizing the HariLeaf ecosystem to build a more resilient food future." — text-xl opacity-90 max-w-2xl mx-auto mb-12
- Buttons:
  - "Get Started Today" — bg-on-primary text-primary px-10 py-5 rounded-full font-extrabold shadow-lg hover:scale-105
  - "Request a Demo" — border-2 border-on-primary text-on-primary px-10 py-5 rounded-full font-extrabold
- Decorative overlay: absolute bg-white/10 backdrop-blur-3xl
- FadeIn animation

Add SEO + BreadcrumbList JSON-LD.

Load placeholder content matching the EXACT headlines and descriptions from the design.
```

---

### Prompt 8: Solutions & Farms Page

```
Read these design files carefully:
- designs/solutions_farms_desktop/screen.png (full desktop layout)
- designs/solutions_farms_mobile/screen.png (full mobile layout)
- designs/solutions_farms_desktop/code.html (exact Tailwind classes and structure)

Build the Solutions & Farms page at src/pages/solutions.astro, matching the UPDATED design EXACTLY. Read content from Keystatic. Use SiteLayout.

The page has 4 sections (completely restructured from old design — NO separate stats bar, NO separate case study spotlight). Build each one:

SECTION 1 — HERO (Grid layout):
- Grid: grid grid-cols-1 md:grid-cols-12 gap-12 items-center
- LEFT column (md:col-span-7):
  - Pill text: "Sustainable Innovation" — text-secondary font-bold tracking-widest text-xs uppercase mb-4
  - H1: "Architecting the Future of Farming with AI & Data." — "Future of Farming" wrapped in text-primary span
    - text-6xl font-extrabold text-on-surface leading-[1.1] mb-6 tracking-tighter
  - Description: "Explore our ecosystem of precision software solutions and global farm projects. From AI-driven vision to hyper-efficient irrigation, we are grounding technology in the soil."
    - text-on-surface-variant text-xl leading-relaxed max-w-2xl
  - NO CTA buttons in hero (different from other pages)
- RIGHT column (md:col-span-5):
  - Image: rounded-xl overflow-hidden aspect-square, wrapped in brand-gradient p-1 border
  - Young plant in indoor farm with LED lighting
- Staggered FadeIn

SECTION 2 — PRECISION SOFTWARE ECOSYSTEM (Bento Grid):
- bg-surface-container-low py-24
- Section header: "Precision Software Ecosystem" (text-3xl font-bold tracking-tight) + "Intelligent platforms designed for maximum yield and zero waste." (text-on-surface-variant)
- Grid: grid grid-cols-1 md:grid-cols-3 gap-6
  - Card 1 (md:col-span-2): "LeafSense AI Vision" — bg-surface-container-lowest p-10 rounded-xl, visibility icon (text-primary text-4xl), description about 98% accuracy computer vision, tags: "AI Driven" + "Live Monitor" (px-3 py-1 bg-surface-container-highest rounded-full text-xs font-bold text-secondary uppercase), arrow_forward on group-hover
  - Card 2 (md:col-span-1): "HydroLogic Hub" — bg-primary text-white p-10 rounded-xl, water_drop icon (text-primary-container text-4xl), description about 65% water reduction, CTA text "EXPLORE SYSTEM" with arrow_right_alt icon
  - Card 3 (md:col-span-1): "Soil-DNA Analytics" — bg-surface-container-lowest p-10 rounded-xl, biotech icon (text-secondary text-4xl), description about deep-layer sensors, progress bar at 89% (brand-gradient fill, h-1.5 bg-surface-container-highest rounded-full)
  - Card 4 (md:col-span-2): "AeroFleet Command" — relative rounded-xl overflow-hidden min-h-[300px], image bg with drone fleet aerial view, gradient overlay from-on-surface/90 to-transparent, white text at bottom
- StaggerChildren animation

SECTION 3 — REAL-WORLD IMPACT (Farm Telemetry Cards):
- Section header: "Real-World Impact" (text-4xl font-extrabold tracking-tighter) + "We don't just build software. We build the physical infrastructure that feeds the world. See live data from our flagship partner farms." (text-on-surface-variant max-w-xl text-lg)
- Navigation arrows: west/east Material icons in p-3 rounded-full border border-outline-variant buttons
- Grid: grid grid-cols-1 lg:grid-cols-2 gap-12

  Farm Card 1: "The Highland Vertical, Oslo"
  - bg-surface-container-low rounded-xl overflow-hidden
  - Image: vertical farm interior with purple LED lighting
  - "Live Telemetry" badge (bg-on-surface text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest) with pulsing green dot (w-2 h-2 bg-green-500 animate-pulse)
  - System Load: 94% (text-primary)
  - Location: "Oslo, Norway" with location_on icon
  - Telemetry stats (3-column grid): Temperature 22.4°C | Humidity 68% | CO2 Level 840 ppm

  Farm Card 2: "Sonoma Smart Vineyard"
  - Same card structure
  - Image: vineyard at sunrise with sensors
  - "Live Telemetry" badge
  - Water Saving: 72% (text-primary)
  - Location: "California, USA"
  - Telemetry stats: Soil Moisture 42% | UV Index 4.2 Low | Last Rain 3d ago

SECTION 4 — CTA (Gradient Banner — side-by-side layout):
- brand-gradient rounded-xl p-16 flex flex-col md:flex-row items-center justify-between gap-12 (NOT centered text — this is a side-by-side layout, different from other CTAs)
- LEFT: H2 "Ready to digitize your harvest?" (text-4xl font-extrabold text-white tracking-tighter) + body "Whether you're a family farm or a multinational agritech provider, our solutions are built to scale with your needs." (text-white/80 text-lg max-w-xl)
- RIGHT: Two buttons:
  - "Schedule Demo" — bg-white text-primary px-8 py-4 rounded-full font-bold shadow-lg hover:scale-105
  - "Technical Specs" — bg-primary/20 backdrop-blur-md text-white border border-white/30 px-8 py-4 rounded-full font-bold
- Decorative: absolute top-right white blur circle (w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl)
- FadeIn animation

Also create:
- src/pages/farms/[slug].astro — dynamic detail pages for individual farms from Keystatic farmProfiles collection
  - Hero with farm name + image
  - Location, telemetry stats
  - Challenge → Solution → Results
  - BreadcrumbList: Home > Solutions > {Farm Name}

Load 2 placeholder farm profiles matching the design:
- The Highland Vertical (Oslo, Norway — vertical farming)
- Sonoma Smart Vineyard (California, USA — precision viticulture)

Add SEO + BreadcrumbList JSON-LD.
```

---

### Prompt 9: About Page

```
Read these design files carefully:
- designs/about_us_desktop/screen.png (full desktop layout)
- designs/about_us_mobile/screen.png (full mobile layout)
- designs/about_us_desktop/code.html (exact Tailwind classes and structure)

Build the About page at src/pages/about.astro, matching the UPDATED design EXACTLY. Read content from Keystatic aboutPage singleton. Use SiteLayout.

NOTE: The About page header CTA is DIFFERENT — it uses bg-primary-container text-on-primary-container (not brand-gradient). Also, the logo is h-12 (slightly larger).

The about page has 5 sections (completely restructured — NO team section, NEW core values section). Build each one:

SECTION 1 — HERO (Grid layout with floating stat):
- pt-32 pb-24, max-w-7xl mx-auto px-8
- Grid: lg:grid-cols-2 gap-16 items-center
- LEFT column:
  - PillBadge: "Our Roots" — inline-block px-4 py-1 rounded-full bg-secondary-container text-on-secondary-container text-sm font-bold tracking-widest uppercase mb-6
  - H1: "Cultivating a Sustainable Legacy." — "Sustainable" in text-primary span
    - text-6xl font-extrabold leading-[1.1] text-on-surface mb-8 tracking-tighter
  - Description: "HariLeaf Agritech was born from a singular vision: to bridge the gap between ancient agricultural wisdom and the precision of modern technology."
    - text-xl text-on-surface-variant leading-relaxed mb-10 max-w-xl
  - NO CTA buttons in hero (only nav CTA)
- RIGHT column:
  - Image: aspect-[4/5] rounded-xl overflow-hidden shadow-2xl, futuristic hydroponic farm with LED lights
  - Floating stat card: absolute -bottom-8 -left-8, bg-surface-container-lowest p-8 rounded-lg shadow-xl max-w-xs
    - "12+" (text-primary font-bold text-4xl) + "Global Farming Patents" (text-sm uppercase tracking-widest text-on-surface-variant)
- Staggered FadeIn

SECTION 2 — MISSION & VISION (Bento Grid):
- py-24 bg-surface-container-low
- Grid: grid-cols-1 md:grid-cols-12 gap-8

  Row 1:
  - Mission Card (md:col-span-7): bg-surface-container-lowest p-12 rounded-xl
    - Icon: eco Material Symbol in w-12 h-12 brand-gradient rounded-lg container (white icon)
    - H3: "Our Mission" (text-3xl font-bold mb-6)
    - Body: "To empower growers worldwide by deploying intelligent, autonomous cultivation systems that maximize yield while minimizing environmental impact. We are committed to reducing water consumption by 90% and eliminating the need for synthetic pesticides through digital biological control."
      - text-lg text-on-surface-variant leading-relaxed
  - Mission Image (md:col-span-5): rounded-xl overflow-hidden, plant sprout with digital sensor

  Row 2:
  - Vision Image (md:col-span-4): rounded-xl overflow-hidden, aerial circular farm with solar panels
  - Vision Card (md:col-span-8): bg-primary text-white p-12 rounded-xl
    - H3: "Our Vision" (text-3xl font-bold mb-6)
    - Body (quoted): "A world where food security is a fundamental right, powered by a decentralized network of intelligent green spaces that breathe life back into our urban and rural landscapes."
      - text-xl font-light leading-relaxed opacity-90
    - Value pills (mt-8 flex gap-4): "Resilience", "Transparency", "Harmony" — each px-4 py-2 bg-white/10 rounded-full text-sm

SECTION 3 — THE JOURNEY (Asymmetric Timeline):
- py-32 bg-surface, max-w-7xl mx-auto px-8
- Header: "The Journey" (text-4xl font-bold) + "From a small garage workshop to a global leader in agritech, our path has been defined by relentless curiosity and a passion for the planet." (text-on-surface-variant text-lg)
- Timeline entries (space-y-32, each: grid md:grid-cols-2 gap-16 items-center, ALTERNATING layout):
  - 2018: "The Seed is Planted" — year in text-7xl font-extrabold text-primary opacity-20, title text-2xl font-bold, body about founders + IoT in vertical farming + 40% energy reduction, image right (workshop photo)
  - 2021: "Scaling Up" — same style, image LEFT (order reversed via order-2 md:order-1), text right, body about Singapore LeafNode facility proving profitable sustainable urban farming
  - 2024: "The Digital Greenhouse" — image right, body about 5M sq ft across 12 countries using AI to optimize water and energy
- Sequential FadeIn

SECTION 4 — CORE VALUES ("What Guides Us"):
- py-24 bg-surface-container-high
- H2: "What Guides Us" (text-4xl font-bold text-center mb-16)
- Grid: md:grid-cols-3 gap-8
  - Card 1: bg-surface-container-lowest p-10 rounded-xl, nature_people icon (text-primary text-4xl, FILL), "Human-Centric Tech" — "Technology is a tool for humans, not a replacement. We build systems that augment the farmer's intuition."
  - Card 2: science icon, "Scientific Integrity" — "Every claim we make is backed by rigorous peer-reviewed data and real-world farm results."
  - Card 3: water_drop icon, "Radical Sustainability" — "We don't just aim for 'less bad.' We strive for regenerative systems that give back to the earth."
- StaggerChildren animation

SECTION 5 — CTA (Gradient Banner):
- py-24, max-w-5xl mx-auto px-8
- Inner: brand-gradient rounded-[2rem] p-16 text-center text-on-primary
- H2: "Ready to Join the Revolution?" — text-4xl font-extrabold mb-6
- Body: "Whether you're a commercial grower or a sustainability partner, let's cultivate the future together." — text-xl mb-10 opacity-90 max-w-2xl mx-auto
- Buttons (flex justify-center gap-6):
  - "Get in Touch" — bg-on-surface text-surface px-8 py-4 rounded-full font-bold hover:scale-105
  - "View Solutions" — border-2 border-on-primary text-on-primary px-8 py-4 rounded-full font-bold
- FadeIn animation

NO TEAM SECTION — the new design does NOT have a team grid. Remove any team-related code if it exists.

Add SEO + BreadcrumbList JSON-LD.

Load placeholder content matching the EXACT text from the design. Use Keystatic aboutPage singleton for all content.
```

---

### Prompt 10: Contact Page

```
Read these design files carefully — the contact page has its OWN dedicated design:
- designs/contact_us_deskto/screen.png (full desktop layout — note the folder is "deskto" not "desktop")
- designs/contact_us_mobile/screen.png (full mobile layout)
- designs/contact_us_deskto/code.html (exact Tailwind classes — this is the most important reference)

Build the Contact page at src/pages/contact.astro, matching the design EXACTLY. Read content from Keystatic contactPage singleton. Use SiteLayout.

The contact page has these sections:

SECTION 1 — HERO (short, dark overlay):
- Height: h-[450px], overflow-hidden
- Background: full-width farming field image, gradient overlay: bg-gradient-to-r from-on-background/80 via-on-background/40 to-transparent
- Content (relative z-10, max-w-7xl mx-auto px-8, flex flex-col justify-center):
  - Label: "CONTACT US" — text-primary font-bold tracking-[0.2em] text-xs uppercase
  - H1: "Connect with the future of agritech." where "future" uses text-brand-gradient (gradient text effect)
    - text-5xl lg:text-7xl, font-bold, text-white, tracking-tighter, max-w-2xl, leading-[1.1]
  - Subtext: "Have questions about our technology or sustainability reports? Our specialists are ready to help you grow."
    - text-white/80, text-lg, max-w-lg, leading-relaxed

SECTION 2 — FORM + CONTACT INFO (2-column):
- Background: bg-surface-container-low, py-24 px-8
- max-w-7xl mx-auto
- Grid: grid-cols-1 lg:grid-cols-12 gap-16 items-start

  LEFT COLUMN (lg:col-span-7) — CONTACT FORM:
  - Glass card: glass-form class (rgba(255,255,255,0.6) + backdrop-blur(12px) + border 1px solid rgba(127,200,186,0.1))
  - rounded-lg, p-8 md:p-12, shadow-sm
  - H2: "Send a Message" — text-3xl font-bold text-on-surface mb-8
  - Form fields (space-y-6):
    - Row 1 (grid grid-cols-1 md:grid-cols-2 gap-6):
      - "FULL NAME" — label: text-xs font-bold uppercase tracking-widest text-on-surface-variant
        - Input: bg-surface-container-lowest, border-outline-variant/30, rounded-lg, px-4 py-3, focus:ring-2 focus:ring-primary/40, placeholder "John Doe"
      - "EMAIL ADDRESS" — same label style, input type=email, placeholder "john@company.com"
    - "SUBJECT" — select dropdown with options: General Inquiry, Partnership Opportunities, Technical Support, Media & Press
      - Same input styling as text fields
    - "YOUR MESSAGE" — textarea, 5 rows, placeholder "How can we help your harvest?"
    - Submit button: "Send Inquiry" — brand-gradient (solid #7FC8BA on contact page), text-on-primary, w-full md:w-auto, px-10 py-4, rounded-lg, font-bold, shadow-sm, hover:brightness-105, active:scale-[0.98]
  - All inputs: text-on-surface, transition-all, placeholder:text-outline/40

  RIGHT COLUMN (lg:col-span-5) — CONTACT DETAILS + MAP:
  - H3: "Reach Us Directly" — text-2xl font-bold text-on-surface, mb-8
  - Three contact items (space-y-8), each with flex items-start gap-5:
    1. LOCATION:
       - Icon: w-12 h-12 rounded-lg bg-primary-fixed, Material Symbol "location_on" text-primary
       - Title: "Main Laboratory" (font-bold)
       - Details: "Level 24, Green Spire Plaza" (line break) "Sustainable District, Singapore 018982"
       - text-on-surface-variant, leading-relaxed
    2. EMAIL:
       - Icon: w-12 h-12 rounded-lg bg-secondary-fixed, Material Symbol "mail" text-secondary
       - Title: "Email"
       - Details: "hello@harileaf.agri" + "press@harileaf.agri"
    3. WHATSAPP:
       - Icon: w-12 h-12 rounded-lg bg-emerald-100, WhatsApp SVG icon (text-emerald-600)
       - Title: "WhatsApp"
       - Details: "+65 8299 4400" + "Instant chat support available" (text-xs italic)
  - MINI MAP:
    - rounded-lg overflow-hidden aspect-video shadow-sm border border-outline-variant/30
    - Static map image (placeholder for now — can be replaced with embedded map later)

SECTION 3 — SUSTAINABILITY BANNER (dark):
- bg-on-background (#191D19), text-white, py-16 px-8
- max-w-7xl mx-auto, flex flex-col md:flex-row items-center justify-between gap-8
- Left:
  - H2: "Committed to Zero-Waste Communication." — text-3xl font-bold tracking-tight
  - Body: "Every interaction with our team is documented in our carbon-neutral cloud system, ensuring our digital footprint remains as small as our soil one." — text-white/60, mt-2, max-w-xl
- Right:
  - Button: "Download Report" — bg-white text-on-background, px-8 py-3, rounded-lg, font-bold, hover:bg-primary
- Decorative: absolute eco icon at right side, large, opacity-10 (Material Symbol "eco" with FILL 1)

FORM BEHAVIOR (initial — plain HTML submission):
- Form action: POST to Web3Forms (https://api.web3forms.com/submit)
- Hidden field: access_key for Web3Forms
- Add Cloudflare Turnstile widget for bot protection:
  - <div class="cf-turnstile" data-sitekey="YOUR_KEY"></div>
  - Load Turnstile script: <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
- HTML5 validation: required on name, email, message. type=email on email field.
- Success redirect: ?success=true → show a styled success message
- This plain form will be upgraded to AI-powered in Prompt 14.

MOBILE LAYOUT (from designs/contact_us_mobile/screen.png):
- Hero: "Let's Grow Together" (different headline on mobile) with "Call Us" and "Email Us" quick action buttons
- Form stacks to single column
- Contact details stack below form
- "Global Presence" section replaces map on mobile

Load placeholder content into Keystatic contactPage singleton matching all text from the design.
Add SEO + BreadcrumbList JSON-LD.
```


---

### Prompt 11: SEO, Sitemap, Structured Data

```
Complete the SEO infrastructure for the HariLeaf website:

1. Update src/components/seo/SEO.astro:
   - Dynamic title with suffix: "{Page Title} | HariLeaf AgriTech"
   - Meta description (from Keystatic page SEO fields, fallback to site settings)
   - Canonical URL (auto from Astro.url)
   - OG tags: og:title, og:description, og:image (from page SEO or default from site settings), og:url, og:type (website), og:site_name ("HariLeaf AgriTech")
   - Twitter card: twitter:card (summary_large_image), twitter:title, twitter:description, twitter:image
   - Optional noindex (from page SEO field)
   - Read siteSettings from Keystatic for defaults

2. Update src/components/seo/JsonLd.astro to output valid JSON-LD for:
   - Organization: name "HariLeaf AgriTech", url, logo (/images/brand/logo.png), address (Level 24, Green Spire Plaza, Singapore 018982), contactPoint (hello@harileaf.agri), sameAs (social links from site settings)
   - WebSite: name, url, potentialAction (SearchAction)
   - BreadcrumbList: dynamic breadcrumbs array
   - FAQPage: for FAQ sections if used

3. Add JSON-LD to all existing pages:
   - index.astro (Homepage): Organization + WebSite
   - technology.astro: Organization + BreadcrumbList (Home > Technology)
   - solutions.astro: Organization + BreadcrumbList (Home > Solutions)
   - farms/[slug].astro: Organization + BreadcrumbList (Home > Solutions > {Farm Name})
   - about.astro: Organization + BreadcrumbList (Home > About)
   - contact.astro: Organization + BreadcrumbList (Home > Contact)
   - 404.astro: Organization only (no breadcrumbs on error page)

4. Configure @astrojs/sitemap in astro.config.mjs:
   - Set site URL (keep placeholder for now)
   - Exclude: ['/keystatic', '/keystatic/**', '/api/**']

5. Verify every page has:
   - Unique <title> (not duplicate)
   - Unique meta description (under 160 chars)
   - OG image (default: /images/brand/og-default.png — create a 1200x630 placeholder)
   - Canonical URL
   - Single h1 tag
   - Logical heading hierarchy (h1 → h2 → h3, no skips)
```

---

### Prompt 12: 404 Page

```
Read these design files — the 404 page has a unique, creative design:
- designs/404_page_desktop/screen.png (full desktop layout)
- designs/404_page_mobile/screen.png (full mobile layout)
- designs/404_page_desktop/code.html (exact Tailwind classes and structure)

Build the 404 page at src/pages/404.astro, matching the design EXACTLY.

IMPORTANT: The 404 page does NOT use SiteLayout. It has its own custom minimal header and a different footer style. This is intentional — the design treats 404 as a "dead end" with reduced navigation.

CUSTOM HEADER (not the standard glassmorphic nav):
- Fixed top, full width, z-50, glass-nav background
- Wider padding: px-8 py-6, max-w-screen-2xl mx-auto
- LEFT: Logo icon (h-8) + "Hari Agritech" text (text-xl font-bold text-primary tracking-tight)
- RIGHT: "System Status: Optimal" — text-xs font-bold uppercase tracking-widest text-on-surface-variant
- NO navigation links, NO CTA button — this is a minimal header

MAIN CONTENT — 2-column bento layout:
- flex-grow flex items-center justify-center, pt-24 pb-12 px-6
- max-w-6xl w-full, grid grid-cols-1 md:grid-cols-12 gap-12 items-center

  LEFT COLUMN (md:col-span-6):
  - "404" — brand-gradient text (gradient clipped to text), text-8xl font-extrabold tracking-tighter opacity-90
  - H1: "Oops! Looks like this field is fallow." where "fallow." is text-primary
    - text-5xl font-extrabold text-on-surface leading-tight tracking-tight
  - Description: "Our autonomous drones searched every hectare, but they couldn't find the page you're looking for. It might have been harvested early or moved to a new plot."
    - text-lg text-on-surface-variant font-medium leading-relaxed max-w-md
  - Two CTA buttons (flex flex-wrap gap-4 pt-4):
    - "Back to the Home Farm" → / — bg-brand-gradient (solid gradient bg), text-on-primary, font-bold, px-8 py-4, rounded-full, hover:scale-105, active:scale-95, shadow-lg shadow-primary/10
    - "Check our Tech" → /technology — bg-surface-container-highest, text-primary, font-bold, px-8 py-4, rounded-full, hover:bg-primary-container/20
  - Two text links below (pt-8 flex items-center gap-8):
    - "VIEW OUR SOLUTIONS" → /solutions — text-sm font-bold text-tertiary uppercase tracking-widest, hover:text-primary, with Material Symbol "agriculture" icon
    - "CONTACT SUPPORT" → /contact — text-sm font-bold text-tertiary uppercase tracking-widest, hover:text-primary, with Material Symbol "support_agent" icon

  RIGHT COLUMN (md:col-span-6) — Illustration with floating chips:
  - Outer container: relative
  - Image card: relative z-10, p-4, bg-surface-container-low, rounded-xl
    - Inner: overflow-hidden rounded-lg aspect-square bg-surface-container-lowest
    - Image: autonomous tractor/harvester in field (use a placeholder farm tech image)

  - FLOATING CHIP 1 (top-right): absolute -top-6 -right-6 z-20
    - bg-surface-container-highest p-4 rounded-lg shadow-xl
    - Error icon: p-2 bg-error-container rounded-full, Material Symbol "error" text-error (FILL 1)
    - "DRONE STATUS" label (text-[10px] font-bold uppercase tracking-widest text-on-surface-variant)
    - "GPS Signal Lost" value (text-sm font-bold text-on-surface)

  - FLOATING CHIP 2 (bottom-left): absolute -bottom-4 -left-8 z-20
    - bg-surface-container-lowest p-5 rounded-lg shadow-2xl max-w-[200px]
    - Green dot (w-2 h-2 rounded-full bg-primary) + "SENSOR DATA" label
    - "Seed missing in Sector 7G. Re-routing harvester to base camp..." (text-xs font-medium text-tertiary)

  - DECORATIVE BLURS:
    - absolute top-1/2 -right-12: w-24 h-24 bg-brand-gradient opacity-10 rounded-full blur-3xl
    - absolute bottom-0 -left-12: w-48 h-48 bg-primary-container opacity-20 rounded-full blur-3xl

CUSTOM FOOTER (different from standard site footer):
- bg-surface-container-low (#F1F5EE), NOT the dark emerald footer
- py-12, flex flex-col md:flex-row justify-between items-center px-12
- LEFT: "© 2024 Hari Agritech. Rooted in Innovation." — text-xs uppercase tracking-widest text-secondary
- RIGHT: links row — "Privacy Policy", "Terms of Service", "Contact Support", "Status"
  - Each: text-xs uppercase tracking-widest text-tertiary, underline underline-offset-4, hover:text-primary

MOBILE (from designs/404_page_mobile/screen.png):
- Image/illustration at top (smaller, centered)
- "404: Lost in the Fields." heading (different wording on mobile)
- Description text
- "Return Home" button (brand-gradient, full width)
- "Contact Support" button (secondary, full width)
- "VIEW CROPS" + "ANALYTICS" links
- Footer stacked

Add noindex meta tag. Add subtle FadeIn animations on the content.

This page should feel fun and on-brand — the farming/drone metaphor makes the 404 experience memorable rather than frustrating.
```

---

### Prompt 13: Design QA + View Transitions + Final Polish

```
Read ALL design files one more time, then review every built page's source code. Compare implementation against designs pixel by pixel.

DESIGN REFERENCES:
- designs/homepage_desktop/screen.png + code.html
- designs/homepage_mobile/screen.png
- designs/technology_desktop/screen.png + code.html
- designs/technology_mobile/screen.png
- designs/solutions_farms_desktop/screen.png + code.html
- designs/solutions_farms_mobile/screen.png
- designs/about_us_desktop/screen.png + code.html
- designs/about_us_mobile/screen.png
- designs/contact_us_deskto/screen.png + code.html
- designs/contact_us_mobile/screen.png
- designs/404_page_desktop/screen.png + code.html
- designs/404_page_mobile/screen.png
- designs/terra_modern/DESIGN.md (design system rules)

DESIGN FIDELITY CHECKLIST — for EACH page, verify against its design:
- [ ] Section order matches exactly
- [ ] Section backgrounds match (surface vs surface-container-low vs gradient vs dark)
- [ ] Typography: font sizes, weights, letter-spacing, line-heights match
- [ ] Colors: text colors, background colors, accent colors, gradient usage
- [ ] Card styles: border-radius (rounded-xl), padding (p-8), shadows, border (outline-variant/15), hover states
- [ ] Button styles: brand-gradient primary, secondary variant, rounded-full vs rounded-lg
- [ ] Spacing: section py-24, card gap-8, editorial gap-16
- [ ] Header: glassmorphic, fixed, correct nav items, logo, CTA button
- [ ] Footer: light bg-surface-container-low (#F1F5EE), 2-column (logo+copyright left, links+social right), normal-case text-sm
- [ ] Icons: using Material Symbols Outlined where the design uses them
- [ ] Label styling: uppercase, tracking-widest, text-xs, font-bold, correct color per section

FIX every discrepancy. The designs (especially the code.html exports) are the source of truth.

DESIGN SYSTEM RULES (from DESIGN.md) — verify these are followed:
- [ ] No 1px solid borders used for sectioning (use background shifts)
- [ ] Surface hierarchy used correctly for depth
- [ ] No pure black (#000) — using on-surface (#191D19) instead
- [ ] Brand gradient only on large surfaces: hero CTAs, CTA banners, stats bars
- [ ] Glassmorphism on header (and contact form card)
- [ ] Ambient shadows only (Y:8px, Blur:24px, on-surface at 6% opacity) — no heavy drop shadows

Then complete the polish:

1. Enable View Transitions:
   - Add ViewTransitions import from 'astro:transitions' to BaseLayout.astro <head>
   - Smooth cross-fade page transitions site-wide
   - Add transition:name to logo and nav for morph effects between pages

2. Verify all animations:
   - [ ] Scroll fade-in on every section (not just some)
   - [ ] Stagger on card grids (100ms between cards)
   - [ ] Counter animations on stat numbers
   - [ ] Hover effects: cards (bg shift), icons (scale), images (scale), buttons (brightness)
   - [ ] Header stays glassmorphic throughout scroll
   - [ ] View Transitions work between pages
   - [ ] prefers-reduced-motion disables ALL animations

3. Responsive QA — compare against mobile designs:
   - [ ] 375px — compare with designs/*_mobile/screen.png
   - [ ] 390px (iPhone 14)
   - [ ] 768px (iPad)
   - [ ] 1024px (iPad landscape)
   - [ ] 1440px — compare with designs/*_desktop/screen.png
   - [ ] No horizontal scroll at any breakpoint
   - [ ] Touch targets > 44px on mobile
   - [ ] Mobile menu works correctly

4. Accessibility:
   - [ ] Skip-to-content link in SiteLayout
   - [ ] All images have descriptive alt text
   - [ ] All interactive elements keyboard-accessible with visible focus indicators
   - [ ] Color contrast passes WCAG AA (check on-surface-variant on surface backgrounds)
   - [ ] Form labels linked to inputs
   - [ ] ARIA labels on nav, hamburger button, form

5. Performance:
   - [ ] No unnecessary JS shipped (should be near-zero for content pages)
   - [ ] All images use Astro <Image> component
   - [ ] Fonts loaded with display:swap
   - [ ] Hero images priority-loaded
   - [ ] Above-the-fold content renders without JS

6. Content:
   - [ ] All pages read content from Keystatic (no hardcoded text in .astro files)
   - [ ] Placeholder content is realistic HariLeaf content
   - [ ] All internal links work
   - [ ] 404 page renders correctly at /nonexistent-url
```

---

### Prompt 14: AI Smart Contact Form

```
Upgrade the contact form on the Contact page (/contact) with AI-powered smart triage using Claude API.

Read the existing contact form first — it was built in Prompt 10 matching designs/contact_us_deskto/screen.png. The form has these fields:
- Full Name (text, required)
- Email Address (email, required)
- Subject (select: General Inquiry, Partnership Opportunities, Technical Support, Media & Press)
- Your Message (textarea, required)
- Send Inquiry button (brand-gradient / #7FC8BA, rounded-lg)
- Cloudflare Turnstile bot protection widget

NOW UPGRADE IT:

1. Create a Cloudflare Pages Function at src/pages/api/contact.ts:
   - Export async function POST(context) for Astro API route
   - Accept POST body: { name, email, subject, message, turnstileToken }
   
   STEP A — Validate Turnstile:
   - POST to https://challenges.cloudflare.com/turnstile/v0/siteverify
   - Body: { secret: env.TURNSTILE_SECRET_KEY, response: turnstileToken }
   - If validation fails → return 403 with error
   
   STEP B — Call Claude API to analyze the inquiry:
   - Use @anthropic-ai/sdk (import Anthropic from '@anthropic-ai/sdk')
   - Initialize: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
   - Use model: 'claude-sonnet-4-20250514' (fast, cost-effective for triage)
   - System prompt:
     ```
     You are the AI inquiry assistant for HariLeaf AgriTech, a precision agriculture technology company based in Singapore.
     
     HariLeaf's products and services:
     - Norra™: Autonomous aerial surveillance drone fleet for crop health mapping, nitrogen level detection, and irrigation needs assessment across large-scale farms
     - SoilPulse™: Subterranean IoT sensor mesh measuring pH, moisture, microbial activity, and nutrient levels at root depth
     - Intelligent Hydration: AI-driven water management system that optimizes irrigation to match natural rainfall patterns, reducing water waste by up to 40%
     - FleetGuardian: Autonomous fleet management for farm equipment coordination
     - Digital Greenhouse Platform: Unified dashboard for managing global farm networks with AI-powered yield forecasting and adaptive learning
     
     HariLeaf operates in 30+ countries, managing 2.4M+ hectares of farmland with 400+ partner farms.
     
     Analyze the incoming inquiry and respond with ONLY valid JSON (no markdown, no code fences):
     {
       "classification": "partnership" | "technical-inquiry" | "sales" | "research" | "media" | "careers" | "general",
       "details": {
         "farm_type": "string or null",
         "farm_size": "string or null",
         "crop": "string or null",
         "region": "string or null",
         "product_interest": ["Norra™", "SoilPulse™", "Intelligent Hydration", "FleetGuardian", "Digital Greenhouse Platform"] or [],
         "key_concern": "string or null"
       },
       "urgency": "low" | "medium" | "high",
       "acknowledgment": "A warm, personalized 2-3 sentence response that references what they specifically asked about. Mention relevant HariLeaf products if applicable. End with an assurance about follow-up timing."
     }
     ```
   - User message: "Name: {name}\nEmail: {email}\nSubject: {subject}\nMessage: {message}"
   - Set max_tokens: 500
   - Parse the JSON response
   
   STEP C — Submit to Web3Forms (or Resend) with enriched data:
   - POST to https://api.web3forms.com/submit
   - Include: original fields + AI classification + extracted details + urgency level
   - Subject line: "[{urgency}] [{classification}] New inquiry from {name}"
   - This ensures the team receives enriched, categorized inquiries
   
   STEP D — Return response:
   - Success: { success: true, acknowledgment: "AI-generated personalized message" }
   - If Claude API fails: { success: true, acknowledgment: "Thank you for reaching out, {name}. We've received your inquiry and our team will review it shortly. Expect a response within 24 hours." }
   - If Turnstile fails: { success: false, error: "Bot verification failed" }
   - NEVER expose error details to the user

2. Install @anthropic-ai/sdk:
   - Run: npm install @anthropic-ai/sdk

3. Update the ContactForm component (src/components/forms/ContactForm.astro):
   - Change from plain HTML form submission to JavaScript fetch():
     - Prevent default form submit
     - Collect form data
     - POST to /api/contact as JSON
     - Handle response
   - LOADING STATE: 
     - Disable submit button
     - Button text changes to "Analyzing your inquiry..." with a subtle pulse animation
     - Form fields become readonly
   - SUCCESS STATE (smooth transition):
     - Form fades out (opacity 0, transform scale-95, transition 300ms)
     - Success card fades in with:
       - Checkmark icon (Material Symbol "check_circle" in text-primary, large size)
       - The AI-generated personalized acknowledgment message displayed in text-lg font-medium
       - "Our team will follow up within 24 hours." subtext in text-on-surface-variant
       - Subtle brand-gradient top border or left accent on the success card
       - "Send another message" link to reset the form
     - Style the success card to match HariLeaf design system:
       - bg-surface-container-lowest, rounded-xl, p-8 md:p-12, shadow-sm
       - The acknowledgment text in text-on-surface, leading-relaxed
   - ERROR STATE:
     - Show generic success message (never show errors to users)
     - Log errors to console for debugging
   - Keep Turnstile widget — reset it on form reset
   - All form behavior in an inline <script> tag (no React needed)

4. Graceful degradation — this is critical:
   - If ANTHROPIC_API_KEY is not set: skip Claude API call entirely, submit to Web3Forms directly, show generic thank-you
   - If Claude API times out (set 5-second timeout): proceed with Web3Forms submission, show generic thank-you
   - If Claude API returns invalid JSON: use generic acknowledgment, still submit to Web3Forms
   - If Web3Forms fails: still show success to user (the AI acknowledgment), log error server-side
   - The form ALWAYS succeeds from the user's perspective

5. Environment variables needed (document in .env.example):
   ANTHROPIC_API_KEY=          # Claude API key for smart contact form triage
   TURNSTILE_SECRET_KEY=       # Cloudflare Turnstile server-side secret
   PUBLIC_TURNSTILE_SITE_KEY=  # Cloudflare Turnstile client-side key
   WEB3FORMS_API_KEY=          # Web3Forms access key for form submission

6. The contact form must still LOOK identical to the design — the glass-form card styling, field layout, button treatment, "Reach Us Directly" sidebar all remain unchanged. The AI upgrade is purely behavioral.
```

---

### Prompt 15: GitHub Repository + Push Code

```
Set up the GitHub repository and push ALL code:

1. Create GitHub configuration files:

   .github/workflows/ci.yml:
   - name: CI
   - Trigger: pull_request to main
   - Jobs: build (runs-on: ubuntu-latest)
   - Steps: checkout → setup Node 20 → npm ci → npx astro check → npm run build
   - Purpose: validate TypeScript + build on every PR

   .github/workflows/deploy.yml:
   - name: Deploy to Cloudflare Pages
   - Trigger: push to main
   - Jobs: deploy (runs-on: ubuntu-latest)
   - Steps: checkout → setup Node 20 → npm ci → npm run build → deploy
   - Deploy step uses cloudflare/wrangler-action@v3:
     command: pages deploy dist --project-name=${{ secrets.CLOUDFLARE_PROJECT_NAME }}
   - Secrets needed: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_PROJECT_NAME

   .github/PULL_REQUEST_TEMPLATE.md:
   ## Purpose
   Brief description of changes.
   ## Type of Change
   - [ ] Feature
   - [ ] Bug Fix
   - [ ] Content Update
   - [ ] Infrastructure
   ## Checklist
   - [ ] Build passes locally (`npm run build`)
   - [ ] Responsive tested (375, 768, 1024, 1440px)
   - [ ] Content from CMS (no hardcoded text)
   - [ ] No console errors
   - [ ] Accessibility checked

   .github/CODEOWNERS:
   * @your-username

2. Add .nvmrc:
   20

3. Ensure .gitignore includes:
   node_modules/
   dist/
   .astro/
   .wrangler/
   .env
   .env.local
   .env.production
   .DS_Store
   *.log

4. Create .env.example:
   # === Cloudflare Turnstile (bot protection for contact form) ===
   PUBLIC_TURNSTILE_SITE_KEY=
   TURNSTILE_SECRET_KEY=

   # === Web3Forms (contact form email delivery) ===
   WEB3FORMS_API_KEY=

   # === Anthropic Claude API (AI smart contact form triage) ===
   ANTHROPIC_API_KEY=

   # === Keystatic GitHub Mode (production CMS editing — add later) ===
   KEYSTATIC_GITHUB_CLIENT_ID=
   KEYSTATIC_GITHUB_CLIENT_SECRET=
   KEYSTATIC_SECRET=

5. Push to GitHub:
   - Initialize git if needed: git init
   - Stage all files: git add -A
   - Commit: git commit -m "feat: HariLeaf AgriTech website — Astro + Keystatic + Tailwind, all pages, AI contact form"
   - Create GitHub repo: gh repo create harileaf-website --public --source=. --remote=origin --push
   - If repo exists already: git remote add origin <url> && git push -u origin main
   - Verify: gh repo view --web

6. After push, confirm:
   - All files visible on GitHub
   - .env is NOT in the repo (gitignored)
   - CI workflow triggers on next PR
```

---

### Prompt 16: Cloudflare Pages — Deploy Live

```
Deploy the HariLeaf website to Cloudflare Pages:

1. Verify local build succeeds:
   - npm run build
   - Confirm dist/ directory is generated with no errors

2. Install Wrangler CLI (if not installed):
   - npm install -g wrangler

3. Authenticate with Cloudflare:
   - wrangler login (opens browser for OAuth)

4. Create Cloudflare Pages project:
   - wrangler pages project create harileaf-website --production-branch=main

5. First manual deploy:
   - npm run build && wrangler pages deploy dist --project-name=harileaf-website
   - This deploys to: harileaf-website.pages.dev
   - Verify the URL loads correctly in browser

6. Connect GitHub for automatic deploys:
   - Go to: Cloudflare dashboard → Pages → harileaf-website → Settings → Builds & deployments
   - Connect to Git → GitHub → Authorize → Select harileaf-website repo
   - Build settings:
     - Build command: npm run build
     - Build output directory: dist
     - Root directory: / (default)
   - Environment variable: NODE_VERSION = 20

7. Set environment variables in Cloudflare Pages dashboard (Settings → Environment Variables):

   Production:
   - NODE_VERSION = 20
   - PUBLIC_TURNSTILE_SITE_KEY = (from Cloudflare Turnstile dashboard)
   - TURNSTILE_SECRET_KEY = (from Turnstile — mark as Encrypted)
   - WEB3FORMS_API_KEY = (from web3forms.com — mark as Encrypted)
   - ANTHROPIC_API_KEY = (your Claude API key — mark as Encrypted)

   Add later for Keystatic GitHub mode:
   - KEYSTATIC_GITHUB_CLIENT_ID
   - KEYSTATIC_GITHUB_CLIENT_SECRET
   - KEYSTATIC_SECRET

8. Set up Cloudflare Turnstile:
   - Cloudflare dashboard → Turnstile → Add site
   - Site name: HariLeaf Website
   - Domains: harileaf-website.pages.dev (add custom domain later)
   - Widget type: Managed
   - Copy Site Key → PUBLIC_TURNSTILE_SITE_KEY
   - Copy Secret Key → TURNSTILE_SECRET_KEY

9. Enable Cloudflare Web Analytics:
   - Cloudflare dashboard → Web Analytics → Add site
   - Select the Pages project — auto-enables, no code changes needed

10. Verify auto-deploy:
    - Make a small change locally (add a comment to any file)
    - git add -A && git commit -m "test: verify auto deploy" && git push
    - Watch Cloudflare Pages dashboard for new deployment
    - Verify harileaf-website.pages.dev updates

Print summary:
- Live URL: harileaf-website.pages.dev
- Cloudflare dashboard URL
- GitHub repo URL
- Environment variables still needing values
```

---

### Prompt 17: Custom Domain + DNS + Email

```
Connect a custom domain and set up email for the HariLeaf website.

DOMAIN SETUP:

1. Add domain to Cloudflare:
   - Cloudflare dashboard → Add a site → Enter domain (e.g., harileaf.com or harileaf.ag)
   - Select Free plan
   - Cloudflare scans existing DNS records
   - Note the two nameservers provided (e.g., ada.ns.cloudflare.com, bob.ns.cloudflare.com)

2. Update nameservers at registrar:
   - Log into registrar (GoDaddy, Namecheap, Porkbun, etc.)
   - Replace nameservers with Cloudflare's
   - DNS propagation: usually under 1 hour, max 24 hours

3. Connect domain to Cloudflare Pages:
   - Pages → harileaf-website → Custom domains → Add custom domain
   - Add: yourdomain.com
   - Add: www.yourdomain.com
   - Cloudflare auto-creates CNAME records
   - SSL auto-provisions (1-5 minutes)

4. SSL/TLS configuration:
   - Cloudflare → SSL/TLS → Set to "Full (strict)"
   - Enable "Always Use HTTPS"
   - Enable "Automatic HTTPS Rewrites"

5. WWW redirect:
   - Rules → Redirect Rules → Create rule
   - If hostname = www.yourdomain.com → redirect to https://yourdomain.com (301 permanent)

6. Add custom domain to Turnstile:
   - Turnstile dashboard → edit widget → add yourdomain.com to allowed domains

7. Update astro.config.mjs:
   - Change site: 'https://example.com' → site: 'https://yourdomain.com'
   - Commit and push — Cloudflare rebuilds with correct sitemap URLs

EMAIL SETUP (Option A — Free, receive only):

1. Cloudflare → Email → Email Routing → Enable for domain
2. Create routing rules:
   - hello@yourdomain.com → your personal email
   - contact@yourdomain.com → your personal email
   - press@yourdomain.com → your personal email
3. Cloudflare auto-adds MX and TXT DNS records
4. Test: send email to hello@yourdomain.com → verify it arrives

EMAIL UPGRADE (Option B — Free send + receive):
- Keep Cloudflare Email Routing for receiving
- Add Resend (resend.com, free 100/day) for sending
- Add Resend's DNS records (DKIM, SPF, DMARC) in Cloudflare DNS
- Update /api/contact.ts to send via Resend instead of Web3Forms

Verify:
- [ ] https://yourdomain.com loads the HariLeaf website
- [ ] http://yourdomain.com → redirects to https
- [ ] https://www.yourdomain.com → redirects to non-www
- [ ] SSL padlock shows in browser
- [ ] Email: hello@yourdomain.com → arrives in inbox
```

---

### Prompt 18: Go-Live Verification + Production Checklist

```
Run the complete go-live verification for the HariLeaf website. Check EVERY item and fix anything broken.

SITE AVAILABILITY:
- [ ] https://yourdomain.com loads correctly
- [ ] http:// redirects to https://
- [ ] www. redirects to non-www
- [ ] harileaf-website.pages.dev also works
- [ ] SSL certificate valid (padlock in browser)
- [ ] All pages load: /, /technology, /solutions, /farms/{slug}, /about, /contact

CONTENT VERIFICATION:
- [ ] No "lorem ipsum" or placeholder text remaining
- [ ] All images load (no broken images)
- [ ] Company info correct: "HariLeaf AgriTech", Singapore address, hello@harileaf.agri
- [ ] All navigation links work (Technology, Solutions & Farms, About, Contact + Get Started CTA)
- [ ] Footer links work (Privacy Policy, Terms of Service, Contact Us, Sustainability Report)
- [ ] All internal links work
- [ ] 404 page renders at /nonexistent-page — shows bento layout with "fallow" headline, floating chips, custom header

CONTACT FORM (the AI-powered form):
- [ ] Form loads on /contact page
- [ ] Turnstile widget appears
- [ ] Submit with valid data → shows AI-generated personalized response
  - Test with a partnership inquiry: "I manage a 500-hectare vineyard in Napa Valley and I'm interested in your SoilPulse sensors and Norra drone system."
  - The AI response should mention SoilPulse™ and Norra™ specifically
- [ ] Submit with empty required fields → shows HTML5 validation errors
- [ ] Email notification arrives at configured address with AI classification
- [ ] GRACEFUL DEGRADATION: temporarily remove ANTHROPIC_API_KEY from Cloudflare env → submit form → should still succeed with generic thank-you → restore the key

SEO:
- [ ] Every page has unique <title>
- [ ] Every page has meta description (under 160 chars)
- [ ] OG tags present — test with https://www.opengraph.xyz/ for each page
- [ ] Twitter card tags present
- [ ] sitemap-index.xml accessible (or sitemap-0.xml)
- [ ] robots.txt accessible, allows crawling, blocks /keystatic
- [ ] JSON-LD structured data — test with https://search.google.com/test/rich-results
- [ ] Canonical URLs correct
- [ ] /keystatic routes excluded from sitemap

PERFORMANCE:
- [ ] Lighthouse on homepage: Performance > 90, Accessibility > 90, SEO > 90, Best Practices > 90
- [ ] Lighthouse on /technology, /solutions, /about, /contact
- [ ] Images served as WebP/AVIF (check network tab)
- [ ] Minimal JS in network tab (should be near-zero for content pages)
- [ ] Total page weight < 500KB (likely < 200KB with Astro)
- [ ] LCP < 2.5s, CLS < 0.1

RESPONSIVE:
- [ ] Homepage at 375px matches designs/homepage_mobile/screen.png
- [ ] All pages at 375px, 768px, 1024px, 1440px
- [ ] Mobile hamburger menu opens/closes correctly
- [ ] No horizontal scroll at any breakpoint
- [ ] Touch targets > 44px
- [ ] Contact form usable on mobile

DESIGN FIDELITY:
- [ ] Header: glassmorphic, fixed, logo + nav + CTA button
- [ ] Footer: light bg (#F1F5EE), logo + copyright, links + social icons row
- [ ] Hero headlines use italic highlight word pattern
- [ ] Brand gradient used correctly (CTAs, banners, stats bars)
- [ ] Surface hierarchy creates depth (no harsh borders)
- [ ] Manrope font renders everywhere
- [ ] 404 page: custom minimal header (no nav), bento layout, floating drone/sensor chips, light footer (not dark)

SECURITY:
- [ ] Security headers present — check https://securityheaders.com/?q=yourdomain.com
- [ ] No env vars or API keys in page source (View Source, search for "sk-", "key", "secret")
- [ ] /keystatic admin behind auth (not publicly editable without GitHub OAuth)
- [ ] Turnstile protects contact form from bots

CI/CD:
- [ ] Push a change → Cloudflare auto-deploys (watch dashboard)
- [ ] Create a PR → CI workflow runs and passes
- [ ] Preview deploys work on PRs

ANALYTICS:
- [ ] Cloudflare Web Analytics enabled
- [ ] Visit pages → check analytics dashboard shows data

SEARCH ENGINE SUBMISSION:
- [ ] Google Search Console: Add property (yourdomain.com) → verify via DNS → submit sitemap
- [ ] Bing Webmaster Tools: Add site → submit sitemap
- [ ] Test social sharing: paste URL into LinkedIn/Twitter/Facebook → OG card shows correctly

Print final summary:
- Live URL: https://yourdomain.com
- Pages URL: https://harileaf-website.pages.dev
- GitHub: https://github.com/username/harileaf-website
- Cloudflare Dashboard: https://dash.cloudflare.com
- Google Search Console: https://search.google.com/search-console
- Issues found (if any)
```


---

### Prompt Sequence Summary

| # | Prompt | What it builds | Time |
|---|---|---|---|
| 0 | Project Bootstrap | Verify/complete Astro + Keystatic project setup, copy logo assets | 30 min |
| 1 | CMS Schema | Complete Keystatic config with all HariLeaf content types | 1 hour |
| 2 | Design System | Tailwind config matching "Digital Greenhouse" design system exactly | 30 min |
| 3 | Layout + Header + Footer | Glassmorphic header (new nav: Technology, Solutions & Farms, About, Contact), light footer (#F1F5EE), layouts | 1 hour |
| 4 | Block Components | 14+ reusable components: PillBadge (NEW), grid Hero, 4 BentoCard variants, updated CTABanner (no email input) | 2 hours |
| 5 | Animations | Scroll fade-in, stagger, counter, hover effects, reduced-motion | 1 hour |
| 6 | Homepage | "Autonomous Intelligence For The Open Field" — grid hero, bento grid, editorial checklist, gradient CTA | 1.5 hours |
| 7 | Technology Page | "The Digital Greenhouse" — Core Ecosystem bento, Drone-Led Remediation, stats bar | 1.5 hours |
| 8 | Solutions & Farms | "Architecting the Future of Farming" — software ecosystem bento, live telemetry farm cards | 1.5 hours |
| 9 | About Page | "Cultivating a Sustainable Legacy" — mission/vision bento, asymmetric timeline, core values | 1 hour |
| 10 | Contact Page | "Connect with the future of agritech" — glass form, contact info, dark banner | 1 hour |
| 11 | SEO + Structured Data | Meta tags, JSON-LD, sitemap, OG tags, canonical URLs | 45 min |
| 12 | **404 Page** | **"This field is fallow" — bento layout, floating chips, custom header/footer** | **45 min** |
| 13 | Design QA + Polish | Pixel-perfect comparison against all designs, View Transitions, a11y | 1.5 hours |
| 14 | **AI Smart Contact** | **Claude API triage: classify intent, extract farm details, personalized response** | **1 hour** |
| 15 | **GitHub Push** | **Create repo, CI/CD workflows (.github/), push all code** | **30 min** |
| 16 | **Cloudflare Deploy** | **Deploy live, env vars, Turnstile, Web Analytics** | **30 min** |
| 17 | **Domain + Email** | **Custom domain, SSL, DNS, Cloudflare Email Routing** | **30 min** |
| 18 | **Go-Live Verify** | **Production checklist, social sharing test, Search Console** | **30 min** |

**Total: ~17 hours of prompting → complete HariLeaf website LIVE with AI contact form, CI/CD, analytics, email, and SSL.**

Prompts 0-13 build the website. Prompts 14-18 are the "go-live sprint" — they take your built website from localhost to production in ~3 hours.

---

### Tips for using these prompts

1. **Your design PNGs and HTML exports are already in `designs/`.** Every prompt references exact file paths. Claude Code reads both the screenshots (for visual reference) and the HTML files (for exact Tailwind classes and structure).

2. **The HTML exports (`code.html`) are your secret weapon.** They contain the exact Tailwind config, class names, colors, and layout structure from Google Stitch. When Claude Code reads these, it can replicate the design with much higher fidelity than from screenshots alone.

3. **Run prompts in order.** Each builds on the previous. Prompts 0-2 set up infrastructure, 3-5 create the component library, 6-10 build pages, 11-12 polish, 13-17 deploy.

4. **Review output before moving to the next prompt.** Fix issues immediately. If a section doesn't match the design, follow up with: "Read designs/{page}_desktop/code.html and screen.png again. The {section} doesn't match. Fix it."

5. **The "Digital Greenhouse" design rules matter:**
   - No 1px borders (use background color shifts)
   - Glassmorphism on the nav (rgba + backdrop-blur)
   - Brand gradient only on large surfaces
   - Surface hierarchy for depth (surface → surface-container-low → etc.)
   - Manrope font exclusively
   - on-surface (#191D19) instead of pure black

6. **If a prompt is too large for one shot**, split it. Do sections 1-3 first, then sections 4-7. The prompts are structured to allow this.

7. **Replace placeholder content last.** Focus on structure and visual fidelity first. Content can be updated via Keystatic admin.

8. **For the go-live prompts (14-17)**, you'll do some manual steps in browser (Cloudflare dashboard, domain registrar). The prompts tell Claude Code to guide you through each step.

9. **Have these accounts ready before starting Prompt 15:**
   - GitHub account (gh CLI authenticated — run `gh auth status` to verify)
   - Cloudflare account (free — sign up at dash.cloudflare.com)
   - Web3Forms account (free — get API key at web3forms.com)
   - Anthropic API key (for AI contact form — from console.anthropic.com)
   - Your domain registrar login (for DNS nameserver changes in Prompt 16)

10. **After all prompts, run a final QA:**
    ```
    Read ALL design files: designs/homepage_desktop/screen.png, designs/technology_desktop/screen.png, designs/solutions_farms_desktop/screen.png, designs/about_us_desktop/screen.png, designs/contact_us_deskto/screen.png.
    Also read all code.html files for exact Tailwind reference.
    Then review every page's source code. Compare against designs.
    Fix every visual discrepancy: colors, typography, spacing, layout, cards, buttons.
    Also check: broken links, accessibility, performance, mobile responsiveness.
    ```
