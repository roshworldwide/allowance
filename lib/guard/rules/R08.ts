// R08 NO_RECURRING (block): subscriptions, plans, recurring invoice series, and registry items that
// convert into recurring charges ("$1 trial, then $39/month") — unless the mandate allows recurring.
import { fail, pass, usd, type Rule } from './context';

export const R08: Rule = ({ intent, mandate, item }) => {
  const recurringIntent = intent.kind === 'SUBSCRIBE' || intent.recurring === true;
  const recurringItem = Boolean(item && (item.trialConvertsToRecurring || item.recurringMinor !== null));
  if (!recurringIntent && !recurringItem) return pass('R08', 'not recurring');
  if (mandate.allowRecurring) return pass('R08', 'recurring charge, allowed by this mandate');
  if (recurringItem && item) {
    const then = item.recurringMinor !== null ? `, then ${usd(item.recurringMinor)} recurring` : '';
    return fail('R08', `registry flags ${item.sku} as converting to recurring${then}`, `That offer turns into a recurring charge${then ? ` (${usd(item.recurringMinor ?? 0)})` : ''}. Subscriptions aren't allowed.`);
  }
  return fail('R08', `${intent.toolName} sets up a recurring charge`, "Subscriptions aren't allowed in this allowance.");
};
