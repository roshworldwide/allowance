import { describe, expect, it } from 'vitest';
import { LedgerTransitionError, MemoryLedger, computeFacts, type Ledger } from '@/lib/guard';
import type { ReserveInput } from '@/lib/guard/ledger';
import { openDb } from '@/lib/store/db';
import { SqliteLedger } from '@/lib/store/sqlite-ledger';

const T0 = Date.parse('2026-11-11T10:00:00Z');

const implementations: [string, () => Ledger][] = [
  ['MemoryLedger', () => new MemoryLedger()],
  ['SqliteLedger', () => new SqliteLedger(openDb(':memory:'))],
];

const entry = (decisionId: string, amountCents: number, extra: Partial<ReserveInput> = {}): ReserveInput => ({
  decisionId,
  mandateId: 'm1',
  contractId: 'c1',
  contractLineId: 'L1',
  merchantId: 'voltwire',
  sku: 'SKU',
  qty: 1,
  amountCents,
  createdMs: T0,
  ...extra,
});

describe.each(implementations)('%s', (_name, make) => {
  it('reserve → commit → refund moves money between the right buckets', () => {
    const l = make();
    l.atomically((tx) => tx.reserve(entry('d1', 1000)));
    expect(l.totals('m1')).toEqual({ committedCents: 0, reservedCents: 1000 });
    l.commit('d1');
    expect(l.totals('m1')).toEqual({ committedCents: 1000, reservedCents: 0 });
    l.refund('d1');
    expect(l.totals('m1')).toEqual({ committedCents: 0, reservedCents: 0 });
    expect(l.get('d1')?.status).toBe('REFUNDED');
  });

  it('reserve → release restores the exact balance', () => {
    const l = make();
    l.atomically((tx) => tx.reserve(entry('a', 700)));
    l.atomically((tx) => tx.reserve(entry('b', 333)));
    l.release('b');
    expect(l.totals('m1')).toEqual({ committedCents: 0, reservedCents: 700 });
  });

  it('rejects invalid transitions', () => {
    const l = make();
    l.atomically((tx) => tx.reserve(entry('d1', 100)));
    expect(() => l.refund('d1')).toThrow(LedgerTransitionError); // must be committed first
    l.release('d1');
    expect(() => l.commit('d1')).toThrow(LedgerTransitionError); // released can't commit
    expect(() => l.release('missing')).toThrow(LedgerTransitionError);
  });

  it('rejects a duplicate reservation for the same decision (idempotency)', () => {
    const l = make();
    l.atomically((tx) => tx.reserve(entry('d1', 100)));
    expect(() => l.atomically((tx) => tx.reserve(entry('d1', 100)))).toThrow(LedgerTransitionError);
    expect(l.totals('m1').reservedCents).toBe(100);
  });

  it('rolls back the reservation if the atomic section throws', () => {
    const l = make();
    expect(() =>
      l.atomically((tx) => {
        tx.reserve(entry('d1', 100));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(l.entries('m1')).toHaveLength(0);
  });

  it('rejects negative or fractional amounts', () => {
    const l = make();
    expect(() => l.atomically((tx) => tx.reserve(entry('d1', -1)))).toThrow(RangeError);
    expect(() => l.atomically((tx) => tx.reserve(entry('d2', 1.5)))).toThrow(RangeError);
  });

  it('facts: line quantity, hourly count, merchant window, merchant history', () => {
    const l = make();
    l.atomically((tx) => tx.reserve(entry('d1', 1000, { qty: 2, createdMs: T0 - 30 * 60_000 })));
    l.atomically((tx) => tx.reserve(entry('d2', 500, { createdMs: T0 - 2 * 3_600_000, merchantId: 'northwind', contractLineId: 'L2' })));
    l.commit('d2');
    const f = l.atomically((tx) => tx.facts({ mandateId: 'm1', contractId: 'c1', contractLineId: 'L1', merchantId: 'voltwire', nowMs: T0, windowMinutes: 60 }));
    expect(f).toEqual({ committedCents: 500, reservedCents: 1000, lineQtyUsed: 2, purchasesLastHour: 1, merchantWindowCents: 1000, purchasedFromMerchantBefore: false });
    const g = l.atomically((tx) => tx.facts({ mandateId: 'm1', merchantId: 'northwind', nowMs: T0, windowMinutes: 60 }));
    expect(g.purchasedFromMerchantBefore).toBe(true);
    expect(g.merchantWindowCents).toBe(0); // outside the 60-minute window
  });

  it('isolates mandates', () => {
    const l = make();
    l.atomically((tx) => tx.reserve(entry('d1', 1000)));
    l.atomically((tx) => tx.reserve({ ...entry('d2', 9999), mandateId: 'm2' }));
    expect(l.totals('m1').reservedCents).toBe(1000);
    expect(l.totals('m2').reservedCents).toBe(9999);
  });
});

describe('computeFacts', () => {
  it('ignores RELEASED and REFUNDED money but remembers refunded merchants', () => {
    const f = computeFacts(
      [
        { decisionId: 'a', mandateId: 'm', qty: 1, amountCents: 100, status: 'RELEASED', createdMs: T0, merchantId: 'x' },
        { decisionId: 'b', mandateId: 'm', qty: 1, amountCents: 200, status: 'REFUNDED', createdMs: T0, merchantId: 'x' },
      ],
      { mandateId: 'm', merchantId: 'x', nowMs: T0, windowMinutes: 60 },
    );
    expect(f.committedCents + f.reservedCents + f.merchantWindowCents + f.purchasesLastHour).toBe(0);
    expect(f.purchasedFromMerchantBefore).toBe(true);
  });
});
