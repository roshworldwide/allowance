'use client';

// The allowance as an object: a brushed-titanium card with a holographic sheen that follows the
// pointer and a gentle 3D tilt. Purely presentational — every value comes from props.
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { Mark } from '@/components/brand/Mark';

export type TitaniumProps = {
  amount: string; // e.g. "$200"
  period: string; // e.g. "this month"
  lines: string[]; // short spec lines, e.g. ["max $60 / purchase", "ask above $40"]
  status: string; // e.g. "ACTIVE"
  statusTone: 'allow' | 'stepup' | 'block' | 'muted';
  vault?: string | null; // masked token, e.g. "tok_…a1b2"
  expires?: string; // e.g. "30 Nov"
  spentRatio?: number; // 0..1, draws the spend arc
  className?: string;
  /** Smaller type for narrow columns (the Errand sidebar). */
  compact?: boolean;
};

const TONE = { allow: 'var(--al-allow)', stepup: 'var(--al-stepup)', block: 'var(--al-block)', muted: 'var(--al-muted)' } as const;

export function TitaniumCard({ amount, period, lines, status, statusTone, vault, expires, spentRatio = 0, className = '', compact = false }: TitaniumProps) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 140, damping: 18 });
  const sy = useSpring(py, { stiffness: 140, damping: 18 });
  const rotY = useTransform(sx, [0, 1], [-9, 9]);
  const rotX = useTransform(sy, [0, 1], [7, -7]);
  const gx = useTransform(sx, (v) => `${v * 100}%`);
  const gy = useTransform(sy, (v) => `${v * 100}%`);
  const sheen = useMotionTemplate`radial-gradient(120% 80% at ${gx} ${gy}, rgba(255,255,255,0.22), transparent 45%)`;
  const holo = useMotionTemplate`conic-gradient(from 0deg at ${gx} ${gy}, rgba(255,120,200,0.10), rgba(120,200,255,0.12), rgba(140,255,200,0.10), rgba(255,220,120,0.10), rgba(255,120,200,0.10))`;
  const arc = Math.max(0, Math.min(1, spentRatio));

  return (
    <div className={`[perspective:1100px] ${className}`}>
      <motion.div
        onPointerMove={(e) => {
          if (reduce) return;
          const r = e.currentTarget.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width);
          py.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => {
          px.set(0.5);
          py.set(0.5);
        }}
        style={reduce ? undefined : { rotateX: rotX, rotateY: rotY, transformStyle: 'preserve-3d' }}
        className="relative aspect-[1.586/1] w-full overflow-hidden rounded-[22px] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.08)_inset]"
      >
        {/* brushed titanium */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, #2b303b 0%, #161a23 38%, #262b36 58%, #10131a 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px)',
            backgroundBlendMode: 'overlay',
          }}
        />
        <div className="absolute inset-0 opacity-[0.35]" style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 2px)' }} />
        <motion.div className="absolute inset-0 mix-blend-screen" style={{ background: holo }} />
        <motion.div className="absolute inset-0" style={{ background: sheen }} />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

        <div className={`relative flex h-full flex-col justify-between ${compact ? 'p-4' : 'p-[7%]'}`}>
          <div className="flex items-start justify-between">
            <span className="inline-flex items-center gap-2">
              <Mark size={20} />
              <span className="wordmark text-platinum text-[11px]">ALLOWANCE</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em]" style={{ color: TONE[statusTone] }}>
              <span className="h-1.5 w-1.5 rounded-full breathe" style={{ background: TONE[statusTone], boxShadow: `0 0 10px ${TONE[statusTone]}` }} />
              {status}
            </span>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-2">
                <span className={`display text-platinum tabular ${compact ? 'text-[30px]' : 'text-[clamp(30px,4.2vw,46px)]'}`}>{amount}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">{period}</span>
              </div>
              <div className={`mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono uppercase text-white/55 ${compact ? 'text-[9px] tracking-[0.1em]' : 'text-[10.5px] tracking-[0.14em]'}`}>
                {lines.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            </div>
            <Chip small={compact} />
          </div>

          <div className={`flex items-end justify-between gap-2 whitespace-nowrap font-mono uppercase text-white/45 ${compact ? 'text-[8.5px] tracking-[0.12em]' : 'text-[10px] tracking-[0.18em]'}`}>
            <span className="truncate">{vault ? `${compact ? 'Vault' : 'PayPal Vault'} ${vault}` : compact ? 'Vault · not linked' : 'PayPal Vault · not linked'}</span>
            {expires && <span>{compact ? 'thru' : 'valid thru'} {expires}</span>}
          </div>
        </div>

        {/* spend arc along the bottom edge */}
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/5">
          <div className="h-full origin-left transition-transform duration-700" style={{ transform: `scaleX(${arc})`, background: 'linear-gradient(90deg, var(--al-allow), #b3ffe0)', boxShadow: '0 0 12px var(--al-allow)' }} />
        </div>
      </motion.div>
    </div>
  );
}

function Chip({ small = false }: { small?: boolean }) {
  return (
    <svg width={small ? 34 : 46} height={small ? 27 : 36} viewBox="0 0 46 36" aria-hidden className="shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
      <defs>
        <linearGradient id="al-chip" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3dfa6" />
          <stop offset="0.5" stopColor="#c9a24f" />
          <stop offset="1" stopColor="#f0d48f" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="44" height="34" rx="7" fill="url(#al-chip)" />
      <g stroke="rgba(80,55,10,0.55)" strokeWidth="1" fill="none">
        <path d="M1 12h13M1 24h13M32 12h13M32 24h13M14 1v34M32 1v34" />
        <rect x="14" y="9" width="18" height="18" rx="4" />
      </g>
    </svg>
  );
}
