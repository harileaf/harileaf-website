import { onEveryPage } from './page-load';

/**
 * Web3Forms sends the visitor back to `?success=true`. The contact and produce
 * pages are prerendered, so the server never sees the query string: reveal the
 * "sent" banner here instead.
 */
onEveryPage(() => {
  if (new URLSearchParams(location.search).get('success') === 'true') document.querySelector('[data-form-sent]')?.removeAttribute('hidden');
});
