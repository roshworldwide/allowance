// SQLite ledger. atomically() runs inside BEGIN IMMEDIATE, so the guard's read-facts → decide →
// reserve sequence holds the database write lock: concurrent evaluations (other requests, other
// processes on the same file) serialise and can never reserve past the budget.
import { assertTransition, computeFacts, LedgerTransitionError, validateReserve, type Ledger, type LedgerEntry, type LedgerTx } from '@/lib/guard/ledger';
import type { Db } from './db';

type Row = {
  decision_id: string;
  mandate_id: string;
  contract_id: string | null;
  contract_line_id: string | null;
  merchant_id: string | null;
  sku: string | null;
  qty: number;
  amount_cents: number;
  status: LedgerEntry['status'];
  created_ms: number;
};

const toEntry = (r: Row): LedgerEntry => ({
  decisionId: r.decision_id,
  mandateId: r.mandate_id,
  contractId: r.contract_id ?? undefined,
  contractLineId: r.contract_line_id ?? undefined,
  merchantId: r.merchant_id ?? undefined,
  sku: r.sku ?? undefined,
  qty: r.qty,
  amountCents: r.amount_cents,
  status: r.status,
  createdMs: r.created_ms,
});

export class SqliteLedger implements Ledger {
  private readonly byMandate;
  private readonly byDecision;
  private readonly insert;
  private readonly setStatus;

  constructor(private readonly db: Db) {
    this.byMandate = db.prepare<[string], Row>('SELECT * FROM ledger_entries WHERE mandate_id = ?');
    this.byDecision = db.prepare<[string], Row>('SELECT * FROM ledger_entries WHERE decision_id = ?');
    this.insert = db.prepare(
      `INSERT INTO ledger_entries (decision_id, mandate_id, contract_id, contract_line_id, merchant_id, sku, qty, amount_cents, status, created_at, created_ms, updated_at)
       VALUES (@decisionId, @mandateId, @contractId, @contractLineId, @merchantId, @sku, @qty, @amountCents, 'RESERVED', @createdAt, @createdMs, @createdAt)`,
    );
    this.setStatus = db.prepare('UPDATE ledger_entries SET status = ?, updated_at = ? WHERE decision_id = ? AND status = ?');
  }

  atomically<T>(fn: (tx: LedgerTx) => T): T {
    const tx: LedgerTx = {
      facts: (q) => computeFacts(this.byMandate.all(q.mandateId).map(toEntry), q),
      reserve: (entry) => {
        validateReserve(entry);
        try {
          this.insert.run({
            decisionId: entry.decisionId,
            mandateId: entry.mandateId,
            contractId: entry.contractId ?? null,
            contractLineId: entry.contractLineId ?? null,
            merchantId: entry.merchantId ?? null,
            sku: entry.sku ?? null,
            qty: entry.qty,
            amountCents: entry.amountCents,
            createdAt: new Date(entry.createdMs).toISOString(),
            createdMs: entry.createdMs,
          });
        } catch (e) {
          if (String((e as Error).message).includes('UNIQUE')) throw new LedgerTransitionError(`reserve: ${entry.decisionId} already has an entry`);
          throw e;
        }
      },
    };
    return this.db.transaction(() => fn(tx)).immediate();
  }

  private move(decisionId: string, op: 'commit' | 'release' | 'refund') {
    this.db
      .transaction(() => {
        const row = this.byDecision.get(decisionId);
        const entry = row ? toEntry(row) : undefined;
        const to = assertTransition(entry, op, decisionId);
        this.setStatus.run(to, new Date().toISOString(), decisionId, entry!.status);
      })
      .immediate();
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
    const row = this.byDecision.get(decisionId);
    return row ? toEntry(row) : undefined;
  }
  entries(mandateId: string) {
    return this.byMandate.all(mandateId).map(toEntry);
  }
  totals(mandateId: string) {
    const f = computeFacts(this.entries(mandateId), { mandateId, nowMs: Date.now(), windowMinutes: 1 });
    return { committedCents: f.committedCents, reservedCents: f.reservedCents };
  }
}
