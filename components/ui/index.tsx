'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Wordmark } from '@/components/brand/Mark';

export const usd = (cents?: number | null) => (cents == null ? '—' : `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'quiet' | 'danger' | 'ghost' | 'gold'; size?: 'sm' | 'md' | 'lg' };
export function Button({ tone = 'primary', size = 'md', className = '', ...p }: BtnProps) {
  const tones = {
    primary: 'btn-lux disabled:opacity-40',
    gold: 'btn-gold disabled:opacity-40',
    quiet: 'btn-glass disabled:opacity-40',
    danger: 'text-block hover:bg-block/10 disabled:opacity-40',
    ghost: 'text-accent hover:underline disabled:opacity-40',
  };
  const sizes = { sm: 'h-8 px-3.5 text-[13px]', md: 'h-10 px-5 text-[15px]', lg: 'h-12 px-6 text-[17px]' };
  return <button {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-full transition-[background-color,opacity,filter] duration-200 ${tones[tone]} ${sizes[size]} ${className}`} />;
}

/** Apple-style text link with a chevron. The chevron is decorative (not part of the accessible name). */
export function Chevron() {
  return (
    <span aria-hidden className="ml-0.5 inline-block translate-y-[-0.02em]">
      ›
    </span>
  );
}

const VERDICT_STYLE = {
  ALLOW: { c: 'var(--al-allow)', word: 'ALLOW' },
  PAID: { c: 'var(--al-allow)', word: 'ALLOW · PAID' },
  STEP_UP: { c: 'var(--al-stepup)', word: 'STEP-UP' },
  APPROVED: { c: 'var(--al-allow)', word: 'APPROVED · PAID' },
  BLOCK: { c: 'var(--al-block)', word: 'BLOCK' },
  REFUNDED: { c: 'var(--al-refund)', word: 'REFUNDED' },
  DECLINED: { c: 'var(--al-muted)', word: 'DECLINED' },
  FAILED: { c: 'var(--al-block)', word: 'PAYMENT FAILED' },
} as const;
export type VerdictChipKind = keyof typeof VERDICT_STYLE;

export function VerdictChip({ kind }: { kind: VerdictChipKind }) {
  const s = VERDICT_STYLE[kind];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.02em]" style={{ color: s.c }}>
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: s.c }} />
      {s.word}
    </span>
  );
}

export function CopyId({ label, value }: { label: string; value?: string | null }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-0.5 font-mono text-[11px] text-muted-2 transition-colors hover:bg-white/10 hover:text-text"
      title={`Copy ${label} ${value}`}
    >
      <span>{label}</span>
      <span className="truncate text-text">{value}</span>
      <span aria-live="polite" className="text-allow">{done ? '✓' : ''}</span>
    </button>
  );
}

export function SandboxBadge() {
  return <span className="inline-flex items-center rounded-full bg-stepup/[0.12] px-2.5 py-0.5 text-[12px] font-medium text-stepup">PayPal sandbox</span>;
}

/** Apple-style global nav: a thin translucent bar, small centered links. */
export function TopBar({ current }: { current?: 'errand' | 'lab' | 'control-room' | 'home' | 'replay' }) {
  const link = (href: string, key: string, text: string) => (
    <Link href={href} aria-current={current === key ? 'page' : undefined} className={`whitespace-nowrap text-[12px] transition-colors duration-200 ${current === key ? 'text-text' : 'text-[#d2d2d7]/80 hover:text-text'}`}>
      {text}
    </Link>
  );
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[rgba(22,22,23,0.8)] backdrop-blur-xl backdrop-saturate-[1.8]">
      <div className="mx-auto flex h-11 max-w-[1024px] items-center justify-between gap-6 px-5">
        <Link href="/" aria-label="ALLOWANCE home" className="shrink-0 rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 sm:gap-8">
          {link('/replay', 'replay', 'Replay')}
          {link('/errand', 'errand', 'Errand')}
          {link('/lab', 'lab', 'Attack Lab')}
          {link('/control-room', 'control-room', 'Control Room')}
        </nav>
        <span className="hidden shrink-0 md:inline-flex">
          <SandboxBadge />
        </span>
      </div>
    </header>
  );
}
