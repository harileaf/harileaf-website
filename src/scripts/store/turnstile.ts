/**
 * Cloudflare Turnstile with explicit rendering. api.js only scans the page for
 * widgets when it first loads, which misses a checkout reached by client-side
 * navigation, so the script is loaded once and each widget is rendered here.
 */
interface TurnstileApi {
  render(el: HTMLElement, opts: { sitekey: string }): string | undefined;
  reset(id?: string): void;
}
type WithTurnstile = typeof window & { turnstile?: TurnstileApi };

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | undefined;

function loadApi(): Promise<TurnstileApi> {
  const w = window as WithTurnstile;
  if (w.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('Turnstile did not start')));
    s.onerror = () => {
      loading = undefined; // let the next page try again
      reject(new Error('Turnstile failed to load'));
    };
    document.head.append(s);
  });
  return loading;
}

/** Renders the widget in `el` (no-op without one, e.g. Turnstile not configured). */
export async function mountTurnstile(el: HTMLElement | null): Promise<{ reset(): void } | null> {
  if (!el?.dataset.sitekey) return null;
  try {
    const api = await loadApi();
    if (!el.isConnected) return null;
    const id = api.render(el, { sitekey: el.dataset.sitekey });
    return { reset: () => api.reset(id) };
  } catch (err) {
    console.error(err);
    return null; // the server answers 403 "complete the security check" and the shopper can reload
  }
}
