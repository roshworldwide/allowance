// allowance.wrap(): put the guard in front of any agent's money tools.
//
//   const tools = wrap([vaultCheckout, ...paypalToolkit.getTools()], session);
//
// Every tool is classified by name:
//   READ    → passes straight through (search, view, get_order, list_transactions, …)
//   MONEY   → normalised into an Intent and evaluated: ALLOW executes, STEP_UP asks the person, BLOCK stops
//   UNKNOWN → default-deny: treated as OTHER_MONEY (R12 blocks it)
// Accepts both Responses-API tools ({ name, parameters }) and Chat Completions tools
// ({ type: 'function', function: { … } }, e.g. @paypal/agent-toolkit's getTools()).
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { canonicalJson } from './chain';
import type { Intent, IntentKind, Verdict } from './types';

export type ToolClass = 'READ' | 'MONEY' | 'UNKNOWN';

export const ALLOWANCE_CHECKOUT = 'allowance_checkout';

const READ_ONLY = new Set([
  // ALLOWANCE read tools (their outputs are untrusted and never reach the guard)
  'search_catalog',
  'view_product',
  'view_reviews',
  // PayPal Agent Toolkit 1.11.0 read-only tools
  'get_order',
  'list_transactions',
  'get_refund',
  'get_merchant_insights',
  'list_invoices',
  'get_invoice',
  'search_invoicing',
  'list_products',
  'show_product_details',
  'list_subscription_plans',
  'show_subscription_plan_details',
  'show_subscription_details',
  'get_shipment_tracking',
  'list_disputes',
  'get_dispute',
  'get_recurring_series',
  'generate_invoice_number',
  'generate_invoice_qr_code',
]);

const MONEY: Record<string, { kind: IntentKind; recurring?: true }> = {
  // ALLOWANCE guarded tools
  [ALLOWANCE_CHECKOUT]: { kind: 'PURCHASE' },
  allowance_subscribe: { kind: 'SUBSCRIBE', recurring: true },
  // PayPal Agent Toolkit money-moving tools (see docs/DECISIONS.md, S2)
  create_order: { kind: 'OTHER_MONEY' },
  pay_order: { kind: 'OTHER_MONEY' },
  create_refund: { kind: 'REFUND' },
  accept_dispute_claim: { kind: 'REFUND' },
  record_refund_for_invoice: { kind: 'REFUND' },
  create_invoice: { kind: 'INVOICE' },
  send_invoice: { kind: 'INVOICE' },
  send_invoice_reminder: { kind: 'INVOICE' },
  record_payment_for_invoice: { kind: 'INVOICE' },
  update_invoicing: { kind: 'INVOICE' },
  create_conditional_rules_for_invoice: { kind: 'INVOICE' },
  create_recurring_series: { kind: 'INVOICE', recurring: true },
  activate_recurring_series: { kind: 'INVOICE', recurring: true },
  create_subscription: { kind: 'SUBSCRIBE', recurring: true },
  create_subscription_plan: { kind: 'SUBSCRIBE', recurring: true },
  update_subscription: { kind: 'SUBSCRIBE', recurring: true },
  update_plan: { kind: 'SUBSCRIBE', recurring: true },
};

export function classifyTool(name: string): ToolClass {
  if (READ_ONLY.has(name)) return 'READ';
  if (name in MONEY) return 'MONEY';
  return 'UNKNOWN';
}

export function argsHash(args: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(args ?? null))));
}

/** Normalises a tool call's arguments into an Intent. Only identifiers are taken from the agent. */
export function toIntent(toolName: string, rawArgs: unknown): Intent {
  const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
  const spec = MONEY[toolName] ?? { kind: 'OTHER_MONEY' as const };
  const overrides = findOverrides(args);
  const base = { kind: spec.kind, toolName, overrides, rawArgsHash: argsHash(rawArgs), ...(spec.recurring ? { recurring: true } : {}) };
  if (spec.kind === 'PURCHASE') {
    return {
      ...base,
      sku: str(args.sku),
      qty: int(args.qty) ?? 1,
      contractLineId: str(args.contractLineId),
      quotedUnitCents: int(args.quotedUnitCents),
    };
  }
  return base;
}

/** Amount / payee / currency the agent tried to dictate. Never honoured; their presence trips R03. */
function findOverrides(args: Record<string, unknown>): Intent['overrides'] {
  const o: Intent['overrides'] = {};
  const cents = int(args.amountCents) ?? dollarsToCents(args.amount) ?? dollarsToCents(args.price) ?? sumItemCosts(args.items);
  if (cents !== undefined && cents >= 0) o.amountCents = cents;
  const payee = str(args.payee) ?? str(args.payeeEmail) ?? str(args.payee_email) ?? str(args.merchant_email);
  if (payee) o.payee = payee;
  // Even a currency that restates USD is an agent-set value: recorded (R03), and checked (R09).
  const currency = str(args.currency) ?? str(args.currencyCode) ?? str(args.currency_code);
  if (currency) o.currency = currency;
  return o;
}

/** PayPal-style dollar amounts: "12.34", 12.34, or { value: "12.34" } → 1234. Display only. */
function dollarsToCents(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v * 100);
  if (typeof v === 'string' && /^\d+(\.\d{1,2})?$/.test(v.trim())) return Math.round(Number(v) * 100);
  if (v && typeof v === 'object' && 'value' in v) return dollarsToCents((v as { value: unknown }).value);
  return undefined;
}

function sumItemCosts(items: unknown): number | undefined {
  if (!Array.isArray(items)) return undefined;
  let total = 0;
  let found = false;
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const rec = it as Record<string, unknown>;
    const unit = dollarsToCents(rec.itemCost) ?? dollarsToCents(rec.unit_amount) ?? dollarsToCents(rec.price);
    if (unit === undefined) continue;
    found = true;
    total += unit * (int(rec.quantity) ?? 1);
  }
  return found ? total : undefined;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : undefined);

// ---------------------------------------------------------------------------------------------
// The wrapper itself
// ---------------------------------------------------------------------------------------------

export type ResponsesTool = { type: 'function'; name: string; description: string; parameters: Record<string, unknown>; strict?: boolean };
type ChatCompletionsTool = { type: 'function'; function: { name: string; description?: string; parameters?: Record<string, unknown>; strict?: boolean } };
export type AnyTool = ResponsesTool | ChatCompletionsTool | { name: string; description?: string; parameters?: Record<string, unknown>; strict?: boolean };

export type ToolCall = { name: string; args: unknown; callId?: string };

export type ToolOutcome =
  | { kind: 'passthrough'; tool: string; output: unknown }
  | { kind: 'verdict'; tool: string; intent: Intent; verdict: Verdict; execution?: unknown };

export type WrapSession = {
  /** The guard, bound to this run's mandate, contract and ledger. */
  evaluate(intent: Intent): Verdict;
  /** ALLOW → move the money; STEP_UP → start the person's approval. Not called on BLOCK. */
  execute(verdict: Verdict, intent: Intent, call: ToolCall): Promise<unknown>;
  /** Read-only tools. */
  passThrough(call: ToolCall): Promise<unknown>;
  onOutcome?(outcome: ToolOutcome): void;
};

export function normaliseTool(tool: AnyTool): ResponsesTool {
  const fn = 'function' in tool ? tool.function : tool;
  return {
    type: 'function',
    name: fn.name,
    description: fn.description ?? '',
    parameters: fn.parameters ?? { type: 'object', properties: {} },
    ...(fn.strict !== undefined ? { strict: fn.strict } : {}),
  };
}

export function wrap(tools: AnyTool[], session: WrapSession) {
  const definitions = tools.map(normaliseTool);
  const names = new Set(definitions.map((d) => d.name));
  return {
    definitions,
    classify: classifyTool,
    async invoke(call: ToolCall): Promise<ToolOutcome> {
      if (!names.has(call.name)) {
        // A tool the agent invented: evaluate as unknown money movement (blocked), never execute.
        const intent = toIntent(call.name, call.args);
        const outcome: ToolOutcome = { kind: 'verdict', tool: call.name, intent, verdict: session.evaluate(intent) };
        session.onOutcome?.(outcome);
        return outcome;
      }
      if (classifyTool(call.name) === 'READ') {
        const outcome: ToolOutcome = { kind: 'passthrough', tool: call.name, output: await session.passThrough(call) };
        session.onOutcome?.(outcome);
        return outcome;
      }
      const intent = toIntent(call.name, call.args);
      const verdict = session.evaluate(intent);
      const execution = verdict.verdict === 'BLOCK' ? undefined : await session.execute(verdict, intent, call);
      const outcome: ToolOutcome = { kind: 'verdict', tool: call.name, intent, verdict, execution };
      session.onOutcome?.(outcome);
      return outcome;
    },
  };
}
