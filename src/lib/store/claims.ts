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
  // Absolute "free-from" claims need certified testing of every batch.
  { re: /pesticide[\s-]*free|no\s+pesticides?/i, label: 'pesticide-free' },
  { re: /no\s+(?:synthetic\s+)?chemicals?|chemicals?\s+free/i, label: 'no chemicals' },
  { re: /\bsuper[\s-]*food/i, label: 'superfood' },
];

const HEALTH: Array<{ re: RegExp; label: string }> = [
  { re: /diabet/i, label: 'diabet' },
  { re: /blood[\s-]*sugar|glyc(?:a)?emic|\blow[\s-]*gi\b/i, label: 'blood sugar' },
  { re: /\bimmun(?:e|ity)\b/i, label: 'immunity' },
  { re: /inflammat/i, label: 'inflammation' },
  { re: /\bheart[\s-]*(?:health|healthy)\b|cardio/i, label: 'heart health' },
  { re: /\bdetox/i, label: 'detox' },
  { re: /antioxidant/i, label: 'antioxidant' },
  { re: /\bdigest(?:ion|ive)\b|\bgut[\s-]*health/i, label: 'digestion' },
  { re: /\bmetabolism\b|weight[\s-]*(?:loss|management|control)|lose\s+weight/i, label: 'weight/metabolism' },
  // "cure(s)" as a promise; "cured"/"curing" are legitimate processing words (sun-cured, turmeric curing).
  { re: /\bcures?\b/i, label: 'cure' },
  { re: /cancer/i, label: 'cancer' },
  { re: /cholesterol/i, label: 'cholesterol' },
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

// ── Geographical Indication (spec: GI) ───────────────────────────────────

/** Registered GI names we must not use without authorised-user registration. */
export const REGISTERED_GI_NAMES = ['Wada Kolam'] as const;

export const GI_MESSAGE =
  "GI wording and the name 'Wada Kolam' need the authorised-user registration number (Products → Geographical Indication)";

const giNameRe = (name: string) => new RegExp(name.trim().split(/\s+/).join('[\\s-]*'), 'i');

/** GI words ("GI" as an uppercase word, "GI-tagged", "geographical indication") and registered GI names. */
export function findGiProblems(text: string, ctx: { giRegistered: boolean }): string[] {
  if (ctx.giRegistered) return [];
  const found: string[] = [];
  if (/\bGI\b/.test(text) || /\bgi[\s-]*tagged\b/i.test(text) || /geographical\s+indication/i.test(text)) found.push('GI wording');
  for (const name of REGISTERED_GI_NAMES) if (giNameRe(name).test(text)) found.push(`GI name: ${name}`);
  return found;
}

// ── comparisons (spec: Claims 7) ─────────────────────────────────────────

const COMPARISON_BANNED: Array<{ re: RegExp; label: string }> = [
  { re: /\bfake\b/i, label: 'fake' },
  { re: /\badulterat\w*/i, label: 'adulterated' },
  { re: /\btoxic\b/i, label: 'toxic' },
  { re: /\bharmful\b/i, label: 'harmful' },
  { re: /\bdangerous\b/i, label: 'dangerous' },
  { re: /\bpoison\w*/i, label: 'poison' },
  { re: /\bcheap\b/i, label: 'cheap' },
];

/** Words a comparison with another process may not use (describe the process, not a competitor). */
export function findComparisonProblems(text: string): string[] {
  return COMPARISON_BANNED.filter(({ re }) => re.test(text)).map(({ label }) => label);
}

// ── certification words (spec: Claims 5) ─────────────────────────────────

export interface CertContext { scheme: OrganicScheme; certified: boolean }

const CERT_WORDS: Array<{ re: RegExp; label: string; ok: (c: CertContext) => boolean; ignore?: RegExp }> = [
  { re: /\bPGS\b/i, label: 'PGS', ok: (c) => c.certified && (c.scheme === 'pgs_green' || c.scheme === 'pgs_organic') },
  // "PGS-India Organic" is the PGS scheme's own name, not NPOP's "India Organic" (no lookbehind: this module also ships to browsers).
  { re: /\bNPOP\b|\bindia\s+organic\b/i, ignore: /\bPGS[\s-]+india\s+organic\b/gi, label: 'NPOP / India Organic', ok: (c) => c.certified && c.scheme === 'npop' },
  { re: /\bjaivik\s+bharat\b/i, label: 'Jaivik Bharat', ok: (c) => c.certified && (c.scheme === 'pgs_organic' || c.scheme === 'npop') },
  { re: /\bcertified\s+organic\b/i, label: 'certified organic', ok: (c) => c.certified && (c.scheme === 'pgs_organic' || c.scheme === 'npop') },
];

/**
 * Certification words typed into copy are allowed only when every product in
 * the text's context holds that certification (badges themselves always come
 * from organicCopy()).
 */
export function findCertificationWords(text: string, certs: CertContext[]): string[] {
  return CERT_WORDS.filter((w) => w.re.test(w.ignore ? text.replace(w.ignore, ' ') : text) && !(certs.length > 0 && certs.every(w.ok))).map((w) => `certification wording: ${w.label}`);
}
