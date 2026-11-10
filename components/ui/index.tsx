'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Wordmark } from '@/components/brand/Mark';

export const usd = (cents?: number | null) => (cents == null ? '—' : `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'quiet' | 'danger' | 'ghost' | 'gold'; size?: 'sm' | 'md' | 'lg' };
export function Button({ tone = 'primary', size = 'md', className = '', ...p }: BtnProps) {
  const tones = {
    primary: 'btn-lux font-semibold disabled:opacity-40',
    gold: 'btn-gold font-semibold disabled:opacity-40',
    quiet: 'btn-glass text-text disabled:opacity-40',
    danger: 'border border-block/40 bg-block/[0.06] text-block hover:bg-block/15 disabled:opacity-40',
    ghost: 'text-muted hover:text-text disabled:opacity-40',
  };
  const sizes = { sm: 'h-8 px-3.5 text-xs', md: 'h-11 px-5 text-sm', lg: 'h-13 px-7 text-[15px]' };
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-full tracking-[-0.005em] transition-[filter,background-color,border-color,transform,opacity] duration-300 ${tones[tone]} ${sizes[size]} ${className}`}
    />
  );
}

const VERDICT_STYLE = {
  ALLOW: { c: 'var(--al-allow)', icon: '✓', word: 'ALLOW' },
  PAID: { c: 'var(--al-allow)', icon: '✓', word: 'ALLOW · PAID' },
  STEP_UP: { c: 'var(--al-stepup)', icon: '!', word: 'STEP-UP' },
  APPROVED: { c: 'var(--al-allow)', icon: '✓', word: 'APPROVED · PAID' },
  BLOCK: { c: 'var(--al-block)', icon: '✕', word: 'BLOCK' },
  REFUNDED: { c: 'var(--al-refund)', icon: '↺', word: 'REFUNDED' },
  DECLINED: { c: 'var(--al-muted)', icon: '–', word: 'DECLINED' },
  FAILED: { c: 'var(--al-block)', icon: '!', word: 'PAYMENT FAILED' },
} as const;
export type VerdictChipKind = keyof typeof VERDICT_STYLE;

export function VerdictChip({ kind }: { kind: VerdictChipKind }) {
  const s = VERDICT_STYLE[kind];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] font-mono text-[10.5px] font-semibold tracking-[0.12em]"
      style={{
        color: s.c,
        background: `color-mix(in srgb, ${s.c} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${s.c} 45%, transparent), 0 0 24px -8px ${s.c}`,
      }}
    >
      <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] text-ink" style={{ background: s.c, boxShadow: `0 0 10px ${s.c}` }}>
        {s.icon}
      </span>
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
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[10.5px] text-muted transition-colors hover:border-white/25 hover:text-text"
      title={`Copy ${label} ${value}`}
    >
      <span className="uppercase tracking-[0.12em] text-muted/80">{label}</span>
      <span className="truncate text-text">{value}</span>
      <span aria-live="polite" className="text-allow">{done ? '✓' : ''}</span>
    </button>
  );
}

export function SandboxBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-stepup/30 bg-stepup/[0.06] px-2.5 py-0.5 font-mono text-[10.5px] tracking-[0.08em] text-stepup">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-stepup breathe shadow-[0_0_8px_var(--al-stepup)]" />
      PayPal sandbox
    </span>
  );
}

export function TopBar({ current }: { current?: 'errand' | 'lab' | 'control-room' | 'home' }) {
  const link = (href: string, key: string, text: string, short: string) => (
    <Link
      href={href}
      aria-current={current === key ? 'page' : undefined}
      className={`relative whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-colors duration-300 sm:px-3.5 ${current === key ? 'bg-white/[0.08] text-text shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]' : 'text-muted hover:text-text'}`}
    >
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{text}</span>
    </Link>
  );
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
      <div className="glass mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-2 !rounded-full bg-[rgba(8,10,18,0.72)] px-3 sm:px-5">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="ALLOWANCE home" className="rounded-full">
            <Wordmark />
          </Link>
          <span className="hidden md:inline-flex">
            <SandboxBadge />
          </span>
        </div>
        <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1">
          {link('/replay', 'replay', 'Replay', 'Replay')}
          {link('/errand', 'errand', 'Errand', 'Errand')}
          {link('/lab', 'lab', 'Attack Lab', 'Lab')}
          {link('/control-room', 'control-room', 'Control Room', 'Studio')}
        </nav>
      </div>
    </header>
  );
}
