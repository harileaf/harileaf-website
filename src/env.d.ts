/// <reference types="astro/client" />

interface Env {
  HARILEAF_CMS: KVNamespace;
  HARILEAF_MEDIA: R2Bucket;
  ADMIN_PASSPHRASE: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
