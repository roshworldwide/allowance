// POST /api/agent/run { contractId } → SSE stream of the guarded errand (agent steps, verdicts, payments).
import type { NextRequest } from 'next/server';
import { aiAvailable } from '@/lib/allowance/ai';
import { jsonError, readJson, requireLive, sessionMandate, sse } from '@/lib/allowance/http';
import { startLiveRun } from '@/lib/allowance/run';
import { aiBudget } from '@/lib/security/access';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const live = requireLive(req, 'agent');
  if (live instanceof Response) return live;
  const sm = sessionMandate(live);
  if (!sm) return jsonError(404, 'Create an allowance first.');
  if (!aiAvailable()) return jsonError(503, aiBudget().reason ?? 'The agent is unavailable right now — watch a replay instead.', { replay: true });
  const body = await readJson<{ contractId?: unknown }>(req);
  if (typeof body?.contractId !== 'string') return jsonError(400, 'contractId is required.');
  const contractId = body.contractId;
  return sse(req, async (send) => {
    const r = await startLiveRun({ mandateId: sm.mandate.id, contractId, signal: req.signal, onEvent: (e) => send(e.type, e) });
    send('done', { runId: r.runId, stopReason: r.stopReason, finalText: r.finalText, usage: r.usage });
  });
}
