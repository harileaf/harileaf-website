import { expect, it } from 'vitest';
import { contentClaimProblems } from '../../src/lib/store/content-claims';
import { DEFAULT_CONTENT } from '../../src/lib/cms';

it('flags the old produce-page wording and passes the new defaults', () => {
  expect(contentClaimProblems({ heroBadge: 'HariLeaf Farm · Organic Produce', organicPromiseHeadline: 'Everything we grow is 100% organic. No chemicals, ever.' })).toEqual({
    heroBadge: 'organic',
    organicPromiseHeadline: '100% organic',
  });
  expect(contentClaimProblems(DEFAULT_CONTENT as unknown as Record<string, unknown>)).toEqual({});
});
