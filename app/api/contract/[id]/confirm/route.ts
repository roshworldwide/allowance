// POST /api/contract/:id/confirm → the person confirms the task contract. It can never change after this.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ctx, emit } from '@/lib/allowance/context';
import { jsonError, requireLive, sessionMandate } from '@/lib/allowance/http';
import { confirmContractRow, getContract } from '@/lib/store/repo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const live = requireLive(req);
  if (live instanceof Response) return live;
  const { id } = await params;
  const sm = sessionMandate(live);
  const { db, chain } = ctx();
  const c = getContract(db, id);
  if (!sm || !c || c.mandateId !== sm.mandate.id) return jsonError(404, 'No such task.');
  if (!c.confirmedAt) {
    confirmContractRow(db, id);
    chain.record('contract.confirmed', { contractId: id, mandateId: sm.mandate.id, lines: c.lines.map((l) => ({ id: l.id, productType: l.productType, maxQty: l.maxQty, maxUnitCents: l.maxUnitCents })) });
    emit({ mandateId: sm.mandate.id, type: 'mandate', data: { contractConfirmed: id } });
  }
  return NextResponse.json({ contract: getContract(db, id) });
}
