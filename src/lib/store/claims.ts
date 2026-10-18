/**
 * Claims policy (spec: "Compliance → Claims policy").
 *
 * - Certification wording comes only from `organicCopy()`, and only when the
 *   product has a scheme AND a certificate number.
 * - Every process claim must carry an evidence note.
 * - Some phrases are banned outright; "organic" and "traditional" are allowed
 *   only when the scheme or an evidenced claim backs them.
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
  { re: /\bcur(?:e|es|ed|ing)\b/i, label: 'cure' },
  { re: /cancer/i, label: 'cancer' },
  { re: /cholesterol/i, label: 'cholesterol' },
  { re: /immunity[\s-]*boost/i, label: 'immunity boost' },
  { re: /weight[\s-]*loss/i, label: 'weight loss' },
];

function hasEvidencedClaim(claims: ProcessClaim[], code: string): boolean {
  return claims.some((c) => c.code === code && c.text.trim() !== '' && c.evidence_note.trim() !== '');
}

/** Returns the banned phrases found in `text` (empty when the copy is acceptable). */
export function findBannedPhrases(
  text: string,
  ctx: { organicScheme: OrganicScheme; claims: ProcessClaim[]; mayUseOrganic?: boolean },
): string[] {
  const found: string[] = [];
  for (const { re, label } of ALWAYS_BANNED) if (re.test(text)) found.push(label);

  const mayUseOrganic = ctx.mayUseOrganic ?? (ctx.organicScheme === 'pgs_organic' || ctx.organicScheme === 'npop');
  if (!mayUseOrganic) {
    // PGS-Green may say "under conversion to organic"; anything else is "organic".
    const rest = ctx.organicScheme === 'pgs_green' ? text.replace(/under\s+conversion\s+to\s+organic/gi, '') : text;
    const withoutHundred = rest.replace(/100\s*%\s*organic/gi, '');
    if (/\borganic(?:ally)?\b/i.test(withoutHundred)) found.push('organic');
  }

  // FSSAI: "traditional" needs a process used for 30+ years, so it must be an evidenced claim.
  if (/\btraditional(?:ly)?\b/i.test(text) && !hasEvidencedClaim(ctx.claims, 'traditional')) found.push('traditional');

  for (const { re, label } of HEALTH) if (re.test(text)) found.push(`health claim: ${label}`);
  return found;
}

/** Admin-side validation of a product's process claims. */
export function validateProcessClaims(claims: ProcessClaim[], organicScheme: OrganicScheme): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  claims.forEach((c, idx) => {
    const n = idx + 1;
    if (!/^[a-z][a-z0-9_]*$/.test(c.code)) errors.push(`Claim ${n} has an invalid code (use lower_snake_case)`);
    if (seen.has(c.code)) errors.push(`Claim ${n} duplicates code "${c.code}"`);
    seen.add(c.code);
    if (!c.text.trim()) errors.push(`Claim ${n} ("${c.code}") needs text`);
    if (!c.evidence_note.trim()) errors.push(`Claim ${n} ("${c.code}") needs an evidence note`);
    const banned = findBannedPhrases(c.text, { organicScheme, claims });
    if (banned.length) errors.push(`Claim ${n} ("${c.code}") uses banned wording: ${banned.join(', ')}`);
  });
  return errors;
}
