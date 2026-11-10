// POST /api/allowance/link → owner mode: start the PayPal Vault approval for this session's allowance.
// (On the public demo the shared sandbox wallet is already linked; visitors can't re-link it.)
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { jsonError, requireLive, sessionMandate } from '@/lib/allowance/http';
import { startVaultLink } from '@/lib/allowance/mandates';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const live = requireLive(req);
  if (live instanceof Response) return live;
  if (!live.owner) return jsonError(403, 'Linking a PayPal wallet is owner-only on the public demo; the shared sandbox wallet is already linked.');
  const sm = sessionMandate(live);
  if (!sm) return jsonError(404, 'Create an allowance first.');
  try {
    return NextResponse.json(await startVaultLink(sm.mandate.id));
  } catch (e) {
    return jsonError(502, `PayPal: ${(e as Error).message.slice(0, 200)}`);
  }
}
