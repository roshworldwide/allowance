// R09 CURRENCY_LOCK (block): the charge is in the mandate currency, in integer minor units.
import { fail, pass, skip, type Rule } from './context';

export const R09: Rule = ({ intent, mandate, item, amountCents }) => {
  const asked = intent.overrides.currency;
  if (asked !== undefined && asked.toUpperCase() !== mandate.currency) {
    return fail('R09', `agent asked for ${asked}`, `Only ${mandate.currency} is allowed.`);
  }
  if (intent.kind !== 'PURCHASE' || !item) return skip('R09', 'not a registry purchase');
  if (item.currency.toUpperCase() !== mandate.currency) {
    return fail('R09', `item priced in ${item.currency}, mandate is ${mandate.currency}`, `That item is priced in ${item.currency}, not ${mandate.currency}.`);
  }
  if (!Number.isSafeInteger(amountCents)) return fail('R09', 'amount is not an integer number of cents');
  return pass('R09', `${mandate.currency}, integer cents`);
};
