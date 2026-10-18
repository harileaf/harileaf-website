import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Runs once per test file, before its tests; each file gets fresh isolated storage.
await applyD1Migrations(env.STORE_DB, env.TEST_MIGRATIONS);
