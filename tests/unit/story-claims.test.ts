import { describe, expect, it } from 'vitest';
import { EMPTY_STORY, emptyStoryPage, type ProductStory } from '../../src/lib/store/story';
import { checkProductStory, checkStoryPage, intersectContexts, problemMessage, productContext, STRICTEST, textProblems, type ContextProduct } from '../../src/lib/store/story-claims';

const traditional = { code: 'traditional', text: 'Boiled and sun-cured the traditional way', evidence_note: 'Village records, 40 years' };
const none = { scheme: 'none' as const, conversionSince: null, certNumber: null };
const cp = (over: Partial<ContextProduct> = {}): ContextProduct => ({
  id: 1, name: 'Turmeric powder', organic: { scheme: 'pgs_organic', conversionSince: null, certNumber: 'PGS-123' }, claims: [traditional], perishable: false,
  gi: { name: null, auRegNumber: null }, story: null, ...over,
});
const plain = cp({ id: 5, organic: none, claims: [] });
const story = (over: Partial<ProductStory> = {}): ProductStory => ({ ...EMPTY_STORY, ...over });
const steps = (text: string) => [1, 2, 3].map((n) => ({ title: `Step ${n}`, text, photoKey: null, photoAlt: '' }));
const hero = (over: Partial<ReturnType<typeof emptyStoryPage>['hero']>) => ({ ...emptyStoryPage().hero, ...over });
const loose = { completeness: false };

describe('product context', () => {
  it('allows evidenced and certified wording, and blocks a term whose claim has no evidence note', () => {
    expect(checkProductStory(story({ processSteps: steps('Certified organic, boiled the traditional way') }), cp())).toEqual({});
    const e = checkProductStory(story({ processSteps: steps('Organic, boiled the traditional way') }), plain);
    expect(e['processSteps.0']).toMatch(/organic/);
    expect(e['processSteps.0']).toMatch(/traditional/);
    const weak = cp({ claims: [{ code: 'traditional', text: 'Old way', evidence_note: '' }] });
    expect(checkProductStory(story({ processSteps: steps('The traditional way') }), weak)['processSteps.0']).toMatch(/traditional/);
  });

  it('an uncertified PGS-Green product is treated as no scheme', () => {
    const conv = story({ proofLine: [{ kind: 'text', text: 'Under conversion to organic' }] });
    const noCert = cp({ organic: { scheme: 'pgs_green', conversionSince: 2024, certNumber: null } });
    expect(productContext(noCert).organicScheme).toBe('none');
    expect(checkProductStory(conv, noCert)['proofLine.0']).toMatch(/organic/);
    expect(checkProductStory(conv, cp({ organic: { scheme: 'pgs_green', conversionSince: 2024, certNumber: 'G-1' } }))).toEqual({});
  });

  it('always blocks health claims, and disparaging terms only in comparison fields', () => {
    const comparison = { heading: 'Stone vs mill', oursLabel: 'Ours', theirsLabel: 'High-speed mill', note: '', imageKey: null, imageAlt: '', rows: [
      { aspect: 'Powder', ours: 'Keeps its oils', theirs: 'Fake, toxic colour', source: '' },
      { aspect: 'Use', ours: 'Boosts immunity', theirs: 'Flat', source: '' },
    ] };
    const e = checkProductStory(story({ comparison }), cp());
    expect(e['comparison.rows.0']).toMatch(/describe the other process, not a competitor/i);
    expect(e['comparison.rows.1']).toMatch(/immunity/);
    const page = { ...emptyStoryPage(), productIds: [1], storyFromProductId: 1, note: 'Boosts immunity', closing: 'No cheap tricks' };
    const p = checkStoryPage('turmeric', page, [cp()], loose);
    expect(p.note).toMatch(/immunity/);
    expect(p.closing).toBeUndefined();
  });
});

describe('page contexts', () => {
  const kolam = cp({ id: 10, name: 'Kolam rice from Wada', organic: none, claims: [traditional], story: story({ processSteps: steps('Transplanted by hand, the traditional way') }) });
  const karjat = cp({ id: 11, name: 'Karjat 3', organic: none, claims: [] });

  it('page-wide text allows a word only when every linked product supports it; scheme names need one shared scheme', () => {
    expect(intersectContexts([cp(), cp({ id: 3 })]).mayUseOrganic).toBe(true);
    expect(intersectContexts([cp(), plain]).mayUseOrganic).toBe(false);
    expect(intersectContexts([cp(), plain]).claims).toEqual([]);
    expect(intersectContexts([])).toEqual(STRICTEST);

    const page = { ...emptyStoryPage(), productIds: [10, 11], storyFromProductId: 10 };
    expect(checkStoryPage('rice', page, [kolam, karjat], loose)).toEqual({});
    expect(checkStoryPage('rice', { ...page, hero: hero({ line1: 'Traditional rice' }) }, [kolam, karjat], loose)['hero.line1']).toMatch(/traditional/);

    const npop = cp({ id: 2, organic: { scheme: 'npop', conversionSince: null, certNumber: 'N-1' } });
    const mixed = { ...emptyStoryPage(), productIds: [1, 2], storyFromProductId: 1, hero: hero({ line1: 'Certified organic', line2: 'PGS grown' }) };
    const e = checkStoryPage('turmeric', mixed, [cp(), npop], loose);
    expect(e['hero.line1']).toBeUndefined();
    expect(e['hero.line2']).toMatch(/PGS/);
  });

  it("reports the Story-from product's own problems under storyFrom.*", () => {
    const bad = cp({ id: 7, story: story({ processSteps: steps('Chemical-free') }) });
    const page = { ...emptyStoryPage(), productIds: [7], storyFromProductId: 7 };
    expect(checkStoryPage('rice', page, [bad], loose)['storyFrom.processSteps.0']).toMatch(/chemical-free/);
  });

  it('a missing linked product makes the page strictest and is reported', () => {
    const page = { ...emptyStoryPage(), productIds: [1, 404], storyFromProductId: 1, hero: hero({ line1: 'Certified organic' }) };
    const e = checkStoryPage('turmeric', page, [cp()], loose);
    expect(e.productIds).toMatch(/no longer exists/);
    expect(e['hero.line1']).toBeDefined();
  });

  it('checks a card blurb in its own product context; a blurb for an unlinked product is strictest', () => {
    const page = { ...emptyStoryPage(), productIds: [10, 11], storyFromProductId: 10, cardBlurbs: { '10': 'Grown the traditional way', '11': 'Grown the traditional way', '99': 'Grown the traditional way' } };
    const e = checkStoryPage('rice', page, [kolam, karjat], loose);
    expect(e['cardBlurbs.10']).toBeUndefined();
    expect(e['cardBlurbs.11']).toMatch(/traditional/);
    expect(e['cardBlurbs.99']).toMatch(/traditional/);
  });

  it('/spices is always strictest, even when every product is certified and evidenced', () => {
    const certified = [cp(), cp({ id: 2 })];
    const turmeric = { ...emptyStoryPage(), productIds: [1, 2], storyFromProductId: 1, hero: hero({ line2: 'Certified organic, stone-ground' }) };
    expect(checkStoryPage('turmeric', turmeric, certified, loose)).toEqual({});
    const hub = { ...turmeric, slug: 'spices', cardBlurbs: { '1': 'Stone-ground the traditional way' } };
    const e = checkStoryPage('spices', hub, certified, loose);
    expect(e['hero.line2']).toMatch(/organic/);
    expect(e['cardBlurbs.1']).toMatch(/traditional/);
  });

  it('page-wide GI wording needs every linked product registered (name and number)', () => {
    const registered = { name: 'Wada Kolam', auRegNumber: 'AU-9' };
    const page = { ...emptyStoryPage(), productIds: [1, 5], storyFromProductId: 1, hero: hero({ line1: 'Wada Kolam rice' }) };
    expect(checkStoryPage('rice', page, [cp({ gi: registered }), plain], loose)['hero.line1']).toBeDefined();
    expect(checkStoryPage('rice', page, [cp({ gi: registered }), cp({ id: 5, gi: { name: 'Wada Kolam', auRegNumber: null } })], loose)['hero.line1']).toBeDefined();
    expect(checkStoryPage('rice', page, [cp({ gi: registered }), cp({ id: 5, gi: registered })], loose)).toEqual({});
  });
});

it('owner messages carry no internal prefixes or double stops, and GI hits name the registration number', () => {
  const msg = problemMessage(textProblems('Chemical-free, traditional, organic, PGS, boosts immunity, GI-tagged', productContext(plain)));
  expect(msg).not.toMatch(/\.\./);
  expect(msg).not.toMatch(/certification wording:|health claim:|claims guidance/);
  expect(msg).toMatch(/authorised-user registration number/);
});
