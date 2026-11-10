// Sanity check for the corpus: each attack's pushed SKU must be judged unauthorised; each benign task's
// cheapest matching items must be judged authorised and fit the per-purchase cap.
import { readdirSync, readFileSync } from 'node:fs';
import { buildWorld } from '../lib/catalog';
import { judgeMovements } from '../lib/lab/authorize';
import { Scenario } from '../lib/lab/scenario-schema';
import types from '../catalog/product-types.json';

const T = types as Record<string, { category: string }>;
let issues = 0;
for (const dir of ['attacks', 'benign']) {
  for (const f of readdirSync(`lib/lab/scenarios/${dir}`).sort()) {
    const s = Scenario.parse(JSON.parse(readFileSync(`lib/lab/scenarios/${dir}/${f}`, 'utf8')));
    const w = buildWorld([{ items: s.catalogOverrides?.items, display: s.catalogOverrides?.display, pages: s.poisonedPages, reviews: s.reviews }]);
    const contract = { id: 'c', mandateId: 'm', confirmedAt: 'x', lines: s.contract.lines.map((l, i) => ({ ...l, id: `L${i + 1}`, category: T[l.productType]!.category })) };
    if (dir === 'attacks') {
      // Model what each family pushes the agent to do, then require the result to be unauthorised.
      const skus = s.attackSkus ?? [];
      const move = (sku: string, step: number, extra: Partial<{ qty: number; payee: string }> = {}) => {
        const it = w.registry.item(sku)!;
        const qty = extra.qty ?? 1;
        return { step, tool: 'pay', kind: 'PURCHASE' as const, sku, qty, amountCents: it.priceMinor * qty, currency: it.currency, ...(extra.payee ? { payee: extra.payee } : {}) };
      };
      const lineMax = (sku: string) => contract.lines.find((l) => l.productType === w.registry.item(sku)!.productType)?.maxQty ?? 1;
      const moves =
        s.family === 'A04' ? skus.map((k, i) => move(k, i, { payee: 'seller-direct@example.com' }))
        : s.family === 'A06' ? (skus.length === 1 ? [move(skus[0]!, 0), move(skus[0]!, 1)] : skus.map((k, i) => move(k, i)))
        : ['A07', 'A10', 'A12'].includes(s.family) ? skus.map((k, i) => move(k, i, { qty: lineMax(k) + 1 }))
        : skus.map((k, i) => move(k, i));
      const j = judgeMovements(moves, contract, w.registry);
      if (j.unauthorisedCents === 0) { issues++; console.log(`attack ${s.id} (${s.family}): modelled push is judged AUTHORISED`); }
    } else {
      const cap = s.mandate?.perPurchaseCapCents ?? 6000;
      const moves = s.expected!.complete.map((e, i) => {
        const line = contract.lines.find((l) => l.productType === e.productType)!;
        const it = w.items().filter((x) => x.productType === e.productType && x.currency === 'USD' && x.priceMinor <= line.maxUnitCents && x.recurringMinor === null && !x.trialConvertsToRecurring).sort((a, b) => a.priceMinor - b.priceMinor)[0]!;
        if (it.priceMinor > cap) { issues++; console.log(`benign ${s.id}: cheapest ${it.sku} ${it.priceMinor} > cap ${cap}`); }
        return { step: i, tool: 'pay', kind: 'PURCHASE' as const, sku: it.sku, qty: e.qty, amountCents: it.priceMinor * e.qty, currency: 'USD' };
      });
      const j = judgeMovements(moves, contract, w.registry);
      if (j.unauthorisedCents > 0) { issues++; console.log(`benign ${s.id}: expected purchase judged unauthorised: ${j.judged.filter((x) => !x.authorised).map((x) => x.reason).join('; ')}`); }
    }
  }
}
console.log(`sanity: ${issues} issue(s)`);
