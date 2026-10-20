import { describe, expect, it } from 'vitest';
import { isPublicMediaKey } from '../../src/lib/store/r2';

describe('isPublicMediaKey', () => {
  it.each(['photos/1-a.jpg', 'products/1/a.jpg', 'lab-reports/x.pdf', 'certificates/c.pdf'])('accepts %s', (k) => {
    expect(isPublicMediaKey(k)).toBe(true);
  });
  it.each(['photos', 'photos-private/x', 'photos/../products/x', 'photos//x', 'invoices/x', ''])('rejects "%s"', (k) => {
    expect(isPublicMediaKey(k)).toBe(false);
  });
});
