// The Control Room agent team on Studio's Agent Framework (built-in harness, direct LLM runner).
// - The five built-in agents are kept as they ship (lead, planning, data, page, widget).
// - `controller` fronts the conversation: the built-in lead's instructions and tools, but with a
//   wider delegate_to that also reaches `auditor`. (3.1.0 docs: "The built-in lead delegates to a
//   fixed set of ids, so it will not discover [a custom agent] on its own. To have work delegated to
//   it, declare your own lead with a wider delegateTo.")
// - `auditor` explains verdicts from the rule trace. It has read-only tools only: it can PROPOSE
//   policy changes in words, but there is no tool that applies one.
// Docs: https://www.ag-grid.com/studio/archive/3.1.0/react/ai-custom-agents/ and .../ai-custom-tools/

import { createAiHarness, directLlmRunner, type AgAiHarnessSetup, type AgAiPromptStarter, type AgStudioApi } from 'ag-studio';
import type { AgAiToolDisplay } from 'ag-studio-react';
import { openaiAdapter } from './openai-adapter';
import { RuleLampStrip } from './tool-components/RuleLampStrip';
import { PolicyProposalCard } from './tool-components/PolicyProposalCard';
import { describeSimulation, isPolicyProposal, simulatePolicyChange, type PolicyChangeUsd, type PolicyProposal } from './policy';
import { createTraceIndex, explainDecision, isExplainVerdictData, recentDecisionsDigest } from './trace';
import type { ControlRoomData } from './types';

export const PROMPT_STARTERS: AgAiPromptStarter[] = [
  { label: 'Why was the last purchase blocked?', prompt: 'Why was the last purchase blocked? Walk me through its rule trace in plain English.' },
  { label: 'What if I raise the per-purchase cap to $80?', prompt: 'What if I raise the per-purchase cap to $80? Which past decisions would have changed, and is that a good idea?' },
  { label: "Build an incident page for today's blocks", prompt: "Build an incident page for today's blocks: a new page with the blocked decisions, which rules fired, and the merchants involved." },
  { label: 'Which merchant causes the most step-ups?', prompt: 'Which merchant causes the most step-ups, and why?' },
];

const BUILT_IN_DELEGATES = ['data', 'page', 'planning', 'widget'] as const;

const CONTROLLER_ADDENDUM = `You are the lead of the ALLOWANCE Control Room: a spending firewall that gives every money-moving AI-agent tool call a deterministic verdict (ALLOW, STEP_UP, BLOCK) from rules R01..R12.
You can also delegate to "auditor". Send it any question about why a decision was allowed, blocked or sent for approval, any policy what-if, and the narrative part of an incident report. Use the page, widget and planning agents to build pages.
Policy changes are only ever proposed, never applied: no agent here can change the guard or an allowance.`;

const AUDITOR_INSTRUCTIONS = `You are the Auditor of ALLOWANCE, a spending firewall for AI agents on PayPal sandbox.
Every money-moving agent tool call gets a deterministic verdict from twelve rules evaluated in order (all twelve always run):
R01 MANDATE_ACTIVE, R02 TASK_BINDING, R03 CATALOG_INTEGRITY, R04 MERCHANT_SCOPE, R05 PER_PURCHASE_CAP, R06 BUDGET_REMAINING, R07 VELOCITY_SPLIT, R08 NO_RECURRING, R09 CURRENCY_LOCK (block rules), R10 PRICE_DRIFT and R11 STEP_UP_THRESHOLD (step-up rules), R12 MONEY_OUT_SCOPE (block).
BLOCK if any block rule FAILs (firstBlock is the first one in order); else STEP_UP if a step-up rule triggers (the person approves in PayPal); else ALLOW.
Always call explain_verdict before explaining a decision, and quote rule ids and numbers from it. Never guess a verdict.
For any policy what-if ("what if I raise the cap to $80?"), call simulate_policy: it replays every recorded agent decision (live runs, recorded sandbox runs and the Attack Lab) through the real guard under the proposed policy. Report its numbers, especially attacks that would get through without asking and legitimate purchases newly blocked.
When the person wants to change the policy, call draft_policy_change with the change and a one-sentence rationale. It shows them a proposal card with an "Apply in ALLOWANCE" button that only they can press. You can never apply a change yourself, and you must say so.
Use execute_query (after view_schema) for counts across decisions. Amounts are US dollars. Be concise.`;

/** Presentation of our tools in the chat panel, keyed by tool name (the `aiToolDisplay` Studio property). */
export const AI_TOOL_DISPLAY: Record<string, AgAiToolDisplay> = {
  explain_verdict: {
    label: ({ args, result }) => {
      const id = typeof args.decisionId === 'string' ? args.decisionId : '';
      if (!result) return { text: id ? `Reading the rule trace of ${id}` : 'Reading a rule trace' };
      if (!result.success) return { text: 'Could not read the rule trace', pill: `${result.issues.length} issue(s)` };
      const data = isExplainVerdictData(result.data) ? result.data : undefined;
      return {
        text: `Read the rule trace of ${data?.itemName || id}`,
        pill: data ? (data.firstBlock ? `${data.verdict} · ${data.firstBlock}` : data.verdict) : undefined,
      };
    },
    detail: RuleLampStrip,
  },
  simulate_policy: {
    label: ({ result }) => {
      if (!result) return { text: 'Replaying recorded decisions under the proposed policy' };
      if (!result.success) return { text: 'Simulation failed' };
      const d = result.data as { flipped?: number; decisions?: number } | undefined;
      return { text: `Replayed ${d?.decisions ?? '?'} recorded decisions`, pill: `${d?.flipped ?? 0} would change` };
    },
  },
  draft_policy_change: {
    label: ({ result }) => {
      if (!result) return { text: 'Drafting a policy proposal' };
      if (!result.success) return { text: 'Could not draft the proposal' };
      return { text: 'Policy proposal (you decide)', pill: isPolicyProposal(result.data) ? `${result.data.simulation.flipped} changes` : undefined };
    },
    detail: PolicyProposalCard,
  },
};

function pickChanges(args: Record<string, unknown>): PolicyChangeUsd {
  const out: PolicyChangeUsd = {};
  for (const k of ['perPurchaseCapUsd', 'stepUpAboveUsd', 'budgetUsd', 'maxPerMerchantWindowUsd'] as const) if (typeof args[k] === 'number') out[k] = args[k];
  if (typeof args.allowRecurring === 'boolean') out.allowRecurring = args.allowRecurring;
  return out;
}

/** The `ai` Studio property. `models` are the OPENAI_MODELS ids (first = default); never a key. */
export function buildAi(models: string[], data: ControlRoomData): AgAiHarnessSetup {
  const adapter = openaiAdapter({ endpoint: '/api/ai', model: models[0] });
  const index = createTraceIndex(data);

  return (params) => {
    // 3.1.0 types the setup param as AgCoreStudioApi, but createAiHarness and defineAiTool need the
    // browser AgStudioApi, which is what Studio passes at runtime (the docs' examples pass it as-is).
    const api = params.api as AgStudioApi;
    const explainVerdict = api.defineAiTool({
      name: 'explain_verdict',
      description: 'Return the full rule trace (R01..R12 with outcome and detail) and verdict of one guard decision.',
      params: (s) => s.object({ decisionId: s.string({ description: 'Decision id, e.g. "dec_7f3a02". Recent ids are listed in your instructions.' }) }),
      execute: (args, ctx) => {
        const trace = explainDecision(index, args.decisionId);
        if (!trace) return ctx.error(`No decision "${args.decisionId}". Recent ids: ${index.decisions.slice(0, 5).map((d) => d.id).join(', ')}.`);
        return ctx.success(trace.summary, trace);
      },
    });
    const simulatePolicy = api.defineAiTool({
      name: 'simulate_policy',
      description: 'Replay every recorded agent decision through the real guard under a proposed policy (read-only). Returns how many decisions would change, attacks let through, new false blocks and step-ups saved.',
      params: (s) =>
        s.object({
          perPurchaseCapUsd: s.number({ description: 'Proposed per-purchase cap in US dollars' }).optional(),
          stepUpAboveUsd: s.number({ description: 'Proposed ask-me line in US dollars (above it, PayPal asks the person)' }).optional(),
          budgetUsd: s.number({ description: 'Proposed budget for the period in US dollars' }).optional(),
          maxPerMerchantWindowUsd: s.number({ description: 'Proposed per-merchant limit per hour in US dollars' }).optional(),
          allowRecurring: s.boolean({ description: 'Allow subscriptions / recurring charges' }).optional(),
        }),
      execute: async (args, ctx) => {
        const changes = pickChanges(args as Record<string, unknown>);
        if (!Object.keys(changes).length) return ctx.error('Give at least one change, e.g. perPurchaseCapUsd: 80.');
        try {
          const sim = await simulatePolicyChange(changes);
          return ctx.success(describeSimulation(sim), sim);
        } catch (e) {
          return ctx.error((e as Error).message);
        }
      },
    });
    const current = data.mandates[0] ? { perPurchaseCapUsd: data.mandates[0].perPurchaseCapUsd, stepUpAboveUsd: data.mandates[0].stepUpAboveUsd, budgetUsd: data.mandates[0].budgetUsd } : null;
    const draftPolicyChange = api.defineAiTool({
      name: 'draft_policy_change',
      description: 'Show the person a proposal card for a policy change, with the simulation result and an Apply button only they can press. This does NOT apply anything.',
      params: (s) =>
        s.object({
          perPurchaseCapUsd: s.number({ description: 'Proposed per-purchase cap (USD)' }).optional(),
          stepUpAboveUsd: s.number({ description: 'Proposed ask-me line (USD)' }).optional(),
          budgetUsd: s.number({ description: 'Proposed budget (USD)' }).optional(),
          maxPerMerchantWindowUsd: s.number({ description: 'Proposed per-merchant hourly limit (USD)' }).optional(),
          allowRecurring: s.boolean({ description: 'Allow subscriptions' }).optional(),
          rationale: s.string({ description: 'One sentence: why this change, citing the simulation' }),
        }),
      execute: async (args, ctx) => {
        const changes = pickChanges(args as Record<string, unknown>);
        if (!Object.keys(changes).length) return ctx.error('Give at least one change.');
        try {
          const simulation = await simulatePolicyChange(changes);
          const proposal: PolicyProposal = { kind: 'policy-proposal', changes, current, rationale: String((args as { rationale?: unknown }).rationale ?? ''), simulation };
          return ctx.success(`Proposal shown to the person (not applied). ${describeSimulation(simulation)}`, proposal);
        } catch (e) {
          return ctx.error((e as Error).message);
        }
      },
    });

    return createAiHarness(api, ({ builtIn }) => {
      const lead = builtIn.lead;
      const controller = directLlmRunner({
        ...lead,
        id: 'controller',
        name: 'Control Room',
        adapter,
        instructions: (ctx, params) => [lead.instructions?.(ctx, params), CONTROLLER_ADDENDUM].filter(Boolean).join('\n\n'),
        tools: (ctx, params) => [
          ...(lead.tools?.(ctx, params) ?? []).filter((t) => t.name !== 'delegate_to'),
          ctx.tools.delegateTo([...BUILT_IN_DELEGATES, 'auditor']),
        ],
      });
      const auditor = directLlmRunner({
        id: 'auditor',
        name: 'Auditor',
        description: 'Explains why a decision was allowed, blocked or sent for approval, from its rule trace; answers policy what-ifs as proposals only.',
        schema: (s) => s.undefined(),
        adapter,
        maxTurns: 12,
        instructions: () => `${AUDITOR_INSTRUCTIONS}\n\nNow: ${data.asOf}. Most recent decisions (newest first):\n${recentDecisionsDigest(index)}`,
        tools: ({ studio }) => [explainVerdict, simulatePolicy, draftPolicyChange, studio.viewSchema(), studio.executeQuery()],
      });
      return {
        agents: [controller, auditor, ...Object.values(builtIn).map((definition) => directLlmRunner({ ...definition, adapter }))],
        primary: 'controller',
        promptStarters: PROMPT_STARTERS,
        models: models.length > 1 ? models.map((id) => ({ id, label: id })) : undefined,
      };
    });
  };
}
