'use client';

// Tool Component for explain_verdict: the body that opens under the step in Studio's chat panel.
// Twelve lamps R01..R12 coloured by outcome, each with its rule id and outcome as text (colour is
// never the only signal). Declared on the `aiToolDisplay` Studio property (see ../agents.ts).
// Docs: https://www.ag-grid.com/studio/archive/3.1.0/react/ai-tool-components/

import type { CSSProperties } from 'react';
import type { AgAiToolDetailParams } from 'ag-studio';
import { isExplainVerdictData } from '../trace';
import type { RuleOutcome, VerdictKind } from '../types';

const OUTCOME: Record<RuleOutcome, { color: string; text: string }> = {
  PASS: { color: 'var(--al-allow)', text: 'pass' },
  FAIL: { color: 'var(--al-block)', text: 'FAIL' },
  STEP_UP: { color: 'var(--al-stepup)', text: 'ask' },
  SKIP: { color: 'transparent', text: 'skip' },
};
const VERDICT: Record<VerdictKind, string> = { ALLOW: 'var(--al-allow)', STEP_UP: 'var(--al-stepup)', BLOCK: 'var(--al-block)' };

// Typed with the default params: the panel hands every detail the same shape, and results replayed
// from history are untyped, so the data is checked at runtime instead.
export function RuleLampStrip(params: AgAiToolDetailParams) {
  const data = params.result?.success ? params.result.data : undefined;
  if (!isExplainVerdictData(data)) return <p style={s.note}>No rule trace to show.</p>;

  return (
    <div style={s.card}>
      <p style={s.head}>
        <span style={{ ...s.pill, color: VERDICT[data.verdict], borderColor: VERDICT[data.verdict] }}>{data.verdict}</span>
        <span>
          {data.itemName || data.toolName} · {data.merchantName || '-'} · ${data.amountUsd.toFixed(2)}
        </span>
      </p>
      <ol style={s.lamps} aria-label={`Rule trace for ${data.decisionId}`}>
        {data.rules.map((r) => {
          const o = OUTCOME[r.outcome];
          const first = r.ruleId === data.firstBlock;
          return (
            <li key={r.ruleId} title={`${r.ruleId} ${r.ruleName}: ${r.outcome} - ${r.detail}`} style={{ ...s.lamp, ...(first ? s.first : {}) }}>
              <span aria-hidden style={{ ...s.dot, background: o.color, boxShadow: r.outcome === 'SKIP' ? 'inset 0 0 0 1.5px var(--al-muted)' : `0 0 6px ${o.color}` }} />
              <span style={s.id}>{r.ruleId}</span>
              <span style={{ ...s.outcome, color: r.outcome === 'SKIP' ? 'var(--al-muted)' : o.color }}>{o.text}</span>
            </li>
          );
        })}
      </ol>
      <p style={s.summary}>{data.summary}</p>
    </div>
  );
}

const s = {
  card: { border: '1px solid var(--al-line)', borderRadius: 10, padding: 10, background: 'var(--al-ink)', color: 'var(--al-text)', fontSize: 12 },
  head: { display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 8px', flexWrap: 'wrap' },
  pill: { border: '1px solid', borderRadius: 999, padding: '0 8px', fontWeight: 700, fontSize: 11 },
  lamps: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6 },
  lamp: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 0', borderRadius: 6 },
  first: { outline: '1.5px solid var(--al-block)' },
  dot: { width: 12, height: 12, borderRadius: 999 },
  id: { fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11 },
  outcome: { fontSize: 10, fontWeight: 600 },
  summary: { margin: '8px 0 0', color: 'var(--al-muted)' },
  note: { margin: 0, color: 'var(--al-muted)', fontSize: 12 },
} satisfies Record<string, CSSProperties>;
