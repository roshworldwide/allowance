// POST /api/allowance/policy { ...changes } → apply a policy change to YOUR allowance. Human-only: the
// Control Room's "Apply in ALLOWANCE" button calls this; no AI agent has a tool that can.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ctx, emit } from '@/lib/allowance/context';
import { jsonError, readJson, requireLive, sessionMandate } from '@/lib/allowance/http';
import { publicMandate } from '@/lib/allowance/mandates';
import { applyChange } from '@/lib/guard/simulate';
import { getMandate, updateMandatePolicy } from '@/lib/store/repo';
import { PolicyChangeInput, toCents } from '@/lib/allowance/policy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const live = requireLive(req);
  if (live instanceof Response) return live;
  const sm = sessionMandate(live);
  if (!sm) return jsonError(404, 'Create an allowance first.');
  const parsed = PolicyChangeInput.safeParse((await readJson<unknown>(req)) ?? {});
  if (!parsed.success || Object.keys(parsed.data).length === 0) return jsonError(400, 'No valid policy change.');
  const before = sm.mandate;
  const after = applyChange(before, toCents(parsed.data));
  const { db, chain } = ctx();
  updateMandatePolicy(db, before.id, after);
  chain.record('mandate.policy', { mandateId: before.id, by: 'person', change: parsed.data });
  emit({ mandateId: before.id, type: 'mandate', data: { policyChanged: parsed.data } });
  return NextResponse.json({ allowance: publicMandate(getMandate(db, before.id)!) });
}
