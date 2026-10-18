/**
 * Claims policy (spec: "Compliance → Claims policy").
 *
 * - Certification wording comes only from `organicCopy()`, and only when the
 *   product has a scheme AND a certificate number.
 * - Every process claim must carry an evidence note.
 * - Some phrases are banned outright. "Organic" is allowed only when
 *   organicCopy() says so (scheme + certificate). The FSSAI Reg 4 terms —
 *   natural, fresh, pure, traditional, authentic, genuine, real, original —
 *   are allowed only when a process claim with that code carries evidence.
 * - Disease / health claims are always flagged (FSSAI Advertising & Claims
 *   Regulations 2018).
 */

export type OrganicScheme = 'none' | 'pgs_green' | 'pgs_organic' | 'npop';

export interface ProcessClaim {
  code: string;
  text: string;
  evidence_note: string;
}

export interface OrganicCopy {
  certificationLine: string | null;
  mayUseOrganic: boolean;
  badge: Exclude<OrganicScheme, 'none'> | null;
}

const NO_CLAIM: OrganicCopy = { certificationLine: null, mayUseOrganic: false, badge: null };

export function organicCopy(p: {
  organicScheme: OrganicScheme;
  conversionSince: number | null;
  certNumber: string | null;
}): OrganicCopy {
  const cert = p.certNumber?.trim();
  if (p.organicScheme === 'none' || !cert) return NO_CLAIM;
  switch (p.organicScheme) {
    case 'pgs_green':
      return {
        certificationLine: `Under conversion to organic (PGS-India Green)${p.conversionSince ? ` since ${p.conversionSince}` : ''} · Certificate ${cert}`,
        mayUseOrganic: false,
        badge: 'pgs_green',
      };
    case 'pgs_organic':
      return { certificationLine: `Certified organic (PGS-India Organic) · Certificate ${cert}`, mayUseOrganic: true, badge: 'pgs_organic' };
    case 'npop':
      return { certificationLine: `Certified organic (NPOP, India Organic) · Certificate ${cert}`, mayUseOrganic: true, badge: 'npop' };
  }
}

const ALWAYS_BANNED: Array<{ re: RegExp; label: string }> = [
  { re: /chemical[\s-]*free/i, label: 'chemical-free' },
  { re: /100\s*%\s*organic/i, label: '100% organic' },
  { re: /naturally[\s-]*grown/i, label: 'naturally grown' },
];

const HEALTH: Array<{ re: RegExp; label: string }> = [
  { re: /diabet/i, label: 'diabet' },
  // "cure(s)" as a promise; "cured"/"curing" are legitimate processing words (sun-cured, turmeric curing).
  { re: /\bcures?\b/i, label: 'cure' },
  { re: /cancer/i, label: 'cancer' },
  { re: /cholesterol/i, label: 'cholesterol' },
  { re: /immunity[\s-]*boost/i, label: 'immunity boost' },
  { re: /weight[\s-]*loss/i, label: 'weight loss' },
];

/** FSSAI Advertising & Claims Regulations 2018, Reg 4: conditional terms. */
const CONDITIONAL_TERMS = ['natural', 'fresh', 'pure', 'traditional', 'authentic', 'genuine', 'real', 'original'] as const;
const conditionalRe = (term: string) => new RegExp(`\\b${term}(?:ly)?\\b`, 'i');

function hasEvidencedClaim(claims: ProcessClaim[], code: string): boolean {
  return claims.some((c) => c.code === code && c.text.trim() !== '' && c.evidence_note.trim() !== '');
}

/**
 * Returns the banned phrases found in `text` (empty when the copy is acceptable).
 * `mayUseOrganic` must come from organicCopy() (scheme AND certificate); it
 * defaults to false so a missing value can't let "organic" through.
 */
export function findBannedPhrases(
  text: string,
  ctx: { organicScheme: OrganicScheme; claims: ProcessClaim[]; mayUseOrganic?: boolean; allowedTerms?: readonly string[] },
): string[] {
  const found: string[] = [];
  // "naturally grown" is banned outright; don't double-report it as "natural".
  const withoutBanned = ALWAYS_BANNED.reduce((t, { re, label }) => {
    if (re.test(t)) found.push(label);
    return t.replace(new RegExp(re.source, 'gi'), ' ');
  }, text);

  const mayUseOrganic = ctx.mayUseOrganic ?? false;
  if (!mayUseOrganic) {
    // PGS-Green may say "under conversion to organic"; anything else is "organic".
    const rest = ctx.organicScheme === 'pgs_green' ? withoutBanned.replace(/under\s+conversion\s+to\s+organic/gi, '') : withoutBanned;
    if (/\borganic(?:ally)?\b/i.test(rest)) found.push('organic');
  }

  // e.g. "traditional" needs a process used for 30+ years; "fresh" has processing limits.
  for (const term of CONDITIONAL_TERMS)
    if (conditionalRe(term).test(withoutBanned) && !hasEvidencedClaim(ctx.claims, term) && !ctx.allowedTerms?.includes(term)) found.push(term);

  for (const { re, label } of HEALTH) if (re.test(text)) found.push(`health claim: ${label}`);
  return found;
}

/**
 * FSSAI Reg 4 allows "fresh" for produce that is not processed beyond washing,
 * peeling, chilling or trimming — i.e. our raw, perishable produce.
 */
export const RAW_PRODUCE_TERMS = ['fresh'] as const;

/** Admin-side validation of a product's process claims. Pass organicCopy(product).mayUseOrganic. */
export function validateProcessClaims(
  claims: ProcessClaim[],
  ctx: { organicScheme: OrganicScheme; mayUseOrganic: boolean; allowedTerms?: readonly string[] },
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  claims.forEach((c, idx) => {
    const n = idx + 1;
    if (!/^[a-z][a-z0-9_]*$/.test(c.code)) errors.push(`Claim ${n} has an invalid code (use lower_snake_case)`);
    if (seen.has(c.code)) errors.push(`Claim ${n} duplicates code "${c.code}"`);
    seen.add(c.code);
    if (!c.text.trim()) errors.push(`Claim ${n} ("${c.code}") needs text`);
    if (!c.evidence_note.trim()) errors.push(`Claim ${n} ("${c.code}") needs an evidence note`);
    const banned = findBannedPhrases(c.text, { ...ctx, claims });
    if (banned.length) errors.push(`Claim ${n} ("${c.code}") uses banned wording: ${banned.join(', ')}`);
  });
  return errors;
}
