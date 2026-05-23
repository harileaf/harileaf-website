/// <reference types="astro/client" />

interface Env {
  HARILEAF_CMS: KVNamespace;
  HARILEAF_MEDIA: R2Bucket;
  ADMIN_PASSPHRASE: string;
  SESSION: KVNamespace;
}

declare module 'cloudflare:workers' {
  const env: Env;
  export { env };
}

type Runtime = import('@astrojs/cloudflare').Runtime;

declare namespace App {
  interface Locals extends Runtime {}
}
