// Spike S0 — which OpenAI models can this key use, and do they do what ALLOWANCE needs?
// Lists chat-capable model ids, then makes one tiny Responses API call per candidate with a function
// tool and a strict JSON schema (the two features the agent loop and task parsing rely on).
// Prints model ids and pass/fail only. Cost: a few hundred tokens per candidate.
//   npm run spike:models               probe the default candidates
//   npm run spike:models -- gpt-x,gpt-y probe these ids
import './_env';
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
    const usage = (res.usage?.total_tokens ?? 0) + (parsed.usage?.total_tokens ?? 0);
    return { model, ok: toolOk && schemaOk, toolOk, schemaOk, ms: Date.now() - started, tokens: usage };
  } catch (e) {
    return { model, ok: false, toolOk: false, schemaOk: false, ms: Date.now() - started, tokens: 0, error: (e as Error).message.slice(0, 140) };
  }
}

async function main() {
  const list = await client.models.list();
  const ids = list.data.map((m) => m.id).sort();
  const chat = ids.filter((id) => /^(gpt-|o\d)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|embedding|instruct)/.test(id));
  console.log(`\nModels visible to this key: ${ids.length}. Chat-capable candidates:`);
  console.log('  ' + (chat.join('\n  ') || '(none)'));

  const arg = process.argv[2];
  const preferred = arg
    ? arg.split(',').map((s) => s.trim())
    : chat.filter((id) => /mini|nano|^gpt-5\.\d+$|terra|luna|sol/.test(id) && !/\d{4}-\d{2}-\d{2}/.test(id)).slice(0, 6);
  console.log(`\nProbing ${preferred.length} model(s): function calling + strict JSON schema…`);
  const results = [];
  for (const m of preferred) {
    const r = await probe(m);
    results.push(r);
    console.log(`  ${r.ok ? '✓' : '✗'} ${m.padEnd(28)} tool=${r.toolOk ? 'ok' : 'no'} schema=${r.schemaOk ? 'ok' : 'no'} ${r.ms}ms ${r.tokens} tok${'error' in r && r.error ? `  (${r.error})` : ''}`);
  }
  const good = results.filter((r) => r.ok).map((r) => r.model);
  console.log(`\nSuggested OPENAI_MODELS=${good.join(',') || '(none passed)'}`);
}

main().catch((e) => {
  console.error(`S0 failed: ${(e as Error).message}`);
  process.exitCode = 1;
});
