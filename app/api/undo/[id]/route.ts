// POST /api/undo/:decisionId → one-click undo: a real PayPal refund of that purchase's capture.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ctx } from '@/lib/allowance/context';
import { UndoError, undoPurchase } from '@/lib/allowance/executor';
import { jsonError, requireLive, sessionMandate } from '@/lib/allowance/http';
import { getDecision } from '@/lib/store/repo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const live = requireLive(req);
  if (live instanceof Response) return live;
  const { id } = await params;
  const sm = sessionMandate(live);
  const d = getDecision(ctx().db, id);
  if (!sm || !d || d.mandate_id !== sm.mandate.id) return jsonError(404, 'No such purchase.');
  try {
    return NextResponse.json(await undoPurchase(id));
  } catch (e) {
    return e instanceof UndoError ? jsonError(409, e.message) : jsonError(502, `PayPal: ${(e as Error).message.slice(0, 200)}`);
  }
}
