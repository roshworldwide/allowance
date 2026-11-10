'use client';

// Tool Component for draft_policy_change: the Auditor's proposal as a card — old → new values, what the
// simulation says would change, and an "Apply in ALLOWANCE" button. Only a person can press it: no
// agent has a tool that changes an allowance (propose, never apply).
import { useState, type CSSProperties } from 'react';
import type { AgAiToolDetailParams } from 'ag-studio';
import { isPolicyProposal, type PolicyChangeUsd } from '../policy';

const LABEL: Record<keyof PolicyChangeUsd, string> = {
  perPurchaseCapUsd: 'Per-purchase cap',
  stepUpAboveUsd: 'Ask me above',
  budgetUsd: 'Budget',
  maxPerMerchantWindowUsd: 'Per-merchant hourly limit',
  allowedCategories: 'Allowed categories',
  allowRecurring: 'Subscriptions',
};

const fmt = (k: keyof PolicyChangeUsd, v: unknown) =>
  typeof v === 'number' ? `$${v.toFixed(2)}` : typeof v === 'boolean' ? (v ? 'allowed' : 'not allowed') : Array.isArray(v) ? v.join(', ') : k === 'allowRecurring' ? 'not allowed' : '—';

export function PolicyProposalCard(params: AgAiToolDetailParams) {
  const data = params.result?.success ? params.result.data : undefined;
  const [state, setState] = useState<'idle' | 'applying' | 'applied' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  if (!isPolicyProposal(data)) return <p style={s.note}>No proposal to show.</p>;
  const sim = data.simulation;
  const risky = sim.attacksLetThrough.count > 0 || sim.newFalseBlocks > 0;

  const apply = async () => {
    setState('applying');
    const r = await fetch('/api/allowance/policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data.changes) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (r.ok) {
      setState('applied');
      setMsg('Applied to your allowance. The guard uses it from the next purchase.');
    } else {
      setState('error');
      setMsg(r.status === 401 ? 'Enter the demo passcode on the Errand page first.' : (j.error ?? 'Could not apply.'));
    }
  };

  return (
    <div style={s.card}>
      <p style={s.title}>Proposed policy change</p>
      <table style={s.table}>
        <tbody>
          {(Object.keys(data.changes) as (keyof PolicyChangeUsd)[]).map((k) => {
            const cur = data.current && k in data.current ? (data.current as Record<string, unknown>)[k] : undefined;
            return (
              <tr key={k}>
                <td style={s.k}>{LABEL[k]}</td>
                <td style={s.old}>{cur === undefined ? '' : fmt(k, cur)}</td>
                <td style={s.arrow} aria-hidden>
                  →
                </td>
                <td style={s.new}>{fmt(k, data.changes[k])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul style={s.list}>
        <li>
          Replayed <b>{sim.decisions}</b> recorded decisions · <b>{sim.flipped}</b> would change
        </li>
        <li style={{ color: sim.attacksLetThrough.count ? 'var(--al-block)' : 'var(--al-muted)' }}>
          {sim.attacksLetThrough.count ? '✕' : '✓'} attacks let through without asking: {sim.attacksLetThrough.count}
        </li>
        <li style={{ color: sim.newFalseBlocks ? 'var(--al-block)' : 'var(--al-muted)' }}>
          {sim.newFalseBlocks ? '✕' : '✓'} legitimate purchases newly blocked: {sim.newFalseBlocks}
        </li>
        <li style={{ color: 'var(--al-muted)' }}>
          step-ups saved {sim.fewerStepUps} · new step-ups {sim.moreStepUps} · blocked purchases now possible {sim.falseBlocksFixed}
        </li>
      </ul>
      {data.rationale && <p style={s.why}>{data.rationale}</p>}
      <div style={s.row}>
        <button type="button" onClick={apply} disabled={state === 'applying' || state === 'applied'} style={{ ...s.btn, ...(risky ? s.btnRisky : {}) }}>
          {state === 'applied' ? '✓ Applied' : state === 'applying' ? 'Applying…' : 'Apply in ALLOWANCE'}
        </button>
        <span style={s.hint}>Only you can apply this. The Auditor can only propose.</span>
      </div>
      {msg && (
        <p role="status" style={{ ...s.note, color: state === 'error' ? 'var(--al-block)' : 'var(--al-allow)', marginTop: 6 }}>
          {msg}
        </p>
      )}
    </div>
  );
}

const s = {
  card: { border: '1px solid var(--al-accent)', borderRadius: 10, padding: 12, background: 'var(--al-ink)', color: 'var(--al-text)', fontSize: 12 },
  title: { margin: '0 0 8px', fontWeight: 700, color: 'var(--al-accent)', fontSize: 12, letterSpacing: '0.04em' },
  table: { borderCollapse: 'collapse', width: '100%', marginBottom: 8 },
  k: { padding: '2px 8px 2px 0', color: 'var(--al-muted)' },
  old: { padding: '2px 4px', textDecoration: 'line-through', color: 'var(--al-muted)', fontFamily: 'var(--font-geist-mono), monospace' },
  arrow: { padding: '2px 4px', color: 'var(--al-muted)' },
  new: { padding: '2px 4px', fontFamily: 'var(--font-geist-mono), monospace', fontWeight: 700 },
  list: { margin: '0 0 8px', paddingLeft: 16, display: 'grid', gap: 2 },
  why: { margin: '0 0 8px', color: 'var(--al-text)' },
  row: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  btn: { background: 'var(--al-accent)', color: 'var(--al-ink)', border: 0, borderRadius: 8, padding: '6px 12px', fontWeight: 700, cursor: 'pointer' },
  btnRisky: { background: 'var(--al-stepup)' },
  hint: { color: 'var(--al-muted)', fontSize: 11 },
  note: { margin: 0, color: 'var(--al-muted)', fontSize: 12 },
} satisfies Record<string, CSSProperties>;
