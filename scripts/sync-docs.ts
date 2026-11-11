// Fills every <!--lab:key-->…<!--/lab--> span in the docs from lab/results/latest.json (and
// holdout-latest.json), so README, Devpost text, judge guide and video script always match the file.
//   npm run docs:sync     update the docs
//   npm run docs:check    fail if any value is still pending (submission gate)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { LabSummary } from '../lib/lab/metrics';

const FILES = ['README.md', 'docs/DEVPOST.md', 'docs/VIDEO_SCRIPT.md', 'docs/JUDGE_GUIDE.md'];
const PENDING = 'pending (no Attack Lab run yet)';
const check = process.argv.includes('--check');

type Lab = { meta: { model: string; date: string; seeds: number; runsDone: number; scenarios: number; gitSha: string; estimatedCostUsd: number }; summary: LabSummary };
const read = (p: string) => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Lab) : null);
const lab = read('lab/results/latest.json');
const hold = read('lab/results/holdout-latest.json');

const pc = (r?: { rate: number; k: number; n: number } | null) => (r ? `${(r.rate * 100).toFixed(r.rate > 0 && r.rate < 0.1 ? 1 : 0)}%` : PENDING);
const frac = (r?: { k: number; n: number } | null) => (r ? `${r.k}/${r.n}` : PENDING);
const s = lab?.summary;

const values: Record<string, string> = {
  unguardedAsr: pc(s?.attacks.unguarded),
  unguardedFrac: frac(s?.attacks.unguarded),
  guardedAsr: pc(s?.attacks.guarded),
  guardedFrac: frac(s?.attacks.guarded),
  falseBlock: pc(s?.benign.falseBlock),
  falseBlockFrac: frac(s?.benign.falseBlock),
  friction: pc(s?.benign.friction),
  completion: pc(s?.benign.completionGuarded),
  prevented: s ? `$${(s.attacks.preventedCents / 100).toFixed(2)}` : PENDING,
  attackRuns: s ? String(s.attacks.unguarded.n + s.attacks.guarded.n) : PENDING,
  benignRuns: s ? String(s.benign.falseBlock.n) : PENDING,
  stoppedByBlock: s ? String(s.attacks.stoppedByBlock) : PENDING,
  reachedStepUp: s ? String(s.attacks.reachedStepUp) : PENDING,
  p95: s ? `${s.guardLatencyMs.p95} ms` : PENDING,
  model: lab?.meta.model ?? PENDING,
  date: lab ? new Date(lab.meta.date).toISOString().slice(0, 10) : PENDING,
  seeds: lab ? String(lab.meta.seeds) : PENDING,
  scenarios: lab ? String(lab.meta.scenarios) : PENDING,
  gitSha: lab?.meta.gitSha ?? PENDING,
  cost: lab ? `$${lab.meta.estimatedCostUsd.toFixed(2)}` : PENDING,
  holdoutGuarded: hold?.summary.holdout ? `${pc(hold.summary.holdout.guarded)} (${frac(hold.summary.holdout.guarded)})` : 'not run',
  holdoutUnguarded: hold?.summary.holdout ? `${pc(hold.summary.holdout.unguarded)} (${frac(hold.summary.holdout.unguarded)})` : 'not run',
};

let pending = 0;
let unknown = 0;
for (const f of FILES) {
  if (!existsSync(f)) continue;
  const before = readFileSync(f, 'utf8');
  const after = before.replace(/<!--lab:([A-Za-z0-9]+)-->([\s\S]*?)<!--\/lab-->/g, (_m, key: string) => {
    const v = values[key];
    if (v === undefined) {
      unknown++;
      console.error(`${f}: unknown key lab:${key}`);
      return `<!--lab:${key}-->??<!--/lab-->`;
    }
    if (v.includes(PENDING)) pending++;
    return `<!--lab:${key}-->${v}<!--/lab-->`;
  });
  if (!check && after !== before) {
    writeFileSync(f, after);
    console.log(`updated ${f}`);
  }
}
if (check) {
  if (pending || unknown) {
    console.error(`docs:check FAILED — ${pending} lab value(s) pending, ${unknown} unknown key(s). Run the Attack Lab, then npm run docs:sync.`);
    process.exitCode = 1;
  } else console.log('docs:check ok — every number comes from lab/results/latest.json');
}
