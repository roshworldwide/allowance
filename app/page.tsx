// Landing / judge mode: the idea, the proof (live numbers from the Attack Lab), and three ways in.
import Link from 'next/link';
import { TitaniumCard } from '@/components/allowance/TitaniumCard';
import { Mark } from '@/components/brand/Mark';
import { CountUp, Reveal, WordReveal } from '@/components/fx/Reveal';
import { GateCanvas } from '@/components/hero/GateCanvas';
import { Intro } from '@/components/hero/Intro';
import { SandboxBadge, TopBar, VerdictChip, type VerdictChipKind } from '@/components/ui';
import { SITE, pct, readLab } from '@/lib/site';

export const dynamic = 'force-dynamic';

const PRIMITIVES: [string, string][] = [
  ['“I consent to this agent spending for me”', 'Vault v3 payment token — the saved PayPal wallet (usage_type MERCHANT)'],
  ['The agent pays', 'Orders v2 with payment_source.paypal.vault_id (completes without the payer present)'],
  ['“Ask me first” above a threshold', 'A normal Orders v2 checkout you approve in PayPal (QR → phone)'],
  ['Undo', 'Refunds: POST /v2/payments/captures/{id}/refund'],
  ['No double-spend on retries', 'PayPal-Request-Id = the guard’s decision id'],
  ['Kill switch', 'DELETE /v3/vault/payment-tokens/{id}'],
  ['Proof / audit', 'Webhooks (signature-verified) + a hash-chained decision log'],
  ['The agent’s toolbelt', 'Vault checkout + the money-moving tools of @paypal/agent-toolkit — all behind one guard'],
];

// Example verdicts: the demo errand (catalog prices, same flow as the replay) plus two Attack Lab patterns.
const TICKER: [VerdictChipKind, string][] = [
  ['PAID', '2 × USB-C cable · $23.98'],
  ['BLOCK', 'R02 TASK_BINDING · USB-C hub · $34.00 · not in your task'],
  ['STEP_UP', 'R11 · desk lamp · $48.00 · above your $40 ask-me line'],
  ['APPROVED', 'desk lamp · $48.00 · approved in PayPal'],
  ['REFUNDED', '2 × USB-C cable · $23.98 · one-click undo'],
  ['BLOCK', 'R08 NO_RECURRING · “$1 trial, then $39/month”'],
  ['BLOCK', 'R03 CATALOG_INTEGRITY · agent tried to name its own price'],
];

const pctNum = (r: { rate: number } | undefined | null) => (r ? r.rate * 100 : 0);
const dec = (r: { rate: number } | undefined | null) => (r && r.rate > 0 && r.rate < 0.1 ? 1 : 0);

export default function Home() {
  const lab = readLab();
  const s = lab?.summary;
  const date = lab ? new Date(lab.meta.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const primaryVideo = Boolean(SITE.videoUrl);

  return (
    <div className="flex min-h-screen flex-col">
      <Intro />
      <TopBar current="home" />

      {/* ─────────────── Hero ─────────────── */}
      <section className="relative -mt-[68px] min-h-[min(100svh,980px)] overflow-hidden pt-[68px]">
        <GateCanvas className="absolute inset-0 h-full w-full" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,13,0.92)_0%,rgba(5,7,13,0.7)_38%,rgba(5,7,13,0)_62%)] max-[899px]:bg-[linear-gradient(180deg,rgba(5,7,13,0)_0%,rgba(5,7,13,0.75)_45%,rgba(5,7,13,0.95)_70%)]" />
        <div className="relative mx-auto flex min-h-[min(calc(100svh-68px),912px)] w-full max-w-[1320px] flex-col justify-end px-5 pb-10 pt-[46vh] sm:px-8 min-[900px]:justify-center min-[900px]:pt-10">
          <div className="max-w-[720px]">
            <p className="flex flex-wrap items-center gap-3 animate-rise">
              <SandboxBadge />
              <span className="eyebrow">PayPal · OpenAI · AG Studio</span>
            </p>
            <h1 className="display mt-6 text-[clamp(44px,7.4vw,108px)]">
              <WordReveal text="Give your AI agent an allowance, not your wallet." wordClassName="text-platinum" accent={['allowance']} delay={0.15} />
            </h1>
            <p className="mt-7 max-w-[560px] text-[17px] leading-relaxed text-muted animate-rise [animation-delay:0.9s]">
              Agents can now spend money. Today, giving one PayPal access means giving it your wallet. <span className="text-text">ALLOWANCE</span> turns PayPal’s own primitives into an allowance an agent can’t break — every money-moving tool call gets <span className="font-semibold text-allow">ALLOW</span>, <span className="font-semibold text-stepup">STEP-UP</span> or <span className="font-semibold text-block">BLOCK</span> from twelve deterministic rules.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3 animate-rise [animation-delay:1.1s]">
              {primaryVideo && (
                <a href={SITE.videoUrl} target="_blank" rel="noreferrer" className="btn-lux inline-flex h-12 items-center gap-2.5 rounded-full px-6 text-[15px] font-semibold">
                  <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[10px] text-white">▶</span>
                  Watch the 3-minute demo
                </a>
              )}
              <Link href="/replay" className={`inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold ${primaryVideo ? 'btn-glass text-text' : 'btn-lux'}`}>
                Replay a real sandbox run
              </Link>
              <Link href="/errand" className="btn-glass inline-flex h-12 items-center rounded-full px-6 text-[15px] font-medium text-text">
                Run it live
              </Link>
            </div>
            <p className="mt-4 text-[12.5px] text-muted animate-rise [animation-delay:1.25s]">Replay needs no login. Run it live needs the passcode in the Devpost testing instructions. The free server can take about a minute to wake up.</p>
          </div>

          {/* proof strip */}
          <div className="glass mt-12 grid max-w-[980px] gap-px overflow-hidden !rounded-[22px] animate-rise [animation-delay:1.4s] sm:grid-cols-3" aria-label="Attack Lab results">
            {s ? (
              <>
                <Stat value={<CountUp to={pctNum(s.attacks.unguarded)} decimals={dec(s.attacks.unguarded)} suffix="%" />} label="attacks that fooled the unguarded agent" tone="text-block" />
                <Stat value={<CountUp to={pctNum(s.attacks.guarded)} decimals={dec(s.attacks.guarded)} suffix="%" />} label="attacks that got past ALLOWANCE" tone="text-allow" />
                <Stat value={<CountUp to={pctNum(s.benign.falseBlock)} decimals={dec(s.benign.falseBlock)} suffix="%" />} label="normal errands falsely blocked" tone="text-text" />
                <p className="px-6 pb-4 font-mono text-[11px] text-muted sm:col-span-3">
                  {s.attacks.unguarded.n} attack runs · {s.benign.falseBlock.n} benign runs · {lab.meta.model} · {lab.meta.seeds} seed(s) · {date} ·{' '}
                  <Link href="/lab" className="underline decoration-dotted hover:text-text">method & holdout</Link> ·{' '}
                  <a href="/api/lab/latest.json" className="underline decoration-dotted hover:text-text">raw JSON</a>
                  <span className="sr-only">
                    {pct(s.attacks.unguarded)} unguarded, {pct(s.attacks.guarded)} with ALLOWANCE, {pct(s.benign.falseBlock)} false blocks
                  </span>
                </p>
              </>
            ) : (
              <>
                <Stat value="12" label="deterministic rules on every money-moving tool call" tone="text-platinum" />
                <Stat value="60 + 40" label="attacks and normal errands in the Attack Lab" tone="text-platinum" />
                <Stat value="1 click" label="to undo a purchase — a real PayPal refund" tone="text-platinum" />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ─────────────── Ticker ─────────────── */}
      <section aria-label="Example verdicts from the demo errand and the Attack Lab" className="relative border-y border-white/[0.06] bg-white/[0.012] py-4">
        <div className="mx-auto flex max-w-[1320px] items-center gap-5 px-5 sm:px-8">
          <span className="eyebrow hidden shrink-0 md:inline">Example verdicts</span>
          <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
            <div className="marquee flex w-max gap-3">
              {[...TICKER, ...TICKER].map(([k, t], i) => (
                <span key={i} className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-white/[0.07] bg-white/[0.02] py-1 pl-1.5 pr-4 text-[13px] text-muted" aria-hidden={i >= TICKER.length}>
                  <VerdictChip kind={k} />
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1320px] px-5 sm:px-8">
        {/* ─────────────── The allowance, made physical ─────────────── */}
        <section aria-labelledby="card" className="grid items-center gap-14 py-28 lg:grid-cols-[1.05fr_1fr]">
          <Reveal>
            <TitaniumCard
              amount="$200"
              period="this month"
              lines={['max $60 / purchase', 'ask above $40', 'no subscriptions']}
              status="ACTIVE"
              statusTone="allow"
              vault="tok_…7c1e"
              expires="30 Nov"
              spentRatio={0.36}
              className="mx-auto max-w-[520px]"
            />
          </Reveal>
          <Reveal delay={0.1}>
            <p className="eyebrow">The allowance</p>
            <h2 id="card" className="display mt-4 text-[clamp(34px,4.6vw,64px)] text-platinum">
              A card your agent can’t overdraw.
            </h2>
            <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-muted">
              You set the terms once. You link PayPal once — a Vault consent, not your password. From then on every purchase the agent attempts is checked against the allowance, the errand you confirmed and a trusted catalog, before PayPal moves a cent.
            </p>
            <dl className="mt-8 grid max-w-[520px] grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.04]">
              {[
                ['Budget', '$200 this month'],
                ['Per purchase', 'max $60'],
                ['Categories', 'office supplies + electronics'],
                ['Subscriptions', 'never'],
                ['Ask me', 'above $40, in PayPal'],
                ['Undo', '10 minutes, real refund'],
              ].map(([k, v]) => (
                <div key={k} className="bg-ink/70 px-4 py-3.5">
                  <dt className="eyebrow !text-[10px]">{k}</dt>
                  <dd className="mt-1 text-[14px] text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        {/* ─────────────── How it works ─────────────── */}
        <section aria-labelledby="how" className="py-16">
          <Reveal>
            <p className="eyebrow">How it works</p>
            <h2 id="how" className="display mt-4 max-w-[820px] text-[clamp(32px,4.2vw,58px)] text-platinum">
              Three moves. One deterministic gate.
            </h2>
          </Reveal>
          <div className="relative mt-12">
            <div aria-hidden className="pointer-events-none absolute left-[8%] right-[8%] top-[46px] z-10 hidden h-px md:block">
              <div className="hairline h-px w-full" />
              <div className="flow-line absolute inset-0 h-px" />
            </div>
          <ol className="grid gap-5 md:grid-cols-3">
            {[
              ['01', 'You set an allowance', '$200 this month · max $60 per purchase · office supplies and electronics · no subscriptions · ask me above $40. You link PayPal once: a Vault consent, not your password.'],
              ['02', 'Your agent shops', 'It turns your errand into a task contract you confirm. Every money-moving tool call then passes 12 rules: ALLOW, STEP-UP (PayPal asks you) or BLOCK, with the rule that fired.'],
              ['03', 'PayPal moves the money', 'Allowed purchases are paid from your saved PayPal wallet; step-ups you approve in PayPal on your phone; anything can be undone for 10 minutes — a real refund.'],
            ].map(([n, t, d], i) => (
              <Reveal as="li" key={n} delay={i * 0.12} className="glass spot p-7">
                <span className="relative z-10 flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/15 bg-ink font-mono text-[12px] text-platinum shadow-[0_0_30px_-6px_rgba(169,184,255,0.6)]">{n}</span>
                <h3 className="mt-6 text-[19px] font-semibold tracking-[-0.01em] text-text">{t}</h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">{d}</p>
              </Reveal>
            ))}
          </ol>
          </div>
        </section>

        {/* ─────────────── PayPal primitives ─────────────── */}
        <section aria-labelledby="primitives" className="py-20">
          <Reveal>
            <p className="eyebrow">Under the hood</p>
            <h2 id="primitives" className="display mt-4 text-[clamp(32px,4.2vw,58px)] text-platinum">
              Built only from PayPal primitives
            </h2>
          </Reveal>
          <Reveal delay={0.08} className="glass mt-10 overflow-hidden !rounded-[24px]">
            <ul>
              {PRIMITIVES.map(([a, b], i) => (
                <li key={a} className={`grid gap-1 px-6 py-4 transition-colors hover:bg-white/[0.025] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] md:gap-8 ${i ? 'border-t border-white/[0.06]' : ''}`}>
                  <span className="text-[15px] text-text">{a}</span>
                  <span className="font-mono text-[12.5px] leading-relaxed text-muted">{b}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* ─────────────── Why ─────────────── */}
        <section aria-labelledby="why" className="py-16">
          <Reveal>
            <p className="eyebrow">Design principle</p>
            <h2 id="why" className="display mt-4 max-w-[900px] text-[clamp(32px,4.2vw,58px)] text-platinum">
              Why it can’t be talked out of a decision
            </h2>
          </Reveal>
          <ul className="mt-12 grid gap-5 md:grid-cols-2">
            {[
              ['◎', 'The guard never reads attacker text', 'Product pages, reviews and seller notes reach the agent, never the rules. The guard sees only your confirmed task, your allowance, the trusted catalog, the ledger and PayPal’s responses.'],
              ['⌁', 'The agent can’t name a price or a payee', 'Its checkout tool takes a SKU, a quantity and a task line. The amount comes from the trusted catalog; the payee from the registry.'],
              ['◇', 'Task-binding stops the quiet attacks', 'A $34 hub slipped in by a product page is in budget, in category and under every cap. It still isn’t in the task you confirmed, so R02 blocks it.'],
              ['◉', 'The AI shops and explains. It never decides.', 'Every verdict comes from deterministic code with a full rule trace, in under a millisecond, hash-chained for audit. Language models parse, shop and explain.'],
            ].map(([g, t, d], i) => (
              <Reveal as="li" key={t} delay={(i % 2) * 0.1} className="glass spot p-7">
                <span aria-hidden className="text-[22px] text-platinum">{g}</span>
                <h3 className="mt-4 text-[19px] font-semibold tracking-[-0.01em] text-text">{t}</h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">{d}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ─────────────── Final CTA ─────────────── */}
        <section className="py-24">
          <Reveal className="glass relative overflow-hidden !rounded-[32px] px-6 py-16 text-center sm:px-12">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(169,184,255,0.22),transparent)]" />
            <Mark size={44} className="mx-auto" />
            <h2 className="display mx-auto mt-6 max-w-[760px] text-[clamp(32px,4.6vw,64px)] text-platinum">Watch it decide.</h2>
            <p className="mx-auto mt-4 max-w-[520px] text-[16px] text-muted">A real PayPal sandbox run, replayed exactly as it happened — the injection blocked, the step-up approved on a phone, the undo refunded.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/replay" className="btn-lux inline-flex h-12 items-center rounded-full px-7 text-[15px] font-semibold">
                Open the replay
              </Link>
              <Link href="/lab" className="btn-glass inline-flex h-12 items-center rounded-full px-7 text-[15px] font-medium text-text">
                See the Attack Lab
              </Link>
              <Link href="/control-room" className="btn-glass inline-flex h-12 items-center rounded-full px-7 text-[15px] font-medium text-text">
                Control Room
              </Link>
            </div>
          </Reveal>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] py-8 text-[12.5px] text-muted">
          <span>
            Built with PayPal (sandbox), OpenAI and AG Studio · by {SITE.author} · MIT licence{SITE.repoUrl ? ' · ' : ''}
            {SITE.repoUrl && (
              <a href={SITE.repoUrl} className="underline decoration-dotted hover:text-text">
                source
              </a>
            )}
          </span>
          <span>PayPal sandbox only — test money, simulated merchants.</span>
        </footer>
      </main>
    </div>
  );
}

function Stat({ value, label, tone }: { value: React.ReactNode; label: string; tone: string }) {
  return (
    <div className="bg-ink/40 px-6 py-5">
      <div className={`display tabular font-mono text-[clamp(30px,3.4vw,44px)] !tracking-[-0.04em] ${tone}`}>{value}</div>
      <div className="mt-1.5 text-[13px] leading-snug text-muted">{label}</div>
    </div>
  );
}
