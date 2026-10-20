import { expect, it } from 'vitest';
import { isPublicMediaKey } from '../../src/lib/store/r2';

it('isPublicMediaKey serves only the public prefixes and refuses traversal and private keys', () => {
  for (const k of ['photos/1-a.jpg', 'products/1/a.jpg', 'lab-reports/x.pdf', 'certificates/c.pdf']) expect([k, isPublicMediaKey(k)]).toEqual([k, true]);
  for (const k of ['photos', 'photos-private/x', 'photos/../products/x', 'photos//x', 'invoices/x', '']) expect([k, isPublicMediaKey(k)]).toEqual([k, false]);
});
