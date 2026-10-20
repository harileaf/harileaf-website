import { describe, expect, it } from 'vitest';
import {
  EMPTY_STORY, PAGE_LAYOUTS, coerceProductStory, coerceStoryPage, emptyStoryPage, labValue, pageWideTexts, resolveProof,
  storyTexts, validateProductStory, validateStoryPageStructure, type ProductStory,
} from '../../src/lib/store/story';
import { STORY_PAGE_SLUGS, isStoryPageSlug } from '../../src/lib/store/urls';

const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Step ${i + 1}`, text: 'Done by hand.', photoKey: null, photoAlt: '' }));
const story = (over: Partial<ProductStory> = {}): ProductStory => ({ ...EMPTY_STORY, ...over });

describe('story pages', () => {
  it('knows its three slugs and their fixed layouts', () => {
    expect(STORY_PAGE_SLUGS).toEqual(['rice', 'turmeric', 'spices']);
    expect(isStoryPageSlug('turmeric')).toBe(true);
    expect(isStoryPageSlug('produce')).toBe(false);
    expect(PAGE_LAYOUTS.turmeric).toEqual(['hero', 'cards', 'photo_strip', 'comparison', 'lab_table', 'growers', 'facts', 'use', 'faq', 'closing']);
    expect(PAGE_LAYOUTS.rice).toEqual(['hero', 'cards', 'origin', 'photo_strip', 'comparison', 'lab_table', 'growers', 'use', 'faq', 'closing']);
    expect(PAGE_LAYOUTS.spices).toEqual(['hero', 'cards', 'note', 'closing']);
  });

  it('coerces untrusted page JSON into the full shape, dropping junk', () => {
    const p = coerceStoryPage({ hero: { line1: ' Haldi ', proof: [{ productId: '3', key: 'Curcumin', label: 'Curcumin' }, 'x'] }, productIds: [3, 'a', 4, 3], cardBlurbs: { 3: 'Fine powder', x: 'no' }, hidden: ['faq', 'hero'], facts: [{ title: 'A', text: 'B' }] });
    expect(p.hero.line1).toBe('Haldi');
    expect(p.hero.proof).toEqual([{ productId: 3, key: 'Curcumin', label: 'Curcumin' }]);
    expect(p.productIds).toEqual([3, 4]);
    expect(p.cardBlurbs).toEqual({ '3': 'Fine powder' });
    expect(p.hidden).toEqual(['faq']);
    expect(p.facts).toEqual([{ title: 'A', text: 'B' }]);
    expect(coerceStoryPage(null)).toEqual(emptyStoryPage());
  });

  it('coerces the seeded draft shapes (empty proof, hidden and strings)', () => {
    const seed = { ...emptyStoryPage(), hero: { ...emptyStoryPage().hero, proof: [] }, hidden: [] };
    expect(coerceStoryPage(JSON.parse(JSON.stringify(seed)))).toEqual(emptyStoryPage());
  });

  it('checks page structure: limits and lengths', () => {
    const p = emptyStoryPage();
    p.seo.title = 'x'.repeat(71);
    p.facts = Array.from({ length: 7 }, () => ({ title: 't', text: 'x' }));
    p.hero.proof = [1, 2, 3].map((n) => ({ productId: n, key: 'Curcumin', label: 'C' }));
    const e = validateStoryPageStructure('turmeric', p);
    expect(e['seo.title']).toMatch(/70/);
    expect(e.facts).toMatch(/6/);
    expect(e['hero.proof']).toMatch(/2/);
  });
});

describe('product story', () => {
  it('coerces to null when absent and keeps valid parts', () => {
    expect(coerceProductStory(null)).toBeNull();
    const s = coerceProductStory({ icons: [{ icon: 'sun', label: 'Sun-cured' }, { icon: 'rocket', label: 'x' }], proofLine: [{ kind: 'lab', key: 'Curcumin', label: 'Curcumin' }, { kind: 'text', text: 'Lab-tested every batch' }] });
    expect(s?.icons).toEqual([{ icon: 'sun', label: 'Sun-cured' }]);
    expect(s?.proofLine).toHaveLength(2);
    expect(s?.processSteps).toEqual([]);
  });

  it('requires 3–8 steps when there are any, alt text for photos, and sources for numbers', () => {
    expect(validateProductStory(story({ processSteps: steps(2) })).processSteps).toMatch(/3/);
    expect(validateProductStory(story({ processSteps: steps(9) })).processSteps).toMatch(/8/);
    expect(validateProductStory(story({ processSteps: [...steps(2), { title: 'Dug', text: 'By hand', photoKey: 'photos/a.jpg', photoAlt: '' }] }))['processSteps.2']).toMatch(/Describe the photo/);
    const comparison = { heading: 'Stone vs mill', oursLabel: 'Ours', theirsLabel: 'High-speed mill', note: '', imageKey: null, imageAlt: '', rows: [
      { aspect: 'Heat', ours: 'Stays cool', theirs: 'Friction heat', source: '' },
      { aspect: 'Fibre', ours: '3.2 g', theirs: '0.6 g', source: '' },
    ] };
    expect(validateProductStory(story({ comparison }))['comparison.rows.1']).toMatch(/numbers need a source/);
    comparison.rows[1].source = 'IFCT 2017';
    expect(validateProductStory(story({ comparison }))).toEqual({});
  });

  it('rejects image keys outside the photo library and product images', () => {
    const e = validateProductStory(story({ originStory: { heading: 'Wada', bodyMd: 'Kolam rice', photoKey: '../invoices/x.pdf', photoAlt: 'x' } }));
    expect(e['originStory.photoKey']).toMatch(/Choose a photo/);
  });

  it('walks every visible text with its field key', () => {
    const t = storyTexts(story({ icons: [{ icon: 'sun', label: 'Sun-cured' }], use: { kind: 'cook', heading: 'How to cook', steps: ['Soak 30 min'] } }));
    expect(t).toEqual(expect.arrayContaining([['icons.0', 'Sun-cured'], ['use.heading', 'How to cook'], ['use.steps.0', 'Soak 30 min']]));
    const p = emptyStoryPage();
    p.hero.line2 = 'Boiled';
    expect(pageWideTexts(p)).toEqual(expect.arrayContaining([['hero.line2', 'Boiled']]));
  });
});

describe('lab values', () => {
  it('matches keys case-insensitively and hides missing values', () => {
    const summary = { curcumin: '5.1 %', 'Volatile oil': '4.2 %', Moisture: 9 };
    expect(labValue(summary, 'Curcumin')).toBe('5.1 %');
    expect(labValue(summary, 'moisture')).toBeNull(); // non-string values are ignored
    expect(resolveProof([{ kind: 'lab', key: 'Curcumin', label: 'Curcumin' }, { kind: 'lab', key: 'Ash', label: 'Ash' }, { kind: 'text', text: 'Lab-tested every batch' }], summary))
      .toEqual(['Curcumin 5.1 %', 'Lab-tested every batch']);
    expect(resolveProof([{ kind: 'lab', key: 'Curcumin', label: 'Curcumin' }], null)).toEqual([]);
  });
});

describe('hardening', () => {
  it('accepts only plain positive integers for ids', () => {
    const p = coerceStoryPage({ productIds: [7, '8', '0x10', '1e2', 2.5, '3.0', -1, 0, Number.MAX_SAFE_INTEGER + 1, ' 9', '99999999999999999999'] });
    expect(p.productIds).toEqual([7, 8]);
  });

  it('coerces hostile input without polluting prototypes', () => {
    const p = coerceStoryPage(JSON.parse('{"cardBlurbs":{"__proto__":"x","constructor":"y","7":"ok"},"productIds":[7]}'));
    expect(p.cardBlurbs).toEqual({ '7': 'ok' });
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(Object.getPrototypeOf(p.cardBlurbs)).toBe(Object.prototype);
    expect(Object.keys(Object.prototype)).toEqual([]);
    for (const bad of [[], 'x', 5, true, null]) expect(coerceProductStory(bad)).toBeNull();
  });

  it('caps array sizes in coercion', () => {
    const big = (n: number, f: (i: number) => unknown) => Array.from({ length: n }, (_, i) => f(i));
    const p = coerceStoryPage({
      faq: big(100_000, () => ({ q: 'q', a: 'a' })), facts: big(100, () => ({ title: 't', text: 'x' })),
      productIds: big(100, (i) => i + 1), labColumns: big(50, (i) => `c${i}`),
      hero: { proof: big(20, (i) => ({ productId: i + 1, key: 'k' })) },
      cardBlurbs: Object.fromEntries(big(50, (i) => [String(i + 1), 'b'])),
    });
    expect(p.faq).toHaveLength(30);
    expect(p.facts).toHaveLength(12);
    expect(p.productIds).toHaveLength(12);
    expect(p.labColumns).toHaveLength(8);
    expect(p.hero.proof).toHaveLength(4);
    expect(Object.keys(p.cardBlurbs)).toHaveLength(12);
    const s = coerceProductStory({
      proofLine: big(50, () => ({ kind: 'text', text: 't' })), icons: big(50, () => ({ icon: 'sun', label: 'x' })),
      processSteps: big(50, () => ({ title: 't', text: 'x' })), use: { steps: big(50, () => 'step') },
      comparison: { rows: big(50, () => ({ aspect: 'a', ours: 'b', theirs: 'c' })) },
    });
    expect([s?.proofLine.length, s?.icons.length, s?.processSteps.length, s?.use?.steps.length, s?.comparison?.rows.length]).toEqual([8, 6, 12, 12, 12]);
  });

  it('turns non-object sections into null', () => {
    const s = coerceProductStory({ originStory: true, comparison: [], grower: 'x', use: 5 });
    expect([s?.originStory, s?.comparison, s?.grower, s?.use]).toEqual([null, null, null, null]);
    expect(coerceProductStory({ originStory: {} })?.originStory).not.toBeNull();
  });

  it('limits text length with friendly messages', () => {
    const p = emptyStoryPage();
    p.hero.line1 = 'x'.repeat(143);
    p.facts = [{ title: 't', text: 'x'.repeat(601) }];
    p.faq = [{ q: 'q', a: 'x'.repeat(3001) }];
    p.closing = 'x'.repeat(601);
    const e = validateStoryPageStructure('turmeric', p);
    expect(e['hero.line1']).toBe("Keep this to 120 characters or fewer (it's 143).");
    expect(e['facts.0.text']).toMatch(/600/);
    expect(e['faq.0.a']).toMatch(/3000/);
    expect(e.closing).toMatch(/600/);
    p.hero.line1 = 'x'.repeat(120);
    expect(validateStoryPageStructure('turmeric', p)['hero.line1']).toBeUndefined();
    const long = 'y'.repeat(121);
    const e2 = validateProductStory(story({
      icons: [{ icon: 'sun', label: long }],
      processSteps: [{ ...steps(1)[0], text: 'z'.repeat(601) }, ...steps(2)],
      originStory: { heading: 'H', bodyMd: 'b'.repeat(3001), photoKey: null, photoAlt: '' },
      grower: { names: long, place: 'p', since: '', bodyMd: '', photoKey: null, photoAlt: '' },
      comparison: { heading: 'h', oursLabel: 'o', theirsLabel: 't', note: '', imageKey: null, imageAlt: '', rows: [{ aspect: 'a', ours: long, theirs: 't', source: '' }, { aspect: 'a', ours: 'o', theirs: 't', source: '' }] },
    }));
    expect(e2['icons.0']).toMatch(/120/);
    expect(e2['processSteps.0.text']).toMatch(/600/);
    expect(e2['originStory.bodyMd']).toMatch(/3000/);
    expect(e2['grower.names']).toMatch(/120/);
    expect(e2['comparison.rows.0.ours']).toMatch(/121/);
  });

  it('requires proof items and blurbs to point at linked products', () => {
    const p = emptyStoryPage();
    p.productIds = [3];
    p.hero.proof = [{ productId: 3, key: 'k', label: 'K' }, { productId: 9, key: 'k', label: 'K' }];
    p.cardBlurbs = { '3': 'ok', '9': 'stray' };
    const e = validateStoryPageStructure('turmeric', p);
    expect(e['hero.proof.0']).toBeUndefined();
    expect(e['hero.proof.1']).toMatch(/Link this product under Products first/);
    expect(e['cardBlurbs.3']).toBeUndefined();
    expect(e['cardBlurbs.9']).toMatch(/isn't linked/);
  });

  it('rejects hidden sections the page layout does not have', () => {
    const p = emptyStoryPage();
    p.hidden = ['faq', 'origin'];
    expect(validateStoryPageStructure('rice', p)).toEqual({});
    const e = validateStoryPageStructure('turmeric', p);
    expect(e['hidden.1']).toBe("This page has no 'origin' section");
    expect(e['hidden.0']).toBeUndefined();
    expect(validateStoryPageStructure('spices', p)['hidden.0']).toMatch(/'faq'/);
  });

  it('words the SEO limits inclusively', () => {
    const p = emptyStoryPage();
    p.seo = { title: 'x'.repeat(70), description: 'x'.repeat(171) };
    const e = validateStoryPageStructure('rice', p);
    expect(e['seo.title']).toBeUndefined();
    expect(e['seo.description']).toBe('Keep it to 170 characters or fewer');
  });
});
