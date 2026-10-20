/**
 * Cloudflare Turnstile with explicit rendering. api.js only scans the page for
 * widgets when it first loads, which misses a checkout reached by client-side
 * navigation, so the script is loaded once and each widget is rendered here.
 */
interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: { sitekey: string; callback?: (token: string) => void; 'expired-callback'?: () => void; 'error-callback'?: () => void; 'unsupported-callback'?: () => void },
  ): string | undefined;
  reset(id?: string): void;
}
export interface TurnstileWidget {
  reset(): void;
  /**
   * The solved challenge's token, waiting for it (up to `ms`) when the shopper submits before it finishes.
   * Null at once if the widget has failed (wrong domain, blocked, unsupported browser): the server then
   * answers 403 "complete the security check" instead of the button hanging.
   */
  token(ms?: number): Promise<string | null>;
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
export async function mountTurnstile(el: HTMLElement | null): Promise<TurnstileWidget | null> {
  if (!el?.dataset.sitekey) return null;
  try {
    const api = await loadApi();
    if (!el.isConnected) return null;
    let current: string | null = null;
    let failed = false;
    let waiting: Array<(t: string | null) => void> = [];
    const settle = (t: string | null) => {
      waiting.forEach((w) => w(t));
      waiting = [];
    };
    const fail = () => {
      failed = true;
      settle(null);
    };
    const id = api.render(el, {
      sitekey: el.dataset.sitekey,
      callback: (t) => {
        current = t;
        failed = false;
        settle(t);
      },
      'expired-callback': () => (current = null),
      'error-callback': fail,
      'unsupported-callback': fail,
    });
    return {
      reset: () => {
        current = null;
        failed = false;
        api.reset(id);
      },
      token: (ms = 8000) =>
        current
          ? Promise.resolve(current)
          : failed
            ? Promise.resolve(null)
            : new Promise<string | null>((resolve) => {
                const timer = setTimeout(() => resolve(null), ms); // the server then asks them to complete the check
                waiting.push((t) => {
                  clearTimeout(timer);
                  resolve(t);
                });
              }),
    };
  } catch (err) {
    console.error(err);
    return null; // the server answers 403 "complete the security check" and the shopper can reload
  }
}
