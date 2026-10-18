import { defineConfig, devices } from '@playwright/test';

/**
 * Storefront end-to-end tests against `astro dev` with local D1 (seeded by
 * e2e/setup-db.mjs before the server starts). Payments run as cash on delivery; Razorpay's hosted
 * checkout is covered by the integration tests with a stubbed API.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // Locally use installed Chrome (Playwright's bundled Chromium doesn't support older macOS); CI uses the bundled one.
  use: { baseURL: 'http://localhost:4321', trace: 'retain-on-failure', ...(process.env.CI ? {} : { channel: 'chrome' }) },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'node e2e/setup-db.mjs && npm run dev', env: { E2E: '1' }, url: 'http://localhost:4321/shop/', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
