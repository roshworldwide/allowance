'use client';

// Cinematic reveals: content rises out of a soft blur as it enters the viewport.
import { motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

const EASE = [0.16, 1, 0.3, 1] as const;

export function Reveal({ children, delay = 0, y = 26, className = '', as = 'div' }: { children: React.ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'section' | 'li' }) {
  const reduce = useReducedMotion();
  const M = as === 'section' ? motion.section : as === 'li' ? motion.li : motion.div;
  return (
    <M
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(12px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 1.1, delay, ease: EASE }}
    >
      {children}
    </M>
  );
}

/** Word-by-word reveal. The element's text content stays exactly `text` (tests and screen readers). */
export function WordReveal({
  text,
  className = '',
  wordClassName = '',
  accent = [],
  accentClassName = 'text-aurora',
  delay = 0,
  stagger = 0.07,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  accent?: string[];
  accentClassName?: string;
  delay?: number;
  stagger?: number;
}) {
  const reduce = useReducedMotion();
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={i}>
          <motion.span
            className={`inline-block pb-[0.08em] will-change-transform ${accent.includes(w.replace(/[^\w-]/g, '')) ? accentClassName : wordClassName}`}
            initial={reduce ? false : { opacity: 0, y: '0.45em', filter: 'blur(14px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1.15, delay: delay + i * stagger, ease: EASE }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

/** Counts up to `to` once visible. Renders the final value on the server, for reduced motion and without JS. */
export function CountUp({ to, decimals = 0, suffix = '', prefix = '', duration = 1.6, className = '' }: { to: number; decimals?: number; suffix?: string; prefix?: string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const fmt = (v: number) => `${prefix}${v.toFixed(decimals)}${suffix}`;
  useEffect(() => {
    const el = ref.current;
    if (!inView || reduce || !el) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / (duration * 1000));
      el.textContent = fmt(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, to, duration]);
  return (
    <span ref={ref} className={`tabular ${className}`}>
      {fmt(to)}
    </span>
  );
}
