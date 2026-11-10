// A 1.4-second opening on the landing page: the twelve lamps light around the ring, the gate
// closes, the wordmark settles, then the curtain lifts. Pure CSS (no JS needed, nothing blocks
// interaction: the curtain stops catching pointer events as it fades). Skipped for reduced motion.
export function Intro() {
  const lamps = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.round((60 + Math.cos(a) * 46) * 100) / 100, y: Math.round((60 + Math.sin(a) * 46) * 100) / 100, d: 0.12 + i * 0.045, block: i === 7 };
  });
  return (
    <div aria-hidden className="al-intro pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#05070d]">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(226,232,248,0.35)" strokeWidth="1" className="al-intro-ring" />
        {lamps.map((l, i) => (
          <circle key={i} cx={l.x} cy={l.y} r="3.2" fill={l.block ? 'var(--al-block)' : 'var(--al-allow)'} className="al-intro-lamp" style={{ animationDelay: `${l.d}s` }} />
        ))}
        <rect x="58.6" y="30" width="2.8" height="60" rx="1.4" fill="#eef1f8" className="al-intro-gate" />
      </svg>
      <span className="wordmark text-platinum al-intro-word mt-6 text-[13px]">ALLOWANCE</span>
      <style>{`
        .al-intro { animation: al-intro-out 0.7s cubic-bezier(0.16,1,0.3,1) 1.25s both; }
        .al-intro-ring { stroke-dasharray: 290; stroke-dashoffset: 290; animation: al-intro-draw 0.9s cubic-bezier(0.16,1,0.3,1) 0.05s forwards; }
        .al-intro-lamp { opacity: 0; transform-box: fill-box; transform-origin: center; animation: al-intro-lamp 0.35s cubic-bezier(0.16,1,0.3,1) forwards; filter: drop-shadow(0 0 4px currentColor); }
        .al-intro-gate { transform-box: fill-box; transform-origin: center; transform: scaleY(0); animation: al-intro-gate 0.6s cubic-bezier(0.16,1,0.3,1) 0.55s forwards; }
        .al-intro-word { opacity: 0; letter-spacing: 0.6em; animation: al-intro-word 0.8s cubic-bezier(0.16,1,0.3,1) 0.6s forwards; }
        @keyframes al-intro-draw { to { stroke-dashoffset: 0; } }
        @keyframes al-intro-lamp { from { opacity: 0; transform: scale(0.2); } to { opacity: 1; transform: scale(1); } }
        @keyframes al-intro-gate { to { transform: scaleY(1); } }
        @keyframes al-intro-word { to { opacity: 1; letter-spacing: 0.32em; } }
        @keyframes al-intro-out { to { opacity: 0; visibility: hidden; transform: scale(1.04); } }
        @media (prefers-reduced-motion: reduce) { .al-intro { display: none; } }
      `}</style>
    </div>
  );
}
