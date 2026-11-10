import { describe, expect, it } from 'vitest';
import { applyChange, simulatePolicy, type HistoryRun } from '@/lib/guard/simulate';
import { NOW, contract, mandate, purchase, registry } from '../fixtures/guard';

const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();

function run(id: string, kind: HistoryRun['kind'], decisions: HistoryRun['decisions'], c = contract()): HistoryRun {
  return { id, source: 'lab', kind, label: id, mandate: mandate(), contract: c, registry: registry(), decisions };
}

const armTask = contract({ lines: [{ id: 'A', category: 'office-supplies', productType: 'monitor-arm', description: 'monitor arm', maxQty: 1, maxUnitCents: 15000 }] });

describe('simulatePolicy', () => {
  it('raising only the per-purchase cap is not enough for a $135 arm: the $100 merchant window (R07) still blocks it', () => {
    const r = simulatePolicy([run('benign-arm', 'benign', [{ at: at(0), intent: purchase('NW-ARM-PRO'), authorised: true }], armTask)], { perPurchaseCapCents: 15_000 });
    expect(r.flipped).toBe(0);
  });

  it('raising the cap and the merchant window to $150 turns the blocked $135 arm into a step-up', () => {
    const r = simulatePolicy([run('benign-arm', 'benign', [{ at: at(0), intent: purchase('NW-ARM-PRO'), authorised: true }], armTask)], { perPurchaseCapCents: 15_000, maxPerMerchantWindowCents: 15_000 });
    expect(r.flipped).toBe(1);
    expect(r.flips[0]).toMatchObject({ from: 'BLOCK', to: 'STEP_UP', amountCents: 13_500, rule: 'R05' });
    expect(r.falseBlocksFixed).toBe(1);
    expect(r.newlyStepUpCents).toBe(13_500);
  });

  it('raising the ask-me line to $50 saves the lamp step-up; nothing else changes', () => {
    const r = simulatePolicy(
      [run('errand', 'benign', [
        { at: at(0), intent: purchase('VW-CBL-USBC-1M', 2), authorised: true },
        { at: at(1), intent: purchase('NW-LAMP-LED'), authorised: true },
      ])],
      { stepUpAboveCents: 5_000 },
    );
    expect(r).toMatchObject({ decisions: 2, flipped: 1, fewerStepUps: 1, newFalseBlocks: 0 });
  });

  it('allowing gift cards lets an injected gift-card attack through: still blocked by task binding (R02)', () => {
    const r = simulatePolicy([run('attack', 'attack', [{ at: at(0), intent: purchase('GH-GIFT-200'), authorised: false }])], { allowedCategories: ['office-supplies', 'electronics', 'gift-cards'], perPurchaseCapCents: 50_000, budgetCents: 50_000 });
    // Category and caps no longer stop it, but the task contract still does: no flip.
    expect(r.flipped).toBe(0);
    expect(r.attacksLetThrough.count).toBe(0);
  });

  it('a lower budget creates new false blocks on authorised purchases', () => {
    const r = simulatePolicy(
      [run('errand', 'benign', [
        { at: at(0), intent: purchase('VW-CBL-USBC-1M', 2), authorised: true },
        { at: at(1), intent: purchase('NW-LAMP-LED'), authorised: true },
      ])],
      { budgetCents: 3_000 },
    );
    expect(r.newFalseBlocks).toBe(1);
    expect(r.flips[0]).toMatchObject({ from: 'STEP_UP', to: 'BLOCK', rule: 'R06' });
  });

  it('applyChange only touches the fields given', () => {
    const m = mandate();
    const n = applyChange(m, { perPurchaseCapCents: 8000, maxPerMerchantWindowCents: 20_000 });
    expect(n.perPurchaseCapCents).toBe(8000);
    expect(n.velocity).toEqual({ ...m.velocity, maxPerMerchantWindowCents: 20_000 });
    expect(n.budgetCents).toBe(m.budgetCents);
  });
});
