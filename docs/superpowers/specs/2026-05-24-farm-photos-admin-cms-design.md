# Farm Photos + Admin CMS — Design Spec

**Date:** 2026-05-24  
**Branch target:** `feat/farm-photos-admin-cms`  
**Status:** Approved

---

## Overview

Two coupled features:

1. **Farm photo strip** on `/produce` — a cinematic horizontal marquee showing real crop photos, powered by dynamically fetched data
2. **Admin CMS at `/admin`** — passphrase-gated dashboard for uploading photos, editing the produce catalogue, and editing produce page text. No rebuild required; changes go live instantly.

---

## Architecture

### Infrastructure additions (Cloudflare)

| Resource | Type | Purpose |
|----------|------|---------|
| `harileaf-media` | R2 bucket | Stores uploaded farm photos |
| `HARILEAF_CMS` | KV namespace | Stores produce catalogue JSON, page text JSON, active session tokens |
| `ADMIN_PASSPHRASE` | Secret env var | Hashed passphrase for admin login |

### Worker API routes (not prerendered)

All routes live under `/api/*`. The Astro config adds a server endpoint file for each, handled by the existing Cloudflare Workers adapter.

| Method | Route | Auth required | Purpose |
|--------|-------|--------------|---------|
| `POST` | `/api/auth` | No | Verify passphrase, issue session cookie |
| `DELETE` | `/api/auth` | Yes | Logout — delete session from KV |
| `GET` | `/api/photos` | No | List all photos (key, label, url) from R2 |
| `POST` | `/api/photos` | Yes | Upload photo + label to R2 |
| `DELETE` | `/api/photos/[key]` | Yes | Delete photo from R2 |
| `GET` | `/api/produce` | No | Get produce catalogue array from KV |
| `PUT` | `/api/produce` | Yes | Overwrite produce catalogue in KV |
| `GET` | `/api/content` | No | Get produce page text fields from KV |
| `PUT` | `/api/content` | Yes | Overwrite produce page text in KV |

### Session auth flow

1. Admin submits passphrase to `POST /api/auth`
2. Worker computes `SHA-256(passphrase)` and compares to `SHA-256(ADMIN_PASSPHRASE)` (constant-time compare)
3. On match: generate a UUID v4 session token, store in KV with 7-day TTL, set as `session=<token>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800` cookie
4. On mismatch: return `401`
5. Every protected API route reads the `session` cookie, validates against KV, returns `401` if missing or expired

### Produce page — hybrid rendering

The page keeps `export const prerender = true` for SEO. Two sections change:

- **Bento catalogue** — rendered server-side from KV at build time as a fallback; the client JS overwrites it with a fresh fetch from `/api/produce` on load. If fetch fails, the statically rendered fallback remains visible.
- **Photo strip** — fully client-rendered. Hidden by default; revealed once `/api/photos` returns data. If no photos exist, section is not shown.

The hero, organic promise banner, and bulk order form remain fully static.

---

## Feature 1 — Photo Strip ("From Our Farm")

### Placement
Between the bento catalogue section and the `#bulk-request` form section.

### Visual design
- Background: `#0c110c` (matches bento section)
- Section header: `text-xs uppercase tracking-widest` label "From Our Farm" + `text-3xl font-extrabold` headline "Growing in the open."
- Marquee: single row of photo cards, CSS `animation: marquee-scroll` infinite linear, paused on `prefers-reduced-motion` and on hover
- Cards: `280px × 380px`, `border-radius: 12px`, `overflow: hidden`, slight `3deg` tilt on hover using the existing tilt interaction from `interactions.ts`
- Photo overlay: bottom gradient `rgba(0,0,0,0)→rgba(0,0,0,0.65)`, label text `text-sm font-bold text-white`
- Duplicate the photo array once in DOM to create seamless loop

### Data shape (from `/api/photos`)
```json
[
  { "key": "mango-alphonso-01.jpg", "label": "Alphonso Mango", "url": "https://pub-xxx.r2.dev/mango-alphonso-01.jpg" }
]
```

### Empty state
Section not rendered if array is empty or fetch fails.

---

## Feature 2 — Admin Dashboard (`/admin`)

### Route
`src/pages/admin.astro` — `export const prerender = false`. Server-rendered on every request.

On load: Worker reads `session` cookie, validates against KV. If invalid → renders login view. If valid → renders dashboard view.

### Login view
- Full-screen dark surface (`bg-surface`)
- Centered card: HariLeaf logo, site name, single `<input type="password">` labelled "Passphrase", submit button styled with `brand-gradient`
- On submit: `POST /api/auth` via `fetch`. On success: page reloads (now authenticated). On fail: inline error "Incorrect passphrase."
- No username field. No "forgot password" link.

### Dashboard view

Three tabs: **Photos**, **Produce**, **Content**. Tab bar uses `text-primary` active indicator, matching site token.

#### Tab 1 — Photos

- **Upload area:** Dashed border card, drag-and-drop or click-to-browse. Accepts `image/jpeg`, `image/png`, `image/webp`. Max 8 MB per file.
- **Label field:** Text input shown alongside each file before upload. Required.
- **Upload button:** `POST /api/photos` with `multipart/form-data` (file + label).
- **Photo grid:** 3-column responsive grid of existing photos. Each card shows thumbnail, label, and a delete icon button (`DELETE /api/photos/:key`). Optimistic UI — remove card immediately, restore on error.
- **Progress:** Upload shows inline progress bar using `XMLHttpRequest` upload events.

#### Tab 2 — Produce

- **Item list:** Each item is a row — emoji text input (single char), name input, category input, seasonal checkbox, drag handle, delete button.
- **Add item:** "Add produce" button appends an empty row.
- **Reorder:** Drag-and-drop via HTML5 drag events (no external lib).
- **Save:** Single "Save Changes" button at bottom. `PUT /api/produce` with full updated array. Shows success / error toast.

Produce item schema:
```json
{
  "emoji": "🥭",
  "name": "Alphonso Mango",
  "category": "Fruit",
  "seasonal": true
}
```

#### Tab 3 — Content

Simple form fields mapping to produce page text:

| Field | Edits |
|-------|-------|
| Hero badge | "HariLeaf Farm · Organic Produce" label |
| Hero headline line 1 | "From the earth," |
| Hero headline line 2 | "directly to you." |
| Hero subtitle | paragraph below headline |
| Catalogue headline | "Everything we grow" |
| Photo strip headline | "Growing in the open." |
| Organic promise headline | "Everything we grow is 100% organic..." |

Save: `PUT /api/content`. Same toast pattern as Produce tab.

### Admin UI design tokens
Same Tailwind tokens as the rest of the site. No separate design system. Admin-specific additions:
- Tab active state: `border-b-2 border-primary text-primary`
- Toast: fixed bottom-right, `bg-surface-container-high rounded-xl px-5 py-3 shadow-xl`, auto-dismiss 3s
- Delete confirm: inline text swap ("Delete?" → "Confirm" / "Cancel"), no modal

---

## Data Schemas

### KV key structure

| KV key | Value |
|--------|-------|
| `produce:catalogue` | JSON array of produce items |
| `content:produce-page` | JSON object of text fields |
| `session:<uuid>` | `"valid"` string with 7-day TTL |

### R2 object naming
`photos/<timestamp>-<sanitised-filename>` — e.g. `photos/1716527432-mango-alphonso.jpg`

R2 bucket configured with public access. Photos served from R2 public URL directly (no Worker proxy needed for reads).

---

## wrangler.toml additions

```toml
[[kv_namespaces]]
binding = "HARILEAF_CMS"
id = "<to be filled after `wrangler kv:namespace create`>"

[[r2_buckets]]
binding = "HARILEAF_MEDIA"
bucket_name = "harileaf-media"
```

---

## Error handling

- API fetch failures on produce page: silently fall back to statically rendered content
- Photo upload >8 MB: client-side validation, show error before request
- Session expired mid-session: next API call returns 401 → dashboard shows "Session expired, please log in again" and reloads login view
- R2 delete failure: restore card to grid, show toast "Delete failed"

---

## Out of scope

- Multiple admin users / roles
- Image resizing or format conversion (serve originals from R2)
- Bulk order form produce chips (managed via Produce tab — chips auto-sync from catalogue)
- Analytics or audit log for admin actions
- `/admin` route protection at the Cloudflare WAF level (passphrase is sufficient for personal use)
