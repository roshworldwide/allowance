// Policy what-ifs: replay recorded agent intents against a proposed allowance, with the real guard.
// Read-only and deterministic. Each run is replayed twice — under the current policy and under the
// proposed one, with identical ledger assumptions (anything not blocked is taken as paid) — so every
// "flip" is caused by the policy change alone.
import { createGuard } from './evaluate';
import { MemoryLedger } from './ledger';
import type { CatalogRegistry, Intent, Mandate, TaskContract, VerdictKind } from './types';

export type HistoryDecision = { at: string; intent: Intent; /** the confirmed task authorised this purchase */ authorised?: boolean };

export type HistoryRun = {
  id: string;
  source: 'live' | 'replay' | 'lab';
  /** Lab runs know whether they were an attack; live/replay runs don't. */
  kind: 'attack' | 'benign' | 'unknown';
  label: string;
  mandate: Mandate;
  contract: TaskContract | null;
  registry: CatalogRegistry;
  decisions: HistoryDecision[];
};

export type PolicyChange = Partial<Pick<Mandate, 'perPurchaseCapCents' | 'stepUpAboveCents' | 'budgetCents' | 'allowedCategories' | 'allowRecurring' | 'priceDriftPct'>> & {
  maxPerMerchantWindowCents?: number;
};

export type Flip = {
  run: string;
  source: HistoryRun['source'];
  kind: HistoryRun['kind'];
  label: string;
  item?: string;
  amountCents: number;
  from: VerdictKind;
  to: VerdictKind;
  authorised?: boolean;
  /** The rule that blocks under the new policy (to = BLOCK) or that blocked before (from = BLOCK). */
  rule?: string;
};

export function applyChange(m: Mandate, c: PolicyChange): Mandate {
  const { maxPerMerchantWindowCents, ...rest } = c;
  return {
    ...m,
    ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
    ...(maxPerMerchantWindowCents !== undefined ? { velocity: { ...m.velocity, maxPerMerchantWindowCents } } : {}),
  };
}

function replay(run: HistoryRun, mandate: Mandate) {
  const ledger = new MemoryLedger();
  return run.decisions.map((d, i) => {
    const guard = createGuard({ catalog: run.registry, ledger, now: () => new Date(d.at) });
    const v = guard.evaluate({ mandate, contract: run.contract, intent: d.intent, decisionId: `${run.id}#${i}` });
    if (v.reserved) ledger.commit(v.decisionId);
    return v;
  });
}

export function simulatePolicy(history: HistoryRun[], change: PolicyChange) {
  const flips: Flip[] = [];
  let decisions = 0;
  for (const run of history) {
    const before = replay(run, run.mandate);
    const after = replay(run, applyChange(run.mandate, change));
    decisions += before.length;
    before.forEach((b, i) => {
      const a = after[i]!;
      if (a.verdict === b.verdict) return;
      const d = run.decisions[i]!;
      flips.push({
        run: run.id,
        source: run.source,
        kind: run.kind,
        label: run.label,
        item: a.binding?.name ?? d.intent.toolName,
        amountCents: a.amountCents,
        from: b.verdict,
        to: a.verdict,
        authorised: d.authorised,
        rule: a.verdict === 'BLOCK' ? a.firstBlock : b.firstBlock,
      });
    });
  }
  const sum = (fs: Flip[]) => fs.reduce((s, f) => s + f.amountCents, 0);
  const attackThrough = flips.filter((f) => f.kind === 'attack' && f.authorised === false && f.from === 'BLOCK' && f.to === 'ALLOW');
  const attackToHuman = flips.filter((f) => f.kind === 'attack' && f.authorised === false && f.from === 'BLOCK' && f.to === 'STEP_UP');
  const newFalseBlocks = flips.filter((f) => f.authorised === true && f.to === 'BLOCK');
  const fixedFalseBlocks = flips.filter((f) => f.authorised === true && f.from === 'BLOCK');
  const fewerStepUps = flips.filter((f) => f.from === 'STEP_UP' && f.to === 'ALLOW');
  const moreStepUps = flips.filter((f) => f.from === 'ALLOW' && f.to === 'STEP_UP');
  return {
    change,
    runs: history.length,
    decisions,
    flipped: flips.length,
    flips: flips.slice(0, 200),
    /** Previously blocked money that would now move without anyone being asked. */
    newlyAllowedCents: sum(flips.filter((f) => f.from === 'BLOCK' && f.to === 'ALLOW')),
    /** Previously blocked money that would now reach the person for approval. */
    newlyStepUpCents: sum(flips.filter((f) => f.from === 'BLOCK' && f.to === 'STEP_UP')),
    attacksLetThrough: { count: attackThrough.length, cents: sum(attackThrough) },
    attacksNowNeedHuman: { count: attackToHuman.length, cents: sum(attackToHuman) },
    newFalseBlocks: newFalseBlocks.length,
    falseBlocksFixed: fixedFalseBlocks.length,
    fewerStepUps: fewerStepUps.length,
    moreStepUps: moreStepUps.length,
  };
}
export type SimulationResult = ReturnType<typeof simulatePolicy>;
