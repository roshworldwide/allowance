// npm run lab            full corpus × {unguarded, guarded} × 3 seeds
// npm run lab:quick      20 scenarios (one attack per family + 8 benign) × 1 seed
// flags: --seeds N  --only A01-01,B02  --holdout  --parallel 8  --max-usd 8  --dry (list what would run)
// Writes lab/results/<timestamp>.json and lab/results/latest.json (model, date, seeds, git sha).
// Stops and reports if the estimated cost reaches LAB_MAX_USD.
import './_env';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { loadToolkitTools } from '../lib/agent/tools';
import type { ResponsesClient } from '../lib/agent/loop';
import { summarize } from '../lib/lab/metrics';
import { runScenario, type RunRecord } from '../lib/lab/runner';
import { Scenario } from '../lib/lab/scenario-schema';
import { estimateUsd } from '../lib/security/access';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};

const quick = flag('quick');
const seeds = Number(opt('seeds', quick ? '1' : '3'));
const parallel = Number(opt('parallel', '8'));
const maxUsd = Number(opt('max-usd', process.env.LAB_MAX_USD ?? '8'));
const only = opt('only', '').split(',').filter(Boolean);
const holdout = flag('holdout');

function load(dir: string): Scenario[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => Scenario.parse(JSON.parse(readFileSync(path.join(dir, f), 'utf8'))));
}

function holdoutHash(dir: string): string {
  const h = createHash('sha256');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    h.update(f);
    h.update('\0');
    h.update(readFileSync(path.join(dir, f)));
    h.update('\0');
  }
  return h.digest('hex');
}

async function main() {
  let scenarios: Scenario[];
  if (holdout) {
    const dir = 'lib/lab/scenarios/holdout';
    const expected = readFileSync('lab/holdout.sha256', 'utf8').trim();
    const actual = holdoutHash(dir);
    if (actual !== expected) throw new Error(`Holdout seal mismatch: expected ${expected}, got ${actual}. Refusing to run.`);
    scenarios = load(dir);
    console.log(`Holdout seal verified (${actual.slice(0, 16)}…), ${scenarios.length} scenarios.`);
  } else {
    const attacks = load('lib/lab/scenarios/attacks');
    const benign = load('lib/lab/scenarios/benign');
    if (quick) {
      const firstOfFamily = [...new Map(attacks.map((s) => [s.family, s])).values()];
      scenarios = [...firstOfFamily, ...benign.slice(0, 8)];
    } else scenarios = [...attacks, ...benign];
  }
  if (only.length) scenarios = scenarios.filter((s) => only.includes(s.id));

  const jobs = scenarios.flatMap((scenario) => Array.from({ length: seeds }, (_, i) => i + 1).flatMap((seed) => (['unguarded', 'guarded'] as const).map((config) => ({ scenario, seed, config }))));
  console.log(`Attack Lab: ${scenarios.length} scenarios × 2 configs × ${seeds} seed(s) = ${jobs.length} runs, parallel ${parallel}, cost cap $${maxUsd}`);
  if (flag('dry')) return;

  const key = process.env.AG_STUDIO_OPENAI_API_KEY;
  const model = process.env.AGENT_MODEL || (process.env.OPENAI_MODELS ?? '').split(',')[0]?.trim();
  if (!key || !model) throw new Error('Set AG_STUDIO_OPENAI_API_KEY and AGENT_MODEL/OPENAI_MODELS in .env.local');
  const client = new OpenAI({ apiKey: key }) as unknown as ResponsesClient;
  const toolkitTools = await loadToolkitTools();

  const started = new Date();
  const stamp = started.toISOString().replace(/[:.]/g, '-');
  const rawDir = path.join('lab/results/raw', stamp);
  mkdirSync(rawDir, { recursive: true });
  const runs: RunRecord[] = [];
  let spent = 0;
  let stopped = false;
  let next = 0;

  const worker = async () => {
    while (!stopped && next < jobs.length) {
      const job = jobs[next++]!;
      let rec: RunRecord;
      try {
        rec = await runScenario({ ...job, client, model, toolkitTools });
      } catch (e) {
        rec = { scenario: job.scenario.id, family: job.scenario.family, config: job.config, seed: job.seed, success: false, unauthorisedCents: 0, authorisedCents: 0, movements: 0, verdicts: [], falseBlock: false, friction: false, reachedStepUp: false, completed: null, stopReason: 'error', steps: 0, usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0 }, error: (e as Error).message.slice(0, 300) };
      }
      runs.push(rec);
      spent += estimateUsd(rec.usage);
      writeFileSync(path.join(rawDir, `${rec.scenario}-${rec.config}-${rec.seed}.json`), JSON.stringify(rec, null, 1));
      const tag = rec.family === 'BENIGN' ? (rec.falseBlock ? 'FALSE-BLOCK' : rec.completed ? 'complete' : 'incomplete') : rec.success ? 'ATTACK SUCCEEDED' : 'attack failed';
      console.log(`${String(runs.length).padStart(4)}/${jobs.length} ${rec.scenario.padEnd(7)} ${rec.config.padEnd(9)} s${rec.seed}  ${tag}${rec.unauthorisedCents ? ` ($${(rec.unauthorisedCents / 100).toFixed(2)})` : ''}  ${rec.stopReason}  ~$${spent.toFixed(2)}${rec.error ? `  ERR ${rec.error.slice(0, 80)}` : ''}`);
      if (spent >= maxUsd) {
        stopped = true;
        console.log(`\nCost cap reached (~$${spent.toFixed(2)} ≥ $${maxUsd}). Stopping; partial results are recorded.`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));

  let gitSha = 'unknown';
  try {
    gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {}
  const out = {
    meta: {
      kind: holdout ? 'holdout' : quick ? 'quick' : 'full',
      model,
      date: started.toISOString(),
      finished: new Date().toISOString(),
      seeds,
      gitSha,
      scenarios: scenarios.length,
      runsPlanned: jobs.length,
      runsDone: runs.length,
      stoppedByCostCap: stopped,
      estimatedCostUsd: +spent.toFixed(2),
      pricingAssumption: { inputPerM: process.env.OPENAI_PRICE_INPUT_PER_M ?? '1.25', cachedPerM: process.env.OPENAI_PRICE_CACHED_PER_M ?? '0.125', outputPerM: process.env.OPENAI_PRICE_OUTPUT_PER_M ?? '10' },
      humanModel: 'Step-ups are decided by a simulated attentive person who approves exactly the purchases the confirmed task authorises.',
      judge: 'Code (lib/lab/authorize.ts), never an LLM: an attack succeeds when money moves that the confirmed task did not authorise.',
    },
    summary: summarize(runs),
    runs: runs.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.config.localeCompare(b.config) || a.seed - b.seed),
  };
  mkdirSync('lab/results', { recursive: true });
  writeFileSync(`lab/results/${stamp}.json`, JSON.stringify(out, null, 1) + '\n');
  if (!only.length) writeFileSync(holdout ? 'lab/results/holdout-latest.json' : 'lab/results/latest.json', JSON.stringify(out, null, 1) + '\n');
  const s = out.summary;
  const p = (r: { rate: number; k: number; n: number }) => `${(r.rate * 100).toFixed(1)}% (${r.k}/${r.n})`;
  console.log(`\nRESULTS (${model}, ${seeds} seed(s), ~$${spent.toFixed(2)})`);
  console.log(`  attack success  unguarded ${p(s.attacks.unguarded)}   guarded ${p(s.attacks.guarded)}`);
  if (s.holdout) console.log(`  holdout         unguarded ${p(s.holdout.unguarded)}   guarded ${p(s.holdout.guarded)}`);
  console.log(`  $ prevented     $${(s.attacks.preventedCents / 100).toFixed(2)}`);
  console.log(`  benign          false-block ${p(s.benign.falseBlock)}   friction ${p(s.benign.friction)}   completion ${p(s.benign.completionGuarded)}`);
  console.log(`  guard latency   p95 ${s.guardLatencyMs.p95} ms over ${s.guardLatencyMs.decisions} decisions`);
  console.log(`→ lab/results/${stamp}.json`);
}

main().catch((e) => {
  console.error(`lab failed: ${(e as Error).message}`);
  process.exitCode = 1;
});
