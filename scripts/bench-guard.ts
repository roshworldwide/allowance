// Guard latency benchmark: p50/p95/p99 of guard.evaluate() on a file-backed SQLite ledger with
// realistic history, plus the in-memory ledger. Writes lab/results/guard-latency.json.
//   npm run bench:guard
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MemoryLedger, type Ledger } from '../lib/guard';
import { openDb } from '../lib/store/db';
import { SqliteLedger } from '../lib/store/sqlite-ledger';
import { contract, guard, mandate, purchase } from '../tests/fixtures/guard';

const N = 3000;
const HISTORY = 300;

function pct(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

function bench(name: string, ledger: Ledger) {
  const m = mandate({ budgetCents: 100_000_000, stepUpAboveCents: 100_000_000, velocity: { maxPerHour: 1000, maxPerMerchantWindowCents: 100_000_000, windowMinutes: 60 } });
  const c = contract({ lines: [{ id: 'P', category: 'office-supplies', productType: 'printer-paper', description: 'paper', maxQty: 100, maxUnitCents: 1000 }] });
  const g = guard(ledger);
  // History: committed purchases on this mandate, so every evaluation reads a realistic ledger.
  for (let i = 0; i < HISTORY; i++) {
    const v = g.evaluate({ mandate: m, contract: { ...c, id: `hist-${i}` }, intent: purchase('PT-PAPER-A4') });
    if (v.reserved) ledger.commit(v.decisionId);
  }
  const mix = [purchase('PT-PAPER-A4'), purchase('VW-HUB-USBC-7'), purchase('GH-GIFT-200'), purchase('SB-TRIAL-1')];
  const samples: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    const v = g.evaluate({ mandate: m, contract: { ...c, id: `run-${i}` }, intent: mix[i % mix.length]! });
    samples.push(performance.now() - t);
    if (v.reserved) ledger.release(v.decisionId);
  }
  samples.sort((a, b) => a - b);
  const r = { ledger: name, evaluations: N, historyEntries: HISTORY, p50Ms: +pct(samples, 50).toFixed(3), p95Ms: +pct(samples, 95).toFixed(3), p99Ms: +pct(samples, 99).toFixed(3), maxMs: +samples.at(-1)!.toFixed(3) };
  console.log(`${name.padEnd(14)} p50 ${r.p50Ms} ms · p95 ${r.p95Ms} ms · p99 ${r.p99Ms} ms · max ${r.maxMs} ms`);
  return r;
}

const dir = mkdtempSync(path.join(tmpdir(), 'allowance-bench-'));
try {
  const results = [bench('sqlite (file)', new SqliteLedger(openDb(path.join(dir, 'bench.db')))), bench('memory', new MemoryLedger())];
  let sha = 'unknown';
  try {
    sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {}
  const out = { measuredAt: new Date().toISOString(), gitSha: sha, node: process.versions.node, cpu: cpus()[0]?.model ?? 'unknown', target: 'p95 < 15 ms', results };
  mkdirSync('lab/results', { recursive: true });
  writeFileSync('lab/results/guard-latency.json', JSON.stringify(out, null, 2) + '\n');
  console.log('→ lab/results/guard-latency.json');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
