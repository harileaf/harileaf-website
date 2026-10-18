import { describe, expect, it } from 'vitest';
import { findBannedPhrases, organicCopy, validateProcessClaims, type ProcessClaim } from '../../src/lib/store/claims';

const none = { organicScheme: 'none' as const, claims: [] as ProcessClaim[] };

describe('organicCopy', () => {
  it('says nothing about organic without a scheme', () => {
    expect(organicCopy({ organicScheme: 'none', conversionSince: null, certNumber: null })).toEqual({
      certificationLine: null,
      mayUseOrganic: false,
      badge: null,
    });
  });

  it('describes PGS-India Green as under conversion, never as organic', () => {
    expect(organicCopy({ organicScheme: 'pgs_green', conversionSince: 2025, certNumber: 'PGS-123' })).toEqual({
      certificationLine: 'Under conversion to organic (PGS-India Green) since 2025 · Certificate PGS-123',
      mayUseOrganic: false,
      badge: 'pgs_green',
    });
    expect(organicCopy({ organicScheme: 'pgs_green', conversionSince: null, certNumber: 'PGS-123' }).certificationLine).toBe(
      'Under conversion to organic (PGS-India Green) · Certificate PGS-123',
    );
  });

  it('allows "organic" only for certified schemes with a certificate number', () => {
    expect(organicCopy({ organicScheme: 'pgs_organic', conversionSince: null, certNumber: 'PGS-9' })).toEqual({
      certificationLine: 'Certified organic (PGS-India Organic) · Certificate PGS-9',
      mayUseOrganic: true,
      badge: 'pgs_organic',
    });
    expect(organicCopy({ organicScheme: 'npop', conversionSince: null, certNumber: 'NPOP/1' })).toEqual({
      certificationLine: 'Certified organic (NPOP, India Organic) · Certificate NPOP/1',
      mayUseOrganic: true,
      badge: 'npop',
    });
  });

  it('treats a scheme without a certificate number as no scheme', () => {
    for (const organicScheme of ['pgs_green', 'pgs_organic', 'npop'] as const) {
      expect(organicCopy({ organicScheme, conversionSince: 2025, certNumber: null })).toEqual({
        certificationLine: null,
        mayUseOrganic: false,
        badge: null,
      });
      expect(organicCopy({ organicScheme, conversionSince: 2025, certNumber: '  ' }).badge).toBeNull();
    }
  });
});

describe('findBannedPhrases', () => {
  it.each([
    ['Grown chemical-free on our farm', 'chemical-free'],
    ['CHEMICAL FREE rice', 'chemical-free'],
    ['chemicalfree', 'chemical-free'],
    ['100% Organic turmeric', '100% organic'],
    ['100 % organic', '100% organic'],
    ['Naturally grown in Karjat', 'naturally grown'],
    ['naturally-grown', 'naturally grown'],
    ['Organic Karjat 3 rice', 'organic'],
    ['organically farmed', 'organic'],
    ['Traditionally made turmeric', 'traditional'],
    ['a traditional stone mill', 'traditional'],
  ])('flags %j', (text, phrase) => {
    expect(findBannedPhrases(text, none)).toContain(phrase);
  });

  it('flags health and disease claims', () => {
    expect(findBannedPhrases('Good for diabetics', none)).toContain('health claim: diabet');
    expect(findBannedPhrases('Lowers cholesterol', none)).toContain('health claim: cholesterol');
    expect(findBannedPhrases('An immunity booster', none)).toContain('health claim: immunity boost');
    expect(findBannedPhrases('Cures colds', none)).toContain('health claim: cure');
  });

  it('accepts specific, factual process claims', () => {
    expect(
      findBannedPhrases('Stone ground below 40 °C. No synthetic pesticides or fertilisers used. 3.2 g fibre per 100 g.', none),
    ).toEqual([]);
  });

  it('does not match words that merely contain a banned stem', () => {
    expect(findBannedPhrases('Inorganic fertilisers are never used', none)).toEqual([]);
    expect(findBannedPhrases('Secure packaging', none)).toEqual([]);
  });

  it('allows "organic" once the scheme permits it, but never "100% organic"', () => {
    const npop = { organicScheme: 'npop' as const, claims: [], mayUseOrganic: true };
    expect(findBannedPhrases('Certified organic Karjat 3', npop)).toEqual([]);
    expect(findBannedPhrases('100% organic', npop)).toContain('100% organic');
  });

  it('allows "under conversion to organic" only for PGS-Green', () => {
    expect(findBannedPhrases('Under conversion to organic since 2025', { organicScheme: 'pgs_green', claims: [] })).toEqual([]);
    expect(findBannedPhrases('Under conversion to organic since 2025', none)).toContain('organic');
    expect(findBannedPhrases('Under conversion to organic. Organic rice!', { organicScheme: 'pgs_green', claims: [] })).toContain('organic');
  });

  it('allows "traditional" only with an evidenced traditional claim', () => {
    const claims: ProcessClaim[] = [{ code: 'traditional', text: 'Stone-milled the way our family has since 1985', evidence_note: 'Mill records since 1985' }];
    expect(findBannedPhrases('Traditionally milled', { organicScheme: 'none', claims })).toEqual([]);
    expect(
      findBannedPhrases('Traditionally milled', { organicScheme: 'none', claims: [{ ...claims[0], evidence_note: '' }] }),
    ).toContain('traditional');
  });
});

describe('validateProcessClaims', () => {
  it('requires a code, text and evidence note for every claim', () => {
    expect(
      validateProcessClaims([
        { code: 'stone_ground', text: 'Stone ground below 40 °C', evidence_note: 'Batch thermometer log' },
      ], 'none'),
    ).toEqual([]);
    expect(validateProcessClaims([{ code: 'stone_ground', text: 'Stone ground', evidence_note: '' }], 'none')).toEqual([
      'Claim 1 ("stone_ground") needs an evidence note',
    ]);
    expect(validateProcessClaims([{ code: 'Bad Code', text: '', evidence_note: 'x' }], 'none')).toEqual([
      'Claim 1 has an invalid code (use lower_snake_case)',
      'Claim 1 ("Bad Code") needs text',
    ]);
  });

  it('rejects duplicate codes and banned wording inside claim text', () => {
    expect(
      validateProcessClaims([
        { code: 'unpolished', text: 'Unpolished', evidence_note: 'Mill setting' },
        { code: 'unpolished', text: 'Chemical-free', evidence_note: 'x' },
      ], 'none'),
    ).toEqual(['Claim 2 duplicates code "unpolished"', 'Claim 2 ("unpolished") uses banned wording: chemical-free']);
  });
});
