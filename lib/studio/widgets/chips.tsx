'use client';

// Small labels shared by the Control Room widgets and grid cells. Colour is never the only signal:
// every chip carries an icon character and a word, and the raw value is in its accessible name.

import type { CSSProperties } from 'react';
import { RULE_BY_ID } from '@/lib/guard/rules/meta';
import type { DecisionStatus, RuleId, RuleOutcome, VerdictKind } from '../types';

export const VERDICT_META: Record<VerdictKind, { icon: string; word: string; color: string }> = {
  ALLOW: { icon: '✓', word: 'ALLOW', color: 'var(--al-allow)' },
  STEP_UP: { icon: '!', word: 'STEP-UP', color: 'var(--al-stepup)' },
  BLOCK: { icon: '✕', word: 'BLOCK', color: 'var(--al-block)' },
};

export const STATUS_META: Record<DecisionStatus, { icon: string; word: string; color: string }> = {
  EXECUTED: { icon: '', word: 'Paid', color: 'var(--al-text)' },
  PENDING_APPROVAL: { icon: '…', word: 'Awaiting approval', color: 'var(--al-stepup)' },
  REFUNDED: { icon: '↺', word: 'Refunded', color: 'var(--al-refund)' },
  DECLINED: { icon: '', word: 'Declined', color: 'var(--al-muted)' },
  BLOCKED: { icon: '', word: 'Not charged', color: 'var(--al-muted)' },
  EVALUATED: { icon: '', word: 'Replay, no money moved', color: 'var(--al-muted)' },
  FAILED: { icon: '', word: 'Payment failed', color: 'var(--al-block)' },
};

export const OUTCOME_META: Record<RuleOutcome, { icon: string; word: string; color: string }> = {
  PASS: { icon: '✓', word: 'PASS', color: 'var(--al-allow)' },
  FAIL: { icon: '✕', word: 'FAIL', color: 'var(--al-block)' },
  STEP_UP: { icon: '!', word: 'STEP-UP', color: 'var(--al-stepup)' },
  SKIP: { icon: '–', word: 'SKIP', color: 'var(--al-muted)' },
};

export const isVerdict = (v: unknown): v is VerdictKind => typeof v === 'string' && v in VERDICT_META;
export const isStatus = (v: unknown): v is DecisionStatus => typeof v === 'string' && v in STATUS_META;
export const isOutcome = (v: unknown): v is RuleOutcome => typeof v === 'string' && v in OUTCOME_META;
export const isRuleId = (v: unknown): v is RuleId => typeof v === 'string' && v in RULE_BY_ID;

const mono = 'var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace';
const pill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 7px',
  borderRadius: 999,
  border: '1px solid',
  fontSize: 11,
  lineHeight: '18px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
};

export function VerdictChip({ verdict }: { verdict: VerdictKind }) {
  const m = VERDICT_META[verdict];
  return (
    <span style={{ ...pill, color: m.color, borderColor: m.color, background: `color-mix(in srgb, ${m.color} 14%, transparent)` }}>
      <span aria-hidden>{m.icon}</span>
      {m.word}
    </span>
  );
}

export function OutcomeChip({ outcome }: { outcome: RuleOutcome }) {
  const m = OUTCOME_META[outcome];
  return (
    <span style={{ ...pill, color: m.color, borderColor: outcome === 'SKIP' ? 'var(--al-line)' : m.color }}>
      <span aria-hidden>{m.icon}</span>
      {m.word}
    </span>
  );
}

/** "R02 TASK_BINDING": the rule that stopped a purchase. */
export function RuleChip({ ruleId, name }: { ruleId: string; name?: string }) {
  const label = name || (isRuleId(ruleId) ? RULE_BY_ID[ruleId].name : '');
  return (
    <span style={{ ...pill, fontFamily: mono, fontWeight: 500, color: 'var(--al-text)', borderColor: 'color-mix(in srgb, var(--al-block) 55%, var(--al-line))' }}>
      <span style={{ color: 'var(--al-block)', fontWeight: 700 }}>{ruleId}</span>
      {label}
    </span>
  );
}

export function StatusChip({ status }: { status: DecisionStatus }) {
  const m = STATUS_META[status];
  return (
    <span style={{ fontSize: 11, color: m.color, whiteSpace: 'nowrap' }}>
      {m.icon && <span aria-hidden>{m.icon} </span>}
      {m.word}
    </span>
  );
}

export function ConfirmedTick() {
  return (
    <span style={{ fontSize: 11, color: 'var(--al-allow)', whiteSpace: 'nowrap' }}>
      PayPal confirmed <span aria-hidden>✓</span>
    </span>
  );
}
