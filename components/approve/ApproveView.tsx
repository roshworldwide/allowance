'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
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
        <span className="wordmark text-sm text-text">ALLOWANCE</span>
        <SandboxBadge />
      </header>

      <section className="mt-8 rounded-card border border-stepup/40 bg-surface p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-stepup">Your agent wants to buy</p>
        <h1 className="mt-2 text-xl font-semibold leading-snug text-text">
          {p.qty} × {p.item}
        </h1>
        <p className="mt-1 text-sm text-muted">{p.merchant}</p>
        <p className="mt-4 font-mono text-3xl text-text">{usd(p.amountCents)}</p>
        <div className="mt-4 rounded-xl bg-ink/60 px-3 py-2.5 text-[14px] text-text">
          <span className="text-stepup">Why you&apos;re asked: </span>
          {p.reasons.join(' ') || 'This purchase needs your approval.'}
        </div>
        <p className="mt-3 text-[12.5px] text-muted">From your allowance “{p.allowance}”. Nothing is charged unless you approve in PayPal.</p>
      </section>

      <div className="mt-6">
        {status === 'CAPTURED' ? (
          <Done text="Approved and paid in PayPal. You can close this page." />
        ) : status === 'DECLINED' || p.returned === 'cancelled' ? (
          <p className="rounded-card border border-line bg-surface p-4 text-center text-sm text-text">Not approved. Nothing was charged.</p>
        ) : status === 'EXPIRED' ? (
          <p className="rounded-card border border-line bg-surface p-4 text-center text-sm text-text">This request expired. Nothing was charged.</p>
        ) : checking ? (
          <p className="rounded-card border border-line bg-surface p-4 text-center text-sm text-muted" aria-live="polite">
            Confirming with PayPal…
          </p>
        ) : p.approveUrl ? (
          <a href={p.approveUrl} className="flex h-14 w-full items-center justify-center rounded-2xl bg-stepup text-base font-semibold text-ink">
            Review and approve in PayPal
          </a>
        ) : (
          <p className="text-center text-sm text-muted">This request is no longer open.</p>
        )}
        <p className="mt-3 text-center text-[12px] text-muted">PayPal sandbox · test money only</p>
      </div>
    </main>
  );
}

function Done({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-allow/40 bg-surface p-6 text-center" role="status">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r="26" fill="none" stroke="var(--al-allow)" strokeWidth="2" opacity="0.35" />
        <motion.path d="M17 29 l8 8 l15 -17" fill="none" stroke="var(--al-allow)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }} />
      </svg>
      <p className="text-sm text-text">{text}</p>
    </div>
  );
}
