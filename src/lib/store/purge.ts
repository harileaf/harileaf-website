/** Cache-purge outbox statements shared by catalog and story-page writes. */
import { purgeUrls } from './edge-cache';
import { enqueueStmt } from './outbox';

/**
 * Purge rows for a change: the given paths plus any extra product pages (any
 * of them may show the changed product as "related"), now and again 30 s
 * later — the second purge clears pages that were mid-render during the write.
 */
export function purgeStmts(db: D1Database, paths: string[], at: string, allProductPaths: string[] = []): D1PreparedStatement[] {
  const urls = purgeUrls([...paths, ...allProductPaths]);
  const later = new Date(Date.parse(at) + 30_000).toISOString();
  return [
    enqueueStmt(db, { kind: 'cache.purge', payload: { urls }, at }),
    enqueueStmt(db, { kind: 'cache.purge', payload: { urls }, at, notBefore: later }),
  ];
}
