// Task contracts: the person's errand, parsed by an LLM into lines, then confirmed by the person.
// The parser can only emit product types and categories that exist in the trusted registry, and the
// agent can never change a confirmed contract.
import { z } from 'zod';
import type { CatalogItem, ContractLine, Intent, TaskContract } from './types';
import type { LineResolution } from './rules/context';

export type Vocabulary = {
  /** productType → { category, label } from the registry. */
  productTypes: Record<string, { category: string; label: string }>;
};

/** The structured-output schema the task parser must fill (an LLM output, so untrusted until confirmed). */
export function contractDraftSchema(vocab: Vocabulary) {
  const types = Object.keys(vocab.productTypes);
  if (types.length === 0) throw new Error('contractDraftSchema: empty vocabulary');
  return z.object({
    lines: z
      .array(
        z.object({
          productType: z.enum(types as [string, ...string[]]),
          description: z.string().min(1).max(140),
          maxQty: z.number().int().min(1).max(20),
          maxUnitCents: z.number().int().min(1).max(1_000_000),
        }),
      )
      .min(1)
      .max(10),
    /** Anything in the task that could not be mapped to a known product type (shown to the person). */
    unmapped: z.array(z.string().max(140)).max(10),
  });
}
export type ContractDraft = z.infer<ReturnType<typeof contractDraftSchema>>;

/** Turns a parser draft into a contract (unconfirmed). Category always comes from the registry vocabulary. */
export function contractFromDraft(input: { id: string; mandateId: string; draft: ContractDraft; vocab: Vocabulary; newLineId: (i: number) => string }): TaskContract {
  const lines: ContractLine[] = input.draft.lines.map((l, i) => {
    const entry = input.vocab.productTypes[l.productType];
    if (!entry) throw new Error(`Unknown product type ${l.productType}`);
    return {
      id: input.newLineId(i),
      category: entry.category,
      productType: l.productType,
      description: l.description,
      maxQty: l.maxQty,
      maxUnitCents: l.maxUnitCents,
    };
  });
  return { id: input.id, mandateId: input.mandateId, confirmedAt: null, lines };
}

export function confirmContract(contract: TaskContract, at: Date): TaskContract {
  if (contract.confirmedAt) return contract;
  return { ...contract, confirmedAt: at.toISOString() };
}

/**
 * Which contract line a purchase binds to. The agent's contractLineId is used when it names a line
 * whose product type matches the registry item; otherwise the single line whose product type matches
 * is inferred (trusted data only). No match → no line (R02 blocks).
 */
export function resolveLine(contract: TaskContract | null, intent: Intent, item: CatalogItem | undefined): { line?: ContractLine; resolution: LineResolution } {
  if (!contract || intent.kind !== 'PURCHASE' || !item) return { resolution: 'none' };
  const matches = (l: ContractLine) => l.productType === item.productType && l.category === item.category;
  const named = intent.contractLineId ? contract.lines.find((l) => l.id === intent.contractLineId) : undefined;
  if (named && matches(named)) return { line: named, resolution: 'explicit' };
  const candidates = contract.lines.filter(matches);
  if (candidates.length === 1) return { line: candidates[0], resolution: 'inferred' };
  if (candidates.length > 1) {
    // Several lines for the same product type: honour the agent's pick if it is one of them,
    // otherwise take the first whose price ceiling fits (avoids a false block).
    if (named && candidates.includes(named)) return { line: named, resolution: 'explicit' };
    return { line: candidates.find((l) => item.priceMinor <= l.maxUnitCents) ?? candidates[0], resolution: 'inferred' };
  }
  return { resolution: named ? 'invalid' : 'none' };
}
