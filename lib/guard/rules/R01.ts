// R01 MANDATE_ACTIVE (block): active, in period, linked to PayPal, kill switch off.
import { fail, pass, type Rule } from './context';

export const R01: Rule = ({ mandate, now }) => {
  if (mandate.killSwitch) return fail('R01', 'kill switch is on', 'This allowance has been switched off.');
  if (mandate.status !== 'ACTIVE') {
    const why: Record<string, string> = {
      PENDING_LINK: "This allowance isn't linked to PayPal yet.",
      PAUSED: 'This allowance is paused.',
      REVOKED: 'This allowance was revoked.',
      EXPIRED: 'This allowance has expired.',
    };
    return fail('R01', `mandate status is ${mandate.status}`, why[mandate.status]);
  }
  if (!mandate.vaultLinked) return fail('R01', 'no saved PayPal wallet behind this mandate', "This allowance isn't linked to PayPal yet.");
  const t = now.getTime();
  if (t < Date.parse(mandate.periodStart)) return fail('R01', `period starts ${mandate.periodStart}`, "This allowance hasn't started yet.");
  if (t >= Date.parse(mandate.periodEnd)) return fail('R01', `period ended ${mandate.periodEnd}`, 'This allowance has expired.');
  return pass('R01', `active, linked, until ${mandate.periodEnd}`);
};
