import { expect, it } from 'vitest';
import { MAX_LINES, MAX_QTY, addLine, itemCount, removeLine, sanitizeLines, setLineQty } from '../../src/lib/store/cart-lines';

it('sanitises a stored cart: drops junk and any price, merges duplicates, caps quantities and lines', () => {
  expect(sanitizeLines(null)).toEqual([]);
  expect(
    sanitizeLines([
      { variantId: 1, qty: 2, price: 1 }, { variantId: '1', qty: 3 }, { variantId: 2, qty: 0 }, { variantId: -3, qty: 1 },
      { variantId: 4, qty: 'x' }, { variantId: 5, qty: 99 }, { variantId: 6, qty: 1.9 }, null,
    ]),
  ).toEqual([{ variantId: 1, qty: 5 }, { variantId: 5, qty: MAX_QTY }, { variantId: 6, qty: 1 }]);
  expect(sanitizeLines(Array.from({ length: 30 }, (_, i) => ({ variantId: i + 1, qty: 1 })))).toHaveLength(MAX_LINES);
});

it('adds, sets, removes and counts lines', () => {
  const lines = addLine(addLine(addLine([], 7, 2), 7, 1), 9, 1);
  expect(lines).toEqual([{ variantId: 7, qty: 3 }, { variantId: 9, qty: 1 }]);
  expect(itemCount(lines)).toBe(4);
  expect(setLineQty(lines, 7, 25)).toEqual([{ variantId: 7, qty: MAX_QTY }, { variantId: 9, qty: 1 }]);
  expect(setLineQty(lines, 7, 0)).toEqual([{ variantId: 9, qty: 1 }]);
  expect(removeLine(lines, 9)).toEqual([{ variantId: 7, qty: 3 }]);
});
