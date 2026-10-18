/**
 * Claims-policy check for the free-text page content stored in KV (the
 * produce page fields edited at /admin/content). There is no certification
 * context, so "organic" is never allowed; "fresh" is, because the page is
 * about raw produce.
 */
import { RAW_PRODUCE_TERMS, findBannedPhrases } from './claims';

export function contentClaimProblems(fields: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== 'string') continue;
    const banned = findBannedPhrases(v, { organicScheme: 'none', claims: [], mayUseOrganic: false, allowedTerms: RAW_PRODUCE_TERMS });
    if (banned.length) out[k] = banned.join(', ');
  }
  return out;
}
