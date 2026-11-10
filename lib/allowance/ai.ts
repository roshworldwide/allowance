// OpenAI use in the live app: task parsing (structured output → contract the person confirms) and
// one-sentence explanations of verdicts. Neither ever decides anything: the guard does.
import 'server-only';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { contractDraftSchema, type ContractDraft, type Mandate, type Verdict, type Vocabulary } from '@/lib/guard';
import { EXPLAIN_PROMPT } from '@/lib/agent/prompts';
import { aiBudget, estimateUsd, markQuotaExhausted, recordSpend } from '@/lib/security/access';

let client: OpenAI | undefined;
export function openaiClient(): OpenAI {
  const apiKey = process.env.AG_STUDIO_OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('AG_STUDIO_OPENAI_API_KEY is not set');
  client ??= new OpenAI({ apiKey });
  return client;
}

export function agentModel(): string {
  const first = (process.env.OPENAI_MODELS ?? '').split(',').map((s) => s.trim()).find(Boolean);
  const m = process.env.AGENT_MODEL?.trim() || first;
  if (!m) throw new Error('Set OPENAI_MODELS (and optionally AGENT_MODEL)');
  return m;
}

export const aiAvailable = () => Boolean(process.env.AG_STUDIO_OPENAI_API_KEY?.trim()) && aiBudget().ok;

const reasoning = (model: string) => (/^(gpt-5|o\d)/.test(model) ? { reasoning: { effort: 'low' as const } } : {});

export function noteOpenAiError(e: unknown) {
  const msg = String((e as Error)?.message ?? e);
  if (msg.includes('insufficient_quota')) markQuotaExhausted();
}

function parsePrompt(vocab: Vocabulary, mandate: Mandate) {
  const types = Object.entries(vocab.productTypes)
    .map(([k, v]) => `${k} (${v.label}; ${v.category})`)
    .join('\n');
  return `Turn the person's shopping task into contract lines. Each line is one kind of product.
- productType: pick the closest type from this list only:
${types}
- maxQty: the quantity they asked for (default 1).
- maxUnitCents: their per-item price limit in cents ("under $15 each" → 1500; "a lamp under $50" → 5000). If they gave no limit, use ${mandate.perPurchaseCapCents}.
- description: 2–5 words, as they would say it.
- unmapped: anything in the task you could not map to a listed type.
Never add products the person did not ask for.`;
}

export async function parseTaskWithAi(task: string, vocab: Vocabulary, mandate: Mandate): Promise<ContractDraft> {
  const model = agentModel();
  try {
    const res = await openaiClient().responses.parse({
      model,
      instructions: parsePrompt(vocab, mandate),
      input: task,
      text: { format: zodTextFormat(contractDraftSchema(vocab), 'task_contract') },
      max_output_tokens: 2000,
      store: false,
      ...reasoning(model),
    });
    const u = res.usage;
    if (u) recordSpend(estimateUsd({ inputTokens: u.input_tokens, cachedTokens: u.input_tokens_details?.cached_tokens ?? 0, outputTokens: u.output_tokens }));
    if (!res.output_parsed) throw new Error('The task parser returned nothing');
    return res.output_parsed;
  } catch (e) {
    noteOpenAiError(e);
    throw e;
  }
}

/**
 * Keyword fallback (no AI): used when AI is unavailable (replay mode, budget reached). Labelled as such
 * in the UI. Matches product-type labels, a preceding number word, and a following "$N".
 */
export function parseTaskWithoutAi(task: string, vocab: Vocabulary, mandate: Mandate): ContractDraft {
  const text = task.toLowerCase();
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, pair: 2 };
  const lines: ContractDraft['lines'] = [];
  for (const [type, v] of Object.entries(vocab.productTypes)) {
    const label = v.label.toLowerCase();
    const singular = label.replace(/s$/, '');
    const idx = text.search(new RegExp(`\\b${singular.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`));
    if (idx < 0) continue;
    const before = text.slice(Math.max(0, idx - 12), idx).trim().split(/\s+/).pop() ?? '';
    const qty = Number(before) || words[before] || 1;
    const after = text.slice(idx, idx + 60);
    const price = /\$\s?(\d+(?:\.\d{1,2})?)/.exec(after);
    lines.push({ productType: type, description: v.label, maxQty: Math.min(qty, 20), maxUnitCents: price ? Math.round(Number(price[1]) * 100) : mandate.perPurchaseCapCents });
  }
  // Prefer the most specific labels (e.g. "USB-C cable" over "cable"-like overlaps).
  return { lines: lines.slice(0, 6), unmapped: lines.length ? [] : [task.slice(0, 140)] };
}

/** One plain sentence from the rule trace, shown with an "AI-written from the rule trace" label. */
export async function explainVerdict(v: Verdict): Promise<string | undefined> {
  if (!aiAvailable() || v.verdict === 'ALLOW') return undefined;
  const model = agentModel();
  const fired = v.rules.filter((r) => r.outcome === 'FAIL' || r.outcome === 'STEP_UP').map((r) => ({ rule: r.name, why: r.userMessage ?? r.detail }));
  try {
    const res = await openaiClient().responses.create({
      model,
      instructions: EXPLAIN_PROMPT,
      input: JSON.stringify({ verdict: v.verdict, item: v.binding?.name, quantity: v.binding?.qty, amount: `$${(v.amountCents / 100).toFixed(2)}`, fired }),
      max_output_tokens: 300,
      store: false,
      ...reasoning(model),
    });
    const u = res.usage;
    if (u) recordSpend(estimateUsd({ inputTokens: u.input_tokens, cachedTokens: u.input_tokens_details?.cached_tokens ?? 0, outputTokens: u.output_tokens }));
    return res.output_text?.trim().slice(0, 300) || undefined;
  } catch (e) {
    noteOpenAiError(e);
    return undefined;
  }
}
