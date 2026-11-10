'use client';

// One passive pointer listener for the whole app: the `.spot` element under the cursor gets
// --mx/--my so its radial highlight follows the pointer. No re-renders, rAF-throttled.
import { useEffect } from 'react';

export function Spotlight() {
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    let raf = 0;
    let last: { x: number; y: number; t: EventTarget | null } | null = null;
    const apply = () => {
      raf = 0;
      if (!last) return;
      const el = (last.t as Element | null)?.closest?.('.spot') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${last.x - r.left}px`);
      el.style.setProperty('--my', `${last.y - r.top}px`);
    };
    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY, t: e.target };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
