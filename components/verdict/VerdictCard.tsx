'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button, CopyId, usd, VerdictChip } from '@/components/ui';
import { cardPhase, type Card } from '@/components/errand/state';

const OUTCOME = {
  PASS: 'text-allow',
  FAIL: 'text-block',
  STEP_UP: 'text-stepup',
  SKIP: 'text-muted',
} as const;

export function VerdictCard({
  card,
  undoWindowSec = 600,
  onUndo,
  onDecline,
  onApproveInApp,
  readOnly,
}: {
  card: Card;
  undoWindowSec?: number;
  onUndo?: (id: string) => Promise<void>;
  onDecline?: (approvalId: string) => Promise<void>;
  onApproveInApp?: (approvalId: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const d = card.decision;
  const phase = cardPhase(card);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fired = d.rules.filter((r) => r.outcome === 'FAIL' || r.outcome === 'STEP_UP');
  const accent = phase === 'BLOCK' || phase === 'FAILED' ? 'before:bg-block' : phase === 'STEP_UP' ? 'before:bg-stepup' : phase === 'REFUNDED' ? 'before:bg-refund' : phase === 'DECLINED' ? 'before:bg-line' : 'before:bg-allow';

  return (
    <article className={`relative overflow-hidden rounded-card border border-line bg-surface p-3.5 before:absolute before:inset-y-0 before:left-0 before:w-1 ${accent}`}>
      <div className="flex items-start justify-between gap-2">
        <VerdictChip kind={phase} />
        <time className="font-mono text-[11px] text-muted" dateTime={d.at}>
          {new Date(d.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </time>
      </div>
      <h3 className="mt-2 text-sm font-medium leading-snug text-text">
        {d.item ? `${d.qty ?? 1} × ${d.item}` : <span className="font-mono">{d.tool}</span>}
        <span className="float-right ml-2 font-mono text-text">{usd(d.amountCents)}</span>
      </h3>
      <p className={`mt-1 text-[13px] leading-snug ${phase === 'BLOCK' ? 'text-block' : phase === 'STEP_UP' ? 'text-stepup' : 'text-muted'}`}>{d.summary}</p>
      {card.explanation && (
        <p className="mt-2 rounded-lg bg-ink/60 px-2.5 py-1.5 text-[13px] text-text">
          {card.explanation}
          <span className="ml-1.5 whitespace-nowrap font-mono text-[10px] text-muted">AI-written from the rule trace</span>
        </p>
      )}

      {phase === 'STEP_UP' && card.approval?.status === 'PENDING' && !readOnly && (
        <StepUpBox card={card} busy={busy} setBusy={setBusy} onDecline={onDecline} onApproveInApp={onApproveInApp} />
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <CopyId label="order" value={card.purchase?.orderId} />
        <CopyId label="capture" value={card.purchase?.captureId} />
        <CopyId label="refund" value={card.refund?.refundId} />
        {(phase === 'PAID' || phase === 'APPROVED') && !readOnly && onUndo && card.capturedAt && (
          <UndoButton capturedAt={card.capturedAt} windowSec={undoWindowSec} busy={busy} onUndo={async () => {
            setBusy(true);
            try {
              await onUndo(d.decisionId);
            } finally {
              setBusy(false);
            }
          }} />
        )}
      </div>

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 flex w-full items-center justify-between text-left font-mono text-[11px] text-muted hover:text-text">
        <span>
          rule trace · {fired.length ? fired.map((r) => r.id).join(' ') + ' fired' : 'all clear'} · {(d.latencyUs / 1000).toFixed(2)} ms
        </span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ol className="mt-1.5 space-y-0.5 border-t border-line pt-1.5">
          {d.rules.map((r) => (
            <li key={r.id} className="grid grid-cols-[34px_120px_62px_1fr] gap-1.5 font-mono text-[10.5px] leading-snug">
              <span className="text-muted">{r.id}</span>
              <span className="truncate text-text">{r.name}</span>
              <span className={OUTCOME[r.outcome as keyof typeof OUTCOME]}>{r.outcome}</span>
              <span className="text-muted">{r.message ?? r.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function UndoButton({ capturedAt, windowSec, busy, onUndo }: { capturedAt: number; windowSec: number; busy: boolean; onUndo: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((capturedAt + windowSec * 1000 - now) / 1000));
  if (left === 0) return <span className="font-mono text-[11px] text-muted">undo window closed</span>;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <Button tone="quiet" size="sm" onClick={onUndo} disabled={busy} className="ml-auto border-refund/50 text-refund">
      ↺ Undo <span className="font-mono">{mm}:{ss}</span>
    </Button>
  );
}

function StepUpBox({ card, busy, setBusy, onDecline, onApproveInApp }: { card: Card; busy: boolean; setBusy: (b: boolean) => void; onDecline?: (id: string) => Promise<void>; onApproveInApp?: (id: string) => Promise<void> }) {
  const a = card.approval!;
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (!a.approvePage) return;
    void QRCode.toString(a.approvePage, { type: 'svg', margin: 1, color: { dark: '#0A0F1E', light: '#E8ECF6' } }).then(setSvg);
  }, [a.approvePage]);
  const run = (fn?: (id: string) => Promise<void>) => async () => {
    if (!fn) return;
    setBusy(true);
    try {
      await fn(a.approvalId);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 flex gap-3 rounded-xl border border-stepup/40 bg-stepup/5 p-2.5">
      {svg ? <div className="h-[92px] w-[92px] shrink-0 overflow-hidden rounded-lg" role="img" aria-label="QR code to approve on your phone" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="h-[92px] w-[92px] shrink-0 rounded-lg bg-surface-2" />}
      <div className="min-w-0 text-[12.5px]">
        <p className="font-medium text-stepup">PayPal is asking you</p>
        <p className="mt-0.5 text-muted">Scan to approve on your phone, in PayPal (sandbox).</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.approvePage && (
            <a href={a.approvePage} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-xl bg-stepup px-3 text-xs font-medium text-ink">
              Open approval
            </a>
          )}
          <Button tone="quiet" size="sm" disabled={busy} onClick={run(onDecline)}>
            Decline
          </Button>
        </div>
        <button type="button" disabled={busy} onClick={run(onApproveInApp)} className="mt-1.5 text-[11px] text-muted underline decoration-dotted hover:text-text">
          in-app approval (fallback)
        </button>
      </div>
    </div>
  );
}
