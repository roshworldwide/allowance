// Row types for the AG Studio tables in the Control Room. The server's /api/studio/data returns
// exactly these shapes, so the Studio data sources (./datasources.ts) pass rows through untouched.
//
// Conventions, the same in every table:
// - Money is US dollars as a plain number (11.99) in fields named *Usd. The store keeps integer
//   cents; the server converts once (cents / 100) when it builds these rows.
// - Times are ISO-8601 UTC strings ('2026-11-10T09:12:04.000Z'). Studio reads them as datetimes.
// - Every column holds one type. "None" is '' for text and false for booleans, never null, so
//   filters and grids treat blanks the same way everywhere.
// - Enums reuse the guard's vocabulary (lib/guard/types.ts), so a rule id or outcome in Studio is
//   always one the guard can produce.

import type { MandateStatus, RuleId, RuleKind, RuleOutcome, VerdictKind } from '@/lib/guard/types';

export type { MandateStatus, RuleId, RuleKind, RuleOutcome, VerdictKind };

/** Where a decision came from: the live agent, a recorded run replayed through the guard, or the Attack Lab. */
export type DecisionSource = 'live' | 'replay' | 'lab';

/** Lifecycle of a decision after the verdict (same values as `decisions.status` in lib/store/schema.sql). */
export type DecisionStatus =
  | 'EVALUATED' // judged without moving money (replay, dry run)
  | 'EXECUTED' // paid through PayPal
  | 'PENDING_APPROVAL' // STEP_UP waiting for the person in PayPal; the amount is reserved
  | 'FAILED' // allowed, but the PayPal call failed
  | 'REFUNDED' // paid, then undone by the person
  | 'BLOCKED' // BLOCK verdict; nothing happened
  | 'DECLINED'; // STEP_UP the person said no to

/** `mandates`: one row per allowance. */
export interface MandateRow {
  id: string;
  name: string;
  status: MandateStatus;
  budgetUsd: number;
  /** Paid and not refunded. */
  committedUsd: number;
  /** Held for step-ups waiting on the person. */
  reservedUsd: number;
  /** budgetUsd − committedUsd − reservedUsd, never below 0. */
  remainingUsd: number;
  perPurchaseCapUsd: number;
  /** The ask-me line: above it, R11 sends the purchase to the person (STEP_UP). */
  stepUpAboveUsd: number;
  periodStart: string;
  periodEnd: string;
  /** Whole days until periodEnd, as of when the row was built. */
  daysLeft: number;
  /** The allowance the Allowance Ring shows: the viewer's own, else the most recently used. */
  current: boolean;
}

/** `decisions`: one row per money-moving tool call the guard judged. */
export interface DecisionRow {
  id: string;
  /** When the guard decided (ISO-8601 UTC). */
  at: string;
  mandateId: string;
  runId: string;
  /** The agent tool that was called, e.g. 'purchase_item', 'create_refund'. */
  toolName: string;
  verdict: VerdictKind;
  /** Registry price × qty for purchases; for other intents, the amount the agent tried to move (0 if none). */
  amountUsd: number;
  merchantId: string;
  merchantName: string;
  sku: string;
  itemName: string;
  qty: number;
  /** First blocking rule that failed ('' unless verdict is BLOCK). */
  firstBlock: RuleId | '';
  /** Its name, e.g. 'TASK_BINDING' ('' unless verdict is BLOCK). */
  firstBlockName: string;
  status: DecisionStatus;
  /** Set by a verified PayPal webhook or a GET reconcile. */
  paypalConfirmed: boolean;
  captureId: string;
  refundId: string;
  /** Until when the person can undo the purchase ('' when there is nothing to undo). */
  undoExpiresAt: string;
  /** Guard evaluation time, in milliseconds. */
  latencyMs: number;
  source: DecisionSource;
}

/** `rule_results`: the full trace, twelve rows per decision (every rule runs on every call). */
export interface RuleResultRow {
  decisionId: string;
  ruleId: RuleId;
  ruleName: string;
  kind: RuleKind;
  outcome: RuleOutcome;
  /** Precise, machine-oriented reason with the numbers, as the guard wrote it. */
  detail: string;
}

/** `merchants`: the simulated merchants in the trusted catalog. */
export interface MerchantRow {
  id: string;
  name: string;
  category: string;
  /** Comma-separated flags ('' when none): Studio columns hold one value, not lists. */
  riskFlags: string;
}

/** `lab_results`: Attack Lab outcomes, one row per attack family and configuration. */
export interface LabResultRow {
  /** Attack family id, e.g. 'prompt-injection'. */
  family: string;
  familyName: string;
  config: 'unguarded' | 'guarded';
  /** Distinct scenarios in the family. */
  scenarios: number;
  /** Total agent runs across those scenarios. */
  runs: number;
  /** Runs in which the attack moved money. */
  successes: number;
  /** Attack success rate, successes / runs (0..1). */
  asr: number;
  /** True for held-out scenarios the guard was not tuned on. */
  holdout: boolean;
}

/** `paypal_transactions`: PayPal's own record from Transaction Search (can lag up to ~3 hours). */
export interface PayPalTransactionRow {
  id: string;
  at: string;
  /** PayPal T-code, e.g. 'T0006'. */
  eventCode: string;
  eventName: string;
  status: string;
  /** Signed: refunds are negative. */
  amountUsd: number;
  currency: string;
  /** invoice_id on the PayPal order: ALLOWANCE sets it to the decision id. */
  invoiceId: string;
  /** The ALLOWANCE decision this transaction belongs to ('' when not matched). */
  decisionId: string;
  matched: boolean;
}

/** Everything the Control Room shows: the props the page passes in, and the body of /api/studio/data. */
export interface ControlRoomData {
  /** When these rows were built (ISO-8601 UTC); "today" for the dashboard and the agents. */
  asOf: string;
  mandates: MandateRow[];
  decisions: DecisionRow[];
  rule_results: RuleResultRow[];
  merchants: MerchantRow[];
  lab_results: LabResultRow[];
  paypal_transactions: PayPalTransactionRow[];
}
