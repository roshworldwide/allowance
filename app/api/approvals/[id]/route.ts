// GET  /api/approvals/:id                → what the person is being asked to approve (for the phone page)
// POST /api/approvals/:id { action }     → 'check' (poll PayPal now) | 'decline' | 'approve_in_app' (fallback)
// The id is unguessable; GET shows no personal data. Approving happens in PayPal itself.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ctx } from '@/lib/allowance/context';
import { approveInApp, declineApproval, pollApprovals } from '@/lib/allowance/executor';
import { jsonError, readJson, requireLive } from '@/lib/allowance/http';
import { getApproval, getDecision, getMandate, ruleResults } from '@/lib/store/repo';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, world } = ctx();
  const a = getApproval(db, id);
  if (!a) return jsonError(404, 'No such approval.');
  const d = getDecision(db, a.decision_id)!;
  const item = d.sku ? world.registry.item(d.sku) : undefined;
  const merchant = item ? world.registry.merchant(item.merchantId) : undefined;
  const reasons = ruleResults(db, d.id)
    .filter((r) => r.outcome === 'STEP_UP')
    .map((r) => r.detail.split(' — ').pop());
  return NextResponse.json(
    {
      id: a.id,
      status: a.status,
      mode: a.mode,
      approveUrl: a.status === 'PENDING' ? a.approve_url : null,
      item: item?.name,
      qty: d.qty,
      amountCents: d.amount_cents,
      merchant: merchant?.name,
      reasons,
      allowance: getMandate(db, d.mandate_id)?.mandate.name,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ action?: unknown }>(req);
  const action = body?.action;
  if (action === 'check') {
    // Safe without a session: it only asks PayPal for the order's status and captures if approved.
    await pollApprovals();
    return NextResponse.json({ status: getApproval(ctx().db, id)?.status ?? 'UNKNOWN' });
  }
  const live = requireLive(req);
  if (live instanceof Response) return live;
  try {
    if (action === 'decline') {
      declineApproval(id);
      return NextResponse.json({ status: 'DECLINED' });
    }
    if (action === 'approve_in_app') return NextResponse.json(await approveInApp(id));
  } catch (e) {
    return jsonError(409, (e as Error).message.slice(0, 200));
  }
  return jsonError(400, 'Unknown action.');
}
