// R02 TASK_BINDING (block): the purchase must match a line of the task the person confirmed —
// same product type and category as the registry says, cumulative quantity within the line, and the
// registry unit price within the line's ceiling. This is what stops the quiet attacks: an injected
// item can be in budget, in category and under every cap, and still not be in the task.
import { fail, pass, skip, usd, withArticle, type Rule } from './context';

export const R02: Rule = ({ intent, contract, item, line, lineResolution, label, qty, facts }) => {
  if (intent.kind !== 'PURCHASE') return skip('R02', `not a purchase (${intent.kind}); R08/R12 govern it`);
  if (!contract) return fail('R02', 'no task contract for this run', "There's no confirmed task for this purchase.");
  if (!contract.confirmedAt) return fail('R02', 'task contract not confirmed by the person', "You haven't confirmed this task yet.");
  if (!item) return fail('R02', `SKU ${intent.sku ?? '(none)'} is not in the registry, so it cannot match the task`, "That item isn't part of your task.");

  const thing = label(item.productType);
  if (!line) {
    const lines = contract.lines.map((l) => l.productType).join(', ');
    return fail('R02', `no confirmed line for product type "${item.productType}" (task lines: ${lines})`, `${capitalise(withArticle(thing))} isn't in your task.`);
  }
  if (item.productType !== line.productType || item.category !== line.category) {
    return fail(
      'R02',
      `item is ${item.productType}/${item.category}, line ${line.id} is ${line.productType}/${line.category}`,
      `${capitalise(withArticle(thing))} isn't in your task.`,
    );
  }
  const total = facts.lineQtyUsed + qty;
  if (total > line.maxQty) {
    return fail(
      'R02',
      `quantity ${total} (${facts.lineQtyUsed} already + ${qty}) exceeds line ${line.id} max ${line.maxQty}`,
      `Your task allows ${line.maxQty} × ${thing}; this would make ${total}.`,
    );
  }
  if (item.priceMinor > line.maxUnitCents) {
    return fail(
      'R02',
      `unit price ${usd(item.priceMinor)} exceeds line ${line.id} ceiling ${usd(line.maxUnitCents)}`,
      `It costs ${usd(item.priceMinor)}; your task said up to ${usd(line.maxUnitCents)}.`,
    );
  }
  return pass(
    'R02',
    `bound to line ${line.id} (${line.productType}${lineResolution === 'inferred' ? ', inferred from registry' : ''}), qty ${total}/${line.maxQty}, ${usd(item.priceMinor)} ≤ ${usd(line.maxUnitCents)}`,
  );
};

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
