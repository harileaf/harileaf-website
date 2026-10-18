import { execSync } from 'node:child_process';

/** Local D1: apply migrations, seed the sample catalog once, and top up stock so runs are repeatable. */
export default function globalSetup() {
  const run = (args: string) => execSync(`npx wrangler d1 ${args}`, { stdio: 'pipe', encoding: 'utf8' });
  run('migrations apply harileaf-store --local');
  const out = run('execute harileaf-store --local --json --command "SELECT count(*) AS n FROM products"');
  if (/"n":\s*0\b/.test(out)) run('execute harileaf-store --local --file scripts/seed-dev.sql');
  run(`execute harileaf-store --local --command "UPDATE variants SET stock_qty = 50 WHERE sku = 'KJ3-5KG'; INSERT INTO settings (key, value) VALUES ('min_order_paise', '49900') ON CONFLICT(key) DO UPDATE SET value = excluded.value"`);
}
