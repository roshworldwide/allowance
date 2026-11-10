// Landing / judge mode: the idea, the proof (live numbers from the Attack Lab), and three ways in.
import Link from 'next/link';
import { SandboxBadge, TopBar } from '@/components/ui';
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

export default function Home() {
  const lab = readLab();
  const s = lab?.summary;
  const date = lab ? new Date(lab.meta.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar current="home" />
      <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 sm:px-6">
        <section className="grid items-center gap-10 py-12 lg:grid-cols-[1.15fr_1fr] lg:py-20">
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <SandboxBadge />
              <span className="font-mono text-[11px] text-muted">simulated merchants · real PayPal sandbox payments</span>
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-text sm:text-5xl">Give your AI agent an allowance, not your wallet.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Agents can now spend money. Today, giving one PayPal access means giving it your wallet. <span className="text-text">ALLOWANCE</span> turns PayPal’s own primitives into an allowance an agent can’t break: every money-moving tool call gets{' '}
              <span className="font-semibold text-allow">ALLOW</span>, <span className="font-semibold text-stepup">STEP-UP</span> or <span className="font-semibold text-block">BLOCK</span> from twelve deterministic rules.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {SITE.videoUrl && (
                <a href={SITE.videoUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-ink">
                  ▶ Watch the 3-minute demo
                </a>
              )}
              <Link href="/replay" className={`inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold ${SITE.videoUrl ? 'border border-line bg-surface-2 text-text' : 'bg-accent text-ink'}`}>
                Replay a real sandbox run
              </Link>
              <Link href="/errand" className="inline-flex h-11 items-center rounded-xl border border-line bg-surface-2 px-5 text-sm font-semibold text-text">
                Run it live
              </Link>
            </div>
            <p className="mt-3 text-[12.5px] text-muted">Replay needs no login. Run it live needs the passcode in the Devpost testing instructions. The free server can take about a minute to wake up.</p>
          </div>

          <aside className="rounded-card border border-line bg-surface p-6" aria-label="Attack Lab results">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Attack Lab · same agent, with and without ALLOWANCE</p>
            {s ? (
              <>
                <dl className="mt-5 grid gap-5">
                  <div>
                    <dt className="text-sm text-muted">attacks that fooled the unguarded agent</dt>
                    <dd className="font-mono text-4xl text-block">{pct(s.attacks.unguarded)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">attacks that got past ALLOWANCE</dt>
                    <dd className="font-mono text-4xl text-allow">{pct(s.attacks.guarded)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">normal errands falsely blocked</dt>
                    <dd className="font-mono text-4xl text-text">{pct(s.benign.falseBlock)}</dd>
                  </div>
                </dl>
                <p className="mt-5 text-[12px] text-muted">
                  {s.attacks.unguarded.n} attack runs · {s.benign.falseBlock.n} benign runs · {lab.meta.model} · {lab.meta.seeds} seed(s) · {date} ·{' '}
                  <Link href="/lab" className="underline decoration-dotted hover:text-text">
                    method & holdout
                  </Link>{' '}
                  ·{' '}
                  <a href="/api/lab/latest.json" className="underline decoration-dotted hover:text-text">
                    raw JSON
                  </a>
                </p>
              </>
            ) : (
              <p className="mt-5 text-sm text-muted">The Attack Lab runs the same OpenAI agent unguarded and guarded against 60 attacks (prompt injection, subscription traps, split purchases, price bait…) and 40 normal errands. Results appear here after the first recorded run.</p>
            )}
          </aside>
        </section>

        <section aria-labelledby="how" className="border-t border-line py-12">
          <h2 id="how" className="text-xl font-semibold text-text">
            How it works
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              ['1 · You set an allowance', '$200 this month · max $60 per purchase · office supplies and electronics · no subscriptions · ask me above $40. You link PayPal once: a Vault consent, not your password.'],
              ['2 · Your agent shops', 'It turns your errand into a task contract you confirm. Every money-moving tool call then passes 12 rules: ALLOW, STEP-UP (PayPal asks you) or BLOCK, with the rule that fired.'],
              ['3 · PayPal moves the money', 'Allowed purchases are paid from your saved PayPal wallet; step-ups you approve in PayPal on your phone; anything can be undone for 10 minutes — a real refund.'],
            ].map(([t, d]) => (
              <li key={t} className="rounded-card border border-line bg-surface p-5">
                <h3 className="text-sm font-semibold text-text">{t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="primitives" className="border-t border-line py-12">
          <h2 id="primitives" className="text-xl font-semibold text-text">
            Built only from PayPal primitives
          </h2>
          <div className="mt-6 overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[640px] text-left text-[14px]">
              <thead className="bg-surface-2 text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">The human idea</th>
                  <th className="px-4 py-2.5 font-medium">The PayPal primitive ALLOWANCE uses</th>
                </tr>
              </thead>
              <tbody>
                {PRIMITIVES.map(([a, b]) => (
                  <tr key={a} className="border-t border-line">
                    <td className="px-4 py-2.5 text-text">{a}</td>
                    <td className="px-4 py-2.5 font-mono text-[12.5px] text-muted">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="why" className="border-t border-line py-12">
          <h2 id="why" className="text-xl font-semibold text-text">
            Why it can’t be talked out of a decision
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              ['The guard never reads attacker text', 'Product pages, reviews and seller notes reach the agent, never the rules. The guard sees only your confirmed task, your allowance, the trusted catalog, the ledger and PayPal’s responses.'],
              ['The agent can’t name a price or a payee', 'Its checkout tool takes a SKU, a quantity and a task line. The amount comes from the trusted catalog; the payee from the registry.'],
              ['Task-binding stops the quiet attacks', 'A $34 hub slipped in by a product page is in budget, in category and under every cap. It still isn’t in the task you confirmed, so R02 blocks it.'],
              ['The AI shops and explains. It never decides.', 'Every verdict comes from deterministic code with a full rule trace, in under a millisecond, hash-chained for audit. Language models parse, shop and explain.'],
            ].map(([t, d]) => (
              <li key={t} className="rounded-card border border-line bg-surface p-5">
                <h3 className="text-sm font-semibold text-text">{t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ul>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[12.5px] text-muted">
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
