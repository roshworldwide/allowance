// "No sequence of agent tool calls can move more than the budget" — random agent behaviour (including
// adversarial calls) through wrap() with a fake PayPal executor and a person who randomly approves,
// declines and undoes. Invariants hold after every step.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MemoryLedger, wrap, type Intent, type Verdict } from '@/lib/guard';
import { ITEMS, contract, guard, mandate } from '../fixtures/guard';

const SKUS = [...ITEMS.map((i) => i.sku), 'FAKE-SKU'];
const TOOLS = [
  { name: 'allowance_checkout', parameters: {} },
  { name: 'search_catalog', parameters: {} },
  { type: 'function' as const, function: { name: 'create_refund', parameters: {} } },
  { type: 'function' as const, function: { name: 'create_order', parameters: {} } },
  { type: 'function' as const, function: { name: 'create_subscription', parameters: {} } },
  { type: 'function' as const, function: { name: 'send_invoice', parameters: {} } },
];

const callArb = fc.oneof(
  { weight: 6, arbitrary: fc.record({ name: fc.constant('allowance_checkout'), args: fc.record({ sku: fc.constantFrom(...SKUS), qty: fc.integer({ min: 1, max: 5 }), contractLineId: fc.constantFrom('L1', 'L2', 'L9'), quotedUnitCents: fc.integer({ min: 1, max: 20_000 }) }) }) },
  { weight: 1, arbitrary: fc.record({ name: fc.constant('allowance_checkout'), args: fc.record({ sku: fc.constantFrom(...SKUS), qty: fc.integer({ min: 1, max: 3 }), amountCents: fc.integer({ min: 1, max: 100 }), payee: fc.constant('attacker@example.com') }) }) },
  { weight: 1, arbitrary: fc.record({ name: fc.constantFrom('create_refund', 'create_order', 'create_subscription', 'send_invoice', 'wire_money'), args: fc.record({ amount: fc.constant({ currency_code: 'USD', value: '999.00' }) }) }) },
);
const personArb = fc.record({ approve: fc.boolean(), paypalFails: fc.boolean(), undo: fc.boolean() });

describe('budget invariant through the wrapper (property)', () => {
  it('money moved never exceeds the budget, off-task items are never bought, BLOCK never executes', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.tuple(callArb, personArb), { maxLength: 40 }), fc.integer({ min: 0, max: 30_000 }), async (steps, budgetCents) => {
        const ledger = new MemoryLedger();
        const g = guard(ledger);
        const m = mandate({ budgetCents });
        const c = contract();
        const lineTypes = new Set(c.lines.map((l) => l.productType));
        let capturedCents = 0;
        let refundedCents = 0;
        const committed: Verdict[] = [];
        let pending: { approve: boolean; paypalFails: boolean; undo: boolean } = { approve: true, paypalFails: false, undo: false };

        const toolbelt = wrap(TOOLS, {
          evaluate: (intent: Intent) => g.evaluate({ mandate: m, contract: c, intent }),
          passThrough: async () => ({}),
          execute: async (v: Verdict) => {
            expect(v.verdict).not.toBe('BLOCK');
            const proceeds = v.verdict === 'ALLOW' ? !pending.paypalFails : pending.approve && !pending.paypalFails;
            if (!proceeds) {
              ledger.release(v.decisionId);
              return { status: 'NOT_CAPTURED' };
            }
            ledger.commit(v.decisionId);
            capturedCents += v.amountCents;
            committed.push(v);
            return { status: 'COMPLETED' };
          },
        });

        for (const [call, person] of steps) {
          pending = person;
          const out = await toolbelt.invoke(call);
          if (out.kind === 'verdict' && out.verdict.verdict === 'BLOCK') expect(out.execution).toBeUndefined();
          if (person.undo && committed.length) {
            const v = committed.shift()!;
            ledger.refund(v.decisionId);
            refundedCents += v.amountCents;
          }
          const t = ledger.totals(m.id);
          expect(t.committedCents + t.reservedCents).toBeLessThanOrEqual(budgetCents);
          expect(capturedCents - refundedCents).toBe(t.committedCents);
        }
        for (const e of ledger.entries(m.id)) {
          if (e.status === 'COMMITTED' || e.status === 'REFUNDED') {
            const item = ITEMS.find((i) => i.sku === e.sku)!;
            expect(lineTypes.has(item.productType)).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
