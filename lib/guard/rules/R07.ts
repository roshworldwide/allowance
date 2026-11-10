// R07 VELOCITY_SPLIT (block): purchases per hour and per-merchant rolling spend stay within limits.
// This is the backstop against one item bought as several cheaper pieces to slip under a cap.
import { fail, pass, skip, usd, type Rule } from './context';

export const R07: Rule = ({ intent, mandate, item, merchant, amountCents, facts }) => {
  if (intent.kind !== 'PURCHASE' || !item) return skip('R07', 'not a registry purchase');
  const v = mandate.velocity;
  if (facts.purchasesLastHour + 1 > v.maxPerHour) {
    return fail('R07', `${facts.purchasesLastHour + 1} purchases in the last hour > ${v.maxPerHour}`, `Too many purchases in the last hour (limit ${v.maxPerHour}).`);
  }
  const atMerchant = facts.merchantWindowCents + amountCents;
  if (atMerchant > v.maxPerMerchantWindowCents) {
    const name = merchant?.name ?? item.merchantId;
    return fail(
      'R07',
      `${usd(atMerchant)} at ${item.merchantId} within ${v.windowMinutes} min > ${usd(v.maxPerMerchantWindowCents)}`,
      `That would be ${usd(atMerchant)} at ${name} within ${v.windowMinutes} minutes, over the ${usd(v.maxPerMerchantWindowCents)} limit. It looks like a split purchase.`,
    );
  }
  return pass('R07', `${facts.purchasesLastHour + 1}/${v.maxPerHour} this hour, ${usd(atMerchant)}/${usd(v.maxPerMerchantWindowCents)} at merchant`);
};
