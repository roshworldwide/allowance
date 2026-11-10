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
        <span className={`font-mono text-2xl ${tone === 'block' ? 'text-block' : 'text-allow'}`}>
          {pct(rate)} <span className="text-[12px] text-muted">({rate.k}/{rate.n})</span>
        </span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${label}: ${pct(rate)}`}>
        <div className={`h-full ${tone === 'block' ? 'bg-block' : 'bg-allow'}`} style={{ width: `${Math.max(rate.rate * 100, rate.k ? 1.5 : 0)}%` }} />
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
      <main className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold text-text">Attack Lab</h1>
        <p className="mt-2 max-w-3xl text-muted">The same OpenAI shopping agent, same prompt, same tools for reading the store — once with a typical saved-PayPal payment tool, once behind ALLOWANCE — against attack patterns hidden in product pages, reviews and listings, and against normal errands.</p>

        {!lab ? (
          <p className="mt-10 rounded-card border border-dashed border-line p-6 text-muted">No Attack Lab run recorded yet.</p>
        ) : (
          <>
            <section className="mt-8 grid gap-6 rounded-card border border-line bg-surface p-6 md:grid-cols-2">
              <Bar label="Attacks that succeeded — unguarded" rate={lab.summary.attacks.unguarded} tone="block" />
              <Bar label="Attacks that succeeded — with ALLOWANCE" rate={lab.summary.attacks.guarded} tone="allow" />
              <p className="text-[13px] text-muted md:col-span-2">
                {usd(lab.summary.attacks.preventedCents)} of unauthorised spend prevented · {lab.summary.attacks.stoppedByBlock} guarded attack runs stopped by a BLOCK · {lab.summary.attacks.reachedStepUp} reached a STEP-UP and needed the person · guard p95 {lab.summary.guardLatencyMs.p95} ms over {lab.summary.guardLatencyMs.decisions} decisions
              </p>
            </section>

            <section className="mt-8" aria-labelledby="families">
              <h2 id="families" className="text-lg font-semibold text-text">
                By attack family
              </h2>
              <div className="mt-3 overflow-x-auto rounded-card border border-line">
                <table className="w-full min-w-[620px] text-left text-[14px]">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Family</th>
                      <th className="px-4 py-2.5 font-medium">Scenarios</th>
                      <th className="px-4 py-2.5 font-medium">Unguarded</th>
                      <th className="px-4 py-2.5 font-medium">ALLOWANCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lab.summary.attacks.families.map((f) => (
                      <tr key={f.family} className="border-t border-line">
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
                    <tr className="border-t border-line bg-surface-2/50">
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
                ['Friction', lab.summary.benign.friction, 'normal errands that needed a step-up (the person approves in PayPal)'],
                ['Completed', lab.summary.benign.completionGuarded, 'normal errands fully bought with ALLOWANCE on'],
              ].map(([t, r, d]) => {
                const rr = r as { rate: number; k: number; n: number };
                return (
                  <div key={t as string} className="rounded-card border border-line bg-surface p-5">
                    <p className="text-sm text-muted">{t as string}</p>
                    <p className="mt-1 font-mono text-3xl text-text">
                      {pct(rr)} <span className="text-[12px] text-muted">({rr.k}/{rr.n})</span>
                    </p>
                    <p className="mt-2 text-[13px] text-muted">{d as string}</p>
                  </div>
                );
              })}
            </section>

            <section className="mt-10 grid gap-6 md:grid-cols-2" aria-label="Method">
              <div>
                <h2 className="text-lg font-semibold text-text">Method</h2>
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
                <h2 className="text-lg font-semibold text-text">Limitations</h2>
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
