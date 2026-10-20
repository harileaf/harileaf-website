import { describe, expect, it } from 'vitest';
import { findBannedPhrases, findCertificationWords, findComparisonProblems, findGiProblems, GI_MESSAGE, organicCopy, parseProcessClaims, validateProcessClaims, type ProcessClaim } from '../../src/lib/store/claims';

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
      ['Pesticide-free turmeric', 'pesticide-free'], ['No pesticides, no chemicals', 'no chemicals'], ['A superfood', 'superfood'],
      ['Good for diabetics', 'health claim: diabet'], ['Lowers cholesterol', 'health claim: cholesterol'], ['Boosts immunity', 'health claim: immunity'],
      ['Anti-inflammatory', 'health claim: inflammation'], ['gentle on blood sugar', 'health claim: blood sugar'], ['Antioxidant-rich', 'health claim: antioxidant'],
      ['Good for heart health', 'health claim: heart health'], ['A natural detox', 'health claim: detox'], ['Helps weight loss', 'health claim: weight/metabolism'], ['A cure for colds', 'health claim: cure'],
    ];
    for (const [text, phrase] of cases) expect([text, findBannedPhrases(text, none)]).toEqual([text, expect.arrayContaining([phrase])]);
    expect(findBannedPhrases('Naturally grown', none)).toEqual(['naturally grown']); // not also "natural"
  });

  it('has no false positives on factual process wording', () => {
    for (const text of ['Sun-cured red chillies', 'Turmeric curing: boiled and sun dried', 'Inorganic fertilisers are never used', 'Secure packaging', 'Net weight 5 kg; packed weight 5.1 kg', 'Stone ground below 40 °C. No synthetic pesticides or fertilisers used. 3.2 g fibre per 100 g.'])
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

  it('allows a conditional term only when backed by an evidenced claim of the same code, or allowed for the category', () => {
    expect(findBannedPhrases('Fresh organic mangoes', { organicScheme: 'none', claims: [], allowedTerms: ['fresh'] })).toEqual(['organic']);
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

describe('GI wording', () => {
  it('blocks GI words, dotted G.I. and Wada Kolam without a registration number; allows them with one', () => {
    const W = ['GI wording'];
    const WK = ['GI name: Wada Kolam'];
    const cases: Array<[string, string[]]> = [
      ['GI-tagged rice', W], ['A geographical indication', W], ['G.I.-tagged', W], ['Low GI rice', W],
      ['Wada-Kolam', WK], ['WADA  KOLAM', WK], ['GI-tagged Wada Kolam', [...W, ...WK]],
      ['Ginger and gin', []], ['e.g. I', []], ['Kolam rice from Wada, Palghar', []],
    ];
    for (const [t, expected] of cases) {
      expect([t, findGiProblems(t, { giRegistered: false })]).toEqual([t, expected]);
      expect([t, findGiProblems(t, { giRegistered: true })]).toEqual([t, []]);
    }
    expect(GI_MESSAGE).toMatch(/authorised-user registration number/);
    expect(GI_MESSAGE).toMatch(/glycemic index/);
  });
});

it('comparison wording rejects disparaging terms, including adulterant forms, but not neutral process words', () => {
  expect(findComparisonProblems('Fake, adulterated and toxic powder')).toEqual(['fake', 'adulterated', 'toxic']);
  expect(findComparisonProblems('common adulterants')).toEqual(['adulterated']);
  expect(findComparisonProblems('High-speed mill; friction heats the powder; priced cheaply')).toEqual([]);
});

describe('certification words', () => {
  const c = (scheme: 'none' | 'pgs_green' | 'pgs_organic' | 'npop', certified = true) => ({ scheme, certified });
  const pgs = c('pgs_organic');
  const PGS = 'certification wording: PGS (only when every product here holds PGS-India)';
  const NPOP = 'certification wording: NPOP / India Organic (only when every product here holds NPOP)';
  const JB = 'certification wording: Jaivik Bharat (only with PGS-India Organic or NPOP on every product here)';
  const CO = 'certification wording: certified organic (only with PGS-India Organic or NPOP on every product here)';

  it('are allowed only when every product in context holds that certification', () => {
    expect(findCertificationWords('PGS-India Organic certified organic turmeric', [pgs, pgs])).toEqual([]);
    expect(findCertificationWords('PGS-India Organic', [pgs, c('none', false)])).toEqual([PGS]);
    expect(findCertificationWords('PGS', [c('pgs_organic', false)])).toEqual([PGS]);
    expect(findCertificationWords('certified organic', [c('pgs_green')])).toEqual([CO]);
    expect(findCertificationWords('NPOP India Organic', [pgs])).toEqual([NPOP]);
  });

  it('are caught in dashed and joined spellings; PGS-India Organic is not mistaken for India Organic', () => {
    expect(findCertificationWords('India-Organic', [])).toEqual([NPOP]);
    expect(findCertificationWords('JaivikBharat', [])).toEqual([JB]);
    expect(findCertificationWords('certified-organic', [])).toEqual([CO]);
    expect(findCertificationWords('PGS–India Organic', [pgs])).toEqual([]);
    expect(findCertificationWords('pgs india organic and India Organic', [pgs])).toEqual([NPOP]);
    expect(findCertificationWords('Grown in India, organic practices', [pgs])).toEqual([]);
  });
});

it('parseProcessClaims keeps only well-formed entries of a stored array and never throws', () => {
  expect(parseProcessClaims('[{"code":"pure","text":"Pure","evidence_note":"Lab","extra":1},{"code":"x"},null,7]')).toEqual([{ code: 'pure', text: 'Pure', evidence_note: 'Lab' }]);
  for (const raw of ['{"code":"pure"}', 'not json', null]) expect(parseProcessClaims(raw)).toEqual([]);
});
