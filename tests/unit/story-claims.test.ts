import { describe, expect, it } from 'vitest';
import { CONDITIONAL_TERMS } from '../../src/lib/store/claims';
import { EMPTY_STORY, emptyStoryPage, type ProductStory } from '../../src/lib/store/story';
import { checkProductStory, checkStoryPage, fieldLabel, intersectContexts, problemMessage, productContext, STRICTEST, textProblems, type ContextProduct } from '../../src/lib/store/story-claims';

const traditional = { code: 'traditional', text: 'Boiled and sun-cured the traditional way', evidence_note: 'Village records, 40 years' };
const cp = (over: Partial<ContextProduct> = {}): ContextProduct => ({
  id: 1, name: 'Turmeric powder', organic: { scheme: 'pgs_organic', conversionSince: null, certNumber: 'PGS-123' }, claims: [traditional], perishable: false,
  gi: { name: null, auRegNumber: null }, story: null, ...over,
});
const story = (over: Partial<ProductStory> = {}): ProductStory => ({ ...EMPTY_STORY, ...over });
const steps = (text: string) => [1, 2, 3].map((n) => ({ title: `Step ${n}`, text, photoKey: null, photoAlt: '' }));

describe('contexts', () => {
  it('a page context allows a word only when every linked product supports it', () => {
    const rice = cp({ id: 2, organic: { scheme: 'none', conversionSince: null, certNumber: null }, claims: [] });
    expect(intersectContexts([cp(), cp({ id: 3 })]).mayUseOrganic).toBe(true);
    expect(intersectContexts([cp(), rice]).mayUseOrganic).toBe(false);
    expect(intersectContexts([cp(), rice]).claims).toEqual([]);
    expect(intersectContexts([])).toEqual(STRICTEST);
    expect(productContext(cp({ gi: { name: 'Wada Kolam', auRegNumber: 'AU-9' } })).giRegistered).toBe(true);
  });
});

describe('checkProductStory', () => {
  it('allows evidenced and certified wording, and blocks the rest with a next step', () => {
    expect(checkProductStory(story({ processSteps: steps('Certified organic, boiled the traditional way') }), cp())).toEqual({});
    const rice = cp({ organic: { scheme: 'none', conversionSince: null, certNumber: null }, claims: [] });
    const e = checkProductStory(story({ processSteps: steps('Organic, boiled the traditional way') }), rice);
    expect(e['processSteps.0']).toMatch(/organic/);
    expect(e['processSteps.0']).toMatch(/traditional/);
  });

  it('rejects health claims, disparaging comparisons and GI wording', () => {
    const cmp = { heading: 'Stone vs mill', oursLabel: 'Ours', theirsLabel: 'High-speed mill', note: '', imageKey: null, imageAlt: '', rows: [
      { aspect: 'Powder', ours: 'Keeps its oils', theirs: 'Fake, toxic colour', source: '' },
      { aspect: 'Use', ours: 'Boosts immunity', theirs: 'Flat', source: '' },
    ] };
    const e = checkProductStory(story({ comparison: cmp, originStory: { heading: 'Wada Kolam', bodyMd: 'GI-tagged', photoKey: null, photoAlt: '' } }), cp());
    expect(e['comparison.rows.0']).toMatch(/describe the other process, not a competitor/i);
    expect(e['comparison.rows.1']).toMatch(/immunity/);
    expect(e['originStory.heading']).toMatch(/authorised-user registration number/);
  });
});

describe('checkStoryPage', () => {
  const kolam = cp({ id: 10, name: 'Kolam rice from Wada', organic: { scheme: 'none', conversionSince: null, certNumber: null }, claims: [traditional], story: story({ processSteps: steps('Transplanted by hand, the traditional way') }) });
  const karjat = cp({ id: 11, name: 'Karjat 3', organic: { scheme: 'none', conversionSince: null, certNumber: null }, claims: [] });

  it("lets 'traditional' appear in the Story-from product's sections but not in the page-wide hero", () => {
    const page = { ...emptyStoryPage(), productIds: [10, 11], storyFromProductId: 10 };
    expect(checkStoryPage('rice', page, [kolam, karjat], { completeness: false })).toEqual({});
    page.hero = { ...page.hero, line1: 'Traditional rice' };
    expect(checkStoryPage('rice', page, [kolam, karjat], { completeness: false })['hero.line1']).toMatch(/traditional/);
  });

  it('checks a card blurb against its own product', () => {
    const page = { ...emptyStoryPage(), productIds: [10, 11], storyFromProductId: 10, cardBlurbs: { '10': 'Grown the traditional way', '11': 'Grown the traditional way' } };
    const e = checkStoryPage('rice', page, [kolam, karjat], { completeness: false });
    expect(e['cardBlurbs.10']).toBeUndefined();
    expect(e['cardBlurbs.11']).toMatch(/traditional/);
  });

  it('/turmeric may say organic when every linked product is certified; /spices never', () => {
    const turmeric = { ...emptyStoryPage(), productIds: [1, 2], storyFromProductId: 1, hero: { ...emptyStoryPage().hero, line2: 'Certified organic, stone-ground' } };
    expect(checkStoryPage('turmeric', turmeric, [cp(), cp({ id: 2 })], { completeness: false })).toEqual({});
    const hub = { ...turmeric, slug: 'spices' };
    expect(checkStoryPage('spices', hub, [cp(), cp({ id: 2 })], { completeness: false })['hero.line2']).toMatch(/organic/);
  });

  it('on publish, needs a title, a headline and (rice, turmeric) linked products with a Story-from', () => {
    const e = checkStoryPage('turmeric', emptyStoryPage(), [], { completeness: true });
    expect(Object.keys(e)).toEqual(expect.arrayContaining(['seo.title', 'seo.description', 'hero.line1', 'productIds']));
    expect(checkStoryPage('spices', { ...emptyStoryPage(), seo: { title: 'Spices', description: 'Stone-ground spices.' }, hero: { ...emptyStoryPage().hero, line1: 'Spices' } }, [], { completeness: true })).toEqual({});
  });

  it('labels fields for people', () => {
    expect(fieldLabel('hero.line2')).toBe('Hero line 2');
    expect(fieldLabel('faq.0')).toBe('Question 1');
    expect(fieldLabel('storyFrom.processSteps.3')).toBe('Story from product → Step 4');
  });
});

describe('extra coverage', () => {
  const plain = cp({ id: 5, organic: { scheme: 'none', conversionSince: null, certNumber: null }, claims: [] });
  const registered = { name: 'Wada Kolam', auRegNumber: 'AU-9' };

  it('blocks typed certification words unless the context holds that certification', () => {
    expect(checkProductStory(story({ proofLine: [{ kind: 'text', text: 'PGS-India Organic' }] }), cp())).toEqual({});
    expect(checkProductStory(story({ proofLine: [{ kind: 'text', text: 'PGS-India Organic' }] }), plain)['proofLine.0']).toMatch(/PGS/);
  });

  it('allows GI wording only when the product has both name and registration number', () => {
    const gi = story({ originStory: { heading: 'Wada Kolam, GI-tagged', bodyMd: '', photoKey: null, photoAlt: '' } });
    expect(checkProductStory(gi, cp({ gi: registered }))).toEqual({});
    expect(checkProductStory(gi, cp({ gi: { name: 'Wada Kolam', auRegNumber: null } }))['originStory.heading']).toBeDefined();
  });

  it('page-wide GI wording needs every linked product registered', () => {
    const page = { ...emptyStoryPage(), productIds: [1, 5], storyFromProductId: 1, hero: { ...emptyStoryPage().hero, line1: 'Wada Kolam rice' } };
    expect(checkStoryPage('rice', page, [cp({ gi: registered }), plain], { completeness: false })['hero.line1']).toBeDefined();
    expect(checkStoryPage('rice', page, [cp({ gi: registered }), cp({ id: 5, gi: registered })], { completeness: false })).toEqual({});
  });

  it('checks health claims on pages and comparison terms only in comparison fields', () => {
    const page = { ...emptyStoryPage(), productIds: [1], storyFromProductId: 1, note: 'Boosts immunity', closing: 'No cheap tricks' };
    const e = checkStoryPage('turmeric', page, [cp()], { completeness: false });
    expect(e.note).toMatch(/immunity/);
    expect(e.closing).toBeUndefined();
  });

  it("reports the Story-from product's problems under storyFrom.*", () => {
    const bad = cp({ id: 7, story: story({ processSteps: steps('Chemical-free') }) });
    const page = { ...emptyStoryPage(), productIds: [7], storyFromProductId: 7 };
    expect(checkStoryPage('rice', page, [bad], { completeness: false })['storyFrom.processSteps.0']).toMatch(/chemical-free/);
  });

  it('a blurb for a product outside the linked list is checked strictly', () => {
    const page = { ...emptyStoryPage(), productIds: [1], storyFromProductId: 1, cardBlurbs: { '99': 'The traditional way' } };
    expect(checkStoryPage('turmeric', page, [cp()], { completeness: false })['cardBlurbs.99']).toMatch(/traditional/);
  });
});

describe('review fixes', () => {
  const none = { scheme: 'none' as const, conversionSince: null, certNumber: null };
  const plain = cp({ id: 5, organic: none, claims: [] });
  const conv = 'Under conversion to organic';
  const hero = (line1: string) => ({ ...emptyStoryPage().hero, line1 });

  it('an uncertified PGS-Green product is treated as no scheme', () => {
    const noCert = cp({ organic: { scheme: 'pgs_green', conversionSince: 2024, certNumber: null } });
    const withCert = cp({ organic: { scheme: 'pgs_green', conversionSince: 2024, certNumber: 'G-1' } });
    expect(productContext(noCert).organicScheme).toBe('none');
    expect(checkProductStory(story({ proofLine: [{ kind: 'text', text: conv }] }), noCert)['proofLine.0']).toMatch(/organic/);
    expect(checkProductStory(story({ proofLine: [{ kind: 'text', text: conv }] }), withCert)).toEqual({});
  });

  it('a missing linked product makes the page strictest and is reported', () => {
    const page = { ...emptyStoryPage(), productIds: [1, 404], storyFromProductId: 1, hero: hero('Certified organic') };
    const e = checkStoryPage('turmeric', page, [cp()], { completeness: false });
    expect(e.productIds).toBe('A linked product no longer exists. Remove it from Products');
    expect(e['hero.line1']).toBeDefined();
  });

  it('duplicate product ids do not change the outcome', () => {
    const page = { ...emptyStoryPage(), productIds: [1, 1], storyFromProductId: 1, hero: hero('Certified organic') };
    expect(checkStoryPage('turmeric', page, [cp()], { completeness: false })).toEqual({});
  });

  it('hub blurbs are strictest, even for an evidenced product', () => {
    const page = { ...emptyStoryPage(), slug: 'spices', productIds: [1], cardBlurbs: { '1': 'Stone-ground the traditional way' } };
    expect(checkStoryPage('spices', page, [cp()], { completeness: false })['cardBlurbs.1']).toMatch(/traditional/);
  });

  it('mixed schemes: organic is allowed, scheme names are not', () => {
    const npop = cp({ id: 2, organic: { scheme: 'npop', conversionSince: null, certNumber: 'N-1' } });
    const ctx = intersectContexts([cp(), npop]);
    expect(ctx.mayUseOrganic).toBe(true);
    expect(ctx.organicScheme).toBe('none');
    const page = { ...emptyStoryPage(), productIds: [1, 2], storyFromProductId: 1, hero: { ...emptyStoryPage().hero, line1: 'Certified organic', line2: 'PGS grown', subtitle: 'NPOP tested' } };
    const e = checkStoryPage('turmeric', page, [cp(), npop], { completeness: false });
    expect(e['hero.line1']).toBeUndefined();
    expect(e['hero.line2']).toMatch(/'PGS' can only appear when every product here holds PGS-India\./);
    expect(e['hero.subtitle']).toMatch(/NPOP/);
  });

  it('a claim without an evidence note does not allow its term', () => {
    const weak = cp({ claims: [{ code: 'traditional', text: 'Old way', evidence_note: '' }] });
    expect(checkProductStory(story({ processSteps: steps('The traditional way') }), weak)['processSteps.0']).toMatch(/traditional/);
  });

  it("'fresh' is allowed page-wide only when every product is perishable", () => {
    const page = { ...emptyStoryPage(), productIds: [1, 2], storyFromProductId: 1, note: 'Fresh from the field' };
    const a = cp({ perishable: true });
    expect(checkStoryPage('turmeric', page, [a, cp({ id: 2, perishable: true })], { completeness: false })).toEqual({});
    expect(checkStoryPage('turmeric', page, [a, cp({ id: 2 })], { completeness: false }).note).toMatch(/fresh/);
  });

  it('a Story-from product that is not linked is not accepted on publish', () => {
    const page = { ...emptyStoryPage(), productIds: [1], storyFromProductId: 9, seo: { title: 'T', description: 'D' }, hero: hero('H') };
    const e = checkStoryPage('turmeric', page, [cp(), cp({ id: 9, story: story({ processSteps: steps('Chemical-free') }) })], { completeness: true });
    expect(e.storyFromProductId).toBeDefined();
    expect(Object.keys(e).some((k) => k.startsWith('storyFrom.'))).toBe(false);
  });

  it('messages give a next step per kind, without internal prefixes or double stops', () => {
    const ctx = productContext(plain);
    const msg = problemMessage(textProblems('Chemical-free, traditional, organic, PGS, boosts immunity, GI-tagged', ctx));
    expect(msg).not.toMatch(/\.\./);
    expect(msg).not.toMatch(/certification wording:|health claim:|claims guidance/);
    expect(msg).toContain("Health claims aren't allowed: remove 'immunity'.");
    expect(msg).toContain("'PGS' can only appear when every product here holds PGS-India.");
    expect(msg).toContain("'traditional' needs a matching process claim with an evidence note on every product here (Products → Claims).");
    expect(msg).toMatch(/'organic' can only appear/);
    expect(msg).toMatch(/authorised-user registration number/);
    expect(msg).toContain("Remove 'chemical-free'.");
    expect(problemMessage(textProblems('Fake', ctx, { comparison: true }))).toBe("Describe the other process, not a competitor ('fake' isn't allowed).");
  });

  it('classifies every conditional term as kind term', () => {
    const ctx = productContext(plain);
    for (const term of CONDITIONAL_TERMS) expect(textProblems(`A ${term} spice`, ctx), term).toEqual([{ kind: 'term', label: term }]);
  });

  it('labels every story field, with the product in card blurbs', () => {
    expect(fieldLabel('originStory.photoAlt')).toBe('Origin photo description');
    expect(fieldLabel('comparison.oursLabel')).not.toBe('comparison.oursLabel');
    expect(fieldLabel('comparison.imageAlt')).not.toBe('comparison.imageAlt');
    expect(fieldLabel('cardBlurbs.10', { '10': 'Kolam' })).toBe('Card blurb (Kolam)');
    expect(fieldLabel('cardBlurbs.10')).toBe('Card blurb (product 10)');
  });

  it('STRICTEST cannot be mutated and productContext tolerates missing parts', () => {
    expect(() => (STRICTEST.claims as unknown[]).push(1)).toThrow();
    expect(() => productContext({ id: 1, name: 'x', perishable: false, story: null } as unknown as ContextProduct)).not.toThrow();
  });
});
