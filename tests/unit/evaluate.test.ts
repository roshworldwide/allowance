import { describe, expect, it } from 'vitest';
import { MemoryLedger, RULE_IDS, toIntent, type Verdict } from '@/lib/guard';
import { contract, guard, mandate, otherIntent, purchase } from '../fixtures/guard';

const red = (v: Verdict) => v.rules.filter((r) => r.outcome === 'FAIL').map((r) => r.id);
const amber = (v: Verdict) => v.rules.filter((r) => r.outcome === 'STEP_UP').map((r) => r.id);

describe('the demo errand, end to end through the guard', () => {
  const ledger = new MemoryLedger();
  const g = guard(ledger);
  const m = mandate();
  const c = contract();

  it('cables: $11.99 × 2 → ALLOW, and the amount is reserved', () => {
    const v = g.evaluate({ mandate: m, contract: c, intent: purchase('VW-CBL-USBC-1M', 2, { contractLineId: 'L1' }) });
    expect(v.verdict).toBe('ALLOW');
    expect(v.amountCents).toBe(2398);
    expect(v.reserved).toBe(true);
    expect(ledger.totals(m.id).reservedCents).toBe(2398);
    expect(v.summary).toBe('Allowed: 2 × Volt & Wire USB-C cable 1 m, $23.98.');
  });

  it('injected USB-C hub → BLOCK R02, and R02 is the only red lamp', () => {
    const v = g.evaluate({ mandate: m, contract: c, intent: purchase('VW-HUB-USBC-7', 1, { contractLineId: 'L1' }) });
    expect(v.verdict).toBe('BLOCK');
    expect(v.firstBlock).toBe('R02');
    expect(red(v)).toEqual(['R02']);
    expect(amber(v)).toEqual([]);
    expect(v.summary).toBe("Blocked by R02 TASK_BINDING: A USB-C hub isn't in your task.");
    expect(v.reserved).toBe(false);
    expect(ledger.totals(m.id).reservedCents).toBe(2398); // unchanged
  });

  it('desk lamp $48 → STEP_UP R11 (above the $40 ask-me line), amount held while PayPal asks', () => {
    const v = g.evaluate({ mandate: m, contract: c, intent: purchase('NW-LAMP-LED', 1, { contractLineId: 'L2' }) });
    expect(v.verdict).toBe('STEP_UP');
    expect(v.stepUpReasons).toEqual(['R11']);
    expect(red(v)).toEqual([]);
    expect(v.reserved).toBe(true);
    expect(ledger.totals(m.id).reservedCents).toBe(2398 + 4800);
  });

  it('a third cable exceeds the confirmed quantity → BLOCK R02', () => {
    const v = g.evaluate({ mandate: m, contract: c, intent: purchase('VW-CBL-USBC-1M', 1) });
    expect(v.verdict).toBe('BLOCK');
    expect(v.firstBlock).toBe('R02');
  });
});

describe('verdict aggregation', () => {
  it('always returns all 12 rules, in order', () => {
    const v = guard().evaluate({ mandate: mandate(), contract: contract(), intent: purchase('VW-CBL-USBC-1M') });
    expect(v.rules.map((r) => r.id)).toEqual([...RULE_IDS]);
  });

  it('BLOCK beats STEP_UP: an over-ceiling price-bait hub is blocked, with R10 still reported', () => {
    const bait = { ...purchase('VW-HUB-PRICEBAIT', 1, { quotedUnitCents: 1900 }) };
    const c = contract({ lines: [{ id: 'H', category: 'electronics', productType: 'usb-c-hub', description: 'hub', maxQty: 1, maxUnitCents: 2500 }] });
    const v = guard().evaluate({ mandate: mandate(), contract: c, intent: bait });
    expect(v.verdict).toBe('BLOCK');
    expect(v.firstBlock).toBe('R02');
    expect(amber(v)).toContain('R10');
    expect(amber(v)).toContain('R11');
  });

  it('subscription trap ("$1 trial, then $39/month") is blocked by R08 as well as R02/R04', () => {
    const v = guard().evaluate({ mandate: mandate(), contract: contract(), intent: purchase('SB-TRIAL-1') });
    expect(v.verdict).toBe('BLOCK');
    expect(red(v)).toEqual(expect.arrayContaining(['R02', 'R04', 'R08']));
  });

  it('toolkit create_subscription → BLOCK, R08 is the only red lamp', () => {
    const v = guard().evaluate({ mandate: mandate(), contract: contract(), intent: toIntent('create_subscription', { plan_id: 'P-123', quantity: 1 }) });
    expect(v.verdict).toBe('BLOCK');
    expect(red(v)).toEqual(['R08']);
  });

  it('toolkit create_refund → BLOCK by R12 (undo is human-only); amount-setting also trips R03', () => {
    const v = guard().evaluate({ mandate: mandate(), contract: contract(), intent: toIntent('create_refund', { capture_id: '3B017991HX624902V', amount: { currency_code: 'USD', value: '500.00' } }) });
    expect(v.verdict).toBe('BLOCK');
    expect(red(v)).toEqual(['R03', 'R12']);
    expect(v.amountCents).toBe(50_000);
    expect(v.reserved).toBe(false);
  });

  it('toolkit pay_order (no registry SKU) → BLOCK R12', () => {
    const v = guard().evaluate({ mandate: mandate(), contract: contract(), intent: toIntent('pay_order', { id: '5O190127TN364715T' }) });
    expect(red(v)).toEqual(['R12']);
  });

  it('a revoked mandate blocks everything, even a perfect purchase', () => {
    const v = guard().evaluate({ mandate: mandate({ status: 'REVOKED' }), contract: contract(), intent: purchase('VW-CBL-USBC-1M') });
    expect(v.verdict).toBe('BLOCK');
    expect(v.firstBlock).toBe('R01');
  });

  it('is deterministic: same inputs, same verdict and trace', () => {
    const input = { mandate: mandate(), contract: contract(), intent: purchase('NW-LAMP-LED') };
    const a = guard().dryRun(input);
    const b = guard().dryRun(input);
    expect({ ...a, decisionId: '', latencyUs: 0 }).toEqual({ ...b, decisionId: '', latencyUs: 0 });
  });

  it('dryRun never reserves', () => {
    const ledger = new MemoryLedger();
    const v = guard(ledger).dryRun({ mandate: mandate(), contract: contract(), intent: purchase('VW-CBL-USBC-1M') });
    expect(v.verdict).toBe('ALLOW');
    expect(v.reserved).toBe(false);
    expect(ledger.entries('mnd_test')).toHaveLength(0);
  });

  it('rejects malformed input before any rule runs', () => {
    expect(() => guard().evaluate({ mandate: mandate({ budgetCents: -1 }), contract: contract(), intent: purchase('VW-CBL-USBC-1M') })).toThrow();
    expect(() => guard().evaluate({ mandate: mandate(), contract: contract(), intent: { ...purchase('VW-CBL-USBC-1M'), qty: 1.5 } })).toThrow();
  });

  it('budget exhaustion: purchases stop exactly when the budget would be exceeded', () => {
    const ledger = new MemoryLedger();
    const g = guard(ledger);
    const m = mandate({ budgetCents: 5000, stepUpAboveCents: 10_000 });
    const c = contract({ lines: [{ id: 'P', category: 'office-supplies', productType: 'printer-paper', description: 'paper', maxQty: 50, maxUnitCents: 1000 }] });
    const verdicts = Array.from({ length: 8 }, () => g.evaluate({ mandate: m, contract: c, intent: purchase('PT-PAPER-A4') }).verdict);
    // $8.99 each: 5 fit in $50.00 ($44.95), the 6th would be $53.94
    expect(verdicts).toEqual(['ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'BLOCK', 'BLOCK', 'BLOCK']);
    expect(ledger.totals(m.id).reservedCents).toBe(4495);
  });

  it('a refund frees budget for the next purchase', () => {
    const ledger = new MemoryLedger();
    const g = guard(ledger);
    const m = mandate({ budgetCents: 2400 });
    const v1 = g.evaluate({ mandate: m, contract: contract(), intent: purchase('VW-CBL-USBC-1M', 2) });
    ledger.commit(v1.decisionId);
    const c2 = contract({ id: 'tc_2' });
    expect(g.evaluate({ mandate: m, contract: c2, intent: purchase('VW-CBL-USBC-1M') }).firstBlock).toBe('R06');
    ledger.refund(v1.decisionId);
    expect(g.evaluate({ mandate: m, contract: c2, intent: purchase('VW-CBL-USBC-1M') }).verdict).toBe('ALLOW');
  });

  it('unknown/invented money tools are default-deny', () => {
    const v = guard().evaluate({ mandate: mandate(), contract: contract(), intent: otherIntent('OTHER_MONEY', 'transfer_funds') });
    expect(v.verdict).toBe('BLOCK');
    expect(v.firstBlock).toBe('R12');
  });
});
