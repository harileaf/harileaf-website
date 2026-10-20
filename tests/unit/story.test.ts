import { describe, expect, it } from 'vitest';
import {
  EMPTY_STORY, coerceProductStory, coerceStoryPage, emptyStoryPage, validateProductStory, validateStoryPageStructure, type ProductStory,
} from '../../src/lib/store/story';

const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Step ${i + 1}`, text: 'Done by hand.', photoKey: null, photoAlt: '' }));
const story = (over: Partial<ProductStory> = {}): ProductStory => ({ ...EMPTY_STORY, ...over });
const big = (n: number, f: (i: number) => unknown) => Array.from({ length: n }, (_, i) => f(i));

describe('coercion', () => {
  it('never throws on hostile input: drops junk, keeps prototypes clean and caps sizes', () => {
    const p = coerceStoryPage(JSON.parse(JSON.stringify({
      hero: { line1: ' Haldi ', proof: [{ productId: '3', key: 'Curcumin', label: 'Curcumin' }, 'x'] },
      productIds: [3, 'a', '8', '0x10', '1e2', 2.5, -1, 0, Number.MAX_SAFE_INTEGER + 1, 3],
      hidden: ['faq', 'hero'],
      faq: big(100_000, () => ({ q: 'q', a: 'a' })), labColumns: big(50, (i) => `c${i}`),
    })));
    expect(p.hero.line1).toBe('Haldi');
    expect(p.hero.proof).toEqual([{ productId: 3, key: 'Curcumin', label: 'Curcumin' }]);
    expect(p.productIds).toEqual([3, 8]);
    expect(p.hidden).toEqual(['faq']);
    expect([p.faq.length, p.labColumns.length]).toEqual([30, 8]);

    const proto = coerceStoryPage(JSON.parse('{"cardBlurbs":{"__proto__":"x","constructor":"y","7":"ok"},"productIds":[7]}'));
    expect(proto.cardBlurbs).toEqual({ '7': 'ok' });
    expect(Object.keys(Object.prototype)).toEqual([]);

    for (const bad of [null, 'x', 5, []]) expect(coerceStoryPage(bad)).toEqual(emptyStoryPage());
    for (const bad of [null, [], 'x', 5, true]) expect(coerceProductStory(bad)).toBeNull();
    const s = coerceProductStory({
      icons: [{ icon: 'sun', label: 'Sun-cured' }, { icon: 'rocket', label: 'x' }], originStory: true, comparison: [],
      processSteps: big(50, () => ({ title: 't', text: 'x' })), proofLine: big(50, () => ({ kind: 'text', text: 't' })),
    });
    expect(s?.icons).toEqual([{ icon: 'sun', label: 'Sun-cured' }]);
    expect([s?.originStory, s?.comparison]).toEqual([null, null]);
    expect([s?.processSteps.length, s?.proofLine.length]).toEqual([12, 8]);
  });
});

describe('structure', () => {
  it('enforces the key page limits: counts, lengths, linked products and the fixed layout', () => {
    const p = emptyStoryPage();
    p.seo = { title: 'x'.repeat(70), description: 'x'.repeat(171) };
    p.hero.line1 = 'x'.repeat(143);
    p.facts = Array.from({ length: 7 }, () => ({ title: 't', text: 'x' }));
    p.productIds = [3];
    p.hero.proof = [{ productId: 3, key: 'k', label: 'K' }, { productId: 9, key: 'k', label: 'K' }, { productId: 3, key: 'j', label: 'J' }];
    p.cardBlurbs = { '3': 'ok', '9': 'stray' };
    p.hidden = ['faq', 'origin'];
    const e = validateStoryPageStructure('turmeric', p);
    expect(e['seo.title']).toBeUndefined();
    expect(e['seo.description']).toMatch(/170/);
    expect(e['hero.line1']).toMatch(/120 characters/);
    expect(e.facts).toMatch(/6/);
    expect(e['hero.proof']).toMatch(/2/);
    expect(e['hero.proof.1']).toMatch(/Link this product under Products first/);
    expect(e['cardBlurbs.9']).toMatch(/isn't linked/);
    expect(e['cardBlurbs.3']).toBeUndefined();
    expect(e['hidden.1']).toMatch(/'origin'/);
    expect(e['hidden.0']).toBeUndefined();
  });

  it('a product story needs 3–8 steps, alt text for photos, sources for numbers and library images', () => {
    expect(validateProductStory(story({ processSteps: steps(2) })).processSteps).toMatch(/3/);
    expect(validateProductStory(story({ processSteps: steps(9) })).processSteps).toMatch(/8/);
    expect(validateProductStory(story({ processSteps: [...steps(2), { title: 'Dug', text: 'By hand', photoKey: 'photos/a.jpg', photoAlt: '' }] }))['processSteps.2']).toMatch(/Describe the photo/);
    expect(validateProductStory(story({ originStory: { heading: 'Wada', bodyMd: 'Kolam rice', photoKey: '../invoices/x.pdf', photoAlt: 'x' } }))['originStory.photoKey']).toMatch(/Choose a photo/);
    const comparison = { heading: 'Stone vs mill', oursLabel: 'Ours', theirsLabel: 'High-speed mill', note: '', imageKey: null, imageAlt: '', rows: [
      { aspect: 'Heat', ours: 'Stays cool', theirs: 'Friction heat', source: '' },
      { aspect: 'Fibre', ours: '3.2 g', theirs: '0.6 g', source: '' },
    ] };
    expect(validateProductStory(story({ comparison }))['comparison.rows.1']).toMatch(/numbers need a source/);
    comparison.rows[1].source = 'IFCT 2017';
    expect(validateProductStory(story({ comparison }))).toEqual({});
  });
});
