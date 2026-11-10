// R06 BUDGET_REMAINING (block): committed + reserved + amount ≤ budget. Evaluated inside the same
// atomic section (BEGIN IMMEDIATE) that writes the reservation, so concurrent calls cannot overspend.
import { fail, pass, skip, usd, type Rule } from './context';

export const R06: Rule = ({ intent, item, mandate, amountCents, facts }) => {
  if (intent.kind !== 'PURCHASE' || !item) return skip('R06', 'not a registry purchase; nothing to reserve');
  if (amountCents === 0) return skip('R06', 'nothing to reserve');
  const after = facts.committedCents + facts.reservedCents + amountCents;
  if (after > mandate.budgetCents) {
    const left = Math.max(0, mandate.budgetCents - facts.committedCents - facts.reservedCents);
    return fail('R06', `${usd(after)} would exceed budget ${usd(mandate.budgetCents)}`, `Only ${usd(left)} left of your ${usd(mandate.budgetCents)} allowance.`);
  }
  return pass('R06', `reservation fits: ${usd(after)} ≤ ${usd(mandate.budgetCents)}`);
};
