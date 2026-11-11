'use client';

// Judge mode: plays a recorded run through the same reducer, lane and cards as the live console.
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { FirewallLane, NowCaption } from '@/components/lane/FirewallLane';
import { usd } from '@/components/ui';
import { VerdictCard } from '@/components/verdict/VerdictCard';
import { istStamp } from '@/lib/time';
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

  const recorded = istStamp(replay.meta.recordedAt);
  const cards = [...state.order].reverse().map((id) => state.cards[id]!).filter((c) => c?.decision);
  const committed = cards.filter((c) => c.purchase?.status === 'COMPLETED' && c.refund?.status !== 'COMPLETED').reduce((s, c) => s + c.decision.amountCents, 0);
  const compressed = timeline.some((e) => e.compressed);

  const left = replay.meta.allowance.budgetCents - committed;

  return (
    <main className="animate-rise mx-auto w-full max-w-[1100px] px-5 pb-28 pt-14">
      <header className="text-center">
        <p className={`text-[14px] font-semibold ${replay.meta.synthetic ? 'text-block' : 'text-muted'}`}>
          {replay.meta.synthetic ? 'Synthetic preview · fake PayPal · not a sandbox run' : `Replay of a live sandbox run · ${recorded} IST`}
        </p>
        <h1 className="display mx-auto mt-3 max-w-[820px] text-[clamp(28px,4vw,48px)]">“{replay.meta.task}”</h1>
        <p className="mt-4 text-[17px] text-muted">
          {usd(replay.meta.allowance.budgetCents)} allowance · max {usd(replay.meta.allowance.perPurchaseCapCents)} per purchase · ask above {usd(replay.meta.allowance.stepUpAboveCents)}
        </p>
        <div className="mx-auto mt-8 flex max-w-[460px] items-center gap-4">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Replay progress" aria-valuemin={0} aria-valuemax={timeline.length} aria-valuenow={pos}>
            <div className="h-full rounded-full bg-text transition-[width] duration-700" style={{ width: `${(pos / Math.max(1, timeline.length)) * 100}%` }} />
          </div>
          <button type="button" className="link-chevron text-[15px]" onClick={() => { setPos(0); setRun((r) => r + 1); }}>
            Replay
          </button>
        </div>
      </header>

      <div className="mt-14">
        <FirewallLane cards={state.cards} order={state.order} model={replay.meta.model} />
      </div>
      <div className="mt-4">
        <NowCaption cards={state.cards} order={state.order} />
      </div>
      <p className="mt-4 flex flex-wrap justify-between gap-2 text-[13px] text-muted">
        <span>
          Spent <span className="text-text">{usd(committed)}</span> · <span className="text-text">{usd(left)}</span> left
        </span>
        <span>Agent: {replay.meta.model}</span>
      </p>

      {cards.length > 0 && (
        <section className="mt-16" aria-label="Verdicts">
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-text">Verdicts</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {cards.map((c) => (
              <VerdictCard key={c.decision.decisionId} card={c} readOnly />
            ))}
          </div>
        </section>
      )}

      <ReplayTranscript steps={state.steps} />
      {(compressed || replay.meta.note) && (
        <p className="mt-8 text-center text-[12px] text-muted">
          {compressed ? 'Timing is shortened for readability (e.g. the wait while approving on the phone). ' : ''}
          {replay.meta.note ?? ''}
        </p>
      )}
    </main>
  );
}

function ReplayTranscript({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <details className="glass mt-10 px-6 py-4" aria-label="Agent transcript">
      <summary className="cursor-pointer text-[15px] text-accent">Agent transcript</summary>
      <ol className="mt-3 space-y-1.5 text-[13px]">
        {steps.map((s) => (
          <li key={s.id}>
            {s.kind === 'search' && <span className="text-muted">searched <span className="text-text">“{s.query}”</span></span>}
            {s.kind === 'view' && <span className="text-muted">read the {s.what === 'page' ? 'page' : 'reviews'} of <span className="font-mono text-[12px] text-text">{s.sku}</span> <span className="font-mono text-[10px]">untrusted</span></span>}
            {s.kind === 'money' && <span className="text-text">→ tried to pay: <span className="font-mono text-[12px]">{s.label}</span></span>}
            {s.kind === 'say' && <p className="mt-1 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-text">{s.text}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}
