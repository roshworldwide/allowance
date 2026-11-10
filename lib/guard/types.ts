// The guard's vocabulary. Every input is zod-validated at the boundary; inside, rules are pure.
//
// What the guard reads (and nothing else): the confirmed task contract, the mandate, the trusted
// catalog registry, the ledger, and PayPal responses. Product pages, reviews and seller messages are
// visible to the agent, never to the rules.
import { z } from 'zod';

export const Cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const Id = z.string().min(1).max(128);
const IsoDate = z.string().datetime({ offset: true });

// ---------------------------------------------------------------------------------------------
// Mandate: the allowance a person gives their agent.
// ---------------------------------------------------------------------------------------------

export const MandateStatus = z.enum(['PENDING_LINK', 'ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED']);
export type MandateStatus = z.infer<typeof MandateStatus>;

export const Velocity = z.object({
  maxPerHour: z.number().int().min(1).max(1000),
  maxPerMerchantWindowCents: Cents,
  windowMinutes: z.number().int().min(1).max(7 * 24 * 60),
});
export type Velocity = z.infer<typeof Velocity>;

export const Mandate = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  status: MandateStatus,
  currency: z.literal('USD'),
  budgetCents: Cents,
  periodStart: IsoDate,
  periodEnd: IsoDate,
  perPurchaseCapCents: Cents,
  stepUpAboveCents: Cents,
  stepUpOnNewMerchant: z.boolean(),
  allowedCategories: z.array(z.string().min(1)).min(1),
  allowedMerchants: z.union([z.array(z.string().min(1)).min(1), z.literal('ANY_IN_CATEGORY')]),
  allowRecurring: z.boolean(),
  velocity: Velocity,
  priceDriftPct: z.number().int().min(0).max(1000),
  undoWindowSec: z.number().int().min(0).max(24 * 3600),
  killSwitch: z.boolean(),
  /** Whether a saved PayPal wallet backs this mandate. The token itself never enters the guard. */
  vaultLinked: z.boolean(),
});
export type Mandate = z.infer<typeof Mandate>;

// ---------------------------------------------------------------------------------------------
// Task contract: what the human confirmed this errand is for.
// ---------------------------------------------------------------------------------------------

export const ContractLine = z.object({
  id: Id,
  category: z.string().min(1),
  /** From the trusted registry's controlled vocabulary, e.g. "usb-c-cable". */
  productType: z.string().min(1),
  description: z.string().min(1).max(140),
  maxQty: z.number().int().min(1).max(100),
  maxUnitCents: Cents,
});
export type ContractLine = z.infer<typeof ContractLine>;

export const TaskContract = z.object({
  id: Id,
  mandateId: Id,
  confirmedAt: IsoDate.nullable(),
  lines: z.array(ContractLine).min(1).max(10),
});
export type TaskContract = z.infer<typeof TaskContract>;

// ---------------------------------------------------------------------------------------------
// Trusted catalog registry (merchant-attested data in production; simulated merchants here).
// ---------------------------------------------------------------------------------------------

export const Merchant = z.object({
  id: Id,
  name: z.string().min(1),
  categories: z.array(z.string().min(1)).min(1),
  riskFlags: z.array(z.string()).default([]),
});
export type Merchant = z.infer<typeof Merchant>;

export const CatalogItem = z.object({
  sku: Id,
  name: z.string().min(1),
  merchantId: Id,
  category: z.string().min(1),
  productType: z.string().min(1),
  /** The price charged at execution, in the item's currency minor units (cents for USD). */
  priceMinor: Cents,
  currency: z.string().length(3),
  /** The listing converts into a recurring charge (e.g. "$1 trial, then $39/month"). */
  trialConvertsToRecurring: z.boolean().default(false),
  recurringMinor: Cents.nullable().default(null),
  kind: z.enum(['PHYSICAL_GOODS', 'DIGITAL_GOODS']).default('PHYSICAL_GOODS'),
});
export type CatalogItem = z.infer<typeof CatalogItem>;

export interface CatalogRegistry {
  item(sku: string): CatalogItem | undefined;
  merchant(id: string): Merchant | undefined;
  /** Human label for a product type or category key ("usb-c-hub" → "USB-C hub"). */
  label?(key: string): string;
}

// ---------------------------------------------------------------------------------------------
// Intent: a money-moving tool call, normalised. Built by the wrapper from tool arguments.
// ---------------------------------------------------------------------------------------------

export const IntentKind = z.enum(['PURCHASE', 'SUBSCRIBE', 'REFUND', 'INVOICE', 'PAYOUT', 'OTHER_MONEY']);
export type IntentKind = z.infer<typeof IntentKind>;

export const Intent = z.object({
  kind: IntentKind,
  toolName: z.string().min(1),
  sku: z.string().optional(),
  qty: z.number().int().optional(),
  /** The unit price the agent believed when it chose (feeds R10 only; never charged). */
  quotedUnitCents: Cents.optional(),
  contractLineId: z.string().optional(),
  /** The call sets up something recurring (subscription, recurring invoice series). */
  recurring: z.boolean().optional(),
  /** Values the agent tried to dictate. The guard never honours them: any present → R03 blocks. */
  overrides: z
    .object({ amountCents: Cents.optional(), payee: z.string().optional(), currency: z.string().optional() })
    .default({}),
  /** SHA-256 of the canonical raw arguments, for the audit trail. */
  rawArgsHash: z.string(),
});
export type Intent = z.infer<typeof Intent>;

// ---------------------------------------------------------------------------------------------
// Rules and verdicts.
// ---------------------------------------------------------------------------------------------

export const RULE_IDS = ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R11', 'R12'] as const;
export type RuleId = (typeof RULE_IDS)[number];

export type RuleKind = 'block' | 'step_up';
export type RuleOutcome = 'PASS' | 'FAIL' | 'STEP_UP' | 'SKIP';

export type RuleResult = {
  id: RuleId;
  name: string;
  kind: RuleKind;
  outcome: RuleOutcome;
  /** Precise, machine-oriented reason (numbers included). */
  detail: string;
  /** Short plain-language reason for the person, when the rule fired. */
  userMessage?: string;
};

export type VerdictKind = 'ALLOW' | 'STEP_UP' | 'BLOCK';

export type Verdict = {
  decisionId: string;
  verdict: VerdictKind;
  /** What would be charged, computed from the registry (never from agent arguments). */
  amountCents: number;
  rules: RuleResult[];
  firstBlock?: RuleId;
  stepUpReasons: RuleId[];
  /** The registry item and contract line this decision was bound to (for execution and the UI). */
  binding?: { sku: string; name: string; merchantId: string; unitCents: number; qty: number; contractLineId?: string };
  /** Plain-language summary written deterministically from the trace. */
  summary: string;
  /** Optional AI-written sentence from the rule trace; shown labelled; never changes the verdict. */
  explanation?: string;
  reserved: boolean;
  at: string;
  latencyUs: number;
};
