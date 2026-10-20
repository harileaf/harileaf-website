// @ts-check
// `npm run cms`: the Keystatic admin on its own dev server, in Node. Under the main config the
// Cloudflare adapter runs routes in workerd, which has no access to the repo's files, so Keystatic's
// local storage (it edits src/content/*.json) can't work there. Only the CMS routes are useful here.
import { defineConfig } from 'astro/config';
import keystatic from '@keystatic/astro';
import react from '@astrojs/react';

export default defineConfig({
  output: 'server',
  // No site pages or middleware (they need the Workers runtime): just the routes Keystatic injects.
  srcDir: './.cms',
  integrations: [react(), keystatic()],
  devToolbar: { enabled: false },
  vite: {
    // @keystatic/astro imports its config as a virtual module, so it can't be pre-bundled.
    optimizeDeps: { exclude: ['@keystatic/astro'] },
  },
});
