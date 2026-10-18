/**
 * Runs `init` for every page the visitor sees. With Astro view transitions
 * (<ClientRouter /> in BaseLayout) bundled scripts execute only once, so page
 * setup must hook `astro:page-load` (fired on the first load and after every
 * swap). Each run gets a signal that is aborted before the next one, for
 * listeners on window/document that would otherwise pile up.
 */
export function onEveryPage(init: (signal: AbortSignal) => void): void {
  let current: AbortController | undefined;
  const run = () => {
    current?.abort();
    current = new AbortController();
    init(current.signal);
  };
  if (document.querySelector('meta[name="astro-view-transitions-enabled"]')) document.addEventListener('astro:page-load', run);
  else run();
}
