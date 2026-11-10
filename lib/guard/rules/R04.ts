// R04 MERCHANT_SCOPE (block): merchant and category allowed by the mandate.
import { fail, pass, skip, type Rule } from './context';

export const R04: Rule = ({ intent, mandate, item, merchant, label }) => {
  if (intent.kind !== 'PURCHASE') return skip('R04', 'not a purchase');
  if (!item) return skip('R04', 'no registry item (see R03)');
  const name = merchant?.name ?? item.merchantId;
  const merchantOk = mandate.allowedMerchants === 'ANY_IN_CATEGORY' || mandate.allowedMerchants.includes(item.merchantId);
  if (!merchantOk) return fail('R04', `merchant ${item.merchantId} not in allowed list`, `${name} isn't one of your allowed merchants.`);
  if (!mandate.allowedCategories.includes(item.category)) {
    return fail('R04', `category ${item.category} not in [${mandate.allowedCategories.join(', ')}]`, `${label(item.category)} isn't an allowed category.`);
  }
  return pass('R04', `${name} · ${item.category} allowed`);
};
