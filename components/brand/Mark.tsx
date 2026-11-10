// The ALLOWANCE mark: a ring of twelve rule lamps around a gate. Pure SVG, no client JS.
export function Mark({ size = 22, className = '' }: { size?: number; className?: string }) {
  const lamps = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    // Rounded so server and client render byte-identical attributes (no hydration mismatch).
    return { x: Math.round((12 + Math.cos(a) * 9.2) * 1000) / 1000, y: Math.round((12 + Math.sin(a) * 9.2) * 1000) / 1000, on: i % 4 !== 3 };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="al-mark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#a1a1a6" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11.2" fill="none" stroke="url(#al-mark)" strokeWidth="0.9" opacity="0.55" />
      {lamps.map((l, i) => (
        <circle key={i} cx={l.x} cy={l.y} r={0.95} fill={l.on ? 'var(--al-allow)' : 'var(--al-block)'} opacity={l.on ? 0.95 : 0.9} />
      ))}
      <rect x="10.9" y="6.2" width="2.2" height="11.6" rx="1.1" fill="url(#al-mark)" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark size={18} />
      <span className="wordmark text-[12px] text-text">ALLOWANCE</span>
    </span>
  );
}
