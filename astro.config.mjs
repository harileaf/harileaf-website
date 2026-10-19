// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import keystatic from '@keystatic/astro';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // The dev toolbar covers the mobile sticky bar in e2e runs (playwright.config sets E2E=1).
  devToolbar: { enabled: process.env.E2E !== '1' },
  // output: 'server' keeps Keystatic admin UI alive (SSR) while marketing pages
  // are prerendered via `export const prerender = true` in each .astro file.
  // Data reading in prerendered pages uses direct JSON imports (not createReader)
  // to avoid unenv's lack of fs.readFile during the prerender simulation.
  output: 'server',
  // The app implements its own auth (see src/lib/auth.ts) and never uses Astro's
  // native session API. Explicitly setting a driver stops the Cloudflare adapter
  // from auto-provisioning a `SESSION` KV binding we don't need.
  session: {
    driver: sessionDrivers.lruCache(),
  },
  // Adapter 13 reads bindings from wrangler.toml via @cloudflare/vite-plugin in
  // dev, so the old `platformProxy` option is gone.
  // Images: optimised at build time for prerendered pages (recipes, articles: the
  // 16:9 / 4:3 / 1:1 crops Google wants for Recipe markup), passed through at
  // runtime — no Cloudflare Images binding or per-request transforms.
  adapter: cloudflare({ imageService: 'compile' }),
  site: 'https://harileaf.org',
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap({
      // Only indexable pages: no CMS/admin/API, and none of the noindex store pages
      // (cart, checkout, order and review pages, the outage page).
      filter: (page) =>
        !page.includes('/keystatic') &&
        !page.includes('/api/') &&
        !page.includes('/admin') &&
        !/\/(cart|checkout|order|review|store-unavailable)(\/|$)/.test(new URL(page).pathname),
    }),
    keystatic(),
  ],
  vite: {
    // Versions the edge-cache keys (src/lib/store/edge-cache.ts) so a deploy never serves HTML from the previous build.
    define: { 'import.meta.env.HL_BUILD_ID': JSON.stringify(process.env.GITHUB_SHA?.slice(0, 12) || Date.now().toString(36)) },
    optimizeDeps: {
      exclude: ['@keystatic/astro', '@keystatic/core'],
    },
  },
});
