'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Wordmark } from '@/components/brand/Mark';
import { SandboxBadge, usd } from '@/components/ui';

type Props = {
  approvalId: string;
  initialStatus: string;
  approveUrl: string | null;
  returned: 'approved' | 'cancelled' | null;
  item: string;
  qty: number;
  amountCents: number;
  merchant: string;
  reasons: string[];
  allowance: string;
};

const DONE = new Set(['CAPTURED', 'DECLINED', 'EXPIRED', 'FAILED']);

export function ApproveView(p: Props) {
  const [status, setStatus] = useState(p.initialStatus);
  const checking = p.returned === 'approved' && !DONE.has(status);

  // Back from PayPal: ask the server to check the order now (and keep checking) until it's captured.
  useEffect(() => {
    if (p.returned !== 'approved') return;
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/approvals/${p.approvalId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check' }) });
      const j = (await r.json().catch(() => ({}))) as { status?: string };
      if (stop) return;
      if (j.status) setStatus(j.status);
      if (!j.status || !DONE.has(j.status)) setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [p.approvalId, p.returned]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6">
      <header className="flex items-center justify-between">
        <Wordmark />
        <SandboxBadge />
      </header>

      <motion.section
        initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="glass rim-stepup relative mt-10 overflow-hidden !rounded-[28px] p-6"
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-stepup/25 blur-3xl" />
        <p className="eyebrow !text-stepup">Your agent wants to buy</p>
        <h1 className="mt-3 text-[22px] font-semibold leading-snug tracking-[-0.02em] text-text">
          {p.qty} × {p.item}
        </h1>
        <p className="mt-1 text-sm text-muted">{p.merchant}</p>
        <p className="display tabular mt-6 font-mono text-[56px] !tracking-[-0.05em] text-platinum">{usd(p.amountCents)}</p>
        <div className="mt-5 rounded-2xl border border-stepup/25 bg-stepup/[0.07] px-4 py-3 text-[14px] leading-relaxed text-text">
          <span className="text-stepup">Why you&apos;re asked: </span>
          {p.reasons.join(' ') || 'This purchase needs your approval.'}
        </div>
        <p className="mt-4 text-[12.5px] leading-relaxed text-muted">From your allowance “{p.allowance}”. Nothing is charged unless you approve in PayPal.</p>
      </motion.section>

      <div className="mt-6">
        {status === 'CAPTURED' ? (
          <Done text="Approved and paid in PayPal. You can close this page." />
        ) : status === 'DECLINED' || p.returned === 'cancelled' ? (
          <p className="glass p-5 text-center text-sm text-text">Not approved. Nothing was charged.</p>
        ) : status === 'EXPIRED' ? (
          <p className="glass p-5 text-center text-sm text-text">This request expired. Nothing was charged.</p>
        ) : checking ? (
          <p className="glass p-5 text-center text-sm text-muted" aria-live="polite">
            <span className="shimmer rounded-full px-2">Confirming with PayPal…</span>
          </p>
        ) : p.approveUrl ? (
          <a href={p.approveUrl} className="btn-gold flex h-14 w-full items-center justify-center rounded-full text-[16px]">
            Review and approve in PayPal
          </a>
        ) : (
          <p className="text-center text-sm text-muted">This request is no longer open.</p>
        )}
        <p className="mt-4 text-center font-mono text-[11px] tracking-[0.12em] text-muted">PayPal sandbox · test money only</p>
      </div>
    </main>
  );
}

function Done({ text }: { text: string }) {
  return (
    <div className="glass rim-allow flex flex-col items-center gap-3 p-7 text-center shadow-[0_0_60px_-20px_var(--al-allow)]" role="status">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r="26" fill="none" stroke="var(--al-allow)" strokeWidth="2" opacity="0.35" />
        <motion.path d="M17 29 l8 8 l15 -17" fill="none" stroke="var(--al-allow)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }} />
      </svg>
      <p className="text-sm text-text">{text}</p>
    </div>
  );
}
