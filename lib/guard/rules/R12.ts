// R12 MONEY_OUT_SCOPE (block): the agent can never move money out. Refunds happen only through the
// person's Undo button (which never passes through the agent); payouts, invoices and other transfers
// are never available to the agent.
import { fail, pass, type Rule } from './context';

const MESSAGES = {
  REFUND: 'Refunds only happen through your Undo button, never by the agent.',
  INVOICE: "The agent can't create or send invoices.",
  PAYOUT: "The agent can't send money out.",
} as const;

export const R12: Rule = ({ intent }) => {
  switch (intent.kind) {
    case 'REFUND':
    case 'INVOICE':
    case 'PAYOUT':
      return fail('R12', `${intent.toolName} is a ${intent.kind} intent`, MESSAGES[intent.kind]);
    case 'OTHER_MONEY':
      return fail('R12', `${intent.toolName} moves money outside the allowance checkout`, `"${intent.toolName}" moves money outside your allowance's checkout.`);
    default:
      return pass('R12', `${intent.kind.toLowerCase()} path, no money out`);
  }
};
