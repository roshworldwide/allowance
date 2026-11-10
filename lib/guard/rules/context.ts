// Everything a rule may look at, precomputed by evaluate.ts from trusted sources only.
import type { CatalogItem, ContractLine, Intent, Mandate, Merchant, RuleId, RuleResult, TaskContract } from '../types';
import { RULE_BY_ID } from './meta';

/** Ledger facts read inside the same atomic section that may reserve. */
export type LedgerFacts = {
  committedCents: number;
  reservedCents: number;
  /** Quantity already reserved or committed against the resolved contract line. */
  lineQtyUsed: number;
  purchasesLastHour: number;
  /** Reserved + committed at this merchant within mandate.velocity.windowMinutes. */
  merchantWindowCents: number;
  purchasedFromMerchantBefore: boolean;
};

export type LineResolution = 'explicit' | 'inferred' | 'none' | 'invalid';

export type RuleContext = {
  intent: Intent;
  mandate: Mandate;
  contract: TaskContract | null;
  item?: CatalogItem;
  merchant?: Merchant;
  line?: ContractLine;
  lineResolution: LineResolution;
  /** Human label for a product type, e.g. "USB-C hub". */
  label: (productType: string) => string;
  qty: number;
  /** Registry price × qty (minor units). 0 for non-purchases. */
  amountCents: number;
  facts: LedgerFacts;
  now: Date;
};

export type Rule = (ctx: RuleContext) => RuleResult;

const make =
  (outcome: RuleResult['outcome']) =>
  (id: RuleId, detail: string, userMessage?: string): RuleResult => {
    const meta = RULE_BY_ID[id];
    return { id, name: meta.name, kind: meta.kind, outcome, detail, ...(userMessage ? { userMessage } : {}) };
  };

export const pass = make('PASS');
export const fail = make('FAIL');
export const stepUp = make('STEP_UP');
export const skip = make('SKIP');

/** "$12.34" — USD formatting for messages (minor units). */
export function usd(cents: number): string {
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${whole}.${(cents % 100).toString().padStart(2, '0')}`;
}

/** "a USB-C hub" / "an LED strip" / "an adapter" — by sound, not spelling. */
export function withArticle(noun: string): string {
  if (/^(USB|UV|EU|one\b|uni|use)/i.test(noun)) return `a ${noun}`; // vowel letter, consonant sound
  if (/^(LED|HDMI|SD|SSD|HDD|MP3|FM|SUV|X-ray)\b/.test(noun)) return `an ${noun}`; // consonant letter, vowel sound
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}
