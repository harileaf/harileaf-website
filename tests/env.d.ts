/// <reference types="@cloudflare/vitest-pool-workers/types" />

declare namespace Cloudflare {
  interface Env {
    STORE_DB: D1Database;
    HARILEAF_CMS: KVNamespace;
    HARILEAF_MEDIA: R2Bucket;
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
interface Env extends Cloudflare.Env {}
