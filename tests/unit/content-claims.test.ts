import { expect, it } from 'vitest';
import { contentClaimProblems } from '../../src/lib/store/content-claims';
import { DEFAULT_CONTENT } from '../../src/lib/cms';
import { PRODUCE_SEASON } from '../../src/content/store/produce-season';

it('flags the old produce-page wording and passes the new defaults', () => {
  expect(contentClaimProblems({ heroBadge: 'HariLeaf Farm · Organic Produce', organicPromiseHeadline: 'Everything we grow is 100% organic. No chemicals, ever.' })).toEqual({
    heroBadge: 'organic',
    organicPromiseHeadline: '100% organic, no chemicals',
  });
  expect(contentClaimProblems(DEFAULT_CONTENT as unknown as Record<string, unknown>)).toEqual({});
  const { howToTell, ...season } = PRODUCE_SEASON;
  expect(contentClaimProblems({ ...season, ...Object.fromEntries(howToTell.map((t, i) => [`howToTell${i}`, t])) })).toEqual({});
});
