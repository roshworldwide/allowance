// The 12 rules, in evaluation order. One source for the guard, the UI lamps and the docs.
import type { RuleId, RuleKind } from '../types';

export type RuleMeta = { id: RuleId; name: string; kind: RuleKind; summary: string };

export const RULES: readonly RuleMeta[] = [
  { id: 'R01', name: 'MANDATE_ACTIVE', kind: 'block', summary: 'The allowance is active, in its period, linked to PayPal and not killed.' },
  { id: 'R02', name: 'TASK_BINDING', kind: 'block', summary: 'The purchase matches a line of the task the person confirmed: product type, quantity, price ceiling.' },
  { id: 'R03', name: 'CATALOG_INTEGRITY', kind: 'block', summary: 'The SKU is in the trusted registry and the amount comes from it; the agent cannot set amount, payee or currency.' },
  { id: 'R04', name: 'MERCHANT_SCOPE', kind: 'block', summary: 'The merchant and category are allowed by the allowance.' },
  { id: 'R05', name: 'PER_PURCHASE_CAP', kind: 'block', summary: 'The purchase is within the per-purchase cap.' },
  { id: 'R06', name: 'BUDGET_REMAINING', kind: 'block', summary: 'An atomic budget reservation succeeds (committed + reserved + amount ≤ budget).' },
  { id: 'R07', name: 'VELOCITY_SPLIT', kind: 'block', summary: 'Hourly count and per-merchant rolling spend stay within limits (catches split purchases).' },
  { id: 'R08', name: 'NO_RECURRING', kind: 'block', summary: 'No subscriptions, plans, recurring invoices or trials that convert to recurring charges.' },
  { id: 'R09', name: 'CURRENCY_LOCK', kind: 'block', summary: 'The charge is in the allowance currency, in integer minor units.' },
  { id: 'R10', name: 'PRICE_DRIFT', kind: 'step_up', summary: 'If the price at execution is above what the agent saw by more than the drift limit, ask the person.' },
  { id: 'R11', name: 'STEP_UP_THRESHOLD', kind: 'step_up', summary: 'Above the ask-me line (or a first purchase from a new merchant, if enabled), ask the person.' },
  { id: 'R12', name: 'MONEY_OUT_SCOPE', kind: 'block', summary: 'The agent can never send money out: no refunds (undo is human-only), payouts, invoices or other transfers.' },
] as const;

export const RULE_BY_ID: Record<RuleId, RuleMeta> = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<RuleId, RuleMeta>;
