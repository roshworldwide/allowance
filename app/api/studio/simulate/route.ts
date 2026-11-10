// POST /api/studio/simulate { perPurchaseCapUsd?, stepUpAboveUsd?, budgetUsd?, maxPerMerchantWindowUsd?,
// allowedCategories?, allowRecurring?, priceDriftPct? } → what recorded agent intents would do under it.
// Pure guard code, read-only: nothing is changed and no money moves.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { loadHistory } from '@/lib/allowance/history';
import { jsonError, readJson } from '@/lib/allowance/http';
import { simulatePolicy } from '@/lib/guard/simulate';
import { PolicyChangeInput, toCents } from '@/lib/allowance/policy';
import { clientIp, rateLimit } from '@/lib/security/access';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rl = rateLimit('allowance', clientIp(req));
  if (!rl.ok) return jsonError(429, `Slow down: try again in ${rl.retryAfterSec}s.`);
  const parsed = PolicyChangeInput.safeParse((await readJson<unknown>(req)) ?? {});
  if (!parsed.success || Object.keys(parsed.data).length === 0) return jsonError(400, 'Give at least one policy change, e.g. { "perPurchaseCapUsd": 80 }.');
  const result = simulatePolicy(loadHistory(), toCents(parsed.data));
  return NextResponse.json({ ...result, input: parsed.data }, { headers: { 'Cache-Control': 'no-store' } });
}
