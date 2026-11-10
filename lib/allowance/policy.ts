// Policy changes as people (and the Auditor's proposals) express them: US dollars in, cents out.
import { z } from 'zod';
import type { PolicyChange } from '@/lib/guard/simulate';

const Usd = z.number().min(0).max(100_000);
export const PolicyChangeInput = z
  .object({
    perPurchaseCapUsd: Usd,
    stepUpAboveUsd: Usd,
    budgetUsd: Usd,
    maxPerMerchantWindowUsd: Usd,
    allowedCategories: z.array(z.enum(['office-supplies', 'electronics', 'home-lighting', 'services', 'gift-cards', 'subscriptions'])).min(1),
    allowRecurring: z.boolean(),
    priceDriftPct: z.number().int().min(0).max(1000),
  })
  .partial()
  .strict();
export type PolicyChangeInput = z.infer<typeof PolicyChangeInput>;

const cents = (v?: number) => (v === undefined ? undefined : Math.round(v * 100));

export function toCents(c: PolicyChangeInput): PolicyChange {
  return {
    perPurchaseCapCents: cents(c.perPurchaseCapUsd),
    stepUpAboveCents: cents(c.stepUpAboveUsd),
    budgetCents: cents(c.budgetUsd),
    maxPerMerchantWindowCents: cents(c.maxPerMerchantWindowUsd),
    allowedCategories: c.allowedCategories,
    allowRecurring: c.allowRecurring,
    priceDriftPct: c.priceDriftPct,
  };
}

