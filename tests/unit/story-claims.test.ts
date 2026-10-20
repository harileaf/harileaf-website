import { describe, expect, it } from 'vitest';
import { EMPTY_STORY, emptyStoryPage, type ProductStory } from '../../src/lib/store/story';
import { checkProductStory, checkStoryPage, fieldLabel, intersectContexts, productContext, STRICTEST, type ContextProduct } from '../../src/lib/store/story-claims';

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
