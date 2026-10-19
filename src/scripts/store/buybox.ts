/**
 * Product page interactivity: pack-size radiogroup (arrow keys, `?v=SKU`
 * preselection), quantity spinbutton, add to cart, sticky mobile bar that
 * mirrors the selection (hidden while the on-screen keyboard is open), and the
 * gallery thumbnails. Server-rendered HTML stays fully readable without it.
 */
import { formatINR } from '../../lib/store/money';
import { addToCart, readCart } from './cart';

const LABEL: Record<string, string> = {
  buy: 'Add to cart',
  sold_out: 'Sold out — back soon',
  preorder: 'Pre-order opens soon',
  notify: 'Out of season',
};

export function initBuyBox(signal?: AbortSignal): void {
  const box = document.querySelector<HTMLElement>('[data-buybox]');
  if (!box) return;
  const radios = Array.from(box.querySelectorAll<HTMLButtonElement>('[data-variant]'));
  const qty = box.querySelector<HTMLInputElement>('[data-qty-input]')!;
  const addBtn = box.querySelector<HTMLButtonElement>('[data-add]')!;
  const status = box.querySelector<HTMLElement>('[data-add-status]')!;
  const sticky = document.querySelector<HTMLElement>('[data-sticky-bar]');
  const stickyBtn = document.querySelector<HTMLButtonElement>('[data-add-sticky]');
  let current = radios.find((r) => r.getAttribute('aria-checked') === 'true') ?? radios[0];

  const set = (sel: string, text: string) => document.querySelectorAll<HTMLElement>(sel).forEach((el) => (el.textContent = text));

  function select(r: HTMLButtonElement, focus = false, updateUrl = true) {
    current = r;
    for (const x of radios) {
      const on = x === r;
      x.setAttribute('aria-checked', String(on));
      x.tabIndex = on ? 0 : -1;
    }
    if (focus) r.focus();
    const price = Number(r.dataset.price);
    const mrp = Number(r.dataset.mrp);
    const off = mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
    set('[data-bb-price]', formatINR(price));
    set('[data-bb-mrp]', formatINR(mrp));
    set('[data-bb-off]', `${off}% off`);
    box!.querySelector('[data-bb-mrp-wrap]')?.classList.toggle('hidden', !off);
    box!.querySelector('[data-bb-off]')?.classList.toggle('hidden', !off);
    set('[data-bb-unit]', r.dataset.unit ?? '');
    set('[data-bb-netqty]', r.dataset.netqty ?? '');
    set('[data-bb-sticky-price]', formatINR(price));
    set('[data-bb-sticky-meta]', `${r.dataset.label} · ${r.dataset.unit ?? ''}`);
    const available = r.dataset.availability === 'buy';
    for (const b of [addBtn, stickyBtn]) {
      if (!b) continue;
      b.disabled = !available;
      b.textContent = LABEL[r.dataset.availability ?? 'notify'];
    }
    if (updateUrl && r.dataset.sku) {
      const url = new URL(location.href);
      url.searchParams.set('v', r.dataset.sku);
      history.replaceState(null, '', url);
    }
  }

  radios.forEach((r, i) => {
    r.addEventListener('click', () => select(r));
    r.addEventListener('keydown', (e) => {
      const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (next === undefined && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? radios.length - 1 : (i + (next as number) + radios.length) % radios.length;
      select(radios[j], true);
    });
  });

  const preselect = new URLSearchParams(location.search).get('v');
  const match = preselect ? radios.find((r) => r.dataset.sku === preselect) : undefined;
  if (match) select(match, false, false);

  const clampQty = (n: number) => Math.min(20, Math.max(1, Number.isFinite(n) ? Math.trunc(n) : 1));
  const setQty = (n: number) => {
    qty.value = String(clampQty(n));
  };
  box.querySelector('[data-qty-dec]')?.addEventListener('click', () => setQty(Number(qty.value) - 1));
  box.querySelector('[data-qty-inc]')?.addEventListener('click', () => setQty(Number(qty.value) + 1));
  qty.addEventListener('change', () => setQty(Number(qty.value)));

  function add() {
    if (current.dataset.availability !== 'buy') return;
    const id = Number(current.dataset.id);
    const before = readCart().find((l) => l.variantId === id)?.qty ?? 0;
    const after = addToCart(id, clampQty(Number(qty.value))).find((l) => l.variantId === id)?.qty ?? 0;
    const added = after - before;
    status.replaceChildren(
      added > 0
        ? `Added ${added} × ${current.dataset.label} to your cart${after >= 20 ? ' (20 is the most per pack)' : ''}. `
        : `You already have the most we can sell of this pack (20) in your cart. `,
    );
    const link = document.createElement('a');
    link.href = '/cart';
    link.className = 'underline';
    link.textContent = 'View cart';
    status.append(link);
  }
  addBtn.addEventListener('click', add);
  stickyBtn?.addEventListener('click', add);

  // Hide the sticky bar while the on-screen keyboard is open.
  if (sticky && window.visualViewport) {
    const vv = window.visualViewport;
    const onResize = () => sticky.classList.toggle('hidden', vv.height < window.innerHeight * 0.75);
    vv.addEventListener('resize', onResize, { signal });
  }

  // Gallery thumbnails.
  const main = document.querySelector<HTMLImageElement>('[data-gallery-main]');
  document.querySelectorAll<HTMLButtonElement>('[data-gallery-thumb]').forEach((t) =>
    t.addEventListener('click', () => {
      if (!main) return;
      main.src = t.dataset.src ?? main.src;
      main.alt = t.dataset.alt ?? main.alt;
      document.querySelectorAll('[data-gallery-thumb]').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
    }),
  );
}
