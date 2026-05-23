// Runs on every Astro page-load (including View Transitions navigations).
// Uses data attributes for opt-in: data-magnetic, data-tilt, data-cursor-glow-zone.
// All effects are skipped when prefers-reduced-motion is set or on touch devices.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = 'ontouchstart' in window;

// ── 1. Scroll progress bar ─────────────────────────────────────────────────
function initScrollProgress() {
  const bar = document.getElementById('scroll-progress');
  if (!bar) return;
  const update = () => {
    const scrollable = document.body.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    bar.style.width = `${Math.min((window.scrollY / scrollable) * 100, 100)}%`;
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ── 2. Magnetic CTAs ───────────────────────────────────────────────────────
function initMagnetic() {
  if (isTouch) return;
  const MAX_X = 8;
  const MAX_Y = 5;
  const RANGE = 80;

  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach(el => {
    el.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const factor = Math.max(0, (RANGE - dist) / RANGE);
      const tx = dx * factor * (MAX_X / (RANGE / 2));
      const ty = dy * factor * (MAX_Y / (RANGE / 2));
      el.style.transform = `translate(${tx}px, ${ty}px)`;
      el.style.transition = 'transform 100ms ease-out';
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = 'translate(0, 0)';
      el.style.transition = 'transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)';
    });
  });
}

// ── 3. 3D card tilt ────────────────────────────────────────────────────────
function initTilt() {
  if (isTouch) return;
  const MAX_TILT = 6;

  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach(el => {
    el.style.transformStyle = 'preserve-3d';

    el.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      const rotX = -y * MAX_TILT * 2;
      const rotY = x * MAX_TILT * 2;
      el.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.02)`;
      el.style.boxShadow = `${rotY * 1.5}px ${-rotX * 1.5}px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(25,106,94,0.08)`;
      el.style.transition = 'transform 80ms ease-out, box-shadow 80ms ease-out';
    });

    el.addEventListener('mouseleave', () => {
      el.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale(1)';
      el.style.boxShadow = '';
      el.style.transition = 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 400ms';
    });
  });
}

// ── 4. Hero cursor glow ────────────────────────────────────────────────────
function initCursorGlow() {
  if (isTouch) return;
  const zone = document.querySelector<HTMLElement>('[data-cursor-glow-zone]');
  const glow = document.getElementById('hero-glow');
  if (!zone || !glow) return;

  let cx = 50, cy = 50, targetX = 50, targetY = 50;

  zone.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = zone.getBoundingClientRect();
    targetX = ((e.clientX - rect.left) / rect.width) * 100;
    targetY = ((e.clientY - rect.top) / rect.height) * 100;
    glow.style.opacity = '1';
  });

  zone.addEventListener('mouseleave', () => {
    glow.style.opacity = '0';
  });

  function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

  (function animate() {
    cx = lerp(cx, targetX, 0.08);
    cy = lerp(cy, targetY, 0.08);
    glow.style.setProperty('--cx', `${cx}%`);
    glow.style.setProperty('--cy', `${cy}%`);
    requestAnimationFrame(animate);
  })();
}

// ── Init & lifecycle ───────────────────────────────────────────────────────
function init() {
  initScrollProgress();
  if (!reducedMotion) {
    initMagnetic();
    initTilt();
    initCursorGlow();
  }
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', () => {
  const bar = document.getElementById('scroll-progress');
  if (bar) bar.style.width = '0%';
});
