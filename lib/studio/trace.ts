// Reading a decision's rule trace out of the Control Room rows. Pure functions over ControlRoomData,
// shared by the Auditor's explain_verdict tool (./agents.ts) and its rule-lamp strip
// (./tool-components/RuleLampStrip.tsx). Nothing here calls a model: the explanation the model gives
// is built on these facts, and the verdict itself always comes from the guard.

import { RULES } from '@/lib/guard/rules/meta';
import type { ControlRoomData, DecisionRow, RuleId, RuleKind, RuleOutcome, RuleResultRow, VerdictKind } from './types';

export interface ExplainedRule {
  ruleId: RuleId;
  ruleName: string;
  kind: RuleKind;
  outcome: RuleOutcome;
  detail: string;
}

/** What explain_verdict returns: the model reads it, and the rule-lamp strip draws it. */
export interface ExplainVerdictData {
  decisionId: string;
  at: string;
  verdict: VerdictKind;
  amountUsd: number;
  toolName: string;
  merchantName: string;
  itemName: string;
  qty: number;
  status: string;
  source: string;
  firstBlock: RuleId | '';
  firstBlockName: string;
  /** Step-up rules that triggered (R10, R11), in order. */
  stepUpReasons: RuleId[];
  /** All twelve rules in evaluation order (R01..R12). */
  rules: ExplainedRule[];
  /** One deterministic sentence from the trace. */
  summary: string;
}

export interface TraceIndex {
  /** Newest first. */
  decisions: DecisionRow[];
  byId: Map<string, DecisionRow>;
  rulesByDecision: Map<string, RuleResultRow[]>;
}

const RULE_ORDER = new Map(RULES.map((r, i) => [r.id, i]));

export function createTraceIndex(data: Pick<ControlRoomData, 'decisions' | 'rule_results'>): TraceIndex {
  const decisions = [...data.decisions].sort((a, b) => b.at.localeCompare(a.at));
  const rulesByDecision = new Map<string, RuleResultRow[]>();
  for (const row of data.rule_results) {
    const list = rulesByDecision.get(row.decisionId) ?? [];
    list.push(row);
    rulesByDecision.set(row.decisionId, list);
  }
  return { decisions, byId: new Map(decisions.map((d) => [d.id, d])), rulesByDecision };
}

const money = (usd: number) => `$${usd.toFixed(2)}`;

export function explainDecision(index: TraceIndex, decisionId: string): ExplainVerdictData | undefined {
  const decision = index.byId.get(decisionId.trim());
  if (!decision) return undefined;
  const recorded = index.rulesByDecision.get(decision.id) ?? [];
  // Always twelve lamps: a rule missing from the trace shows as SKIP rather than disappearing.
  const rules = RULES.map((meta): ExplainedRule => {
    const row = recorded.find((r) => r.ruleId === meta.id);
    return row
      ? { ruleId: row.ruleId, ruleName: row.ruleName, kind: row.kind, outcome: row.outcome, detail: row.detail }
      : { ruleId: meta.id, ruleName: meta.name, kind: meta.kind, outcome: 'SKIP', detail: 'not in the recorded trace' };
  }).sort((a, b) => (RULE_ORDER.get(a.ruleId) ?? 0) - (RULE_ORDER.get(b.ruleId) ?? 0));

  const stepUpReasons = rules.filter((r) => r.outcome === 'STEP_UP').map((r) => r.ruleId);
  const what = decision.sku ? `${decision.qty} × ${decision.itemName}, ${money(decision.amountUsd)}` : decision.itemName || decision.toolName;
  let summary: string;
  if (decision.verdict === 'BLOCK') {
    const first = rules.find((r) => r.ruleId === decision.firstBlock);
    summary = `Blocked by ${decision.firstBlock} ${decision.firstBlockName}${first ? `: ${first.detail}` : ''}.`;
  } else if (decision.verdict === 'STEP_UP') {
    const why = rules.filter((r) => r.outcome === 'STEP_UP').map((r) => `${r.ruleId} ${r.ruleName} (${r.detail})`);
    summary = `Sent to the person for approval (${what}): ${why.join('; ')}.`;
  } else {
    summary = `Allowed: ${what}.`;
  }

  return {
    decisionId: decision.id,
    at: decision.at,
    verdict: decision.verdict,
    amountUsd: decision.amountUsd,
    toolName: decision.toolName,
    merchantName: decision.merchantName,
    itemName: decision.itemName,
    qty: decision.qty,
    status: decision.status,
    source: decision.source,
    firstBlock: decision.firstBlock,
    firstBlockName: decision.firstBlockName,
    stepUpReasons,
    rules,
    summary,
  };
}

/** A short list of recent decisions, so an agent can name one without a query round-trip. */
export function recentDecisionsDigest(index: TraceIndex, limit = 12): string {
  return index.decisions
    .slice(0, limit)
    .map((d) => {
      const rule = d.verdict === 'BLOCK' ? ` by ${d.firstBlock} ${d.firstBlockName}` : '';
      return `- ${d.id} · ${d.at} · ${d.verdict}${rule} · ${money(d.amountUsd)} · ${d.merchantName || '-'} · ${d.itemName} · ${d.status} · ${d.source}`;
    })
    .join('\n');
}

const OUTCOMES = new Set<string>(['PASS', 'FAIL', 'STEP_UP', 'SKIP']);

/** Runtime check for a tool result read back from the chat history (shapes there are untyped). */
export function isExplainVerdictData(value: unknown): value is ExplainVerdictData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ExplainVerdictData>;
  return (
    typeof v.decisionId === 'string' &&
    typeof v.verdict === 'string' &&
    Array.isArray(v.rules) &&
    v.rules.every((r) => typeof r === 'object' && r !== null && typeof r.ruleId === 'string' && OUTCOMES.has(r.outcome))
  );
}
