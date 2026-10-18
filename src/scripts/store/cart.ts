/** Browser cart in localStorage. Every change dispatches `hl:cart` with the new lines. */
import { CART_KEY, addLine, itemCount, removeLine, sanitizeLines, setLineQty, type CartLine } from '../../lib/store/cart-lines';

export type { CartLine };

export function readCart(): CartLine[] {
  try {
    return sanitizeLines(JSON.parse(localStorage.getItem(CART_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

function write(lines: CartLine[]): CartLine[] {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(lines));
  } catch {
    // Private mode / storage full: the cart still works for this page view.
  }
  window.dispatchEvent(new CustomEvent('hl:cart', { detail: lines }));
  return lines;
}

export const addToCart = (variantId: number, qty: number) => write(addLine(readCart(), variantId, qty));
export const setCartQty = (variantId: number, qty: number) => write(setLineQty(readCart(), variantId, qty));
export const removeFromCart = (variantId: number) => write(removeLine(readCart(), variantId));
export const clearCart = () => write([]);
export const cartCount = () => itemCount(readCart());

/** Calls `fn` now and whenever the cart changes (this tab or another). */
export function onCartChange(fn: (lines: CartLine[]) => void): void {
  fn(readCart());
  window.addEventListener('hl:cart', (e) => fn((e as CustomEvent<CartLine[]>).detail));
  window.addEventListener('storage', (e) => {
    if (e.key === CART_KEY) fn(readCart());
  });
}
