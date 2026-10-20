import { describe, expect, it } from 'vitest';
import { findBannedPhrases, findCertificationWords, findComparisonProblems, findGiProblems, GI_MESSAGE, organicCopy, validateProcessClaims, type ProcessClaim } from '../../src/lib/store/claims';

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

const GI_W = ['GI wording'];

describe('GI wording', () => {
  const gi = (x: string) => findGiProblems(x, { giRegistered: false });
  const reg = (x: string) => findGiProblems(x, { giRegistered: true });

  it('flags GI words and registered names with the specific label, and passes when registered', () => {
    const cases: Array<[string, string[]]> = [
      ['GI-tagged rice', GI_W],
      ['A geographical indication', GI_W],
      ['gi tagged', GI_W],
      ['G.I.', GI_W],
      ['G.I', GI_W],
      ['G.I. tagged', GI_W],
      ['G.I.-tagged', GI_W],
      ['(G.I.)', GI_W],
      ['GI.', GI_W],
      // "Low GI" is ambiguous (geographical vs glycemic index). It stays flagged because glycemic claims are banned too; GI_MESSAGE says so.
      ['Low GI rice', GI_W],
      ['Wada Kolam rice', ['GI name: Wada Kolam']],
      ['wada-kolam', ['GI name: Wada Kolam']],
      ['Wada-Kolam', ['GI name: Wada Kolam']],
      ['WADA  KOLAM', ['GI name: Wada Kolam']],
      ['wada–kolam', ['GI name: Wada Kolam']],
      ['GI-tagged Wada Kolam', ['GI wording', 'GI name: Wada Kolam']],
    ];
    for (const [t, expected] of cases) {
      expect([t, gi(t)]).toEqual([t, expected]);
      expect([t, reg(t)]).toEqual([t, []]);
    }
  });

  it("matches 'GI' only as an uppercase whole word", () => {
    for (const t of ['Ginger and gin', 'gigantic grains', 'Kolam rice from Wada, Palghar', 'Gift box', 'GIs', 'origin', 'Gi fts', 'E.G. I use', 'e.g. I', 'G.Int'])
      expect([t, gi(t)]).toEqual([t, []]);
    expect(GI_MESSAGE).toMatch(/authorised-user registration number/);
    expect(GI_MESSAGE).toMatch(/glycemic index/);
  });
});

describe('comparison wording', () => {
  it('rejects disparaging words in comparisons', () => {
    expect(findComparisonProblems('Fake, adulterated and toxic powder')).toEqual(['fake', 'adulterated', 'toxic']);
    expect(findComparisonProblems('Cheap blends; harmful, dangerous, poisonous')).toEqual(['harmful', 'dangerous', 'poison', 'cheap']);
    expect(findComparisonProblems('High-speed mill; friction heats the powder')).toEqual([]);
  });
  it('catches adulterant and adulterate, but not adverb forms', () => {
    expect(findComparisonProblems('common adulterants')).toEqual(['adulterated']);
    expect(findComparisonProblems('do not adulterate')).toEqual(['adulterated']);
    expect(findComparisonProblems('priced cheaply, treated harmfully')).toEqual([]);
  });
});

describe('certification words', () => {
  const c = (scheme: 'none' | 'pgs_green' | 'pgs_organic' | 'npop', certified = true) => ({ scheme, certified });
  const pgs = c('pgs_organic');
  const none = c('none', false);
  const PGS = 'certification wording: PGS (only when every product here holds PGS-India)';
  const NPOP = 'certification wording: NPOP / India Organic (only when every product here holds NPOP)';
  const JB = 'certification wording: Jaivik Bharat (only with PGS-India Organic or NPOP on every product here)';
  const CO = 'certification wording: certified organic (only with PGS-India Organic or NPOP on every product here)';

  it('allows certification words only when every product in context holds that certification', () => {
    expect(findCertificationWords('PGS-India Organic certified organic turmeric', [pgs, pgs])).toEqual([]);
    expect(findCertificationWords('PGS-India Organic', [pgs, none])).toEqual([PGS]);
    expect(findCertificationWords('NPOP India Organic', [pgs])).toEqual([NPOP]);
    expect(findCertificationWords('Jaivik Bharat logo', [])).toEqual([JB]);
    expect(findCertificationWords('Tested by a NABL-accredited lab', [none])).toEqual([]);
  });

  it('applies the per-scheme allow matrix', () => {
    expect(findCertificationWords('PGS', [c('pgs_green')])).toEqual([]);
    expect(findCertificationWords('Jaivik Bharat', [c('pgs_green')])).toEqual([JB]);
    expect(findCertificationWords('certified organic', [c('pgs_green')])).toEqual([CO]);
    expect(findCertificationWords('NPOP and India Organic', [c('npop')])).toEqual([]);
    expect(findCertificationWords('Jaivik Bharat, certified organic', [c('npop')])).toEqual([]);
    expect(findCertificationWords('PGS', [c('npop')])).toEqual([PGS]);
    expect(findCertificationWords('PGS', [c('pgs_organic', false)])).toEqual([PGS]);
  });

  it('catches dashes and joined spellings; ignores look-alikes', () => {
    expect(findCertificationWords('India-Organic', [])).toEqual([NPOP]);
    expect(findCertificationWords('India–Organic', [])).toEqual([NPOP]);
    expect(findCertificationWords('Jaivik-Bharat', [])).toEqual([JB]);
    expect(findCertificationWords('JaivikBharat', [])).toEqual([JB]);
    expect(findCertificationWords('certified-organic', [])).toEqual([CO]);
    for (const t of ['Made in India', 'organically grown', 'Grown in India, organic practices']) expect([t, findCertificationWords(t, [pgs])]).toEqual([t, []]);
  });

  it('PGS-India Organic (any dash) is exempt from the NPOP rule, but a bare India Organic is not', () => {
    for (const t of ['PGS-India Organic', 'PGS–India Organic', 'pgs india organic']) expect([t, findCertificationWords(t, [pgs])]).toEqual([t, []]);
    expect(findCertificationWords('pgs india organic and India Organic', [pgs])).toEqual([NPOP]);
  });
});
