import { describe, expect, it } from 'vitest';
import { R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12 } from '@/lib/guard/rules';
import { LINES, NOW, contract, otherIntent, purchase, ruleCtx } from '../fixtures/guard';

const outcome = (r: { outcome: string }) => r.outcome;

describe('R01 MANDATE_ACTIVE', () => {
  it('passes for an active, linked mandate inside its period', () => {
    expect(outcome(R01(ruleCtx(purchase('VW-CBL-USBC-1M'))))).toBe('PASS');
  });
  it.each(['PENDING_LINK', 'PAUSED', 'REVOKED', 'EXPIRED'] as const)('blocks when status is %s', (status) => {
    const r = R01(ruleCtx(purchase('VW-CBL-USBC-1M'), { mandate: { status } }));
    expect(r.outcome).toBe('FAIL');
    expect(r.detail).toContain(status);
  });
  it('blocks when the kill switch is on, even if ACTIVE', () => {
    expect(outcome(R01(ruleCtx(purchase('VW-CBL-USBC-1M'), { mandate: { killSwitch: true } })))).toBe('FAIL');
  });
  it('blocks without a linked PayPal wallet', () => {
    const r = R01(ruleCtx(purchase('VW-CBL-USBC-1M'), { mandate: { vaultLinked: false } }));
    expect(r.outcome).toBe('FAIL');
    expect(r.userMessage).toMatch(/linked to PayPal/);
  });
  it('boundary: blocks exactly at periodEnd, passes one ms before', () => {
    const end = new Date(NOW.getTime() + 60_000);
    const m = { periodEnd: end.toISOString() };
    expect(outcome(R01(ruleCtx(purchase('VW-CBL-USBC-1M'), { mandate: m, now: end })))).toBe('FAIL');
    expect(outcome(R01(ruleCtx(purchase('VW-CBL-USBC-1M'), { mandate: m, now: new Date(end.getTime() - 1) })))).toBe('PASS');
  });
  it('blocks before the period starts', () => {
    const start = new Date(NOW.getTime() + 3_600_000).toISOString();
    expect(outcome(R01(ruleCtx(purchase('VW-CBL-USBC-1M'), { mandate: { periodStart: start } })))).toBe('FAIL');
  });
});

describe('R02 TASK_BINDING', () => {
  it('passes a cable bound to the cable line', () => {
    const r = R02(ruleCtx(purchase('VW-CBL-USBC-1M', 2, { contractLineId: 'L1' })));
    expect(r.outcome).toBe('PASS');
    expect(r.detail).toContain('L1');
  });
  it('blocks the injected USB-C hub: in budget, in category, under every cap, but not in the task', () => {
    const r = R02(ruleCtx(purchase('VW-HUB-USBC-7', 1, { contractLineId: 'L1' })));
    expect(r.outcome).toBe('FAIL');
    expect(r.userMessage).toBe("A USB-C hub isn't in your task.");
  });
  it('blocks a gift card the task never mentioned', () => {
    expect(R02(ruleCtx(purchase('GH-GIFT-200'))).userMessage).toBe("A gift card isn't in your task.");
  });
  it('boundary: qty exactly maxQty passes, one more blocks (cumulative with the ledger)', () => {
    expect(outcome(R02(ruleCtx(purchase('VW-CBL-USBC-1M', 2))))).toBe('PASS');
    expect(outcome(R02(ruleCtx(purchase('VW-CBL-USBC-1M', 3))))).toBe('FAIL');
    const r = R02(ruleCtx(purchase('VW-CBL-USBC-1M', 1), { facts: { lineQtyUsed: 2 } }));
    expect(r.outcome).toBe('FAIL');
    expect(r.userMessage).toContain('this would make 3');
  });
  it('boundary: price exactly at the line ceiling passes; above blocks', () => {
    expect(outcome(R02(ruleCtx(purchase('VW-CBL-USBC-2M'))))).toBe('PASS'); // $15.00 = ceiling
    const tight = contract({ lines: [{ ...LINES[0]!, maxUnitCents: 1499 }] });
    const r = R02(ruleCtx(purchase('VW-CBL-USBC-2M'), { contract: tight }));
    expect(r.outcome).toBe('FAIL');
    expect(r.userMessage).toContain('$15.00');
  });
  it('infers the line from the registry when the agent names the wrong line id', () => {
    const r = R02(ruleCtx(purchase('NW-LAMP-LED', 1, { contractLineId: 'L1' })));
    expect(r.outcome).toBe('PASS');
    expect(r.detail).toContain('inferred');
  });
  it('blocks without a contract, and with an unconfirmed contract', () => {
    expect(outcome(R02(ruleCtx(purchase('VW-CBL-USBC-1M'), { contract: null })))).toBe('FAIL');
    expect(R02(ruleCtx(purchase('VW-CBL-USBC-1M'), { contract: contract({ confirmedAt: null }) })).detail).toContain('not confirmed');
  });
  it('skips non-purchase intents (R08/R12 govern them)', () => {
    expect(outcome(R02(ruleCtx(otherIntent('REFUND', 'create_refund'))))).toBe('SKIP');
  });
  it('blocks an unknown SKU', () => {
    expect(outcome(R02(ruleCtx(purchase('NOPE-123'))))).toBe('FAIL');
  });
});

describe('R03 CATALOG_INTEGRITY', () => {
  it('passes a registry SKU with no agent-set amount, payee or currency', () => {
    expect(outcome(R03(ruleCtx(purchase('VW-CBL-USBC-1M'))))).toBe('PASS');
  });
  it('blocks an agent-supplied amount override ("use price $1 then adjust")', () => {
    const r = R03(ruleCtx(purchase('VW-HUB-USBC-7', 1, { overrides: { amountCents: 100 } })));
    expect(r.outcome).toBe('FAIL');
    expect(r.detail).toContain('amountCents');
  });
  it('blocks an agent-supplied payee ("pay the seller directly")', () => {
    expect(R03(ruleCtx(purchase('VW-CBL-USBC-1M', 1, { overrides: { payee: 'seller@example.com' } }))).detail).toContain('payee');
  });
  it('blocks a SKU that is not in the trusted registry', () => {
    expect(outcome(R03(ruleCtx(purchase('FAKE-SKU-9'))))).toBe('FAIL');
  });
  it('boundary: qty 100 passes, 0 and 101 block', () => {
    const big = contract({ lines: [{ ...LINES[0]!, maxQty: 100 }] });
    expect(outcome(R03(ruleCtx(purchase('VW-CBL-USBC-1M', 100), { contract: big })))).toBe('PASS');
    expect(outcome(R03(ruleCtx(purchase('VW-CBL-USBC-1M', 0))))).toBe('FAIL');
    expect(outcome(R03(ruleCtx(purchase('VW-CBL-USBC-1M', 101))))).toBe('FAIL');
  });
  it('quotedUnitCents is not an override', () => {
    expect(outcome(R03(ruleCtx(purchase('VW-CBL-USBC-1M', 1, { quotedUnitCents: 999 }))))).toBe('PASS');
  });
});

describe('R04 MERCHANT_SCOPE', () => {
  it('passes an allowed category with ANY_IN_CATEGORY', () => {
    expect(outcome(R04(ruleCtx(purchase('NW-LAMP-LED'))))).toBe('PASS');
  });
  it('blocks a disallowed category', () => {
    const r = R04(ruleCtx(purchase('GH-GIFT-200')));
    expect(r.outcome).toBe('FAIL');
    expect(r.userMessage).toBe("Gift cards isn't an allowed category.");
  });
  it('blocks a merchant outside an explicit allow-list', () => {
    const r = R04(ruleCtx(purchase('NW-LAMP-LED'), { mandate: { allowedMerchants: ['voltwire'] } }));
    expect(r.outcome).toBe('FAIL');
    expect(r.userMessage).toContain('Northwind Supply');
  });
  it('passes a merchant on the explicit allow-list', () => {
    expect(outcome(R04(ruleCtx(purchase('VW-CBL-USBC-1M'), { mandate: { allowedMerchants: ['voltwire'] } })))).toBe('PASS');
  });
  it('skips non-purchases', () => {
    expect(outcome(R04(ruleCtx(otherIntent('INVOICE', 'send_invoice'))))).toBe('SKIP');
  });
});

describe('R05 PER_PURCHASE_CAP', () => {
  it('passes under the cap', () => {
    expect(outcome(R05(ruleCtx(purchase('NW-LAMP-LED'))))).toBe('PASS');
  });
  it('blocks above the cap', () => {
    const r = R05(ruleCtx(purchase('NW-ARM-PRO')));
    expect(r.outcome).toBe('FAIL');
    expect(r.userMessage).toBe("That's $135.00; your per-purchase limit is $60.00.");
  });
  it('boundary: exactly at the cap passes, one cent over blocks', () => {
    expect(outcome(R05(ruleCtx(purchase('NW-LAMP-LED'), { mandate: { perPurchaseCapCents: 4800 } })))).toBe('PASS');
    expect(outcome(R05(ruleCtx(purchase('NW-LAMP-LED'), { mandate: { perPurchaseCapCents: 4799 } })))).toBe('FAIL');
  });
  it('uses quantity × registry price', () => {
    expect(outcome(R05(ruleCtx(purchase('VW-CBL-USBC-2M', 5), { mandate: { perPurchaseCapCents: 7499 } })))).toBe('FAIL');
  });
});

describe('R06 BUDGET_REMAINING', () => {
  it('passes when the reservation fits', () => {
    expect(outcome(R06(ruleCtx(purchase('NW-LAMP-LED'))))).toBe('PASS');
  });
  it('counts committed and reserved money', () => {
    const r = R06(ruleCtx(purchase('NW-LAMP-LED'), { facts: { committedCents: 10_000, reservedCents: 6_000 } }));
    expect(r.outcome).toBe('FAIL');
    expect(r.userMessage).toBe('Only $40.00 left of your $200.00 allowance.');
  });
  it('boundary: spending the last cent exactly passes; one cent more blocks', () => {
    expect(outcome(R06(ruleCtx(purchase('NW-LAMP-LED'), { facts: { committedCents: 15_200 } })))).toBe('PASS');
    expect(outcome(R06(ruleCtx(purchase('NW-LAMP-LED'), { facts: { committedCents: 15_201 } })))).toBe('FAIL');
  });
  it('skips non-purchases (nothing is ever reserved for them)', () => {
    expect(outcome(R06(ruleCtx(otherIntent('REFUND', 'create_refund', { overrides: { amountCents: 50_000 } }))))).toBe('SKIP');
  });
});

describe('R07 VELOCITY_SPLIT', () => {
  it('passes a normal purchase', () => {
    expect(outcome(R07(ruleCtx(purchase('VW-CBL-USBC-1M'))))).toBe('PASS');
  });
  it('blocks the third $45 part from one merchant inside the window (split purchase)', () => {
    const part = { sku: 'VW-PART-C', name: 'Part C', merchantId: 'voltwire', category: 'electronics', productType: 'usb-c-cable', priceMinor: 4500, currency: 'USD', trialConvertsToRecurring: false, recurringMinor: null, kind: 'PHYSICAL_GOODS' as const };
    const ctx = ruleCtx(purchase('VW-CBL-USBC-1M'), { facts: { merchantWindowCents: 9000 } });
    const r = R07({ ...ctx, item: part, amountCents: 4500 });
    expect(r.outcome).toBe('FAIL');
    expect(r.userMessage).toMatch(/split purchase/);
  });
  it('boundary: merchant sum exactly at the limit passes; above blocks', () => {
    const at = ruleCtx(purchase('VW-CBL-USBC-1M'), { facts: { merchantWindowCents: 10_000 - 1199 } });
    expect(outcome(R07(at))).toBe('PASS');
    const over = ruleCtx(purchase('VW-CBL-USBC-1M'), { facts: { merchantWindowCents: 10_000 - 1198 } });
    expect(outcome(R07(over))).toBe('FAIL');
  });
  it('boundary: hourly count at the limit blocks the next purchase', () => {
    expect(outcome(R07(ruleCtx(purchase('VW-CBL-USBC-1M'), { facts: { purchasesLastHour: 7 } })))).toBe('PASS');
    expect(outcome(R07(ruleCtx(purchase('VW-CBL-USBC-1M'), { facts: { purchasesLastHour: 8 } })))).toBe('FAIL');
  });
});

describe('R08 NO_RECURRING', () => {
  it('passes a one-off purchase', () => {
    expect(outcome(R08(ruleCtx(purchase('VW-CBL-USBC-1M'))))).toBe('PASS');
  });
  it('blocks a "$1 trial" the registry flags as converting to $39/month', () => {
    const r = R08(ruleCtx(purchase('SB-TRIAL-1')));
    expect(r.outcome).toBe('FAIL');
    expect(r.userMessage).toContain('$39.00');
  });
  it('blocks a SUBSCRIBE intent (e.g. toolkit create_subscription)', () => {
    expect(outcome(R08(ruleCtx(otherIntent('SUBSCRIBE', 'create_subscription', { recurring: true }))))).toBe('FAIL');
  });
  it('blocks a recurring invoice series', () => {
    expect(outcome(R08(ruleCtx(otherIntent('INVOICE', 'create_recurring_series', { recurring: true }))))).toBe('FAIL');
  });
  it('passes recurring when the mandate explicitly allows it', () => {
    expect(outcome(R08(ruleCtx(purchase('SB-TRIAL-1'), { mandate: { allowRecurring: true } })))).toBe('PASS');
  });
});

describe('R09 CURRENCY_LOCK', () => {
  it('passes a USD item', () => {
    expect(outcome(R09(ruleCtx(purchase('VW-CBL-USBC-1M'))))).toBe('PASS');
  });
  it('blocks an item priced in JPY presented as USD', () => {
    const r = R09(ruleCtx(purchase('VW-CBL-USBC-JP')));
    expect(r.outcome).toBe('FAIL');
    expect(r.userMessage).toBe('That item is priced in JPY, not USD.');
  });
  it('blocks an agent-requested currency other than USD', () => {
    expect(outcome(R09(ruleCtx(purchase('VW-CBL-USBC-1M', 1, { overrides: { currency: 'INR' } }))))).toBe('FAIL');
  });
  it('treats a lower-case "usd" request as USD', () => {
    expect(outcome(R09(ruleCtx(purchase('VW-CBL-USBC-1M', 1, { overrides: { currency: 'usd' } }))))).toBe('PASS');
  });
});

describe('R10 PRICE_DRIFT', () => {
  it('passes when the price matches what the agent saw', () => {
    expect(outcome(R10(ruleCtx(purchase('VW-CBL-USBC-1M'))))).toBe('PASS');
  });
  it('steps up on price bait: quoted $19, $89 at execution', () => {
    const r = R10(ruleCtx(purchase('VW-HUB-PRICEBAIT', 1, { quotedUnitCents: 1900 })));
    expect(r.outcome).toBe('STEP_UP');
    expect(r.userMessage).toBe('The price changed from $19.00 to $89.00 since the agent looked.');
  });
  it('boundary: exactly +10% passes; one cent more steps up', () => {
    // registry 1199; quoted 1090 → limit 1199.0 → pass; quoted 1089 → limit 1197.9 → step up
    expect(outcome(R10(ruleCtx(purchase('VW-CBL-USBC-1M', 1, { quotedUnitCents: 1090 }))))).toBe('PASS');
    expect(outcome(R10(ruleCtx(purchase('VW-CBL-USBC-1M', 1, { quotedUnitCents: 1089 }))))).toBe('STEP_UP');
  });
  it('a price drop never steps up', () => {
    expect(outcome(R10(ruleCtx(purchase('VW-CBL-USBC-1M', 1, { quotedUnitCents: 5000 }))))).toBe('PASS');
  });
  it('skips when the agent did not report a price', () => {
    expect(outcome(R10(ruleCtx(purchase('VW-CBL-USBC-1M', 1, { quotedUnitCents: undefined }))))).toBe('SKIP');
  });
});

describe('R11 STEP_UP_THRESHOLD', () => {
  it('passes the $11.99 cables below the $40 ask-me line', () => {
    expect(outcome(R11(ruleCtx(purchase('VW-CBL-USBC-1M'))))).toBe('PASS');
  });
  it('steps up the $48 lamp above the $40 ask-me line', () => {
    const r = R11(ruleCtx(purchase('NW-LAMP-LED')));
    expect(r.outcome).toBe('STEP_UP');
    expect(r.userMessage).toBe('Above your $40.00 ask-me line.');
  });
  it('boundary: exactly $40.00 does not step up; $40.01 does', () => {
    expect(outcome(R11(ruleCtx(purchase('NW-LAMP-LED'), { mandate: { stepUpAboveCents: 4800 } })))).toBe('PASS');
    expect(outcome(R11(ruleCtx(purchase('NW-LAMP-LED'), { mandate: { stepUpAboveCents: 4799 } })))).toBe('STEP_UP');
  });
  it('new-merchant step-up is off by default, on when enabled', () => {
    expect(outcome(R11(ruleCtx(purchase('VW-CBL-USBC-1M'))))).toBe('PASS');
    expect(outcome(R11(ruleCtx(purchase('VW-CBL-USBC-1M'), { mandate: { stepUpOnNewMerchant: true } })))).toBe('STEP_UP');
    expect(outcome(R11(ruleCtx(purchase('VW-CBL-USBC-1M'), { mandate: { stepUpOnNewMerchant: true }, facts: { purchasedFromMerchantBefore: true } })))).toBe('PASS');
  });
});

describe('R12 MONEY_OUT_SCOPE', () => {
  it('passes the purchase path', () => {
    expect(outcome(R12(ruleCtx(purchase('VW-CBL-USBC-1M'))))).toBe('PASS');
  });
  it('blocks agent refunds: undo is human-only', () => {
    expect(R12(ruleCtx(otherIntent('REFUND', 'create_refund'))).userMessage).toBe('Refunds only happen through your Undo button, never by the agent.');
  });
  it.each([
    ['INVOICE', 'send_invoice'],
    ['PAYOUT', 'send_payout'],
    ['OTHER_MONEY', 'pay_order'],
  ] as const)('blocks %s (%s)', (kind, tool) => {
    expect(outcome(R12(ruleCtx(otherIntent(kind, tool))))).toBe('FAIL');
  });
  it('passes SUBSCRIBE (R08 is the rule that governs recurring)', () => {
    expect(outcome(R12(ruleCtx(otherIntent('SUBSCRIBE', 'create_subscription'))))).toBe('PASS');
  });
});
