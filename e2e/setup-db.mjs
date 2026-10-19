// Local D1 for the e2e dev server: apply migrations, seed the sample catalog
// once, and top up stock so runs are repeatable. Runs before `npm run dev`
// (Playwright starts webServer before globalSetup, so it can't live there).
import { execSync } from 'node:child_process';

const run = (args) => execSync(`npx wrangler d1 ${args}`, { stdio: 'pipe', encoding: 'utf8' });
run('migrations apply harileaf-store --local');
const out = run('execute harileaf-store --local --json --command "SELECT count(*) AS n FROM products"');
if (/"n":\s*0\b/.test(out)) run('execute harileaf-store --local --file scripts/seed-dev.sql');
// v2: a buyable perishable (Kesar mango, Mumbai MMR zone enabled); both files are safe to re-run.
run('execute harileaf-store --local --file scripts/seed-v2-produce.sql');
run('execute harileaf-store --local --file scripts/seed-dev-produce.sql');
run(`execute harileaf-store --local --command "UPDATE variants SET stock_qty = 50 WHERE sku IN ('KJ3-5KG', 'KJ3-1KG'); INSERT INTO settings (key, value) VALUES ('min_order_paise', '49900') ON CONFLICT(key) DO UPDATE SET value = excluded.value; INSERT OR IGNORE INTO coupons (code, kind, value, created_at, updated_at) VALUES ('E2ETEN', 'percent', 10, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')"`);
console.log('e2e database ready');
