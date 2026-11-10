// The ledger: integer cents, one entry per decision that moved (or may move) money.
//
//   reserve  — inside the guard's atomic section, when the verdict is ALLOW or STEP_UP
//   commit   — when PayPal reports the capture COMPLETED
//   release  — when a reserved purchase fails, is declined, or its approval expires
//   refund   — when the person's undo refund COMPLETES (frees the budget)
//
// Implementations: MemoryLedger (here; lab, tests, policy simulation) and SqliteLedger
// (lib/store/sqlite-ledger.ts; BEGIN IMMEDIATE). Both share computeFacts() so they agree exactly.
import type { LedgerFacts } from './rules/context';

export type LedgerStatus = 'RESERVED' | 'COMMITTED' | 'RELEASED' | 'REFUNDED';

export type LedgerEntry = {
  decisionId: string;
  mandateId: string;
  contractId?: string;
  contractLineId?: string;
  merchantId?: string;
  sku?: string;
  qty: number;
  amountCents: number;
  status: LedgerStatus;
  createdMs: number;
};

export type FactsQuery = {
  mandateId: string;
  contractId?: string;
  contractLineId?: string;
  merchantId?: string;
  nowMs: number;
  windowMinutes: number;
};

export type ReserveInput = Omit<LedgerEntry, 'status'>;

/** Reads and writes performed inside one atomic section. */
export interface LedgerTx {
  facts(q: FactsQuery): LedgerFacts;
  reserve(entry: ReserveInput): void;
}

export interface Ledger {
  /** Runs fn with exclusive write access (SQLite: BEGIN IMMEDIATE … COMMIT; rolled back on throw). */
  atomically<T>(fn: (tx: LedgerTx) => T): T;
  commit(decisionId: string): void;
  release(decisionId: string): void;
  refund(decisionId: string): void;
  get(decisionId: string): LedgerEntry | undefined;
  entries(mandateId: string): LedgerEntry[];
  totals(mandateId: string): { committedCents: number; reservedCents: number };
}

export class LedgerTransitionError extends Error {
  override name = 'LedgerTransitionError';
}

const HOUR_MS = 3_600_000;

/** Facts from a mandate's entries. Only RESERVED and COMMITTED entries hold budget or count for velocity. */
export function computeFacts(all: readonly LedgerEntry[], q: FactsQuery): LedgerFacts {
  let committedCents = 0;
  let reservedCents = 0;
  let lineQtyUsed = 0;
  let purchasesLastHour = 0;
  let merchantWindowCents = 0;
  let purchasedFromMerchantBefore = false;
  const hourAgo = q.nowMs - HOUR_MS;
  const windowStart = q.nowMs - q.windowMinutes * 60_000;
  for (const e of all) {
    if (e.mandateId !== q.mandateId) continue;
    if (q.merchantId && e.merchantId === q.merchantId && (e.status === 'COMMITTED' || e.status === 'REFUNDED')) purchasedFromMerchantBefore = true;
    if (e.status !== 'RESERVED' && e.status !== 'COMMITTED') continue;
    if (e.status === 'COMMITTED') committedCents += e.amountCents;
    else reservedCents += e.amountCents;
    if (q.contractLineId && e.contractId === q.contractId && e.contractLineId === q.contractLineId) lineQtyUsed += e.qty;
    if (e.createdMs > hourAgo) purchasesLastHour += 1;
    if (q.merchantId && e.merchantId === q.merchantId && e.createdMs > windowStart) merchantWindowCents += e.amountCents;
  }
  return { committedCents, reservedCents, lineQtyUsed, purchasesLastHour, merchantWindowCents, purchasedFromMerchantBefore };
}

const TRANSITIONS: Record<'commit' | 'release' | 'refund', { from: LedgerStatus; to: LedgerStatus }> = {
  commit: { from: 'RESERVED', to: 'COMMITTED' },
  release: { from: 'RESERVED', to: 'RELEASED' },
  refund: { from: 'COMMITTED', to: 'REFUNDED' },
};

export function assertTransition(entry: LedgerEntry | undefined, op: keyof typeof TRANSITIONS, decisionId: string): LedgerStatus {
  const t = TRANSITIONS[op];
  if (!entry) throw new LedgerTransitionError(`${op}: no ledger entry for ${decisionId}`);
  if (entry.status !== t.from) throw new LedgerTransitionError(`${op}: ${decisionId} is ${entry.status}, expected ${t.from}`);
  return t.to;
}

export function validateReserve(entry: ReserveInput): void {
  if (!Number.isSafeInteger(entry.amountCents) || entry.amountCents < 0) throw new RangeError(`reserve: invalid amount ${entry.amountCents}`);
  if (!Number.isSafeInteger(entry.qty) || entry.qty < 0) throw new RangeError(`reserve: invalid qty ${entry.qty}`);
}

/** In-memory ledger. JavaScript runs one synchronous section at a time, so atomically() is trivially exclusive. */
export class MemoryLedger implements Ledger {
  private readonly rows = new Map<string, LedgerEntry>();

  atomically<T>(fn: (tx: LedgerTx) => T): T {
    const staged: LedgerEntry[] = [];
    const tx: LedgerTx = {
      facts: (q) => computeFacts([...this.rows.values(), ...staged], q),
      reserve: (entry) => {
        validateReserve(entry);
        if (this.rows.has(entry.decisionId) || staged.some((s) => s.decisionId === entry.decisionId)) {
          throw new LedgerTransitionError(`reserve: ${entry.decisionId} already has an entry`);
        }
        staged.push({ ...entry, status: 'RESERVED' });
      },
    };
    const result = fn(tx); // throws → staged rows are discarded (rollback)
    for (const row of staged) this.rows.set(row.decisionId, row);
    return result;
  }

  private move(decisionId: string, op: 'commit' | 'release' | 'refund') {
    const entry = this.rows.get(decisionId);
    const to = assertTransition(entry, op, decisionId);
    this.rows.set(decisionId, { ...entry!, status: to });
  }

  commit(decisionId: string) {
    this.move(decisionId, 'commit');
  }
  release(decisionId: string) {
    this.move(decisionId, 'release');
  }
  refund(decisionId: string) {
    this.move(decisionId, 'refund');
  }
  get(decisionId: string) {
    return this.rows.get(decisionId);
  }
  entries(mandateId: string) {
    return [...this.rows.values()].filter((e) => e.mandateId === mandateId);
  }
  totals(mandateId: string) {
    const f = computeFacts(this.entries(mandateId), { mandateId, nowMs: Date.now(), windowMinutes: 1 });
    return { committedCents: f.committedCents, reservedCents: f.reservedCents };
  }
  /** Seed past activity (policy simulation replays history into a fresh ledger). */
  load(entries: LedgerEntry[]) {
    for (const e of entries) this.rows.set(e.decisionId, { ...e });
  }
}
