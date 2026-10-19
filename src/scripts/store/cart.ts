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

/**
 * "Saved for your next order" (`hl_cart_later_v1`): when a cart mixes goods
 * that must check out separately (e.g. fresh produce and rice), the shopper
 * picks one group and the other waits here, visibly, until the order is
 * placed; then it goes back into the cart. Nothing is ever dropped silently.
 */
export interface LaterLine extends CartLine {
  name: string;
  label: string;
}
const LATER_KEY = 'hl_cart_later_v1';

export function readLater(): LaterLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LATER_KEY) ?? '[]') as unknown;
    const ok = sanitizeLines(raw);
    const meta = new Map((Array.isArray(raw) ? raw : []).map((x) => [Number((x as LaterLine)?.variantId), x as LaterLine]));
    return ok.map((l) => ({ ...l, name: String(meta.get(l.variantId)?.name ?? ''), label: String(meta.get(l.variantId)?.label ?? '') }));
  } catch {
    return [];
  }
}

function writeLater(lines: LaterLine[]): void {
  try {
    if (lines.length) localStorage.setItem(LATER_KEY, JSON.stringify(lines));
    else localStorage.removeItem(LATER_KEY);
  } catch {
    /* private mode: the split still works for this page view */
  }
}

/** Moves these lines out of the cart into "saved for your next order". */
export function saveForLater(lines: LaterLine[]): void {
  const byId = new Map(readLater().map((l) => [l.variantId, l]));
  for (const l of lines) byId.set(l.variantId, { ...l, qty: Math.min(20, (byId.get(l.variantId)?.qty ?? 0) + l.qty) });
  writeLater([...byId.values()]);
  write(readCart().filter((c) => !lines.some((l) => l.variantId === c.variantId)));
}

/** Puts everything saved for later back into the cart (after an order, or on request). */
export function restoreLater(): void {
  const later = readLater();
  if (!later.length) return;
  writeLater([]);
  let lines = readCart();
  for (const l of later) lines = addLine(lines, l.variantId, l.qty);
  write(lines);
}
