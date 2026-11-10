'use client';

// The Firewall Lane: Agent → ALLOWANCE gate (a ring of 12 rule lamps) → PayPal (sandbox).
// Every money-moving tool call is a packet. Transform/opacity animations only (60 fps with 20 packets).
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cardPhase, type Card } from '@/components/errand/state';
import type { DecisionView } from '@/lib/views';

const COLORS = { ALLOW: 'var(--al-allow)', STEP_UP: 'var(--al-stepup)', BLOCK: 'var(--al-block)', REFUND: 'var(--al-refund)' } as const;
const usd = (c?: number | null) => (c == null ? '' : `$${(c / 100).toFixed(2)}`);
const EASE = [0.16, 1, 0.3, 1] as const;

// Geometry (px). Everything is laid out on one centre line.
const H = 340;
const CY = 150;
const RING = 76; // gate ring radius
const BOX = 184; // gate box size

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
    return { agent: Math.max(64, w * 0.085), gate: w * 0.5, paypal: Math.min(w - 64, w * 0.915), clamp };
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
    <section aria-label="Firewall Lane" className="glass relative overflow-hidden !rounded-[26px]">
      <div ref={box} className="relative w-full" style={{ height: H }}>
        {/* backdrop: fine grid + gate glow */}
        <div aria-hidden className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]" />
        <div aria-hidden className="absolute rounded-full" style={{ left: xs.gate - 220, top: CY - 220, width: 440, height: 440, background: 'radial-gradient(closest-side, rgba(169,184,255,0.10), transparent)' }} />

        {/* track */}
        <div aria-hidden className="absolute h-px" style={{ left: xs.agent, width: Math.max(0, xs.paypal - xs.agent), top: CY }}>
          <div className="hairline h-px w-full opacity-80" />
          {!reduce && <div className="flow-line absolute inset-0 h-px" />}
        </div>

        <Station x={xs.agent} title="Agent" sub={model ?? 'OpenAI'} icon={<SparkIcon />} />
        <Gate x={xs.gate} focus={focus} reduce={reduce} />
        <Station x={xs.paypal} title="PayPal" sub="sandbox" badge icon={<VaultIcon />}>
          <ul className="mt-2 space-y-1">
            <AnimatePresence initial={false}>
              {captures.map((c) => (
                <motion.li
                  key={c.decision.decisionId}
                  initial={reduce ? false : { opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="truncate rounded-full border border-allow/30 bg-allow/10 px-1.5 py-0.5 font-mono text-[10px] text-allow"
                  title={`capture ${c.purchase?.captureId}`}
                >
                  ✓ {c.purchase?.captureId?.slice(0, 10)}
                </motion.li>
              ))}
            </AnimatePresence>
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

        {!recent.length && (
          <p className="absolute inset-x-0 bottom-5 text-center font-mono text-[11px] tracking-[0.18em] text-muted uppercase">Waiting for the agent’s first money-moving tool call</p>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {latest ? `${cardPhase(latest)}: ${latest.decision.item ?? latest.decision.tool}. ${latest.decision.summary}` : ''}
      </p>
    </section>
  );
}

/** Cinematic caption under the lane: the latest decision, large, with its rule lamps. */
export function NowCaption({ cards, order }: { cards: Record<string, Card>; order: string[] }) {
  const reduce = useReducedMotion() ?? false;
  const last = [...order].reverse().map((id) => cards[id]).find((c) => c?.decision);
  if (!last) return null;
  const d = last.decision;
  const phase = cardPhase(last);
  const tone = phase === 'BLOCK' || phase === 'FAILED' ? COLORS.BLOCK : phase === 'STEP_UP' ? COLORS.STEP_UP : phase === 'REFUNDED' ? COLORS.REFUND : phase === 'DECLINED' ? 'var(--al-muted)' : COLORS.ALLOW;
  const word = phase === 'BLOCK' ? 'Blocked' : phase === 'STEP_UP' ? 'PayPal asks you' : phase === 'REFUNDED' ? 'Undone — refunded' : phase === 'APPROVED' ? 'Approved in PayPal · paid' : phase === 'PAID' ? 'Allowed · paid from the vault' : phase === 'DECLINED' ? 'Declined' : phase === 'FAILED' ? 'Payment failed' : 'Allowed';
  return (
    <div className="glass relative overflow-hidden !rounded-[22px] px-6 py-5" aria-hidden>
      <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full blur-3xl" style={{ background: tone, opacity: 0.16 }} />
      <AnimatePresence mode="wait">
        <motion.div
          key={`${d.decisionId}-${phase}`}
          initial={reduce ? false : { opacity: 0, y: 12, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reduce ? undefined : { opacity: 0, y: -10, filter: 'blur(8px)' }}
          transition={{ duration: 0.55, ease: EASE }}
          className="relative"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.2em]" style={{ color: tone }}>
              {word}
            </span>
            <span className="flex items-center gap-1">
              {d.rules.map((r) => (
                <span
                  key={r.id}
                  title={`${r.id} ${r.name}: ${r.outcome}`}
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: r.outcome === 'FAIL' ? 'var(--al-block)' : r.outcome === 'STEP_UP' ? 'var(--al-stepup)' : r.outcome === 'PASS' ? 'var(--al-allow)' : 'rgba(226,232,248,0.2)',
                    boxShadow: r.outcome === 'FAIL' || r.outcome === 'STEP_UP' ? `0 0 8px ${r.outcome === 'FAIL' ? 'var(--al-block)' : 'var(--al-stepup)'}` : undefined,
                  }}
                />
              ))}
              <span className="ml-2 font-mono text-[10px] text-muted">{(d.latencyUs / 1000).toFixed(2)} ms</span>
            </span>
          </div>
          <p className="mt-2 flex items-baseline justify-between gap-4">
            <span className="text-[clamp(18px,1.7vw,24px)] font-semibold leading-snug tracking-[-0.02em] text-platinum">{d.item ? `${d.qty ?? 1} × ${shorten(d.item)}` : d.tool}</span>
            <span className="font-mono text-[clamp(18px,1.7vw,24px)] tabular text-text">{usd(d.amountCents)}</span>
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: phase === 'BLOCK' || phase === 'STEP_UP' ? tone : 'var(--al-muted)' }}>
            {phase === 'APPROVED'
              ? `You approved it in PayPal — captured ${last.purchase?.captureId ?? ''}.`
              : phase === 'REFUNDED'
                ? `One click, a real PayPal refund ${last.refund?.refundId ?? ''} — the allowance is restored.`
                : (last.explanation ?? d.summary)}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Station({ x, title, sub, badge, icon, children }: { x: number; title: string; sub: string; badge?: boolean; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="glass absolute w-[118px] -translate-x-1/2 !rounded-2xl bg-[rgba(10,13,22,0.75)] px-3 py-2.5 text-center" style={{ left: x, top: CY - 44 }}>
      <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#dfe4f2] shadow-[0_0_16px_-6px_rgba(200,210,255,0.6)]">{icon}</div>
      <div className="mt-1.5 text-[13px] font-semibold tracking-[-0.01em] text-text">{title}</div>
      <div className={`mx-auto mt-0.5 w-fit max-w-full truncate rounded-full px-1.5 font-mono text-[9.5px] ${badge ? 'border border-stepup/40 text-stepup' : 'text-muted'}`}>{sub}</div>
      {children}
    </div>
  );
}

const LAMP = { PASS: { c: 'var(--al-allow)', g: '✓' }, FAIL: { c: 'var(--al-block)', g: '✕' }, STEP_UP: { c: 'var(--al-stepup)', g: '!' }, SKIP: { c: 'rgba(226,232,248,0.28)', g: '' } } as const;

function Gate({ x, focus, reduce }: { x: number; focus: DecisionView | null; reduce: boolean }) {
  const rules = focus?.rules ?? Array.from({ length: 12 }, (_, i) => ({ id: `R${String(i + 1).padStart(2, '0')}`, outcome: 'SKIP' as const, name: '' }));
  const verdict = focus ? (rules.some((r) => r.outcome === 'FAIL') ? 'BLOCK' : rules.some((r) => r.outcome === 'STEP_UP') ? 'STEP_UP' : 'ALLOW') : null;
  const tone = verdict === 'BLOCK' ? COLORS.BLOCK : verdict === 'STEP_UP' ? COLORS.STEP_UP : verdict === 'ALLOW' ? COLORS.ALLOW : 'var(--al-accent)';
  const c = BOX / 2;
  return (
    <div className="absolute -translate-x-1/2" style={{ left: x, top: CY - BOX / 2, width: BOX, height: BOX }}>
      {/* verdict halo */}
      <motion.div
        key={focus?.decisionId ?? 'idle'}
        aria-hidden
        className="absolute inset-[-40px] rounded-full"
        style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${tone} 38%, transparent), transparent 70%)` }}
        initial={reduce || !focus ? { opacity: 0.25 } : { opacity: 0, scale: 0.7 }}
        animate={{ opacity: focus ? 0.55 : 0.25, scale: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
      />
      {focus && !reduce && (
        <motion.div
          key={`ring-${focus.decisionId}`}
          aria-hidden
          className="absolute rounded-full border-2"
          style={{ left: c - RING, top: c - RING, width: RING * 2, height: RING * 2, borderColor: tone }}
          initial={{ scale: 1, opacity: 0.9 }}
          animate={{ scale: 1.55, opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      )}
      <svg width={BOX} height={BOX} className="absolute inset-0" aria-hidden>
        <defs>
          <linearGradient id="al-gate-sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.5" stopColor="#c9b8ff" stopOpacity="0.4" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="al-gate-disc" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.07" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.01" />
          </radialGradient>
        </defs>
        <g className={reduce ? '' : '[animation:al-spin_60s_linear_infinite_reverse]'} style={{ transformOrigin: `${c}px ${c}px` }}>
          <circle cx={c} cy={c} r={RING + 12} fill="none" stroke="rgba(226,232,248,0.22)" strokeWidth="1" strokeDasharray="1 5" />
        </g>
        <circle cx={c} cy={c} r={RING} fill="url(#al-gate-disc)" stroke="rgba(226,232,248,0.30)" strokeWidth="1.3" />
        <g className={reduce ? '' : '[animation:al-spin_7s_linear_infinite]'} style={{ transformOrigin: `${c}px ${c}px` }}>
          <circle cx={c} cy={c} r={RING} fill="none" stroke="url(#al-gate-sheen)" strokeWidth="2" strokeDasharray={`${RING * 0.9} ${RING * 6}`} strokeLinecap="round" />
        </g>
        {focus && <circle cx={c} cy={c} r={RING} fill="none" stroke={tone} strokeWidth="1.6" opacity="0.8" />}
      </svg>

      {/* gate beam + mark */}
      <div aria-hidden className="absolute left-1/2 w-[2px] -translate-x-1/2 rounded-full" style={{ top: c - RING * 0.62, height: RING * 1.24, background: `linear-gradient(180deg, transparent, ${focus ? tone : 'rgba(226,232,248,0.8)'}, transparent)`, boxShadow: `0 0 14px ${focus ? tone : 'rgba(200,210,255,0.6)'}` }} />
      <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: c - RING + 18 }}>
        <span className="wordmark text-platinum text-[8.5px]">ALLOWANCE</span>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center font-mono text-[9.5px] text-muted" style={{ top: c + RING - 30 }}>
        {focus ? `${(focus.latencyUs / 1000).toFixed(2)} ms` : '12 rules'}
      </div>

      {/* twelve rule lamps on the ring */}
      {rules.map((r, i) => {
        const l = LAMP[(r.outcome as keyof typeof LAMP) ?? 'SKIP'] ?? LAMP.SKIP;
        const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
        const lx = c + Math.cos(a) * RING;
        const ly = c + Math.sin(a) * RING;
        const lit = Boolean(focus) && r.outcome !== 'SKIP';
        const fired = r.outcome === 'FAIL' || r.outcome === 'STEP_UP';
        return (
          <motion.span
            key={`${focus?.decisionId ?? 'idle'}-${r.id}`}
            title={`${r.id} ${r.name}: ${r.outcome}`}
            className="absolute flex items-center justify-center rounded-full font-bold text-ink"
            style={{
              left: lx - (fired ? 9 : 7),
              top: ly - (fired ? 9 : 7),
              width: fired ? 18 : 14,
              height: fired ? 18 : 14,
              fontSize: fired ? 10 : 8,
              background: l.c,
              boxShadow: lit ? `0 0 ${fired ? 18 : 10}px ${l.c}, 0 0 0 2px rgba(5,7,13,0.9)` : '0 0 0 2px rgba(5,7,13,0.9)',
            }}
            initial={reduce || !focus ? false : { opacity: 0.2, scale: 0.4 }}
            animate={{ opacity: lit ? 1 : 0.6, scale: 1 }}
            transition={{ delay: reduce ? 0 : i * 0.028, duration: 0.24, ease: EASE }}
          >
            {lit ? l.g : ''}
          </motion.span>
        );
      })}
      {/* rule ids of the lamps that fired */}
      {focus &&
        rules.map((r, i) => {
          if (r.outcome !== 'FAIL' && r.outcome !== 'STEP_UP') return null;
          const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
          const lx = c + Math.cos(a) * (RING + 26);
          const ly = c + Math.sin(a) * (RING + 26);
          return (
            <span key={`id-${r.id}`} className={`absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] font-semibold ${r.outcome === 'FAIL' ? 'text-block' : 'text-stepup'}`} style={{ left: lx, top: ly }}>
              {r.id}
            </span>
          );
        })}
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
    }, 700);
    const t2 = setTimeout(() => setStage('done'), 700 + 560);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [d, reduce, onGate]);

  // Packets that are finished fade away after a moment (their record stays in the cards).
  const settled = phase === 'BLOCK' || phase === 'PAID' || phase === 'APPROVED' || phase === 'DECLINED' || phase === 'FAILED' || phase === 'REFUNDED';
  useEffect(() => {
    if (stage !== 'done' || !settled) return;
    const t = setTimeout(() => setGone(true), phase === 'BLOCK' ? 3200 : phase === 'DECLINED' ? 2000 : 1400);
    return () => clearTimeout(t);
  }, [stage, settled, phase]);
  if (gone) return null;

  const color = phase === 'BLOCK' || phase === 'FAILED' ? COLORS.BLOCK : phase === 'STEP_UP' ? COLORS.STEP_UP : phase === 'DECLINED' ? 'var(--al-muted)' : stage === 'travel' ? 'rgba(226,232,248,0.9)' : COLORS.ALLOW;
  const label = `${(d.qty ?? 1) > 1 ? `${d.qty} × ` : ''}${shorten(d.item ?? d.tool).slice(0, 20).trim()} · ${usd(d.amountCents)}`;
  const toward = xs.gate + (xs.paypal - xs.gate) * 0.5;
  // Settled outcomes get their own spots on the lower row: parked step-ups right of the gate.
  const parked = stage === 'done' && (phase === 'STEP_UP' || phase === 'DECLINED');
  const absorbed = stage === 'done' && (phase === 'PAID' || phase === 'APPROVED' || phase === 'REFUNDED');
  const text = parked ? `${shorten(d.item ?? d.tool).slice(0, 14).trim()} · ${usd(d.amountCents)}` : label;
  const extra = phase === 'STEP_UP' && parked ? 104 : (phase === 'PAID' || phase === 'APPROVED') && card.purchase?.captureId ? 84 : 0;
  const pw = text.length * 6.7 + 44 + extra; // monospace 11px ≈ 6.7px per char
  const target = xs.clamp(parked ? xs.gate + 24 + pw / 2 : stage !== 'done' || phase === 'BLOCK' ? xs.gate - RING - pw / 2 + 10 : phase === 'ALLOW' ? toward : xs.paypal, pw);

  if (stage === 'done' && phase === 'BLOCK') {
    const blockLabel = `${d.firstBlock} ${d.firstBlockName ?? ''}`.trim();
    const lw = (blockLabel.length + 10) * 6.7 + 28;
    return <Shatter x={xs.gate - RING} labelX={xs.clamp(xs.gate - 24 - lw / 2, lw)} label={blockLabel} reduce={reduce} />;
  }

  const travelling = stage === 'travel';
  return (
    <motion.div
      className="absolute left-0 will-change-transform"
      style={{ top: parked ? CY + 98 : CY - 13 }}
      initial={reduce ? { x: target, opacity: 1 } : { x: xs.clamp(xs.agent), opacity: 0, filter: 'blur(6px)' }}
      // Paid packets reach PayPal, then rise into the PayPal station (its capture chip stays listed
      // there), keeping the track clear for the next packet.
      animate={absorbed ? { x: target, y: -62, opacity: 0, scale: 0.8, filter: 'blur(3px)' } : { x: target, y: 0, opacity: phase === 'DECLINED' ? 0.5 : 1, scale: 1, filter: 'blur(0px)' }}
      transition={
        absorbed
          ? { x: { duration: reduce ? 0 : 0.6, ease: EASE }, default: { duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.15, ease: 'easeIn' } }
          : { duration: reduce ? 0 : travelling ? 0.7 : 0.65, ease: EASE }
      }
    >
      <div className="relative -translate-x-1/2">
        {/* light trail */}
        {!reduce && (stage !== 'done' || phase === 'ALLOW' || absorbed) && (
          <span aria-hidden className="absolute right-full top-1/2 mr-[-6px] h-[2px] w-16 -translate-y-1/2 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${color})`, opacity: 0.8 }} />
        )}
        <div
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[11px] text-text backdrop-blur-md"
          style={{ borderColor: `color-mix(in srgb, ${color} 70%, transparent)`, background: 'rgba(8,10,18,0.78)', boxShadow: `0 0 26px -6px ${color}, inset 0 1px 0 rgba(255,255,255,0.06)` }}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          {text}
          {phase === 'STEP_UP' && parked && <span className="rounded-full bg-stepup/15 px-1.5 text-stepup">ask in PayPal</span>}
          {(phase === 'PAID' || phase === 'APPROVED') && card.purchase?.captureId && <span className="rounded-full bg-allow/15 px-1.5 text-allow">✓ {card.purchase.captureId.slice(0, 8)}</span>}
        </div>
      </div>
    </motion.div>
  );
}

function Shatter({ x, labelX, label, reduce }: { x: number; labelX: number; label: string; reduce: boolean }) {
  const shards = Array.from({ length: 16 }, (_, i) => {
    const a = Math.PI * 0.55 + (i / 16) * Math.PI * 0.9 + (i % 2 ? 0.08 : -0.08);
    const d = 36 + (i % 4) * 16;
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.8, r: (i % 2 ? 1 : -1) * (90 + i * 22), s: 3 + (i % 3) };
  });
  return (
    <div className="pointer-events-none absolute left-0" style={{ top: CY, transform: `translateX(${x}px)` }}>
      {!reduce && (
        <motion.span
          className="absolute -left-3 -top-3 h-6 w-6 rounded-full border-2 border-block"
          initial={{ scale: 0.4, opacity: 1 }}
          animate={{ scale: 3.2, opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      )}
      {!reduce &&
        shards.map((s, i) => (
          <motion.span
            key={i}
            className="absolute rounded-[2px] bg-block will-change-transform"
            style={{ width: s.s, height: s.s, boxShadow: '0 0 8px var(--al-block)' }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: s.dx, y: s.dy, opacity: 0, rotate: s.r }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.3, 1] }}
          />
        ))}
      <motion.span className="absolute left-0" style={{ x: labelX - x, top: 98 }} initial={reduce ? false : { opacity: 0, y: -6, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: reduce ? 0 : 0.15, duration: 0.5, ease: EASE }}>
        <span className="inline-block -translate-x-1/2 whitespace-nowrap rounded-full border border-block/70 bg-[rgba(40,8,16,0.85)] px-3 py-1 font-mono text-[11px] font-semibold text-block shadow-[0_0_30px_-6px_var(--al-block)] backdrop-blur-md">
          ✕ BLOCK · {label.trim()}
        </span>
      </motion.span>
    </div>
  );
}

function RefundPacket({ card, xs, reduce }: { card: Card; xs: Xs; reduce: boolean }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), reduce ? 2500 : 3400);
    return () => clearTimeout(t);
  }, [reduce]);
  if (gone) return null;
  return (
    <motion.div
      className="absolute left-0 top-[18px] will-change-transform"
      initial={reduce ? { x: xs.clamp(xs.agent) } : { x: xs.clamp(xs.paypal), opacity: 0, filter: 'blur(6px)' }}
      animate={{ x: xs.clamp(xs.agent), opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 1.2, ease: EASE }}
    >
      <div className="relative -translate-x-1/2">
        {!reduce && <span aria-hidden className="absolute left-full top-1/2 ml-[-6px] h-[2px] w-20 -translate-y-1/2 rounded-full" style={{ background: 'linear-gradient(270deg, transparent, var(--al-refund))' }} />}
        <div className="whitespace-nowrap rounded-full border border-refund/70 bg-[rgba(6,20,30,0.85)] px-3 py-1 font-mono text-[11px] text-refund shadow-[0_0_26px_-6px_var(--al-refund)] backdrop-blur-md">
          ↺ refund {usd(card.refund?.amountCents ?? card.decision.amountCents)} · {card.refund?.refundId?.slice(0, 10)}
        </div>
      </div>
    </motion.div>
  );
}

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" opacity="0.95" />
      <circle cx="19" cy="19" r="2" opacity="0.6" />
    </svg>
  );
}

function VaultIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5" />
    </svg>
  );
}

function shorten(s: string) {
  return s.replace(/^(Volt & Wire|Northwind|PaperTrail|Lumen Home|GiftHub|StreamBox Plus)\s+/, '').slice(0, 26);
}
