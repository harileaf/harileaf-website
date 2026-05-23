// @ts-check
import { defineConfig } from 'astro/config';
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
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  site: 'https://harileaf.ag',
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
    optimizeDeps: {
      exclude: ['@keystatic/astro', '@keystatic/core'],
    },
  },
});
