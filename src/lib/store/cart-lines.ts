/**
 * Cart lines as stored in the browser (localStorage `hl_cart_v1`): only
 * variant ids and quantities — never prices. The server re-prices on every
 * quote and at checkout. Shared by the browser cart and the quote API.
 */

export interface CartLine {
  variantId: number;
  qty: number;
}

export const CART_KEY = 'hl_cart_v1';
export const MAX_QTY = 20;
export const MAX_LINES = 20;

/** Accepts anything (corrupted storage, tampered JSON) and returns valid, merged lines. */
export function sanitizeLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<number, number>();
  for (const x of raw) {
    const r = x as { variantId?: unknown; qty?: unknown } | null;
    const id = Number(r?.variantId);
    const qty = Math.trunc(Number(r?.qty));
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(qty) || qty <= 0) continue;
    merged.set(id, Math.min(MAX_QTY, (merged.get(id) ?? 0) + qty));
  }
  return [...merged.entries()].slice(0, MAX_LINES).map(([variantId, qty]) => ({ variantId, qty }));
}

export function addLine(lines: CartLine[], variantId: number, qty: number): CartLine[] {
  return sanitizeLines([...lines, { variantId, qty }]);
}

export function setLineQty(lines: CartLine[], variantId: number, qty: number): CartLine[] {
  const q = Math.trunc(qty);
  if (q <= 0) return lines.filter((l) => l.variantId !== variantId);
  return sanitizeLines(lines.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(MAX_QTY, q) } : l)));
}

export const removeLine = (lines: CartLine[], variantId: number) => lines.filter((l) => l.variantId !== variantId);
export const itemCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0);
