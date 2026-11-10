// POST /api/allowance/revoke → kill switch for this session's allowance.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { jsonError, requireLive, sessionMandate } from '@/lib/allowance/http';
import { revokeMandate } from '@/lib/allowance/mandates';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const live = requireLive(req);
  if (live instanceof Response) return live;
  const sm = sessionMandate(live);
  if (!sm) return jsonError(404, 'No allowance to revoke.');
  try {
    return NextResponse.json(await revokeMandate(sm.mandate.id, { owner: live.owner }));
  } catch (e) {
    return jsonError(502, (e as Error).message.slice(0, 200));
  }
}
