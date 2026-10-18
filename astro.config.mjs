// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import keystatic from '@keystatic/astro';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
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
  adapter: cloudflare(),
  site: 'https://harileaf.org',
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap({
      // Exclude CMS admin UI and API routes from the public sitemap
      filter: (page) =>
        !page.includes('/keystatic') &&
        !page.includes('/api/') &&
        !page.includes('/admin'),
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
