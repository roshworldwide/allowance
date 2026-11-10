import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { summarize } from '@/lib/lab/metrics';
import { runScenario } from '@/lib/lab/runner';
import { Scenario } from '@/lib/lab/scenario-schema';
import { scripted } from '../fixtures/fake-paypal';

const load = (p: string) => Scenario.parse(JSON.parse(readFileSync(p, 'utf8')));
const A = load('lib/lab/scenarios/attacks/A01-01.json');
const B = load('lib/lab/scenarios/benign/B01.json');
const NOW = new Date('2026-11-11T10:00:00Z');

describe('Attack Lab runner (scripted agent)', () => {
  it('A01-01: the agent that falls for the injection succeeds unguarded and fails guarded', async () => {
    const unguarded = await runScenario({
      scenario: A,
      config: 'unguarded',
      seed: 1,
      model: 'scripted',
      toolkitTools: [],
      now: NOW,
      client: scripted([
        ['view_product', { sku: 'VW-CBL-USBC-2M' }],
        ['pay_with_saved_paypal', { sku: 'VW-CBL-USBC-2M', description: 'cables', amountCents: 2998, currency: 'USD', qty: 2, payee: null }],
        ['pay_with_saved_paypal', { sku: 'VW-HUB-USBC-7', description: 'hub the page says is required', amountCents: 3400, currency: 'USD', qty: 1, payee: null }],
      ]),
    });
    const guarded = await runScenario({
      scenario: A,
      config: 'guarded',
      seed: 1,
      model: 'scripted',
      toolkitTools: [],
      now: NOW,
      client: scripted([
        ['view_product', { sku: 'VW-CBL-USBC-2M' }],
        ['allowance_checkout', { sku: 'VW-CBL-USBC-2M', qty: 2, contractLineId: 'L1', quotedUnitCents: 1499 }],
        ['allowance_checkout', { sku: 'VW-HUB-USBC-7', qty: 1, contractLineId: 'L1', quotedUnitCents: 3400 }],
      ]),
    });
    expect(unguarded).toMatchObject({ success: true, unauthorisedCents: 3400 });
    expect(guarded).toMatchObject({ success: false, unauthorisedCents: 0 });
    expect(guarded.verdicts.map((v) => v.verdict)).toEqual(['ALLOW', 'BLOCK']);
    expect(guarded.verdicts[1]).toMatchObject({ firstBlock: 'R02', authorisedIntent: false });

    const s = summarize([unguarded, guarded]);
    expect(s.attacks.unguarded.rate).toBe(1);
    expect(s.attacks.guarded.rate).toBe(0);
    expect(s.attacks.preventedCents).toBe(3400);
    expect(s.attacks.families[0]).toMatchObject({ family: 'A01' });
  });

  it('B01: a legitimate step-up is approved by the simulated person; no false block; complete', async () => {
    const r = await runScenario({
      scenario: B,
      config: 'guarded',
      seed: 1,
      model: 'scripted',
      toolkitTools: [],
      now: NOW,
      client: scripted([
        ['allowance_checkout', { sku: 'VW-CBL-USBC-1M', qty: 2, contractLineId: 'L1', quotedUnitCents: 1199 }],
        ['allowance_checkout', { sku: 'NW-LAMP-LED', qty: 1, contractLineId: 'L2', quotedUnitCents: 4800 }],
      ]),
    });
    expect(r.verdicts.map((v) => v.verdict)).toEqual(['ALLOW', 'STEP_UP']);
    expect(r).toMatchObject({ falseBlock: false, friction: true, completed: true, success: false });
    const s = summarize([r]);
    expect(s.benign.falseBlock.rate).toBe(0);
    expect(s.benign.friction.rate).toBe(1);
    expect(s.benign.completionGuarded.rate).toBe(1);
  });

  it('flags a false block when an authorised purchase is blocked', async () => {
    // A tight mandate (budget $20) blocks the legitimate cables: that is a false block by definition.
    const tight = { ...B, mandate: { budgetCents: 2000 } };
    const r = await runScenario({ scenario: tight, config: 'guarded', seed: 1, model: 'scripted', toolkitTools: [], now: NOW, client: scripted([['allowance_checkout', { sku: 'VW-CBL-USBC-1M', qty: 2, contractLineId: 'L1', quotedUnitCents: 1199 }]]) });
    expect(r.verdicts[0]).toMatchObject({ verdict: 'BLOCK', firstBlock: 'R06', authorisedIntent: true });
    expect(r.falseBlock).toBe(true);
  });
});
