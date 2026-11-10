// Browser-side helpers for the Auditor's policy tools. The simulation runs on the server
// (/api/studio/simulate, pure guard code); applying a change is a separate, human-only endpoint.

export type PolicyChangeUsd = Partial<{
  perPurchaseCapUsd: number;
  stepUpAboveUsd: number;
  budgetUsd: number;
  maxPerMerchantWindowUsd: number;
  allowedCategories: string[];
  allowRecurring: boolean;
}>;

export type SimulationSummary = {
  runs: number;
  decisions: number;
  flipped: number;
  newlyAllowedCents: number;
  newlyStepUpCents: number;
  attacksLetThrough: { count: number; cents: number };
  attacksNowNeedHuman: { count: number; cents: number };
  newFalseBlocks: number;
  falseBlocksFixed: number;
  fewerStepUps: number;
  moreStepUps: number;
  flips: { label: string; item?: string; amountCents: number; from: string; to: string; kind: string; authorised?: boolean; rule?: string }[];
};

export type PolicyProposal = {
  kind: 'policy-proposal';
  changes: PolicyChangeUsd;
  current: { perPurchaseCapUsd: number; stepUpAboveUsd: number; budgetUsd: number } | null;
  rationale: string;
  simulation: SimulationSummary;
};

export async function simulatePolicyChange(changes: PolicyChangeUsd): Promise<SimulationSummary> {
  const r = await fetch('/api/studio/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
  const j = (await r.json()) as SimulationSummary & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Simulation failed (${r.status})`);
  return j;
}

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** The text the model reads back (the card shows the same facts). */
export function describeSimulation(s: SimulationSummary): string {
  const lines = [
    `Replayed ${s.decisions} recorded agent decisions from ${s.runs} runs (live, recorded sandbox runs and the Attack Lab) with the real guard.`,
    `${s.flipped} decision(s) would change.`,
    `Attacks that would now get through without asking you: ${s.attacksLetThrough.count} (${usd(s.attacksLetThrough.cents)}).`,
    `Attacks that would now reach you for approval instead of being blocked: ${s.attacksNowNeedHuman.count} (${usd(s.attacksNowNeedHuman.cents)}).`,
    `Legitimate purchases newly blocked: ${s.newFalseBlocks}. Previously blocked legitimate purchases now possible: ${s.falseBlocksFixed}.`,
    `Step-ups saved: ${s.fewerStepUps}; new step-ups: ${s.moreStepUps}.`,
  ];
  const sample = s.flips.slice(0, 6).map((f) => `- ${f.item ?? '?'} (${usd(f.amountCents)}): ${f.from} → ${f.to}${f.rule ? ` (${f.rule})` : ''}${f.kind === 'attack' && f.authorised === false ? ' [attack]' : ''}`);
  return [...lines, ...(sample.length ? ['Examples:', ...sample] : [])].join('\n');
}

export function isPolicyProposal(x: unknown): x is PolicyProposal {
  return Boolean(x && typeof x === 'object' && (x as { kind?: unknown }).kind === 'policy-proposal');
}
