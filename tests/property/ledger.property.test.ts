import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MemoryLedger, type Ledger } from '@/lib/guard';
import { openDb } from '@/lib/store/db';
import { SqliteLedger } from '@/lib/store/sqlite-ledger';
import { contract, guard, mandate, purchase } from '../fixtures/guard';

const run = promisify(execFile);
const T0 = Date.parse('2026-11-11T10:00:00Z');

type Op = { op: 'reserve'; amount: number } | { op: 'commit'; pick: number } | { op: 'release'; pick: number } | { op: 'refund'; pick: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ op: fc.constant('reserve' as const), amount: fc.integer({ min: 0, max: 50_000 }) }),
  fc.record({ op: fc.constant('commit' as const), pick: fc.nat() }),
  fc.record({ op: fc.constant('release' as const), pick: fc.nat() }),
  fc.record({ op: fc.constant('refund' as const), pick: fc.nat() }),
);

describe.each([
  ['MemoryLedger', () => new MemoryLedger() as Ledger],
  ['SqliteLedger', () => new SqliteLedger(openDb(':memory:')) as Ledger],
])('%s invariants', (_name, make) => {
  it('balances never go negative and always equal a simple model', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 60 }), (ops) => {
        const l = make();
        const model = new Map<string, { amount: number; status: string }>();
        let n = 0;
        for (const o of ops) {
          const ids = [...model.keys()];
          if (o.op === 'reserve') {
            const id = `d${n++}`;
            l.atomically((tx) => tx.reserve({ decisionId: id, mandateId: 'm', qty: 1, amountCents: o.amount, createdMs: T0 }));
            model.set(id, { amount: o.amount, status: 'RESERVED' });
          } else if (ids.length) {
            const id = ids[o.pick % ids.length]!;
            const s = model.get(id)!;
            const from = o.op === 'refund' ? 'COMMITTED' : 'RESERVED';
            const to = { commit: 'COMMITTED', release: 'RELEASED', refund: 'REFUNDED' }[o.op];
            if (s.status === from) {
              l[o.op](id);
              s.status = to;
            } else {
              expect(() => l[o.op](id)).toThrow();
            }
          }
          const t = l.totals('m');
          const sum = (st: string) => [...model.values()].filter((v) => v.status === st).reduce((a, v) => a + v.amount, 0);
          expect(t.committedCents).toBeGreaterThanOrEqual(0);
          expect(t.reservedCents).toBeGreaterThanOrEqual(0);
          expect(t).toEqual({ committedCents: sum('COMMITTED'), reservedCents: sum('RESERVED') });
        }
      }),
      { numRuns: 150 },
    );
  });

  it('reserve → release restores the exact prior balance', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 99_999 }), { minLength: 1, maxLength: 30 }), fc.integer({ min: 1, max: 99_999 }), (prior, amount) => {
        const l = make();
        prior.forEach((a, i) => l.atomically((tx) => tx.reserve({ decisionId: `p${i}`, mandateId: 'm', qty: 1, amountCents: a, createdMs: T0 })));
        const before = l.totals('m');
        l.atomically((tx) => tx.reserve({ decisionId: 'x', mandateId: 'm', qty: 1, amountCents: amount, createdMs: T0 }));
        l.release('x');
        expect(l.totals('m')).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });
});

describe('concurrency', () => {
  it('100 concurrent in-process evaluations never reserve past the budget', async () => {
    const ledger = new SqliteLedger(openDb(':memory:'));
    const g = guard(ledger);
    const m = mandate({ budgetCents: 10_000, stepUpAboveCents: 100_000, velocity: { maxPerHour: 1000, maxPerMerchantWindowCents: 1_000_000, windowMinutes: 60 } });
    const c = contract({ lines: [{ id: 'P', category: 'office-supplies', productType: 'printer-paper', description: 'paper', maxQty: 100, maxUnitCents: 1000 }] });
    const results = await Promise.all(
      Array.from({ length: 100 }, async (_, i) => {
        await new Promise((r) => setTimeout(r, i % 7));
        return g.evaluate({ mandate: m, contract: c, intent: purchase('PT-PAPER-A4') }).verdict;
      }),
    );
    expect(results.filter((v) => v === 'ALLOW')).toHaveLength(Math.floor(10_000 / 899)); // 11
    expect(ledger.totals(m.id).reservedCents).toBeLessThanOrEqual(10_000);
  });

  it('4 OS processes racing on one SQLite file: BEGIN IMMEDIATE keeps the total within budget', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'allowance-race-'));
    const file = path.join(dir, 'race.db');
    try {
      openDb(file).close(); // create schema once
      const worker = path.resolve(import.meta.dirname, 'workers/reserve-worker.ts');
      const runs = await Promise.all(
        [0, 1, 2, 3].map((w) => run(process.execPath, ['--import', 'tsx', worker, file, String(w), '25'], { cwd: path.resolve(import.meta.dirname, '../..'), env: { ...process.env, PAYPAL_ENV: 'sandbox' } })),
      );
      const verdicts = runs.flatMap((r) => JSON.parse(r.stdout.trim().split('\n').at(-1)!) as string[]);
      expect(verdicts).toHaveLength(100);
      const ledger = new SqliteLedger(openDb(file));
      const totals = ledger.totals('mnd_race');
      expect(totals.reservedCents).toBeLessThanOrEqual(10_000);
      expect(verdicts.filter((v) => v === 'ALLOW')).toHaveLength(Math.floor(10_000 / 899));
      expect(totals.reservedCents).toBe(Math.floor(10_000 / 899) * 899);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
