// POST /api/ai/responses - proxy for AG Studio's OpenAI adapter (lib/studio/openai-adapter.ts), which
// runs in the browser and POSTs to `${endpoint}/responses` with no key. This adds the server's key,
// allows only OPENAI_MODELS, caps output tokens, forwards only the fields the adapter sends (function
// tools only, so a caller cannot switch on paid hosted tools) and streams the SSE reply back.
// Modelled on the hackathon boilerplate's proxy (see NOTICE).
import type { NextRequest } from 'next/server';
import { MAX_BODY_BYTES, MAX_OUTPUT_TOKENS, OPENAI_RESPONSES_URL, allowedModels, openAiKey } from '@/lib/ai/config';
import { SESSION_COOKIE, aiBudget, clientIp, estimateUsd, liveAccess, markQuotaExhausted, rateLimit, recordSpend } from '@/lib/security/access';

export const dynamic = 'force-dynamic';

/** Reads the forwarded SSE stream in the background to meter spend from response.completed usage. */
async function meter(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = chunk.split('\n').find((l) => l.startsWith('data: '))?.slice(6);
        if (!data || !data.includes('response.completed')) continue;
        const r = (JSON.parse(data) as { response?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } } }).response;
        const u = r?.usage;
        if (u) recordSpend(estimateUsd({ inputTokens: u.input_tokens ?? 0, cachedTokens: u.input_tokens_details?.cached_tokens ?? 0, outputTokens: u.output_tokens ?? 0 }, r?.model));
      }
    }
  } catch {
    /* client went away; nothing to meter */
  }
}

const FORWARDED = ['input', 'instructions', 'tools', 'tool_choice', 'text', 'reasoning', 'parallel_tool_calls'] as const;

// The adapter reads `error.message` from JSON errors.
const error = (status: number, message: string) => Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  // Live AI is behind the demo passcode (owner mode locally), rate-limited per IP, and capped per day.
  if (!liveAccess(request.cookies.get(SESSION_COOKIE)?.value).ok) return error(401, 'Enter the demo passcode to chat with the Auditor.');
  const rl = rateLimit('ai', clientIp(request));
  if (!rl.ok) return error(429, `Slow down: try again in ${rl.retryAfterSec}s.`);
  const budget = aiBudget();
  if (!budget.ok) return error(503, `${budget.reason}. The dashboard still works; the assistant is paused.`);
  const apiKey = openAiKey();
  const models = allowedModels();
  if (!apiKey || models.length === 0) return error(503, 'The Control Room assistant is not configured (AG_STUDIO_OPENAI_API_KEY and OPENAI_MODELS).');

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return error(413, 'Conversation too long. Start a new chat.');
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return error(400, 'Request body must be a JSON object.');
  }

  const model = typeof body.model === 'string' && body.model ? body.model : models[0]!;
  if (!models.includes(model)) return error(400, `Model "${model}" is not enabled.`);

  const requested = typeof body.max_output_tokens === 'number' && body.max_output_tokens > 0 ? body.max_output_tokens : MAX_OUTPUT_TOKENS;
  const upstreamBody: Record<string, unknown> = { model, stream: true, max_output_tokens: Math.min(requested, MAX_OUTPUT_TOKENS) };
  for (const key of FORWARDED) if (body[key] !== undefined) upstreamBody[key] = body[key];
  if (Array.isArray(body.tools)) {
    upstreamBody.tools = body.tools.filter((t) => typeof t === 'object' && t !== null && (t as { type?: unknown }).type === 'function');
  }

  let upstream: Response;
  try {
    upstream = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(upstreamBody),
      // Stopping the chat in Studio aborts the browser request, which cancels this one too.
      signal: request.signal,
    });
  } catch {
    return error(request.signal.aborted ? 499 : 502, 'Could not reach the model provider.');
  }

  if (upstream.status === 429) {
    const text = await upstream.clone().text();
    if (text.includes('insufficient_quota')) markQuotaExhausted();
  }
  // Success is an SSE stream; errors are JSON. Either way pass it straight through (metering a copy).
  let out = upstream.body;
  if (upstream.ok && out) {
    const [client, metered] = out.tee();
    out = client;
    void meter(metered);
  }
  return new Response(out, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' },
  });
}
