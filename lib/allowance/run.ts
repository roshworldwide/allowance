// A live guarded errand: the agent shops, every money tool call goes through the guard, ALLOW pays from
// the saved PayPal wallet, STEP_UP asks the person in PayPal, BLOCK stops. Decisions are persisted and
// chained before any money moves; every step is emitted for the Firewall Lane.
import 'server-only';
import { runErrand, type ErrandResult } from '@/lib/agent/errand';
import { loadToolkitTools } from '@/lib/agent/tools';
import type { AgentEvent, ResponsesClient } from '@/lib/agent/loop';
import type { Intent, Verdict } from '@/lib/guard';
import { estimateUsd, recordSpend } from '@/lib/security/access';
import { getContract, getMandate, insertDecision, setExplanation } from '@/lib/store/repo';
import { agentModel, explainVerdict, noteOpenAiError, openaiClient } from './ai';
import { ctx, emit } from './context';
import { ensureApprovalPoller, payPalExecutor } from './executor';

export type LaneEvent = AgentEvent | { type: 'verdict'; verdict: Verdict; intent: Intent; execution?: unknown } | { type: 'run'; runId: string; model: string };

export class RunError extends Error {
  override name = 'RunError';
}

export async function startLiveRun(input: { mandateId: string; contractId: string; onEvent: (e: LaneEvent) => void; signal?: AbortSignal; /** tests only */ client?: ResponsesClient; model?: string }): Promise<ErrandResult & { runId: string }> {
  const { db, world, ledger, chain } = ctx();
  const sm = getMandate(db, input.mandateId);
  const contract = getContract(db, input.contractId);
  if (!sm || !contract || contract.mandateId !== sm.mandate.id) throw new RunError('Unknown allowance or task.');
  if (!contract.confirmedAt) throw new RunError('Confirm the task first.');
  if (sm.mandate.status !== 'ACTIVE') throw new RunError(`This allowance is ${sm.mandate.status.toLowerCase().replace('_', ' ')}.`);

  ensureApprovalPoller();
  const model = input.model ?? agentModel();
  const runId = `run_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const startedAt = new Date().toISOString();
  db.prepare("INSERT INTO agent_runs (id, mandate_id, contract_id, mode, model, status, started_at) VALUES (?, ?, ?, 'guarded', ?, 'RUNNING', ?)").run(runId, sm.mandate.id, contract.id, model, startedAt);
  input.onEvent({ type: 'run', runId, model });

  const toolkitTools = await loadToolkitTools();
  let result: ErrandResult;
  try {
    result = await runErrand({
      config: 'guarded',
      client: input.client ?? (openaiClient() as unknown as ResponsesClient),
      model,
      world,
      task: contract.taskText,
      mandate: sm.mandate,
      contract,
      ledger,
      executor: payPalExecutor(sm.mandate.id),
      toolkitTools,
      signal: input.signal,
      cacheKey: `allowance-live-${sm.mandate.id}`,
      onDecision: (v, intent) => {
        insertDecision(db, v, { mandateId: sm.mandate.id, contractId: contract.id, runId, intent, tool: intent.toolName });
        chain.record('decision', { decisionId: v.decisionId, verdict: v.verdict, firstBlock: v.firstBlock ?? null, stepUp: v.stepUpReasons, amountCents: v.amountCents, tool: intent.toolName, sku: v.binding?.sku ?? null, rawArgsHash: intent.rawArgsHash }, v.at);
        emit({ mandateId: sm.mandate.id, type: 'decision', data: { decisionId: v.decisionId, verdict: v.verdict, firstBlock: v.firstBlock, amountCents: v.amountCents, sku: v.binding?.sku } });
        if (v.verdict !== 'ALLOW') {
          void explainVerdict(v).then((text) => {
            if (!text) return;
            setExplanation(db, v.decisionId, text);
            emit({ mandateId: sm.mandate.id, type: 'explanation', data: { decisionId: v.decisionId, text } });
          });
        }
      },
      onEvent: (e) => {
        input.onEvent(e);
        if (e.type !== 'verdict') emit({ mandateId: sm.mandate.id, type: 'agent', data: e });
      },
    });
  } catch (e) {
    noteOpenAiError(e);
    db.prepare("UPDATE agent_runs SET status = 'ERROR', ended_at = ? WHERE id = ?").run(new Date().toISOString(), runId);
    throw e;
  }
  if (result.error) noteOpenAiError(new Error(result.error));
  recordSpend(estimateUsd(result.usage));
  db.prepare('UPDATE agent_runs SET status = ?, ended_at = ? WHERE id = ?').run(result.stopReason.toUpperCase(), new Date().toISOString(), runId);
  return { ...result, runId };
}
