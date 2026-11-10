'use client';

// The Firewall Lane: Agent → ALLOWANCE gate (12 rule lamps) → PayPal (sandbox).
// Every money-moving tool call is a packet. Transform/opacity animations only (60 fps with 20 packets).
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cardPhase, type Card } from '@/components/errand/state';
import type { DecisionView } from '@/lib/views';

const COLORS = { ALLOW: 'var(--al-allow)', STEP_UP: 'var(--al-stepup)', BLOCK: 'var(--al-block)', REFUND: 'var(--al-refund)' } as const;
const usd = (c?: number | null) => (c == null ? '' : `$${(c / 100).toFixed(2)}`);

export function FirewallLane({ cards, order, model }: { cards: Record<string, Card>; order: string[]; model?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [focus, setFocus] = useState<DecisionView | null>(null);
  const reduce = useReducedMotion() ?? false;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xs = useMemo(() => {
    // Keep a packet of (estimated) width `pw` entirely inside the lane.
    const clamp = (x: number, pw = 224) => Math.max(pw / 2 + 8, Math.min(w - pw / 2 - 8, x));
    return { agent: Math.max(56, w * 0.08), gate: w * 0.5, paypal: Math.min(w - 56, w * 0.92), clamp };
  }, [w]);
  const recent = order.slice(-20);
  const captures = order
    .map((id) => cards[id])
    .filter((c): c is Card => Boolean(c?.purchase?.captureId))
    .slice(-3)
    .reverse();
  const refunds = order.map((id) => cards[id]).filter((c): c is Card => c?.refund?.status === 'COMPLETED');
  const latest = recent.length ? cards[recent.at(-1)!] : undefined;

  return (
    <section aria-label="Firewall Lane" className="relative overflow-hidden rounded-card border border-line bg-surface">
      <div ref={box} className="relative h-[256px] w-full">
        {/* track */}
        <svg className="absolute inset-0 h-full w-full" aria-hidden>
          <line x1={xs.agent} x2={xs.paypal} y1={186} y2={186} stroke="var(--al-line)" strokeWidth={2} strokeDasharray="4 6" />
        </svg>

        <Station x={xs.agent} title="Agent" sub={model ?? 'OpenAI'} />
        <Gate x={xs.gate} focus={focus} reduce={reduce} />
        <Station x={xs.paypal} title="PayPal" sub="sandbox" badge>
          <ul className="mt-2 space-y-1">
            {captures.map((c) => (
              <li key={c.decision.decisionId} className="truncate rounded bg-ink/70 px-1.5 py-0.5 font-mono text-[10px] text-allow" title={`capture ${c.purchase?.captureId}`}>
                ✓ {c.purchase?.captureId?.slice(0, 10)}
              </li>
            ))}
          </ul>
        </Station>

        {recent.map((id) => {
          const c = cards[id];
          return c?.decision ? <Packet key={id} card={c} xs={xs} reduce={reduce} onGate={setFocus} /> : null;
        })}
        <AnimatePresence>
          {refunds.map((c) => (
            <RefundPacket key={`r-${c.decision.decisionId}`} card={c} xs={xs} reduce={reduce} />
          ))}
        </AnimatePresence>
      </div>
      <p className="sr-only" aria-live="polite">
        {latest ? `${cardPhase(latest)}: ${latest.decision.item ?? latest.decision.tool}. ${latest.decision.summary}` : ''}
      </p>
    </section>
  );
}

function Station({ x, title, sub, badge, children }: { x: number; title: string; sub: string; badge?: boolean; children?: React.ReactNode }) {
  return (
    <div className="absolute top-[64px] w-[104px] -translate-x-1/2 rounded-xl border border-line bg-surface-2 px-2.5 py-2 text-center" style={{ left: x }}>
      <div className="text-sm font-semibold text-text">{title}</div>
      <div className={`mx-auto mt-0.5 w-fit rounded-full px-1.5 font-mono text-[10px] ${badge ? 'border border-stepup/40 text-stepup' : 'text-muted'}`}>{sub}</div>
      {children}
    </div>
  );
}

const LAMP = { PASS: { c: 'var(--al-allow)', g: '✓' }, FAIL: { c: 'var(--al-block)', g: '✕' }, STEP_UP: { c: 'var(--al-stepup)', g: '!' }, SKIP: { c: 'var(--al-line)', g: '·' } } as const;

function Gate({ x, focus, reduce }: { x: number; focus: DecisionView | null; reduce: boolean }) {
  const rules = focus?.rules ?? Array.from({ length: 12 }, (_, i) => ({ id: `R${String(i + 1).padStart(2, '0')}`, outcome: 'SKIP' as const, name: '' }));
  return (
    <div className="absolute top-[34px] w-[212px] -translate-x-1/2 rounded-2xl border border-accent/40 bg-ink/80 px-3 pb-2.5 pt-2 shadow-[0_0_40px_-12px_var(--al-accent)]" style={{ left: x }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="wordmark text-[11px] text-accent">ALLOWANCE</span>
        <span className="font-mono text-[10px] text-muted">{focus ? `${(focus.latencyUs / 1000).toFixed(2)} ms` : '12 rules'}</span>
      </div>
      <div className="grid grid-cols-6 gap-x-1.5 gap-y-2" key={focus?.decisionId ?? 'idle'}>
        {rules.map((r, i) => {
          const l = LAMP[(r.outcome as keyof typeof LAMP) ?? 'SKIP'] ?? LAMP.SKIP;
          return (
            <div key={r.id} className="flex flex-col items-center gap-0.5" title={`${r.id} ${r.name}: ${r.outcome}`}>
              <motion.span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-ink"
                initial={reduce || !focus ? false : { opacity: 0.25, scale: 0.7 }}
                animate={{ opacity: r.outcome === 'SKIP' ? 0.45 : 1, scale: 1 }}
                transition={{ delay: reduce ? 0 : i * 0.025, duration: 0.18 }}
                style={{ background: l.c }}
              >
                {focus ? l.g : ''}
              </motion.span>
              <span className={`font-mono text-[9px] ${r.outcome === 'FAIL' ? 'text-block' : r.outcome === 'STEP_UP' ? 'text-stepup' : 'text-muted'}`}>{r.id}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Xs = { agent: number; gate: number; paypal: number; clamp: (x: number, pw?: number) => number };

function Packet({ card, xs, reduce, onGate }: { card: Card; xs: Xs; reduce: boolean; onGate: (d: DecisionView) => void }) {
  const d = card.decision;
  const phase = cardPhase(card);
  const [stage, setStage] = useState<'travel' | 'gate' | 'done'>(reduce ? 'done' : 'travel');
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (reduce) {
      onGate(d);
      return;
    }
    const t1 = setTimeout(() => {
      setStage('gate');
      onGate(d);
    }, 650);
    const t2 = setTimeout(() => setStage('done'), 650 + 520);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [d, reduce, onGate]);

  // Packets that are finished fade away after a moment (their record stays in the cards).
  const settled = phase === 'BLOCK' || phase === 'PAID' || phase === 'APPROVED' || phase === 'DECLINED' || phase === 'FAILED' || phase === 'REFUNDED';
  useEffect(() => {
    if (stage !== 'done' || !settled) return;
    const t = setTimeout(() => setGone(true), phase === 'BLOCK' ? 3000 : phase === 'DECLINED' ? 2000 : 1300);
    return () => clearTimeout(t);
  }, [stage, settled, phase]);
  if (gone) return null;

  const color = phase === 'BLOCK' || phase === 'FAILED' ? COLORS.BLOCK : phase === 'STEP_UP' ? COLORS.STEP_UP : phase === 'DECLINED' ? 'var(--al-muted)' : COLORS.ALLOW;
  const label = `${d.qty ?? 1} × ${shorten(d.item ?? d.tool)} · ${usd(d.amountCents)}`;
  // Centre positions along the lane.
  const toward = xs.gate + (xs.paypal - xs.gate) * 0.5;
  // Settled outcomes get their own spots on row B: blocks left of the gate, parked step-ups right of it.
  const parked = stage === 'done' && (phase === 'STEP_UP' || phase === 'DECLINED');
  const absorbed = stage === 'done' && (phase === 'PAID' || phase === 'APPROVED' || phase === 'REFUNDED');
  const text = parked ? `${shorten(d.item ?? d.tool).slice(0, 14).trim()} · ${usd(d.amountCents)}` : label;
  const extra = phase === 'STEP_UP' && parked ? 104 : (phase === 'PAID' || phase === 'APPROVED') && card.purchase?.captureId ? 84 : 0;
  const pw = text.length * 6.7 + 40 + extra; // monospace 11px ≈ 6.7px per char
  const target = xs.clamp(parked ? xs.gate + 132 : stage !== 'done' || phase === 'BLOCK' ? xs.gate : phase === 'ALLOW' ? toward : xs.paypal, pw);

  if (stage === 'done' && phase === 'BLOCK') return <Shatter x={xs.gate} labelX={xs.clamp(xs.gate - 132, 210)} label={`${d.firstBlock} ${d.firstBlockName ?? ''}`} reduce={reduce} />;

  return (
    <motion.div
      className={`absolute left-0 will-change-transform ${parked ? 'top-[214px]' : 'top-[172px]'}`}
      initial={reduce ? { x: target, opacity: 1 } : { x: xs.clamp(xs.agent), opacity: 0 }}
      // Paid packets reach PayPal, then rise into the PayPal station (its capture chip stays listed
      // there), keeping the track clear for the next packet.
      animate={
        absorbed
          ? { x: target, y: -58, opacity: 0, scale: 0.85 }
          : { x: target, y: 0, opacity: phase === 'DECLINED' ? 0.5 : 1, scale: 1 }
      }
      transition={
        absorbed
          ? { x: { duration: reduce ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }, default: { duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.1, ease: 'easeIn' } }
          : { duration: reduce ? 0 : stage === 'travel' ? 0.65 : 0.6, ease: [0.22, 1, 0.36, 1] }
      }
    >
      <div
        className="flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[11px] text-text"
        style={{ borderColor: color, background: 'color-mix(in srgb, var(--al-ink) 82%, transparent)', boxShadow: `0 0 18px -6px ${color}` }}
      >
      <span aria-hidden style={{ color }}>{phase === 'STEP_UP' ? '!' : phase === 'DECLINED' ? '–' : '●'}</span>
      {text}
      {phase === 'STEP_UP' && parked && <span className="rounded bg-stepup/15 px-1 text-stepup">ask in PayPal</span>}
      {(phase === 'PAID' || phase === 'APPROVED') && card.purchase?.captureId && <span className="rounded bg-allow/15 px-1 text-allow">✓ {card.purchase.captureId.slice(0, 8)}</span>}
      </div>
    </motion.div>
  );
}

function Shatter({ x, labelX, label, reduce }: { x: number; labelX: number; label: string; reduce: boolean }) {
  const shards = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { dx: Math.cos(a) * (30 + (i % 3) * 14), dy: Math.sin(a) * (20 + (i % 2) * 12), r: (i % 2 ? 1 : -1) * (60 + i * 18) };
  });
  return (
    <div className="pointer-events-none absolute top-[172px] left-0" style={{ transform: `translateX(${x}px)` }}>
      {!reduce &&
        shards.map((s, i) => (
          <motion.span
            key={i}
            className="absolute h-2 w-2 rounded-[2px] bg-block will-change-transform"
            initial={{ x: 0, y: 8, opacity: 1, rotate: 0 }}
            animate={{ x: s.dx, y: 8 + s.dy, opacity: 0, rotate: s.r }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        ))}
      <motion.span
        className="absolute left-0 top-[42px]"
        style={{ x: labelX - x }}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduce ? 0 : 0.15 }}
      >
        <span className="inline-block -translate-x-1/2 whitespace-nowrap rounded-full border border-block bg-block/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-block">
          ✕ BLOCK · {label.trim()}
        </span>
      </motion.span>
    </div>
  );
}

function RefundPacket({ card, xs, reduce }: { card: Card; xs: Xs; reduce: boolean }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), reduce ? 2500 : 3200);
    return () => clearTimeout(t);
  }, [reduce]);
  if (gone) return null;
  return (
    <motion.div
      className="absolute top-[6px] left-0 will-change-transform"
      initial={reduce ? { x: xs.clamp(xs.agent) } : { x: xs.clamp(xs.paypal), opacity: 0 }}
      animate={{ x: xs.clamp(xs.agent), opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="-translate-x-1/2 whitespace-nowrap rounded-full border border-refund bg-refund/10 px-2.5 py-1 font-mono text-[11px] text-refund">
        ↺ refund {usd(card.refund?.amountCents ?? card.decision.amountCents)} · {card.refund?.refundId?.slice(0, 10)}
      </div>
    </motion.div>
  );
}

function shorten(s: string) {
  return s.replace(/^(Volt & Wire|Northwind|PaperTrail|Lumen Home|GiftHub|StreamBox Plus)\s+/, '').slice(0, 26);
}
