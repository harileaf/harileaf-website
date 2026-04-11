import { createReader } from '@keystatic/core/reader';
import config from '../../keystatic.config';

/**
 * Keystatic reader instance.
 *
 * Usage:
 *   import { reader } from '@/lib/keystatic';
 *
 *   // Read a singleton
 *   const settings = await reader.singletons.siteSettings.read();
 *   const homepage = await reader.singletons.homepage.read();
 *
 *   // Read a collection entry
 *   const farm = await reader.collections.farmProfiles.read('farm-slug');
 *
 *   // List all entries in a collection
 *   const farmSlugs = await reader.collections.farmProfiles.list();
 *
 *   // Read all entries in a collection
 *   const farms = await reader.collections.farmProfiles.all();
 *
 *   // Resolve linked files (e.g. document fields) eagerly
 *   const farmWithBody = await reader.collections.farmProfiles.read('farm-slug', {
 *     resolveLinkedFiles: true,
 *   });
 */
export const reader = createReader(process.cwd(), config);

// Re-export Entry type helper for typed content
export type {
  Entry,
  EntryWithResolvedLinkedFiles,
} from '@keystatic/core/reader';
