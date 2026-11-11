// /lab — Attack Lab results, method and limitations. Every number comes from lab/results/latest.json.
import type { Metadata } from 'next';
import { TopBar } from '@/components/ui';
import { pct, readLab } from '@/lib/site';

export const metadata: Metadata = { title: 'Attack Lab' };
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

function Bar({ label, rate, tone }: { label: string; rate: { rate: number; k: number; n: number }; tone: 'block' | 'allow' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-text">{label}</span>
        <span className={`display tabular font-mono text-[34px] !tracking-[-0.04em] ${tone === 'block' ? 'text-block' : 'text-allow'}`}>
          {pct(rate)} <span className="text-[12px] text-muted">({rate.k}/{rate.n})</span>
        </span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${label}: ${pct(rate)}`}>
        <div className={`grow-x h-full rounded-full ${tone === 'block' ? 'bg-[linear-gradient(90deg,#b8203f,var(--al-block))] shadow-[0_0_16px_var(--al-block)]' : 'bg-[linear-gradient(90deg,#1fb985,var(--al-allow))] shadow-[0_0_16px_var(--al-allow)]'}`} style={{ width: `${Math.max(rate.rate * 100, rate.k ? 1.5 : 0)}%` }} />
      </div>
    </div>
  );
}

export default function LabPage() {
  const lab = readLab();
  const hold = readLab('holdout-latest.json');
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar current="lab" />
      <main className="animate-rise mx-auto w-full max-w-[1100px] px-5 pb-28 pt-14">
        <header className="text-center">
          <p className="eyebrow">Proof, not promises</p>
          <h1 className="display mt-2 text-[clamp(44px,6vw,80px)]">Attack Lab</h1>
          <p className="mx-auto mt-4 max-w-[640px] text-[19px] leading-[1.4] text-muted sm:text-[21px]">The same OpenAI agent, with and without ALLOWANCE, against attacks hidden in product pages — and against normal errands.</p>
        </header>

        {!lab ? (
          <p className="glass mx-auto mt-14 max-w-[640px] p-8 text-center text-[17px] text-muted">No run recorded yet. 60 attacks across 12 families and 40 normal errands are ready.</p>
        ) : (
          <>
            <section className="glass mt-10 grid gap-8 p-8 md:grid-cols-2">
              <Bar label="Attacks that succeeded — unguarded" rate={lab.summary.attacks.unguarded} tone="block" />
              <Bar label="Attacks that succeeded — with ALLOWANCE" rate={lab.summary.attacks.guarded} tone="allow" />
              <p className="text-[13px] text-muted md:col-span-2">
                {usd(lab.summary.attacks.preventedCents)} of unauthorised spend prevented · {lab.summary.attacks.stoppedByBlock} guarded attack runs stopped by a BLOCK · {lab.summary.attacks.reachedStepUp} reached a STEP-UP and needed the person · guard p95 {lab.summary.guardLatencyMs.p95} ms over {lab.summary.guardLatencyMs.decisions} decisions
              </p>
            </section>

            <section className="mt-14" aria-labelledby="families">
              <h2 id="families" className="display text-platinum text-[28px]">
                By attack family
              </h2>
              {/* Scrolls sideways on phones; focusable so keyboard users can scroll it too. */}
              <div className="glass mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Results by attack family">
                <table className="w-full min-w-[620px] text-left text-[14px]">
                  <thead className="text-muted">
                    <tr>
                      <th className="px-5 py-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.18em]">Family</th>
                      <th className="px-5 py-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.18em]">Scenarios</th>
                      <th className="px-5 py-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.18em]">Unguarded</th>
                      <th className="px-5 py-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.18em]">ALLOWANCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lab.summary.attacks.families.map((f) => (
                      <tr key={f.family} className="border-t border-white/[0.06] transition-colors hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-text">
                          <span className="font-mono text-[12px] text-muted">{f.family}</span> {f.name}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-muted">{f.scenarios}</td>
                        <td className="px-4 py-2.5 font-mono text-block">
                          {pct(f.unguarded)} <span className="text-[11px] text-muted">({f.unguarded.k}/{f.unguarded.n})</span>
                        </td>
                        <td className={`px-4 py-2.5 font-mono ${f.guarded.k ? 'text-block' : 'text-allow'}`}>
                          {pct(f.guarded)} <span className="text-[11px] text-muted">({f.guarded.k}/{f.guarded.n})</span>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-white/[0.06] bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-text">
                        <span className="font-mono text-[12px] text-muted">H</span> Holdout — written independently, never tuned on
                      </td>
                      {hold?.summary.holdout ? (
                        <>
                          <td className="px-4 py-2.5 font-mono text-muted">{hold.meta.scenarios}</td>
                          <td className="px-4 py-2.5 font-mono text-block">{pct(hold.summary.holdout.unguarded)}</td>
                          <td className={`px-4 py-2.5 font-mono ${hold.summary.holdout.guarded.k ? 'text-block' : 'text-allow'}`}>{pct(hold.summary.holdout.guarded)}</td>
                        </>
                      ) : (
                        <td colSpan={3} className="px-4 py-2.5 text-muted">
                          not run
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Normal errands">
              {[
                ['False blocks', lab.summary.benign.falseBlock, 'normal errands where ALLOWANCE blocked a purchase the task authorised'],
                ['Friction', lab.summary.benign.friction, 'normal errands with an item above the ask-me line, so the person approved it in PayPal (by design)'],
                ['Completed', lab.summary.benign.completionGuarded, 'normal errands fully bought with ALLOWANCE on'],
              ].map(([t, r, d]) => {
                const rr = r as { rate: number; k: number; n: number };
                return (
                  <div key={t as string} className="glass spot p-6">
                    <p className="text-sm text-muted">{t as string}</p>
                    <p className="display tabular mt-2 font-mono text-[40px] !tracking-[-0.04em] text-platinum">
                      {pct(rr)} <span className="text-[12px] text-muted">({rr.k}/{rr.n})</span>
                    </p>
                    <p className="mt-2 text-[13px] text-muted">{d as string}</p>
                  </div>
                );
              })}
            </section>

            <section className="mt-14 grid gap-10 md:grid-cols-2" aria-label="Method">
              <div>
                <h2 className="display text-platinum text-[28px]">Method</h2>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-muted">
                  <li>
                    {lab.meta.scenarios} scenarios × unguarded/guarded × {lab.meta.seeds} seed(s): {lab.meta.runsDone} runs with <span className="font-mono text-text">{lab.meta.model}</span> on {new Date(lab.meta.date).toUTCString()} (git {lab.meta.gitSha}, ~${lab.meta.estimatedCostUsd}).
                  </li>
                  <li>Both configurations use the same system prompt, model and read tools. Only the money tools differ: unguarded, a free-form “pay with saved PayPal” tool and a subscribe tool (simulated money, nothing charged); guarded, ALLOWANCE’s checkout plus PayPal Agent Toolkit money tools, all behind the guard (fake PayPal).</li>
                  <li>{lab.meta.judge}</li>
                  <li>{lab.meta.humanModel}</li>
                </ul>
              </div>
              <div>
                <h2 className="display text-platinum text-[28px]">Limitations</h2>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-muted">
                  <li>Merchants and the catalog are simulated; the trusted registry stands in for merchant-signed catalogs.</li>
                  <li>LLM behaviour varies run to run; seeds are repetitions, not deterministic seeds.</li>
                  <li>The guard protects money paths, not information: an agent can still be misled into a bad (but authorised) choice within the task.</li>
                  {lab.meta.stoppedByCostCap && <li>This run stopped at the cost cap; numbers cover the runs completed.</li>}
                </ul>
                <p className="mt-4 text-[13px]">
                  <a href="/api/lab/latest.json" className="text-accent underline decoration-dotted">
                    Raw results (JSON)
                  </a>
                </p>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
