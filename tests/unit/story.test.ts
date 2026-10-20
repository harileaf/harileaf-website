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
