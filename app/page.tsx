// Landing / judge mode. One idea per screen, few words, lots of space.
// Every number comes from lab/results/latest.json (Attack Lab) when a run exists.
import Link from 'next/link';
import { TitaniumCard } from '@/components/allowance/TitaniumCard';
import { CountUp, Reveal, WordReveal } from '@/components/fx/Reveal';
import { GateCanvas } from '@/components/hero/GateCanvas';
import { Chevron, TopBar } from '@/components/ui';
import { SITE, pct, readLab } from '@/lib/site';

export const dynamic = 'force-dynamic';

const pctNum = (r: { rate: number } | undefined | null) => (r ? r.rate * 100 : 0);
const dec = (r: { rate: number } | undefined | null) => (r && r.rate > 0 && r.rate < 0.1 ? 1 : 0);

const VERDICTS = [
  { word: 'Allow.', color: 'var(--al-allow)', line: 'Paid from your saved PayPal wallet.' },
  { word: 'Step-up.', color: 'var(--al-stepup)', line: 'PayPal asks you first, on your phone.' },
  { word: 'Block.', color: 'var(--al-block)', line: 'Stopped, with the rule that fired.' },
];

const PRIMITIVES = [
  { t: 'Consent', d: 'Vault v3 payment token' },
  { t: 'Payment', d: 'Orders v2, saved wallet' },
  { t: 'Ask first', d: 'PayPal checkout on your phone' },
  { t: 'Undo', d: 'Refunds, in one click' },
];

export default function Home() {
  const lab = readLab();
  const s = lab?.summary;

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar current="home" />

      <main>
        {/* Hero */}
        <section className="px-5 pt-14 text-center sm:pt-20">
          <p className="animate-rise text-[19px] font-semibold tracking-[-0.01em] text-text sm:text-[21px]">ALLOWANCE</p>
          <h1 className="display mx-auto mt-3 max-w-[920px] text-[clamp(44px,7vw,84px)]">
            <WordReveal text="Give your AI agent an allowance, not your wallet." accent={['allowance']} delay={0.1} stagger={0.05} />
          </h1>
          <p className="animate-rise mx-auto mt-6 max-w-[620px] text-[19px] leading-[1.4] text-muted [animation-delay:0.5s] sm:text-[21px]">A spending firewall for AI agents, built on PayPal.</p>
          <div className="animate-rise mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-4 [animation-delay:0.65s]">
            <Link href="/replay" className="btn-lux inline-flex h-11 items-center rounded-full px-6 text-[17px]">
              Replay a real sandbox run
            </Link>
            <Link href="/errand" className="link-chevron text-[17px]">
              Run it live
              <Chevron />
            </Link>
            {SITE.videoUrl && (
              <a href={SITE.videoUrl} target="_blank" rel="noreferrer" className="link-chevron text-[17px]">
                Watch the film
                <Chevron />
              </a>
            )}
          </div>
          <div className="animate-rise relative mx-auto mt-4 h-[min(62vw,580px)] max-w-[1180px] [animation-delay:0.8s]">
            <GateCanvas centered className="absolute inset-0 h-full w-full" />
          </div>
          <p className="mx-auto max-w-[520px] text-[12px] text-muted">Replay needs no login. Run it live needs the passcode in the Devpost testing instructions. PayPal sandbox only.</p>
        </section>

        {/* Verdicts */}
        <section className="px-5 py-32 text-center sm:py-40">
          <Reveal>
            <h2 className="display text-[clamp(36px,5.5vw,64px)]">Every payment gets a verdict.</h2>
            <p className="mx-auto mt-5 max-w-[620px] text-[19px] leading-[1.4] text-muted sm:text-[21px]">Twelve deterministic rules, on every money-moving tool call.</p>
          </Reveal>
          <div className="mx-auto mt-20 grid max-w-[980px] gap-14 sm:grid-cols-3 sm:gap-8">
            {VERDICTS.map((v, i) => (
              <Reveal key={v.word} delay={i * 0.12}>
                <p className="display text-[clamp(36px,4.4vw,52px)]" style={{ color: v.color }}>
                  {v.word}
                </p>
                <p className="mx-auto mt-3 max-w-[260px] text-[17px] leading-[1.45] text-muted">{v.line}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* The card */}
        <section className="px-5 py-32 text-center sm:py-40">
          <Reveal>
            <h2 className="display text-[clamp(36px,5.5vw,64px)]">A card your agent can’t overdraw.</h2>
            <p className="mx-auto mt-5 max-w-[620px] text-[19px] leading-[1.4] text-muted sm:text-[21px]">Set it once. Link PayPal once. Undo anything for ten minutes.</p>
          </Reveal>
          <Reveal delay={0.15}>
            <TitaniumCard
              amount="$200"
              period="this month"
              lines={['max $60 / purchase', 'ask above $40', 'no subscriptions']}
              status="ACTIVE"
              statusTone="allow"
              vault="tok_…7c1e"
              expires="30 Nov"
              spentRatio={0.36}
              className="mx-auto mt-16 max-w-[460px]"
            />
          </Reveal>
        </section>

        {/* The principle */}
        <section className="bg-[#0a0a0a] px-5 py-32 text-center sm:py-40">
          <Reveal>
            <h2 className="display mx-auto max-w-[860px] text-[clamp(36px,5.5vw,64px)]">
              The AI shops.
              <br />
              <span className="text-muted">It never decides.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-[640px] text-[19px] leading-[1.45] text-muted sm:text-[21px]">The guard never reads what an attacker writes. Only your task, your allowance, a trusted catalog and PayPal.</p>
            <Link href="/lab" className="link-chevron mt-8 inline-block text-[17px]">
              See how the Attack Lab tests it
              <Chevron />
            </Link>
          </Reveal>
        </section>

        {/* Numbers */}
        <section className="px-5 py-32 sm:py-40" aria-label="Attack Lab results">
          <div className="mx-auto grid max-w-[980px] gap-16 text-center sm:grid-cols-3 sm:gap-8">
            {s ? (
              <>
                <Num value={<CountUp to={pctNum(s.attacks.unguarded)} decimals={dec(s.attacks.unguarded)} suffix="%" />} label="of attacks fooled the unguarded agent" color="var(--al-block)" />
                <Num value={<CountUp to={pctNum(s.attacks.guarded)} decimals={dec(s.attacks.guarded)} suffix="%" />} label="got past ALLOWANCE" color="var(--al-allow)" />
                <Num value={<CountUp to={pctNum(s.benign.falseBlock)} decimals={dec(s.benign.falseBlock)} suffix="%" />} label="of normal errands falsely blocked" />
              </>
            ) : (
              <>
                <Num value="12" label="deterministic rules" />
                <Num value="100" label="Attack Lab scenarios" />
                <Num value="1 click" label="to undo, as a real refund" />
              </>
            )}
          </div>
          {s && lab && (
            <p className="mt-12 text-center text-[12px] text-muted">
              {s.attacks.unguarded.n} attack runs · {s.benign.falseBlock.n} benign runs · {lab.meta.model} ·{' '}
              <Link href="/lab" className="link-inline">
                Method and raw data
              </Link>
              <span className="sr-only">
                {pct(s.attacks.unguarded)} unguarded, {pct(s.attacks.guarded)} with ALLOWANCE, {pct(s.benign.falseBlock)} false blocks
              </span>
            </p>
          )}
        </section>

        {/* PayPal */}
        <section className="px-5 py-32 text-center sm:py-40">
          <Reveal>
            <h2 className="display text-[clamp(36px,5.5vw,64px)]">Built entirely on PayPal.</h2>
            <p className="mx-auto mt-5 max-w-[620px] text-[19px] leading-[1.4] text-muted sm:text-[21px]">No new rails. Just PayPal’s own primitives.</p>
          </Reveal>
          <div className="mx-auto mt-20 grid max-w-[980px] grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-4">
            {PRIMITIVES.map((p, i) => (
              <Reveal key={p.t} delay={i * 0.08}>
                <p className="text-[21px] font-semibold tracking-[-0.015em] text-text">{p.t}</p>
                <p className="mt-2 text-[14px] leading-snug text-muted">{p.d}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Final */}
        <section className="px-5 pb-40 pt-16 text-center">
          <Reveal>
            <h2 className="display text-[clamp(40px,6vw,72px)]">Watch it decide.</h2>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
              <Link href="/replay" className="btn-lux inline-flex h-11 items-center rounded-full px-6 text-[17px]">
                Open the replay
              </Link>
              <Link href="/control-room" className="link-chevron text-[17px]">
                Control Room
                <Chevron />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-white/[0.08] px-5 py-6">
        <div className="mx-auto flex max-w-[980px] flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
          <span>
            PayPal sandbox only — test money, simulated merchants. Built with PayPal, OpenAI and AG Studio by {SITE.author}. MIT licence.
            {SITE.repoUrl && (
              <>
                {' '}
                <a href={SITE.repoUrl} className="link-inline">
                  Source
                </a>
              </>
            )}
          </span>
        </div>
      </footer>
    </div>
  );
}

function Num({ value, label, color }: { value: React.ReactNode; label: string; color?: string }) {
  return (
    <div>
      <div className="display tabular text-[clamp(52px,6vw,80px)]" style={color ? { color } : undefined}>
        {value}
      </div>
      <p className="mt-2 text-[17px] text-muted">{label}</p>
    </div>
  );
}
