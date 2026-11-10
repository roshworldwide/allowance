// Shared guard fixtures: a small trusted registry built around the demo errand.
import { createGuard, MemoryLedger, mandatePreset, type CatalogItem, type CatalogRegistry, type ContractLine, type Intent, type Ledger, type Mandate, type Merchant, type TaskContract } from '@/lib/guard';
import { argsHash } from '@/lib/guard/wrap';
import type { LedgerFacts, RuleContext } from '@/lib/guard/rules/context';
import { resolveLine } from '@/lib/guard/contract';

export const NOW = new Date('2026-11-11T10:00:00.000Z');

export const MERCHANTS: Merchant[] = [
  { id: 'northwind', name: 'Northwind Supply', categories: ['office-supplies'], riskFlags: [] },
  { id: 'voltwire', name: 'Volt & Wire', categories: ['electronics'], riskFlags: [] },
  { id: 'lumen', name: 'Lumen Home', categories: ['home-lighting'], riskFlags: [] },
  { id: 'papertrail', name: 'PaperTrail', categories: ['office-supplies'], riskFlags: [] },
  { id: 'gifthub', name: 'GiftHub', categories: ['gift-cards'], riskFlags: ['stored-value'] },
  { id: 'streambox', name: 'StreamBox Plus', categories: ['subscriptions'], riskFlags: ['recurring'] },
];

const item = (i: Partial<CatalogItem> & Pick<CatalogItem, 'sku' | 'name' | 'merchantId' | 'category' | 'productType' | 'priceMinor'>): CatalogItem => ({
  currency: 'USD',
  trialConvertsToRecurring: false,
  recurringMinor: null,
  kind: 'PHYSICAL_GOODS',
  ...i,
});

export const ITEMS: CatalogItem[] = [
  item({ sku: 'VW-CBL-USBC-1M', name: 'Volt & Wire USB-C cable 1 m', merchantId: 'voltwire', category: 'electronics', productType: 'usb-c-cable', priceMinor: 1199 }),
  item({ sku: 'VW-CBL-USBC-2M', name: 'Volt & Wire USB-C cable 2 m', merchantId: 'voltwire', category: 'electronics', productType: 'usb-c-cable', priceMinor: 1500 }),
  item({ sku: 'VW-HUB-USBC-7', name: 'Volt & Wire 7-in-1 USB-C hub', merchantId: 'voltwire', category: 'electronics', productType: 'usb-c-hub', priceMinor: 3400 }),
  item({ sku: 'NW-LAMP-LED', name: 'Northwind LED desk lamp', merchantId: 'northwind', category: 'office-supplies', productType: 'desk-lamp', priceMinor: 4800 }),
  item({ sku: 'NW-LAMP-MINI', name: 'Northwind mini desk lamp', merchantId: 'northwind', category: 'office-supplies', productType: 'desk-lamp', priceMinor: 2900 }),
  item({ sku: 'PT-PAPER-A4', name: 'PaperTrail A4 paper, 500 sheets', merchantId: 'papertrail', category: 'office-supplies', productType: 'printer-paper', priceMinor: 899 }),
  item({ sku: 'NW-ARM-PRO', name: 'Northwind monitor arm', merchantId: 'northwind', category: 'office-supplies', productType: 'monitor-arm', priceMinor: 13500 }),
  item({ sku: 'GH-GIFT-200', name: 'GiftHub $200 gift card', merchantId: 'gifthub', category: 'gift-cards', productType: 'gift-card', priceMinor: 20000, kind: 'DIGITAL_GOODS' }),
  item({ sku: 'SB-TRIAL-1', name: 'StreamBox Plus 7-day trial', merchantId: 'streambox', category: 'subscriptions', productType: 'streaming-subscription', priceMinor: 100, trialConvertsToRecurring: true, recurringMinor: 3900, kind: 'DIGITAL_GOODS' }),
  item({ sku: 'VW-CBL-USBC-JP', name: 'USB-C cable (import)', merchantId: 'voltwire', category: 'electronics', productType: 'usb-c-cable', priceMinor: 1200, currency: 'JPY' }),
  item({ sku: 'VW-HUB-PRICEBAIT', name: 'USB-C hub (flash deal)', merchantId: 'voltwire', category: 'electronics', productType: 'usb-c-hub', priceMinor: 8900 }),
];

const LABELS: Record<string, string> = {
  'usb-c-cable': 'USB-C cable',
  'usb-c-hub': 'USB-C hub',
  'desk-lamp': 'desk lamp',
  'printer-paper': 'printer paper',
  'monitor-arm': 'monitor arm',
  'gift-card': 'gift card',
  'streaming-subscription': 'streaming subscription',
  'office-supplies': 'Office supplies',
  electronics: 'Electronics',
  'gift-cards': 'Gift cards',
  subscriptions: 'Subscriptions',
  'home-lighting': 'Home lighting',
};

export function registry(extra: CatalogItem[] = []): CatalogRegistry {
  const items = new Map([...ITEMS, ...extra].map((i) => [i.sku, i]));
  const merchants = new Map(MERCHANTS.map((m) => [m.id, m]));
  return { item: (s) => items.get(s), merchant: (id) => merchants.get(id), label: (k) => LABELS[k] ?? k.replace(/-/g, ' ') };
}

export function mandate(overrides: Partial<Mandate> = {}): Mandate {
  return { ...mandatePreset({ id: 'mnd_test', now: NOW, vaultLinked: true }), ...overrides };
}

export const LINES: ContractLine[] = [
  { id: 'L1', category: 'electronics', productType: 'usb-c-cable', description: 'USB-C cable', maxQty: 2, maxUnitCents: 1500 },
  { id: 'L2', category: 'office-supplies', productType: 'desk-lamp', description: 'Desk lamp', maxQty: 1, maxUnitCents: 5000 },
];

export function contract(overrides: Partial<TaskContract> = {}): TaskContract {
  return { id: 'tc_test', mandateId: 'mnd_test', confirmedAt: NOW.toISOString(), lines: LINES, ...overrides };
}

export function purchase(sku: string, qty = 1, extra: Partial<Intent> = {}): Intent {
  const i = registry().item(sku);
  return {
    kind: 'PURCHASE',
    toolName: 'allowance_checkout',
    sku,
    qty,
    quotedUnitCents: i?.priceMinor,
    overrides: {},
    rawArgsHash: argsHash({ sku, qty }),
    ...extra,
  };
}

export function otherIntent(kind: Intent['kind'], toolName: string, extra: Partial<Intent> = {}): Intent {
  return { kind, toolName, overrides: {}, rawArgsHash: argsHash({ toolName }), ...extra };
}

export const NO_FACTS: LedgerFacts = { committedCents: 0, reservedCents: 0, lineQtyUsed: 0, purchasesLastHour: 0, merchantWindowCents: 0, purchasedFromMerchantBefore: false };

/** A rule context like evaluate.ts builds, for testing rules in isolation. */
export function ruleCtx(intent: Intent, opts: { mandate?: Partial<Mandate>; contract?: TaskContract | null; facts?: Partial<LedgerFacts>; now?: Date } = {}): RuleContext {
  const reg = registry();
  const m = mandate(opts.mandate);
  const c = opts.contract === undefined ? contract() : opts.contract;
  const it = intent.kind === 'PURCHASE' && intent.sku ? reg.item(intent.sku) : undefined;
  const qty = intent.kind === 'PURCHASE' ? (intent.qty ?? 1) : 0;
  const { line, resolution } = resolveLine(c, intent, it);
  return {
    intent,
    mandate: m,
    contract: c,
    item: it,
    merchant: it ? reg.merchant(it.merchantId) : undefined,
    line,
    lineResolution: resolution,
    label: reg.label!,
    qty,
    amountCents: it ? it.priceMinor * qty : (intent.overrides.amountCents ?? 0),
    facts: { ...NO_FACTS, ...opts.facts },
    now: opts.now ?? NOW,
  };
}

let seq = 0;
export function guard(ledger: Ledger = new MemoryLedger(), now: () => Date = () => NOW) {
  return createGuard({ catalog: registry(), ledger, now, newDecisionId: () => `dec_${++seq}` });
}
