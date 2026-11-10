// R11 STEP_UP_THRESHOLD (step-up): above the ask-me line, PayPal asks the person. Optionally (off by
// default, so the demo's cables go straight through) also on the first purchase from a merchant.
import { pass, skip, stepUp, usd, type Rule } from './context';

export const R11: Rule = ({ intent, mandate, item, merchant, amountCents, facts }) => {
  if (intent.kind !== 'PURCHASE' || !item) return skip('R11', 'not a registry purchase');
  if (amountCents > mandate.stepUpAboveCents) {
    return stepUp('R11', `${usd(amountCents)} > ask-me line ${usd(mandate.stepUpAboveCents)}`, `Above your ${usd(mandate.stepUpAboveCents)} ask-me line.`);
  }
  if (mandate.stepUpOnNewMerchant && !facts.purchasedFromMerchantBefore) {
    const name = merchant?.name ?? item.merchantId;
    return stepUp('R11', `first purchase from ${item.merchantId}`, `First purchase from ${name}.`);
  }
  return pass('R11', `${usd(amountCents)} ≤ ask-me line ${usd(mandate.stepUpAboveCents)}`);
};
