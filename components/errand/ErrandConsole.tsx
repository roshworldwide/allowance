'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AllowanceCard, BudgetBar, type PublicAllowance } from '@/components/allowance/AllowanceCard';
import { FirewallLane } from '@/components/lane/FirewallLane';
import { Button, usd } from '@/components/ui';
import { VerdictCard } from '@/components/verdict/VerdictCard';
import { readSse } from '@/lib/client/sse';
import { errandReducer, initialErrand, type Step } from './state';

export const DEMO_TASK = 'Get me two USB-C cables under $15 each and a desk lamp under $50.';

type ContractLine = { id: string; category: string; productType: string; description: string; maxQty: number; maxUnitCents: number };
type ContractResp = { contract: { id: string; confirmedAt: string | null; lines: ContractLine[] }; parser: 'ai' | 'keywords'; unmapped: string[]; warnings: string[] };

const post = (url: string, body?: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

export type ErrandInitial = { gate: 'passcode' | 'ready'; owner: boolean; allowance: PublicAllowance | null };

export function ErrandConsole({ initial, initialNotice = null }: { initial: ErrandInitial; initialNotice?: string | null }) {
  const [state, dispatch] = useReducer(errandReducer, initialErrand);
  const [allowance, setAllowance] = useState<PublicAllowance | null>(initial.allowance);
  const [owner, setOwner] = useState(initial.owner);
  const [gate, setGate] = useState<'passcode' | 'ready'>(initial.gate);
  const [task, setTask] = useState(DEMO_TASK);
  const [plan, setPlan] = useState<ContractResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/allowance', { cache: 'no-store' });
    if (r.status === 401) return setGate('passcode');
    const j = (await r.json()) as { allowance: PublicAllowance | null; owner: boolean };
    setAllowance(j.allowance);
    setOwner(j.owner);
    setGate('ready');
  }, []);
  const refreshSoon = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void refresh(), 250);
  }, [refresh]);

  // Live decisions, payments, approvals and refunds for this allowance.
  useEffect(() => {
    if (gate !== 'ready' || !allowance?.id) return;
    const es = new EventSource('/api/events');
    for (const t of ['decision', 'purchase', 'approval', 'refund', 'explanation', 'mandate'] as const) {
      es.addEventListener(t, (ev) => {
        const e = JSON.parse((ev as MessageEvent<string>).data) as { data: unknown; at: string };
        dispatch({ source: 'bus', type: t, data: e.data, at: Date.parse(e.at) });
        if (t !== 'explanation') refreshSoon();
      });
    }
    return () => es.close();
  }, [gate, allowance?.id, refreshSoon]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const must = async (r: Response) => {
    if (r.ok) return r.json();
    const j = (await r.json().catch(() => ({}))) as { error?: string; needsPasscode?: boolean };
    if (j.needsPasscode) setGate('passcode');
    throw new Error(j.error ?? `Request failed (${r.status})`);
  };

  const create = () => act(async () => {
    await must(await post('/api/allowance', {}));
    setPlan(null);
    dispatch({ source: 'local', type: 'reset', data: null });
    await refresh();
  });
  const link = () => act(async () => {
    const j = (await must(await post('/api/allowance/link'))) as { approveUrl: string };
    window.location.href = j.approveUrl;
  });
  const revoke = () => act(async () => {
    await must(await post('/api/allowance/revoke'));
    await refresh();
  });
  const makePlan = () => act(async () => setPlan((await must(await post('/api/contract', { task }))) as ContractResp));
  const confirm = () => act(async () => {
    if (!plan) return;
    const j = (await must(await post(`/api/contract/${plan.contract.id}/confirm`))) as { contract: ContractResp['contract'] };
    setPlan({ ...plan, contract: j.contract });
  });
  const send = () => act(async () => {
    if (!plan?.contract.confirmedAt) return;
    dispatch({ source: 'local', type: 'reset', data: null });
    const res = await post('/api/agent/run', { contractId: plan.contract.id });
    if (!res.ok) await must(res);
    await readSse(res, (event, data) => {
      if (event === 'verdict' || event === 'model' || event === 'tool_result') return; // decisions arrive on the event bus
      dispatch({ source: 'run', type: event, data });
    });
    await refresh();
  });
  const undo = async (id: string) => {
    const r = await post(`/api/undo/${id}`);
    if (!r.ok) setNotice(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Undo failed');
  };
  const decline = async (approvalId: string) => void (await post(`/api/approvals/${approvalId}`, { action: 'decline' }));
  const approveInApp = async (approvalId: string) => void (await post(`/api/approvals/${approvalId}`, { action: 'approve_in_app' }));

  if (gate === 'passcode') return <PasscodeGate onOk={() => void refresh()} />;

  const running = state.status === 'running';
  const confirmed = Boolean(plan?.contract.confirmedAt);
  const cards = [...state.order].reverse().map((id) => state.cards[id]!).filter((c) => c?.decision);

  return (
    <>
      <main className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className="space-y-4" aria-label="Allowance and task">
          <AllowanceCard allowance={allowance} owner={owner} busy={busy} onCreate={create} onLink={link} onRevoke={revoke} />
          {allowance?.status === 'ACTIVE' && (
            <section className="rounded-card border border-line bg-surface p-4">
              <label htmlFor="task" className="text-sm font-semibold text-text">
                Errand
              </label>
              <textarea id="task" value={task} onChange={(e) => setTask(e.target.value)} rows={3} maxLength={400} disabled={running || confirmed} className="mt-2 w-full resize-none rounded-xl border border-line bg-ink px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent/60 focus:outline-none disabled:opacity-70" />
              {!plan && (
                <Button className="mt-2 w-full" onClick={makePlan} disabled={busy || task.trim().length < 5}>
                  Turn into a task contract
                </Button>
              )}
              {plan && <ContractCard plan={plan} />}
              {plan && !confirmed && (
                <div className="mt-3 flex gap-2">
                  <Button className="flex-1" onClick={confirm} disabled={busy}>
                    Confirm
                  </Button>
                  <Button tone="ghost" onClick={() => setPlan(null)} disabled={busy}>
                    Edit
                  </Button>
                </div>
              )}
              {confirmed && (
                <Button className="mt-3 w-full" onClick={send} disabled={busy || running || state.status === 'done'}>
                  {running ? 'Agent is shopping…' : state.status === 'done' ? 'Errand finished' : 'Send the agent'}
                </Button>
              )}
              {confirmed && state.status === 'done' && (
                <Button tone="ghost" className="mt-1 w-full" onClick={() => { setPlan(null); dispatch({ source: 'local', type: 'reset', data: null }); }}>
                  New errand
                </Button>
              )}
            </section>
          )}
          {notice && <p role="status" className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] text-text">{notice}</p>}
          <Transcript steps={state.steps} status={state.status} error={state.error} />
        </aside>

        <section className="min-w-0 space-y-3" aria-label="Firewall">
          <FirewallLane cards={state.cards} order={state.order} model={state.model} />
          <Legend />
        </section>

        <aside className="space-y-3" aria-label="Verdicts">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Verdicts {cards.length ? `· ${cards.length}` : ''}</h2>
          {cards.length === 0 && <p className="rounded-card border border-dashed border-line p-4 text-[13px] text-muted">Every money-moving tool call the agent makes lands here with its verdict and the rule that decided it.</p>}
          {cards.map((c) => (
            <VerdictCard key={c.decision.decisionId} card={c} onUndo={undo} onDecline={decline} onApproveInApp={approveInApp} />
          ))}
        </aside>
      </main>
      <BudgetBar allowance={allowance} />
    </>
  );
}

function ContractCard({ plan }: { plan: ContractResp }) {
  return (
    <div className="mt-3 rounded-xl border border-accent/40 bg-ink/60 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">Task contract</span>
        <span className="font-mono text-[10px] text-muted">{plan.contract.confirmedAt ? '✓ confirmed · locked' : plan.parser === 'ai' ? 'parsed by AI · check it' : 'parsed without AI (fallback)'}</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {plan.contract.lines.map((l) => (
          <li key={l.id} className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-text">
              <span className="font-mono text-[11px] text-muted">{l.id}</span> {l.description}
            </span>
            <span className="whitespace-nowrap font-mono text-[12px] text-muted">
              ≤ {l.maxQty} × {usd(l.maxUnitCents)}
            </span>
          </li>
        ))}
      </ul>
      {plan.warnings.map((w) => (
        <p key={w} className="mt-2 text-[12px] text-stepup">{w}</p>
      ))}
      {plan.unmapped.length > 0 && <p className="mt-2 text-[12px] text-muted">Not understood: {plan.unmapped.join(', ')}</p>}
    </div>
  );
}

function Transcript({ steps, status, error }: { steps: Step[]; status: string; error?: string }) {
  if (!steps.length && status === 'idle') return null;
  return (
    <section className="rounded-card border border-line bg-surface p-4" aria-label="Agent transcript" aria-live="polite">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Agent</h2>
      <ol className="mt-2 space-y-1.5 text-[13px]">
        {steps.map((s) => (
          <li key={s.id} className="leading-snug">
            {s.kind === 'search' && <span className="text-muted">searched <span className="text-text">“{s.query}”</span></span>}
            {s.kind === 'view' && <span className="text-muted">read the {s.what === 'page' ? 'page' : 'reviews'} of <span className="font-mono text-[12px] text-text">{s.sku}</span> <span className="font-mono text-[10px] text-muted/80">untrusted</span></span>}
            {s.kind === 'money' && <span className="text-text">→ tried to pay: <span className="font-mono text-[12px]">{s.label}</span></span>}
            {s.kind === 'say' && <p className="mt-1 rounded-lg bg-ink/60 px-2.5 py-2 text-text">{s.text}</p>}
            {s.kind === 'note' && <span className="text-muted">{s.text}</span>}
          </li>
        ))}
        {status === 'running' && <li className="animate-pulse text-muted">…</li>}
        {error && <li className="text-block">{error}</li>}
      </ol>
    </section>
  );
}

function Legend() {
  const item = (c: string, icon: string, t: string, d: string) => (
    <li className="flex items-center gap-2">
      <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-ink" style={{ background: c }} aria-hidden>
        {icon}
      </span>
      <span className="text-text">{t}</span>
      <span className="text-muted">{d}</span>
    </li>
  );
  return (
    <ul className="grid gap-1.5 rounded-card border border-line bg-surface px-4 py-3 text-[12.5px] sm:grid-cols-2">
      {item('var(--al-allow)', '✓', 'ALLOW', 'paid from the saved PayPal wallet')}
      {item('var(--al-stepup)', '!', 'STEP-UP', 'PayPal asks you first')}
      {item('var(--al-block)', '✕', 'BLOCK', 'stopped, with the rule that fired')}
      {item('var(--al-refund)', '↺', 'UNDO', 'a real PayPal refund, 10 minutes')}
    </ul>
  );
}

function PasscodeGate({ onOk }: { onOk: () => void }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <form
        className="rounded-card border border-line bg-surface p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          const r = await post('/api/auth/passcode', { passcode: code });
          setBusy(false);
          if (r.ok) onOk();
          else setErr(r.status === 429 ? 'Too many attempts — wait a minute.' : 'That passcode is not right.');
        }}
      >
        <h1 className="text-base font-semibold text-text">Run it live</h1>
        <p className="mt-1 text-[13px] text-muted">Live runs use real PayPal sandbox payments and a real model. The passcode is in the Devpost testing instructions. No passcode? Watch a recorded run instead.</p>
        <label htmlFor="pc" className="mt-4 block text-[12px] text-muted">
          Passcode
        </label>
        <input id="pc" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-ink px-3 text-sm text-text focus:border-accent/60 focus:outline-none" />
        {err && <p role="alert" className="mt-2 text-[12px] text-block">{err}</p>}
        <Button className="mt-3 w-full" disabled={busy || !code}>
          Enter
        </Button>
        <a href="/replay" className="mt-3 block text-center text-[12px] text-muted underline decoration-dotted hover:text-text">
          Replay a real sandbox run (no passcode)
        </a>
      </form>
    </main>
  );
}
