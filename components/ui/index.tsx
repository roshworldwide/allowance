'use client';

import Link from 'next/link';
import { useState } from 'react';

export const usd = (cents?: number | null) => (cents == null ? '—' : `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'quiet' | 'danger' | 'ghost'; size?: 'sm' | 'md' };
export function Button({ tone = 'primary', size = 'md', className = '', ...p }: BtnProps) {
  const tones = {
    primary: 'bg-accent text-ink hover:brightness-110 disabled:opacity-40',
    quiet: 'border border-line bg-surface-2 text-text hover:border-accent/60 disabled:opacity-40',
    danger: 'border border-block/50 text-block hover:bg-block/10 disabled:opacity-40',
    ghost: 'text-muted hover:text-text disabled:opacity-40',
  };
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm' };
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[filter,background-color,border-color] focus-visible:outline-2 ${tones[tone]} ${sizes[size]} ${className}`} />;
}

const VERDICT_STYLE = {
  ALLOW: { cls: 'border-allow/50 bg-allow/10 text-allow', icon: '✓', word: 'ALLOW' },
  PAID: { cls: 'border-allow/50 bg-allow/10 text-allow', icon: '✓', word: 'ALLOW · PAID' },
  STEP_UP: { cls: 'border-stepup/50 bg-stepup/10 text-stepup', icon: '!', word: 'STEP-UP' },
  APPROVED: { cls: 'border-allow/50 bg-allow/10 text-allow', icon: '✓', word: 'APPROVED · PAID' },
  BLOCK: { cls: 'border-block/50 bg-block/10 text-block', icon: '✕', word: 'BLOCK' },
  REFUNDED: { cls: 'border-refund/50 bg-refund/10 text-refund', icon: '↺', word: 'REFUNDED' },
  DECLINED: { cls: 'border-line bg-surface-2 text-muted', icon: '–', word: 'DECLINED' },
  FAILED: { cls: 'border-block/50 bg-block/10 text-block', icon: '!', word: 'PAYMENT FAILED' },
} as const;
export type VerdictChipKind = keyof typeof VERDICT_STYLE;

export function VerdictChip({ kind }: { kind: VerdictChipKind }) {
  const s = VERDICT_STYLE[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
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
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-ink/60 px-1.5 py-0.5 font-mono text-[11px] text-muted hover:text-text"
      title={`Copy ${label} ${value}`}
    >
      <span className="text-muted/80">{label}</span>
      <span className="truncate text-text">{value}</span>
      <span aria-live="polite" className="text-allow">{done ? '✓' : ''}</span>
    </button>
  );
}

export function SandboxBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-stepup/40 px-2.5 py-0.5 font-mono text-[11px] text-stepup">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-stepup" />
      PayPal sandbox
    </span>
  );
}

export function TopBar({ current }: { current?: 'errand' | 'lab' | 'control-room' | 'home' }) {
  const link = (href: string, key: string, text: string, short: string) => (
    <Link href={href} aria-current={current === key ? 'page' : undefined} className={`whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] sm:px-2.5 sm:text-sm ${current === key ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'}`}>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{text}</span>
    </Link>
  );
  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b border-line px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="wordmark text-sm text-text">
          ALLOWANCE
        </Link>
        <span className="hidden sm:inline-flex">
          <SandboxBadge />
        </span>
      </div>
      <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1">
        {link('/errand', 'errand', 'Errand', 'Errand')}
        {link('/lab', 'lab', 'Attack Lab', 'Lab')}
        {link('/control-room', 'control-room', 'Control Room', 'Studio')}
      </nav>
    </header>
  );
}
