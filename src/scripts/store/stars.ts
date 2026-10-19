/**
 * Five inline-SVG stars filled to `value` (0–5): a gold row clipped over a grey one.
 * Shared by Stars.astro and reviews rendered in the browser so both look the same.
 * Decorative (aria-hidden): pass the rating as text alongside.
 */
const PATH = 'M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z';

export function starsHtml(value: number, size = 16): string {
  const pct = Math.max(0, Math.min(100, (Math.round(value * 2) / 2 / 5) * 100));
  const row = (color: string) => [1, 2, 3, 4, 5].map(() => `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="flex:none"><path d="${PATH}" fill="${color}"/></svg>`).join('');
  return `<span class="relative inline-flex align-middle" aria-hidden="true" style="width:${size * 5}px;height:${size}px">`
    + `<span class="absolute inset-0 flex">${row('#d9d6cc')}</span>`
    + `<span class="absolute inset-y-0 left-0 flex overflow-hidden" style="width:${pct}%">${row('#b8860b')}</span></span>`;
}
