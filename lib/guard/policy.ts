// Mandate presets. The demo allowance: "$200 this month · max $60 per purchase · office supplies and
// electronics only · no subscriptions · ask me above $40 · expires 30 Nov".
import type { Mandate } from './types';

export type MandatePreset = Omit<Mandate, 'id' | 'status' | 'periodStart' | 'periodEnd' | 'vaultLinked' | 'killSwitch'> & {
  /** Period end as an ISO date (end of that day, UTC) or a duration in days from now. */
  ends: { onDate: string } | { inDays: number };
};

export const DEMO_PRESET: MandatePreset = {
  name: 'Office errands',
  currency: 'USD',
  budgetCents: 20_000,
  perPurchaseCapCents: 6_000,
  stepUpAboveCents: 4_000,
  stepUpOnNewMerchant: false,
  allowedCategories: ['office-supplies', 'electronics'],
  allowedMerchants: 'ANY_IN_CATEGORY',
  allowRecurring: false,
  velocity: { maxPerHour: 8, maxPerMerchantWindowCents: 10_000, windowMinutes: 60 },
  priceDriftPct: 10,
  undoWindowSec: 600,
  ends: { onDate: '2026-11-30' },
};

/** Builds a mandate from a preset. Starts PENDING_LINK unless a vault token is already linked. */
export function mandatePreset(input: { id: string; now: Date; preset?: MandatePreset; vaultLinked?: boolean }): Mandate {
  const { ends, ...rest } = input.preset ?? DEMO_PRESET;
  const start = new Date(input.now);
  start.setUTCSeconds(0, 0);
  const periodEnd =
    'onDate' in ends ? new Date(`${ends.onDate}T23:59:59.000Z`) : new Date(input.now.getTime() + ends.inDays * 86_400_000);
  // A preset date already in the past (e.g. replaying after 30 Nov) rolls forward 30 days so the demo works.
  const end = periodEnd.getTime() > input.now.getTime() ? periodEnd : new Date(input.now.getTime() + 30 * 86_400_000);
  return {
    ...rest,
    id: input.id,
    status: input.vaultLinked ? 'ACTIVE' : 'PENDING_LINK',
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    vaultLinked: Boolean(input.vaultLinked),
    killSwitch: false,
  };
}
