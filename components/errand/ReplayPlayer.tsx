'use client';

// Judge mode: plays a recorded run through the same reducer, lane and cards as the live console.
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { FirewallLane } from '@/components/lane/FirewallLane';
import { Button, usd } from '@/components/ui';
import { VerdictCard } from '@/components/verdict/VerdictCard';
import { errandReducer, initialErrand, type Step } from './state';

type ReplayEvent = { t: number; source: 'run' | 'bus'; type: string; data: unknown };
export type ReplayFile = {
  meta: { id: string; recordedAt: string; task: string; model: string; allowance: { name: string; budgetCents: number; perPurchaseCapCents: number; stepUpAboveCents: number }; synthetic?: boolean; note?: string };
  events: ReplayEvent[];
};

/**
 * Replay timing: long real-world waits (e.g. approving on a phone) are compressed so the replay never
 * stalls, and consecutive guard decisions are at least `minDecisionGap` apart so each packet can be followed.
 */
function schedule(events: ReplayEvent[], maxGap = 1800, minDecisionGap = 1500) {
  let clock = 0;
  let prev = 0;
  let lastDecision = -Infinity;
  return events.map((e) => {
    const gap = e.t - prev;
    prev = e.t;
    clock += Math.min(gap, maxGap);
    let stretched = false;
    if (e.type === 'decision') {
      if (clock - lastDecision < minDecisionGap) {
        clock = lastDecision + minDecisionGap;
        stretched = true;
      }
      lastDecision = clock;
    }
    return { ...e, at: clock, compressed: gap > maxGap || stretched };
  });
}

export function ReplayPlayer({ replay }: { replay: ReplayFile }) {
  const timeline = useMemo(() => schedule(replay.events), [replay.events]);
  const [state, dispatch] = useReducer(errandReducer, initialErrand);
  const [run, setRun] = useState(0);
  const [pos, setPos] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    const startedAt = Date.now();
    timers.current = timeline.map((e, i) =>
      setTimeout(() => {
        dispatch({ source: e.source, type: e.type, data: e.data, at: startedAt + e.at });
        setPos(i + 1);
      }, e.at + (i === 0 ? 0 : 600)),
    );
    timers.current.push(setTimeout(() => dispatch({ source: 'local', type: 'reset', data: null }), 0));
    return () => timers.current.forEach(clearTimeout);
  }, [timeline, run]);

  const recorded = new Date(replay.meta.recordedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const cards = [...state.order].reverse().map((id) => state.cards[id]!).filter((c) => c?.decision);
  const committed = cards.filter((c) => c.purchase?.status === 'COMPLETED' && c.refund?.status !== 'COMPLETED').reduce((s, c) => s + c.decision.amountCents, 0);
  const compressed = timeline.some((e) => e.compressed);

  return (
    <main className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
      <aside className="space-y-4">
        <section className={`rounded-card border p-4 ${replay.meta.synthetic ? 'border-block/60 bg-block/5' : 'border-line bg-surface'}`}>
          <p className={`font-mono text-[11px] uppercase tracking-[0.12em] ${replay.meta.synthetic ? 'text-block' : 'text-accent'}`}>
            {replay.meta.synthetic ? 'Synthetic preview · fake PayPal · not a sandbox run' : `Replay of a live sandbox run · ${recorded} IST`}
          </p>
          <p className="mt-2 text-sm text-text">“{replay.meta.task}”</p>
          <p className="mt-2 text-[12.5px] text-muted">
            {replay.meta.allowance.name}: {usd(replay.meta.allowance.budgetCents)} · max {usd(replay.meta.allowance.perPurchaseCapCents)} per purchase · ask above {usd(replay.meta.allowance.stepUpAboveCents)} · agent {replay.meta.model}
          </p>
          {compressed && <p className="mt-1 text-[11.5px] text-muted">Timing is adjusted for readability (e.g. the wait while approving on the phone is shortened).</p>}
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Replay progress" aria-valuemin={0} aria-valuemax={timeline.length} aria-valuenow={pos}>
              <div className="h-full bg-accent transition-[width]" style={{ width: `${(pos / Math.max(1, timeline.length)) * 100}%` }} />
            </div>
            <Button tone="quiet" size="sm" onClick={() => { setPos(0); setRun((r) => r + 1); }}>
              Replay
            </Button>
          </div>
          <p className="mt-2 font-mono text-[11px] text-muted">spent {usd(committed)} of {usd(replay.meta.allowance.budgetCents)}</p>
        </section>
        <ReplayTranscript steps={state.steps} />
      </aside>
      <section className="min-w-0 space-y-3">
        <FirewallLane cards={state.cards} order={state.order} model={replay.meta.model} />
        {replay.meta.note && <p className="text-[12.5px] text-muted">{replay.meta.note}</p>}
      </section>
      <aside className="space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Verdicts {cards.length ? `· ${cards.length}` : ''}</h2>
        {cards.map((c) => (
          <VerdictCard key={c.decision.decisionId} card={c} readOnly />
        ))}
      </aside>
    </main>
  );
}

function ReplayTranscript({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <section className="rounded-card border border-line bg-surface p-4" aria-label="Agent transcript">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Agent</h2>
      <ol className="mt-2 space-y-1.5 text-[13px]">
        {steps.map((s) => (
          <li key={s.id}>
            {s.kind === 'search' && <span className="text-muted">searched <span className="text-text">“{s.query}”</span></span>}
            {s.kind === 'view' && <span className="text-muted">read the {s.what === 'page' ? 'page' : 'reviews'} of <span className="font-mono text-[12px] text-text">{s.sku}</span> <span className="font-mono text-[10px]">untrusted</span></span>}
            {s.kind === 'money' && <span className="text-text">→ tried to pay: <span className="font-mono text-[12px]">{s.label}</span></span>}
            {s.kind === 'say' && <p className="mt-1 rounded-lg bg-ink/60 px-2.5 py-2 text-text">{s.text}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
