# Farm Photos + Admin CMS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a farm photo marquee to the produce page and a passphrase-protected `/admin` dashboard for uploading photos and editing the produce catalogue and page text — all changes go live instantly via Cloudflare R2 + KV.

**Architecture:** The Astro site is already in `output: 'server'` mode with the Cloudflare adapter and `platformProxy` enabled. New API routes live under `src/pages/api/`. The produce page stays prerendered for SEO; two sections (photo strip, bento catalogue) hydrate client-side from the API. The admin dashboard is SSR and gated by a session cookie validated against KV.

**Tech Stack:** Astro 6, Cloudflare Workers, Cloudflare R2 (photos), Cloudflare KV (produce data + sessions), Tailwind CSS (existing tokens), Web Crypto API (SHA-256 passphrase hash, UUID session tokens)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/env.d.ts` | Cloudflare binding TypeScript types |
| Create | `src/lib/auth.ts` | Session validation helper |
| Create | `src/lib/cms.ts` | KV/R2 read/write helpers |
| Create | `src/lib/cms-types.ts` | Shared TS types (Photo, ProduceItem, ContentFields) |
| Create | `src/pages/api/auth.ts` | POST /api/auth, DELETE /api/auth |
| Create | `src/pages/api/photos/index.ts` | GET /api/photos, POST /api/photos |
| Create | `src/pages/api/photos/[key].ts` | DELETE /api/photos/:key |
| Create | `src/pages/api/produce.ts` | GET /api/produce, PUT /api/produce |
| Create | `src/pages/api/content.ts` | GET /api/content, PUT /api/content |
| Create | `src/components/produce/PhotoStrip.astro` | Marquee photo strip component |
| Modify | `src/pages/produce.astro` | Add PhotoStrip; make bento data-driven |
| Create | `src/pages/admin.astro` | Full admin dashboard (login + 3 tabs) |
| Modify | `wrangler.toml` | Add KV namespace + R2 bucket bindings |
| Modify | `astro.config.mjs` | Exclude /admin from sitemap |

---

## Task 1: Provision Cloudflare R2 + KV (run once)

**Files:**
- Modify: `wrangler.toml`

> Run these commands in the project root. They create real Cloudflare resources — you need to be logged in (`wrangler login`).

- [ ] **Step 1: Create the R2 bucket**

```bash
npx wrangler r2 bucket create harileaf-media
```

Expected output:
```
Created bucket 'harileaf-media'
```

- [ ] **Step 2: Enable public access on the R2 bucket**

In the Cloudflare dashboard → R2 → `harileaf-media` → Settings → Public Access → Allow. Copy the public URL (looks like `https://pub-<hash>.r2.dev`). You'll need it in Step 4.

- [ ] **Step 3: Create the KV namespace**

```bash
npx wrangler kv namespace create HARILEAF_CMS
```

Expected output (copy the `id` value):
```
{ binding = "HARILEAF_CMS", id = "abc123..." }
```

- [ ] **Step 4: Update wrangler.toml**

Replace the existing `wrangler.toml` content with this (fill in the KV `id` from Step 3 and the R2 public URL from Step 2):

```toml
name = "harileaf"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

routes = [
  { pattern = "harileaf.org", custom_domain = true },
  { pattern = "www.harileaf.org", custom_domain = true }
]

[assets]
directory = "./dist/client"

[[kv_namespaces]]
binding = "HARILEAF_CMS"
id = "<paste-id-from-step-3>"

[[r2_buckets]]
binding = "HARILEAF_MEDIA"
bucket_name = "harileaf-media"

[vars]
R2_PUBLIC_BASE = "https://pub-<your-hash>.r2.dev"
```

- [ ] **Step 5: Set the admin passphrase secret**

```bash
npx wrangler secret put ADMIN_PASSPHRASE
```

Enter your chosen passphrase when prompted. It is stored encrypted in Cloudflare — never in code.

- [ ] **Step 6: Commit wrangler.toml**

```bash
git add wrangler.toml
git commit -m "chore: add R2 + KV bindings to wrangler.toml"
```

---

## Task 2: TypeScript types + Cloudflare env declaration

**Files:**
- Create: `src/env.d.ts`
- Create: `src/lib/cms-types.ts`

- [ ] **Step 1: Create `src/env.d.ts`**

```typescript
/// <reference types="astro/client" />

interface Env {
  HARILEAF_CMS: KVNamespace;
  HARILEAF_MEDIA: R2Bucket;
  ADMIN_PASSPHRASE: string;
  R2_PUBLIC_BASE: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
```

- [ ] **Step 2: Create `src/lib/cms-types.ts`**

```typescript
export interface Photo {
  key: string;      // R2 object key, e.g. "photos/1716527432-mango.jpg"
  label: string;   // Display name, e.g. "Alphonso Mango"
  url: string;     // Full public R2 URL
}

export interface ProduceItem {
  emoji: string;
  name: string;
  category: string;
  seasonal: boolean;
}

export interface ContentFields {
  heroBadge: string;
  heroLine1: string;
  heroLine2: string;
  heroSubtitle: string;
  catalogueHeadline: string;
  photoStripHeadline: string;
  organicPromiseHeadline: string;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error|warning" | head -20
```

Expected: no new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/env.d.ts src/lib/cms-types.ts
git commit -m "chore: add Cloudflare env types and CMS type definitions"
```

---

## Task 3: Auth + CMS helpers

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/cms.ts`

- [ ] **Step 1: Create `src/lib/auth.ts`**

```typescript
import type { AstroCookies } from 'astro';

const SESSION_COOKIE = 'hl_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassphrase(
  submitted: string,
  stored: string
): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(submitted), sha256(stored)]);
  // Constant-time compare via lengths first then char codes
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(kv: KVNamespace): Promise<string> {
  const token = crypto.randomUUID();
  await kv.put(`session:${token}`, 'valid', {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return token;
}

export async function validateSession(
  kv: KVNamespace,
  cookies: AstroCookies
): Promise<boolean> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const value = await kv.get(`session:${token}`);
  return value === 'valid';
}

export async function deleteSession(
  kv: KVNamespace,
  cookies: AstroCookies
): Promise<void> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await kv.delete(`session:${token}`);
}

export function setSessionCookie(cookies: AstroCookies, token: string): void {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

export { SESSION_COOKIE };
```

- [ ] **Step 2: Create `src/lib/cms.ts`**

```typescript
import type { Photo, ProduceItem, ContentFields } from './cms-types';

const PRODUCE_KEY = 'produce:catalogue';
const CONTENT_KEY = 'content:produce-page';

// ── Photos ────────────────────────────────────────────────

export async function listPhotos(
  kv: KVNamespace,
  r2PublicBase: string
): Promise<Photo[]> {
  const raw = await kv.get('photos:index');
  if (!raw) return [];
  const keys: Array<{ key: string; label: string }> = JSON.parse(raw);
  return keys.map(({ key, label }) => ({
    key,
    label,
    url: `${r2PublicBase}/${key}`,
  }));
}

export async function addPhoto(
  kv: KVNamespace,
  r2: R2Bucket,
  r2PublicBase: string,
  file: File,
  label: string
): Promise<Photo> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const key = `photos/${Date.now()}-${safeLabel}.${ext}`;
  await r2.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  const existing = await listPhotos(kv, r2PublicBase);
  const updated = [...existing.map(({ key: k, label: l }) => ({ key: k, label: l })), { key, label }];
  await kv.put('photos:index', JSON.stringify(updated));
  return { key, label, url: `${r2PublicBase}/${key}` };
}

export async function deletePhoto(
  kv: KVNamespace,
  r2: R2Bucket,
  r2PublicBase: string,
  key: string
): Promise<void> {
  await r2.delete(key);
  const existing = await listPhotos(kv, r2PublicBase);
  const updated = existing
    .filter((p) => p.key !== key)
    .map(({ key: k, label: l }) => ({ key: k, label: l }));
  await kv.put('photos:index', JSON.stringify(updated));
}

// ── Produce ───────────────────────────────────────────────

export const DEFAULT_PRODUCE: ProduceItem[] = [
  { emoji: '🥭', name: 'Heritage Mangoes', category: 'Fruit', seasonal: true },
  { emoji: '🍉', name: 'Watermelon', category: 'Fruit', seasonal: true },
  { emoji: '🍈', name: 'Chicoo', category: 'Fruit', seasonal: false },
  { emoji: '🍈', name: 'Papaya', category: 'Fruit', seasonal: false },
  { emoji: '🍋', name: 'Lemon', category: 'Fruit', seasonal: false },
  { emoji: '🐉', name: 'Dragon Fruit', category: 'Fruit', seasonal: false },
  { emoji: '🫐', name: 'Black Jamun', category: 'Fruit', seasonal: true },
  { emoji: '🍈', name: 'Muskmelon', category: 'Fruit', seasonal: true },
  { emoji: '🍈', name: 'Laxman Fruit', category: 'Fruit', seasonal: false },
  { emoji: '🫛', name: 'Okra', category: 'Vegetable', seasonal: false },
  { emoji: '🌿', name: 'Methi', category: 'Herb', seasonal: false },
  { emoji: '🌱', name: 'Cilantro', category: 'Herb', seasonal: false },
  { emoji: '🎋', name: 'Red Amaranth', category: 'Vegetable', seasonal: false },
  { emoji: '🫘', name: 'Chavli (Cow Pea)', category: 'Vegetable', seasonal: false },
  { emoji: '🥔', name: 'Suran (Elephant Foot)', category: 'Vegetable', seasonal: false },
  { emoji: '🌻', name: 'Marigold', category: 'Flower', seasonal: true },
  { emoji: '🌹', name: 'Roses', category: 'Flower', seasonal: false },
  { emoji: '🪷', name: 'Lilies', category: 'Flower', seasonal: true },
];

export async function getProduce(kv: KVNamespace): Promise<ProduceItem[]> {
  const raw = await kv.get(PRODUCE_KEY);
  return raw ? JSON.parse(raw) : DEFAULT_PRODUCE;
}

export async function putProduce(
  kv: KVNamespace,
  items: ProduceItem[]
): Promise<void> {
  await kv.put(PRODUCE_KEY, JSON.stringify(items));
}

// ── Content ───────────────────────────────────────────────

export const DEFAULT_CONTENT: ContentFields = {
  heroBadge: 'HariLeaf Farm · Organic Produce',
  heroLine1: 'From the earth,',
  heroLine2: 'directly to you.',
  heroSubtitle:
    '18 varieties of fruits, vegetables, herbs and flowers — all organically grown on our farm, available for bulk orders.',
  catalogueHeadline: 'Everything we grow',
  photoStripHeadline: 'Growing in the open.',
  organicPromiseHeadline: 'Everything we grow is 100% organic. No chemicals, ever.',
};

export async function getContent(kv: KVNamespace): Promise<ContentFields> {
  const raw = await kv.get(CONTENT_KEY);
  return raw ? JSON.parse(raw) : DEFAULT_CONTENT;
}

export async function putContent(
  kv: KVNamespace,
  fields: ContentFields
): Promise<void> {
  await kv.put(CONTENT_KEY, JSON.stringify(fields));
}
```

- [ ] **Step 3: Build to check types**

```bash
npm run build 2>&1 | grep -i "error" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts src/lib/cms.ts
git commit -m "feat: add auth session helpers and CMS KV/R2 helpers"
```

---

## Task 4: Auth API endpoint

**Files:**
- Create: `src/pages/api/auth.ts`

- [ ] **Step 1: Create `src/pages/api/auth.ts`**

```typescript
import type { APIRoute } from 'astro';
import {
  verifyPassphrase,
  createSession,
  deleteSession,
  setSessionCookie,
  clearSessionCookie,
} from '../../lib/auth';

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const { env } = locals.runtime;
  let passphrase: string;

  try {
    const body = await request.json() as { passphrase?: string };
    passphrase = body.passphrase ?? '';
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const valid = await verifyPassphrase(passphrase, env.ADMIN_PASSPHRASE);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Incorrect passphrase' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = await createSession(env.HARILEAF_CMS);
  setSessionCookie(cookies, token);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ locals, cookies }) => {
  const { env } = locals.runtime;
  await deleteSession(env.HARILEAF_CMS, cookies);
  clearSessionCookie(cookies);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Build to check types**

```bash
npm run build 2>&1 | grep -i "error" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/auth.ts
git commit -m "feat: add POST/DELETE /api/auth endpoint"
```

---

## Task 5: Photo API endpoints

**Files:**
- Create: `src/pages/api/photos/index.ts`
- Create: `src/pages/api/photos/[key].ts`

- [ ] **Step 1: Create `src/pages/api/photos/index.ts`**

```typescript
import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth';
import { listPhotos, addPhoto } from '../../../lib/cms';

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  const photos = await listPhotos(env.HARILEAF_CMS, env.R2_PUBLIC_BASE);
  return new Response(JSON.stringify(photos), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const { env } = locals.runtime;

  if (!(await validateSession(env.HARILEAF_CMS, cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const form = await request.formData();
  const file = form.get('file');
  const label = (form.get('label') as string | null) ?? '';

  if (!(file instanceof File) || !label.trim()) {
    return new Response(JSON.stringify({ error: 'file and label are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (file.size > 8 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'File exceeds 8 MB limit' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const photo = await addPhoto(
    env.HARILEAF_CMS,
    env.HARILEAF_MEDIA,
    env.R2_PUBLIC_BASE,
    file,
    label.trim()
  );

  return new Response(JSON.stringify(photo), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Create `src/pages/api/photos/[key].ts`**

```typescript
import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth';
import { deletePhoto } from '../../../lib/cms';

export const DELETE: APIRoute = async ({ params, locals, cookies }) => {
  const { env } = locals.runtime;

  if (!(await validateSession(env.HARILEAF_CMS, cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // params.key is URL-encoded; decode before use
  const key = decodeURIComponent(params.key ?? '');
  if (!key.startsWith('photos/')) {
    return new Response(JSON.stringify({ error: 'Invalid key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await deletePhoto(env.HARILEAF_CMS, env.HARILEAF_MEDIA, env.R2_PUBLIC_BASE, key);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 3: Build to check types**

```bash
npm run build 2>&1 | grep -i "error" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/photos/
git commit -m "feat: add GET/POST /api/photos and DELETE /api/photos/:key"
```

---

## Task 6: Produce + Content API endpoints

**Files:**
- Create: `src/pages/api/produce.ts`
- Create: `src/pages/api/content.ts`

- [ ] **Step 1: Create `src/pages/api/produce.ts`**

```typescript
import type { APIRoute } from 'astro';
import { validateSession } from '../../lib/auth';
import { getProduce, putProduce } from '../../lib/cms';
import type { ProduceItem } from '../../lib/cms-types';

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  const items = await getProduce(env.HARILEAF_CMS);
  return new Response(JSON.stringify(items), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request, locals, cookies }) => {
  const { env } = locals.runtime;

  if (!(await validateSession(env.HARILEAF_CMS, cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let items: ProduceItem[];
  try {
    items = await request.json() as ProduceItem[];
    if (!Array.isArray(items)) throw new Error('Expected array');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await putProduce(env.HARILEAF_CMS, items);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Create `src/pages/api/content.ts`**

```typescript
import type { APIRoute } from 'astro';
import { validateSession } from '../../lib/auth';
import { getContent, putContent } from '../../lib/cms';
import type { ContentFields } from '../../lib/cms-types';

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  const fields = await getContent(env.HARILEAF_CMS);
  return new Response(JSON.stringify(fields), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request, locals, cookies }) => {
  const { env } = locals.runtime;

  if (!(await validateSession(env.HARILEAF_CMS, cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let fields: ContentFields;
  try {
    fields = await request.json() as ContentFields;
    if (typeof fields !== 'object' || fields === null) throw new Error('Expected object');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await putContent(env.HARILEAF_CMS, fields);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | grep -i "error" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/produce.ts src/pages/api/content.ts
git commit -m "feat: add GET/PUT /api/produce and GET/PUT /api/content"
```

---

## Task 7: PhotoStrip component

**Files:**
- Create: `src/components/produce/PhotoStrip.astro`

This component renders its skeleton server-side and is hydrated client-side. It is hidden until photos load.

- [ ] **Step 1: Create `src/components/produce/PhotoStrip.astro`**

```astro
---
interface Props {
  headline?: string;
}
const { headline = 'Growing in the open.' } = Astro.props;
---

<style>
  @keyframes marquee-scroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }

  .photo-track {
    display: flex;
    gap: 16px;
    width: max-content;
    animation: marquee-scroll 30s linear infinite;
  }

  .photo-track:hover,
  .photo-track:focus-within {
    animation-play-state: paused;
  }

  @media (prefers-reduced-motion: reduce) {
    .photo-track { animation: none; }
  }

  .photo-card {
    width: 280px;
    height: 380px;
    border-radius: 12px;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
    transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .photo-card:hover {
    transform: rotate(1.5deg) scale(1.02);
  }

  .photo-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .photo-label {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 32px 16px 16px;
    background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
    color: white;
    font-size: 0.875rem;
    font-weight: 700;
  }
</style>

<section
  id="photo-strip-section"
  style="background:#0c110c; overflow:hidden; display:none;"
  aria-label="Farm photos"
>
  <div class="max-w-7xl mx-auto px-6 pt-14 pb-6">
    <p class="text-xs uppercase tracking-widest font-bold mb-2" style="color:rgba(159,177,125,0.7);">From Our Farm</p>
    <h2 id="photo-strip-headline" class="text-3xl font-extrabold tracking-tight mb-10" style="color:#f0f0ee;">{headline}</h2>
  </div>

  <div style="overflow:hidden; padding-bottom:48px;">
    <div class="photo-track" id="photo-track" aria-live="polite">
      <!-- Cards injected by client script -->
    </div>
  </div>
</section>

<script>
  async function initPhotoStrip() {
    const res = await fetch('/api/photos');
    if (!res.ok) return;
    const photos: Array<{ key: string; label: string; url: string }> = await res.json();
    if (!photos.length) return;

    const track = document.getElementById('photo-track');
    const section = document.getElementById('photo-strip-section');
    if (!track || !section) return;

    // Build cards (doubled for seamless loop)
    const doubled = [...photos, ...photos];
    track.innerHTML = doubled
      .map(
        (p) => `
        <div class="photo-card">
          <img src="${p.url}" alt="${p.label}" loading="lazy" />
          <div class="photo-label">${p.label}</div>
        </div>`
      )
      .join('');

    section.style.display = 'block';

    // Fetch and apply headline from content API
    const contentRes = await fetch('/api/content');
    if (contentRes.ok) {
      const content = await contentRes.json();
      const headlineEl = document.getElementById('photo-strip-headline');
      if (headlineEl && content.photoStripHeadline) {
        headlineEl.textContent = content.photoStripHeadline;
      }
    }
  }

  initPhotoStrip();
</script>
```

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | grep -i "error" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/components/produce/PhotoStrip.astro
git commit -m "feat: add PhotoStrip marquee component"
```

---

## Task 8: Update produce.astro

**Files:**
- Modify: `src/pages/produce.astro`
- Modify: `astro.config.mjs`

The produce page adds the PhotoStrip between the bento section and the bulk order form, and adds client-side JS to hydrate the bento catalogue from `/api/produce`.

- [ ] **Step 1: Import PhotoStrip in produce.astro**

In `src/pages/produce.astro`, add the import after the existing imports:

```astro
import PhotoStrip from '../components/produce/PhotoStrip.astro';
```

- [ ] **Step 2: Add an id to the bento grid container for JS targeting**

Find the line:
```astro
<div class="grid grid-cols-12 gap-2">
```

Change it to:
```astro
<div class="grid grid-cols-12 gap-2" id="bento-grid">
```

- [ ] **Step 3: Insert PhotoStrip between bento section and bulk-request form**

Find the comment line `<!-- ══════════════════════════════════════════════════════` that precedes the `EXPRESS INTEREST FORM` section. Insert directly above it:

```astro
  <PhotoStrip />
```

- [ ] **Step 4: Add client-side bento hydration script**

At the very end of the file, just before the closing `</SiteLayout>` tag, add:

```astro
<script>
  // Hydrate bento catalogue from KV — falls back to static HTML if fetch fails
  async function hydrateBento() {
    const res = await fetch('/api/produce');
    if (!res.ok) return;
    const items: Array<{ emoji: string; name: string; category: string; seasonal: boolean }> =
      await res.json();
    if (!items.length) return;

    // Also fetch page text
    const contentRes = await fetch('/api/content');
    const content = contentRes.ok ? await contentRes.json() : {};

    // Update catalogue headline if set
    const headlineEl = document.querySelector('#bento-grid')?.previousElementSibling?.querySelector('h2');
    if (headlineEl && content.catalogueHeadline) {
      headlineEl.textContent = content.catalogueHeadline;
    }

    // Re-render bento grid with KV items
    const grid = document.getElementById('bento-grid');
    if (!grid) return;

    // Only replace if data meaningfully differs (item count changed)
    const staticCount = grid.querySelectorAll('.bento-card').length;
    const kvCount = items.length;
    if (staticCount === kvCount) return; // No change — avoid flash

    const html = items
      .map(
        (item) => `
      <div class="col-span-6 md:col-span-3">
        <div class="bento-card relative overflow-hidden rounded-xl p-4 flex flex-col justify-between border"
             style="min-height:110px; background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.07);">
          <div class="organic-dot absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full"
               style="background:#9fb17d;box-shadow:0 0 6px rgba(159,177,125,0.6);" aria-hidden="true"></div>
          <div class="text-3xl" aria-hidden="true">${item.emoji}</div>
          <div>
            <p class="text-sm font-bold" style="color:#f0f0ee;">${item.name}</p>
            <p class="text-xs mt-0.5" style="color:rgba(240,240,238,0.38);">${item.category}${item.seasonal ? ' · Seasonal' : ''}</p>
          </div>
        </div>
      </div>`
      )
      .join('');

    grid.innerHTML = html;
  }

  hydrateBento();
</script>
```

- [ ] **Step 5: Exclude /admin from sitemap**

In `astro.config.mjs`, update the sitemap filter:

```javascript
sitemap({
  filter: (page) =>
    !page.includes('/keystatic') &&
    !page.includes('/api/') &&
    !page.includes('/admin'),
}),
```

- [ ] **Step 6: Build and verify produce page renders**

```bash
npm run build 2>&1 | tail -5
```

Expected: `[build] Complete!` with `/produce/index.html` in the output list.

- [ ] **Step 7: Commit**

```bash
git add src/pages/produce.astro astro.config.mjs
git commit -m "feat: add PhotoStrip to produce page and client-side bento hydration"
```

---

## Task 9: Admin dashboard — login + shell

**Files:**
- Create: `src/pages/admin.astro`

This is a large file. Build it in steps. Start with the server-side auth check, login view, and tab shell — tab content is empty divs for now.

- [ ] **Step 1: Create `src/pages/admin.astro` — server shell + login view**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { validateSession } from '../lib/auth';

const { env } = Astro.locals.runtime;
const authenticated = await validateSession(env.HARILEAF_CMS, Astro.cookies);
---

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin — HariLeaf</title>
  <link rel="icon" href="/favicon.ico" />
  <link rel="stylesheet" href="/src/styles/global.css" />
  <meta name="robots" content="noindex, nofollow" />
</head>
<body class="bg-surface text-on-surface min-h-screen">

{!authenticated ? (
  <!-- ── Login view ─────────────────────────────────────── -->
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <img src="/images/brand/logo-color.png" alt="HariLeaf" class="h-10 mx-auto mb-4" />
        <h1 class="text-2xl font-extrabold tracking-tight text-on-surface">Admin Dashboard</h1>
        <p class="text-on-surface-variant text-sm mt-1">Enter your passphrase to continue</p>
      </div>

      <div class="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8">
        <div class="space-y-4">
          <div>
            <label for="passphrase" class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
              Passphrase
            </label>
            <input
              id="passphrase"
              type="password"
              placeholder="••••••••••••"
              autocomplete="current-password"
              class="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/40 focus:border-primary focus:outline-none text-on-surface transition-all"
            />
          </div>
          <p id="login-error" class="text-error text-sm hidden">Incorrect passphrase. Try again.</p>
          <button
            id="login-btn"
            class="w-full brand-gradient text-on-primary font-bold py-3 rounded-full hover:opacity-90 transition-opacity"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  </div>

) : (
  <!-- ── Dashboard view ────────────────────────────────── -->
  <div class="max-w-5xl mx-auto px-6 py-10">

    <!-- Header -->
    <div class="flex items-center justify-between mb-10">
      <div class="flex items-center gap-3">
        <img src="/images/brand/logo-color.png" alt="HariLeaf" class="h-8" />
        <span class="text-xl font-bold text-primary">Admin</span>
      </div>
      <button id="logout-btn" class="text-sm text-on-surface-variant hover:text-error transition-colors font-medium">
        Sign out
      </button>
    </div>

    <!-- Tab bar -->
    <div class="flex gap-1 border-b border-outline-variant mb-8" role="tablist">
      {['Photos', 'Produce', 'Content'].map((tab, i) => (
        <button
          role="tab"
          data-tab={tab.toLowerCase()}
          class={`tab-btn px-5 py-3 text-sm font-bold transition-colors ${i === 0 ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-on-surface border-b-2 border-transparent'}`}
        >
          {tab}
        </button>
      ))}
    </div>

    <!-- Tab panels -->
    <div id="tab-photos"   class="tab-panel"></div>
    <div id="tab-produce"  class="tab-panel hidden"></div>
    <div id="tab-content"  class="tab-panel hidden"></div>

  </div>
)}

<script>
  // ── Login ──────────────────────────────────────────────
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');
  const passphraseInput = document.getElementById('passphrase') as HTMLInputElement | null;

  loginBtn?.addEventListener('click', async () => {
    const passphrase = passphraseInput?.value ?? '';
    loginBtn.textContent = 'Signing in…';
    loginBtn.setAttribute('disabled', '');

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    });

    if (res.ok) {
      window.location.reload();
    } else {
      loginError?.classList.remove('hidden');
      loginBtn.textContent = 'Sign In';
      loginBtn.removeAttribute('disabled');
    }
  });

  passphraseInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn?.click();
  });

  // ── Logout ─────────────────────────────────────────────
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    window.location.reload();
  });

  // ── Tab switching ──────────────────────────────────────
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.remove('border-primary', 'text-primary');
        b.classList.add('border-transparent', 'text-on-surface-variant');
      });
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));

      btn.classList.add('border-primary', 'text-primary');
      btn.classList.remove('border-transparent', 'text-on-surface-variant');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.remove('hidden');
    });
  });
</script>

</body>
</html>
```

- [ ] **Step 2: Build and verify /admin route exists**

```bash
npm run build 2>&1 | grep -E "admin|error" | head -10
```

Expected: no errors. The `/admin` route should be listed as a server-rendered route (not in the static HTML output list).

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin.astro
git commit -m "feat: add /admin route with login view and tab shell"
```

---

## Task 10: Admin — Photos tab

**Files:**
- Modify: `src/pages/admin.astro` (replace `<div id="tab-photos">` content)

The photos tab needs upload area + photo grid. Add this as an inline `<script>` that renders into `#tab-photos` after DOM load.

- [ ] **Step 1: Add Photos tab initialiser to the `<script>` block in admin.astro**

Find the closing `</script>` tag in admin.astro. Insert this before it:

```typescript
  // ── Photos tab ─────────────────────────────────────────
  async function initPhotosTab() {
    const panel = document.getElementById('tab-photos');
    if (!panel) return;

    panel.innerHTML = `
      <div class="space-y-8">

        <!-- Upload -->
        <div class="border-2 border-dashed border-outline-variant/40 rounded-2xl p-8 text-center" id="drop-zone">
          <p class="text-on-surface-variant text-sm mb-4">Drag &amp; drop a photo, or click to browse</p>
          <input type="file" id="file-input" accept="image/jpeg,image/png,image/webp" class="hidden" />
          <div class="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
            <input type="text" id="photo-label" placeholder="Crop name (e.g. Alphonso Mango)"
              class="flex-1 bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <button id="browse-btn"
              class="brand-gradient text-on-primary text-sm font-bold px-5 py-2 rounded-full hover:opacity-90 transition-opacity whitespace-nowrap">
              Choose File
            </button>
          </div>
          <p id="selected-file" class="text-xs text-on-surface-variant mt-3"></p>
          <div id="upload-progress" class="hidden mt-4 bg-outline-variant/20 rounded-full h-1.5">
            <div id="upload-bar" class="bg-primary h-1.5 rounded-full transition-all" style="width:0%"></div>
          </div>
          <button id="upload-btn" class="hidden mt-4 brand-gradient text-on-primary text-sm font-bold px-8 py-2 rounded-full hover:opacity-90">
            Upload
          </button>
          <p id="upload-error" class="hidden text-error text-sm mt-2"></p>
        </div>

        <!-- Photo grid -->
        <div>
          <h3 class="text-sm font-bold uppercase tracking-widest text-on-surface-variant mb-4">Uploaded Photos</h3>
          <div id="photo-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            <p class="col-span-full text-on-surface-variant text-sm">Loading…</p>
          </div>
        </div>
      </div>
    `;

    let selectedFile: File | null = null;

    async function loadPhotos() {
      const grid = document.getElementById('photo-grid')!;
      const res = await fetch('/api/photos');
      const photos: Array<{ key: string; label: string; url: string }> = res.ok ? await res.json() : [];

      if (!photos.length) {
        grid.innerHTML = '<p class="col-span-full text-on-surface-variant text-sm">No photos yet.</p>';
        return;
      }

      grid.innerHTML = photos.map((p) => `
        <div class="relative group rounded-xl overflow-hidden aspect-[3/4] bg-surface-container-low" data-key="${p.key}">
          <img src="${p.url}" alt="${p.label}" class="w-full h-full object-cover" loading="lazy" />
          <div class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
            <div class="p-3 w-full translate-y-4 group-hover:translate-y-0 transition-transform opacity-0 group-hover:opacity-100">
              <p class="text-white text-xs font-bold truncate mb-2">${p.label}</p>
              <button data-key="${p.key}" class="delete-photo-btn text-xs font-bold text-error bg-surface/80 px-3 py-1 rounded-full">Delete</button>
            </div>
          </div>
        </div>
      `).join('');

      grid.querySelectorAll<HTMLButtonElement>('.delete-photo-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.textContent = 'Deleting…';
          btn.setAttribute('disabled', '');
          const key = btn.dataset.key!;
          const card = grid.querySelector(`[data-key="${key}"]`);
          card?.remove();
          const res = await fetch(`/api/photos/${encodeURIComponent(key)}`, { method: 'DELETE' });
          if (!res.ok) {
            loadPhotos(); // restore on failure
            showToast('Delete failed', 'error');
          }
        });
      });
    }

    document.getElementById('browse-btn')?.addEventListener('click', () => {
      (document.getElementById('file-input') as HTMLInputElement).click();
    });

    document.getElementById('file-input')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        const err = document.getElementById('upload-error')!;
        err.textContent = 'File exceeds 8 MB limit.';
        err.classList.remove('hidden');
        return;
      }
      selectedFile = file;
      document.getElementById('selected-file')!.textContent = file.name;
      document.getElementById('upload-btn')?.classList.remove('hidden');
      document.getElementById('upload-error')?.classList.add('hidden');
    });

    document.getElementById('upload-btn')?.addEventListener('click', async () => {
      const label = (document.getElementById('photo-label') as HTMLInputElement).value.trim();
      if (!selectedFile || !label) {
        const err = document.getElementById('upload-error')!;
        err.textContent = 'Please select a file and enter a crop name.';
        err.classList.remove('hidden');
        return;
      }

      const form = new FormData();
      form.append('file', selectedFile);
      form.append('label', label);

      const progressBar = document.getElementById('upload-bar')!;
      document.getElementById('upload-progress')?.classList.remove('hidden');

      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          progressBar.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
        }
      });

      xhr.addEventListener('load', () => {
        document.getElementById('upload-progress')?.classList.add('hidden');
        progressBar.style.width = '0%';
        if (xhr.status === 201) {
          selectedFile = null;
          document.getElementById('selected-file')!.textContent = '';
          (document.getElementById('photo-label') as HTMLInputElement).value = '';
          document.getElementById('upload-btn')?.classList.add('hidden');
          (document.getElementById('file-input') as HTMLInputElement).value = '';
          showToast('Photo uploaded');
          loadPhotos();
        } else {
          const err = document.getElementById('upload-error')!;
          err.textContent = 'Upload failed. Try again.';
          err.classList.remove('hidden');
        }
      });

      xhr.open('POST', '/api/photos');
      xhr.send(form);
    });

    loadPhotos();
  }

  if (document.getElementById('tab-photos')) initPhotosTab();
```

- [ ] **Step 2: Add toast helper before the closing `</script>` tag**

```typescript
  // ── Toast ──────────────────────────────────────────────
  function showToast(message: string, type: 'success' | 'error' = 'success') {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-bold transition-opacity';
    toast.style.background = type === 'error' ? 'var(--md-sys-color-error-container, #ffcdd2)' : 'var(--md-sys-color-surface-container-high, #2a2a2a)';
    toast.style.color = type === 'error' ? 'var(--md-sys-color-on-error-container, #c00)' : 'var(--md-sys-color-on-surface, #f0f0ee)';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2700);
  }
```

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | grep -i "error" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin.astro
git commit -m "feat: admin Photos tab — upload, progress, delete, photo grid"
```

---

## Task 11: Admin — Produce tab

**Files:**
- Modify: `src/pages/admin.astro`

- [ ] **Step 1: Add Produce tab initialiser to the `<script>` block in admin.astro, before `</script>`**

```typescript
  // ── Produce tab ────────────────────────────────────────
  async function initProduceTab() {
    const panel = document.getElementById('tab-produce');
    if (!panel) return;

    let items: Array<{ emoji: string; name: string; category: string; seasonal: boolean }> = [];

    const res = await fetch('/api/produce');
    if (res.ok) items = await res.json();

    function renderList() {
      panel!.innerHTML = `
        <div class="space-y-6">
          <p class="text-on-surface-variant text-sm">Add, remove, or edit produce items. Changes are saved when you click Save.</p>
          <div id="produce-list" class="space-y-2"></div>
          <button id="add-produce-btn" class="text-sm font-bold text-primary hover:underline">+ Add produce</button>
          <div class="flex items-center gap-4 pt-4 border-t border-outline-variant/30">
            <button id="save-produce-btn" class="brand-gradient text-on-primary font-bold px-8 py-3 rounded-full hover:opacity-90 transition-opacity">
              Save Changes
            </button>
            <p id="produce-save-status" class="text-sm text-on-surface-variant hidden"></p>
          </div>
        </div>
      `;

      const list = document.getElementById('produce-list')!;

      function renderRows() {
        list.innerHTML = items.map((item, i) => `
          <div class="flex items-center gap-2 bg-surface-container-low rounded-xl px-4 py-3" data-idx="${i}">
            <input type="text" value="${item.emoji}" data-field="emoji" maxlength="2"
              class="w-12 text-center text-xl bg-transparent border border-outline-variant/20 rounded-lg p-1 focus:outline-none focus:ring-1 focus:ring-primary/40" />
            <input type="text" value="${item.name}" data-field="name"
              class="flex-1 bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/40" />
            <input type="text" value="${item.category}" data-field="category" placeholder="Category"
              class="w-28 bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/40" />
            <label class="flex items-center gap-1 text-xs text-on-surface-variant whitespace-nowrap">
              <input type="checkbox" data-field="seasonal" ${item.seasonal ? 'checked' : ''}
                class="accent-primary" />
              Seasonal
            </label>
            <button data-delete="${i}" class="text-error text-xs font-bold hover:underline ml-2">✕</button>
          </div>
        `).join('');

        // Sync changes back to items array
        list.querySelectorAll<HTMLInputElement>('input[data-field]').forEach((input) => {
          input.addEventListener('input', (e) => {
            const row = (e.target as HTMLElement).closest('[data-idx]') as HTMLElement;
            const idx = parseInt(row.dataset.idx!);
            const field = (e.target as HTMLInputElement).dataset.field!;
            if (field === 'seasonal') {
              items[idx].seasonal = (e.target as HTMLInputElement).checked;
            } else {
              (items[idx] as Record<string, unknown>)[field] = (e.target as HTMLInputElement).value;
            }
          });
        });

        list.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((btn) => {
          btn.addEventListener('click', () => {
            items.splice(parseInt(btn.dataset.delete!), 1);
            renderRows();
          });
        });
      }

      renderRows();

      document.getElementById('add-produce-btn')?.addEventListener('click', () => {
        items.push({ emoji: '🌿', name: '', category: 'Other', seasonal: false });
        renderRows();
      });

      document.getElementById('save-produce-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('save-produce-btn')!;
        const status = document.getElementById('produce-save-status')!;
        btn.setAttribute('disabled', '');
        btn.textContent = 'Saving…';

        const res = await fetch('/api/produce', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(items),
        });

        btn.removeAttribute('disabled');
        btn.textContent = 'Save Changes';
        status.classList.remove('hidden');
        if (res.ok) {
          status.textContent = 'Saved!';
          status.style.color = 'var(--md-sys-color-primary, #196a5e)';
          showToast('Produce list saved');
        } else {
          status.textContent = 'Save failed.';
          status.style.color = 'var(--md-sys-color-error, #c00)';
          showToast('Save failed', 'error');
        }
        setTimeout(() => status.classList.add('hidden'), 3000);
      });
    }

    renderList();
  }

  if (document.getElementById('tab-produce')) initProduceTab();
```

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | grep -i "error" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin.astro
git commit -m "feat: admin Produce tab — add/edit/delete/save produce items"
```

---

## Task 12: Admin — Content tab

**Files:**
- Modify: `src/pages/admin.astro`

- [ ] **Step 1: Add Content tab initialiser to the `<script>` block in admin.astro, before `</script>`**

```typescript
  // ── Content tab ────────────────────────────────────────
  async function initContentTab() {
    const panel = document.getElementById('tab-content');
    if (!panel) return;

    const res = await fetch('/api/content');
    const content = res.ok ? await res.json() : {};

    const fields: Array<{ key: string; label: string; multiline?: boolean }> = [
      { key: 'heroBadge',              label: 'Hero badge text' },
      { key: 'heroLine1',              label: 'Hero headline — line 1' },
      { key: 'heroLine2',              label: 'Hero headline — line 2' },
      { key: 'heroSubtitle',           label: 'Hero subtitle', multiline: true },
      { key: 'catalogueHeadline',      label: 'Catalogue section headline' },
      { key: 'photoStripHeadline',     label: 'Photo strip headline' },
      { key: 'organicPromiseHeadline', label: 'Organic promise headline', multiline: true },
    ];

    panel.innerHTML = `
      <div class="space-y-6 max-w-2xl">
        <p class="text-on-surface-variant text-sm">Edit text fields on the produce page. Changes go live instantly.</p>
        ${fields.map((f) => `
          <div class="space-y-2">
            <label class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">${f.label}</label>
            ${f.multiline
              ? `<textarea data-key="${f.key}" rows="3"
                   class="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
                 >${content[f.key] ?? ''}</textarea>`
              : `<input type="text" data-key="${f.key}" value="${content[f.key] ?? ''}"
                   class="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40" />`
            }
          </div>
        `).join('')}
        <div class="flex items-center gap-4 pt-4 border-t border-outline-variant/30">
          <button id="save-content-btn" class="brand-gradient text-on-primary font-bold px-8 py-3 rounded-full hover:opacity-90 transition-opacity">
            Save Changes
          </button>
          <p id="content-save-status" class="text-sm text-on-surface-variant hidden"></p>
        </div>
      </div>
    `;

    document.getElementById('save-content-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('save-content-btn')!;
      const status = document.getElementById('content-save-status')!;
      btn.setAttribute('disabled', '');
      btn.textContent = 'Saving…';

      const updated: Record<string, string> = {};
      panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-key]').forEach((el) => {
        updated[el.dataset.key!] = el.value;
      });

      const res = await fetch('/api/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });

      btn.removeAttribute('disabled');
      btn.textContent = 'Save Changes';
      status.classList.remove('hidden');
      if (res.ok) {
        status.textContent = 'Saved!';
        status.style.color = 'var(--md-sys-color-primary, #196a5e)';
        showToast('Content saved');
      } else {
        status.textContent = 'Save failed.';
        status.style.color = 'var(--md-sys-color-error, #c00)';
        showToast('Save failed', 'error');
      }
      setTimeout(() => status.classList.add('hidden'), 3000);
    });
  }

  if (document.getElementById('tab-content')) initContentTab();
```

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | grep -i "error" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin.astro
git commit -m "feat: admin Content tab — edit and save produce page text fields"
```

---

## Task 13: Final verification + deploy

- [ ] **Step 1: Full build**

```bash
npm run build 2>&1 | tail -6
```

Expected: `[build] Complete!` with no errors.

- [ ] **Step 2: Local preview with Cloudflare bindings**

Start the dev server with Wrangler proxy (bindings available locally):

```bash
npm run dev
```

Visit `http://localhost:4321/admin` — login view should appear.
Visit `http://localhost:4321/produce` — produce page should load.
Visit `http://localhost:4321/api/photos` — should return `[]`.

> For full binding testing (actual R2/KV reads/writes), use `wrangler dev` instead of `npm run dev`. The `platformProxy` config enables bindings in `npm run dev` but with an in-memory KV stub. True R2 writes require `wrangler dev`.

- [ ] **Step 3: Deploy**

```bash
npm run build && npx wrangler deploy
```

- [ ] **Step 4: Smoke test production**

- `https://harileaf.org/admin` → Login form appears
- Enter passphrase → Dashboard loads with 3 tabs
- Photos tab → Upload a photo → Verify it appears in the grid
- Visit `https://harileaf.org/produce` → Photo strip appears after upload
- Produce tab → Edit an item name → Save → Reload produce page → Bento reflects change
- Content tab → Change photo strip headline → Save → Reload produce page → Headline updated
- Sign out → Redirects back to login

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: post-deploy corrections from smoke test"
```
