// The agent loop: a hand-written loop on the OpenAI Responses API with function calling.
// Every step is reported through onEvent (SSE for the Firewall Lane; the recorder for replays and the lab).
import type { ResponsesTool } from '@/lib/guard';

export type AgentEvent =
  | { type: 'model'; step: number; text?: string; usage: Usage }
  | { type: 'tool_call'; step: number; callId: string; name: string; args: unknown }
  | { type: 'tool_result'; step: number; callId: string; name: string; output: unknown }
  | { type: 'final'; step: number; text: string }
  | { type: 'stopped'; step: number; reason: StopReason; error?: string };

export type Usage = { inputTokens: number; cachedTokens: number; outputTokens: number };
export type StopReason = 'final' | 'max_steps' | 'token_budget' | 'aborted' | 'error';

/** The slice of the OpenAI client the loop needs (a fake implements it in tests). */
export type ResponsesClient = {
  responses: {
    create(body: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<{
      id: string;
      output: Array<{ type: string; call_id?: string; name?: string; arguments?: string }>;
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
    }>;
  };
};

export type RunOptions = {
  client: ResponsesClient;
  model: string;
  instructions: string;
  userMessage: string;
  tools: ResponsesTool[];
  /** Executes one tool call; the returned value is JSON-serialised back to the model. */
  invoke: (call: { name: string; args: unknown; callId: string }) => Promise<unknown>;
  maxSteps?: number;
  maxTokens?: number;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  cacheKey?: string;
  signal?: AbortSignal;
  onEvent?: (e: AgentEvent) => void;
};

export type RunResult = { finalText: string; steps: number; usage: Usage; stopReason: StopReason; error?: string };

const isReasoningModel = (m: string) => /^(gpt-5|o\d)/.test(m);

export async function runAgent(o: RunOptions): Promise<RunResult> {
  const maxSteps = o.maxSteps ?? 12;
  const maxTokens = o.maxTokens ?? 150_000;
  const usage: Usage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
  const emit = (e: AgentEvent) => o.onEvent?.(e);
  let previous: string | undefined;
  let input: unknown[] = [{ role: 'user', content: o.userMessage }];
  let finalText = '';

  const stop = (step: number, stopReason: StopReason, error?: string): RunResult => {
    emit({ type: 'stopped', step, reason: stopReason, ...(error ? { error } : {}) });
    return { finalText, steps: step, usage, stopReason, ...(error ? { error } : {}) };
  };

  for (let step = 1; step <= maxSteps; step++) {
    if (o.signal?.aborted) return stop(step - 1, 'aborted');
    let res;
    try {
      res = await o.client.responses.create(
        {
          model: o.model,
          instructions: o.instructions,
          input,
          tools: o.tools,
          ...(previous ? { previous_response_id: previous } : {}),
          ...(isReasoningModel(o.model) ? { reasoning: { effort: o.reasoningEffort ?? 'low' } } : {}),
          ...(o.cacheKey ? { prompt_cache_key: o.cacheKey } : {}),
          max_output_tokens: 4000,
          store: true,
        },
        { signal: o.signal },
      );
    } catch (e) {
      return stop(step - 1, o.signal?.aborted ? 'aborted' : 'error', (e as Error).message.slice(0, 300));
    }
    previous = res.id;
    const u = { inputTokens: res.usage?.input_tokens ?? 0, cachedTokens: res.usage?.input_tokens_details?.cached_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0 };
    usage.inputTokens += u.inputTokens;
    usage.cachedTokens += u.cachedTokens;
    usage.outputTokens += u.outputTokens;
    emit({ type: 'model', step, text: res.output_text || undefined, usage: u });

    const calls = res.output.filter((x) => x.type === 'function_call' && x.call_id && x.name);
    if (calls.length === 0) {
      finalText = res.output_text ?? '';
      emit({ type: 'final', step, text: finalText });
      return stop(step, 'final');
    }

    input = [];
    for (const c of calls) {
      let args: unknown = {};
      try {
        args = JSON.parse(c.arguments || '{}');
      } catch {
        args = { _unparseable: c.arguments };
      }
      emit({ type: 'tool_call', step, callId: c.call_id!, name: c.name!, args });
      let output: unknown;
      try {
        output = await o.invoke({ name: c.name!, args, callId: c.call_id! });
      } catch (e) {
        output = { error: (e as Error).message.slice(0, 300) };
      }
      emit({ type: 'tool_result', step, callId: c.call_id!, name: c.name!, output });
      input.push({ type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(output) });
    }
    if (usage.inputTokens + usage.outputTokens > maxTokens) return stop(step, 'token_budget');
  }
  return stop(maxSteps, 'max_steps');
}
