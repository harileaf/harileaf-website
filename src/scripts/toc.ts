/**
 * Highlights the "On this page" link for the section being read. The current
 * section is the last one whose top has passed 35% of the viewport; at the
 * bottom of the page it is the last section, which on short pages never
 * scrolls that far up.
 */
export function initToc(signal: AbortSignal): void {
  const links = document.querySelectorAll<HTMLAnchorElement>('.toc-link');
  const sections = Array.from(links, (l) => document.getElementById(l.dataset.section ?? '')).filter((s): s is HTMLElement => s !== null);
  if (!links.length || !sections.length) return;

  let queued = false;
  const update = () => {
    queued = false;
    const line = window.innerHeight * 0.35;
    let current = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) current = sections[sections.length - 1];
    links.forEach((l) => {
      const active = l.dataset.section === current.id;
      l.classList.toggle('text-primary', active);
      l.classList.toggle('font-bold', active);
      l.classList.toggle('border-primary', active);
      l.classList.toggle('text-on-surface-variant', !active);
      l.classList.toggle('border-transparent', !active);
    });
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', queue, { passive: true, signal });
  window.addEventListener('resize', queue, { passive: true, signal });
  update();
}
