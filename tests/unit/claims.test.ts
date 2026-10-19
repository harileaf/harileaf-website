import { describe, expect, it } from 'vitest';
import { findBannedPhrases, organicCopy, validateProcessClaims, type ProcessClaim } from '../../src/lib/store/claims';

const none = { organicScheme: 'none' as const, claims: [] as ProcessClaim[] };
const noOrganic = { organicScheme: 'none' as const, mayUseOrganic: false };

describe('organicCopy', () => {
  it('says nothing about organic without a scheme and certificate number', () => {
    const nothing = { certificationLine: null, mayUseOrganic: false, badge: null };
    expect(organicCopy({ organicScheme: 'none', conversionSince: null, certNumber: null })).toEqual(nothing);
    for (const organicScheme of ['pgs_green', 'pgs_organic', 'npop'] as const) expect(organicCopy({ organicScheme, conversionSince: 2025, certNumber: '  ' })).toEqual(nothing);
  });

  it('describes PGS-India Green as under conversion, never organic; certified schemes may say organic', () => {
    expect(organicCopy({ organicScheme: 'pgs_green', conversionSince: 2025, certNumber: 'PGS-123' })).toEqual({
      certificationLine: 'Under conversion to organic (PGS-India Green) since 2025 · Certificate PGS-123', mayUseOrganic: false, badge: 'pgs_green',
    });
    expect(organicCopy({ organicScheme: 'npop', conversionSince: null, certNumber: 'NPOP/1' })).toEqual({
      certificationLine: 'Certified organic (NPOP, India Organic) · Certificate NPOP/1', mayUseOrganic: true, badge: 'npop',
    });
  });
});

describe('findBannedPhrases', () => {
  it('flags banned marketing words in any spelling, and health claims', () => {
    const cases: Array<[string, string]> = [
      ['CHEMICAL FREE rice', 'chemical-free'], ['100 % organic', '100% organic'], ['naturally-grown', 'naturally grown'],
      ['organically farmed', 'organic'], ['a traditional stone mill', 'traditional'], ['Pure turmeric', 'pure'], ['freshly ground', 'fresh'],
      ['All natural', 'natural'], ['Authentic Wada Kolam', 'authentic'], ['the real taste', 'real'], ['Genuine rice', 'genuine'], ['the original recipe', 'original'],
      ['Good for diabetics', 'health claim: diabet'], ['Lowers cholesterol', 'health claim: cholesterol'], ['An immunity booster', 'health claim: immunity boost'], ['A cure for colds', 'health claim: cure'],
    ];
    for (const [text, phrase] of cases) expect([text, findBannedPhrases(text, none)]).toEqual([text, expect.arrayContaining([phrase])]);
    expect(findBannedPhrases('Naturally grown', none)).toEqual(['naturally grown']); // not also "natural"
  });

  it('has no false positives on factual process wording', () => {
    for (const text of ['Sun-cured red chillies', 'Turmeric curing: boiled and sun dried', 'Inorganic fertilisers are never used', 'Secure packaging', 'Stone ground below 40 °C. 3.2 g fibre per 100 g.'])
      expect([text, findBannedPhrases(text, none)]).toEqual([text, []]);
  });

  it('allows "organic" only when the certificate permits it (never "100% organic"), and "under conversion" only for PGS-Green', () => {
    const npop = { organicScheme: 'npop' as const, claims: [] as ProcessClaim[], mayUseOrganic: true };
    expect(findBannedPhrases('Organic rice', { organicScheme: 'npop', claims: [] })).toContain('organic');
    expect(findBannedPhrases('Certified organic Karjat 3', npop)).toEqual([]);
    expect(findBannedPhrases('100% organic', npop)).toContain('100% organic');
    const green = { organicScheme: 'pgs_green' as const, claims: [] as ProcessClaim[] };
    expect(findBannedPhrases('Under conversion to organic since 2025', green)).toEqual([]);
    expect(findBannedPhrases('Under conversion to organic since 2025', none)).toContain('organic');
    expect(findBannedPhrases('Under conversion to organic. Organic rice!', green)).toContain('organic');
  });

  it('allows a conditional term only when backed by an evidenced claim of the same code', () => {
    const claims: ProcessClaim[] = [{ code: 'traditional', text: 'Stone-milled the way our family has since 1985', evidence_note: 'Mill records since 1985' }];
    expect(findBannedPhrases('Traditionally milled', { organicScheme: 'none', claims })).toEqual([]);
    expect(findBannedPhrases('Traditionally milled', { organicScheme: 'none', claims: [{ ...claims[0], evidence_note: '' }] })).toContain('traditional');
  });
});

it('validateProcessClaims requires code, text and evidence, unique codes and clean wording', () => {
  expect(validateProcessClaims([{ code: 'stone_ground', text: 'Stone ground below 40 °C', evidence_note: 'Batch thermometer log' }], noOrganic)).toEqual([]);
  expect(validateProcessClaims([{ code: 'Bad Code', text: '', evidence_note: '' }], noOrganic)).toEqual([
    'Claim 1 has an invalid code (use lower_snake_case)', 'Claim 1 ("Bad Code") needs text', 'Claim 1 ("Bad Code") needs an evidence note',
  ]);
  expect(validateProcessClaims([
    { code: 'unpolished', text: 'Unpolished', evidence_note: 'Mill setting' },
    { code: 'unpolished', text: 'Chemical-free', evidence_note: 'x' },
  ], noOrganic)).toEqual(['Claim 2 duplicates code "unpolished"', 'Claim 2 ("unpolished") uses banned wording: chemical-free']);
});
