// R10 PRICE_DRIFT (step-up): if the registry price at execution is above the price the agent saw by
// more than priceDriftPct, ask the person. Integer arithmetic only.
import { pass, skip, stepUp, usd, type Rule } from './context';

export const R10: Rule = ({ intent, mandate, item }) => {
  if (intent.kind !== 'PURCHASE' || !item) return skip('R10', 'not a registry purchase');
  if (item.currency.toUpperCase() !== mandate.currency) return skip('R10', 'currency mismatch (see R09)');
  const quoted = intent.quotedUnitCents;
  if (quoted === undefined) return skip('R10', 'agent did not report the price it saw');
  // price > quoted × (1 + pct/100)  ⇔  price × 100 > quoted × (100 + pct)
  if (item.priceMinor * 100 > quoted * (100 + mandate.priceDriftPct)) {
    return stepUp('R10', `registry ${usd(item.priceMinor)} vs quoted ${usd(quoted)} (> ${mandate.priceDriftPct}% drift)`, `The price changed from ${usd(quoted)} to ${usd(item.priceMinor)} since the agent looked.`);
  }
  return pass('R10', `registry ${usd(item.priceMinor)} within ${mandate.priceDriftPct}% of quoted ${usd(quoted)}`);
};
