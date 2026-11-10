import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MemoryChainStore, appendEvent, verifyChain, type ChainEvent } from '@/lib/guard';

const payloadArb = fc.record({
  kind: fc.constantFrom('decision', 'capture', 'refund', 'approval', 'mandate'),
  amountCents: fc.integer({ min: 0, max: 1_000_000 }),
  note: fc.string({ maxLength: 20 }),
  rules: fc.array(fc.constantFrom('R01', 'R02', 'R07', 'R11'), { maxLength: 4 }),
});

function build(payloads: unknown[]): ChainEvent[] {
  const store = new MemoryChainStore();
  payloads.forEach((p, i) => appendEvent(store, { type: 'event', payload: p, at: new Date(Date.UTC(2026, 10, 11, 10, 0, i)).toISOString() }));
  return store.all();
}

const FIELDS = ['at', 'type', 'payload', 'prevHash', 'hash'] as const;

describe('hash chain tamper detection (property)', () => {
  it('any single-character change to any stored field is detected at that event', () => {
    fc.assert(
      fc.property(
        fc.array(payloadArb, { minLength: 1, maxLength: 25 }),
        fc.nat(),
        fc.constantFrom(...FIELDS),
        fc.nat(),
        fc.integer({ min: 33, max: 126 }),
        (payloads, pickEvent, field, pickPos, charCode) => {
          const events = build(payloads);
          expect(verifyChain(events).ok).toBe(true);
          const k = pickEvent % events.length;
          const original = events[k]![field];
          const pos = pickPos % original.length;
          const replacement = String.fromCharCode(charCode === original.charCodeAt(pos) ? (charCode === 126 ? 33 : charCode + 1) : charCode);
          const tampered = original.slice(0, pos) + replacement + original.slice(pos + 1);
          events[k] = { ...events[k]!, [field]: tampered };
          const v = verifyChain(events);
          expect(v.ok).toBe(false);
          if (!v.ok) expect(v.brokenAt).toBe(k + 1);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('changing a seq number is detected at that position', () => {
    fc.assert(
      fc.property(fc.array(payloadArb, { minLength: 2, maxLength: 15 }), fc.nat(), fc.integer({ min: 1, max: 1000 }), (payloads, pick, delta) => {
        const events = build(payloads);
        const k = pick % events.length;
        events[k] = { ...events[k]!, seq: events[k]!.seq + delta };
        const v = verifyChain(events);
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.brokenAt).toBe(k + 1);
      }),
      { numRuns: 100 },
    );
  });
});
