/** fetch with a timeout, so a slow provider can't hang checkout or a webhook. */
export const DEFAULT_TIMEOUT_MS = 8000;

export function timedFetch(base: typeof fetch = fetch, ms = DEFAULT_TIMEOUT_MS): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    base(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(ms) })) as typeof fetch;
}
