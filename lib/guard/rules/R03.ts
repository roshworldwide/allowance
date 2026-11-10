// R03 CATALOG_INTEGRITY (block): the SKU exists in the trusted registry and the charge is computed
// from the registry price. Any agent-supplied amount, payee or currency override is a block.
// (quotedUnitCents is not an override: it only records what the agent saw, for R10.)
import { fail, pass, type Rule } from './context';

export const R03: Rule = ({ intent, item, qty }) => {
  const tried = Object.entries(intent.overrides)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
  if (tried.length > 0) {
    return fail('R03', `agent tried to set ${tried.join(', ')}`, 'The agent tried to set the price or payee itself. Prices come only from the trusted catalog.');
  }
  if (intent.kind !== 'PURCHASE') return pass('R03', 'no agent-supplied amount, payee or currency');
  if (!intent.sku) return fail('R03', 'purchase has no SKU', "That item isn't in the trusted catalog.");
  if (!item) return fail('R03', `SKU ${intent.sku} is not in the trusted registry`, "That item isn't in the trusted catalog.");
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 100) return fail('R03', `invalid quantity ${intent.qty}`, 'That quantity is not valid.');
  return pass('R03', `charge computed from registry: ${qty} × ${item.priceMinor} ${item.currency} minor units`);
};
