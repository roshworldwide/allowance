// R05 PER_PURCHASE_CAP (block): amount ≤ per-purchase cap.
import { fail, pass, skip, usd, type Rule } from './context';

export const R05: Rule = ({ intent, mandate, item, amountCents }) => {
  if (intent.kind !== 'PURCHASE' || !item) return skip('R05', 'not a registry purchase');
  if (amountCents > mandate.perPurchaseCapCents) {
    return fail('R05', `${usd(amountCents)} > cap ${usd(mandate.perPurchaseCapCents)}`, `That's ${usd(amountCents)}; your per-purchase limit is ${usd(mandate.perPurchaseCapCents)}.`);
  }
  return pass('R05', `${usd(amountCents)} ≤ cap ${usd(mandate.perPurchaseCapCents)}`);
};
