// Spike S0 — which OpenAI models can this key use, and do they do what ALLOWANCE needs?
// Lists chat-capable model ids, then makes one tiny Responses API call per candidate with a function
// tool and a strict JSON schema (the two features the agent loop and task parsing rely on).
// Prints model ids and pass/fail only. Cost: a few hundred tokens per candidate.
//   npm run spike:models               probe the default candidates
//   npm run spike:models -- gpt-x,gpt-y probe these ids
import './_env';
import { mkdirSync, writeFileSync } from 'node:fs';
import OpenAI from 'openai';

const key = process.env.AG_STUDIO_OPENAI_API_KEY;
if (!key) {
  console.error('AG_STUDIO_OPENAI_API_KEY is not set in .env.local');
  process.exit(1);
}
const client = new OpenAI({ apiKey: key });

async function probe(model: string) {
  const started = Date.now();
  try {
    const res = await client.responses.create({
      model,
      max_output_tokens: 600,
      input: 'Call the add_to_cart tool for SKU "VW-CBL-USBC-1M", quantity 2.',
      tools: [
        {
          type: 'function',
          name: 'add_to_cart',
          description: 'Add an item to the cart',
          strict: true,
          parameters: {
            type: 'object',
            properties: { sku: { type: 'string' }, qty: { type: 'integer' } },
            required: ['sku', 'qty'],
            additionalProperties: false,
          },
        },
      ],
    });
    const call = res.output.find((o) => o.type === 'function_call');
    const toolOk = call?.type === 'function_call' && call.name === 'add_to_cart' && /"qty"\s*:\s*2/.test(call.arguments);

    const parsed = await client.responses.create({
      model,
      max_output_tokens: 600,
      input: 'Task: "two USB-C cables under $15 each". Extract the line.',
      text: {
        format: {
          type: 'json_schema',
          name: 'line',
          strict: true,
          schema: {
            type: 'object',
            properties: { item: { type: 'string' }, maxQty: { type: 'integer' }, maxUnitCents: { type: 'integer' } },
            required: ['item', 'maxQty', 'maxUnitCents'],
            additionalProperties: false,
          },
        },
      },
    });
    const line = JSON.parse(parsed.output_text || '{}') as { maxQty?: number; maxUnitCents?: number };
    const schemaOk = line.maxQty === 2 && line.maxUnitCents === 1500;
    // AG Studio's OpenAI adapter always sends reasoning.effort: the Control Room needs a reasoning model.
    let reasoningOk = false;
    try {
      await client.responses.create({ model, input: 'Say ok.', max_output_tokens: 300, reasoning: { effort: 'low' } });
      reasoningOk = true;
    } catch {
      reasoningOk = false;
    }
    const usage = (res.usage?.total_tokens ?? 0) + (parsed.usage?.total_tokens ?? 0);
    return { model, ok: toolOk && schemaOk, toolOk, schemaOk, reasoningOk, ms: Date.now() - started, tokens: usage };
  } catch (e) {
    return { model, ok: false, toolOk: false, schemaOk: false, reasoningOk: false, ms: Date.now() - started, tokens: 0, error: (e as Error).message.slice(0, 140) };
  }
}

async function main() {
  const list = await client.models.list();
  // Newest first. Dated snapshots and pro / codex / live / non-chat variants are skipped.
  const chat = list.data
    .filter((m) => /^(gpt-|o\d)/.test(m.id) && !/(audio|realtime|transcribe|tts|image|search|embedding|instruct|codex|pro|live|oss)/.test(m.id) && !/-\d{4}-\d{2}-\d{2}$/.test(m.id))
    .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))
    .map((m) => m.id);
  console.log(`\nModels visible to this key: ${list.data.length}. Chat-capable candidates, newest first:`);
  console.log('  ' + (chat.join('\n  ') || '(none)'));

  const arg = process.argv[2];
  // Default probe set: the two newest "mini" models (the tier the hackathon boilerplate defaults to), the
  // four newest full-size models and the newest "nano". Probe order is the tie-break after ranking below.
  const newest = (re: RegExp, n: number) => chat.filter((id) => re.test(id)).slice(0, n);
  const preferred = arg ? arg.split(',').map((s) => s.trim()) : [...new Set([...newest(/mini/, 2), ...newest(/^(?!.*(mini|nano))/, 4), ...newest(/nano/, 1)])];
  console.log(`\nProbing ${preferred.length} model(s): function calling + strict JSON schema…`);
  const results = [];
  for (const m of preferred) {
    const r = await probe(m);
    results.push(r);
    console.log(`  ${r.ok ? '✓' : '✗'} ${m.padEnd(28)} tool=${r.toolOk ? 'ok' : 'no'} schema=${r.schemaOk ? 'ok' : 'no'} reasoning=${r.reasoningOk ? 'ok' : 'no'} ${r.ms}ms ${r.tokens} tok${'error' in r && r.error ? `  (${r.error})` : ''}`);
  }
  // Cheapest first: the agent and the lab default to the first model.
  // Reasoning-capable first (AG Studio's default is the first id), then cheapest first.
  const byModel = new Map(results.map((r) => [r.model, r]));
  const rank = (m: string) => (byModel.get(m)?.reasoningOk ? 0 : 10) + (/nano/.test(m) ? 2 : /mini/.test(m) ? 0 : 1);
  const good = results.filter((r) => r.ok).map((r) => r.model).sort((a, b) => rank(a) - rank(b));
  if (good.length && !byModel.get(good[0]!)?.reasoningOk) console.log('note: no reasoning model passed — the Control Room chat (AG Studio adapter) needs one.');
  console.log(`\nSuggested OPENAI_MODELS=${good.join(',') || '(none passed)'}`);
  mkdirSync('data', { recursive: true });
  writeFileSync('data/models.json', JSON.stringify({ probedAt: new Date().toISOString(), suggested: good, results }, null, 2) + '\n');
}

main().catch((e) => {
  console.error(`S0 failed: ${(e as Error).message}`);
  process.exitCode = 1;
});
