// One errand run in either configuration. Used by the Attack Lab (fake PayPal / shadow executor) and
// by the live app (real PayPal executor supplied by lib/allowance).
import { createGuard, wrap, type ChainStore, type Intent, type Ledger, type Mandate, type TaskContract, type Verdict, type AnyTool } from '@/lib/guard';
import { appendEvent } from '@/lib/guard/chain';
import type { World } from '@/lib/catalog';
import type { Movement } from '@/lib/lab/authorize';
import { runAgent, type AgentEvent, type ResponsesClient, type RunResult } from './loop';
import { SYSTEM_PROMPT, taskMessage } from './prompts';
import { ALLOWANCE_CHECKOUT_TOOL, READ_TOOLS, UNGUARDED_MONEY_TOOLS } from './tools';

export type Config = 'guarded' | 'unguarded';

/** Moves the money for a guarded verdict (fake PayPal in the lab, real sandbox in the app). */
export type MoneyExecutor = {
  purchase(v: Verdict): Promise<{ status: 'COMPLETED' | 'FAILED'; orderId?: string; captureId?: string }>;
  /** STEP_UP: ask the person. Resolves when they approve (and it's captured) or decline. */
  approval(v: Verdict): Promise<{ status: 'COMPLETED' | 'DECLINED' | 'PENDING' | 'FAILED'; orderId?: string; captureId?: string; approveUrl?: string }>;
};

export type ErrandOptions = {
  config: Config;
  client: ResponsesClient;
  model: string;
  world: World;
  task: string;
  mandate: Mandate;
  contract: TaskContract;
  ledger: Ledger;
  chain?: ChainStore;
  executor?: MoneyExecutor;
  toolkitTools?: AnyTool[];
  maxSteps?: number;
  signal?: AbortSignal;
  cacheKey?: string;
  onEvent?: (e: AgentEvent | { type: 'verdict'; verdict: Verdict; intent: Intent; execution?: unknown }) => void;
  now?: () => Date;
};

export type ErrandResult = RunResult & { movements: Movement[]; verdicts: { intent: Intent; verdict: Verdict; execution?: unknown }[] };

const untrusted = (source: string, content: unknown) => ({ untrusted: true, source, content });

export async function runErrand(o: ErrandOptions): Promise<ErrandResult> {
  const movements: Movement[] = [];
  const verdicts: ErrandResult['verdicts'] = [];
  let step = 0;
  const read = async (name: string, args: Record<string, unknown>) => {
    const sku = String(args.sku ?? '');
    if (name === 'search_catalog') return untrusted(name, o.world.search(String(args.query ?? '')));
    if (name === 'view_product') return untrusted(name, o.world.page(sku) ?? `No listing ${sku}.`);
    if (name === 'view_reviews') return untrusted(name, o.world.reviews(sku));
    return { error: `unknown tool ${name}` };
  };

  let tools;
  let invoke: (c: { name: string; args: unknown; callId: string }) => Promise<unknown>;

  if (o.config === 'unguarded') {
    tools = [...READ_TOOLS, ...UNGUARDED_MONEY_TOOLS];
    invoke = async ({ name, args }) => {
      const a = (args ?? {}) as Record<string, unknown>;
      step++;
      if (name === 'pay_with_saved_paypal') {
        movements.push({ step, tool: name, kind: 'PURCHASE', sku: String(a.sku ?? ''), qty: Number(a.qty ?? 1), amountCents: Number(a.amountCents ?? 0), currency: String(a.currency ?? 'USD'), ...(a.payee ? { payee: String(a.payee) } : {}) });
        return { status: 'COMPLETED', orderId: `ORD-${step}${Date.now() % 100000}` };
      }
      if (name === 'subscribe') {
        movements.push({ step, tool: name, kind: 'SUBSCRIBE', sku: String(a.plan ?? ''), qty: 1, amountCents: Number(a.trialCents ?? 0), currency: 'USD', recurring: true, recurringCents: Number(a.recurringCents ?? 0) });
        return { status: 'ACTIVE', subscriptionId: `SUB-${step}` };
      }
      return read(name, a);
    };
  } else {
    const guard = createGuard({ catalog: o.world.registry, ledger: o.ledger, now: o.now });
    const exec = o.executor;
    if (!exec) throw new Error('guarded run needs a MoneyExecutor');
    const belt = wrap([...READ_TOOLS, ALLOWANCE_CHECKOUT_TOOL, ...(o.toolkitTools ?? [])], {
      evaluate: (intent) => guard.evaluate({ mandate: o.mandate, contract: o.contract, intent }),
      passThrough: async (c) => read(c.name, (c.args ?? {}) as Record<string, unknown>),
      execute: async (v) => {
        const r = v.verdict === 'ALLOW' ? await exec.purchase(v) : await exec.approval(v);
        if (r.status === 'COMPLETED' && v.binding) {
          movements.push({ step, tool: 'allowance_checkout', kind: 'PURCHASE', sku: v.binding.sku, qty: v.binding.qty, amountCents: v.amountCents, currency: 'USD' });
        }
        return r;
      },
    });
    tools = belt.definitions;
    invoke = async ({ name, args, callId }) => {
      step++;
      const out = await belt.invoke({ name, args, callId });
      if (out.kind === 'passthrough') return out.output;
      verdicts.push({ intent: out.intent, verdict: out.verdict, execution: out.execution });
      if (o.chain) appendEvent(o.chain, { type: 'decision', at: out.verdict.at, payload: { decisionId: out.verdict.decisionId, verdict: out.verdict.verdict, firstBlock: out.verdict.firstBlock ?? null, amountCents: out.verdict.amountCents, tool: out.tool } });
      o.onEvent?.({ type: 'verdict', verdict: out.verdict, intent: out.intent, execution: out.execution });
      return toolReply(out.verdict, out.execution);
    };
  }

  const result = await runAgent({
    client: o.client,
    model: o.model,
    instructions: SYSTEM_PROMPT,
    userMessage: taskMessage(o.task, o.contract),
    tools,
    invoke,
    maxSteps: o.maxSteps,
    signal: o.signal,
    cacheKey: o.cacheKey,
    onEvent: o.onEvent,
  });
  return { ...result, movements, verdicts };
}

/** What the agent is told about a guarded call. */
export function toolReply(v: Verdict, execution?: unknown) {
  if (v.verdict === 'BLOCK') {
    const r = v.rules.find((x) => x.id === v.firstBlock);
    return { verdict: 'BLOCK', reason: r?.userMessage ?? r?.detail, message: "Blocked by the user's allowance. Do not retry or work around it; tell the user." };
  }
  const e = (execution ?? {}) as { status?: string; orderId?: string; captureId?: string };
  if (v.verdict === 'STEP_UP') {
    const why = v.rules.filter((r) => r.outcome === 'STEP_UP').map((r) => r.userMessage).join(' ');
    return { verdict: 'STEP_UP', status: e.status === 'COMPLETED' ? 'APPROVED_AND_PAID' : e.status === 'DECLINED' ? 'DECLINED_BY_USER' : 'WAITING_FOR_USER_APPROVAL', reason: why, orderId: e.orderId };
  }
  return { verdict: 'ALLOW', status: e.status ?? 'COMPLETED', orderId: e.orderId, captureId: e.captureId, summary: v.summary };
}
