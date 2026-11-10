// The guard. Deterministic: same inputs → same verdict. No LLM, no network, no attacker-writable input.
//
//   verdict = BLOCK   if any blocking rule fails
//           = STEP_UP if any step-up rule triggers
//           = ALLOW   otherwise
//
// All twelve rules run for every call (full trace). The ledger facts are read and the reservation is
// written inside one atomic section, so concurrent tool calls cannot overspend the budget.
import { resolveLine } from './contract';
import type { Ledger } from './ledger';
import { ALL_RULES } from './rules';
import { usd, type RuleContext } from './rules/context';
import { RULE_BY_ID } from './rules/meta';
import { Intent, Mandate, TaskContract, type CatalogRegistry, type RuleId, type RuleResult, type Verdict, type VerdictKind } from './types';

export type GuardDeps = {
  catalog: CatalogRegistry;
  ledger: Ledger;
  now?: () => Date;
  newDecisionId?: () => string;
};

export type EvaluateInput = {
  mandate: Mandate;
  contract: TaskContract | null;
  intent: Intent;
  decisionId?: string;
};

export type Guard = {
  /** Evaluate and, unless BLOCK, reserve the amount. */
  evaluate(input: EvaluateInput): Verdict;
  /** Evaluate without reserving (what-if analysis; never moves money). */
  dryRun(input: EvaluateInput): Verdict;
};

const defaultLabel = (key: string) => key.replace(/-/g, ' ');

export function createGuard(deps: GuardDeps): Guard {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newDecisionId ?? (() => `dec_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`);
  const label = (key: string) => deps.catalog.label?.(key) ?? defaultLabel(key);

  function run(input: EvaluateInput, reserve: boolean): Verdict {
    const started = performance.now();
    // Boundary validation: anything malformed is rejected before any rule runs.
    const mandate = Mandate.parse(input.mandate);
    const contract = input.contract === null ? null : TaskContract.parse(input.contract);
    const intent = Intent.parse(input.intent);
    const decisionId = input.decisionId ?? newId();
    const at = now();

    const isPurchase = intent.kind === 'PURCHASE';
    const item = isPurchase && intent.sku ? deps.catalog.item(intent.sku) : undefined;
    const merchant = item ? deps.catalog.merchant(item.merchantId) : undefined;
    const qty = isPurchase ? (intent.qty ?? 1) : 0;
    const registryAmount = item && Number.isSafeInteger(item.priceMinor * qty) ? item.priceMinor * qty : 0;
    // Non-purchases carry the amount the agent tried to move, for display only (never reserved).
    const amountCents = isPurchase ? registryAmount : (intent.overrides.amountCents ?? 0);
    const { line, resolution } = resolveLine(contract, intent, item);

    return deps.ledger.atomically((tx) => {
      const facts = tx.facts({
        mandateId: mandate.id,
        contractId: contract?.id,
        contractLineId: line?.id,
        merchantId: item?.merchantId,
        nowMs: at.getTime(),
        windowMinutes: mandate.velocity.windowMinutes,
      });
      const ctx: RuleContext = { intent, mandate, contract, item, merchant, line, lineResolution: resolution, label, qty, amountCents, facts, now: at };
      const rules = ALL_RULES.map((rule) => rule(ctx));
      const { verdict, firstBlock, stepUpReasons } = aggregate(rules);

      const shouldReserve = reserve && verdict !== 'BLOCK' && isPurchase && registryAmount > 0;
      if (shouldReserve) {
        tx.reserve({
          decisionId,
          mandateId: mandate.id,
          contractId: contract?.id,
          contractLineId: line?.id,
          merchantId: item?.merchantId,
          sku: item?.sku,
          qty,
          amountCents: registryAmount,
          createdMs: at.getTime(),
        });
      }

      const binding = item ? { sku: item.sku, name: item.name, merchantId: item.merchantId, unitCents: item.priceMinor, qty, contractLineId: line?.id } : undefined;
      return {
        decisionId,
        verdict,
        amountCents,
        rules,
        firstBlock,
        stepUpReasons,
        binding,
        summary: summarize(verdict, rules, binding, amountCents, firstBlock),
        reserved: shouldReserve,
        at: at.toISOString(),
        latencyUs: Math.round((performance.now() - started) * 1000),
      };
    });
  }

  return {
    evaluate: (input) => run(input, true),
    dryRun: (input) => run(input, false),
  };
}

export function aggregate(rules: RuleResult[]): { verdict: VerdictKind; firstBlock?: RuleId; stepUpReasons: RuleId[] } {
  const firstBlock = rules.find((r) => r.kind === 'block' && r.outcome === 'FAIL')?.id;
  const stepUpReasons = rules.filter((r) => r.outcome === 'STEP_UP').map((r) => r.id);
  const verdict: VerdictKind = firstBlock ? 'BLOCK' : stepUpReasons.length ? 'STEP_UP' : 'ALLOW';
  return { verdict, firstBlock, stepUpReasons };
}

/** One deterministic sentence from the trace (the AI explanation, if any, is separate and labelled). */
export function summarize(verdict: VerdictKind, rules: RuleResult[], binding: Verdict['binding'], amountCents: number, firstBlock?: RuleId): string {
  if (verdict === 'BLOCK' && firstBlock) {
    const r = rules.find((x) => x.id === firstBlock)!;
    return `Blocked by ${r.id} ${RULE_BY_ID[r.id].name}: ${r.userMessage ?? r.detail}`;
  }
  const what = binding ? `${binding.qty} × ${binding.name}, ${usd(amountCents)}` : usd(amountCents);
  if (verdict === 'STEP_UP') {
    const why = rules.filter((r) => r.outcome === 'STEP_UP').map((r) => r.userMessage ?? r.detail);
    return `Needs your approval (${what}): ${why.join(' ')}`;
  }
  return `Allowed: ${what}.`;
}
